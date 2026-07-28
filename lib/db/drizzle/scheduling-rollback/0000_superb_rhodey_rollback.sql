-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and is never applied by `drizzle-kit migrate`. Do not wire this file into
-- any automated process.
--
-- Rolls back migration: lib/db/drizzle/scheduling/0000_superb_rhodey.sql
-- (Checkpoint B: scheduling_availability_settings, scheduling_weekly_hours,
-- scheduling_appointment_types, scheduling_blocked_periods,
-- scheduling_appointment_requests).
--
-- VERIFY BACKUPS FIRST. Confirm the target database is safe to modify before
-- running this file, and confirm it is the intended (non-production, unless
-- explicitly owner-approved) database. This file is NOT for automatic
-- production execution.
--
-- Drops the five Checkpoint B tables in dependency-safe order:
-- scheduling_appointment_requests references scheduling_appointment_types
-- (ON DELETE RESTRICT) and intake_firms, so it must be dropped first. The
-- remaining four tables reference only intake_firms and have no dependents
-- among each other. Does NOT drop intake_firms or any other pre-existing
-- table. No enum types were created for these tables (status/source use
-- CHECK constraints, not pgEnum), so there are no shared types to remove.

BEGIN;

DROP TABLE IF EXISTS "scheduling_appointment_requests";
DROP TABLE IF EXISTS "scheduling_blocked_periods";
DROP TABLE IF EXISTS "scheduling_appointment_types";
DROP TABLE IF EXISTS "scheduling_weekly_hours";
DROP TABLE IF EXISTS "scheduling_availability_settings";

COMMIT;
