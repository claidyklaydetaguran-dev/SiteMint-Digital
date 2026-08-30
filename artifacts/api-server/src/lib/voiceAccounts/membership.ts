// P8: firm membership — the roster, roles, and invitation lifecycle.
//
// The login system remains single-identity (a session IS a firm; the
// protected auth files are untouched), so this phase ships membership as
// the data model + invitation flow that a future owner-approved auth
// change plugs into. Invitations reuse the account-token discipline
// (hash-only storage, single-use, TTL) and the alert transport for
// delivery (503 while disabled — inert by default).

import { issueAccountToken, consumeAccountToken, type AccountTokenDeps } from "../accountSecurity/accountTokens.js";
import type { VoiceFirmMember } from "@workspace/db/schema/voice";

export const MEMBER_ROLES = ["owner", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MAX_MEMBERS_PER_FIRM = 10;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MembershipDeps {
  tokens?: AccountTokenDeps;
  listMembers: (firmId: number) => Promise<VoiceFirmMember[]>;
  /** Insert refusing duplicates on (firm, email); returns undefined on conflict. */
  insertMember: (row: { firmId: number; email: string; role: MemberRole }) => Promise<VoiceFirmMember | undefined>;
  /** Guarded: invited → active for the newest unrevoked invitation of that firm+email. */
  activateMember: (firmId: number, email: string, at: Date) => Promise<boolean>;
  revokeMember: (firmId: number, memberId: number, at: Date) => Promise<boolean>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  recordAudit: (firmId: number, action: string, subject: string) => Promise<void>;
  now?: () => Date;
}

async function productionMembershipDeps(): Promise<Omit<MembershipDeps, "tokens">> {
  const { db } = await import("@workspace/db");
  const { voiceFirmMembers } = await import("@workspace/db/schema/voice");
  const { and, eq, asc } = await import("drizzle-orm");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { recordAuditEvent } = await import("./auditLog.js");
  return {
    listMembers: async (firmId) =>
      db.select().from(voiceFirmMembers).where(eq(voiceFirmMembers.firmId, firmId)).orderBy(asc(voiceFirmMembers.id)),
    insertMember: async (row) => {
      try {
        const [inserted] = await db.insert(voiceFirmMembers).values(row).returning();
        return inserted;
      } catch {
        return undefined; // unique (firm, email) conflict
      }
    },
    activateMember: async (firmId, email, at) => {
      const rows = await db
        .update(voiceFirmMembers)
        .set({ status: "active", acceptedAt: at, updatedAt: at })
        .where(
          and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.email, email), eq(voiceFirmMembers.status, "invited")),
        )
        .returning({ id: voiceFirmMembers.id });
      return rows.length > 0;
    },
    revokeMember: async (firmId, memberId, at) => {
      const rows = await db
        .update(voiceFirmMembers)
        .set({ status: "revoked", revokedAt: at, updatedAt: at })
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId)))
        .returning({ id: voiceFirmMembers.id });
      return rows.length > 0;
    },
    sendEmail: async (to, subject, text) => {
      const result = await createAlertTransportFromEnv().send({ to, subject, text });
      return { ok: result.ok };
    },
    recordAudit: async (firmId, action, subject) => {
      await recordAuditEvent({ firmId, actor: "owner", action, subject });
    },
  };
}

export type InviteResult =
  | { ok: true; member: VoiceFirmMember }
  | { ok: false; reason: "invalid_email" | "invalid_role" | "already_member" | "member_limit" | "delivery_unavailable" };

/**
 * Invites an email to the firm. The invitation token binds to the firm;
 * acceptance re-derives (firm, email) from the token's own record — never
 * from the acceptor's input.
 */
