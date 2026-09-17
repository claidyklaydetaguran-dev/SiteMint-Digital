// Team access: the roster, roles, invitations, member passwords and revocation.
//
// A team member is a row in voice_firm_members. Once they accept an
// invitation and choose a password, they sign in with their own address and
// password (routes/receptionistAuth.ts), and every request is checked against
// their role (lib/receptionistRoles.ts). Revoking a member ends their sessions
// immediately, and the role check refuses any session that survives.
//
// Invitations reuse the account-token discipline (hash-only storage,
// single-use, 7-day TTL). The token's hash is also stored on the member's own
// row, so an invitation can only activate the person it was sent to — knowing
// one code and another invitee's address is not enough.

import {
  consumeAccountToken,
  hashAccountPassword,
  hashToken,
  isAcceptableNewPassword,
  issueAccountToken,
  verifyAccountPassword,
  type AccountTokenDeps,
} from "../accountSecurity/accountTokens.js";
import { invitationEmailText } from "../accountSecurity/accountEmailLinks.js";
import type { VoiceFirmMember } from "@workspace/db/schema/voice";

export const MEMBER_ROLES = ["owner", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MAX_MEMBERS_PER_FIRM = 10;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MembershipDeps {
  tokens?: AccountTokenDeps;
  listMembers: (firmId: number) => Promise<VoiceFirmMember[]>;
  /** The business's own name and sign-in address. */
  loadFirm: (firmId: number) => Promise<{ name: string | null; email: string | null } | undefined>;
  /**
   * Adds an invited row, or turns a revoked row back into an invitation.
   * Returns undefined when the address is already invited or active.
   */
  insertMember: (row: { firmId: number; email: string; role: MemberRole }) => Promise<VoiceFirmMember | undefined>;
  /** Stores the outstanding invitation's hash on the member's row. */
  setInviteHash: (firmId: number, memberId: number, tokenHash: string) => Promise<void>;
  /**
   * Guarded: invited → active only for the row of that business and address
   * whose stored invitation hash matches. Sets the password and clears the hash.
   */
  activateMember: (
    firmId: number,
    email: string,
    tokenHash: string,
    passwordHash: string,
    at: Date,
  ) => Promise<boolean>;
  /** Marks revoked, clears password and invitation; false when not found or already revoked. */
  revokeMember: (firmId: number, memberId: number, at: Date) => Promise<VoiceFirmMember | undefined>;
  updateRole: (firmId: number, memberId: number, role: MemberRole, at: Date) => Promise<VoiceFirmMember | undefined>;
  loadMember: (firmId: number, memberId: number) => Promise<VoiceFirmMember | undefined>;
  setMemberPassword: (firmId: number, memberId: number, passwordHash: string, at: Date) => Promise<void>;
  endSessions: (firmId: number, email: string) => Promise<void>;
  sendEmail: (to: string, subject: string, text: string) => Promise<{ ok: boolean }>;
  recordAudit: (firmId: number, action: string, subject: string) => Promise<void>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

async function productionMembershipDeps(): Promise<Omit<MembershipDeps, "tokens">> {
  const { db } = await import("@workspace/db");
  const { intakeFirms } = await import("@workspace/db/schema");
  const { voiceFirmMembers } = await import("@workspace/db/schema/voice");
  const { and, eq, asc, ne } = await import("drizzle-orm");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  const { recordAuditEvent } = await import("./auditLog.js");
  const { endMemberSessions } = await import("../receptionistRoles.js");
  return {
    listMembers: async (firmId) =>
      db.select().from(voiceFirmMembers).where(eq(voiceFirmMembers.firmId, firmId)).orderBy(asc(voiceFirmMembers.id)),
    loadFirm: async (firmId) => {
      const [row] = await db
        .select({ name: intakeFirms.name, email: intakeFirms.email })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      return row;
    },
    insertMember: async (row) => {
      const now = new Date();
      // A revoked address can be invited again: the same row returns to
      // "invited" with the new role and no password.
      const [reinvited] = await db
        .update(voiceFirmMembers)
        .set({ status: "invited", role: row.role, invitedAt: now, acceptedAt: null, revokedAt: null, passwordHash: null, inviteTokenHash: null, updatedAt: now })
        .where(and(eq(voiceFirmMembers.firmId, row.firmId), eq(voiceFirmMembers.email, row.email), eq(voiceFirmMembers.status, "revoked")))
        .returning();
      if (reinvited) return reinvited;
      const [inserted] = await db.insert(voiceFirmMembers).values(row).onConflictDoNothing().returning();
      return inserted;
    },
    setInviteHash: async (firmId, memberId, tokenHash) => {
      await db
        .update(voiceFirmMembers)
        .set({ inviteTokenHash: tokenHash, updatedAt: new Date() })
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId)));
    },
    activateMember: async (firmId, email, tokenHash, passwordHash, at) => {
      const rows = await db
        .update(voiceFirmMembers)
        .set({ status: "active", acceptedAt: at, passwordHash, inviteTokenHash: null, updatedAt: at })
        .where(
          and(
            eq(voiceFirmMembers.firmId, firmId),
            eq(voiceFirmMembers.email, email),
            eq(voiceFirmMembers.status, "invited"),
            eq(voiceFirmMembers.inviteTokenHash, tokenHash),
          ),
        )
        .returning({ id: voiceFirmMembers.id });
      return rows.length > 0;
    },
    revokeMember: async (firmId, memberId, at) => {
      const [row] = await db
        .update(voiceFirmMembers)
        .set({ status: "revoked", revokedAt: at, passwordHash: null, inviteTokenHash: null, updatedAt: at })
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId), ne(voiceFirmMembers.status, "revoked")))
        .returning();
      return row;
    },
    updateRole: async (firmId, memberId, role, at) => {
      const [row] = await db
        .update(voiceFirmMembers)
        .set({ role, updatedAt: at })
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId), ne(voiceFirmMembers.status, "revoked")))
        .returning();
      return row;
    },
    loadMember: async (firmId, memberId) => {
      const [row] = await db
        .select()
        .from(voiceFirmMembers)
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId)))
        .limit(1);
      return row;
    },
    setMemberPassword: async (firmId, memberId, passwordHash, at) => {
      await db
        .update(voiceFirmMembers)
        .set({ passwordHash, updatedAt: at })
        .where(and(eq(voiceFirmMembers.firmId, firmId), eq(voiceFirmMembers.id, memberId), eq(voiceFirmMembers.status, "active")));
    },
    endSessions: endMemberSessions,
    sendEmail: async (to, subject, text) => {
      const result = await createAlertTransportFromEnv().send({ to, subject, text });
      return { ok: result.ok };
    },
    recordAudit: async (firmId, action, subject) => {
      await recordAuditEvent({ firmId, actor: "owner", action, subject });
    },
  };
}

