import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M4: Workflow automation ─────────────────────────────────────────────────
//
// PUSH-MODE tables (shared barrel), additive only — nothing existing is
// altered. Reviewed DDL lives in docs/crm-ops/schema/M4-automation.sql.
//
// ── What this is, and what it is not ────────────────────────────────────────
//
// `artifacts/web-agency/src/lib/workflowEngine.ts` is a LOCKED, pure, in-browser
// module that answers "where is this lead in the standard sales sequence, and
// what should a person do next". It reads; it never writes; it has no schedule,
// no history, no idea that other leads exist, and its sequence is hard-coded.
// It is advice rendered on a screen.
//
// This is the other half: rules a person WRITES, that fire on real events,
// evaluate conditions against the record as it stands at execution time, take
// actions that change the database, and leave an auditable history of every
// run. The two are complementary and nothing here duplicates or supersedes
// workflowEngine — the automation queue screen keeps rendering its steps
// beside these rules.
//
// ── The failure mode that shaped the schema ─────────────────────────────────
//
// An automation that assigns tasks or sends notifications in a loop is the
// worst thing this feature can do: it is unbounded, it is visible to every
// member of staff, and it does not stop when the browser closes. Three
// independent brakes are therefore built into the DATA, not into whichever
// code path happens to be careful:
//
//   1. `uq_crm_automation_executions_occurrence` — the same rule cannot run
//      twice for the same (trigger, record, occurrence). The database refuses
//      it; application logic is the second line, not the first.
//   2. `chain_depth` — carried through the trigger payload from the action that
//      caused the next trigger, so a rule that re-enters itself (directly or
//      through another rule) counts its own hops and is stopped at the rule's
//      declared `max_chain_depth`.
//   3. A per-record, per-window execution cap. Depth cannot catch a loop whose
//      re-entry arrives as a fresh external event with depth 0; the cap can.
//
// ── Where execution happens ─────────────────────────────────────────────────
//
// On the existing durable runner (`crm_scheduled_jobs`, see
// `artifacts/api-server/src/lib/crmScheduler.ts`). There is no second timer:
// one execution is one queued job row, claimed with the same lease and
// SKIP LOCKED semantics, so a retry backoff, a worker restart and two workers
// racing all behave the way the reminder engine already behaves.

// ── Triggers ────────────────────────────────────────────────────────────────

/**
 * The closed trigger vocabulary. Closed on purpose: an open string here would
 * make "which rules fire when a deal is lost" an unanswerable question, and a
 * typo would produce a rule that silently never runs.
 */
export const CRM_AUTOMATION_TRIGGERS = [
  "lead_created",
  "lead_status_changed",
  "deal_stage_changed",
  "deal_won",
  "deal_lost",
  "task_overdue",
  "appointment_booked",
  "document_request_completed",
  "inbound_message_received",
  "no_activity_for_days",
] as const;
export type CrmAutomationTrigger = (typeof CRM_AUTOMATION_TRIGGERS)[number];

/**
 * The kinds of record a rule can be about. Conditions are field comparisons on
 * the triggering record, so the record type decides which fields exist.
 */
export const CRM_AUTOMATION_RECORD_TYPES = [
  "lead", "deal", "task", "appointment", "document_request", "message",
] as const;
export type CrmAutomationRecordType = (typeof CRM_AUTOMATION_RECORD_TYPES)[number];

/**
 * Which record each trigger is about. One trigger, one record type — stated
 * here rather than inferred at each call site, so a rule's conditions can be
 * validated against the right field list when it is SAVED rather than
 * discovered to be nonsense when it first fires at 2am.
 */
export const CRM_AUTOMATION_TRIGGER_RECORD: Record<CrmAutomationTrigger, CrmAutomationRecordType> = {
  lead_created:               "lead",
  lead_status_changed:        "lead",
  deal_stage_changed:         "deal",
  deal_won:                   "deal",
  deal_lost:                  "deal",
  task_overdue:               "task",
  appointment_booked:         "appointment",
  document_request_completed: "document_request",
  inbound_message_received:   "message",
  no_activity_for_days:       "lead",
};

