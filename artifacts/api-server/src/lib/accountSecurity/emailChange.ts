// Changing the business's own email address.
//
// Why this exists: until now a business could verify the address it signed up
// with, but could never CHANGE it. That is not a cosmetic gap. Every outbound
// message — the post-call summary, the daily digest, a critical alert — is sent
// only to a VERIFIED address, so a business that signed up with a typo, a
// placeholder, or a shared inbox it no longer reads had no route back. Staging
// hit exactly this: its account address ends in `.invalid`, a reserved TLD that
// can never receive mail, so the verification email had nowhere to go and the
// whole call → message → email chain stopped there with no way forward from
// inside the product.
//
// The security model, and why each part is here:
//
//   - The CURRENT PASSWORD is required. A session alone is not enough: the
//     address is the login identity, so a borrowed session could otherwise be
//     turned into a permanent account takeover.
//   - The new address is stored UNVERIFIED. Changing it clears the verification
//     stamp, so nothing is sent to it until it is proven — the system already
//     refuses to email an unverified address, and this reuses that rule rather
//     than adding a second one.
//   - The OLD address is told. That notice is the only warning a business gets
//     if someone else made the change, so it is sent before the new address is
//     verified and its failure never blocks or reverses the change (the change
//     already happened; a silent failure here must not leave the caller
//     believing it did not).
//   - Sessions are NOT revoked. The password did not change, so existing
//     sessions are exactly as trustworthy as they were a moment earlier;
//     logging the owner out mid-flow would only obscure what happened.
//
// No schema change: `intake_firms.email` is updated in place and
// `voice_account_states.email_verified_at` is cleared. There is no pending-email
// column, and deliberately so — a "pending" address is a second source of truth
// for who the business is, and the unverified state this already models says
// the same thing with one.

import type { TokenPurpose } from "./accountTokens.js";

export type EmailChangeFailure =
  | "invalid_email"
  | "same_email"
  | "duplicate_email"
  | "wrong_password"
  | "delivery_unavailable";

export type EmailChangeResult =
  | { ok: true; email: string; verificationSent: boolean }
  | { ok: false; reason: EmailChangeFailure };

export interface EmailChangeDeps {
  loadFirm: (firmId: number) => Promise<{ email: string; passwordHash: string } | undefined>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  findFirmIdByEmail: (email: string) => Promise<number | undefined>;
  updateEmail: (firmId: number, email: string) => Promise<void>;
  clearVerification: (firmId: number) => Promise<void>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  issueToken: (firmId: number, purpose: TokenPurpose) => Promise<{ rawToken: string }>;
  recordAudit: (firmId: number, action: string, subject: string) => Promise<void>;
}

