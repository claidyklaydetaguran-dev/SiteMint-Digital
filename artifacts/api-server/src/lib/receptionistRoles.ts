// Who is signed in, and what they may do.
//
// A receptionist session names a business (firm_id) and an address. The
// address decides the role:
//
//   - the business's own account address  → the account holder, an owner;
//   - an ACTIVE team member of that business who has set a password
//                                         → that member's role (owner/staff);
//   - anything else (a revoked member, an invitation never accepted, an
//     address that no longer belongs to the business) → no one. The session
//     is refused, so revocation takes effect on the very next request.
//
// There is no fall-through to "owner": an address the server cannot place is
// never trusted.
//
// Staff get every read, and only the writes listed in STAFF_WRITES — the
// day-to-day handling of calls, messages, contacts, bookings and support.
// Anything not listed (receptionist setup, publishing, phone numbers, calendar
// connection, transfer targets, team, billing, business profile) is owner-only
// by default, so a new route is protected until someone decides otherwise.
//
// Changing the account's own sign-in (its email and password) belongs to the
// account holder alone; a co-owner has their own password and changes that.

import { and, eq, isNotNull, sql } from "drizzle-orm";

// The database is loaded on first use, so the access rules above can be
// tested without one.
async function data() {
  const [{ db }, { intakeFirms }, { voiceFirmMembers }] = await Promise.all([
    import("@workspace/db"),
    import("@workspace/db/schema"),
    import("@workspace/db/schema/voice"),
  ]);
  return { db, intakeFirms, voiceFirmMembers };
}

export type ReceptionistRole = "owner" | "staff";

export interface ReceptionistPrincipal {
  role: ReceptionistRole;
  /** True for the business's own account; false for a team member. */
  accountHolder: boolean;
  /** The team member's id, or null for the account holder. */
  memberId: number | null;
}

/** Route patterns exactly as declared on the routers, keyed by METHOD. */
const STAFF_WRITES = new Set<string>([
  "PATCH /receptionist/conversations/:id",
  "PATCH /receptionist/voice/messages/:id",
  "POST /receptionist/contacts",
  "PATCH /receptionist/contacts/:id",
  "POST /receptionist/contacts/:id/texts/read",
  "PUT /receptionist/voice/calls/:callId/review",
  "DELETE /receptionist/voice/calls/:callId/review",
  "POST /receptionist/voice/issues/:id/resolve",
  "POST /receptionist/availability/hold",
  "POST /receptionist/availability/requests",
  "POST /receptionist/availability/requests/:publicId/cancel",
  "POST /receptionist/calendar/requests/:publicId/approve",
  "POST /receptionist/calendar/requests/:publicId/cancel",
  "POST /receptionist/calendar/requests/:publicId/reschedule",
  "POST /receptionist/support/requests",
  "POST /receptionist/support/requests/:id/messages",
  "POST /receptionist/support/requests/:id/close",
  "POST /receptionist/account/member-password",
]);

/** GETs that change something (an OAuth callback stores a connection). */
const OWNER_READS = new Set<string>(["GET /receptionist/calendar/google/callback"]);

const ACCOUNT_HOLDER_ONLY = new Set<string>([
  "POST /receptionist/account/password/change",
  "PATCH /receptionist/account/email",
  "POST /receptionist/account/verify-email/request",
]);

export type AccessDecision = "allow" | "owner_only" | "account_holder_only";

/**
 * `routePath` is Express's `req.route.path`. When it is unknown (middleware
 * mounted without a route), only an account holder is let through.
 */
export function accessDecision(
  method: string,
  routePath: string | undefined,
  principal: ReceptionistPrincipal,
): AccessDecision {
  if (routePath === undefined) return principal.accountHolder ? "allow" : "account_holder_only";
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  const key = `${verb} ${routePath}`;
  if (ACCOUNT_HOLDER_ONLY.has(key)) return principal.accountHolder ? "allow" : "account_holder_only";
  if (principal.role === "owner") return "allow";
  if (verb === "GET") return OWNER_READS.has(key) ? "owner_only" : "allow";
  return STAFF_WRITES.has(key) ? "allow" : "owner_only";
}

export const ACCESS_DENIED_MESSAGES: Record<Exclude<AccessDecision, "allow">, string> = {
  owner_only: "Only an owner of this business can do that.",
  account_holder_only: "Only the business's main account can change its sign-in details.",
};

/** Places a session's address within its business, or returns null. */
export async function resolvePrincipal(firmId: number, email: string): Promise<ReceptionistPrincipal | null> {
  const { db, intakeFirms, voiceFirmMembers } = await data();
  const address = email.trim().toLowerCase();
  const [firm] = await db
    .select({ email: intakeFirms.email })
    .from(intakeFirms)
    .where(eq(intakeFirms.id, firmId))
    .limit(1);
  if (!firm) return null;
  if (firm.email && firm.email.trim().toLowerCase() === address) {
    return { role: "owner", accountHolder: true, memberId: null };
  }
  const [member] = await db
    .select({ id: voiceFirmMembers.id, role: voiceFirmMembers.role })
    .from(voiceFirmMembers)
    .where(
      and(
        eq(voiceFirmMembers.firmId, firmId),
        eq(voiceFirmMembers.email, address),
        eq(voiceFirmMembers.status, "active"),
        isNotNull(voiceFirmMembers.passwordHash),
      ),
    )
    .limit(1);
  if (!member || (member.role !== "owner" && member.role !== "staff")) return null;
  return { role: member.role, accountHolder: false, memberId: member.id };
}

export interface MemberLogin {
  firmId: number;
  email: string;
  passwordHash: string;
}

/** Active team memberships for an address that can sign in, oldest first. */
export async function findMemberLogins(email: string): Promise<MemberLogin[]> {
  const { db, voiceFirmMembers } = await data();
  const rows = await db
    .select({ firmId: voiceFirmMembers.firmId, email: voiceFirmMembers.email, passwordHash: voiceFirmMembers.passwordHash })
    .from(voiceFirmMembers)
    .where(
      and(
        eq(voiceFirmMembers.email, email.trim().toLowerCase()),
        eq(voiceFirmMembers.status, "active"),
        isNotNull(voiceFirmMembers.passwordHash),
      ),
    )
    .orderBy(voiceFirmMembers.id);
  return rows.filter((r): r is MemberLogin => typeof r.passwordHash === "string" && r.passwordHash.length > 0);
}

/** Ends every session a team member holds in one business. */
export async function endMemberSessions(firmId: number, email: string): Promise<void> {
  const { db } = await data();
  await db.execute(
    sql`DELETE FROM receptionist_sessions WHERE firm_id = ${firmId} AND lower(email) = ${email.trim().toLowerCase()}`,
  );
}
