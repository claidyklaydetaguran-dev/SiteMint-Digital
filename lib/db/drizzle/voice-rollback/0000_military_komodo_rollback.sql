-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and is never applied by `drizzle-kit migrate`. Do not wire this file into
-- any automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0000_military_komodo.sql
-- (Milestone 1 / Checkpoint C: voice_assistants, provider_webhook_events,
-- voice_issues).
--
-- VERIFY BACKUPS FIRST. Confirm the target database is safe to modify before
-- running this file, and confirm it is the intended (non-production, unless
-- explicitly owner-approved) database. This file is NOT for automatic
-- production execution.
--
-- Drops only the three Checkpoint C tables, in dependency-safe order (each
-- table's FK to intake_firms is dropped implicitly with the table; no other
-- table references these three, so there are no dependents to unwind first).
-- Does NOT drop intake_firms or any other existing table. No enum types were
-- created for these tables (status/level use CHECK constraints, not pgEnum),
-- so there are no shared types to remove.

BEGIN;

DROP TABLE IF EXISTS "provider_webhook_events";
DROP TABLE IF EXISTS "voice_issues";
DROP TABLE IF EXISTS "voice_assistants";

COMMIT;
