CREATE TABLE "voice_signup_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_signup_jobs_kind" CHECK ("voice_signup_jobs"."kind" IN ('crm_link', 'verification_email', 'welcome_email')),
	CONSTRAINT "ck_voice_signup_jobs_status" CHECK ("voice_signup_jobs"."status" IN ('pending', 'processing', 'retry_scheduled', 'completed', 'permanently_failed', 'cancelled')),
	CONSTRAINT "ck_voice_signup_jobs_attempts" CHECK ("voice_signup_jobs"."attempts" >= 0 AND "voice_signup_jobs"."attempts" <= "voice_signup_jobs"."max_attempts"),
	CONSTRAINT "ck_voice_signup_jobs_payload_object" CHECK (jsonb_typeof("voice_signup_jobs"."payload") = 'object'),
	CONSTRAINT "ck_voice_signup_jobs_result_object" CHECK (jsonb_typeof("voice_signup_jobs"."result") = 'object')
);
--> statement-breakpoint
ALTER TABLE "voice_signup_jobs" ADD CONSTRAINT "voice_signup_jobs_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_voice_signup_jobs_firm_id_kind" ON "voice_signup_jobs" USING btree ("firm_id","kind");--> statement-breakpoint
CREATE INDEX "ix_voice_signup_jobs_status_next_attempt_at" ON "voice_signup_jobs" USING btree ("status","next_attempt_at");