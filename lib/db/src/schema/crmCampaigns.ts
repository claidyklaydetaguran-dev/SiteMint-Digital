import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { crmLeads } from "./crmLeads";

// ── crm_campaigns ─────────────────────────────────────────────────────────────

export const crmCampaigns = pgTable("crm_campaigns", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // draft | ready | archived
  status: text("status").notNull().default("draft"),
});

export const insertCrmCampaignSchema = createInsertSchema(crmCampaigns).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCrmCampaign = z.infer<typeof insertCrmCampaignSchema>;
export type CrmCampaign = typeof crmCampaigns.$inferSelect;

// ── crm_campaign_recipients ───────────────────────────────────────────────────

export const crmCampaignRecipients = pgTable("crm_campaign_recipients", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),

  campaignId: integer("campaign_id")
    .notNull()
    .references(() => crmCampaigns.id, { onDelete: "cascade" }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),

  // selected | test_previewed | sent | skipped | failed
  status: text("status").notNull().default("selected"),

  discStyleUsed: text("disc_style_used"),
  personalizedSubject: text("personalized_subject"),
  personalizedBody: text("personalized_body"),
});

export const insertCrmCampaignRecipientSchema = createInsertSchema(crmCampaignRecipients).omit({
  id: true, createdAt: true,
});
export type InsertCrmCampaignRecipient = z.infer<typeof insertCrmCampaignRecipientSchema>;
export type CrmCampaignRecipient = typeof crmCampaignRecipients.$inferSelect;
