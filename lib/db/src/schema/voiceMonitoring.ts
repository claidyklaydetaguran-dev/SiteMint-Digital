import { pgTable, serial, integer, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { intakeFirms } from "./intakeAgent";

// ── P7: staff review state, usage metering, and cap states ──────────────────
// Versioned-migration-only (voice domain journal).
//
// Calls themselves stay derived from provider_webhook_events (ADR: the
// event ledger is the truth; no calls table). These tables ride alongside
// that fold by (provider, call_id):
//   voice_call_reviews    — a human's disposition of one call. No row =
//                           pending review; a row is reviewed or flagged.
//   voice_usage_ledger    — IMMUTABLE, idempotent per-call duration rows.
//                           One row per (provider, call_id), written once,
//                           never updated; aggregation reads sum it.
//   voice_usage_cap_states — the recorded REQUEST to pause a firm that
//                           exceeded its included minutes. Recording is all
//                           P7 does: actually pausing a number or assistant
//                           is an owner-gated action, never automatic.

export const voiceCallReviews = pgTable("voice_call_reviews", {
  id:          serial("id").primaryKey(),
  firmId:      integer("firm_id")
                 .notNull()
                 .references(() => intakeFirms.id, { onDelete: "cascade" }),
  provider:    text("provider").notNull(),
  callId:      text("call_id").notNull(),
  reviewState: text("review_state").notNull(),
  /** Operator note. Never customer content — the call record holds that. */
  note:        text("note"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_call_reviews_call").on(table.firmId, table.provider, table.callId),
  index("ix_voice_call_reviews_firm_state").on(table.firmId, table.reviewState),
  check("ck_voice_call_reviews_state", sql`${table.reviewState} IN ('reviewed', 'flagged')`),
  check("ck_voice_call_reviews_note_length", sql`${table.note} IS NULL OR char_length(${table.note}) <= 500`),
]);

export type VoiceCallReview = typeof voiceCallReviews.$inferSelect;

export const voiceUsageLedger = pgTable("voice_usage_ledger", {
  id:          serial("id").primaryKey(),
  firmId:      integer("firm_id")
                 .notNull()
                 .references(() => intakeFirms.id, { onDelete: "cascade" }),
  provider:    text("provider").notNull(),
  callId:      text("call_id").notNull(),
  durationSec: integer("duration_sec").notNull(),
  /** Which pipeline wrote the row — the report itself or the backfill sweep. */
  source:      text("source").notNull(),
  /** Billing period the call lands in, e.g. '2026-08'. */
  periodYm:    text("period_ym").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** Present to satisfy the blanket voice-table rule; ledger rows are never updated. */
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_usage_ledger_call").on(table.provider, table.callId),
  index("ix_voice_usage_ledger_firm_period").on(table.firmId, table.periodYm),
  check("ck_voice_usage_ledger_duration", sql`${table.durationSec} >= 0 AND ${table.durationSec} <= 86400`),
  check("ck_voice_usage_ledger_source", sql`${table.source} IN ('end_of_call_report', 'reconciliation')`),
  check("ck_voice_usage_ledger_period_shape", sql`${table.periodYm} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

export type VoiceUsageLedgerRow = typeof voiceUsageLedger.$inferSelect;

export const voiceUsageCapStates = pgTable("voice_usage_cap_states", {
  id:                      serial("id").primaryKey(),
  firmId:                  integer("firm_id")
                             .notNull()
                             .references(() => intakeFirms.id, { onDelete: "cascade" }),
  periodYm:                text("period_ym").notNull(),
  capMinutes:              integer("cap_minutes").notNull(),
  usedSecondsAtDetection:  integer("used_seconds_at_detection").notNull(),
  state:                   text("state").notNull(),
  createdAt:               timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:               timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_voice_usage_cap_states_firm_period").on(table.firmId, table.periodYm),
  check("ck_voice_usage_cap_states_cap", sql`${table.capMinutes} > 0`),
  check("ck_voice_usage_cap_states_used", sql`${table.usedSecondsAtDetection} >= 0`),
  check("ck_voice_usage_cap_states_state", sql`${table.state} IN ('pause_requested', 'cleared')`),
  check("ck_voice_usage_cap_states_period_shape", sql`${table.periodYm} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

export type VoiceUsageCapState = typeof voiceUsageCapStates.$inferSelect;
