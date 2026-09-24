CREATE TABLE "voice_support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"firm_id" integer NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_support_messages_author" CHECK ("voice_support_messages"."author" IN ('business', 'sitemint')),
	CONSTRAINT "ck_voice_support_messages_body" CHECK (char_length("voice_support_messages"."body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "voice_support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT 'question' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requested_by_email" text NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_support_requests_subject" CHECK (char_length("voice_support_requests"."subject") BETWEEN 1 AND 160),
	CONSTRAINT "ck_voice_support_requests_email" CHECK (char_length("voice_support_requests"."requested_by_email") BETWEEN 3 AND 254 AND "voice_support_requests"."requested_by_email" LIKE '%_@_%'),
	CONSTRAINT "ck_voice_support_requests_category" CHECK ("voice_support_requests"."category" IN ('question', 'problem', 'billing', 'other')),
	CONSTRAINT "ck_voice_support_requests_status" CHECK ("voice_support_requests"."status" IN ('open', 'in_progress', 'answered', 'closed')),
	CONSTRAINT "ck_voice_support_requests_closed_is_stamped" CHECK (("voice_support_requests"."status" = 'closed') = ("voice_support_requests"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "voice_support_messages" ADD CONSTRAINT "voice_support_messages_request_id_voice_support_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."voice_support_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_support_messages" ADD CONSTRAINT "voice_support_messages_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_support_requests" ADD CONSTRAINT "voice_support_requests_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_voice_support_messages_request_created" ON "voice_support_messages" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_support_messages_firm_created" ON "voice_support_messages" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_support_requests_firm_created" ON "voice_support_requests" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_support_requests_firm_status" ON "voice_support_requests" USING btree ("firm_id","status");