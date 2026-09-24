-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — what a task's due date MEANS: crm_tasks.due_kind
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * one NEW column on crm_tasks, due_kind, NOT NULL with a default, so every
--     existing row and every existing writer is valid the moment it appears;
--   * one CHECK constraint on that column;
--   * a BACKFILL that reclassifies existing rows — the only statement in this
--     file that changes data, and the only one worth arguing about.
--
-- Nothing existing is altered, renamed, narrowed or dropped. Safe to apply
-- while the application is running: the column has a default, and code that
-- does not know about it keeps writing rows that are correct.
--
-- The shape is defined in lib/db/src/schema/crmTasks.ts and this file is the
-- same thing said in SQL. CRM tables are otherwise maintained with
-- `drizzle-kit push` — this file exists because push has no opinion about the
-- rows already in the table, and those rows are the hard part.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- `crm_tasks.due_date` is a `timestamp with time zone`, so it always carries a
-- clock time whether or not anybody chose one. The code therefore GUESSED what
-- the author meant: local midnight was read as "a day" (late only once the day
-- ends), any other local time as "a moment" (late once it passes).
--
-- That guess is wrong twice.
--
--   1. It cannot represent an explicit midnight deadline. Somebody who means
--      "by 00:00 Friday" wrote a row indistinguishable from "due Friday" and
--      was silently given until Friday ended. The system decided the thing
--      could not have been meant, because it had no way to say it.
--
--   2. "Does this look like midnight" is answered in the timezone of whoever
--      is ASKING. The same stored instant was a date for a colleague in Manila
--      and a time for one in California. An intention that changes with the
--      reader is not an intention.
--
-- So the intention is stored. 'date' or 'time', chosen by the person who set
-- the deadline. Nothing derives it from due_date any more.
--
-- ── What the backfill assumes, in one sentence ─────────────────────────────
--
-- **Every existing row keeps behaving exactly as it behaves today**: a row is
-- classified by what the OLD rule would have said about it, read in the
-- assignee's own timezone. The backfill deliberately changes no task's
-- overdue-ness on the day it runs.
--
-- That is a defensible default and it is not a discovery of anybody's intent.
-- Read the next two sections before running it.
--
-- ── Which rows are GENUINELY ambiguous ─────────────────────────────────────
--
-- Rows sitting at exactly 00:00 local in their assignee's zone. Each one is
-- either a bare date entered through a date picker, or a deliberate midnight
-- deadline — and NOTHING in the database distinguishes them, which is the
-- whole defect. They are backfilled as 'date'.
--
-- That choice is stated rather than hidden: 'date' is how those rows have
-- behaved for their entire life. None of them has ever been announced overdue
-- during its own day. Classifying them 'time' would, on the morning this file
-- is applied, make a batch of tasks retroactively late on a decision nobody
-- recorded — a louder and more annoying failure than the one it fixes, and one
-- the owner would be entitled to call an invention.
--
-- Anybody who genuinely meant midnight must now say so, once, in the composer.
-- There is no way to recover that from the data and this file does not pretend
-- otherwise.
--
-- ── Which rows are classified 'time', and the caveat on them ───────────────
--
-- Rows at any other local clock time. Again: because that is how the old rule
-- treated them, not because a person definitely chose that minute.
--
-- Some of them carry a clock time nobody picked. An automation's "due in 3
-- days" (`automationEngine.ts`) stores `now + 3 days`, which inherits whatever
-- time the rule happened to run at; a discovery follow-up stores `now + 1 day`
-- the same way. Those rows MEAN a day and will be marked 'time', because
-- marking them 'date' would change their behaviour and this backfill refuses
-- to do that silently. §"After applying" gives the query that lists them so a
-- person can look.
--
-- Note the asymmetry with NEW rows: the column default is 'date', so the same
-- generators now produce day-shaped deadlines going forward, which is what
-- "due in 3 days" means. The one generator that states 'time' explicitly is
-- the campaign scheduler, whose task is the manual half of a send somebody
-- genuinely scheduled for a moment.
--
-- ── A limitation this file does NOT fix ────────────────────────────────────
--
-- Two composers still collect a bare date and post it as "2026-09-14", which
-- the API reads as UTC midnight. For an assignee west of UTC that instant
-- names the PREVIOUS calendar day in their own zone, so a date-only task can
-- sit under the wrong day for them. That off-by-one predates this change and
-- is unaffected by it; it is now more visible, because the day is the entire
-- meaning of a 'date' row. Fixing it means those composers sending a
-- zone-resolved instant, which is an application change, not a schema one.
--
-- ── Apply with ─────────────────────────────────────────────────────────────
--   psql -v ON_ERROR_STOP=1 "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M5-task-due-kind.sql
--   psql -v ON_ERROR_STOP=1 "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M5-task-due-kind.sql
--
-- Take the backup and the restore drill first (RELEASE-PACKAGE.md §4). This is
-- the one CRM artifact that writes to existing rows, so "we can re-run it" is
-- not the same as "we can undo it" — see Rollback.
--
-- Idempotent: re-running it adds nothing and reclassifies nothing that a
-- person has since corrected, because the backfill only touches rows still
-- sitting at the default (`due_kind = 'date'`) whose clock time says otherwise.
-- A row a person has deliberately set to 'date' at a non-midnight time would
-- be flipped back to 'time' by a second run — so run it ONCE, on the same
-- deployment as the code, and not again.
--
-- Rollback (loses every kind anybody has since chosen — the column IS the
-- record of those decisions, and nothing else holds them):
--   BEGIN;
--   ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS ck_crm_tasks_due_kind;
--   ALTER TABLE crm_tasks DROP COLUMN IF EXISTS due_kind;
--   COMMIT;
-- Dropping the column restores the old midnight heuristic's behaviour only if
-- the application is rolled back too; the current code reads a missing kind
-- through its named fallback and treats every task as date-only.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The column ─────────────────────────────────────────────────────────────
--
-- NOT NULL with a default rather than nullable. A nullable kind would put the
-- "what does absent mean" decision back where it started: in whichever line of
-- application code read the row next, each free to answer differently. One
-- default, written down here and in CRM_TASK_DUE_KIND_FALLBACK, is the point.

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS due_kind text NOT NULL DEFAULT 'date';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_crm_tasks_due_kind'
  ) THEN
    ALTER TABLE crm_tasks
      ADD CONSTRAINT ck_crm_tasks_due_kind
      -- A third value would be a third meaning nothing implements, and the
      -- reader would quietly fall back to 'date' without saying so.
      CHECK (due_kind IN ('date', 'time'));
  END IF;
