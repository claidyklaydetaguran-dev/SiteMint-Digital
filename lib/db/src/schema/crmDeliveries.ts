// ── M4: reminder delivery records ───────────────────────────────────────────
//
// PUSH-MODE tables (`crm_*`), but applied from reviewed DDL rather than
// `drizzle-kit push` — see `docs/crm-ops/schema/M4-deliveries.sql`. Additive
// only: nothing existing is altered, and `crm_scheduled_jobs.external_ref` is
// left exactly as it is so its history survives.
//
// What this replaces. Delivery state used to be packed into
// `crm_scheduled_jobs.external_ref` as newline-separated
// `<state>|<runAt ISO>#<staffId>|<attemptId>|<detail>` text. That worked, but
// every question worth asking about it — "which recipient", "how many
// attempts", "which of these is still open", "give me the next page" — became
// a substring match over a text column, every write became a
// read-modify-write of the whole column, and the column had to be capped to
// stop it growing, which meant unresolved history could be discarded to make
// room. A row per (occurrence, recipient) makes all of that ordinary SQL and
// removes the cap: nothing unresolved is ever dropped.
//
// The occurrence identity rule, which is the whole point of the table:
// `occurrenceAt` is the job's ORIGINAL `run_at` and NEVER changes. A retry
// moves `nextAttemptAt`. Moving `run_at` — which the old operator retry did —
// silently turned a retry into a different occurrence with a different
// idempotency identity, i.e. an unprotected duplicate send.

