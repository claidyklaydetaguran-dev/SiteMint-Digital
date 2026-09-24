-- Rollback for voice/0012_notification_delivery_evidence.sql
-- (post-call email retry evidence, provider delivery evidence, and the call
--  channel on usage rows).
--
-- The migration only adds columns, one index and CHECK constraints, and widens
-- the notification state CHECK to allow 'unconfirmed'. Reversing it:
--
--   1. Rows in 'unconfirmed' cannot exist under the old CHECK, so they become
--      'abandoned' first. Both are terminal and neither is ever sent again, so
--      no email is sent or re-sent by this step. The distinction — that the
--      message MAY have reached the business — is lost; export those rows first
--      if anyone still needs to check them:
--        SELECT id, firm_id, created_at, last_error_code FROM voice_notifications
--         WHERE state = 'unconfirmed';
--   2. The new constraints and index are dropped, then the columns. Dropping
--      the columns discards delivery evidence (delivered/bounced/complained) and
--      each usage row's channel. Minutes and call counts are unaffected.
--
-- Run the application version that predates 0012 afterwards: the current
-- worker reads and writes these columns.
--
-- After running this, clear the 0012 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

UPDATE "voice_notifications" SET "state" = 'abandoned', "updated_at" = now() WHERE "state" = 'unconfirmed';

ALTER TABLE "voice_notifications" DROP CONSTRAINT IF EXISTS "ck_voice_notifications_state";
ALTER TABLE "voice_notifications" ADD CONSTRAINT "ck_voice_notifications_state" CHECK ("voice_notifications"."state" IN ('queued', 'sending', 'accepted', 'failed', 'abandoned'));

ALTER TABLE "voice_notifications" DROP CONSTRAINT IF EXISTS "ck_voice_notifications_delivery_only_when_accepted";
ALTER TABLE "voice_notifications" DROP CONSTRAINT IF EXISTS "ck_voice_notifications_delivery_status";
ALTER TABLE "voice_usage_ledger" DROP CONSTRAINT IF EXISTS "ck_voice_usage_ledger_channel";
DROP INDEX IF EXISTS "ix_voice_notifications_provider_message";

ALTER TABLE "voice_notifications" DROP COLUMN IF EXISTS "delivery_event_at";
ALTER TABLE "voice_notifications" DROP COLUMN IF EXISTS "delivery_status";
ALTER TABLE "voice_notifications" DROP COLUMN IF EXISTS "outcome_uncertain_at";
ALTER TABLE "voice_notifications" DROP COLUMN IF EXISTS "first_attempt_at";
ALTER TABLE "voice_usage_ledger" DROP COLUMN IF EXISTS "channel";
