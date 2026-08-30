CREATE TABLE "voice_account_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_account_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_account_tokens_purpose" CHECK ("voice_account_tokens"."purpose" IN ('email_verification', 'password_reset', 'member_invitation')),
	CONSTRAINT "ck_voice_account_tokens_hash_shape" CHECK ("voice_account_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "voice_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_audit_log_actor" CHECK ("voice_audit_log"."actor" IN ('owner', 'system', 'admin')),
	CONSTRAINT "ck_voice_audit_log_action_shape" CHECK ("voice_audit_log"."action" ~ '^[a-z0-9_.]{1,60}$')
);
--> statement-breakpoint
CREATE TABLE "voice_firm_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_firm_members_role" CHECK ("voice_firm_members"."role" IN ('owner', 'staff')),
	CONSTRAINT "ck_voice_firm_members_status" CHECK ("voice_firm_members"."status" IN ('invited', 'active', 'revoked')),
	CONSTRAINT "ck_voice_firm_members_email_lower" CHECK ("voice_firm_members"."email" = lower("voice_firm_members"."email"))
);
--> statement-breakpoint
CREATE TABLE "voice_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"plan_code" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"grace_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_subscriptions_state" CHECK ("voice_subscriptions"."state" IN ('active', 'grace', 'suspended', 'canceled')),
	CONSTRAINT "ck_voice_subscriptions_plan_shape" CHECK ("voice_subscriptions"."plan_code" ~ '^[a-z0-9_-]{1,40}$'),
	CONSTRAINT "ck_voice_subscriptions_grace_shape" CHECK ("voice_subscriptions"."state" <> 'grace' OR "voice_subscriptions"."grace_until" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "voice_account_states" ADD CONSTRAINT "voice_account_states_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_account_tokens" ADD CONSTRAINT "voice_account_tokens_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audit_log" ADD CONSTRAINT "voice_audit_log_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_firm_members" ADD CONSTRAINT "voice_firm_members_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_subscriptions" ADD CONSTRAINT "voice_subscriptions_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_account_states_firm" ON "voice_account_states" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_account_tokens_hash" ON "voice_account_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_voice_account_tokens_firm_purpose" ON "voice_account_tokens" USING btree ("firm_id","purpose");--> statement-breakpoint
CREATE INDEX "ix_voice_audit_log_firm_created" ON "voice_audit_log" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_audit_log_firm_action" ON "voice_audit_log" USING btree ("firm_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_firm_members_firm_email" ON "voice_firm_members" USING btree ("firm_id","email");--> statement-breakpoint
CREATE INDEX "ix_voice_firm_members_firm_status" ON "voice_firm_members" USING btree ("firm_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_subscriptions_firm" ON "voice_subscriptions" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_subscriptions_stripe_customer" ON "voice_subscriptions" USING btree ("stripe_customer_id");