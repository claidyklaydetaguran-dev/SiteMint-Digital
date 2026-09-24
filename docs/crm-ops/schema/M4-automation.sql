-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M4 Workflow automation
--
-- Reviewed schema change for the integration owner. Creates four new tables and
-- touches nothing existing: no existing table, column, index, constraint or row
-- is altered. Order-independent of the other M4 files.
--
-- The shape is defined in lib/db/src/schema/crmAutomation.ts and this file is
-- the same thing said in SQL. The three constraints worth reading before
-- applying it:
--
--   uq_crm_automation_executions_occurrence
--     The deduplication guarantee. The same rule cannot run twice for the same
--     (trigger, record, occurrence). This is a UNIQUE INDEX and not an
--     application check because two concurrent requests that both "check
--     first" both find nothing — only the database can refuse the second one.
--
--   ck_crm_automation_executions_stop_needs_reason
--     A stopped run must say why it stopped. Otherwise "stopped" and "we lost
--     track of it" look identical in the history.
--
--   ck_crm_automation_approvals_reject_reason
--     A rejection must carry a reason. The person whose automation was halted
--     is entitled to know who halted it and why.
--
-- The loop brakes (chain depth, per-record window cap) are columns on the rule
-- with CHECK constraints that keep them switched on: a rule cannot be saved
-- with depth 0 or a cap of 0, which would be a brake that is off.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M4-automation.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M4-automation.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Rules ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  description           text,

  trigger               text NOT NULL,
  enabled               boolean NOT NULL DEFAULT true,

  conditions            jsonb NOT NULL DEFAULT '{"combine":"and","conditions":[]}'::jsonb,
  -- Checked before the FIRST action and again before every subsequent one, so a
  -- deal that becomes lost mid-run stops the run rather than only preventing
  -- the next one.
  stop_conditions       jsonb NOT NULL DEFAULT '{"combine":"or","conditions":[]}'::jsonb,
  actions               jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Loop brake 2: automation hops allowed before this rule is stopped.
  max_chain_depth       integer NOT NULL DEFAULT 3,
  -- Loop brake 3: executions of this rule against one record inside the window.
  window_cap            integer NOT NULL DEFAULT 5,
  window_minutes        integer NOT NULL DEFAULT 60,
  -- Retry budget for an action that DEFINITIVELY failed.
  max_action_attempts   integer NOT NULL DEFAULT 3,

  created_by_staff_id   integer,
  created_by_label      text,
  updated_by_staff_id   integer,

  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),
  archived_at           timestamp with time zone,

  CONSTRAINT ck_crm_automation_rules_trigger CHECK (trigger IN (
    'lead_created', 'lead_status_changed', 'deal_stage_changed', 'deal_won', 'deal_lost',
    'task_overdue', 'appointment_booked', 'document_request_completed',
    'inbound_message_received', 'no_activity_for_days')),
  -- Every brake has a floor: a rule cannot be saved with the brake switched off.
  CONSTRAINT ck_crm_automation_rules_depth
    CHECK (max_chain_depth >= 1 AND max_chain_depth <= 10),
  CONSTRAINT ck_crm_automation_rules_window_cap
    CHECK (window_cap >= 1 AND window_cap <= 500),
  CONSTRAINT ck_crm_automation_rules_window_minutes
    CHECK (window_minutes >= 1 AND window_minutes <= 10080),
  CONSTRAINT ck_crm_automation_rules_attempts
    CHECK (max_action_attempts >= 1 AND max_action_attempts <= 10)
);

CREATE INDEX IF NOT EXISTS ix_crm_automation_rules_trigger
  ON crm_automation_rules (trigger, enabled);
CREATE INDEX IF NOT EXISTS ix_crm_automation_rules_archived
  ON crm_automation_rules (archived_at);

-- ── Executions ─────────────────────────────────────────────────────────────
--
-- One run of one rule against one record for one occurrence of one trigger.

CREATE TABLE IF NOT EXISTS crm_automation_executions (
  id                      serial PRIMARY KEY,
  rule_id                 integer NOT NULL,
  trigger                 text NOT NULL,

  record_type             text NOT NULL,
  record_id               integer NOT NULL,
  -- Supplied by the emitter, or derived from the record's own updated_at.
  occurrence_key          text NOT NULL,

  status                  text NOT NULL DEFAULT 'queued',
  condition_outcome       text NOT NULL DEFAULT 'not_evaluated',
  stop_reason             text,
  detail                  text,

  -- Loop brake 1: hops taken to reach this run, and the path that got here.
  chain_depth             integer NOT NULL DEFAULT 0,
  chain_rule_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  caused_by_execution_id  integer,

  trigger_payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

  attempts                integer NOT NULL DEFAULT 0,
  next_attempt_at         timestamp with time zone,

  started_by_staff_id     integer,

  started_at              timestamp with time zone,
  finished_at             timestamp with time zone,
  created_at              timestamp with time zone NOT NULL DEFAULT now(),
  updated_at              timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_automation_executions_status CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'stopped', 'awaiting_approval')),
  CONSTRAINT ck_crm_automation_executions_condition CHECK (condition_outcome IN (
    'matched', 'not_matched', 'not_evaluated')),
  CONSTRAINT ck_crm_automation_executions_stop_reason CHECK (stop_reason IS NULL OR stop_reason IN (
    'stop_condition', 'approval_rejected', 'chain_depth_exceeded', 'rate_cap_exceeded',
    'rule_disabled', 'record_missing')),
  -- A stopped run must say why.
  CONSTRAINT ck_crm_automation_executions_stop_needs_reason
    CHECK (status <> 'stopped' OR stop_reason IS NOT NULL),
  CONSTRAINT ck_crm_automation_executions_record_type CHECK (record_type IN (
    'lead', 'deal', 'task', 'appointment', 'document_request', 'message')),
  CONSTRAINT ck_crm_automation_executions_depth CHECK (chain_depth >= 0)
);