/**
 * The typed payload each trigger carries.
 *
 * `recordId` is always present and always identifies the record named by
 * `CRM_AUTOMATION_TRIGGER_RECORD`. The extra fields are the facts about the
 * event itself that the record can no longer tell you once it has moved on —
 * the status it came FROM, the reason a deal was lost, how many days of silence
 * were counted.
 */
export interface CrmAutomationTriggerPayloads {
  lead_created: { recordId: number };
  lead_status_changed: { recordId: number; from: string | null; to: string };
  deal_stage_changed: { recordId: number; from: string | null; to: string };
  deal_won: { recordId: number; leadId: number | null };
  deal_lost: { recordId: number; leadId: number | null; lostReason: string | null };
  task_overdue: { recordId: number; dueDate: string | null };
  appointment_booked: { recordId: number; leadId: number | null };
  document_request_completed: { recordId: number; entityType: string; entityId: number };
  inbound_message_received: { recordId: number; leadId: number | null; channel: string };
  no_activity_for_days: { recordId: number; days: number };
}

/**
 * The chain a trigger arrived on.
 *
 * This is the loop brake, and it lives in the PAYLOAD rather than in a variable
 * somewhere, because the whole problem is that the re-entry happens later, in a
 * different process, from a different job. `depth` is how many automation hops
 * produced this event; `ruleIds` is the actual path, so the history can say
 * "rule 7 → rule 9 → rule 7" instead of just "too deep".
 */
export interface CrmAutomationChain {
  depth: number;
  ruleIds: number[];
  /** The execution that caused this trigger, when an automation caused it. */
  causedByExecutionId?: number | null;
}

/** A trigger event as it is handed to the engine. */
export type CrmAutomationTriggerEvent = {
  [K in CrmAutomationTrigger]: {
    trigger: K;
    payload: CrmAutomationTriggerPayloads[K];
    /**
     * The identity of THIS occurrence of the event. Two emissions with the same
     * occurrence key are the same real-world event — a double submit, a retried
     * request, two workers racing — and the rule runs once for all of them.
     * Omitted, the engine derives one from the record's own `updated_at`, which
     * is the same value for every emission caused by one change and a different
     * value for the next change.
     */
    occurrenceKey?: string;
    chain?: CrmAutomationChain;
  };
}[CrmAutomationTrigger];

// ── Conditions ──────────────────────────────────────────────────────────────

/**
 * Field comparison operators. `is_empty` covers null, empty string and empty
 * array in one operator, because in this data all three mean "nobody filled
 * this in" and asking a user to know which one a column uses would be asking
 * them to know the schema.
 */
export const CRM_AUTOMATION_OPERATORS = [
  "equals", "not_equals", "contains", "greater_than", "less_than", "is_empty", "in_list",
] as const;
export type CrmAutomationOperator = (typeof CRM_AUTOMATION_OPERATORS)[number];

export interface CrmAutomationCondition {
  /** A field name on the triggering record, e.g. "status", "estimatedValue". */
  field: string;
  operator: CrmAutomationOperator;
  /** Ignored by `is_empty`; an array (or comma list) for `in_list`. */
  value?: unknown;
}

export const CRM_AUTOMATION_COMBINERS = ["and", "or"] as const;
export type CrmAutomationCombiner = (typeof CRM_AUTOMATION_COMBINERS)[number];

export interface CrmAutomationConditionGroup {
  combine: CrmAutomationCombiner;
  conditions: CrmAutomationCondition[];
}

export const EMPTY_CONDITION_GROUP: CrmAutomationConditionGroup = { combine: "and", conditions: [] };

// ── Actions ─────────────────────────────────────────────────────────────────

/**
 * What a rule may do.
 *
 * Every one of these writes to the CRM's own tables and NONE of them contacts a
 * customer. That is deliberate and is the answer to "can an automation email a
 * client by accident in development": it cannot, because no action type in this
 * vocabulary has an outbound channel. `notify` writes `crm_notifications`,
 * which is the in-app bell and nothing else. Adding an outbound action later is
 * a decision with its own review, not a config change.
 */
export const CRM_AUTOMATION_ACTION_TYPES = [
  "assign_owner",
  "create_task",
  "notify",
  "set_field",
  "add_note",
  "schedule_follow_up",
  "request_approval",
] as const;
export type CrmAutomationActionType = (typeof CRM_AUTOMATION_ACTION_TYPES)[number];

