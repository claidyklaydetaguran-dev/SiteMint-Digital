import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const CRM_TASK_TYPES = [
  "Call", "Email", "Send Proposal", "Follow Up", "Check Website",
  "Ask for Decision", "Send Contract", "Other",
] as const;

export const CRM_TASK_STATUSES = ["pending", "completed", "overdue"] as const;

export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  leadId: integer("lead_id").notNull(),
  type: text("type").default("Follow Up").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").default("pending").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: text("created_by").default("admin").notNull(),
});

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});

export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;
