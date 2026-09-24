-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M5 Automation: the time-trigger sweep and durable events
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * one NEW table, crm_automation_events;
--   * one NEW column on crm_automation_rules, inactivity_days, NOT NULL with a
--     default, so every existing row is valid the moment it is added.
--
-- Nothing existing is altered, renamed, narrowed or dropped. No data is moved.
-- Safe to apply while the application is running: the new column has a default
-- and the new table has no dependents until the code that reads it is deployed.
--
-- The shape is defined in lib/db/src/schema/crmAutomation.ts and this file is
-- the same thing said in SQL.
--
-- ── The two things this closes ─────────────────────────────────────────────
--
-- 1. `task_overdue` and `no_activity_for_days` were declared triggers with no
--    producer. Nothing in the system ever evaluated them, so a rule using
--    either was silently dead. They are now produced by a periodic sweep that
--    rides the EXISTING crm_scheduled_jobs runner — same lease, same settle,
--    no second timer. `inactivity_days` is the per-rule silence window that
--    sweep needs and nothing previously carried.
--
-- 2. Business events were handed to the engine in memory by a fire-and-forget
--    call. A process that died between the business write and the emit lost the
--    event AND lost the fact that it had lost it. crm_automation_events makes
--    the event a row first, so a restarted worker finds the work waiting.
--
-- ── The constraint worth reading before applying it ────────────────────────
--
--   uq_crm_automation_events_occurrence
--     Two recordings of the same real occurrence — a double submit, a retried
--     request, two sweep workers on the same tick — collapse into ONE row
--     before any rule is looked at. A UNIQUE INDEX and not an application
--     check, because two concurrent writers that both "check first" both find
--     nothing.
--
-- The guarantee this buys is AT-LEAST-ONCE, not exactly-once: the row is
-- written after the business write and not inside its transaction, so a process
-- killed between the two still loses that event. What changes is that the
-- window shrinks from a whole rule evaluation to one INSERT, and that anything
-- which IS recorded is retried until it runs. Repeats are harmless because the
-- engine's uq_crm_automation_executions_occurrence refuses the second execution
-- for the same occurrence.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M5-automation-sweep.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M5-automation-sweep.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
--
-- Rollback (destroys recorded-but-unprocessed events, so drain first):
--   BEGIN;
--   DROP TABLE IF EXISTS crm_automation_events;
--   ALTER TABLE crm_automation_rules DROP COLUMN IF EXISTS inactivity_days;
--   COMMIT;
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The per-rule silence window ────────────────────────────────────────────
--
-- NOT NULL with a default rather than nullable: a nullable window would let a
-- `no_activity_for_days` rule sit enabled, look correct, and never fire because
-- nobody filled in the one number it needed. Fourteen days is long enough that
-- an ordinary gap between touches does not trip it.

ALTER TABLE crm_automation_rules
  ADD COLUMN IF NOT EXISTS inactivity_days integer NOT NULL DEFAULT 14;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_crm_automation_rules_inactivity_days'
  ) THEN
    ALTER TABLE crm_automation_rules
      ADD CONSTRAINT ck_crm_automation_rules_inactivity_days
      -- A zero-day window would fire on every contact on every sweep; a window
      -- longer than a year is a report, not an automation.
      CHECK (inactivity_days >= 1 AND inactivity_days <= 365);
  END IF;
END $$;

-- ── The durable event log ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_automation_events (
  id                     serial PRIMARY KEY,
  trigger                text NOT NULL,

  record_type            text NOT NULL,
  record_id              integer NOT NULL,

  -- Frozen when the event is RECORDED, never re-derived at processing time: a
  -- record that changed in between would otherwise yield a different key and
  -- the retry would create a second execution.
  occurrence_key         text NOT NULL,

  payload                jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The loop-brake chain this event arrived on, carried through verbatim.
  chain_depth            integer NOT NULL DEFAULT 0,
  chain_rule_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  caused_by_execution_id integer,

  -- NULL means "every rule listening to this trigger". A silence event is about
  -- ONE window: a contact quiet for 7 days is not an occurrence of a rule that
  -- waits 30, so those events name the rules they are for.
  target_rule_ids        jsonb,

  source                 text NOT NULL DEFAULT 'producer',
  status                 text NOT NULL DEFAULT 'pending',

  attempts               integer NOT NULL DEFAULT 0,
  max_attempts           integer NOT NULL DEFAULT 10,
  next_attempt_at        timestamp with time zone NOT NULL DEFAULT now(),

  -- The worker lease, so a killed process does not strand an event.
  locked_at              timestamp with time zone,
  locked_by              text,

  processed_at           timestamp with time zone,
  cancelled_reason       text,
  last_error             text,

  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_automation_events_status CHECK (status IN (
    'pending', 'processing', 'processed', 'cancelled', 'failed')),
  CONSTRAINT ck_crm_automation_events_source CHECK (source IN (
    'producer', 'sweep', 'manual')),
  CONSTRAINT ck_crm_automation_events_record_type CHECK (record_type IN (
    'lead', 'deal', 'task', 'appointment', 'document_request', 'message')),
  CONSTRAINT ck_crm_automation_events_attempts CHECK (attempts >= 0 AND max_attempts >= 1),
  -- A cancelled event must say what called it off, for the same reason a
  -- stopped execution must: otherwise "cancelled" and "we lost it" look
  -- identical in the history.
  CONSTRAINT ck_crm_automation_events_cancel_needs_reason CHECK (
    status <> 'cancelled' OR cancelled_reason IS NOT NULL)
);

-- THE collapse. One row per real occurrence, whoever records it and however
-- many times they record it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_events_occurrence
  ON crm_automation_events (trigger, record_type, record_id, occurrence_key);

-- The worker's own query: what is due.
CREATE INDEX IF NOT EXISTS ix_crm_automation_events_due
  ON crm_automation_events (status, next_attempt_at);

-- "What has been announced about this record" — asked with a record open.
CREATE INDEX IF NOT EXISTS ix_crm_automation_events_record
  ON crm_automation_events (record_type, record_id, id);

COMMIT;
