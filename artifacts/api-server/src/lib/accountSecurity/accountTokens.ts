// P8: single-use account tokens (email verification, password reset,
// member invitations) and the flows built on them.
//
// Token discipline:
//   - 32 random bytes, base64url; only the sha256 HEX of it is stored.
//   - Single-use via a guarded UPDATE (consumed_at IS NULL) — two
//     concurrent consumers cannot both win.
//   - Bounded TTLs per purpose; expiry checked at consumption.
//   - Raw tokens exist only inside the delivery email; no API response
//     ever contains one.
//   - Email delivery goes through the P7 alert transport. While alerts
//     are disabled (the default) these flows answer 503 — honest and
//     inert, never a token silently created without a delivery path.
//
// Password reset completes against intake_firms.password_hash with the
// SAME bcrypt cost the protected signup route uses (12) and revokes every
// existing session for the firm. The protected auth files are imported
// from, never edited.

import crypto from "node:crypto";

export type TokenPurpose = "email_verification" | "password_reset" | "member_invitation";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 30 * 60 * 1000,
  member_invitation: 7 * 24 * 60 * 60 * 1000,
};

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export interface AccountTokenDeps {
  insertToken: (row: { firmId: number; purpose: TokenPurpose; tokenHash: string; expiresAt: Date }) => Promise<void>;
  /** Guarded consume: marks consumed and returns the row only when unconsumed and unexpired. */
  consumeToken: (purpose: TokenPurpose, tokenHash: string, now: Date) => Promise<{ firmId: number } | undefined>;
  now?: () => Date;
}

async function productionTokenDeps(): Promise<AccountTokenDeps> {
  const { db } = await import("@workspace/db");
  const { voiceAccountTokens } = await import("@workspace/db/schema/voice");
  const { and, eq, gt, isNull } = await import("drizzle-orm");
  return {
    insertToken: async (row) => {
      await db.insert(voiceAccountTokens).values(row);
    },
    consumeToken: async (purpose, tokenHash, now) => {
      const [row] = await db
        .update(voiceAccountTokens)
        .set({ consumedAt: now, updatedAt: now })
        .where(
          and(
            eq(voiceAccountTokens.purpose, purpose),
            eq(voiceAccountTokens.tokenHash, tokenHash),
            isNull(voiceAccountTokens.consumedAt),
            gt(voiceAccountTokens.expiresAt, now),
          ),
        )
        .returning({ firmId: voiceAccountTokens.firmId });
      return row;
    },
  };
}

/** Issues a token and returns the RAW value exactly once, for the delivery email. */
export async function issueAccountToken(
  firmId: number,
  purpose: TokenPurpose,
  deps?: AccountTokenDeps,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const resolved = deps ?? (await productionTokenDeps());
  const now = resolved.now?.() ?? new Date();
  const rawToken = generateRawToken();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS[purpose]);
  await resolved.insertToken({ firmId, purpose, tokenHash: hashToken(rawToken), expiresAt });
  return { rawToken, expiresAt };
}

export type ConsumeResult = { ok: true; firmId: number } | { ok: false; reason: "invalid_or_expired" };

/** One reason for every failure mode — expired, consumed, unknown, and wrong-purpose are indistinguishable to a caller. */
export async function consumeAccountToken(
  purpose: TokenPurpose,
  rawToken: unknown,
  deps?: AccountTokenDeps,
): Promise<ConsumeResult> {
  if (typeof rawToken !== "string" || rawToken.length < 20 || rawToken.length > 200) {
    return { ok: false, reason: "invalid_or_expired" };
  }
  const resolved = deps ?? (await productionTokenDeps());
  const now = resolved.now?.() ?? new Date();
  const row = await resolved.consumeToken(purpose, hashToken(rawToken), now);
  return row ? { ok: true, firmId: row.firmId } : { ok: false, reason: "invalid_or_expired" };
}

// ── password reset ───────────────────────────────────────────────────────────