-- THE deduplication constraint. Application logic is the second line, not the
-- first: two racing requests both pass a "check first" and only one can win an
-- INSERT against this index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_executions_occurrence
  ON crm_automation_executions (rule_id, trigger, record_type, record_id, occurrence_key);

-- History is queryable per rule AND per affected record.
CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_rule
  ON crm_automation_executions (rule_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_record
  ON crm_automation_executions (record_type, record_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_status
  ON crm_automation_executions (status, next_attempt_at);
-- The window cap's own query: this rule, this record, since a cutoff.
CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_window
  ON crm_automation_executions (rule_id, record_id, created_at);

-- ── Action runs ────────────────────────────────────────────────────────────
--
-- One row per (execution, action index), updated in place across retries.
-- `affected_record_*` is the thing that CHANGED, which is frequently not the
-- triggering record — a deal-triggered rule that creates a task records the
-- task here, so the task can be traced back to the rule that made it.

CREATE TABLE IF NOT EXISTS crm_automation_action_runs (
  id                    serial PRIMARY KEY,
  execution_id          integer NOT NULL,
  action_index          integer NOT NULL,
  action_type           text NOT NULL,

  status                text NOT NULL,
  attempts              integer NOT NULL DEFAULT 0,
  detail                text,

  affected_record_type  text,
  affected_record_id    integer,

  started_at            timestamp with time zone,
  finished_at           timestamp with time zone,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_automation_action_runs_status CHECK (status IN (
    'succeeded', 'skipped', 'failed', 'unknown', 'awaiting_approval', 'rejected')),
  CONSTRAINT ck_crm_automation_action_runs_type CHECK (action_type IN (
    'assign_owner', 'create_task', 'notify', 'set_field', 'add_note',
    'schedule_follow_up', 'request_approval')),
  CONSTRAINT ck_crm_automation_action_runs_attempts CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_action_runs_step
  ON crm_automation_action_runs (execution_id, action_index);
CREATE INDEX IF NOT EXISTS ix_crm_automation_action_runs_execution
  ON crm_automation_action_runs (execution_id, action_index);
CREATE INDEX IF NOT EXISTS ix_crm_automation_action_runs_affected
  ON crm_automation_action_runs (affected_record_type, affected_record_id);

-- ── Approvals ──────────────────────────────────────────────────────────────
--
-- Not `crm_approvals`: that table's entity_type CHECK is a closed list of
-- business records and an automation step is none of them. Widening somebody
-- else's constraint to borrow their table would be the wrong kind of reuse.

CREATE TABLE IF NOT EXISTS crm_automation_approvals (
  id                  serial PRIMARY KEY,
  execution_id        integer NOT NULL,
  rule_id             integer NOT NULL,
  action_index        integer NOT NULL,
  action_type         text NOT NULL,

  -- NOT NULL: "somebody should approve this" is not a queue.
  approver_staff_id   integer NOT NULL,
  status              text NOT NULL DEFAULT 'pending',

  summary             text NOT NULL,
  record_type         text NOT NULL,
  record_id           integer NOT NULL,

  decided_by_staff_id integer,
  decided_at          timestamp with time zone,
  decision_reason     text,

  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_automation_approvals_status
    CHECK (status IN ('pending', 'approved', 'rejected')),
  -- A rejection with no reason teaches nobody anything.
  CONSTRAINT ck_crm_automation_approvals_reject_reason
    CHECK (status <> 'rejected' OR decision_reason IS NOT NULL),
  CONSTRAINT ck_crm_automation_approvals_decided
    CHECK (status = 'pending' OR decided_at IS NOT NULL)
);

-- One approval per action: a retry or a second worker cannot raise a second
-- request for the same step.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_approvals_step
  ON crm_automation_approvals (execution_id, action_index);
CREATE INDEX IF NOT EXISTS ix_crm_automation_approvals_pending
  ON crm_automation_approvals (status, approver_staff_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_automation_approvals_rule
  ON crm_automation_approvals (rule_id, id);

COMMIT;

-- ROLLBACK
--   BEGIN;
--   DROP TABLE IF EXISTS crm_automation_approvals;
--   DROP TABLE IF EXISTS crm_automation_action_runs;
--   DROP TABLE IF EXISTS crm_automation_executions;
--   DROP TABLE IF EXISTS crm_automation_rules;
--   COMMIT;
--
-- Rolling back destroys every automation rule and the whole execution history —
-- which is the only record of what the CRM did to its own data automatically.
-- Nothing else in the schema references these tables, so the drop is clean, but
-- it is not recoverable, and the side effects the rules already produced
-- (tasks, notifications, notes, field changes) stay behind with nothing left to
-- explain where they came from. Take a dump of the four tables first.
--
-- Queued automation jobs are rows in `crm_scheduled_jobs` with
-- kind = 'crm_automation'. After a rollback they reference executions that no
-- longer exist; the handler treats a missing execution as a no-op, so they
-- settle harmlessly. To clear them deliberately:
--   UPDATE crm_scheduled_jobs SET status = 'cancelled', cancelled_at = now()
--    WHERE kind = 'crm_automation' AND status IN ('pending', 'running');
