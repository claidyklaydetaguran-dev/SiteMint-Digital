-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — one delivery record per occurrence and recipient, in EVERY
-- database: uq_crm_reminder_deliveries_occurrence becomes a
-- UNIQUE NULLS NOT DISTINCT constraint
--
-- Reviewed schema change for the integration owner. No column and no row
-- changes. It changes HOW one existing uniqueness rule is declared:
--
--   * where the M4 index exists as reviewed (NULLS NOT DISTINCT), it is
--     promoted in place to a constraint of the same name — no rebuild, and no
--     moment without the rule;
--   * where a push-built database created that index WITHOUT NULLS NOT
--     DISTINCT (the defect below), the file first proves that no duplicated
--     rows exist, then replaces the index with the constraint in the same
--     transaction — and if duplicates DO exist it stops and changes nothing,
--     because deciding which of two delivery records is true is a decision for
--     a person, not for this file;
--   * where neither exists, the constraint is created (same duplicate check).
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- M4-deliveries.sql creates the index with NULLS NOT DISTINCT, and that clause
-- is load-bearing: recipient_address is NULL on every staff row, so under
-- PostgreSQL's default (NULLS DISTINCT) two identical staff rows never
-- conflict. lib/db/src/schema/crmDeliveries.ts declared the same index
-- WITHOUT the clause — drizzle-orm 0.45 cannot express it on an index, only on
-- a unique constraint. Every database built by `drizzle-kit push` (so every
-- `migrate:fresh` database) therefore got an index that never fires on the
-- rows it exists to protect: re-running the packed-record migration duplicated
-- its rows, and two workers racing to create the same delivery could both
-- succeed — a reminder emailed twice. Found 2026-09-16 when the integration
-- owner ran the CRM suites against a migrate:fresh database.
--
-- The schema now declares `unique(...).nullsNotDistinct()`, which push renders
-- as exactly this constraint, so a push-built database and one built from the
-- reviewed files agree, and a catalog comparison of the two is clean.
--
-- ORDER: any time after M4-deliveries.sql or M4-crm-first-install.sql (both
-- still create the index form). Independent of the application version: the
-- application relies on the rule, not on how it is declared.
--
-- Apply with:
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f docs/crm-ops/schema/M7-reminder-delivery-uniqueness.sql
--
-- Idempotent: a second run finds the constraint and does nothing.
--
-- Rollback (restores the M4 declaration; the rule holds throughout):
--   BEGIN;
--   ALTER TABLE crm_reminder_deliveries DROP CONSTRAINT IF EXISTS uq_crm_reminder_deliveries_occurrence;
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_reminder_deliveries_occurrence
--     ON crm_reminder_deliveries (job_id, occurrence_at, recipient_staff_id, recipient_address)
--     NULLS NOT DISTINCT;
--   COMMIT;
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- One writer for this file at a time, even if two operators run it at once.
SELECT pg_advisory_xact_lock(hashtext('sitemint:crm:M7-reminder-delivery-uniqueness'));

