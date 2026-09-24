-- Rollback for voice/0015_sms_replies_appointment_updates.sql
-- (stored caller text replies, the appointment_update text kind, and the
-- 'text' contact origin).
--
-- Additive-only migration, so the reversal drops what it added. That destroys:
--   * every stored text a caller sent to a voice number (the replies shown in
--     the dashboard's conversation view);
--   * every queued or sent appointment_update text row — the narrower kind
--     constraint cannot be restored while any such row exists.
-- Contacts first created by a text are kept, relabelled 'manual'.
-- Export what matters first:
--
--   SELECT firm_id, from_e164, to_e164, body, keyword, received_at
--     FROM voice_sms_inbound ORDER BY firm_id, received_at;
--   SELECT firm_id, to_e164, body, status, delivery_status, sent_at
--     FROM voice_sms_outbox WHERE kind = 'appointment_update';
--
-- Every statement is IF EXISTS. Run the application version that predates
-- 0015 afterwards, then clear the 0015 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

BEGIN;

-- Contacts first created by a text would violate the narrower origin rule.
-- They become 'manual' (someone at the business can see and edit them), and
-- nothing about the person is lost.
UPDATE "voice_contacts" SET "origin" = 'manual' WHERE "origin" = 'text';
ALTER TABLE "voice_contacts" DROP CONSTRAINT IF EXISTS "ck_voice_contacts_origin";
ALTER TABLE "voice_contacts" ADD CONSTRAINT "ck_voice_contacts_origin"
  CHECK ("voice_contacts"."origin" IN ('call', 'manual'));

DELETE FROM "voice_sms_outbox" WHERE "kind" = 'appointment_update';
ALTER TABLE "voice_sms_outbox" DROP CONSTRAINT IF EXISTS "ck_voice_sms_outbox_kind";
ALTER TABLE "voice_sms_outbox" ADD CONSTRAINT "ck_voice_sms_outbox_kind"
  CHECK ("voice_sms_outbox"."kind" IN ('booking_confirmation', 'missed_call_followup'));

DROP INDEX IF EXISTS "ix_voice_sms_inbound_firm_unread";
DROP INDEX IF EXISTS "ix_voice_sms_inbound_firm_from_received";
DROP INDEX IF EXISTS "uq_voice_sms_inbound_provider_sid";
DROP TABLE IF EXISTS "voice_sms_inbound";

COMMIT;
