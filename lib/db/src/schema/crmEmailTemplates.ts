import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crmEmailTemplates = pgTable("crm_email_templates", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  name: text("name").notNull(),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
});

export const insertCrmEmailTemplateSchema = createInsertSchema(crmEmailTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type InsertCrmEmailTemplate = z.infer<typeof insertCrmEmailTemplateSchema>;
export type CrmEmailTemplate = typeof crmEmailTemplates.$inferSelect;
