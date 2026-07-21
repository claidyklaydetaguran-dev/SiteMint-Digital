import { pgTable, uuid, integer, text, timestamp, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { discoverySubmissions } from "./submissions";

// ── discovery_ai_briefs ──────────────────────────────────────────────────────
// Phase 2C.2B: schema foundation only (docs/sitemint-platform/
// DISCOVERY_FORM_HARDENING_PRD.md §18/§29, one-row-per-brief-*version* model
// finalized in Checkpoint 2C.2A.2). A retry for the same version updates the
// same row (attemptCount); a deliberate regeneration creates a new row
// (briefVersion + 1) — an older row's humanReviewStatus may become
// 'superseded', but it is never overwritten. Kept structurally separate from
// discoverySubmissions so AI-generated content can never overwrite, obscure,
// or be confused with the client's original answers. No route, worker, or AI
// provider integration exists yet; no row is ever created by this checkpoint.
// Deliberately NOT exported from the shared push-scanned barrel (../index.ts)
// — reachable only through ./discovery/index.ts, matching the isolation the
// voice tables already rely on (ADR-05, docs/ai-receptionist/
// DATABASE_STRATEGY.md).

export const DISCOVERY_AI_BRIEF_STATUSES = [
  "pending",
  "processing",
  "retry_scheduled",
  "generated",
  "permanently_failed",
  "cancelled",
] as const;
export type DiscoveryAiBriefStatus = (typeof DISCOVERY_AI_BRIEF_STATUSES)[number];

export const DISCOVERY_AI_BRIEF_HUMAN_REVIEW_STATUSES = [
  "pending_review",
  "approved",
  "changes_requested",
  "rejected",
  "superseded",
] as const;
export type DiscoveryAiBriefHumanReviewStatus = (typeof DISCOVERY_AI_BRIEF_HUMAN_REVIEW_STATUSES)[number];

export type DiscoveryAiBriefStructuredOutput = Record<string, unknown>;

export const discoveryAiBriefs = pgTable("discovery_ai_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Same rationale as discovery_delivery_jobs.submissionId: pure operational/
  // generated metadata, cascades with its submission rather than orphaning.
  submissionId: integer("submission_id")
    .notNull()
    .references(() => discoverySubmissions.id, { onDelete: "cascade" }),

  briefVersion: integer("brief_version").notNull(),
  promptVersion: text("prompt_version").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),

  status: text("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),

  // Sanitized failure classification only — never a raw provider response body.
  lastErrorCode: text("last_error_code"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),

  // AI-generated draft content only — never client-supplied answers restored
  // here. Always subordinate to, and labeled separately from, the client's
  // own formData on discoverySubmissions (PRD §7/§29).
  structuredOutput: jsonb("structured_output").$type<DiscoveryAiBriefStructuredOutput>(),

  humanReviewStatus: text("human_review_status").default("pending_review").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  // The process that creates a brief version does so exactly once per
  // version by construction — this compound key prevents duplicate rows
  // without a separate generated value, mirroring discovery_delivery_jobs.
  uniqueIndex("uq_discovery_ai_briefs_submission_brief_version").on(table.submissionId, table.briefVersion),
  index("ix_discovery_ai_briefs_status_next_attempt_at").on(table.status, table.nextAttemptAt),
  index("ix_discovery_ai_briefs_human_review_status").on(table.humanReviewStatus),
  index("ix_discovery_ai_briefs_submission_id").on(table.submissionId),
  check(
    "ck_discovery_ai_briefs_status",
    sql`${table.status} IN ('pending', 'processing', 'retry_scheduled', 'generated', 'permanently_failed', 'cancelled')`,
  ),
  check(
    "ck_discovery_ai_briefs_human_review_status",
    sql`${table.humanReviewStatus} IN ('pending_review', 'approved', 'changes_requested', 'rejected', 'superseded')`,
  ),
]);

export const insertDiscoveryAiBriefSchema = createInsertSchema(discoveryAiBriefs, {
  status: z.enum(DISCOVERY_AI_BRIEF_STATUSES),
  humanReviewStatus: z.enum(DISCOVERY_AI_BRIEF_HUMAN_REVIEW_STATUSES),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiscoveryAiBrief = z.infer<typeof insertDiscoveryAiBriefSchema>;
export type DiscoveryAiBrief = typeof discoveryAiBriefs.$inferSelect;
