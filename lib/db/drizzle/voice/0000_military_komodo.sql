CREATE TABLE "voice_assistants" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"name" text NOT NULL,
	"template_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"provider" text,
	"provider_assistant_id" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_assistants_status" CHECK ("voice_assistants"."status" IN ('draft', 'published', 'error'))
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"provider" text NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_id" integer NOT NULL,
	"level" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_voice_issues_level" CHECK ("voice_issues"."level" IN ('info', 'warning', 'error', 'critical'))
);
--> statement-breakpoint
ALTER TABLE "voice_assistants" ADD CONSTRAINT "voice_assistants_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_issues" ADD CONSTRAINT "voice_issues_firm_id_intake_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."intake_firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_voice_assistants_firm_id_status" ON "voice_assistants" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "ix_voice_assistants_firm_id_updated_at" ON "voice_assistants" USING btree ("firm_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voice_assistants_provider_assistant_id" ON "voice_assistants" USING btree ("provider","provider_assistant_id") WHERE "voice_assistants"."provider" IS NOT NULL AND "voice_assistants"."provider_assistant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_provider_webhook_events_firm_id_created_at" ON "provider_webhook_events" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_provider_webhook_events_firm_id_processed_at" ON "provider_webhook_events" USING btree ("firm_id","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_provider_webhook_events_provider_event_key" ON "provider_webhook_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE INDEX "ix_voice_issues_firm_id_resolved_at" ON "voice_issues" USING btree ("firm_id","resolved_at");--> statement-breakpoint
CREATE INDEX "ix_voice_issues_firm_id_created_at" ON "voice_issues" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_voice_issues_firm_id_code" ON "voice_issues" USING btree ("firm_id","code");