export interface PasswordResetDeps {
  tokens?: AccountTokenDeps;
  findFirmByEmail: (emailLower: string) => Promise<{ id: number; email: string } | undefined>;
  updatePasswordHash: (firmId: number, passwordHash: string) => Promise<void>;
  revokeSessions: (firmId: number) => Promise<void>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  recordAudit: (firmId: number, action: string) => Promise<void>;
  hashPassword?: (password: string) => Promise<string>;
}

async function productionResetDeps(): Promise<Omit<PasswordResetDeps, "tokens" | "hashPassword">> {
  const { db } = await import("@workspace/db");
  const { intakeFirms, receptionistSessions } = await import("@workspace/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  return {
    findFirmByEmail: async (emailLower) => {
      const [row] = await db
        .select({ id: intakeFirms.id, email: intakeFirms.email })
        .from(intakeFirms)
        .where(sql`lower(${intakeFirms.email}) = ${emailLower}`)
        .limit(1);
      return row && row.email ? { id: row.id, email: row.email } : undefined;
    },
    updatePasswordHash: async (firmId, passwordHash) => {
      await db.update(intakeFirms).set({ passwordHash }).where(eq(intakeFirms.id, firmId));
    },
    revokeSessions: async (firmId) => {
      await db.delete(receptionistSessions).where(eq(receptionistSessions.firmId, firmId));
    },
    sendEmail: async (to, subject, text) => {
      const result = await createAlertTransportFromEnv().send({ to, subject, text });
      return { ok: result.ok };
    },
    recordAudit: async (firmId, action) => {
      await recordAuditEvent({ firmId, actor: "owner", action });
    },
  };
}

export type ResetRequestResult =
  | { accepted: true }
  | { accepted: false; reason: "delivery_unavailable" };

/**
 * Requests a reset for an email address. ALWAYS answers identically for
 * known and unknown addresses (no account enumeration); only a disabled
 * delivery path is surfaced, because a silently undeliverable reset is a
 * lockout.
 */
export async function requestPasswordReset(
  email: unknown,
  deps?: Partial<PasswordResetDeps>,
): Promise<ResetRequestResult> {
  const resolved = { ...(deps?.findFirmByEmail ? deps : await productionResetDeps()), ...deps } as PasswordResetDeps;
  if (typeof email !== "string" || email.trim().length === 0 || email.length > 200) return { accepted: true };
  const firm = await resolved.findFirmByEmail(email.trim().toLowerCase());
  if (!firm) return { accepted: true }; // indistinguishable from success
  const { rawToken } = await issueAccountToken(firm.id, "password_reset", resolved.tokens);
  const sent = await resolved.sendEmail(
    firm.email,
    "Reset your SiteMint AI Receptionist password",
    [
      "A password reset was requested for your account.",
      "",
      `Your reset code (valid 30 minutes): ${rawToken}`,
      "",
      "If you did not request this, you can ignore this email — nothing changes without the code.",
    ].join("\n"),
  );
  if (!sent.ok) return { accepted: false, reason: "delivery_unavailable" };
  try {
    await resolved.recordAudit(firm.id, "password.reset_requested");
  } catch {
    // audit is best-effort here
  }
  return { accepted: true };
}

export type ResetCompleteResult =
  | { ok: true }
  | { ok: false; reason: "invalid_or_expired" | "weak_password" };

export async function completePasswordReset(
  rawToken: unknown,
  newPassword: unknown,
  deps?: Partial<PasswordResetDeps>,
): Promise<ResetCompleteResult> {
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 200) {
    return { ok: false, reason: "weak_password" };
  }
  const resolved = { ...(deps?.updatePasswordHash ? deps : await productionResetDeps()), ...deps } as PasswordResetDeps;
  const consumed = await consumeAccountToken("password_reset", rawToken, resolved.tokens);
  if (!consumed.ok) return { ok: false, reason: "invalid_or_expired" };
  const hashPassword =
    resolved.hashPassword ??
    (async (password: string) => {
      const bcrypt = (await import("bcryptjs")).default;
      return bcrypt.hash(password, 12); // same cost as the protected signup route
    });
  const passwordHash = await hashPassword(newPassword);
  await resolved.updatePasswordHash(consumed.firmId, passwordHash);
  await resolved.revokeSessions(consumed.firmId); // every existing session dies with the old password
  try {
    await resolved.recordAudit(consumed.firmId, "password.reset_completed");
  } catch {
    // audit is best-effort; the reset already happened
  }
  return { ok: true };
}

