import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, unique,
} from "drizzle-orm/pg-core";

// ── Inbound email ───────────────────────────────────────────────────────────
//
// The CRM could send email and could receive Resend's *delivery events*
// (opened, clicked, bounced) for what it sent. Neither of those is an inbox: a
// client replying to us landed nowhere at all.
//
// Three facts from Resend's current documentation shape everything here:
//
//  1. The `email.received` webhook carries METADATA ONLY — no body, no
//     headers, no attachments. Content requires a second API call. So ingest
//     is two-phase, and the webhook must be acknowledged fast and the fetch
//     done durably.
//  2. Resend keeps inbound content for 30 DAYS. If the CRM does not store its
//     own copy at ingest, the message is gone. So we persist the body, not a
//     pointer to it.
//  3. There is no SPF/DKIM/spam verdict anywhere in the inbound API. The
//     `from` address is unauthenticated and must be treated as a claim, not an
//     identity. That is why correlation runs primarily on an unguessable
//     reply token we issued, and only falls back to the address.

/**
 * Every inbound webhook event, recorded before anything is interpreted.
 *
 * This is the deduplication boundary. Resend retries on failure (immediately,
 * 5s, 5m, 30m, 2h, 5h, 10h, 10h) and an operator can replay a delivered event
 * by hand from the dashboard, so the same message can arrive several times.
 * Two different unique keys are needed, because they catch different things:
 *
 *   svixId    the delivery attempt — catches automatic retries
 *   emailId   the message itself   — catches an operator replaying a delivery
 *             that already succeeded, which reuses the payload and so would
 *             otherwise create a second copy of a real customer email
 */
export const crmInboundEmailEvents = pgTable("crm_inbound_email_events", {
  id: serial("id").primaryKey(),
  /** The `svix-id` header. Unique per delivery attempt. */
  svixId: text("svix_id").notNull(),
  /** `data.email_id`. Unique per actual message. */
  emailId: text("email_id"),
  eventType: text("event_type").notNull(),

  /** 'received' | 'fetching' | 'stored' | 'failed' | 'ignored' */
  state: text("state").notNull().default("received"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),

  /** The raw webhook payload, kept so a failed interpretation can be retried. */
  payload: jsonb("payload").$type<Record<string, unknown>>(),

  /** Set once the message has been turned into a crm_messages row. */
  messageId: integer("message_id"),
  conversationId: integer("conversation_id"),

  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (table) => [
  unique("uq_crm_inbound_email_events_svix").on(table.svixId),
  // Partial uniqueness is not expressible here, and `email_id` is null for
  // payloads that never named one, so duplicates are caught in code against
  // this index rather than by a constraint that would reject those nulls.
  index("ix_crm_inbound_email_events_email").on(table.emailId),
  index("ix_crm_inbound_email_events_state").on(table.state, table.receivedAt),
]);

/**
 * Addresses we must not email, mirrored from the provider plus our own.
 *
 * Resend maintains a suppression list and exposes it over its API, so this is
 * a local mirror rather than the authority — it exists so a contact record can
 * show "unmailable" without a network round-trip on every render, and so a
 * send can be refused before it is attempted.
 *
 * `reason` follows the provider's vocabulary: bounce | complaint | manual.
 */
export const crmEmailSuppressions = pgTable("crm_email_suppressions", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  reason: text("reason").notNull(),
  /** 'permanent' | 'transient' | 'undetermined' for bounces. */
  bounceType: text("bounce_type"),
  detail: text("detail"),
  source: text("source").notNull().default("provider"),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }).defaultNow().notNull(),
  /** Set when the address is released, rather than deleting the history. */
  releasedAt: timestamp("released_at", { withTimezone: true }),
  releasedByStaffId: integer("released_by_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_crm_email_suppressions_address").on(table.address),
  index("ix_crm_email_suppressions_reason").on(table.reason),
]);

/**
 * Mail we received but could not attach to anything.
 *
 * The alternative to this table is dropping the message, which for a business
 * inbox is unacceptable: a real client writing from an address we do not
 * recognise would vanish. Everything lands somewhere, and anything ambiguous
 * lands here for a person to place.
 */
export const crmUnmatchedEmails = pgTable("crm_unmatched_emails", {
  id: serial("id").primaryKey(),
  emailId: text("email_id"),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  headers: jsonb("headers").$type<Record<string, unknown>>(),
  reason: text("reason").notNull(),
  /** 'pending' | 'attached' | 'discarded' */
  status: text("status").notNull().default("pending"),
  resolvedByStaffId: integer("resolved_by_staff_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  attachedConversationId: integer("attached_conversation_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_unmatched_emails_status").on(table.status, table.receivedAt),
]);

/**
 * Outbound email we have sent per conversation, for reply-loop protection.
 *
 * An auto-responder on the other end plus an auto-responder on ours is an
 * infinite loop that bills real money and spams a real person. Counting our
 * own sends per conversation per window is the cheap, reliable brake; header
 * heuristics (Auto-Submitted, Precedence: bulk) catch the polite cases but
 * cannot be relied on alone.
 */
export const crmEmailSendCounters = pgTable("crm_email_send_counters", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  sent: integer("sent").notNull().default(0),
  /** Set when the brake engaged, so it is visible rather than mysterious. */
  haltedAt: timestamp("halted_at", { withTimezone: true }),
  haltReason: text("halt_reason"),
}, (table) => [
  unique("uq_crm_email_send_counters_conv_window").on(table.conversationId, table.windowStart),
]);

export type CrmInboundEmailEvent = typeof crmInboundEmailEvents.$inferSelect;
export type CrmEmailSuppression = typeof crmEmailSuppressions.$inferSelect;
export type CrmUnmatchedEmail = typeof crmUnmatchedEmails.$inferSelect;
