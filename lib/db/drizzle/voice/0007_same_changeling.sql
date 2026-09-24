CREATE TABLE "voice_onboarding_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"current_step" text,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_onboarding_states_steps_object" CHECK (jsonb_typeof("voice_onboarding_states"."steps") = 'object'),
	CONSTRAINT "ck_voice_onboarding_states_current_step" CHECK ("voice_onboarding_states"."current_step" IS NULL OR "voice_onboarding_states"."current_step" ~ '^[a-z_]{1,40}$')
);
--> statement-breakpoint
CREATE TABLE "voice_beta_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"business_name" text NOT NULL,
	"work_email" text NOT NULL,
	"phone" text,
	"message" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_beta_requests_email_lower" CHECK ("voice_beta_requests"."work_email" = lower("voice_beta_requests"."work_email")),
	CONSTRAINT "ck_voice_beta_requests_status" CHECK ("voice_beta_requests"."status" IN ('new', 'contacted', 'invited', 'declined')),
	CONSTRAINT "ck_voice_beta_requests_source_shape" CHECK ("voice_beta_requests"."source" ~ '^[a-z0-9_.-]{1,60}$')
);
--> statement-breakpoint
CREATE TABLE "voice_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"email" text,
	"note" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_firm_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_invites_hash_shape" CHECK ("voice_invites"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_voice_invites_email_lower" CHECK ("voice_invites"."email" IS NULL OR "voice_invites"."email" = lower("voice_invites"."email"))
);
--> statement-breakpoint
ALTER TABLE "voice_onboarding_states" ADD CONSTRAINT "voice_onboarding_states_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_invites" ADD CONSTRAINT "voice_invites_redeemed_firm_id_intake_firms_id_fk" FOREIGN KEY ("redeemed_firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_onboarding_states_firm" ON "voice_onboarding_states" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ix_voice_beta_requests_status_created" ON "voice_beta_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_invites_code_hash" ON "voice_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "ix_voice_invites_redeemed_firm" ON "voice_invites" USING btree ("redeemed_firm_id");