import {
  pgTable, serial, text, integer, timestamp, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M4: Support — tickets, their thread, and the knowledge base ──────────────
//
// PUSH-MODE tables (shared barrel), additive only. Reviewed DDL lives in
// docs/crm-ops/schema/M4-support.sql.
//
// ── Why these are new tables and not columns on `helpdesk_tickets` ──────────
//
// The brief asked for the legacy helpdesk tables to be extended additively, and
// they were the right first candidate — they are the only tables in the repo
// with a thread-plus-assignment shape. Four facts decided against it:
//
//  1. `helpdesk_tickets.contact_id` is NOT NULL and points at
//     `helpdesk_contacts`, a contact universe separate from `crm_leads`. A CRM
//     ticket about a CRM contact could therefore only exist by either dropping
//     that NOT NULL (not additive) or by mirroring every contact into a shadow
//     table — duplicate customer records are the precise failure this CRM
//     exists to prevent.
//  2. `assignee_id` points at `helpdesk_agents`, not `crm_staff`. Assigning to
//     a staff member with a permission check needs a second column, and two
//     assignment columns that can disagree is a defect generator: the legacy
//     `PATCH /api/helpdesk/tickets/:id` writes `assignee_id` and would know
//     nothing about the CRM one.
//  3. The legacy routes stay (they must), and they are an unguarded bypass of
//     everything asked for here. `PATCH /api/helpdesk/tickets/:id` writes ANY
//     status with no state machine and no resolution reason.
//     `POST /api/helpdesk/tickets/:ticketId/messages` takes `authorName` from
//     the request BODY — a caller-chosen author — and carries an
//     `is_internal_note` boolean. Put CRM tickets in those rows and two columns
//     would independently claim to control customer visibility, which is
//     exactly the ambiguity the requirement forbids. Both legacy routes are
//     gated by `requireCrmAuth()` with no permission at all.
//  4. There is nothing to preserve: `helpdesk_tickets`, `helpdesk_messages` and
//     `helpdesk_contacts` are empty in both the test and preview databases, and
//     no UI in this repo calls those routes — only the Orval-generated client
//     references them.
//
// So the legacy tables and routes are left byte-for-byte alone, and Support
// owns its own three tables with its own guarantees.

// ── Vocabularies ────────────────────────────────────────────────────────────

/**
 * How urgent the ticket is. A closed list, so "how many urgent tickets are
 * open" is a countable question rather than a free-text guess.
 */
export const CRM_SUPPORT_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type CrmSupportPriority = (typeof CRM_SUPPORT_PRIORITIES)[number];

/**
 * Where a ticket is in its life.
 *
 *   new                  raised, nobody has picked it up
 *   open                 somebody is working it
 *   waiting_on_customer  we have replied and the ball is with them
 *   resolved             we believe it is done and have said why
 *   closed               filed away
 */
export const CRM_SUPPORT_STATUSES = [
  "new", "open", "waiting_on_customer", "resolved", "closed",
] as const;
export type CrmSupportStatus = (typeof CRM_SUPPORT_STATUSES)[number];

/**
 * The state machine, stated explicitly rather than left to whichever screen
 * happened to offer which button.
 *
 * Note that `resolved` and `closed` are NOT terminal. A customer who comes back
 * two days later must land on the SAME ticket with its whole history, not on a
 * new one — treating "done" as an end state is how a support history gets
 * scattered across four tickets that each tell a third of the story.
 */
export const CRM_SUPPORT_STATUS_TRANSITIONS: Record<CrmSupportStatus, readonly CrmSupportStatus[]> = {
  new:                 ["open", "waiting_on_customer", "resolved", "closed"],
  open:                ["waiting_on_customer", "resolved", "closed"],
  waiting_on_customer: ["open", "resolved", "closed"],
  resolved:            ["open", "closed"],
  closed:              ["open"],
};

/** Statuses that mean the ticket is still somebody's problem. */
export const CRM_SUPPORT_ACTIVE_STATUSES = ["new", "open", "waiting_on_customer"] as const;

/** Statuses that require a recorded resolution before they can be entered. */
export const CRM_SUPPORT_RESOLVED_STATUSES = ["resolved", "closed"] as const;

/**
 * Why a ticket ended. Closed vocabulary for the same reason `DEAL_LOST_REASONS`
 * is one: "we keep getting the same question" is only visible if the answers
 * can be counted. `resolutionNote` carries whatever else needs saying.
 */
export const CRM_SUPPORT_RESOLUTIONS = [
  "fixed",
  "answered",
  "workaround_provided",
  "duplicate",
  "not_reproducible",
  "withdrawn_by_customer",
  "no_response_from_customer",
  "out_of_scope",
  "other",
] as const;
export type CrmSupportResolution = (typeof CRM_SUPPORT_RESOLUTIONS)[number];

/** How the ticket reached us. */
export const CRM_SUPPORT_SOURCES = [
  "staff",            // somebody here raised it
  "service_request",  // the customer asked for something (see requestType)
  "email",
  "phone",
] as const;
export type CrmSupportSource = (typeof CRM_SUPPORT_SOURCES)[number];

/**
 * What a customer-raised service request is asking for.
 *
 * A service request is not a separate record that later becomes a ticket — it
 * IS a ticket, with `source = 'service_request'` and one of these types. A
 * pre-ticket table that converts one-to-one into a ticket would be an
 * indirection with no state of its own and two places to look for the same
 * request.
 */
export const CRM_SUPPORT_REQUEST_TYPES = [
  "content_change",
  "bug_report",
  "new_feature",
  "hosting_or_domain",
  "billing_question",
  "training_or_how_to",
  "access_request",
  "other",
] as const;
export type CrmSupportRequestType = (typeof CRM_SUPPORT_REQUEST_TYPES)[number];

/**
 * Who a message is for. There is deliberately NO default: every write must say
 * which of these it is, because there is no safe value to assume.
 *
 *   customer  part of the conversation with the customer
 *   internal  staff only — never appears on a customer-facing surface
 */
export const CRM_SUPPORT_VISIBILITIES = ["customer", "internal"] as const;
export type CrmSupportVisibility = (typeof CRM_SUPPORT_VISIBILITIES)[number];

/**
 * How a message came to exist. Mirrors `crm_messages.origin` exactly, including
 * `legacy`: a row whose author genuinely is not recorded stays unknown rather
 * than being guessed into a person.
 */
export const CRM_SUPPORT_MESSAGE_ORIGINS = ["staff", "customer", "automated", "legacy"] as const;
export type CrmSupportMessageOrigin = (typeof CRM_SUPPORT_MESSAGE_ORIGINS)[number];

/** A knowledge-base article is either a draft or published. Nothing else. */
export const CRM_KB_STATUSES = ["draft", "published"] as const;
export type CrmKbStatus = (typeof CRM_KB_STATUSES)[number];

// ── Tickets ─────────────────────────────────────────────────────────────────

/**
 * One customer problem, from the moment it is raised to the moment it is filed.
 *
 * There is no stored ticket number. The legacy helpdesk derived one from
 * `count(*)`, which hands two concurrent creates the same number; a ticket's
 * public reference here is derived from its immutable `id` at read time, so it
 * is unique by construction and cannot drift from the row it names.
 */
export const crmSupportTickets = pgTable("crm_support_tickets", {
  id:          serial("id").primaryKey(),
  subject:     text("subject").notNull(),
  /** The problem in the customer's own words, as it was first described. */
  description: text("description"),

  status:      text("status").notNull().default("new"),
  priority:    text("priority").notNull().default("normal"),
  source:      text("source").notNull().default("staff"),
  /** Set when `source = 'service_request'`; null otherwise. */
  requestType: text("request_type"),

  /**
   * Whose ticket this is. NOT NULL: a support ticket with no customer is not a
   * ticket, it is a note, and the CRM already has somewhere to put notes.
   *
   * No foreign key, matching every other `crm_*` table in this repo — adding
   * one here would change what happens when somebody deletes a contact, and
   * that is a decision about another team's route, not this table's.
   */
  leadId:      integer("lead_id").notNull(),
  /** The piece of work it is about, when it is about one. */
  projectId:   integer("project_id"),

  /** The staff member answerable for it. Null means nobody has picked it up. */
  assignedToStaffId: integer("assigned_to_staff_id"),
  assignedAt:        timestamp("assigned_at", { withTimezone: true }),

  /**
   * Who raised it here. Null with `openedByLabel` null means an import or a
   * row that predates attribution — it is never back-filled to whoever
   * happened to touch it next.
   */
  openedByStaffId: integer("opened_by_staff_id"),
  openedByLabel:   text("opened_by_label"),

  /**
   * When a human here first replied to the customer. Measured from the first
   * message with `visibility = 'customer'` and `origin = 'staff'` — an internal
   * note is not a response to anybody, and counting one would flatter the
   * number that matters most to a waiting customer.
   */
  firstResponseAt:       timestamp("first_response_at", { withTimezone: true }),
  lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
  lastStaffMessageAt:    timestamp("last_staff_message_at", { withTimezone: true }),

  resolvedAt:        timestamp("resolved_at", { withTimezone: true }),
  resolvedByStaffId: integer("resolved_by_staff_id"),
  /** From CRM_SUPPORT_RESOLUTIONS. A check constraint enforces its presence. */
  resolution:        text("resolution"),
  resolutionNote:    text("resolution_note"),
  closedAt:          timestamp("closed_at", { withTimezone: true }),

  /** Reopening is normal and is counted, not hidden. */
  reopenedAt:  timestamp("reopened_at", { withTimezone: true }),
  reopenCount: integer("reopen_count").notNull().default(0),

  /** The knowledge-base article that answers this, when one does. */
  kbArticleId: integer("kb_article_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // The queue's own order: newest first, keyset-paged on the immutable id.
  index("ix_crm_support_tickets_status_id").on(table.status, table.id),
  index("ix_crm_support_tickets_assignee_id").on(table.assignedToStaffId, table.id),
  index("ix_crm_support_tickets_priority_id").on(table.priority, table.id),
  index("ix_crm_support_tickets_lead").on(table.leadId),
  index("ix_crm_support_tickets_project").on(table.projectId),

  check("ck_crm_support_tickets_status",
    sql`${table.status} IN ('new', 'open', 'waiting_on_customer', 'resolved', 'closed')`),
  check("ck_crm_support_tickets_priority",
    sql`${table.priority} IN ('urgent', 'high', 'normal', 'low')`),
  check("ck_crm_support_tickets_source",
    sql`${table.source} IN ('staff', 'service_request', 'email', 'phone')`),
  check("ck_crm_support_tickets_request_type",
    sql`${table.requestType} IS NULL OR ${table.requestType} IN (
      'content_change', 'bug_report', 'new_feature', 'hosting_or_domain',
      'billing_question', 'training_or_how_to', 'access_request', 'other')`),
  check("ck_crm_support_tickets_resolution_value",
    sql`${table.resolution} IS NULL OR ${table.resolution} IN (
      'fixed', 'answered', 'workaround_provided', 'duplicate', 'not_reproducible',
      'withdrawn_by_customer', 'no_response_from_customer', 'out_of_scope', 'other')`),
  // "Resolution requires a reason", enforced by the database rather than by
  // whichever route happens to be careful. A ticket cannot sit in a finished
  // state without saying why it finished.
  check("ck_crm_support_tickets_resolution_required",
    sql`${table.status} NOT IN ('resolved', 'closed') OR ${table.resolution} IS NOT NULL`),
]);

export type CrmSupportTicket = typeof crmSupportTickets.$inferSelect;

// ── The thread ──────────────────────────────────────────────────────────────

/**
 * One entry in a ticket's thread — either part of the customer conversation or
 * a note nobody outside this office may ever see.
 *
 * `visibility` has no default, in the schema and in the API. The legacy
 * helpdesk's `is_internal_note boolean NOT NULL DEFAULT false` means a write
 * that forgets to say lands customer-side, which is the wrong way round for a
 * mistake to fall.
 */
export const crmSupportMessages = pgTable("crm_support_messages", {
  id:       serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),

  /** 'customer' | 'internal'. No default — see above. */
  visibility: text("visibility").notNull(),
  body:       text("body").notNull(),

  /**
   * The authenticated staff member who wrote this, when a person here did.
   * Null is meaningful and is not a gap to fill in later: a customer's own
   * message has no sender of ours, an automated message has no person behind
   * it, and an imported row genuinely does not record who wrote it. `origin`
   * says which of those it is.
   */
  sentByStaffId: integer("sent_by_staff_id"),
  /** Captured at write time so it survives a rename or a removed account. */
  sentByLabel:   text("sent_by_label"),
  origin:        text("origin").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_support_messages_ticket").on(table.ticketId, table.id),
  // The index the customer-visible projection reads, so filtering internal
  // notes out is an index scan rather than a filter somebody might forget.
  index("ix_crm_support_messages_visibility").on(table.ticketId, table.visibility, table.id),

  check("ck_crm_support_messages_visibility",
    sql`${table.visibility} IN ('customer', 'internal')`),
  check("ck_crm_support_messages_origin",
    sql`${table.origin} IN ('staff', 'customer', 'automated', 'legacy')`),
  // An internal note is ours by definition, so it can never be attributed to
  // the customer — that combination would be a note the customer "wrote" and
  // cannot see.
  check("ck_crm_support_messages_internal_is_ours",
    sql`${table.visibility} <> 'internal' OR ${table.origin} <> 'customer'`),
]);

export type CrmSupportMessage = typeof crmSupportMessages.$inferSelect;

// ── Knowledge base ──────────────────────────────────────────────────────────

/**
 * The answers worth writing down once.
 *
 * A draft is invisible to anything customer-facing; publishing is a deliberate
 * act with a timestamp, and the check constraint refuses a published article
 * that cannot say when it was published.
 */
export const crmKbArticles = pgTable("crm_kb_articles", {
  id:       serial("id").primaryKey(),
  /** URL-safe, unique, stable. What a ticket reply would link to. */
  slug:     text("slug").notNull(),
  title:    text("title").notNull(),
  body:     text("body").notNull(),
  category: text("category"),
  status:   text("status").notNull().default("draft"),

  authorStaffId: integer("author_staff_id"),
  authorLabel:   text("author_label"),
  /** Who last changed it, which is usually the question being asked. */
  updatedByStaffId: integer("updated_by_staff_id"),
  updatedByLabel:   text("updated_by_label"),

  publishedAt: timestamp("published_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_kb_articles_slug").on(table.slug),
  index("ix_crm_kb_articles_status_id").on(table.status, table.id),
  index("ix_crm_kb_articles_category").on(table.category),

  check("ck_crm_kb_articles_status", sql`${table.status} IN ('draft', 'published')`),
  check("ck_crm_kb_articles_published_at",
    sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`),
]);

export type CrmKbArticle = typeof crmKbArticles.$inferSelect;

// ── Helpers shared by the API and its tests ─────────────────────────────────

/** True when `next` is a move the state machine allows from `from`. */
export function isSupportTransitionAllowed(
  from: CrmSupportStatus,
  next: CrmSupportStatus,
): boolean {
  return (CRM_SUPPORT_STATUS_TRANSITIONS[from] as readonly string[]).includes(next);
}

/**
 * The public reference for a ticket, derived from its immutable id.
 *
 * Derived rather than stored so two concurrent creates cannot be handed the
 * same number, and so the reference can never disagree with the row it names.
 */
export function supportTicketReference(id: number): string {
  return `SUP-${String(id).padStart(5, "0")}`;
}
