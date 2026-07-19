import { pgTable, serial, integer, text, jsonb, timestamp, uuid, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intakeFirms } from "./intakeAgent";

// ── voice_assistants ─────────────────────────────────────────────────────────
// Milestone 1 / Checkpoint C: schema foundation. Extended in Checkpoint E3B1
// with the publish lifecycle (status: draft | publishing | published | error |
// publish_uncertain) and atomic attempt-ownership fields (publishAttemptId,
// publishStartedAt). See docs/ai-receptionist/DATABASE_STRATEGY.md (ADR-05)
// and DECISION_LOG.md (2026-07-17 entries). Still not wired to any publish
// route or provider call — see lib/voicePublishing and lib/voiceAssistants
// (Checkpoint E3B1) for the repository primitives that read/write these
// columns under an atomic firm-scoped predicate.

export type VoiceAssistantConfig = Record<string, unknown>;

export const voiceAssistants = pgTable("voice_assistants", {
  id:                   serial("id").primaryKey(),
  firmId:               integer("firm_id")
                           .notNull()
                           .references(() => intakeFirms.id, { onDelete: "cascade" }),
  name:                 text("name").notNull(),
  templateKey:          text("template_key").notNull(),
  status:               text("status").notNull().default("draft"),
  provider:             text("provider"),
  providerAssistantId:  text("provider_assistant_id"),
  config:               jsonb("config").$type<VoiceAssistantConfig>().notNull().default({}),
  lastSyncedAt:         timestamp("last_synced_at", { withTimezone: true }),
  syncError:            text("sync_error"),
  // Checkpoint E3B1: atomic publish-attempt ownership. Both are non-null only
  // while status = 'publishing'; a claim is the only writer that can set them
  // from null, and finalize/error/uncertain are the only writers that clear
  // them back to null. publishAttemptId is server-generated (never supplied
  // by the browser) and is not a provider credential or provider identifier.
  publishAttemptId:     uuid("publish_attempt_id"),
  publishStartedAt:     timestamp("publish_started_at", { withTimezone: true }),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_assistants_firm_id_status").on(table.firmId, table.status),
  index("ix_voice_assistants_firm_id_updated_at").on(table.firmId, table.updatedAt),
  // Supports the stale-publishing-attempt sweep (status = 'publishing' AND
  // publish_started_at < cutoff) without a full-table scan.
  index("ix_voice_assistants_status_publish_started_at").on(table.status, table.publishStartedAt),
  // Partial unique index: only enforced once a provider connection exists.
  // A provider assistant ID is only unique within its own provider namespace,
  // not globally, so both columns are part of the constraint.
  uniqueIndex("uq_voice_assistants_provider_assistant_id")
    .on(table.provider, table.providerAssistantId)
    .where(sql`${table.provider} IS NOT NULL AND ${table.providerAssistantId} IS NOT NULL`),
  check(
    "ck_voice_assistants_status",
    sql`${table.status} IN ('draft', 'publishing', 'published', 'error', 'publish_uncertain')`,
  ),
  // sync_error is always a bounded, sanitized message/code — never a raw
  // provider response, stack trace, or customer prompt (see lib/voicePublishing/errors.ts).
  check(
    "ck_voice_assistants_sync_error_length",
    sql`${table.syncError} IS NULL OR char_length(${table.syncError}) <= 500`,
  ),
  // Per-status field invariants (Checkpoint E3B1 PART 5, corrected). Every
  // predicate here is an explicit IS NULL / IS NOT NULL check — never a bare
  // `= NULL` — so PostgreSQL's three-valued NULL logic can never silently
  // evaluate a branch to UNKNOWN and let an invalid row slip past a `false`
  // rejection. Non-empty (btrim <> '') checks are only ever combined with a
  // preceding IS NOT NULL check on the same column, never applied alone to a
  // possibly-null value. publish_uncertain supports both an unknown provider
  // identity (both columns null) and a known-complete identity (both columns
  // non-null, non-blank) but rejects a mismatched partial identity (exactly
  // one of the two populated).
  check(
    "ck_voice_assistants_publish_invariants",
    sql`
      (${table.status} = 'draft'
        AND ${table.provider} IS NULL
        AND ${table.providerAssistantId} IS NULL
        AND ${table.publishAttemptId} IS NULL
        AND ${table.publishStartedAt} IS NULL)
      OR (${table.status} = 'publishing'
        AND ${table.publishAttemptId} IS NOT NULL
        AND ${table.publishStartedAt} IS NOT NULL
        AND ${table.provider} IS NULL
        AND ${table.providerAssistantId} IS NULL
        AND ${table.syncError} IS NULL)
      OR (${table.status} = 'published'
        AND ${table.provider} IS NOT NULL
        AND btrim(${table.provider}) <> ''
        AND ${table.providerAssistantId} IS NOT NULL
        AND btrim(${table.providerAssistantId}) <> ''
        AND ${table.publishAttemptId} IS NULL
        AND ${table.publishStartedAt} IS NULL
        AND ${table.syncError} IS NULL)
      OR (${table.status} = 'error'
        AND ${table.provider} IS NULL
        AND ${table.providerAssistantId} IS NULL
        AND ${table.publishAttemptId} IS NULL
        AND ${table.publishStartedAt} IS NULL
        AND ${table.syncError} IS NOT NULL
        AND btrim(${table.syncError}) <> '')
      OR (${table.status} = 'publish_uncertain'
        AND ${table.publishAttemptId} IS NULL
        AND ${table.publishStartedAt} IS NULL
        AND ${table.syncError} IS NOT NULL
        AND btrim(${table.syncError}) <> ''
        AND (
          (${table.provider} IS NULL AND ${table.providerAssistantId} IS NULL)
          OR (
            ${table.provider} IS NOT NULL AND btrim(${table.provider}) <> ''
            AND ${table.providerAssistantId} IS NOT NULL AND btrim(${table.providerAssistantId}) <> ''
          )
        ))
    `,
  ),
]);

export const insertVoiceAssistantSchema = createInsertSchema(voiceAssistants).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type VoiceAssistant       = typeof voiceAssistants.$inferSelect;
export type InsertVoiceAssistant = z.infer<typeof insertVoiceAssistantSchema>;