import {
  pgTable, serial, text, integer, timestamp, index, unique, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { crmScheduledJobs } from "./crmOperations";

// ── The closed vocabulary ───────────────────────────────────────────────────

/**
 * Every state a delivery record can hold. Five, and no more — the check
 * constraint in the DDL is generated from this list, so adding a state here
 * without changing the constraint fails loudly at insert time rather than
 * quietly widening the machine.
 *
 *  - `pending`     nothing is in flight. Either nothing has been attempted, or
 *                  an attempt provably never reached the provider. `nextAttemptAt`
 *                  says whether the worker will pick it up (a time) or whether
 *                  it is waiting for a person (null).
 *  - `attempting`  a request is in flight, or the worker that started it died.
 *  - `accepted`    the provider took the message. The only machine-written
 *                  state that stops further sending.
 *  - `refused`     the provider looked at the message and said no — bad
 *                  address, unverified domain, a key without permission.
 *                  Deterministic, and nothing was delivered.
 *  - `uncertain`   bytes went out and we never learned the answer. It may or
 *                  may not have arrived. NEVER retried automatically.
 */
export const CRM_DELIVERY_STATES = [
  "pending", "attempting", "accepted", "refused", "uncertain",
] as const;
export type CrmDeliveryState = (typeof CRM_DELIVERY_STATES)[number];

/** States a person still has to deal with, once `resolvedAt` is null. */
export const CRM_DELIVERY_OPEN_STATES = ["attempting", "refused", "uncertain"] as const;

/**
 * How a person closed a case.
 *
 *  - `acknowledged` — closed deliberately without sending anything.
 *  - `resent`       — closed because an operator's NEW copy was accepted.
 *  - `accepted`     — closed because an operator's retry, carrying the ORIGINAL
 *                     idempotency key, was accepted.
 *
 * `resent` and `accepted` are written by the worker when a recovery-driven
 * attempt lands, attributed to the operator who asked for it.
 */
export const CRM_DELIVERY_RESOLUTIONS = ["acknowledged", "resent", "accepted"] as const;
export type CrmDeliveryResolution = (typeof CRM_DELIVERY_RESOLUTIONS)[number];

/** The three genuinely different things an operator can do about a delivery. */
export const CRM_DELIVERY_RECOVERY_ACTIONS = ["retry", "resend", "acknowledge"] as const;
export type CrmDeliveryRecoveryAction = (typeof CRM_DELIVERY_RECOVERY_ACTIONS)[number];

/**
 * Where the row came from.
 *
 *  - `live`                 written by this scheme.
 *  - `migrated`             carried over from a packed `external_ref` record
 *                           that parsed cleanly.
 *  - `migrated_unattributed` a pre-2026-09 dispatch marker, which never
 *                           recorded WHO it was for. It covers every recipient
 *                           of its occurrence rather than none of them.
 *  - `migrated_unparsed`    a line from `external_ref` that this scheme could
 *                           not confidently read. Preserved verbatim in
 *                           `legacyRaw` and held open for a person. Never
 *                           guessed at, never dropped.
 */
export const CRM_DELIVERY_ORIGINS = [
  "live", "migrated", "migrated_unattributed", "migrated_unparsed",
] as const;
export type CrmDeliveryOrigin = (typeof CRM_DELIVERY_ORIGINS)[number];

// The values are inlined as quoted literals, not bound. A CHECK constraint is
// DDL, which has no parameters: `sql\`${v}\`` rendered `IN ($1, $2)`, and
// `drizzle-kit push` failed on the first such table with "there is no parameter
// $1" (42P02) — leaving a fresh database with only the tables created before it.
// Every value here is a constant from this file, never input.
const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} IN (${sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "))})`;

// ── One record per (occurrence, recipient) ──────────────────────────────────

export const crmReminderDeliveries = pgTable("crm_reminder_deliveries", {
  id: serial("id").primaryKey(),

  /** The reminder this belongs to. */
  jobId: integer("job_id").notNull().references(() => crmScheduledJobs.id, { onDelete: "cascade" }),

  /**
   * The job's ORIGINAL `run_at` — the occurrence identity.
   *
   * This never changes. Not on a retry, not on a re-send, not when a recurring
   * job re-arms itself for its next occurrence. It is what stops yesterday's
   * record suppressing today's message and what keeps the idempotency key
   * stable across retries.
   */
  occurrenceAt: timestamp("occurrence_at", { withTimezone: true }).notNull(),

  /** Who the message was for: one of ours, or an address. Never both. */
  recipientStaffId: integer("recipient_staff_id"),
  recipientAddress: text("recipient_address"),

  /** The message itself, so a retry sends the same thing and can prove it. */
  subject: text("subject").notNull(),
  body: text("body").notNull(),

  /**
   * Stable across every retry of THIS delivery, so the provider collapses a
   * repeat into the original send. A deliberate re-send gets a NEW one,
   * because a re-send is a request for a second copy.
   *
   * Resend honours a key for 24 hours only. Past that it is inert and a retry
   * can genuinely duplicate — `docs/crm-ops/DELIVERY-GUARANTEE.md` §4.
   */
  idempotencyKey: text("idempotency_key").notNull(),

  state: text("state").notNull().default("pending"),
  attempt: integer("attempt").notNull().default(0),

  /**
   * When the worker may next attempt this — SEPARATE from `occurrenceAt`, and
   * the only thing a retry moves.
   *
   * Null means no automatic attempt is scheduled: either the delivery is
   * settled, or it is waiting for a person. The check constraint below keeps
   * that true by only allowing a time while the state is `pending`.
   */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),

  /** When the in-flight attempt was claimed, and by which worker. */
  attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }),
  attemptWorker: text("attempt_worker"),

  /** The provider's message id, on acceptance. */
  providerRef: text("provider_ref"),
  /** A short machine reason (`provider_refused`, `never_left_this_server`, …). */
  failureReason: text("failure_reason"),
  /** What the provider or the transport actually said. */
  failureDetail: text("failure_detail"),

  /** How many deliberate extra copies an operator has asked for. */
  resendCount: integer("resend_count").notNull().default(0),

  /** The last operator action, so the worker can attribute what it settles. */
  lastRecoveryAction: text("last_recovery_action"),
  lastRecoveryByStaffId: integer("last_recovery_by_staff_id"),
  lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),

  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByStaffId: integer("resolved_by_staff_id"),
  resolution: text("resolution"),
  resolutionNote: text("resolution_note"),

  origin: text("origin").notNull().default("live"),
  /** The packed `external_ref` line this row came from, kept verbatim. */
  legacyRaw: text("legacy_raw"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One occurrence + recipient has exactly one record.
  //
  // NULLS NOT DISTINCT is load-bearing rather than an edge case:
  // `recipient_address` is NULL on every staff row, and under PostgreSQL's
  // default NULLS DISTINCT two otherwise identical rows count as different, so
  // the rule would never fire on exactly the rows it exists to protect.
  //
  // It is a UNIQUE CONSTRAINT because drizzle-orm 0.45 can express NULLS NOT
  // DISTINCT only there, not on an index. Declared as a plain `uniqueIndex`
  // (until 2026-09-16), every push-built database got an index that never
  // fired: re-running the packed migration duplicated rows, and two racing
  // workers could both create one delivery. Databases built from
  // M4-deliveries.sql reach this same declaration through
  // docs/crm-ops/schema/M7-reminder-delivery-uniqueness.sql.
  unique("uq_crm_reminder_deliveries_occurrence")
    .on(table.jobId, table.occurrenceAt, table.recipientStaffId, table.recipientAddress)
    .nullsNotDistinct(),

  index("ix_crm_reminder_deliveries_job").on(table.jobId),
  // The unresolved list.
  index("ix_crm_reminder_deliveries_state_occurrence").on(table.state, table.occurrenceAt),
  // The worker's claim scan.
  index("ix_crm_reminder_deliveries_due").on(table.state, table.nextAttemptAt),

  check("ck_crm_reminder_deliveries_state", inList(table.state, CRM_DELIVERY_STATES)),
  check("ck_crm_reminder_deliveries_origin", inList(table.origin, CRM_DELIVERY_ORIGINS)),
  check("ck_crm_reminder_deliveries_resolution",
    sql`${table.resolution} IS NULL OR ${inList(table.resolution, CRM_DELIVERY_RESOLUTIONS)}`),
  check("ck_crm_reminder_deliveries_recovery_action",
    sql`${table.lastRecoveryAction} IS NULL
      OR ${inList(table.lastRecoveryAction, CRM_DELIVERY_RECOVERY_ACTIONS)}`),

  // A recipient is one of ours or one of theirs. The third case — nobody — is
  // allowed ONLY for records inherited from the packed column, because a
  // pre-2026-09 marker genuinely never said who it was for. Preserving that
  // honestly beats inventing a recipient for it.
  check("ck_crm_reminder_deliveries_recipient",
    sql`(${table.recipientStaffId} IS NOT NULL AND ${table.recipientAddress} IS NULL)
      OR (${table.recipientStaffId} IS NULL AND ${table.recipientAddress} IS NOT NULL)
      OR (${table.origin} <> 'live'
          AND ${table.recipientStaffId} IS NULL
          AND ${table.recipientAddress} IS NULL)`),

  // "An automatic attempt is scheduled" is only ever true of a pending row.
  check("ck_crm_reminder_deliveries_next_attempt",
    sql`${table.nextAttemptAt} IS NULL OR ${table.state} = 'pending'`),

  check("ck_crm_reminder_deliveries_attempt", sql`${table.attempt} >= 0`),
  check("ck_crm_reminder_deliveries_resend_count", sql`${table.resendCount} >= 0`),

  // A resolution and its timestamp are one fact; neither exists without the
  // other, so "resolved" can never be half-written.
  check("ck_crm_reminder_deliveries_resolved_pair",
    sql`(${table.resolvedAt} IS NULL) = (${table.resolution} IS NULL)`),
]);