/**
 * Same shape as the rest of the codebase's address check, plus the two
 * refusals that matter here.
 *
 * `.invalid` is rejected by name. It is reserved by RFC 2606 precisely so that
 * it can never resolve, so an address there is guaranteed undeliverable — and
 * accepting one would put the account straight back into the state this whole
 * module exists to escape, while looking like it had worked.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAccountEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 200) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain === "invalid" || domain.endsWith(".invalid")) return null;
  if (domain === "localhost" || domain.endsWith(".localhost")) return null;
  if (domain === "example" || domain.endsWith(".example") || domain === "test" || domain.endsWith(".test")) return null;
  return email;
}

export async function changeAccountEmail(
  firmId: number,
  input: { newEmail: unknown; currentPassword: unknown },
  deps: EmailChangeDeps,
): Promise<EmailChangeResult> {
  const email = normalizeAccountEmail(input.newEmail);
  if (email === null) return { ok: false, reason: "invalid_email" };
  if (typeof input.currentPassword !== "string" || input.currentPassword === "") {
    return { ok: false, reason: "wrong_password" };
  }

  const firm = await deps.loadFirm(firmId);
  if (!firm) return { ok: false, reason: "wrong_password" };

  // The password is checked BEFORE anything else observable, so this endpoint
  // cannot be used as an oracle for which addresses are registered.
  const passwordOk = await deps.verifyPassword(input.currentPassword, firm.passwordHash);
  if (!passwordOk) return { ok: false, reason: "wrong_password" };

  if (firm.email.toLowerCase() === email) return { ok: false, reason: "same_email" };

  const owner = await deps.findFirmIdByEmail(email);
  if (owner !== undefined && owner !== firmId) return { ok: false, reason: "duplicate_email" };

  const previousEmail = firm.email;
  await deps.updateEmail(firmId, email);
  // Ordering matters: the address changes first, then the verification stamp
  // goes. If it were the other way round and the update failed, the account
  // would be left unverified at an address that was never in doubt.
  await deps.clearVerification(firmId);
  try {
    await deps.recordAudit(firmId, "email.changed", email);
  } catch {
    // best-effort; the change already happened
  }

  // Tell the old address. Best-effort by design: it is a notice, not a gate,
  // and the change is already durable — reporting failure here would say the
  // change did not happen when it did.
  try {
    await deps.sendEmail(
      previousEmail,
      "Your SiteMint AI Receptionist sign-in email was changed",
      [
        `The email address for this account was changed to ${email}.`,
        "",
        "If you made this change, nothing more is needed — this address will stop receiving messages for the account.",
        "If you did not, change your password immediately and contact support: this address can no longer sign in.",
      ].join("\n"),
    );
  } catch {
    // ignore
  }

  // And prove the new one. A failure here is reported honestly rather than
  // hidden: the address did change, but it is unverified and silent until a
  // code reaches it, and the caller has to be told which of those two is true.
  let verificationSent = false;
  try {
    const { rawToken } = await deps.issueToken(firmId, "email_verification");
    const sent = await deps.sendEmail(
      email,
      "Verify your SiteMint AI Receptionist email",
      [
        "Confirm this address to secure your account.",
        "",
        `Your verification code (valid 24 hours): ${rawToken}`,
      ].join("\n"),
    );
    verificationSent = sent.ok;
  } catch {
    verificationSent = false;
  }

  return { ok: true, email, verificationSent };
}

export async function productionEmailChangeDeps(): Promise<EmailChangeDeps> {
  const { db } = await import("@workspace/db");
  const { intakeFirms } = await import("@workspace/db/schema");
  const { voiceAccountStates } = await import("@workspace/db/schema/voice");
  const { eq } = await import("drizzle-orm");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  const { issueAccountToken } = await import("./accountTokens.js");

  return {
    loadFirm: async (firmId) => {
      const [row] = await db
        .select({ email: intakeFirms.email, passwordHash: intakeFirms.passwordHash })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      // An account with no address on file is not an error state here: the
      // change proceeds, and `same_email` simply cannot match.
      return row ? { email: row.email ?? "", passwordHash: row.passwordHash ?? "" } : undefined;
    },
    verifyPassword: async (password, passwordHash) => {
      if (passwordHash === "") return false;
      const bcrypt = (await import("bcryptjs")).default;
      return bcrypt.compare(password, passwordHash);
    },
    findFirmIdByEmail: async (email) => {
      const [row] = await db.select({ id: intakeFirms.id }).from(intakeFirms).where(eq(intakeFirms.email, email)).limit(1);
      return row?.id;
    },
    updateEmail: async (firmId, email) => {
      // notifyEmail follows the account address: it was seeded from it at
      // signup, and leaving it pointing at an address the business has just
      // abandoned would keep sending intake notices somewhere unread.
      await db.update(intakeFirms).set({ email, notifyEmail: email }).where(eq(intakeFirms.id, firmId));
    },
    clearVerification: async (firmId) => {
      const now = new Date();
      await db
        .insert(voiceAccountStates)
        .values({ firmId, emailVerifiedAt: null })
        .onConflictDoUpdate({ target: [voiceAccountStates.firmId], set: { emailVerifiedAt: null, updatedAt: now } });
    },
    sendEmail: async (to, subject, text) => {
      const result = await createAlertTransportFromEnv().send({ to, subject, text });
      return { ok: result.ok };
    },
    issueToken: async (firmId, purpose) => issueAccountToken(firmId, purpose),
    recordAudit: async (firmId, action, subject) => {
      await recordAuditEvent({ firmId, actor: "owner", action, subject });
    },
  };
}
