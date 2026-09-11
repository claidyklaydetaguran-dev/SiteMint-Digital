import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const CRM_TASK_TYPES = [
  "Call", "Email", "Send Proposal", "Follow Up", "Check Website",
  "Ask for Decision", "Send Contract", "Project Task", "Other",
] as const;

export const CRM_TASK_STATUSES = ["pending", "completed", "overdue"] as const;

export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),

  // A task belongs to a lead and/or a delivery project. Both are optional so
  // project tasks can exist without a lead and vice-versa (reuses this single
  // table instead of a duplicate project_tasks table).
  leadId: integer("lead_id"),
  projectId: integer("project_id"),

  type: text("type").default("Follow Up").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").default("pending").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: text("created_by").default("admin").notNull(),

  // ── M2 additive columns (nullable, push-mode; nothing above is altered) ────
  //
  // `createdBy` above is free text and stays for historical rows. These carry
  // real staff ids so "who owns the next action" and "who completed this" have
  // answers the system can actually enforce and attribute.
  assignedToStaffId: integer("assigned_to_staff_id"),
  createdByStaffId: integer("created_by_staff_id"),
  completedByStaffId: integer("completed_by_staff_id"),

  /** High | Medium | Low. Null means unset rather than implicitly Medium. */
  priority: text("priority"),

  /**
   * When a reminder should fire, absolute UTC. Null means no reminder. The
   * scheduled job is keyed off the task id, so moving this reschedules rather
   * than duplicating.
   */
  remindAt: timestamp("remind_at", { withTimezone: true }),

  /** "none" | "daily" | "weekly" | "monthly". Null is treated as none. */
  recurrence: text("recurrence"),

  /** Set when work cannot proceed; surfaced in My Day as a waiting item. */
  blockedReason: text("blocked_reason"),

  /** Checklist items live with the task rather than in a separate table. */
  checklist: jsonb("checklist").$type<{ label: string; done: boolean }[]>().default(sql`'[]'::jsonb`),

  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  // My Day is "this person's open work, soonest first" — the query this serves.
  index("ix_crm_tasks_assignee_status_due").on(table.assignedToStaffId, table.status, table.dueDate),
  index("ix_crm_tasks_remind_at").on(table.remindAt),
]);

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});

export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;