END $$;

COMMENT ON COLUMN crm_tasks.due_kind IS
  'What the author of the deadline meant: date = late once the day ends (in the assignee''s zone); time = late once the instant passes. Never inferred from due_date.';

-- ── The backfill ───────────────────────────────────────────────────────────
--
-- The old rule, run once, in SQL: local midnight in the assignee's own
-- timezone means a day; anything else means a moment. Every row it leaves
-- alone stays 'date' by the column default, which is the same answer.
--
-- Three details that are easy to get wrong and change the result:
--
--   * The zone is the ASSIGNEE's, matching `staffZones()` in the sweep. Read
--     in UTC instead, every row belonging to anybody outside UTC would be
--     misclassified — which is the second half of the defect, reproduced.
--   * An inactive or deleted assignee, a NULL assignee, an empty zone, or a
--     zone string PostgreSQL does not recognise all fall back to 'UTC'. That
--     is the application's own fallback (AUTOMATION_FALLBACK_TIMEZONE), so the
--     backfill and the running code agree about these rows rather than
--     disagreeing quietly. `pg_timezone_names` is checked because an unknown
--     zone name makes AT TIME ZONE raise, and one bad staff row must not abort
--     the whole backfill.
--   * Rows with no due date are untouched. They have no deadline to have a
--     meaning, and their 'date' is inert.

WITH classified AS (
  SELECT t.id,
         (t.due_date AT TIME ZONE COALESCE(z.zone, 'UTC'))::time AS local_clock
    FROM crm_tasks t
    LEFT JOIN LATERAL (
      SELECT s.timezone AS zone
        FROM crm_staff s
       WHERE s.id = t.assigned_to_staff_id
         AND s.status = 'active'
         AND s.timezone IS NOT NULL
         AND s.timezone <> ''
         AND s.timezone IN (SELECT name FROM pg_timezone_names)
    ) z ON true
   WHERE t.due_date IS NOT NULL
)
UPDATE crm_tasks t
   SET due_kind = 'time'
  FROM classified c
 WHERE c.id = t.id
   AND t.due_kind = 'date'
   AND c.local_clock <> TIME '00:00';

COMMIT;

-- ── After applying ─────────────────────────────────────────────────────────
--
-- 1. The split, so the numbers are recorded rather than assumed:
--
--    SELECT due_kind, count(*) FILTER (WHERE due_date IS NOT NULL) AS with_a_deadline,
--           count(*) AS rows
--      FROM crm_tasks GROUP BY due_kind ORDER BY due_kind;
--
-- 2. The rows worth a human pass — open tasks classified 'time' that were most
--    likely created by a generator and mean a day, not a minute. Nothing is
--    changed automatically; somebody who knows the work decides:
--
--    SELECT id, title, created_by, due_date
--      FROM crm_tasks
--     WHERE due_kind = 'time'
--       AND status <> 'completed'
--       AND archived_at IS NULL
--       AND (created_by LIKE 'automation:%' OR created_by = 'campaign-automation')
--     ORDER BY due_date DESC;
--
-- 3. Nothing became late overnight. Run this BEFORE and AFTER and compare —
--    the two counts must match, because that is the backfill's whole promise:
--
--    SELECT count(*) FROM crm_tasks
--     WHERE status <> 'completed' AND archived_at IS NULL AND due_date IS NOT NULL
--       AND due_date < now();
--
--    (An exact per-row check needs the assignee's zone and belongs to the
--    application; this is the cheap version that would catch a backfill that
--    inverted the rule.)