export async function inviteMember(
  firmId: number,
  emailInput: unknown,
  roleInput: unknown,
  deps?: Partial<MembershipDeps>,
): Promise<InviteResult> {
  if (typeof emailInput !== "string" || !EMAIL_SHAPE.test(emailInput.trim()) || emailInput.length > 200) {
    return { ok: false, reason: "invalid_email" };
  }
  if (roleInput !== "owner" && roleInput !== "staff") return { ok: false, reason: "invalid_role" };
  const email = emailInput.trim().toLowerCase();
  const resolved = { ...(deps?.listMembers ? deps : await productionMembershipDeps()), ...deps } as MembershipDeps;

  const existing = await resolved.listMembers(firmId);
  if (existing.filter((m) => m.status !== "revoked").length >= MAX_MEMBERS_PER_FIRM) {
    return { ok: false, reason: "member_limit" };
  }
  const member = await resolved.insertMember({ firmId, email, role: roleInput });
  if (!member) return { ok: false, reason: "already_member" };

  const { rawToken } = await issueAccountToken(firmId, "member_invitation", resolved.tokens);
  const sent = await resolved.sendEmail(
    email,
    "You've been invited to a SiteMint AI Receptionist workspace",
    [
      `You were invited as ${roleInput}.`,
      "",
      `Your invitation code (valid 7 days): ${rawToken}`,
      "",
      `Accept it with your email address (${email}) to join.`,
    ].join("\n"),
  );
  if (!sent.ok) {
    // Compensate: a roster row whose invitation never went out would turn
    // the operator's retry into a spurious already_member conflict.
    try {
      await resolved.revokeMember(firmId, member.id, resolved.now?.() ?? new Date());
    } catch {
      // best-effort; worst case the retry conflicts and the operator revokes by hand
    }
    return { ok: false, reason: "delivery_unavailable" };
  }
  try {
    await resolved.recordAudit(firmId, "member.invited", email);
  } catch {
    // best-effort
  }
  return { ok: true, member };
}

export type AcceptResult = { ok: true; firmId: number } | { ok: false; reason: "invalid_or_expired" | "no_invitation" };

/**
 * Accepts an invitation: the token proves the firm, the provided email
 * must match an invited row of that firm. Wrong-email guesses and stale
 * tokens are indistinguishable.
 */
export async function acceptInvitation(
  rawToken: unknown,
  emailInput: unknown,
  deps?: Partial<MembershipDeps>,
): Promise<AcceptResult> {
  if (typeof emailInput !== "string" || emailInput.trim().length === 0 || emailInput.length > 200) {
    return { ok: false, reason: "invalid_or_expired" };
  }
  const resolved = { ...(deps?.activateMember ? deps : await productionMembershipDeps()), ...deps } as MembershipDeps;
  const consumed = await consumeAccountToken("member_invitation", rawToken, resolved.tokens);
  if (!consumed.ok) return { ok: false, reason: "invalid_or_expired" };
  const now = resolved.now?.() ?? new Date();
  const activated = await resolved.activateMember(consumed.firmId, emailInput.trim().toLowerCase(), now);
  if (!activated) return { ok: false, reason: "no_invitation" };
  try {
    await resolved.recordAudit(consumed.firmId, "member.accepted", emailInput.trim().toLowerCase());
  } catch {
    // best-effort
  }
  return { ok: true, firmId: consumed.firmId };
}

export type RevokeResult = { ok: true } | { ok: false; reason: "not_found" };

export async function revokeMemberById(
  firmId: number,
  memberId: number,
  deps?: Partial<MembershipDeps>,
): Promise<RevokeResult> {
  const resolved = { ...(deps?.revokeMember ? deps : await productionMembershipDeps()), ...deps } as MembershipDeps;
  const now = resolved.now?.() ?? new Date();
  const revoked = await resolved.revokeMember(firmId, memberId, now);
  if (!revoked) return { ok: false, reason: "not_found" };
  try {
    await resolved.recordAudit(firmId, "member.revoked", String(memberId));
  } catch {
    // best-effort
  }
  return { ok: true };
}

export async function listFirmMembers(firmId: number, deps?: Partial<MembershipDeps>): Promise<VoiceFirmMember[]> {
  const resolved = { ...(deps?.listMembers ? deps : await productionMembershipDeps()), ...deps } as MembershipDeps;
  return resolved.listMembers(firmId);
}
