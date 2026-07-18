import { pgTable, serial, integer, text, jsonb, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intakeFirms } from "./intakeAgent";

// ── voice_issues ─────────────────────────────────────────────────────────────
// Milestone 1 / Checkpoint C: schema foundation only. No issue API,
// notification behavior, or provider behavior exists yet.

export type VoiceIssueContext = Record<string, unknown>;

export const voiceIssues = pgTable("voice_issues", {
  id:          serial("id").primaryKey(),
  firmId:      integer("firm_id")
                 .notNull()
                 .references(() => intakeFirms.id, { onDelete: "cascade" }),
  level:       text("level").notNull(),
  code:        text("code").notNull(),
  message:     text("message").notNull(),
  context:     jsonb("context").$type<VoiceIssueContext>().notNull().default({}),
  resolvedAt:  timestamp("resolved_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_voice_issues_firm_id_resolved_at").on(table.firmId, table.resolvedAt),
  index("ix_voice_issues_firm_id_created_at").on(table.firmId, table.createdAt),
  index("ix_voice_issues_firm_id_code").on(table.firmId, table.code),
  check("ck_voice_issues_level", sql`${table.level} IN ('info', 'warning', 'error', 'critical')`),
]);

export const insertVoiceIssueSchema = createInsertSchema(voiceIssues).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type VoiceIssue       = typeof voiceIssues.$inferSelect;
export type InsertVoiceIssue = z.infer<typeof insertVoiceIssueSchema>;