export interface CrmAutomationAction {
  type: CrmAutomationActionType;
  /** Per-type settings; validated against the type when the rule is saved. */
  config: Record<string, unknown>;
  /**
   * When set, a named person must approve before this action runs. The
   * execution parks at `awaiting_approval` until they decide, and a rejection
   * stops the whole run with the reason recorded.
   */
  approverStaffId?: number | null;
}

// ── Execution states ────────────────────────────────────────────────────────

/**
 * Where an execution is.
 *
 *   queued             created, waiting for the runner
 *   running            a worker holds it
 *   completed          it finished — whether or not the conditions matched
 *   failed             an action did not succeed and nothing more will be tried
 *   stopped            a stop condition, a rejection, or a loop brake halted it
 *   awaiting_approval  parked on a named approver
 */
export const CRM_AUTOMATION_EXECUTION_STATUSES = [
  "queued", "running", "completed", "failed", "stopped", "awaiting_approval",
] as const;
export type CrmAutomationExecutionStatus = (typeof CRM_AUTOMATION_EXECUTION_STATUSES)[number];

/** The four states an execution can come to rest in. */
export const CRM_AUTOMATION_FINAL_STATUSES = [
  "completed", "failed", "stopped", "awaiting_approval",
] as const;

/**
 * Whether the rule's conditions matched. `not_evaluated` is a real answer, not
 * a gap: an execution stopped by a loop brake never got as far as reading the
 * record, and recording "not matched" for it would be a lie.
 */
export const CRM_AUTOMATION_CONDITION_OUTCOMES = ["matched", "not_matched", "not_evaluated"] as const;
export type CrmAutomationConditionOutcome = (typeof CRM_AUTOMATION_CONDITION_OUTCOMES)[number];

/**
 * How one action ended.
 *
 *   succeeded          it did what it said
 *   skipped            it was not attempted (the run stopped before it)
 *   failed             it definitively did not happen — retrying cannot
 *                      duplicate anything
 *   unknown            it may or may not have happened. NEVER retried
 *                      automatically; stays visible until a person decides
 *   awaiting_approval  parked on a named approver
 *   rejected           the approver said no
 */
export const CRM_AUTOMATION_ACTION_STATUSES = [
  "succeeded", "skipped", "failed", "unknown", "awaiting_approval", "rejected",
] as const;
export type CrmAutomationActionStatus = (typeof CRM_AUTOMATION_ACTION_STATUSES)[number];

/**
 * Why a run stopped. A closed list so "how often does the loop brake fire" is a
 * countable question rather than a string search through free text.
 */
export const CRM_AUTOMATION_STOP_REASONS = [
  "stop_condition",
  "approval_rejected",
  "chain_depth_exceeded",
  "rate_cap_exceeded",
  "rule_disabled",
  "record_missing",
] as const;
export type CrmAutomationStopReason = (typeof CRM_AUTOMATION_STOP_REASONS)[number];

export const CRM_AUTOMATION_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type CrmAutomationApprovalStatus = (typeof CRM_AUTOMATION_APPROVAL_STATUSES)[number];

// ── Defaults ────────────────────────────────────────────────────────────────

/** Automation hops before a rule is stopped. Three is enough for A→B→C. */
export const AUTOMATION_DEFAULT_MAX_CHAIN_DEPTH = 3;
/** Executions of one rule against one record inside the window. */
export const AUTOMATION_DEFAULT_WINDOW_CAP = 5;
export const AUTOMATION_DEFAULT_WINDOW_MINUTES = 60;
/** Attempts for an action that definitively failed, before it stops visibly. */
export const AUTOMATION_DEFAULT_MAX_ACTION_ATTEMPTS = 3;

// ── Rules ───────────────────────────────────────────────────────────────────

