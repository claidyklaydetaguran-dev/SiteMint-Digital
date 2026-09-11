import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M2: Operations, My Day, reminders and notifications ─────────────────────
//
// PUSH-MODE tables (shared barrel), additive only — nothing existing is
// altered here. Per docs/ai-receptionist/INTEGRATION_OWNERSHIP.md the
// integration owner runs every push; this file ships the shape.
//
// The design rule throughout: there is ONE task system. Milestones, updates,
// comments, attachments and approvals hang off records that already exist
// (crm_projects, crm_tasks, crm_leads, crm_deals) rather than duplicating them,
// so a task created in Operations, Sales or a project is the same row that
// appears in the assignee's My Day.

// ── Project milestones ──────────────────────────────────────────────────────

export const CRM_MILESTONE_STATUSES = ["pending", "in_progress", "done", "blocked"] as const;
export type CrmMilestoneStatus = (typeof CRM_MILESTONE_STATUSES)[number];

export const crmProjectMilestones = pgTable("crm_project_milestones", {
  id:          serial("id").primaryKey(),
  projectId:   integer("project_id").notNull(),
  title:       text("title").notNull(),
  description: text("description"),
  /** Date-only deadlines are stored as a date at the firm's local midnight. */
  dueDate:     timestamp("due_date", { withTimezone: true }),
  status:      text("status").notNull().default("pending"),
  /** Manual ordering within a project; ties broken by id. */
  orderIndex:  integer("order_index").notNull().default(0),
  /** A milestone may depend on an earlier milestone in the same project. */
  dependsOnMilestoneId: integer("depends_on_milestone_id"),
  blockedReason: text("blocked_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByStaffId: integer("completed_by_staff_id"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_project_milestones_project").on(table.projectId, table.orderIndex),
  index("ix_crm_project_milestones_due").on(table.dueDate),
  check("ck_crm_project_milestones_status",
    sql`${table.status} IN ('pending', 'in_progress', 'done', 'blocked')`),
]);

export type CrmProjectMilestone = typeof crmProjectMilestones.$inferSelect;

// ── Dated work updates ──────────────────────────────────────────────────────
//
// "What happened, and who did it" — the running log an owner reads to catch up
// on a project. Distinct from crm_activities, which is lead-scoped.

export const crmProjectUpdates = pgTable("crm_project_updates", {
  id:            serial("id").primaryKey(),
  projectId:     integer("project_id").notNull(),
  body:          text("body").notNull(),
  /** Optional stage snapshot so the log explains movement, not just words. */
  stageAtUpdate: text("stage_at_update"),
  authorStaffId: integer("author_staff_id"),
  authorLabel:   text("author_label").notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_project_updates_project").on(table.projectId, table.createdAt),
]);

export type CrmProjectUpdate = typeof crmProjectUpdates.$inferSelect;

// ── Generic comments ────────────────────────────────────────────────────────
//
// One table for every commentable record. `isInternal` keeps staff-only
// discussion separate from anything a customer could ever be shown — the
// customer portal (final milestone) must be able to filter on it.

export const CRM_COMMENT_ENTITIES = ["project", "task", "lead", "deal", "ticket", "document"] as const;
export type CrmCommentEntity = (typeof CRM_COMMENT_ENTITIES)[number];

export const crmComments = pgTable("crm_comments", {
  id:            serial("id").primaryKey(),
  entityType:    text("entity_type").notNull(),
  entityId:      integer("entity_id").notNull(),
  body:          text("body").notNull(),
  isInternal:    boolean("is_internal").notNull().default(true),
  authorStaffId: integer("author_staff_id"),
  authorLabel:   text("author_label").notNull(),
  createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  editedAt:      timestamp("edited_at", { withTimezone: true }),
  deletedAt:     timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("ix_crm_comments_entity").on(table.entityType, table.entityId, table.createdAt),
  check("ck_crm_comments_entity_type",
    sql`${table.entityType} IN ('project', 'task', 'lead', 'deal', 'ticket', 'document')`),
]);

export type CrmComment = typeof crmComments.$inferSelect;

// ── Attachments ─────────────────────────────────────────────────────────────
//
// Metadata only. `storageKey` points at the configured private store; nothing
// is ever served from a public path, and downloads go through a permission
// check rather than an unguessable URL.

export const crmAttachments = pgTable("crm_attachments", {
  id:              serial("id").primaryKey(),
  entityType:      text("entity_type").notNull(),
  entityId:        integer("entity_id").notNull(),
  filename:        text("filename").notNull(),
  mimeType:        text("mime_type").notNull(),
  sizeBytes:       integer("size_bytes").notNull(),
  storageKey:      text("storage_key").notNull(),
  /** sha256 of the bytes, so a re-upload of the same file is detectable. */
  contentHash:     text("content_hash"),
  version:         integer("version").notNull().default(1),
  supersedesId:    integer("supersedes_id"),
  uploadedByStaffId: integer("uploaded_by_staff_id"),
  uploadedByLabel: text("uploaded_by_label").notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt:       timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("ix_crm_attachments_entity").on(table.entityType, table.entityId),
  check("ck_crm_attachments_size", sql`${table.sizeBytes} >= 0`),
]);

export type CrmAttachment = typeof crmAttachments.$inferSelect;

// ── Approvals ───────────────────────────────────────────────────────────────

