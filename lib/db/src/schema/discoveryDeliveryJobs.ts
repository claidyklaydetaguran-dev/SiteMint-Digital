import { pgTable, uuid, integer, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { discoverySubmissions } from "./submissions";

// ── discovery_delivery_jobs ──────────────────────────────────────────────────
// Phase 2C.2B: schema foundation only (docs/sitemint-platform/
// DISCOVERY_FORM_HARDENING_PRD.md §17/§18/§26/§27/§28, three-table model
// adopted in Checkpoint 2C.2A.1). One row is one durable downstream delivery
// obligation, not one attempt-event — a retry updates attemptCount on the
// same row. No route, worker, or provider integration exists yet; no row is
// ever created by this checkpoint. This table is deliberately NOT exported
// from the shared push-scanned barrel (../index.ts) — it is reachable only
// through ./discovery/index.ts, the dedicated versioned-migration barrel, so
// `pnpm --filter @workspace/db run push` can never discover or alter it
// (same isolation the voice tables already rely on, see ADR-05 in
// docs/ai-receptionist/DATABASE_STRATEGY.md).

export const DISCOVERY_DELIVERY_JOB_TYPES = [
  "client_acknowledgment_email",
  "internal_notification_email",
  "crm_lead_upsert",
] as const;
export type DiscoveryDeliveryJobType = (typeof DISCOVERY_DELIVERY_JOB_TYPES)[number];

export const DISCOVERY_DELIVERY_JOB_STATUSES = [
  "pending",
  "processing",
  "retry_scheduled",
  "completed",
  "permanently_failed",
  "cancelled",
] as const;
export type DiscoveryDeliveryJobStatus = (typeof DISCOVERY_DELIVERY_JOB_STATUSES)[number];

export const discoveryDeliveryJobs = pgTable("discovery_delivery_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Rows are pure operational metadata about a submission's downstream
  // delivery; they have no independent meaning once their submission is
  // gone, so a submission deletion (e.g. a future retention purge) cascades
  // to its jobs rather than leaving them silently orphaned.
  submissionId: integer("submission_id")
    .notNull()
    .references(() => discoverySubmissions.id, { onDelete: "cascade" }),

  jobType: text("job_type").notNull(),
  status: text("status").default("pending").notNull(),

  // Passed to the downstream provider (email/CRM) as its own idempotency
  // token where supported — distinct from the (submissionId, jobType)
  // uniqueness below, which prevents duplicate *job rows*.
  idempotencyKey: text("idempotency_key"),

  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  providerMessageId: text("provider_message_id"),

  // Sanitized failure classification only — never a raw provider response
  // body, secret, stack trace, or the full form payload.
  lastErrorCode: text("last_error_code"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  // Each submission needs at most one row per job type by construction (the
  // transaction that creates the submission creates exactly one job row per
  // required job type) — this compound key is sufficient to prevent
  // duplicate job creation without a separate generated value.
  uniqueIndex("uq_discovery_delivery_jobs_submission_job_type").on(table.submissionId, table.jobType),
  // Supports future worker polling for pending/retry_scheduled rows without
  // a full-table scan.
  index("ix_discovery_delivery_jobs_status_next_attempt_at").on(table.status, table.nextAttemptAt),
  index("ix_discovery_delivery_jobs_submission_id").on(table.submissionId),
  check(
    "ck_discovery_delivery_jobs_job_type",
    sql`${table.jobType} IN ('client_acknowledgment_email', 'internal_notification_email', 'crm_lead_upsert')`,
  ),
  check(
    "ck_discovery_delivery_jobs_status",
    sql`${table.status} IN ('pending', 'processing', 'retry_scheduled', 'completed', 'permanently_failed', 'cancelled')`,
  ),
]);

export const insertDiscoveryDeliveryJobSchema = createInsertSchema(discoveryDeliveryJobs, {
  jobType: z.enum(DISCOVERY_DELIVERY_JOB_TYPES),
  status: z.enum(DISCOVERY_DELIVERY_JOB_STATUSES),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscoveryDeliveryJob = z.infer<typeof insertDiscoveryDeliveryJobSchema>;
export type DiscoveryDeliveryJob = typeof discoveryDeliveryJobs.$inferSelect;