export const crmAutomationRules = pgTable("crm_automation_rules", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  description: text("description"),

  /** From CRM_AUTOMATION_TRIGGERS. A check constraint enforces the vocabulary. */
  trigger:     text("trigger").notNull(),
  /** Disabled rules keep their history; they simply stop matching new events. */
  enabled:     boolean("enabled").notNull().default(true),

  conditions:     jsonb("conditions").$type<CrmAutomationConditionGroup>()
    .notNull().default(sql`'{"combine":"and","conditions":[]}'::jsonb`),
  /**
   * Conditions that HALT the rule. Checked before the first action and again
   * before every subsequent one, so "the deal is now lost", "the contact
   * unsubscribed" or "a person completed the task" stops a run that is already
   * under way rather than only one that has not started.
   */
  stopConditions: jsonb("stop_conditions").$type<CrmAutomationConditionGroup>()
    .notNull().default(sql`'{"combine":"or","conditions":[]}'::jsonb`),
  actions:        jsonb("actions").$type<CrmAutomationAction[]>()
    .notNull().default(sql`'[]'::jsonb`),

  /** Loop brake 2: automation hops allowed before this rule is stopped. */
  maxChainDepth:       integer("max_chain_depth").notNull().default(AUTOMATION_DEFAULT_MAX_CHAIN_DEPTH),
  /** Loop brake 3: executions per record per window. */
  windowCap:           integer("window_cap").notNull().default(AUTOMATION_DEFAULT_WINDOW_CAP),
  windowMinutes:       integer("window_minutes").notNull().default(AUTOMATION_DEFAULT_WINDOW_MINUTES),
  /** Retry budget for an action that definitively failed. */
  maxActionAttempts:   integer("max_action_attempts").notNull().default(AUTOMATION_DEFAULT_MAX_ACTION_ATTEMPTS),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel:   text("created_by_label"),
  updatedByStaffId: integer("updated_by_staff_id"),

  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  /** Soft delete: a deleted rule's history must survive the rule. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  // "Which enabled rules listen for this trigger" — the query every emission runs.
  index("ix_crm_automation_rules_trigger").on(table.trigger, table.enabled),
  index("ix_crm_automation_rules_archived").on(table.archivedAt),

  check("ck_crm_automation_rules_trigger", sql`${table.trigger} IN (
    'lead_created', 'lead_status_changed', 'deal_stage_changed', 'deal_won', 'deal_lost',
    'task_overdue', 'appointment_booked', 'document_request_completed',
    'inbound_message_received', 'no_activity_for_days')`),
  // Every brake has a floor. A rule with depth 0 or a cap of 0 would be a rule
  // that can never run; a negative one would be a brake that is off.
  check("ck_crm_automation_rules_depth",
    sql`${table.maxChainDepth} >= 1 AND ${table.maxChainDepth} <= 10`),
  check("ck_crm_automation_rules_window_cap",
    sql`${table.windowCap} >= 1 AND ${table.windowCap} <= 500`),
  check("ck_crm_automation_rules_window_minutes",
    sql`${table.windowMinutes} >= 1 AND ${table.windowMinutes} <= 10080`),
  check("ck_crm_automation_rules_attempts",
    sql`${table.maxActionAttempts} >= 1 AND ${table.maxActionAttempts} <= 10`),
]);

export type CrmAutomationRule = typeof crmAutomationRules.$inferSelect;

// ── Executions ──────────────────────────────────────────────────────────────

/**
 * One run of one rule against one record, for one occurrence of one trigger.
 *
 * The unique index is the point of this table. Deduplication is NOT "the code
 * checks first" — two requests that both check first both find nothing. It is
 * the database refusing the second insert, which is true no matter how many
 * processes are racing.
 */
export const crmAutomationExecutions = pgTable("crm_automation_executions", {
  id:      serial("id").primaryKey(),
  ruleId:  integer("rule_id").notNull(),
  trigger: text("trigger").notNull(),

  recordType: text("record_type").notNull(),
  recordId:   integer("record_id").notNull(),
  /**
   * Which occurrence of the event this is — supplied by the emitter, or derived
   * from the record's own `updated_at`. Part of the unique key.
   */
  occurrenceKey: text("occurrence_key").notNull(),

  status:           text("status").notNull().default("queued"),
  conditionOutcome: text("condition_outcome").notNull().default("not_evaluated"),
  /** From CRM_AUTOMATION_STOP_REASONS when `status = 'stopped'`. */
  stopReason:       text("stop_reason"),
  /** Human-readable detail for a stop or a failure — always says which rule/record. */
  detail:           text("detail"),

  /** Loop brake: hops taken to reach this run, and the path that got here. */
  chainDepth:   integer("chain_depth").notNull().default(0),
  chainRuleIds: jsonb("chain_rule_ids").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  causedByExecutionId: integer("caused_by_execution_id"),

  triggerPayload: jsonb("trigger_payload").$type<Record<string, unknown>>()
    .notNull().default(sql`'{}'::jsonb`),

  /** Action-level retry accounting; the budget lives on the rule. */
  attempts:      integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),

  /** Set when a person pressed "run now" rather than an event causing it. */
  startedByStaffId: integer("started_by_staff_id"),

  startedAt:  timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // THE deduplication constraint. Application logic is the second line.
  uniqueIndex("uq_crm_automation_executions_occurrence")
    .on(table.ruleId, table.trigger, table.recordType, table.recordId, table.occurrenceKey),

  // History is queryable per rule AND per affected record — both are indexed,
  // because "what has this rule done" and "what has been done to this contact"
  // are both questions somebody asks with a record open in front of them.
  index("ix_crm_automation_executions_rule").on(table.ruleId, table.id),
  index("ix_crm_automation_executions_record").on(table.recordType, table.recordId, table.id),
  index("ix_crm_automation_executions_status").on(table.status, table.nextAttemptAt),
  // The window cap's own query: this rule, this record, since a cutoff.
  index("ix_crm_automation_executions_window").on(table.ruleId, table.recordId, table.createdAt),

  check("ck_crm_automation_executions_status", sql`${table.status} IN (
    'queued', 'running', 'completed', 'failed', 'stopped', 'awaiting_approval')`),
  check("ck_crm_automation_executions_condition", sql`${table.conditionOutcome} IN (
    'matched', 'not_matched', 'not_evaluated')`),
  check("ck_crm_automation_executions_stop_reason", sql`${table.stopReason} IS NULL OR ${table.stopReason} IN (
    'stop_condition', 'approval_rejected', 'chain_depth_exceeded', 'rate_cap_exceeded',
    'rule_disabled', 'record_missing')`),
  // A stopped run must say why. Without this, "stopped" is indistinguishable
  // from "we lost track of it".
  check("ck_crm_automation_executions_stop_needs_reason",
    sql`${table.status} <> 'stopped' OR ${table.stopReason} IS NOT NULL`),
  check("ck_crm_automation_executions_record_type", sql`${table.recordType} IN (
    'lead', 'deal', 'task', 'appointment', 'document_request', 'message')`),
  check("ck_crm_automation_executions_depth", sql`${table.chainDepth} >= 0`),
]);