export type CrmReminderDelivery = typeof crmReminderDeliveries.$inferSelect;
export type NewCrmReminderDelivery = typeof crmReminderDeliveries.$inferInsert;

// ── Who did what to a delivery, and why ─────────────────────────────────────
//
// Chosen over the existing `crm_admin_audit_log` deliberately. That log is the
// right home for "a privileged action happened" and both are written — but it
// cannot be the record of record here:
//
//  - its actor is a text blob (`staff:3 name@…`), not a staff id, so "show me
//    every recovery this person performed" is a LIKE query;
//  - it has no reason column at all, and a reason is the whole requirement;
//  - it has no delivery id, so the operator list could not show a row's
//    history without scanning free text;
//  - `recordStaffAudit()` deliberately swallows its own failures so an audit
//    problem never undoes the audited action. That is correct for an audit
//    trail and disqualifying for the row that proves a case was closed.
//
// This table is written in the same statement flow as the delivery change and
// is allowed to fail the request.

export const crmDeliveryRecoveryActions = pgTable("crm_delivery_recovery_actions", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull()
    .references(() => crmReminderDeliveries.id, { onDelete: "cascade" }),

  action: text("action").notNull(),
  /** Why the person did it. Required — an unexplained recovery is not a record. */
  reason: text("reason").notNull(),

  actorStaffId: integer("actor_staff_id"),
  actorLabel: text("actor_label").notNull(),

  /** The state the delivery was in when the action was taken. */
  previousState: text("previous_state").notNull(),
  previousIdempotencyKey: text("previous_idempotency_key"),
  /** Different from the previous one only for a re-send. */
  newIdempotencyKey: text("new_idempotency_key"),

  /**
   * The duplicate risk as it was explained to the operator at the time, in the
   * words they were shown. Recorded rather than recomputed, because the
   * 24-hour idempotency window moves and the record must say what they agreed
   * to, not what would be true today.
   */
  duplicateRisk: text("duplicate_risk"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_delivery_recovery_actions_delivery").on(table.deliveryId, table.id),
  index("ix_crm_delivery_recovery_actions_actor").on(table.actorStaffId, table.id),
  check("ck_crm_delivery_recovery_actions_action", inList(table.action, CRM_DELIVERY_RECOVERY_ACTIONS)),
  check("ck_crm_delivery_recovery_actions_reason", sql`length(btrim(${table.reason})) >= 3`),
]);

export type CrmDeliveryRecoveryActionRow = typeof crmDeliveryRecoveryActions.$inferSelect;
