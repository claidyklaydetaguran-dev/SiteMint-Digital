import { pgTable, serial, integer, text, jsonb, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intakeFirms } from "./intakeAgent";

// ── voice_assistants ─────────────────────────────────────────────────────────
// Milestone 1 / Checkpoint C: schema foundation only. Not yet wired to any
// route, provider integration, or the frontend. See docs/ai-receptionist/
// DATABASE_STRATEGY.md (ADR-05) and DECISION_LOG.md (2026-07-17 entries).

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
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_assistants_firm_id_status").on(table.firmId, table.status),
  index("ix_voice_assistants_firm_id_updated_at").on(table.firmId, table.updatedAt),
  // Partial unique index: only enforced once a provider connection exists.
  // A provider assistant ID is only unique within its own provider namespace,
  // not globally, so both columns are part of the constraint.
  uniqueIndex("uq_voice_assistants_provider_assistant_id")
    .on(table.provider, table.providerAssistantId)
    .where(sql`${table.provider} IS NOT NULL AND ${table.providerAssistantId} IS NOT NULL`),
  check("ck_voice_assistants_status", sql`${table.status} IN ('draft', 'published', 'error')`),
]);

export const insertVoiceAssistantSchema = createInsertSchema(voiceAssistants).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type VoiceAssistant       = typeof voiceAssistants.$inferSelect;
export type InsertVoiceAssistant = z.infer<typeof insertVoiceAssistantSchema>;
