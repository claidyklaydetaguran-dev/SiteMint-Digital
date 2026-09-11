import {
  pgTable, serial, text, integer, timestamp, decimal, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M4: the customer portal ─────────────────────────────────────────────────
//
// PUSH-MODE tables (shared barrel), additive only. Reviewed DDL lives in
// docs/crm-ops/schema/M4-portal.sql and is applied with psql, not push.
//
// ── Why a THIRD auth system, and not a reuse of either existing one ─────────
//
// There are already two: CRM staff (`crm_staff_session` cookie, permissions,
// MFA, CSRF) and the receptionist product (`receptionist_session` cookie,
// scoped to an `intake_firms` row). Neither can carry a customer:
//
//  1. A staff session resolves to a `crm_staff` row and, through
//     `effectivePermissions`, to grants over EVERY contact. There is no
//     per-contact narrowing anywhere in that model, so a customer holding one
//     would be a staff member with a strange role — one forgotten permission
//     away from reading another client's file.
//  2. A receptionist session resolves to a firm in a different product with a
//     different customer universe. A CRM contact is not an `intake_firms` row.
//  3. The two cookies name the systems that own them. A third cookie name
//     means a portal session is not merely unauthorised at a staff route, it
//     is INVISIBLE to one: `resolveStaffSession` reads `crm_staff_session` and
//     finds nothing. Structural incapability, not a permission check somebody
//     has to remember to write.
//
// So: `crm_portal_sessions`, its own cookie, its own CSRF header, its own TTL,
// and an identity that is a contact (`crm_leads.id`) rather than a person here.

// ── Vocabularies ────────────────────────────────────────────────────────────

/** A portal account is usable or it is not. Nothing in between. */
export const CRM_PORTAL_ACCOUNT_STATUSES = ["active", "disabled"] as const;
export type CrmPortalAccountStatus = (typeof CRM_PORTAL_ACCOUNT_STATUSES)[number];

/**
 * The single value every portal surface reports about a customer's acceptance
 * of a proposal, and about every file the portal serves.
 *
 * Accepting a proposal in a web form records that a person clicked a button
 * while holding a session. It is NOT a signature: there is no signer identity
 * verified by anyone but us, no tamper-evident document version, no certificate
 * and no audit trail a third party would accept. An uploaded PDF is not one
 * either — it is bytes somebody sent us.
 *
 * Import this constant rather than writing a status string, so no route can
 * quietly start claiming something stronger than what happened.
 */
export const PORTAL_NOT_A_SIGNATURE = "not_a_signature" as const;

/**
 * How a customer's acceptance must be described in any UI or payload.
 * Deliberately a plain statement of the act performed.
 */
export const PORTAL_ACCEPTANCE_LABEL = "Accepted by customer" as const;

// ── The portal identity ─────────────────────────────────────────────────────

/**
 * One portal login, belonging to exactly one contact.
 *
 * `leadId` is UNIQUE: the contact IS the tenant. Every portal query is scoped
 * by the session's `leadId`, so two accounts over one contact would be two
 * doors into one tenant with no way to tell which one revoked access.
 *
 * No foreign key, matching every other `crm_*` table in this repo. What deletes
 * a contact is another route's decision, and this table does not get to change
 * it; `crmPortal.ts` resolves a missing contact to a 404 instead.
 */
export const crmPortalAccounts = pgTable("crm_portal_accounts", {
  id:     serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),

  /**
   * Snapshot of the address access was granted to, lowercased. Deliberately
   * NOT read live from `crm_leads.email`: editing a contact's email address in
   * the CRM must not silently hand the portal login to a different mailbox.
   */
  email:        text("email").notNull(),
  passwordHash: text("password_hash").notNull(),

  status: text("status").notNull().default("active"),

  /**
   * Bumped by a password change or by staff revoking access, which kills every
   * session issued before it in one comparison — the same mechanism
   * `crm_staff.session_epoch` uses, for the same reason.
   */
  sessionEpoch: integer("session_epoch").notNull().default(0),

  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_portal_accounts_lead").on(table.leadId),
  // Lowercased at write time, so this is a real uniqueness guarantee over the
  // identifier people actually type.
  uniqueIndex("uq_crm_portal_accounts_email").on(table.email),
  check("ck_crm_portal_accounts_status",
    sql`${table.status} IN ('active', 'disabled')`),
]);

export type CrmPortalAccount = typeof crmPortalAccounts.$inferSelect;

// ── Invitations ─────────────────────────────────────────────────────────────

/**
 * How access begins: a staff member invites one contact, once.
 *
 * Only the sha256 of the token is stored, so a leaked database row cannot be
 * turned back into a working invitation. It is single-use (`acceptedAt`),
 * expiring (`expiresAt`) and revocable (`revokedAt`), and the raw value exists
 * exactly once — in the response to the staff member who created it, and in
 * the message sent to the customer. It is never logged.
 */
