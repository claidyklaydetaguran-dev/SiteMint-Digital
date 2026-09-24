-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and never applied by `drizzle-kit migrate`. Do not wire this file into any
-- automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0004_lying_jamie_braddock.sql
-- (P6: phone-number inventory/state machine and approved transfer
-- destinations).
--
-- Run only by an operator, deliberately, and only after confirming the
-- target database. It does not remove this migration's row from
-- `drizzle.__drizzle_migrations_voice`; clear that row separately before
-- the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST.
--
-- SAFETY GUARD: refuse while any number is live ('assigned' or 'paused') —
-- dropping the inventory of a number that still rings somewhere would erase
-- the only record of which firm and assistant it belongs to. Release or
-- reassign numbers deliberately first.
--
-- LOSS ON ROLLBACK: the number inventory (including provider number ids
-- needed to manage them at the provider) and every approved transfer
-- destination list.

BEGIN;

DO $$
DECLARE
  live integer;
BEGIN
  SELECT count(*) INTO live FROM "voice_numbers" WHERE "state" IN ('assigned', 'paused');
  IF live > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % number(s) are assigned or paused. Release them deliberately first.', live;
  END IF;
END $$;

DROP TABLE IF EXISTS "voice_transfer_destinations";
DROP TABLE IF EXISTS "voice_numbers";

COMMIT;
