CREATE TABLE "voice_sms_inbound" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"from_e164" text NOT NULL,
	"to_e164" text NOT NULL,
	"body" text NOT NULL,
	"provider_message_sid" text NOT NULL,
	"keyword" text NOT NULL,
	"read_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_sms_inbound_from_shape" CHECK ("voice_sms_inbound"."from_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "ck_voice_sms_inbound_to_shape" CHECK ("voice_sms_inbound"."to_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "ck_voice_sms_inbound_keyword" CHECK ("voice_sms_inbound"."keyword" IN ('stop', 'start', 'help', 'other')),
	CONSTRAINT "ck_voice_sms_inbound_body_length" CHECK (char_length("voice_sms_inbound"."body") <= 1600),
	CONSTRAINT "ck_voice_sms_inbound_sid_shape" CHECK (char_length("voice_sms_inbound"."provider_message_sid") BETWEEN 10 AND 64)
);
--> statement-breakpoint
ALTER TABLE "voice_contacts" DROP CONSTRAINT "ck_voice_contacts_origin";--> statement-breakpoint
ALTER TABLE "voice_sms_outbox" DROP CONSTRAINT "ck_voice_sms_outbox_kind";--> statement-breakpoint
ALTER TABLE "voice_sms_inbound" ADD CONSTRAINT "voice_sms_inbound_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_sms_inbound_provider_sid" ON "voice_sms_inbound" USING btree ("provider_message_sid");--> statement-breakpoint
CREATE INDEX "ix_voice_sms_inbound_firm_from_received" ON "voice_sms_inbound" USING btree ("firm_id","from_e164","received_at");--> statement-breakpoint
CREATE INDEX "ix_voice_sms_inbound_firm_unread" ON "voice_sms_inbound" USING btree ("firm_id","read_at");--> statement-breakpoint
ALTER TABLE "voice_contacts" ADD CONSTRAINT "ck_voice_contacts_origin" CHECK ("voice_contacts"."origin" IN ('call', 'manual', 'text'));--> statement-breakpoint
ALTER TABLE "voice_sms_outbox" ADD CONSTRAINT "ck_voice_sms_outbox_kind" CHECK ("voice_sms_outbox"."kind" IN ('booking_confirmation', 'missed_call_followup', 'appointment_update'));