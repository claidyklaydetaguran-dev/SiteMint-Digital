// Changing the account password from inside the dashboard.
//
// Why this exists: Settings has always had a "Change password" form posting to
// `POST /api/receptionist/account/password/change`, but no such route was ever
// built, so the form answered 404 and the page said "not available yet". A
// business that suspected its password was known to someone else had no way to
// change it short of a full reset by email.
//
// The security model, and why each part is here:
//
//   - The CURRENT password is required. A session alone is not enough: a
//     borrowed session could otherwise lock the owner out permanently.
//   - The new password follows the SAME rule, and is hashed by the SAME
//     function, as a password reset (accountTokens.ts) — one policy, one bcrypt
//     cost, so the two paths cannot disagree about what a valid password is.
//   - Every OTHER session for the account is signed out: whoever else was in
//     was in on the old password. The session making the change is kept, so
//     the owner is not thrown out of the page they are standing on. If the
//     current session cannot be identified, every session is revoked — fail
//     closed.
//   - Revocation failing does not undo or hide the change. The password is
//     already changed by then; the result says whether other sessions were
//     signed out, because "changed" and "everyone else is out" are separate
//     facts.
//
// The protected auth files are imported from, never edited. No schema change:
// `intake_firms.password_hash` is updated in place and sessions are deleted
// from `receptionist_sessions`, exactly as the reset path already does.

import { isAcceptableNewPassword } from "./accountTokens.js";

export type PasswordChangeFailure = "wrong_password" | "weak_password";

export type PasswordChangeResult =
  | { ok: true; otherSessionsSignedOut: boolean }
  | { ok: false; reason: PasswordChangeFailure };

export interface PasswordChangeDeps {
  loadPasswordHash: (firmId: number) => Promise<string | undefined>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
  updatePasswordHash: (firmId: number, passwordHash: string) => Promise<void>;
  /** Deletes the firm's sessions except `keepToken`; every session when `keepToken` is undefined. */
  revokeOtherSessions: (firmId: number, keepToken: string | undefined) => Promise<void>;
  recordAudit: (firmId: number, action: string) => Promise<void>;
}

export async function changeAccountPassword(
  firmId: number,
  input: { currentPassword: unknown; newPassword: unknown },
  currentSessionToken: string | undefined,
  deps: PasswordChangeDeps,
): Promise<PasswordChangeResult> {
  if (typeof input.currentPassword !== "string" || input.currentPassword === "" || input.currentPassword.length > 200) {
    return { ok: false, reason: "wrong_password" };
  }
  if (!isAcceptableNewPassword(input.newPassword)) return { ok: false, reason: "weak_password" };

  const passwordHash = await deps.loadPasswordHash(firmId);
  if (passwordHash === undefined || passwordHash === "") return { ok: false, reason: "wrong_password" };
  if (!(await deps.verifyPassword(input.currentPassword, passwordHash))) {
    return { ok: false, reason: "wrong_password" };
  }

  await deps.updatePasswordHash(firmId, await deps.hashPassword(input.newPassword));

  let otherSessionsSignedOut = true;
  try {
    const keep = typeof currentSessionToken === "string" && currentSessionToken !== "" ? currentSessionToken : undefined;
    await deps.revokeOtherSessions(firmId, keep);
  } catch {
    otherSessionsSignedOut = false;
  }
  try {
    await deps.recordAudit(firmId, "password.changed");
  } catch {
    // best-effort; the change already happened
  }
  return { ok: true, otherSessionsSignedOut };
}

export async function productionPasswordChangeDeps(): Promise<PasswordChangeDeps> {
  const { db } = await import("@workspace/db");
  const { intakeFirms, receptionistSessions } = await import("@workspace/db/schema");
  const { and, eq, ne } = await import("drizzle-orm");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  const { hashAccountPassword, verifyAccountPassword } = await import("./accountTokens.js");

  return {
    loadPasswordHash: async (firmId) => {
      const [row] = await db
        .select({ passwordHash: intakeFirms.passwordHash })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      return row?.passwordHash ?? undefined;
    },
    verifyPassword: verifyAccountPassword,
    hashPassword: hashAccountPassword,
    updatePasswordHash: async (firmId, passwordHash) => {
      await db.update(intakeFirms).set({ passwordHash }).where(eq(intakeFirms.id, firmId));
    },
    revokeOtherSessions: async (firmId, keepToken) => {
      await db
        .delete(receptionistSessions)
        .where(
          keepToken === undefined
            ? eq(receptionistSessions.firmId, firmId)
            : and(eq(receptionistSessions.firmId, firmId), ne(receptionistSessions.token, keepToken)),
        );
    },
    recordAudit: async (firmId, action) => {
      await recordAuditEvent({ firmId, actor: "owner", action });
    },
  };
}