export const CRM_APPROVAL_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type CrmApprovalStatus = (typeof CRM_APPROVAL_STATUSES)[number];

export const crmApprovals = pgTable("crm_approvals", {
  id:               serial("id").primaryKey(),
  entityType:       text("entity_type").notNull(),
  entityId:         integer("entity_id").notNull(),
  title:            text("title").notNull(),
  detail:           text("detail"),
  status:           text("status").notNull().default("pending"),
  requestedByStaffId: integer("requested_by_staff_id"),
  requestedByLabel: text("requested_by_label").notNull(),
  /** Null means "any owner may decide"; set to route it to one person. */
  approverStaffId:  integer("approver_staff_id"),
  decidedByStaffId: integer("decided_by_staff_id"),
  decidedAt:        timestamp("decided_at", { withTimezone: true }),
  decisionNote:     text("decision_note"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_approvals_entity").on(table.entityType, table.entityId),
  index("ix_crm_approvals_status").on(table.status, table.approverStaffId),
  check("ck_crm_approvals_status",
    sql`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled')`),
]);

export type CrmApproval = typeof crmApprovals.$inferSelect;

// ── Reusable project templates ──────────────────────────────────────────────

export interface TemplateTask { title: string; type?: string; dayOffset?: number; description?: string }
export interface TemplateMilestone { title: string; dayOffset?: number; description?: string }

export const crmProjectTemplates = pgTable("crm_project_templates", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  description: text("description"),
  projectType: text("project_type"),
  /** Day offsets are relative to the project start date when applied. */
  tasks:       jsonb("tasks").$type<TemplateTask[]>().notNull().default(sql`'[]'::jsonb`),
  milestones:  jsonb("milestones").$type<TemplateMilestone[]>().notNull().default(sql`'[]'::jsonb`),
  checklist:   jsonb("checklist").$type<{ label: string }[]>().notNull().default(sql`'[]'::jsonb`),
  createdByStaffId: integer("created_by_staff_id"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt:  timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("uq_crm_project_templates_name").on(table.name),
]);

export type CrmProjectTemplate = typeof crmProjectTemplates.$inferSelect;

// ── In-app notifications ────────────────────────────────────────────────────

export const crmNotifications = pgTable("crm_notifications", {
  id:         serial("id").primaryKey(),
  staffId:    integer("staff_id").notNull(),
  kind:       text("kind").notNull(),
  title:      text("title").notNull(),
  body:       text("body"),
  /** In-app destination, e.g. "/admin/crm/projects?id=12". Never an external URL. */
  href:       text("href"),
  entityType: text("entity_type"),
  entityId:   integer("entity_id"),
  readAt:     timestamp("read_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_notifications_staff").on(table.staffId, table.readAt, table.createdAt),
]);

export type CrmNotification = typeof crmNotifications.$inferSelect;

// ── Durable scheduled jobs (the reminder engine) ────────────────────────────
//
// A bell icon is not a reminder service. This table is what makes a reminder
// fire with every browser closed and survive a worker restart:
//
//  - `runAt` is absolute UTC, computed from the owner's IANA timezone at
//    scheduling time, so a 9am reminder is 9am where the person actually is.
//  - `dedupeKey` is UNIQUE. Re-scheduling the same reminder for the same task
//    cannot create a second dispatch, and a retry after a crash re-uses the row.
//  - `lockedAt`/`lockedBy` plus SELECT ... FOR UPDATE SKIP LOCKED let several
//    workers share the queue without handing the same job to two of them.
//  - `cancelledAt` is how a completed, reassigned or rescheduled task stops a
//    reminder that has not fired yet — the row is not deleted, so the history
//    of what was scheduled stays auditable.

export const CRM_JOB_STATUSES = [
  "pending", "running", "completed", "failed", "cancelled",
] as const;
export type CrmJobStatus = (typeof CRM_JOB_STATUSES)[number];

export const crmScheduledJobs = pgTable("crm_scheduled_jobs", {
  id:           serial("id").primaryKey(),
  kind:         text("kind").notNull(),
  /** Absolute UTC instant. Timezone conversion happens when this is computed. */
  runAt:        timestamp("run_at", { withTimezone: true }).notNull(),
  payload:      jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status:       text("status").notNull().default("pending"),
  attempts:     integer("attempts").notNull().default(0),
  maxAttempts:  integer("max_attempts").notNull().default(5),
  lockedAt:     timestamp("locked_at", { withTimezone: true }),
  lockedBy:     text("locked_by"),
  lastError:    text("last_error"),
  dedupeKey:    text("dedupe_key").notNull(),
  cancelledAt:  timestamp("cancelled_at", { withTimezone: true }),
  completedAt:  timestamp("completed_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_scheduled_jobs_dedupe_key").on(table.dedupeKey),
  index("ix_crm_scheduled_jobs_due").on(table.status, table.runAt),
  check("ck_crm_scheduled_jobs_status",
    sql`${table.status} IN ('pending', 'running', 'completed', 'failed', 'cancelled')`),
  check("ck_crm_scheduled_jobs_attempts",
    sql`${table.attempts} >= 0 AND ${table.attempts} <= ${table.maxAttempts}`),
]);

export type CrmScheduledJob = typeof crmScheduledJobs.$inferSelect;
export type NewCrmScheduledJob = typeof crmScheduledJobs.$inferInsert;