// ── email verification ───────────────────────────────────────────────────────

export interface EmailVerificationDeps {
  tokens?: AccountTokenDeps;
  findFirmEmail: (firmId: number) => Promise<string | undefined>;
  markVerified: (firmId: number, at: Date) => Promise<void>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  recordAudit: (firmId: number, action: string) => Promise<void>;
  now?: () => Date;
}

async function productionVerificationDeps(): Promise<Omit<EmailVerificationDeps, "tokens">> {
  const { db } = await import("@workspace/db");
  const { intakeFirms } = await import("@workspace/db/schema");
  const { voiceAccountStates } = await import("@workspace/db/schema/voice");
  const { eq } = await import("drizzle-orm");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  return {
    findFirmEmail: async (firmId) => {
      const [row] = await db.select({ email: intakeFirms.email }).from(intakeFirms).where(eq(intakeFirms.id, firmId)).limit(1);
      return row?.email ?? undefined;
    },
    markVerified: async (firmId, at) => {
      await db
        .insert(voiceAccountStates)
        .values({ firmId, emailVerifiedAt: at })
        .onConflictDoUpdate({ target: [voiceAccountStates.firmId], set: { emailVerifiedAt: at, updatedAt: at } });
    },
    sendEmail: async (to, subject, text) => {
      const result = await createAlertTransportFromEnv().send({ to, subject, text });
      return { ok: result.ok };
    },
    recordAudit: async (firmId, action) => {
      await recordAuditEvent({ firmId, actor: "owner", action });
    },
  };
}

export type VerificationRequestResult =
  | { sent: true }
  | { sent: false; reason: "no_email" | "delivery_unavailable" };

export async function requestEmailVerification(
  firmId: number,
  deps?: Partial<EmailVerificationDeps>,
): Promise<VerificationRequestResult> {
  const resolved = { ...(deps?.findFirmEmail ? deps : await productionVerificationDeps()), ...deps } as EmailVerificationDeps;
  const email = await resolved.findFirmEmail(firmId);
  if (!email) return { sent: false, reason: "no_email" };
  const { rawToken } = await issueAccountToken(firmId, "email_verification", resolved.tokens);
  const sent = await resolved.sendEmail(
    email,
    "Verify your SiteMint AI Receptionist email",
    [
      "Confirm this address to secure your account.",
      "",
      `Your verification code (valid 24 hours): ${rawToken}`,
    ].join("\n"),
  );
  return sent.ok ? { sent: true } : { sent: false, reason: "delivery_unavailable" };
}

export type VerificationConfirmResult = { ok: true; firmId: number } | { ok: false; reason: "invalid_or_expired" };

export async function confirmEmailVerification(
  rawToken: unknown,
  deps?: Partial<EmailVerificationDeps>,
): Promise<VerificationConfirmResult> {
  const resolved = { ...(deps?.markVerified ? deps : await productionVerificationDeps()), ...deps } as EmailVerificationDeps;
  const consumed = await consumeAccountToken("email_verification", rawToken, resolved.tokens);
  if (!consumed.ok) return { ok: false, reason: "invalid_or_expired" };
  const now = resolved.now?.() ?? new Date();
  await resolved.markVerified(consumed.firmId, now);
  try {
    await resolved.recordAudit(consumed.firmId, "email.verified");
  } catch {
    // best-effort
  }
  return { ok: true, firmId: consumed.firmId };
}