export const crmPortalInvitations = pgTable("crm_portal_invitations", {
  id:     serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  /** The address it was issued to, lowercased. Also the login it creates. */
  email:  text("email").notNull(),

  tokenHash: text("token_hash").notNull(),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel:   text("created_by_label").notNull(),

  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
  revokedByStaffId: integer("revoked_by_staff_id"),

  /**
   * What happened when we tried to deliver it, from `MailOutcome`. "Nothing was
   * sent because mail is not configured" is a fact the sender needs, not an
   * error to swallow.
   */
  deliveryState:  text("delivery_state"),
  deliveryDetail: text("delivery_detail"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_portal_invitations_token_hash").on(table.tokenHash),
  index("ix_crm_portal_invitations_lead").on(table.leadId, table.id),
]);

export type CrmPortalInvitation = typeof crmPortalInvitations.$inferSelect;

// ── Sessions ────────────────────────────────────────────────────────────────

/**
 * A signed-in customer.
 *
 * `leadId` is carried here as well as on the account, and it is the value every
 * scoped query uses. That denormalisation is the point: resolving the tenant
 * costs one row read on the session itself, so no route has a reason to derive
 * the scope for itself — and therefore no route has a chance to derive it
 * wrongly.
 */
export const crmPortalSessions = pgTable("crm_portal_sessions", {
  id:              serial("id").primaryKey(),
  portalAccountId: integer("portal_account_id").notNull(),
  leadId:          integer("lead_id").notNull(),

  tokenHash: text("token_hash").notNull(),
  /** Double-submit CSRF, echoed in a header the portal's own JS sets. */
  csrfHash:  text("csrf_hash").notNull(),
  epoch:     integer("epoch").notNull().default(0),

  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),

  ip:        text("ip"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_portal_sessions_token_hash").on(table.tokenHash),
  index("ix_crm_portal_sessions_account").on(table.portalAccountId, table.id),
]);

export type CrmPortalSession = typeof crmPortalSessions.$inferSelect;

// ── What a customer may see ─────────────────────────────────────────────────

/**
 * The allowlist that decides which files appear in the portal.
 *
 * Default-deny, and that is the whole design. The obvious alternative — "show
 * every attachment hanging off this contact, their deals and their projects" —
 * is wrong in a way that only shows up once: staff attach internal things to
 * records all the time (a signed-off scope from a subcontractor, a screenshot
 * of a complaint, a margin sheet). Deriving visibility from association means
 * the day somebody attaches one of those, the customer can read it, and nobody
 * finds out.
 *
 * So a file is visible to a customer when, and only when, a row here says so.
 * A file the customer uploaded THEMSELVES gets a grant written at upload time,
 * which keeps this the single source of truth rather than the first of two.
 */
export const crmPortalDocumentGrants = pgTable("crm_portal_document_grants", {
  id:           serial("id").primaryKey(),
  leadId:       integer("lead_id").notNull(),
  attachmentId: integer("attachment_id").notNull(),

  /** Null when the customer uploaded it; `grantedByLabel` says which. */
  grantedByStaffId: integer("granted_by_staff_id"),
  grantedByLabel:   text("granted_by_label").notNull(),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_portal_document_grants").on(table.leadId, table.attachmentId),
  index("ix_crm_portal_document_grants_lead").on(table.leadId, table.id),
]);

export type CrmPortalDocumentGrant = typeof crmPortalDocumentGrants.$inferSelect;

// ── Proposal acceptance ─────────────────────────────────────────────────────

/**
 * A customer said yes to a deal, in the portal, on a date.
 *
 * That is the entire claim, and the table is shaped so nothing larger can be
 * read into it. There is no `signedAt`, no `signature`, no `signerVerified`,
 * because none of those things happened. `PORTAL_NOT_A_SIGNATURE` is what every
 * payload reports.
 *
 * `typedName` is what the person typed into the box. It is evidence of intent
 * and nothing more — it is not compared against anything, and the column name
 * says "typed" so no later reader mistakes it for an identity check.
 *
 * Accepting does NOT move the deal to Won. Closing a deal is a staff act with
 * its own route, its own permission and its own audit entry; a customer's
 * click must not reach into the sales chain and change what the business
 * believes it has sold.
 */
export const crmPortalProposalAcceptances = pgTable("crm_portal_proposal_acceptances", {
  id:     serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  dealId: integer("deal_id").notNull(),
  portalAccountId: integer("portal_account_id"),

  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  /** Free text the customer typed. Not verified against anything. */
  typedName:  text("typed_name").notNull(),
  /** Derived with the same trusted-hop rules as every other client address. */
  acceptedFromIp: text("accepted_from_ip"),

  /**
   * The figure on screen at the moment of acceptance, copied rather than
   * referenced. If the deal's value is edited afterwards, what the customer
   * actually agreed to is still recoverable.
   */
  dealValueAtAcceptance: decimal("deal_value_at_acceptance", { precision: 10, scale: 2 }),
  dealNameAtAcceptance:  text("deal_name_at_acceptance"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One acceptance per deal. A double-click is not two agreements.
  uniqueIndex("uq_crm_portal_proposal_acceptances_deal").on(table.dealId),
  index("ix_crm_portal_proposal_acceptances_lead").on(table.leadId, table.id),
]);

export type CrmPortalProposalAcceptance = typeof crmPortalProposalAcceptances.$inferSelect;

// ── Helpers shared by the API and its tests ─────────────────────────────────

/**
 * The customer-facing reference for a portal-raised request, derived from the
 * ticket's immutable id — same construction as `supportTicketReference`, so the
 * number a customer quotes is the number staff see.
 */
export function portalTicketReference(id: number): string {
  return `SUP-${String(id).padStart(5, "0")}`;
}

/**
 * Every portal payload that describes a document or an acceptance carries this.
 * One helper, so "not a signature" cannot drift into "signed" in one route.
 */
export function portalSignatureDisclosure(): {
  signatureStatus: typeof PORTAL_NOT_A_SIGNATURE;
  acceptanceIsNotASignature: true;
} {
  return { signatureStatus: PORTAL_NOT_A_SIGNATURE, acceptanceIsNotASignature: true };
}
