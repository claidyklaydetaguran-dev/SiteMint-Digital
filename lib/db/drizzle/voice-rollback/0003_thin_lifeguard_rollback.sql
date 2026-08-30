-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and never applied by `drizzle-kit migrate`. Do not wire this file into any
-- automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0003_thin_lifeguard.sql
-- (P5: vertical-neutral voice contacts, call links, voice-number SMS consent
-- ledger, and the outbound SMS outbox).
--
-- Run only by an operator, deliberately, and only after confirming the
-- target database. It does not remove this migration's row from
-- `drizzle.__drizzle_migrations_voice`; clear that row separately before
-- the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST.
--
-- LOSS ON ROLLBACK: voice caller identities and their call links, the voice
-- channel's SMS consent ledger (including recorded STOPs — re-migrating
-- starts consent from empty, so treat prior STOP lists as externally
-- archived before rolling back if any real traffic ever occurred), and the
-- outbound SMS ledger including delivery outcomes. The intake pipeline's
-- own consent handling is a separate system and is untouched.
--
-- SAFETY GUARD: refuse while any message is mid-flight ('sending') — its
-- provider outcome would become unattributable.

BEGIN;

DO $$
DECLARE
  in_flight integer;
BEGIN
  SELECT count(*) INTO in_flight FROM "voice_sms_outbox" WHERE "status" = 'sending';
  IF in_flight > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % outbound message(s) are mid-flight (status=sending). Let them settle first.', in_flight;
  END IF;
END $$;

DROP TABLE IF EXISTS "voice_sms_outbox";
DROP TABLE IF EXISTS "voice_sms_consents";
DROP TABLE IF EXISTS "voice_call_links";
DROP TABLE IF EXISTS "voice_contacts";

COMMIT;
