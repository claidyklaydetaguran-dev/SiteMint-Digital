-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and is never applied by `drizzle-kit migrate`. Do not wire this file into
-- any automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0002_provider_sync_state.sql
-- (AR-001V: provider-synchronization state for already-published assistants).
--
-- Run only by an operator, deliberately, and only after confirming the target
-- database. Nothing invokes it automatically. It does not remove this
-- migration's row from `drizzle.__drizzle_migrations_voice`, so that row must
-- be cleared separately before the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST. Confirm the target database is safe to modify before
-- running this file, and confirm it is the intended (non-production, unless
-- explicitly owner-approved) database.
--
-- SAFETY GUARD: a row with a non-null provider_sync_attempt_id has a
-- synchronization attempt in flight, and the provider outcome for it is not
-- yet known. Dropping the column would erase the only record that an update
-- was ever attempted, so this rollback aborts loudly instead and leaves the
-- operator to let the attempt settle (or clear it deliberately) first.
--
-- LOSS ON ROLLBACK: provider_config_hash is dropped. After rollback the
-- system can no longer distinguish "published and synchronized" from
-- "published with unsynchronized local changes", which is exactly the
-- silent-divergence behaviour that existed before this migration. Nothing
-- else regresses: the publish lifecycle, tenant isolation, and every
-- pre-existing constraint are untouched by both the forward migration and
-- this rollback.
--
-- COMPATIBILITY: application code written against these columns must be
-- rolled back with the schema. The forward direction is backward-compatible
-- in the other sense — older application code simply ignores four nullable
-- columns it does not read, so the migration may be applied before the code
-- that uses it.

BEGIN;

DO $$
DECLARE
  in_flight_count integer;
BEGIN
  SELECT count(*) INTO in_flight_count
  FROM "voice_assistants"
  WHERE "provider_sync_attempt_id" IS NOT NULL;

  IF in_flight_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to roll back: % row(s) have a provider synchronization attempt in flight. Let those attempts settle, or clear provider_sync_attempt_id/provider_sync_started_at deliberately, then re-run.',
      in_flight_count;
  END IF;
END $$;

ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_provider_sync_error_length";
ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_provider_config_hash_shape";
ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_provider_sync_attempt";

DROP INDEX IF EXISTS "ix_voice_assistants_provider_sync_started_at";

ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "provider_config_hash";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "provider_sync_attempt_id";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "provider_sync_started_at";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "provider_sync_error";

COMMIT;
