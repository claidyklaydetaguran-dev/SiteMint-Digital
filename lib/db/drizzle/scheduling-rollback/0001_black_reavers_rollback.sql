-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and never applied by `drizzle-kit migrate`. Do not wire this file into any
-- automated process.
--
-- Rolls back migration: lib/db/drizzle/scheduling/0001_black_reavers.sql
-- (P4: per-firm calendar connections, one-time OAuth states).
--
-- Run only by an operator, deliberately, and only after confirming the
-- target database. It does not remove this migration's row from
-- `drizzle.__drizzle_migrations_scheduling`; clear that row separately
-- before the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST.
--
-- LOSS ON ROLLBACK: every stored calendar connection (encrypted refresh
-- tokens included) and pending OAuth state is dropped — firms must
-- re-connect Google Calendar after a re-migration. calendar_event_id values
-- are dropped, so previously written events can no longer be reconciled or
-- deleted by reference; clean them up in Google first if that matters.
-- Nothing else regresses: scheduling availability, requests, and every
-- pre-existing constraint are untouched.
--
-- COMPATIBILITY: application code written against these tables must be
-- rolled back with the schema. The forward direction is backward-compatible:
-- older code ignores two unknown tables and one nullable column.

BEGIN;

DROP TABLE IF EXISTS "scheduling_calendar_oauth_states";
DROP TABLE IF EXISTS "scheduling_calendar_connections";

COMMIT;