async function resolve(deps?: Partial<MembershipDeps>): Promise<MembershipDeps> {
  const base = deps?.listMembers && deps?.insertMember && deps?.activateMember ? {} : await productionMembershipDeps();
  return { ...base, ...deps } as MembershipDeps;
}

async function audit(d: MembershipDeps, firmId: number, action: string, subject: string): Promise<void> {
  try {
    await d.recordAudit(firmId, action, subject);
  } catch {
    // best-effort; the change already happened
  }
}

export type InviteResult =
  | { ok: true; member: VoiceFirmMember }
  | {
      ok: false;
      reason: "invalid_email" | "invalid_role" | "already_member" | "member_limit" | "delivery_unavailable" | "own_address";
    };

/** Invites an address to the business's team and emails the invitation. */
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
  const d = await resolve(deps);

  const firm = await d.loadFirm(firmId);
  // The account's own address already signs in as the account holder; a
  // member row for it would make its role ambiguous.
  if (firm?.email && firm.email.trim().toLowerCase() === email) return { ok: false, reason: "own_address" };

  const existing = await d.listMembers(firmId);
  if (existing.filter((m) => m.status !== "revoked").length >= MAX_MEMBERS_PER_FIRM) {
    return { ok: false, reason: "member_limit" };
  }
  const member = await d.insertMember({ firmId, email, role: roleInput });
  if (!member) return { ok: false, reason: "already_member" };

  const { rawToken } = await issueAccountToken(firmId, "member_invitation", d.tokens);
  await d.setInviteHash(firmId, member.id, hashToken(rawToken));
  const sent = await d.sendEmail(
    email,
    firm?.name ? `${firm.name} invited you to its SiteMint AI Receptionist team` : "You've been invited to a SiteMint AI Receptionist team",
    invitationEmailText(firm?.name ?? null, roleInput, rawToken, d.env ?? process.env),
  );
  if (!sent.ok) {
    // Compensate: a roster row whose invitation never went out would turn
    // the owner's retry into a spurious already_member conflict.
    try {
      await d.revokeMember(firmId, member.id, d.now?.() ?? new Date());
    } catch {
      // best-effort; worst case the retry conflicts and the owner revokes by hand
    }
    return { ok: false, reason: "delivery_unavailable" };
  }
  await audit(d, firmId, "member.invited", email);
  return { ok: true, member };
}

export type AcceptResult =
  | { ok: true; firmId: number; email: string }
  | { ok: false; reason: "invalid_or_expired" | "no_invitation" | "weak_password" };

