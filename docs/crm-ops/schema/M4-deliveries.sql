-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M4 reminder delivery records
--
-- Reviewed schema change for the integration owner. Independent of the three
-- M3 files and of M4-support.sql; it creates two new tables and adds one
-- nullable column plus one partial index to `crm_notifications`.
--
-- Additive only. Nothing existing is dropped, renamed, retyped or
-- backfilled-over. In particular `crm_scheduled_jobs.external_dispatched_at`
-- and `crm_scheduled_jobs.external_ref` are left EXACTLY as they are: the
-- application stops writing them, their contents are migrated into
-- `crm_reminder_deliveries` at scheduler start, and the original text stays
-- behind as the source it was read from. Migration is idempotent and never
-- discards a record it cannot read — see §3 below.
--
-- Why a table instead of the packed `external_ref` string it replaces: the
-- reasoning is in lib/db/src/schema/crmDeliveries.ts. In short, per-recipient
-- state in a text column made every query a substring match, every write a
-- read-modify-write of the whole column, and forced a cap on how many records
-- a row could carry — which meant unresolved history could be discarded to
-- make room for new records. A row per (occurrence, recipient) removes all
-- three, and the cap with them.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M4-deliveries.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M4-deliveries.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
--
-- Requires PostgreSQL 15 or newer for NULLS NOT DISTINCT (§1). Both the test
-- and preview databases are PostgreSQL 18.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Delivery records ────────────────────────────────────────────────────
--
-- One row per (occurrence, recipient).
--
-- `occurrence_at` is the job's ORIGINAL run_at and never changes — it is the
-- occurrence identity that the idempotency key and every delivery record hang
-- off. `next_attempt_at` is the separate, movable thing: it is what a retry
-- moves. The previous operator retry moved run_at instead, which silently made
-- a new occurrence with a new idempotency identity — an unprotected duplicate
-- send wearing the word "retry".

CREATE TABLE IF NOT EXISTS crm_reminder_deliveries (
  id                        serial PRIMARY KEY,

  -- A delivery record is meaningless without its job, and no route in the CRM
  -- deletes a scheduled job (they are cancelled, not removed), so this FK is a
  -- safety net rather than part of any workflow. It is also what lets the
  -- test-suite teardown delete jobs without stranding delivery rows. This is
  -- the one place a crm_* table carries an FK; every other reference in the
  -- schema is deliberately unconstrained because it points across team
  -- boundaries. This one does not.
  job_id                    integer NOT NULL
                              REFERENCES crm_scheduled_jobs (id) ON DELETE CASCADE,

  occurrence_at             timestamp with time zone NOT NULL,

  recipient_staff_id        integer,
  recipient_address         text,

  subject                   text NOT NULL,
  body                      text NOT NULL,

  idempotency_key           text NOT NULL,

  state                     text NOT NULL DEFAULT 'pending',
  attempt                   integer NOT NULL DEFAULT 0,

  next_attempt_at           timestamp with time zone,
  attempt_started_at        timestamp with time zone,
  attempt_worker            text,

  provider_ref              text,
  failure_reason            text,
  failure_detail            text,

  resend_count              integer NOT NULL DEFAULT 0,

  last_recovery_action      text,
  last_recovery_by_staff_id integer,
  last_recovery_at          timestamp with time zone,

  resolved_at               timestamp with time zone,
  resolved_by_staff_id      integer,
  resolution                text,
  resolution_note           text,

  origin                    text NOT NULL DEFAULT 'live',
  legacy_raw                text,

  created_at                timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_reminder_deliveries_state
    CHECK (state IN ('pending', 'attempting', 'accepted', 'refused', 'uncertain')),

  CONSTRAINT ck_crm_reminder_deliveries_origin
    CHECK (origin IN ('live', 'migrated', 'migrated_unattributed', 'migrated_unparsed')),

  CONSTRAINT ck_crm_reminder_deliveries_resolution
    CHECK (resolution IS NULL OR resolution IN ('acknowledged', 'resent', 'accepted')),

  CONSTRAINT ck_crm_reminder_deliveries_recovery_action
    CHECK (last_recovery_action IS NULL
           OR last_recovery_action IN ('retry', 'resend', 'acknowledge')),

  -- A recipient is one of ours or one of theirs. The third case — nobody — is
  -- allowed ONLY for a record inherited from the packed column, because a
  -- pre-2026-09 dispatch marker genuinely never recorded who it was for.
  -- Preserving that honestly beats inventing a recipient for it.
  CONSTRAINT ck_crm_reminder_deliveries_recipient
    CHECK ((recipient_staff_id IS NOT NULL AND recipient_address IS NULL)
        OR (recipient_staff_id IS NULL AND recipient_address IS NOT NULL)
        OR (origin <> 'live'
            AND recipient_staff_id IS NULL
            AND recipient_address IS NULL)),

  -- "An automatic attempt is scheduled" is only ever true of a pending row, so
  -- a settled or human-owned row can never be silently picked up by a worker.
  CONSTRAINT ck_crm_reminder_deliveries_next_attempt
    CHECK (next_attempt_at IS NULL OR state = 'pending'),

  CONSTRAINT ck_crm_reminder_deliveries_attempt CHECK (attempt >= 0),
  CONSTRAINT ck_crm_reminder_deliveries_resend_count CHECK (resend_count >= 0),

  -- A resolution and its timestamp are one fact, so "resolved" can never be
  -- half-written.
  CONSTRAINT ck_crm_reminder_deliveries_resolved_pair
    CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);

