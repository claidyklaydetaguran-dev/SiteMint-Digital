-- Rollback for drizzle/scheduling/0002_superb_wither.sql
--
-- 0002 is additive only: one new table, four nullable columns on
-- scheduling_appointment_types, and one CHECK over those columns. So this
-- rollback is a clean reversal with one data consequence, stated plainly below.
--
-- DATA LOSS, deliberate and scoped:
--   - Dropping scheduling_date_exceptions discards every per-date closure and
--     special-hours row a business has configured. Nothing else references the
--     table, so no other row is affected.
--   - Dropping the four columns discards any per-type override. The types
--     themselves survive; they revert to inheriting the firm defaults, which is
--     exactly the behaviour before 0002.
--
-- Back the database up first (pnpm --filter @workspace/db run backup).
--
-- Run inside a transaction so a partial rollback cannot happen:
--
--   BEGIN;
--   \i 0002_superb_wither_rollback.sql
--   -- verify, then:
--   COMMIT;
--
-- After running this, delete the 0002 row from
-- drizzle.__drizzle_migrations_scheduling, or the next migrate:scheduling will
-- believe 0002 is still applied and refuse to replay it:
--
--   DELETE FROM drizzle.__drizzle_migrations_scheduling WHERE created_at = 1789196736922;

ALTER TABLE "scheduling_appointment_types"
  DROP CONSTRAINT IF EXISTS "ck_scheduling_appointment_types_overrides_sane";

ALTER TABLE "scheduling_appointment_types" DROP COLUMN IF EXISTS "calendar_id";
ALTER TABLE "scheduling_appointment_types" DROP COLUMN IF EXISTS "slot_interval_minutes";
ALTER TABLE "scheduling_appointment_types" DROP COLUMN IF EXISTS "max_advance_days";
ALTER TABLE "scheduling_appointment_types" DROP COLUMN IF EXISTS "min_notice_minutes";

DROP TABLE IF EXISTS "scheduling_date_exceptions";
