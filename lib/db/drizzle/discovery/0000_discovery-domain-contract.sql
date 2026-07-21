-- Phase 2C.2B — SiteMint Project Discovery System domain contract.
-- Hand-authored custom migration (drizzle-kit generate --custom). Additive
-- only: new nullable/defaulted columns on the existing discovery_submissions
-- table, plus two brand-new tables (discovery_delivery_jobs,
-- discovery_ai_briefs). No table is dropped or renamed, no existing column
-- is altered or removed, no primary key changes, no data is modified or
-- backfilled, form_submissions is untouched. See
-- docs/sitemint-platform/DISCOVERY_DOMAIN_CONTRACT.md for the full contract.
-- This migration is generated and reviewed only — it is NOT applied to any
-- database by this checkpoint.

ALTER TABLE "discovery_submissions" ADD COLUMN "schema_version" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "form_version" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "idempotency_payload_hash" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "idempotency_payload_hash_key_version" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "idempotency_canonicalization_version" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_fingerprint" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "fingerprint_key_version" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_of_submission_id" integer;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_resolved_by" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "duplicate_resolution_reason_code" text;--> statement-breakpoint
ALTER TABLE "discovery_submissions" ADD COLUMN "privacy_policy_version" text;--> statement-breakpoint

ALTER TABLE "discovery_submissions" ADD CONSTRAINT "discovery_submissions_duplicate_of_submission_id_discovery_submissions_id_fk" FOREIGN KEY ("duplicate_of_submission_id") REFERENCES "public"."discovery_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "discovery_submissions" ADD CONSTRAINT "ck_discovery_submissions_duplicate_review_status" CHECK ("discovery_submissions"."duplicate_review_status" IN ('none', 'pending', 'cleared', 'confirmed_duplicate'));--> statement-breakpoint

CREATE UNIQUE INDEX "uq_discovery_submissions_idempotency_key" ON "discovery_submissions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ix_discovery_submissions_duplicate_fingerprint" ON "discovery_submissions" USING btree ("duplicate_fingerprint");--> statement-breakpoint
CREATE INDEX "ix_discovery_submissions_duplicate_review_status" ON "discovery_submissions" USING btree ("duplicate_review_status");--> statement-breakpoint
CREATE INDEX "ix_discovery_submissions_created_at" ON "discovery_submissions" USING btree ("created_at");--> statement-breakpoint

CREATE TABLE "discovery_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" integer NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"provider_message_id" text,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ck_discovery_delivery_jobs_job_type" CHECK ("discovery_delivery_jobs"."job_type" IN ('client_acknowledgment_email', 'internal_notification_email', 'crm_lead_upsert')),
	CONSTRAINT "ck_discovery_delivery_jobs_status" CHECK ("discovery_delivery_jobs"."status" IN ('pending', 'processing', 'retry_scheduled', 'completed', 'permanently_failed', 'cancelled'))
);
--> statement-breakpoint

CREATE TABLE "discovery_ai_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" integer NOT NULL,
	"brief_version" integer NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"structured_output" jsonb,
	"human_review_status" text DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ck_discovery_ai_briefs_status" CHECK ("discovery_ai_briefs"."status" IN ('pending', 'processing', 'retry_scheduled', 'generated', 'permanently_failed', 'cancelled')),
	CONSTRAINT "ck_discovery_ai_briefs_human_review_status" CHECK ("discovery_ai_briefs"."human_review_status" IN ('pending_review', 'approved', 'changes_requested', 'rejected', 'superseded'))
);
--> statement-breakpoint

ALTER TABLE "discovery_delivery_jobs" ADD CONSTRAINT "discovery_delivery_jobs_submission_id_discovery_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."discovery_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_ai_briefs" ADD CONSTRAINT "discovery_ai_briefs_submission_id_discovery_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."discovery_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "uq_discovery_delivery_jobs_submission_job_type" ON "discovery_delivery_jobs" USING btree ("submission_id","job_type");--> statement-breakpoint
CREATE INDEX "ix_discovery_delivery_jobs_status_next_attempt_at" ON "discovery_delivery_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ix_discovery_delivery_jobs_submission_id" ON "discovery_delivery_jobs" USING btree ("submission_id");--> statement-breakpoint

CREATE UNIQUE INDEX "uq_discovery_ai_briefs_submission_brief_version" ON "discovery_ai_briefs" USING btree ("submission_id","brief_version");--> statement-breakpoint
CREATE INDEX "ix_discovery_ai_briefs_status_next_attempt_at" ON "discovery_ai_briefs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ix_discovery_ai_briefs_human_review_status" ON "discovery_ai_briefs" USING btree ("human_review_status");--> statement-breakpoint
CREATE INDEX "ix_discovery_ai_briefs_submission_id" ON "discovery_ai_briefs" USING btree ("submission_id");