/**
 * Accepts an invitation and sets the member's password. The token proves the
 * business; the address must be the invited row that token was issued for.
 * Wrong-address guesses and stale tokens are indistinguishable.
 */
export async function acceptInvitation(
  rawToken: unknown,
  emailInput: unknown,
  passwordInput: unknown,
  deps?: Partial<MembershipDeps>,
): Promise<AcceptResult> {
  if (typeof emailInput !== "string" || emailInput.trim().length === 0 || emailInput.length > 200) {
    return { ok: false, reason: "invalid_or_expired" };
  }
  // Checked before the token is spent, so a too-short password costs nothing.
  if (!isAcceptableNewPassword(passwordInput)) return { ok: false, reason: "weak_password" };
  const d = await resolve(deps);
  const consumed = await consumeAccountToken("member_invitation", rawToken, d.tokens);
  if (!consumed.ok) return { ok: false, reason: "invalid_or_expired" };
  const email = emailInput.trim().toLowerCase();
  const now = d.now?.() ?? new Date();
  const passwordHash = await hashAccountPassword(passwordInput);
  const activated = await d.activateMember(consumed.firmId, email, hashToken(rawToken as string), passwordHash, now);
  if (!activated) return { ok: false, reason: "no_invitation" };
  await audit(d, consumed.firmId, "member.accepted", email);
  return { ok: true, firmId: consumed.firmId, email };
}

export type RevokeResult = { ok: true } | { ok: false; reason: "not_found" | "self" };

/** Removes a member's access now: the row is revoked and their sessions end. */
export async function revokeMemberById(
  firmId: number,
  memberId: number,
  deps?: Partial<MembershipDeps>,
  actorMemberId: number | null = null,
): Promise<RevokeResult> {
  if (actorMemberId !== null && actorMemberId === memberId) return { ok: false, reason: "self" };
  const d = await resolve(deps);
  const now = d.now?.() ?? new Date();
  const revoked = await d.revokeMember(firmId, memberId, now);
  if (!revoked) return { ok: false, reason: "not_found" };
  await d.endSessions(firmId, revoked.email);
  await audit(d, firmId, "member.revoked", String(memberId));
  return { ok: true };
}

export type RoleChangeResult =
  | { ok: true; member: VoiceFirmMember }
  | { ok: false; reason: "invalid_role" | "not_found" | "self" };

export async function changeMemberRole(
  firmId: number,
  memberId: number,
  roleInput: unknown,
  deps?: Partial<MembershipDeps>,
  actorMemberId: number | null = null,
): Promise<RoleChangeResult> {
  if (roleInput !== "owner" && roleInput !== "staff") return { ok: false, reason: "invalid_role" };
  // An owner cannot demote themselves by accident and lock the door behind them.
  if (actorMemberId !== null && actorMemberId === memberId) return { ok: false, reason: "self" };
  const d = await resolve(deps);
  const updated = await d.updateRole(firmId, memberId, roleInput, d.now?.() ?? new Date());
  if (!updated) return { ok: false, reason: "not_found" };
  await audit(d, firmId, "member.role_changed", `${memberId}:${roleInput}`);
  return { ok: true, member: updated };
}

export type MemberPasswordResult = { ok: true } | { ok: false; reason: "wrong_password" | "weak_password" | "not_found" };

/** A team member changes their own password. Other sessions of theirs end. */
export async function changeMemberPassword(
  firmId: number,
  memberId: number,
  currentPassword: unknown,
  newPassword: unknown,
  deps?: Partial<MembershipDeps>,
): Promise<MemberPasswordResult> {
  if (!isAcceptableNewPassword(newPassword)) return { ok: false, reason: "weak_password" };
  const d = await resolve(deps);
  const member = await d.loadMember(firmId, memberId);
  if (!member || member.status !== "active" || !member.passwordHash) return { ok: false, reason: "not_found" };
  if (typeof currentPassword !== "string" || !(await verifyAccountPassword(currentPassword, member.passwordHash))) {
    return { ok: false, reason: "wrong_password" };
  }
  const now = d.now?.() ?? new Date();
  await d.setMemberPassword(firmId, memberId, await hashAccountPassword(newPassword), now);
  await d.endSessions(firmId, member.email);
  await audit(d, firmId, "member.password_changed", String(memberId));
  return { ok: true };
}

export async function listFirmMembers(firmId: number, deps?: Partial<MembershipDeps>): Promise<VoiceFirmMember[]> {
  const d = deps?.listMembers ? (deps as MembershipDeps) : await resolve(deps);
  return d.listMembers(firmId);
}
