import { pgTable, serial, integer, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { intakeFirms } from "./intakeAgent";

// ── provider_webhook_events ──────────────────────────────────────────────────
// Milestone 1 / Checkpoint C: idempotency ledger foundation only. No webhook
// route, signature verification, or provider parsing exists yet — this table
// is not written to or read from by any application code in this checkpoint.

export type ProviderWebhookPayload = Record<string, unknown>;

export const providerWebhookEvents = pgTable("provider_webhook_events", {
  id:           serial("id").primaryKey(),
  firmId:       integer("firm_id")
                  .notNull()
                  .references(() => intakeFirms.id, { onDelete: "cascade" }),
  provider:     text("provider").notNull(),
  eventKey:     text("event_key").notNull(),
  payload:      jsonb("payload").$type<ProviderWebhookPayload>().notNull(),
  processedAt:  timestamp("processed_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_provider_webhook_events_firm_id_created_at").on(table.firmId, table.createdAt),
  index("ix_provider_webhook_events_firm_id_processed_at").on(table.firmId, table.processedAt),
  uniqueIndex("uq_provider_webhook_events_provider_event_key").on(table.provider, table.eventKey),
]);

export const insertProviderWebhookEventSchema = createInsertSchema(providerWebhookEvents).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type ProviderWebhookEvent       = typeof providerWebhookEvents.$inferSelect;
export type InsertProviderWebhookEvent = z.infer<typeof insertProviderWebhookEventSchema>;
