import { pgTable, serial, text, integer, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const CRM_TASK_TYPES = [
  "Call", "Email", "Send Proposal", "Follow Up", "Check Website",
  "Ask for Decision", "Send Contract", "Project Task", "Other",
] as const;

export const CRM_TASK_STATUSES = ["pending", "completed", "overdue"] as const;

// ── What a due date MEANS ───────────────────────────────────────────────────
//
// `due_date` is a `timestamp with time zone`, so it always carries a clock
// time whether or not anybody chose one. The intent therefore cannot be read
// off the value, and the code used to guess: local midnight meant "a day",
// anything else meant "a moment".
//
// That guess fails in both directions. It cannot represent somebody who
// genuinely means "by 00:00 Friday" — they were silently given until Friday
// ended. And "does this look like midnight" is answered in the zone of
// whoever is asking, so one stored instant was a date for a colleague in
// Manila and a time for one in California. What the author meant is not a
// property of who is looking at it, so it is stored.

export const CRM_TASK_DUE_KINDS = ["date", "time"] as const;
export type CrmTaskDueKind = typeof CRM_TASK_DUE_KINDS[number];

/**
 * What to assume for a row that does not say.
 *
 * "date" rather than "time", for two reasons that agree. It is how every row
 * written before this column behaved for the common case — a bare date entered
 * through a date picker lands on local midnight, and the old rule called that
 * date-only. And of the two ways to be wrong, announcing a task as late one
 * minute into the day somebody has to do it is the louder and more annoying.
 */
export const CRM_TASK_DUE_KIND_FALLBACK: CrmTaskDueKind = "date";

export function isCrmTaskDueKind(value: unknown): value is CrmTaskDueKind {
  return typeof value === "string" && (CRM_TASK_DUE_KINDS as readonly string[]).includes(value);
}

/**
 * The stored kind, or the fallback — never a throw and never a silent `time`.
 *
 * Every read of `due_kind` goes through here so the legacy answer is decided in
 * ONE place with a name on it, rather than by whichever `??` happened to be
 * nearest. Rows written before the column existed, and rows from a client that
 * has not learned about it, both land here.
 */
export function resolveCrmTaskDueKind(stored: unknown): CrmTaskDueKind {
  return isCrmTaskDueKind(stored) ? stored : CRM_TASK_DUE_KIND_FALLBACK;
}

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

  /**
   * "date" (the day must END) or "time" (the instant must PASS) — see
   * `CRM_TASK_DUE_KINDS` above. NOT NULL with a default so every existing row
   * and every existing writer stays valid the moment the column appears; the
   * reviewed backfill in `docs/crm-ops/schema/M5-task-due-kind.sql` reclassifies
   * the rows that were behaving as timed.
   *
   * Nothing derives this from `due_date`. That was the defect.
   */
  dueKind: text("due_kind").default(CRM_TASK_DUE_KIND_FALLBACK).notNull(),

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

  // A third value would be a third meaning nothing implements, and the reader
  // would fall back to "date" without saying so. The database refuses it.
  check("ck_crm_tasks_due_kind", sql`${table.dueKind} IN ('date', 'time')`),
]);

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});

export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;
