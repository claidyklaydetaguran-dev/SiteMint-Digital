import { pgTable, serial, integer, text, jsonb, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "../intakeAgent";

// ── V5 PR-5: persistent onboarding progress ─────────────────────────────────
// Versioned-migration-only (voice domain journal, 0007). One row per firm,
// created lazily by the first GET /receptionist/onboarding. The receptionist
// identity IS the intake_firms row (frozen), so progress rides alongside it.
//
// `steps` is a JSON object keyed by step key:
//   { business: { status: "done", updatedAt: "<iso>" }, ... }
// The allowed step keys and statuses are validated in application code
// (artifacts/api-server/src/lib/voiceOnboarding/onboardingService.ts); the
// column keeps only the shape guard, so a future step can be added without
// a migration.

export const ONBOARDING_STEP_KEYS = [
  "business",
  "assistant",
  "prompt",
  "voice",
  "availability",
  "appointment_types",
  "calendar",
  "test_call",
  "phone_number",
  "review",
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export const ONBOARDING_STEP_STATUSES = ["pending", "done", "blocked"] as const;
export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export interface OnboardingStepState {
  status: OnboardingStepStatus;
  updatedAt: string;
}

export type OnboardingSteps = Partial<Record<OnboardingStepKey, OnboardingStepState>>;

export const voiceOnboardingStates = pgTable("voice_onboarding_states", {
  id:          serial("id").primaryKey(),
  firmId:      integer("firm_id")
                 .notNull()
                 .references(() => intakeFirms.id, { onDelete: "cascade" }),
  /** The step the hub should open next; null once complete or before any progress. */
  currentStep: text("current_step"),
  steps:       jsonb("steps").$type<OnboardingSteps>().notNull().default({}),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // UNIQUE on firm_id is also the firm index: one progress row per firm.
  uniqueIndex("uq_voice_onboarding_states_firm").on(table.firmId),
  check("ck_voice_onboarding_states_steps_object", sql`jsonb_typeof(${table.steps}) = 'object'`),
  check(
    "ck_voice_onboarding_states_current_step",
    sql`${table.currentStep} IS NULL OR ${table.currentStep} ~ '^[a-z_]{1,40}$'`,
  ),
]);

export type VoiceOnboardingState = typeof voiceOnboardingStates.$inferSelect;
