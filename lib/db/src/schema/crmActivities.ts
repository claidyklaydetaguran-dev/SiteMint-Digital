import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const CRM_ACTIVITY_TYPES = [
  "lead_created", "status_changed", "note_added", "email_sent",
  "task_created", "task_completed", "follow_up_changed",
  "sms_attempted", "field_updated", "lead_imported",
] as const;

export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdBy: text("created_by").default("admin").notNull(),
});

export type CrmActivity = typeof crmActivities.$inferSelect;