-- One occurrence + recipient has exactly one record.
--
-- NULLS NOT DISTINCT is load-bearing, not a nicety. `recipient_address` is
-- NULL on every staff row, and under PostgreSQL's default NULLS DISTINCT two
-- otherwise identical rows would count as different, so the constraint would
-- never fire on exactly the rows it exists to protect. It also makes the
-- unattributed inherited records (both recipient columns NULL) unique per
-- occurrence instead of unboundedly duplicable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_reminder_deliveries_occurrence
  ON crm_reminder_deliveries (job_id, occurrence_at, recipient_staff_id, recipient_address)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_job
  ON crm_reminder_deliveries (job_id);

-- The unresolved list.
CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_state_occurrence
  ON crm_reminder_deliveries (state, occurrence_at);

-- The worker's claim scan.
CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_due
  ON crm_reminder_deliveries (state, next_attempt_at);

-- ── 2. Recovery actions ────────────────────────────────────────────────────
--
-- Who did what to a delivery, and why. Written alongside the delivery change
-- and allowed to fail the request — unlike `crm_admin_audit_log`, which
-- deliberately swallows its own failures so an audit problem never undoes the
-- audited action. That is correct for an audit trail and disqualifying for the
-- row that proves a case was closed. Both are written; only this one is the
-- record of record.

CREATE TABLE IF NOT EXISTS crm_delivery_recovery_actions (
  id                       serial PRIMARY KEY,
  delivery_id              integer NOT NULL
                             REFERENCES crm_reminder_deliveries (id) ON DELETE CASCADE,

  action                   text NOT NULL,
  reason                   text NOT NULL,

  actor_staff_id           integer,
  actor_label              text NOT NULL,

  previous_state           text NOT NULL,
  previous_idempotency_key text,
  new_idempotency_key      text,

  -- The duplicate risk in the words the operator was shown, recorded rather
  -- than recomputed: the 24-hour idempotency window moves, and the record has
  -- to say what they agreed to, not what would be true today.
  duplicate_risk           text,

  created_at               timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_delivery_recovery_actions_action
    CHECK (action IN ('retry', 'resend', 'acknowledge')),
  -- An unexplained recovery is not a record.
  CONSTRAINT ck_crm_delivery_recovery_actions_reason
    CHECK (length(btrim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS ix_crm_delivery_recovery_actions_delivery
  ON crm_delivery_recovery_actions (delivery_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_delivery_recovery_actions_actor
  ON crm_delivery_recovery_actions (actor_staff_id, id);

-- ── 3. In-app notification identity ────────────────────────────────────────
--
-- A re-run of a job wrote a SECOND in-app notification, because the only thing
-- stopping one was "this job has already run" — which an operator retry
-- deliberately undoes. Job id is the wrong identity too: a recurring reminder
-- is one job row across many occurrences.
--
-- The identity is the occurrence and the person:
--   <dedupe_key>:<run_at ISO>:<staff id>:<kind>
--
-- Nullable, and the index is partial, so every notification that is not a
-- scheduled reminder — and every row written before this change — is
-- untouched and unconstrained.

ALTER TABLE crm_notifications
  ADD COLUMN IF NOT EXISTS occurrence_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_notifications_occurrence
  ON crm_notifications (occurrence_key)
  WHERE occurrence_key IS NOT NULL;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--
--   BEGIN;
--   DROP INDEX IF EXISTS uq_crm_notifications_occurrence;
--   ALTER TABLE crm_notifications DROP COLUMN IF EXISTS occurrence_key;
--   DROP TABLE IF EXISTS crm_delivery_recovery_actions;
--   DROP TABLE IF EXISTS crm_reminder_deliveries;
--   COMMIT;
--
-- What rolling back destroys, stated plainly rather than implied:
--
--  * Every delivery record written since this was applied, including every
--    UNRESOLVED and UNCERTAIN one. Those are the messages nobody knows the fate
--    of; dropping the table makes them invisible again rather than resolved.
--  * Every recovery action: who retried, who re-sent, who acknowledged, and the
--    reason each gave. That exists nowhere else in full — `crm_admin_audit_log`
--    keeps a line per action but carries no reason and no delivery id.
--  * The notification occurrence keys, so a job re-run can duplicate an in-app
--    notification again.
--
-- Records migrated OUT of `crm_scheduled_jobs.external_ref` are safe: that
-- column was never cleared, so the pre-M4 history survives a rollback. Anything
-- written after the migration does not. Take a dump of both tables before
-- rolling back in anger:
--
--   pg_dump "$URL" -t crm_reminder_deliveries -t crm_delivery_recovery_actions \
--     > crm-deliveries-before-rollback.sql
-- ───────────────────────────────────────────────────────────────────────────
