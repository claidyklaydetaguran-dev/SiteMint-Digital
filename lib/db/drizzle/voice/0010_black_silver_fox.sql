CREATE TABLE "voice_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text DEFAULT 'vapi' NOT NULL,
	"provider_call_id" text NOT NULL,
	"assistant_id" integer,
	"tool_call_id" text NOT NULL,
	"caller_name" text NOT NULL,
	"callback_phone" text,
	"callback_email" text,
	"topic" text NOT NULL,
	"details" text NOT NULL,
	"urgency" text DEFAULT 'normal' NOT NULL,
	"email_ack_requested" boolean DEFAULT false NOT NULL,
	"follow_up_status" text DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_messages_urgency" CHECK ("voice_messages"."urgency" IN ('normal', 'urgent')),
	CONSTRAINT "ck_voice_messages_status" CHECK ("voice_messages"."follow_up_status" IN ('new', 'in_progress', 'resolved')),
	CONSTRAINT "ck_voice_messages_caller_name_length" CHECK (char_length("voice_messages"."caller_name") BETWEEN 1 AND 120),
	CONSTRAINT "ck_voice_messages_topic_length" CHECK (char_length("voice_messages"."topic") BETWEEN 1 AND 120),
	CONSTRAINT "ck_voice_messages_details_length" CHECK (char_length("voice_messages"."details") BETWEEN 1 AND 2000),
	CONSTRAINT "ck_voice_messages_ack_needs_email" CHECK ("voice_messages"."email_ack_requested" = false OR "voice_messages"."callback_email" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "voice_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_notifications_state" CHECK ("voice_notifications"."state" IN ('queued', 'sending', 'accepted', 'failed', 'abandoned')),
	CONSTRAINT "ck_voice_notifications_kind" CHECK ("voice_notifications"."kind" IN ('post_call_summary', 'caller_acknowledgement')),
	CONSTRAINT "ck_voice_notifications_accepted_is_stamped" CHECK (("voice_notifications"."state" = 'accepted') = ("voice_notifications"."accepted_at" IS NOT NULL)),
	CONSTRAINT "ck_voice_notifications_receipt_only_when_accepted" CHECK ("voice_notifications"."provider_message_id" IS NULL OR "voice_notifications"."state" = 'accepted')
);
--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD COLUMN "browser_token_mint_lease_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "contact_role" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "role_label" text;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "hours_start_minute" integer;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "hours_end_minute" integer;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "consent_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "consent_confirmed_by" text;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "last_test_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD COLUMN "last_test_outcome" text;--> statement-breakpoint
ALTER TABLE "voice_messages" ADD CONSTRAINT "voice_messages_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_messages" ADD CONSTRAINT "voice_messages_assistant_id_voice_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."voice_assistants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_notifications" ADD CONSTRAINT "voice_notifications_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_messages_firm_tool_call" ON "voice_messages" USING btree ("firm_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "ix_voice_messages_firm_created" ON "voice_messages" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_messages_firm_call" ON "voice_messages" USING btree ("firm_id","provider_call_id");--> statement-breakpoint
CREATE INDEX "ix_voice_messages_firm_status" ON "voice_messages" USING btree ("firm_id","follow_up_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_notifications_firm_dedupe" ON "voice_notifications" USING btree ("firm_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "ix_voice_notifications_due" ON "voice_notifications" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ix_voice_notifications_firm_created" ON "voice_notifications" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_transfer_destinations_one_default" ON "voice_transfer_destinations" USING btree ("firm_id") WHERE "voice_transfer_destinations"."is_default";--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_role" CHECK ("voice_transfer_destinations"."contact_role" IN ('owner', 'manager', 'receptionist', 'support', 'sales', 'other', 'custom'));--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_role_label" CHECK (("voice_transfer_destinations"."contact_role" = 'custom') = ("voice_transfer_destinations"."role_label" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_role_label_length" CHECK ("voice_transfer_destinations"."role_label" IS NULL OR char_length("voice_transfer_destinations"."role_label") BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_hours_complete" CHECK (("voice_transfer_destinations"."hours_start_minute" IS NULL) = ("voice_transfer_destinations"."hours_end_minute" IS NULL));--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_hours_need_zone" CHECK ("voice_transfer_destinations"."hours_start_minute" IS NULL OR "voice_transfer_destinations"."timezone" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_hours_range" CHECK (("voice_transfer_destinations"."hours_start_minute" IS NULL OR "voice_transfer_destinations"."hours_start_minute" BETWEEN 0 AND 1439)
        AND ("voice_transfer_destinations"."hours_end_minute" IS NULL OR "voice_transfer_destinations"."hours_end_minute" BETWEEN 0 AND 1440));--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_consent_pair" CHECK (("voice_transfer_destinations"."consent_confirmed_at" IS NULL) = ("voice_transfer_destinations"."consent_confirmed_by" IS NULL));--> statement-breakpoint
ALTER TABLE "voice_transfer_destinations" ADD CONSTRAINT "ck_voice_transfer_destinations_test_outcome" CHECK ("voice_transfer_destinations"."last_test_outcome" IS NULL OR "voice_transfer_destinations"."last_test_outcome" IN ('connected', 'no_answer', 'busy', 'failed', 'declined'));