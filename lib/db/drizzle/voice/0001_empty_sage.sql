ALTER TABLE "voice_assistants" DROP CONSTRAINT "ck_voice_assistants_status";--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "publish_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "publish_started_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_voice_assistants_status_publish_started_at" ON "voice_assistants" USING btree ("status","publish_started_at");--> statement-breakpoint
-- Historical-row backfill, required before the stricter invariant CHECK
-- below can be added. Checkpoint C's original constraint enforced no
-- per-status field invariants at all, so a pre-existing 'error' row could in
-- principle have a null/blank sync_error, and a pre-existing 'published' row
-- could in principle have a null/blank provider or provider_assistant_id (no
-- application code path ever produced either shape, but the schema itself
-- did not forbid it). Neither 'publishing' nor 'publish_uncertain' existed
-- as a status value before this migration, so no backfill is needed for
-- those. No row is destroyed: an 'error' row missing its message is simply
-- given the safe fallback code below; a 'published' row missing a genuine
-- provider identity does not represent a real completed publish, so it is
-- honestly reclassified as 'error' with the same safe fallback code rather
-- than inventing a fake provider/providerAssistantId value.
UPDATE "voice_assistants"
  SET "sync_error" = 'unknown_publish_error'
  WHERE "status" = 'error' AND ("sync_error" IS NULL OR btrim("sync_error") = '');--> statement-breakpoint
UPDATE "voice_assistants"
  SET "status" = 'error',
      "provider" = NULL,
      "provider_assistant_id" = NULL,
      "sync_error" = 'unknown_publish_error',
      "publish_attempt_id" = NULL,
      "publish_started_at" = NULL
  WHERE "status" = 'published'
    AND (
      "provider" IS NULL OR btrim("provider") = ''
      OR "provider_assistant_id" IS NULL OR btrim("provider_assistant_id") = ''
    );--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_sync_error_length" CHECK ("voice_assistants"."sync_error" IS NULL OR char_length("voice_assistants"."sync_error") <= 500);--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_publish_invariants" CHECK (
      ("voice_assistants"."status" = 'draft'
        AND "voice_assistants"."provider" IS NULL
        AND "voice_assistants"."provider_assistant_id" IS NULL
        AND "voice_assistants"."publish_attempt_id" IS NULL
        AND "voice_assistants"."publish_started_at" IS NULL)
      OR ("voice_assistants"."status" = 'publishing'
        AND "voice_assistants"."publish_attempt_id" IS NOT NULL
        AND "voice_assistants"."publish_started_at" IS NOT NULL
        AND "voice_assistants"."provider" IS NULL
        AND "voice_assistants"."provider_assistant_id" IS NULL
        AND "voice_assistants"."sync_error" IS NULL)
      OR ("voice_assistants"."status" = 'published'
        AND "voice_assistants"."provider" IS NOT NULL
        AND btrim("voice_assistants"."provider") <> ''
        AND "voice_assistants"."provider_assistant_id" IS NOT NULL
        AND btrim("voice_assistants"."provider_assistant_id") <> ''
        AND "voice_assistants"."publish_attempt_id" IS NULL
        AND "voice_assistants"."publish_started_at" IS NULL
        AND "voice_assistants"."sync_error" IS NULL)
      OR ("voice_assistants"."status" = 'error'
        AND "voice_assistants"."provider" IS NULL
        AND "voice_assistants"."provider_assistant_id" IS NULL
        AND "voice_assistants"."publish_attempt_id" IS NULL
        AND "voice_assistants"."publish_started_at" IS NULL
        AND "voice_assistants"."sync_error" IS NOT NULL
        AND btrim("voice_assistants"."sync_error") <> '')
      OR ("voice_assistants"."status" = 'publish_uncertain'
        AND "voice_assistants"."publish_attempt_id" IS NULL
        AND "voice_assistants"."publish_started_at" IS NULL
        AND "voice_assistants"."sync_error" IS NOT NULL
        AND btrim("voice_assistants"."sync_error") <> ''
        AND (
          ("voice_assistants"."provider" IS NULL AND "voice_assistants"."provider_assistant_id" IS NULL)
          OR (
            "voice_assistants"."provider" IS NOT NULL AND btrim("voice_assistants"."provider") <> ''
            AND "voice_assistants"."provider_assistant_id" IS NOT NULL AND btrim("voice_assistants"."provider_assistant_id") <> ''
          )
        ))
    );--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_status" CHECK ("voice_assistants"."status" IN ('draft', 'publishing', 'published', 'error', 'publish_uncertain'));