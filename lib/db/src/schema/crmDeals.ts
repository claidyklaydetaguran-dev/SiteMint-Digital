import { pgTable, serial, text, integer, timestamp, decimal, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const DEAL_STAGES = ["Lead", "Qualified", "Proposal", "Won", "Lost"] as const;
export type DealStage = typeof DEAL_STAGES[number];

export const crmDeals = pgTable("crm_deals", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id"),

  name: text("name").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).default("0").notNull(),
  stage: text("stage").default("Lead").notNull(),
  closeDate: date("close_date", { mode: "string" }),
  notes: text("notes"),
});

export const insertCrmDealSchema = createInsertSchema(crmDeals).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmDeal = z.infer<typeof insertCrmDealSchema>;
export type CrmDeal = typeof crmDeals.$inferSelect;
