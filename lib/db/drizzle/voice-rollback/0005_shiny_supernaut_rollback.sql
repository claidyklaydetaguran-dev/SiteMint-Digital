-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and never applied by `drizzle-kit migrate`. Do not wire this file into any
-- automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0005_shiny_supernaut.sql
-- (P7: staff call reviews, the immutable usage ledger, and usage-cap
-- states).
--
-- Run only by an operator, deliberately, and only after confirming the
-- target database. It does not remove this migration's row from
-- `drizzle.__drizzle_migrations_voice`; clear that row separately before
-- the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST.
--
-- SAFETY GUARD: refuse while the usage ledger holds any rows (it is
-- billing evidence — export or archive it deliberately first) or while any
-- period has an unresolved 'pause_requested' cap state (an operator is
-- mid-decision on that firm).
--
-- LOSS ON ROLLBACK: every staff review disposition, the per-call usage
-- ledger, and all recorded cap states.

BEGIN;

DO $$
DECLARE
  ledger_rows integer;
  pending_caps integer;
BEGIN
  SELECT count(*) INTO ledger_rows FROM "voice_usage_ledger";
  IF ledger_rows > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: voice_usage_ledger holds % row(s) of billing evidence. Export/archive it deliberately first.', ledger_rows;
  END IF;
  SELECT count(*) INTO pending_caps FROM "voice_usage_cap_states" WHERE "state" = 'pause_requested';
  IF pending_caps > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % cap state(s) are pause_requested and undecided. Clear them deliberately first.', pending_caps;
  END IF;
END $$;

DROP TABLE IF EXISTS "voice_usage_cap_states";
DROP TABLE IF EXISTS "voice_usage_ledger";
DROP TABLE IF EXISTS "voice_call_reviews";

COMMIT;
