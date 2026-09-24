CREATE TABLE "scheduling_calendar_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"account_label" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text NOT NULL,
	"last_freebusy_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_scheduling_calendar_connections_provider" CHECK ("scheduling_calendar_connections"."provider" IN ('google')),
	CONSTRAINT "ck_scheduling_calendar_connections_status" CHECK ("scheduling_calendar_connections"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "scheduling_calendar_oauth_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"state_hash" text NOT NULL,
	"code_verifier_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduling_calendar_connections" ADD CONSTRAINT "scheduling_calendar_connections_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendar_oauth_states" ADD CONSTRAINT "scheduling_calendar_oauth_states_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_calendar_connections_firm_provider" ON "scheduling_calendar_connections" USING btree ("firm_id","provider");--> statement-breakpoint
CREATE INDEX "ix_scheduling_calendar_connections_firm_id" ON "scheduling_calendar_connections" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scheduling_calendar_oauth_states_state_hash" ON "scheduling_calendar_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "ix_scheduling_calendar_oauth_states_firm_id" ON "scheduling_calendar_oauth_states" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ix_scheduling_calendar_oauth_states_expires_at" ON "scheduling_calendar_oauth_states" USING btree ("expires_at");