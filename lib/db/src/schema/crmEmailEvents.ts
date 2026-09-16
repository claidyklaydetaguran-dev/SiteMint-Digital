import {
  pgTable, serial, text, integer, timestamp, jsonb, index, unique, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Provider delivery and engagement events ─────────────────────────────────
//
// What the mail provider says happened to a message AFTER we handed it over.
//
// Until now the CRM recorded only its own half of a send: "the provider
// accepted this and gave it an id". That is the weakest true statement
// available — it is not delivery, and a bounce ten seconds later left no trace
// anywhere except a suppression row. Everything the provider knows afterwards
// (sent, delivered, delayed, bounced, complained, failed, suppressed, opened,
// clicked) arrives as a signed webhook, and this table is where every one of
// them is written down BEFORE anything is interpreted.
//
// Three properties, each chosen for a failure it prevents:
//
//  1. STORE THEN PROCESS. The row is written inside the webhook request, and
//     the interpretation (suppression, matching, upgrading an unknown local
//     outcome) happens against the stored row. A processing fault is therefore
//     retryable without asking the provider to send the event again — and the
//     provider's retry schedule is finite, so an event lost to a transient
//     database error would otherwise be lost for good.
//
//  2. ONE ROW PER DELIVERY ATTEMPT, keyed on `svix_id`. Resend retries
//     (immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h) and an operator can replay
//     a delivery from the dashboard. Without the unique key, one open would
//     become eight opens and every engagement figure built on top would be a
//     multiple of the truth rather than a measurement.
//
//  3. THE EVENTS ARE THE RECORD. Delivery state and engagement counts are
//     derived from these rows rather than materialised beside them, so a late
//     or out-of-order event cannot leave a stale summary behind: a `sent` that
//     arrives after its `delivered` changes nothing, because the answer is
//     recomputed from the facts each time it is asked for.
//
// `crm_ref` is the tag we put on the outbound message (`crm_ref=<kind>-<id>`)
// and the provider echoes back. It is what lets an event reach a record whose
// send outcome was UNCERTAIN — those sends never learned a provider id, so
// without the tag a `delivered` event for one of them could never be
// recognised as evidence that it did arrive.

/** Where an event is in its own processing, never in the mail's delivery. */
export const CRM_EMAIL_EVENT_STATES = [
  /** Verified and stored; not yet interpreted. */
  "received",
  /** A worker is interpreting it now (or the worker that was died). */
  "processing",
  /** Interpreted: effects applied, matches recorded. */
  "processed",
  /** Interpretation failed; the payload is intact and it can be retried. */
  "failed",
  /** Not an email event this system acts on. Kept as evidence, not acted on. */
  "ignored",
] as const;
export type CrmEmailEventState = (typeof CRM_EMAIL_EVENT_STATES)[number];

/**
 * Whether the event reached a record of ours.
 *
 * `unmatched` is a normal outcome, not an error: mail sent from another system
 * on the same domain, or a CRM record deleted since, produces events nobody
 * here owns. Recording that is how "we received 412 events and matched 408"
 * stays answerable.
 */
export const CRM_EMAIL_EVENT_MATCH_STATUSES = ["matched", "unmatched", "not_applicable"] as const;
export type CrmEmailEventMatchStatus = (typeof CRM_EMAIL_EVENT_MATCH_STATUSES)[number];

/** One CRM record an event was applied to. */
export interface CrmEmailEventMatch {
  kind: string;
  id: number;
  /** What changed, in the processor's own vocabulary. Empty when nothing did. */
  applied?: string[];
}

export const crmEmailProviderEvents = pgTable("crm_email_provider_events", {
  id: serial("id").primaryKey(),

  /** The `svix-id` header: one delivery attempt of one event. */
  svixId: text("svix_id").notNull(),
  /** `email.delivered`, `email.opened`, … exactly as the provider named it. */
  eventType: text("event_type").notNull(),

  /** `data.email_id` — the provider's id for the message this is about. */
  providerEmailId: text("provider_email_id"),
  /** Our own `crm_ref` tag, echoed back by the provider. */
  crmRef: text("crm_ref"),

  /** First `data.to`, lowercased. */
  recipient: text("recipient"),
  /** Domain of `data.from`, lowercased — engagement evidence is per domain. */
  senderDomain: text("sender_domain"),

  /**
   * When the event happened, from the payload's TOP-LEVEL `created_at`.
   *
   * Deliberately not `data.created_at`, which is when the EMAIL was created:
   * reading that as the event time stamps every open with the moment the
   * message was sent, which quietly destroys any question about when people
   * actually read things.
   */
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

  /** `data.click.link` for a click, so link-level counts need no re-parsing. */
  clickLink: text("click_link"),
  /** `Permanent` | `Transient` | `Undetermined` for a bounce. */
  bounceType: text("bounce_type"),
  /** The provider's own words for a bounce, failure or suppression. */
  detail: text("detail"),

  /** The verified payload, kept whole so an interpretation can be redone. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

  state: text("state").notNull().default("received"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  /** When processing may next be tried. Null means "as soon as convenient". */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  /** When the current `processing` claim was taken, so a dead worker's is reclaimable. */
  claimedAt: timestamp("claimed_at", { withTimezone: true }),

  matchStatus: text("match_status"),
  matchedRecords: jsonb("matched_records").$type<CrmEmailEventMatch[]>(),

  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (table) => [
  // The dedupe boundary: a retry or a replay of one event is one row.
  unique("uq_crm_email_provider_events_svix").on(table.svixId),

  // Every delivery-state and engagement read: "what is known about this email".
  index("ix_crm_email_provider_events_email").on(table.providerEmailId, table.eventType),
  // The tag path, for records that never learned a provider id.
  index("ix_crm_email_provider_events_ref").on(table.crmRef),
  // Reporting windows.
  index("ix_crm_email_provider_events_type_occurred").on(table.eventType, table.occurredAt),
  // The processing sweep.
  index("ix_crm_email_provider_events_work").on(table.state, table.nextAttemptAt),
  // "Has this sending domain ever recorded an open?" — the evidence question
  // that decides whether engagement is reported at all.
  index("ix_crm_email_provider_events_domain").on(table.senderDomain, table.eventType, table.occurredAt),

  // Vocabularies are written as literals rather than interpolated values: a
  // CHECK constraint cannot carry bind parameters, and a generated one that
  // does fails at `drizzle-kit push` time with "there is no parameter $1".
  check("ck_crm_email_provider_events_state",
    sql`${table.state} IN ('received', 'processing', 'processed', 'failed', 'ignored')`),
  check("ck_crm_email_provider_events_match",
    sql`${table.matchStatus} IS NULL OR ${table.matchStatus} IN ('matched', 'unmatched', 'not_applicable')`),
  check("ck_crm_email_provider_events_attempts", sql`${table.attempts} >= 0`),
]);

export type CrmEmailProviderEvent = typeof crmEmailProviderEvents.$inferSelect;
export type NewCrmEmailProviderEvent = typeof crmEmailProviderEvents.$inferInsert;