export type CrmAutomationExecution = typeof crmAutomationExecutions.$inferSelect;

// ── Action runs ─────────────────────────────────────────────────────────────

/**
 * What each action actually did, and on which record.
 *
 * One row per (execution, action index), updated in place across retries, so
 * the count of action rows is the count of actions attempted and `attempts`
 * says how hard each was tried. `affected_record_type`/`affected_record_id`
 * record the thing that CHANGED — which is frequently not the triggering
 * record: a rule triggered by a deal can create a task, and the task is what
 * somebody will later want to trace back to this rule.
 */
export const crmAutomationActionRuns = pgTable("crm_automation_action_runs", {
  id:          serial("id").primaryKey(),
  executionId: integer("execution_id").notNull(),
  /** Position in the rule's action list, so order is reconstructable. */
  actionIndex: integer("action_index").notNull(),
  actionType:  text("action_type").notNull(),

  status:   text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  /** What it did, or why it did not. Never a stack trace, never a secret. */
  detail:   text("detail"),

  affectedRecordType: text("affected_record_type"),
  affectedRecordId:   integer("affected_record_id"),

  startedAt:  timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_crm_automation_action_runs_step").on(table.executionId, table.actionIndex),
  index("ix_crm_automation_action_runs_execution").on(table.executionId, table.actionIndex),
  index("ix_crm_automation_action_runs_affected")
    .on(table.affectedRecordType, table.affectedRecordId),

  check("ck_crm_automation_action_runs_status", sql`${table.status} IN (
    'succeeded', 'skipped', 'failed', 'unknown', 'awaiting_approval', 'rejected')`),
  check("ck_crm_automation_action_runs_type", sql`${table.actionType} IN (
    'assign_owner', 'create_task', 'notify', 'set_field', 'add_note',
    'schedule_follow_up', 'request_approval')`),
  check("ck_crm_automation_action_runs_attempts", sql`${table.attempts} >= 0`),
]);

