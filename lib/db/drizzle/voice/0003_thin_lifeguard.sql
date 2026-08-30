CREATE TABLE "voice_call_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"call_id" text NOT NULL,
	"contact_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"phone_e164" text NOT NULL,
	"display_name" text,
	"intake_conversation_id" integer,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_contacts_phone_shape" CHECK ("voice_contacts"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "voice_sms_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"phone_e164" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_sms_consents_status" CHECK ("voice_sms_consents"."status" IN ('granted', 'stopped')),
	CONSTRAINT "ck_voice_sms_consents_source" CHECK ("voice_sms_consents"."source" IN ('booking_consent', 'sms_start', 'sms_stop', 'operator'))
);
--> statement-breakpoint
CREATE TABLE "voice_sms_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"to_e164" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"dedupe_key" text NOT NULL,
	"provider_message_sid" text,
	"delivery_status" text,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "ck_voice_sms_outbox_kind" CHECK ("voice_sms_outbox"."kind" IN ('booking_confirmation', 'missed_call_followup')),
	CONSTRAINT "ck_voice_sms_outbox_status" CHECK ("voice_sms_outbox"."status" IN ('queued', 'sending', 'sent', 'failed', 'blocked_no_consent')),
	CONSTRAINT "ck_voice_sms_outbox_body_length" CHECK (char_length("voice_sms_outbox"."body") <= 640)
);
--> statement-breakpoint
ALTER TABLE "voice_call_links" ADD CONSTRAINT "voice_call_links_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_call_links" ADD CONSTRAINT "voice_call_links_contact_id_voice_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."voice_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD CONSTRAINT "voice_contacts_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sms_consents" ADD CONSTRAINT "voice_sms_consents_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sms_outbox" ADD CONSTRAINT "voice_sms_outbox_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_call_links_firm_call" ON "voice_call_links" USING btree ("firm_id","call_id");--> statement-breakpoint
CREATE INDEX "ix_voice_call_links_contact" ON "voice_call_links" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_contacts_firm_phone" ON "voice_contacts" USING btree ("firm_id","phone_e164");--> statement-breakpoint
CREATE INDEX "ix_voice_contacts_firm_last_seen" ON "voice_contacts" USING btree ("firm_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_sms_consents_firm_phone" ON "voice_sms_consents" USING btree ("firm_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_sms_outbox_dedupe" ON "voice_sms_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ix_voice_sms_outbox_firm_status" ON "voice_sms_outbox" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "ix_voice_sms_outbox_provider_sid" ON "voice_sms_outbox" USING btree ("provider_message_sid");--> statement-breakpoint
CREATE INDEX "ix_voice_assistants_provider_sync_started_at" ON "voice_assistants" USING btree ("provider_sync_started_at");--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_sync_error_length" CHECK ("voice_assistants"."provider_sync_error" IS NULL OR char_length("voice_assistants"."provider_sync_error") <= 100);--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_config_hash_shape" CHECK ("voice_assistants"."provider_config_hash" IS NULL OR "voice_assistants"."provider_config_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "ck_voice_assistants_provider_sync_attempt" CHECK (
      ("voice_assistants"."provider_sync_attempt_id" IS NULL AND "voice_assistants"."provider_sync_started_at" IS NULL)
      OR ("voice_assistants"."provider_sync_attempt_id" IS NOT NULL AND "voice_assistants"."provider_sync_started_at" IS NOT NULL)
    );