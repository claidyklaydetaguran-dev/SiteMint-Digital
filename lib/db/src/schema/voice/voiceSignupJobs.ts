import { pgTable, serial, integer, text, jsonb, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "../intakeAgent";

// ── voice_signup_jobs ────────────────────────────────────────────────────────
// Durable post-registration work (owner directive 2026-09-10 §3): a new
// account must reach the private SiteMint CRM and receive its verification /
// welcome email even when the CRM write or the mail provider hiccups at the
// moment of signup. The signup handler only ENQUEUES; an in-process worker
// (api-server lib/signupPipeline) claims due rows with SKIP LOCKED and
// retries with backoff — the same lifecycle the certified
// discovery_delivery_jobs table uses.
//
// One row per (firm, kind), enforced by a unique index: a retried signup, a
// double-submitted form, or a re-verified email can never produce a second
// CRM record or a second welcome email THROUGH this table — the enqueue is
// ON CONFLICT DO NOTHING.
//
// `payload` carries what the signup form knew (full name, business name,
// phone, industry) so the job does not depend on how intake_firms flattens
// those fields. `result` records what actually happened (the CRM lead id,
// provider acceptance) — "accepted by the mail provider" is deliberately the
// strongest claim recorded; delivery is not observable from here.

export const VOICE_SIGNUP_JOB_KINDS = ["crm_link", "verification_email", "welcome_email"] as const;
export type VoiceSignupJobKind = (typeof VOICE_SIGNUP_JOB_KINDS)[number];

export const VOICE_SIGNUP_JOB_STATUSES = [
  "pending",
  "processing",
  "retry_scheduled",
  "completed",
  "permanently_failed",
  "cancelled",
] as const;
export type VoiceSignupJobStatus = (typeof VOICE_SIGNUP_JOB_STATUSES)[number];

export interface VoiceSignupJobPayload {
  fullName?: string;
  businessName?: string;
  phone?: string;
  industry?: string;
  email?: string;
}

export interface VoiceSignupJobResult {
  crmLeadId?: number;
  crmOutcome?: "created" | "linked" | "already_linked";
  emailAccepted?: boolean;
  [key: string]: unknown;
}

export const voiceSignupJobs = pgTable("voice_signup_jobs", {
  id:            serial("id").primaryKey(),
  firmId:        integer("firm_id")
                   .notNull()
                   .references(() => intakeFirms.id, { onDelete: "cascade" }),
  kind:          text("kind").notNull(),
  status:        text("status").notNull().default("pending"),
  attempts:      integer("attempts").notNull().default(0),
  maxAttempts:   integer("max_attempts").notNull().default(5),
  payload:       jsonb("payload").$type<VoiceSignupJobPayload>().notNull().default({}),
  result:        jsonb("result").$type<VoiceSignupJobResult>().notNull().default({}),
  lastError:     text("last_error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ux_voice_signup_jobs_firm_id_kind").on(table.firmId, table.kind),
  index("ix_voice_signup_jobs_status_next_attempt_at").on(table.status, table.nextAttemptAt),
  check("ck_voice_signup_jobs_kind", sql`${table.kind} IN ('crm_link', 'verification_email', 'welcome_email')`),
  check(
    "ck_voice_signup_jobs_status",
    sql`${table.status} IN ('pending', 'processing', 'retry_scheduled', 'completed', 'permanently_failed', 'cancelled')`,
  ),
  check("ck_voice_signup_jobs_attempts", sql`${table.attempts} >= 0 AND ${table.attempts} <= ${table.maxAttempts}`),
  check("ck_voice_signup_jobs_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("ck_voice_signup_jobs_result_object", sql`jsonb_typeof(${table.result}) = 'object'`),
]);

export type VoiceSignupJob = typeof voiceSignupJobs.$inferSelect;
export type NewVoiceSignupJob = typeof voiceSignupJobs.$inferInsert;
