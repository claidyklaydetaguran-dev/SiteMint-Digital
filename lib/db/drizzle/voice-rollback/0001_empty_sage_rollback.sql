-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and is never applied by `drizzle-kit migrate`. Do not wire this file into
-- any automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0001_empty_sage.sql
-- (Milestone 1 / Checkpoint E3B1: publish lifecycle states + attempt fields
-- on voice_assistants, corrected invariant CHECK).
--
-- VERIFY BACKUPS FIRST. Confirm the target database is safe to modify before
-- running this file, and confirm it is the intended (non-production, unless
-- explicitly owner-approved) database.
--
-- SAFETY GUARD: this migration introduced three new terminal/in-flight
-- states ('publishing', 'error' already existed as a value but was unused
-- before this migration, and 'publish_uncertain') plus the publish_attempt_id
-- / publish_started_at columns. Restoring the prior 3-value status CHECK
-- constraint ('draft', 'published', 'error') is only safe when no row is
-- currently sitting in 'publishing' or 'publish_uncertain' — those values
-- cannot be represented by the prior constraint. Rather than silently
-- corrupting or force-migrating such rows, this rollback aborts loudly if
-- any exist so an operator can decide how to handle them first (e.g. wait
-- for in-flight publishes to finish, or manually resolve them to
-- draft/published/error before re-running this rollback).
--
-- Note on the forward migration's historical-row backfill: any 'error' row
-- that had a null/blank sync_error, or any 'published' row that had a
-- null/blank provider/provider_assistant_id, was rewritten by the forward
-- migration (the latter reclassified to 'error' with sync_error =
-- 'unknown_publish_error'). This rollback does not attempt to reverse that
-- backfill — there is no recoverable original value to restore (the row was
-- already missing the data the old, unenforced constraint never required),
-- and the backfilled shape remains perfectly valid under the restored prior
-- constraint, so no further action is needed for it here.
--
-- Does not drop any other table or column beyond what Checkpoint E3B1 added.

BEGIN;

DO $$
DECLARE
  unsupported_count integer;
BEGIN
  SELECT count(*) INTO unsupported_count
  FROM "voice_assistants"
  WHERE "status" IN ('publishing', 'publish_uncertain');

  IF unsupported_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to roll back: % row(s) have status in (publishing, publish_uncertain), which cannot be represented after rollback. Resolve these rows to draft/published/error first.',
      unsupported_count;
  END IF;
END $$;

ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_status";
ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_publish_invariants";
ALTER TABLE "voice_assistants" DROP CONSTRAINT IF EXISTS "ck_voice_assistants_sync_error_length";

DROP INDEX IF EXISTS "ix_voice_assistants_status_publish_started_at";

ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "publish_attempt_id";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "publish_started_at";

ALTER TABLE "voice_assistants"
  ADD CONSTRAINT "ck_voice_assistants_status" CHECK ("status" IN ('draft', 'published', 'error'));

COMMIT;