export type CrmAutomationActionRun = typeof crmAutomationActionRuns.$inferSelect;

// ── Approvals ───────────────────────────────────────────────────────────────

/**
 * A named person's permission for one action of one execution.
 *
 * Kept here rather than in `crm_approvals` because that table's `entity_type`
 * check constraint is a closed list of business records (project, task, lead,
 * deal, ticket, document) and an automation step is none of those. Widening
 * somebody else's constraint to borrow their table would be the wrong kind of
 * reuse; this table carries the automation's own identity — execution, action
 * index — and the business record it is about.
 */
export const crmAutomationApprovals = pgTable("crm_automation_approvals", {
  id:          serial("id").primaryKey(),
  executionId: integer("execution_id").notNull(),
  ruleId:      integer("rule_id").notNull(),
  actionIndex: integer("action_index").notNull(),
  actionType:  text("action_type").notNull(),

  /** Who must decide. NOT NULL: "somebody should approve this" is not a queue. */
  approverStaffId: integer("approver_staff_id").notNull(),
  status:          text("status").notNull().default("pending"),

  /** What they are approving, in words, captured when it was requested. */
  summary:    text("summary").notNull(),
  recordType: text("record_type").notNull(),
  recordId:   integer("record_id").notNull(),

  decidedByStaffId: integer("decided_by_staff_id"),
  decidedAt:        timestamp("decided_at", { withTimezone: true }),
  /** Mandatory on a rejection — see the check constraint. */
  decisionReason:   text("decision_reason"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One approval per action, so a retry or a second worker cannot raise a
  // second request for the same step.
  uniqueIndex("uq_crm_automation_approvals_step").on(table.executionId, table.actionIndex),
  index("ix_crm_automation_approvals_pending").on(table.status, table.approverStaffId, table.id),
  index("ix_crm_automation_approvals_rule").on(table.ruleId, table.id),

  check("ck_crm_automation_approvals_status",
    sql`${table.status} IN ('pending', 'approved', 'rejected')`),
  // A rejection with no reason teaches nobody anything, and the person whose
  // automation was stopped deserves to know why.
  check("ck_crm_automation_approvals_reject_reason",
    sql`${table.status} <> 'rejected' OR ${table.decisionReason} IS NOT NULL`),
  check("ck_crm_automation_approvals_decided",
    sql`${table.status} = 'pending' OR ${table.decidedAt} IS NOT NULL`),
]);

export type CrmAutomationApproval = typeof crmAutomationApprovals.$inferSelect;

// ── Shared helpers (used by the API, the engine and their tests) ────────────

/** The fields a rule may compare, per record type. */
export const CRM_AUTOMATION_FIELDS: Record<CrmAutomationRecordType, readonly string[]> = {
  lead: [
    "status", "priority", "source", "serviceInterest", "assignedTo", "company",
    "email", "phone", "tags", "estimatedValue", "packageType", "proposalStatus",
    "sowStatus", "discoveryFormStatus", "smsOptOut", "notes",
  ],
  deal: ["stage", "value", "probability", "lostReason", "ownerStaffId", "name", "notes"],
  task: ["status", "type", "priority", "title", "assignedToStaffId", "blockedReason"],
  appointment: ["status", "title", "location", "organizerStaffId", "leadId"],
  document_request: ["status", "title", "entityType", "ownerStaffId"],
  message: ["direction", "channel", "status", "leadId"],
};

/** True when `field` is comparable on `recordType`. */
export function isAutomationField(recordType: CrmAutomationRecordType, field: string): boolean {
  return CRM_AUTOMATION_FIELDS[recordType].includes(field);
}

/**
 * Fields an automation may WRITE with `set_field`, per record type.
 *
 * Deliberately narrower than the readable list. An automation that can set any
 * column can set `email`, and a rule that quietly rewrites a customer's email
 * address is not a workflow, it is data loss. Money, identity and contact
 * details are not on this list.
 */
export const CRM_AUTOMATION_WRITABLE_FIELDS: Record<CrmAutomationRecordType, readonly string[]> = {
  lead: ["status", "priority", "serviceInterest", "assignedTo", "packageType",
    "proposalStatus", "sowStatus", "discoveryFormStatus"],
  deal: ["stage", "probability"],
  task: ["status", "priority", "blockedReason"],
  appointment: ["status", "location"],
  document_request: ["status"],
  message: [],
};

export function isAutomationWritableField(recordType: CrmAutomationRecordType, field: string): boolean {
  return CRM_AUTOMATION_WRITABLE_FIELDS[recordType].includes(field);
}

/**
 * Evaluates one condition against a record value.
 *
 * Pure, exported, and tested directly: the comparison semantics are the part a
 * rule author has to be able to predict, so they are one function rather than
 * scattered through the executor.
 */
export function evaluateAutomationCondition(condition: CrmAutomationCondition, actual: unknown): boolean {
  const { operator, value } = condition;

  const isEmpty = actual === null || actual === undefined || actual === ""
    || (Array.isArray(actual) && actual.length === 0);

  switch (operator) {
    case "is_empty":
      return isEmpty;
    case "equals":
      return sameScalar(actual, value);
    case "not_equals":
      return !sameScalar(actual, value);
    case "contains": {
      if (Array.isArray(actual)) return actual.some((v) => sameScalar(v, value));
      if (actual === null || actual === undefined) return false;
      return String(actual).toLowerCase().includes(String(value ?? "").toLowerCase());
    }
    case "greater_than": {
      const [a, b] = [toComparable(actual), toComparable(value)];
      return a !== null && b !== null && a > b;
    }
    case "less_than": {
      const [a, b] = [toComparable(actual), toComparable(value)];
      return a !== null && b !== null && a < b;
    }
    case "in_list": {
      const list = Array.isArray(value)
        ? value
        : String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (Array.isArray(actual)) return actual.some((v) => list.some((l) => sameScalar(v, l)));
      return list.some((l) => sameScalar(actual, l));
    }
    default:
      // An operator this build does not know must not silently pass. A rule
      // written by a newer version has to fail closed, not fire on everything.
      return false;
  }
}

/**
 * Scalar equality that does not care whether the database handed back `"60"` or
 * `60`. Numeric columns arrive as strings from `decimal`, and a rule author
 * comparing a deal value to 5000 means the number.
 */
function sameScalar(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "boolean" || typeof b === "boolean") {
    return toBool(a) === toBool(b);
  }
  const [na, nb] = [Number(a), Number(b)];
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na === nb;
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/** Numbers compare as numbers, dates as instants, everything else not at all. */
function toComparable(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * Evaluates a whole group against a record.
 *
 * An EMPTY group is true — a rule with no conditions fires on every occurrence
 * of its trigger, which is what "no conditions" plainly means. An empty `or`
 * group is true for the same reason: it is "no conditions", not "no match".
 */
export function evaluateAutomationConditions(
  group: CrmAutomationConditionGroup | null | undefined,
  record: Record<string, unknown>,
): boolean {
  const conditions = group?.conditions ?? [];
  if (conditions.length === 0) return true;
  const results = conditions.map((c) => evaluateAutomationCondition(c, record[c.field]));
  return group?.combine === "or" ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Whether a stop-condition group halts the run.
 *
 * Separate from `evaluateAutomationConditions` because the empty case is the
 * opposite: no stop conditions means nothing stops it, so an empty group must
 * be FALSE. Sharing one function and remembering to special-case the caller is
 * exactly how that gets inverted by somebody in six months.
 */
export function evaluateAutomationStopConditions(
  group: CrmAutomationConditionGroup | null | undefined,
  record: Record<string, unknown>,
): boolean {
  const conditions = group?.conditions ?? [];
  if (conditions.length === 0) return false;
  return evaluateAutomationConditions(group, record);
}
