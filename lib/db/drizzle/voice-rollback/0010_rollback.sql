-- Rollback for voice/0010_overrated_justice.sql
-- (saved caller requests, the notification outbox, business-managed transfer
--  contact detail, and the browser-token mint lease).
--
-- Additive-only migration, so the reversal is: drop the two new tables and the
-- twelve new columns. Dropping the tables destroys saved customer messages and
-- any queued notification — take a backup first if the data matters, because
-- nothing else holds it.
--
-- The two new tables are dropped before the columns so a partially applied
-- migration reverses in the same order it was built.
--
-- After running this, clear the 0010 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

DROP TABLE IF EXISTS "voice_notifications";
DROP TABLE IF EXISTS "voice_messages";

ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_test_outcome";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_consent_pair";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_hours_range";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_hours_need_zone";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_hours_complete";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_role_label_length";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_role_label";
ALTER TABLE "voice_transfer_destinations" DROP CONSTRAINT IF EXISTS "ck_voice_transfer_destinations_role";
DROP INDEX IF EXISTS "uq_voice_transfer_destinations_one_default";

ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "last_test_outcome";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "last_test_at";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "consent_confirmed_by";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "consent_confirmed_at";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "is_default";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "hours_end_minute";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "hours_start_minute";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "timezone";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "role_label";
ALTER TABLE "voice_transfer_destinations" DROP COLUMN IF EXISTS "contact_role";

ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "browser_token_mint_lease_at";