DO $$
DECLARE
  has_constraint   boolean;
  idx_oid          oid;
  idx_nulls_equal  boolean;
  duplicate_groups bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_crm_reminder_deliveries_occurrence'
       AND conrelid = 'public.crm_reminder_deliveries'::regclass
       AND contype = 'u'
  ) INTO has_constraint;

  IF has_constraint THEN
    RAISE NOTICE 'uq_crm_reminder_deliveries_occurrence is already a constraint; nothing to do';
    RETURN;
  END IF;

  SELECT i.oid, x.indnullsnotdistinct
    INTO idx_oid, idx_nulls_equal
    FROM pg_class i
    JOIN pg_index x ON x.indexrelid = i.oid
   WHERE i.relname = 'uq_crm_reminder_deliveries_occurrence'
     AND x.indrelid = 'public.crm_reminder_deliveries'::regclass;

  -- The reviewed M4 index: adopt it as the constraint's index, unchanged.
  IF idx_oid IS NOT NULL AND idx_nulls_equal THEN
    ALTER TABLE public.crm_reminder_deliveries
      ADD CONSTRAINT uq_crm_reminder_deliveries_occurrence
      UNIQUE USING INDEX uq_crm_reminder_deliveries_occurrence;
    RAISE NOTICE 'promoted the reviewed NULLS NOT DISTINCT index to a constraint';
    RETURN;
  END IF;

  -- Missing, or built without NULLS NOT DISTINCT. GROUP BY treats NULLs as
  -- equal, so these groups are exactly the rows the constraint would refuse.
  SELECT count(*)
    INTO duplicate_groups
    FROM (
      SELECT 1
        FROM public.crm_reminder_deliveries
       GROUP BY job_id, occurrence_at, recipient_staff_id, recipient_address
      HAVING count(*) > 1
    ) AS d;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      'crm_reminder_deliveries holds % duplicated (job, occurrence, recipient) group(s); nothing was changed. List them with the query under "If this file stopped" and resolve them first.',
      duplicate_groups;
  END IF;

  IF idx_oid IS NOT NULL THEN
    DROP INDEX public.uq_crm_reminder_deliveries_occurrence;
  END IF;

  ALTER TABLE public.crm_reminder_deliveries
    ADD CONSTRAINT uq_crm_reminder_deliveries_occurrence
    UNIQUE NULLS NOT DISTINCT (job_id, occurrence_at, recipient_staff_id, recipient_address);
  RAISE NOTICE 'created uq_crm_reminder_deliveries_occurrence as a NULLS NOT DISTINCT constraint';
END $$;

-- ── Two foreign keys that carry PostgreSQL's default name ──────────────────
--
-- Same class of drift, found by the same catalog comparison. M4-deliveries.sql
-- wrote these two FKs without naming them, so PostgreSQL named them
-- `<table>_<column>_fkey`, while drizzle names them
-- `<table>_<column>_<reftable>_<refcolumn>_fk` (truncated to 63 characters).
-- A database built by push therefore disagrees with one built from the
-- reviewed file, and push against the latter would try to add its own copy.
-- Renaming changes nothing about what the constraint does.

DO $$
DECLARE
  renames CONSTANT text[][] := ARRAY[
    ARRAY['crm_reminder_deliveries', 'crm_reminder_deliveries_job_id_fkey',
          'crm_reminder_deliveries_job_id_crm_scheduled_jobs_id_fk'],
    ARRAY['crm_delivery_recovery_actions', 'crm_delivery_recovery_actions_delivery_id_fkey',
          'crm_delivery_recovery_actions_delivery_id_crm_reminder_deliveri']
  ];
  entry text[];
BEGIN
  FOREACH entry SLICE 1 IN ARRAY renames LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = entry[2] AND conrelid = ('public.' || entry[1])::regclass
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = entry[3] AND conrelid = ('public.' || entry[1])::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', entry[1], entry[2], entry[3]);
      RAISE NOTICE 'renamed %.% to %', entry[1], entry[2], entry[3];
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ── After applying ─────────────────────────────────────────────────────────
--
-- 1. The rule is a constraint, and its index treats NULLs as equal:
--
--    SELECT c.conname, pg_get_constraintdef(c.oid) AS definition, x.indnullsnotdistinct
--      FROM pg_constraint c
--      JOIN pg_index x ON x.indexrelid = c.conindid
--     WHERE c.conname = 'uq_crm_reminder_deliveries_occurrence';
--
--    Expect exactly one row:
--    UNIQUE NULLS NOT DISTINCT (job_id, occurrence_at, recipient_staff_id, recipient_address) | true
--
-- ── If this file stopped on duplicates ─────────────────────────────────────
--
--    SELECT job_id, occurrence_at, recipient_staff_id, recipient_address,
--           count(*) AS copies, array_agg(id ORDER BY id) AS ids,
--           array_agg(state ORDER BY id) AS states
--      FROM crm_reminder_deliveries
--     GROUP BY job_id, occurrence_at, recipient_staff_id, recipient_address
--    HAVING count(*) > 1;
--
--    Each group is one reminder recorded more than once. Look at the states and
--    provider references before removing anything: an `accepted` copy is
--    evidence a message went out, and it is the one to keep.
