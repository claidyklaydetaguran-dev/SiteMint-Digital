ALTER TABLE "voice_notifications" DROP CONSTRAINT "ck_voice_notifications_state";--> statement-breakpoint
ALTER TABLE "voice_usage_ledger" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD COLUMN "first_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD COLUMN "outcome_uncertain_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD COLUMN "delivery_status" text;--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD COLUMN "delivery_event_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_voice_notifications_provider_message" ON "voice_notifications" USING btree ("provider_message_id");--> statement-breakpoint
ALTER TABLE "voice_usage_ledger" ADD CONSTRAINT "ck_voice_usage_ledger_channel" CHECK ("voice_usage_ledger"."channel" IS NULL OR "voice_usage_ledger"."channel" IN ('telephone', 'browser', 'unknown'));--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD CONSTRAINT "ck_voice_notifications_delivery_status" CHECK ("voice_notifications"."delivery_status" IS NULL OR "voice_notifications"."delivery_status" IN ('delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'));--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD CONSTRAINT "ck_voice_notifications_delivery_only_when_accepted" CHECK ("voice_notifications"."delivery_status" IS NULL OR "voice_notifications"."state" = 'accepted');--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD CONSTRAINT "ck_voice_notifications_state" CHECK ("voice_notifications"."state" IN ('queued', 'sending', 'accepted', 'failed', 'abandoned', 'unconfirmed'));