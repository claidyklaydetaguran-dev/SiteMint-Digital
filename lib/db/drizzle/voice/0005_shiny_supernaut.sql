CREATE TABLE "voice_call_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text NOT NULL,
	"call_id" text NOT NULL,
	"review_state" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_call_reviews_state" CHECK ("voice_call_reviews"."review_state" IN ('reviewed', 'flagged')),
	CONSTRAINT "ck_voice_call_reviews_note_length" CHECK ("voice_call_reviews"."note" IS NULL OR char_length("voice_call_reviews"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "voice_usage_cap_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"period_ym" text NOT NULL,
	"cap_minutes" integer NOT NULL,
	"used_seconds_at_detection" integer NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_usage_cap_states_cap" CHECK ("voice_usage_cap_states"."cap_minutes" > 0),
	CONSTRAINT "ck_voice_usage_cap_states_used" CHECK ("voice_usage_cap_states"."used_seconds_at_detection" >= 0),
	CONSTRAINT "ck_voice_usage_cap_states_state" CHECK ("voice_usage_cap_states"."state" IN ('pause_requested', 'cleared')),
	CONSTRAINT "ck_voice_usage_cap_states_period_shape" CHECK ("voice_usage_cap_states"."period_ym" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "voice_usage_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text NOT NULL,
	"call_id" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"source" text NOT NULL,
	"period_ym" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_usage_ledger_duration" CHECK ("voice_usage_ledger"."duration_sec" >= 0 AND "voice_usage_ledger"."duration_sec" <= 86400),
	CONSTRAINT "ck_voice_usage_ledger_source" CHECK ("voice_usage_ledger"."source" IN ('end_of_call_report', 'reconciliation')),
	CONSTRAINT "ck_voice_usage_ledger_period_shape" CHECK ("voice_usage_ledger"."period_ym" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "voice_call_reviews" ADD CONSTRAINT "voice_call_reviews_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_usage_cap_states" ADD CONSTRAINT "voice_usage_cap_states_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_usage_ledger" ADD CONSTRAINT "voice_usage_ledger_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_call_reviews_call" ON "voice_call_reviews" USING btree ("firm_id","provider","call_id");--> statement-breakpoint
CREATE INDEX "ix_voice_call_reviews_firm_state" ON "voice_call_reviews" USING btree ("firm_id","review_state");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_usage_cap_states_firm_period" ON "voice_usage_cap_states" USING btree ("firm_id","period_ym");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_usage_ledger_call" ON "voice_usage_ledger" USING btree ("provider","call_id");--> statement-breakpoint
CREATE INDEX "ix_voice_usage_ledger_firm_period" ON "voice_usage_ledger" USING btree ("firm_id","period_ym");