// In-memory MembershipDeps for tests. Implements the same guards the
// production queries do (business scoping, invitation-hash binding, status
// transitions), so a test exercises the rules rather than a stub's defaults.

import type { VoiceFirmMember } from "@workspace/db/schema/voice";
import type { AccountTokenDeps } from "../accountSecurity/accountTokens.js";
import type { MembershipDeps, MemberRole } from "./membership.js";

export function memoryTokenDeps(now: () => Date): AccountTokenDeps & {
  rows: Array<{ purpose: string; tokenHash: string; firmId: number; expiresAt: Date; consumedAt: Date | null }>;
} {
  const rows: Array<{ purpose: string; tokenHash: string; firmId: number; expiresAt: Date; consumedAt: Date | null }> = [];
  return {
    rows,
    now,
    insertToken: async (row) => {
      rows.push({ ...row, consumedAt: null });
    },
    consumeToken: async (purpose, tokenHash, at) => {
      const row = rows.find(
        (r) => r.purpose === purpose && r.tokenHash === tokenHash && r.consumedAt === null && r.expiresAt.getTime() > at.getTime(),
      );
      if (!row) return undefined;
      row.consumedAt = at;
      return { firmId: row.firmId };
    },
  };
}

export interface MembershipFake {
  deps: MembershipDeps;
  roster: VoiceFirmMember[];
  mail: Array<{ to: string; subject: string; text: string }>;
  endedSessions: Array<{ firmId: number; email: string }>;
  audit: string[];
}

export function membershipFake(
  opts: {
    now?: Date;
    firms?: Record<number, { name: string | null; email: string | null }>;
    sendOk?: boolean;
    env?: Record<string, string | undefined>;
  } = {},
): MembershipFake {
  const now = opts.now ?? new Date("2026-09-17T12:00:00.000Z");
  const firms = opts.firms ?? { 7: { name: "Acme Plumbing", email: "owner@acme.example.com" } };
  const roster: VoiceFirmMember[] = [];
  const mail: MembershipFake["mail"] = [];
  const endedSessions: MembershipFake["endedSessions"] = [];
  const audit: string[] = [];
  let nextId = 1;
  const find = (firmId: number, memberId: number) => roster.find((m) => m.firmId === firmId && m.id === memberId);

  const deps: MembershipDeps = {
    tokens: memoryTokenDeps(() => now),
    env: opts.env ?? {},
    now: () => now,
    listMembers: async (firmId) => roster.filter((m) => m.firmId === firmId),
    loadFirm: async (firmId) => firms[firmId],
    insertMember: async (row) => {
      const existing = roster.find((m) => m.firmId === row.firmId && m.email === row.email);
      if (existing && existing.status !== "revoked") return undefined;
      if (existing) {
        Object.assign(existing, {
          status: "invited", role: row.role, invitedAt: now, acceptedAt: null, revokedAt: null,
          passwordHash: null, inviteTokenHash: null, updatedAt: now,
        });
        return existing;
      }
      const created: VoiceFirmMember = {
        id: nextId++, firmId: row.firmId, email: row.email, role: row.role, status: "invited",
        invitedAt: now, acceptedAt: null, revokedAt: null, passwordHash: null, inviteTokenHash: null,
        createdAt: now, updatedAt: now,
      };
      roster.push(created);
      return created;
    },
    setInviteHash: async (firmId, memberId, tokenHash) => {
      const m = find(firmId, memberId);
      if (m) m.inviteTokenHash = tokenHash;
    },
    activateMember: async (firmId, email, tokenHash, passwordHash, at) => {
      const m = roster.find(
        (r) => r.firmId === firmId && r.email === email && r.status === "invited" && r.inviteTokenHash === tokenHash,
      );
      if (!m) return false;
      Object.assign(m, { status: "active", acceptedAt: at, passwordHash, inviteTokenHash: null, updatedAt: at });
      return true;
    },
    revokeMember: async (firmId, memberId, at) => {
      const m = find(firmId, memberId);
      if (!m || m.status === "revoked") return undefined;
      Object.assign(m, { status: "revoked", revokedAt: at, passwordHash: null, inviteTokenHash: null, updatedAt: at });
      return m;
    },
    updateRole: async (firmId, memberId, role: MemberRole, at) => {
      const m = find(firmId, memberId);
      if (!m || m.status === "revoked") return undefined;
      Object.assign(m, { role, updatedAt: at });
      return m;
    },
    loadMember: async (firmId, memberId) => find(firmId, memberId),
    setMemberPassword: async (firmId, memberId, passwordHash, at) => {
      const m = find(firmId, memberId);
      if (m && m.status === "active") Object.assign(m, { passwordHash, updatedAt: at });
    },
    endSessions: async (firmId, email) => {
      endedSessions.push({ firmId, email });
    },
    sendEmail: async (to, subject, text) => {
      mail.push({ to, subject, text });
      return { ok: opts.sendOk ?? true };
    },
    recordAudit: async (_firmId, action) => {
      audit.push(action);
    },
  };
  return { deps, roster, mail, endedSessions, audit };
}

/** The invitation code in an invitation email body. */
export function inviteCodeIn(text: string): string | undefined {
  return /code \(valid 7 days\): (\S+)/.exec(text)?.[1];
}
