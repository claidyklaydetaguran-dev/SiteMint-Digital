-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M6 Automation: the operator record of a human recovery
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * one NEW table, crm_automation_recovery_actions.
--
-- Nothing existing is altered, renamed, narrowed or dropped. No column is added
-- to crm_automation_events or crm_automation_executions — those tables are the
-- machine's own record and this change does not touch them at all. No data is
-- moved. Safe to apply while the application is running: the table has no
-- dependents until the code that reads it is deployed.
--
-- The shape is defined in lib/db/src/schema/crmAutomation.ts and this file is
-- the same thing said in SQL.
--
-- ── The gap this closes ────────────────────────────────────────────────────
--
-- crm_automation_events and crm_automation_executions record what the MACHINE
-- did. Nothing recorded what a PERSON did about it. An event that exhausted its
-- attempts, and a run whose action failed, both came to rest with an error on
-- the row and no way for anybody to say "I have dealt with this" — so the only
-- two states were "broken" and "broken, and somebody may or may not have looked
-- at it". That is the same silent-loss shape docs/crm-ops/DELIVERY-GUARANTEE.md
-- fixed for reminder mail, one layer over, and this is the same answer in the
-- same vocabulary.
--
-- ── Two verbs, and they are not the same act ───────────────────────────────
--
--   retry        re-runs it. The API offers it ONLY where re-running cannot
--                repeat a side effect: never for a run with an `unknown` step
--                (the write may already have landed), never for anything a
--                worker is still going to attempt by itself, and never for a
--                run a loop brake stopped — retrying THAT would be the way
--                round the brake.
--   acknowledge  records that a person decided nothing more is needed. It
--                re-runs nothing and changes no automation state whatsoever.
--
-- `resend` from the delivery vocabulary has no counterpart here on purpose: no
-- action type in the automation vocabulary has an outbound channel, so
-- "deliberately send a second copy" is not a thing that can be asked for.
--
-- ── Why there is no resolved_at column anywhere ────────────────────────────
--
-- An item is RESOLVED when its most recent row here is an `acknowledge`, and is
-- un-resolved again the moment somebody retries it. One ordered list per
-- target; the latest entry is the answer. Ordering is on the id and not the
-- timestamp, so two actions inside the same millisecond still have a defined
-- "latest".
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M6-automation-recovery.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M6-automation-recovery.sql
--
-- Rollback (nothing else references this table):
--   DROP TABLE IF EXISTS crm_automation_recovery_actions;
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS crm_automation_recovery_actions (
  id                serial PRIMARY KEY,

  -- Which table the target lives in: 'event' = crm_automation_events,
  -- 'run' = crm_automation_executions. Deliberately not a foreign key — the
  -- target is polymorphic, and a constraint that can only name one of the two
  -- tables would silently stop protecting the other.
  target_kind       text NOT NULL,
  target_id         integer NOT NULL,

  action            text NOT NULL,
  -- Why the person did it. Required: an unexplained recovery is not a record.
  reason            text NOT NULL,

  actor_staff_id    integer,
  actor_label       text NOT NULL,

  -- The state the target was in when the action was taken, so the history
  -- still reads correctly after the row itself has moved on.
  previous_status   text NOT NULL,
  previous_attempts integer NOT NULL DEFAULT 0,
  previous_failure  text,

  -- What the action actually did, in the words the operator was shown.
  detail            text,

  created_at        timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_automation_recovery_actions_target CHECK (
    target_kind IN ('event', 'run')),
  CONSTRAINT ck_crm_automation_recovery_actions_action CHECK (
    action IN ('retry', 'acknowledge')),
  CONSTRAINT ck_crm_automation_recovery_actions_reason CHECK (
    length(btrim(reason)) >= 3),
  CONSTRAINT ck_crm_automation_recovery_actions_attempts CHECK (
    previous_attempts >= 0)
);

-- "What has been done about this one", and the lookup the unresolved filter
-- makes for every listed row.
CREATE INDEX IF NOT EXISTS ix_crm_automation_recovery_actions_target
  ON crm_automation_recovery_actions (target_kind, target_id, id);

-- "What has this person closed" — asked when reviewing a decision.
CREATE INDEX IF NOT EXISTS ix_crm_automation_recovery_actions_actor
  ON crm_automation_recovery_actions (actor_staff_id, id);

COMMIT;
