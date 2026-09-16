-- Push packet 0002: the push-managed (crm_*, intake_*, discovery_submissions)
-- schema changes between c8374dd and 11cf649, as reviewed additive SQL.
--
-- Source: drizzle-kit push against a disposable database built from c8374dd's
-- schema, upgraded to 11cf649's. That upgraded catalog matched a database
-- built from 11cf649 from empty, object for object (2,246 lines, 0 differences).
-- The staging workspace database (heliumdb 7d15e87d6b1b) was verified on
-- 2026-09-17 to match the c8374dd model exactly (448 objects, 0 extra,
-- 0 missing once PostgreSQL 18's NOT NULL catalog rows are set aside).
--
-- Contents (231 statements, all re-runnable):
--    55  CREATE TABLE
--    35  ALTER TABLE t ADD COLUMN
--    11  ALTER TABLE t ADD CONSTRAINT
--   103  CREATE INDEX
--    27  CREATE UNIQUE INDEX
--
-- Excluded from the push diff, with reasons — this packet drops nothing:
--   6 DROP CONSTRAINT + 6 matching ADD CONSTRAINT: foreign keys whose generated
--     names exceed Postgres's 63-byte identifier limit. Postgres stores them
--     truncated, push compares the full name, and so re-creates each identical
--     key on every run. The existing keys already enforce the same reference.
--       discovery_submissions_duplicate_of_submission_id_discovery_subm
--       crm_campaign_scheduled_messages_recipient_id_crm_campaign_recip
--       crm_campaign_scheduled_messages_step_id_crm_campaign_steps_id_f
--       crm_campaign_steps_branch_true_next_step_id_crm_campaign_steps_
--       crm_campaign_steps_branch_false_next_step_id_crm_campaign_steps
--       crm_campaign_events_campaign_recipient_id_crm_campaign_recipien
--   3 ALTER COLUMN "tags" SET DEFAULT '{}' (crm_leads, discovery_submissions,
--     helpdesk_tickets): those columns already carry that default.
--
-- Safe on populated tables: no added column is NOT NULL without a default, and
-- the one new CHECK (ck_crm_tasks_due_kind) holds for the new column's
-- 'date' default. Applied in one transaction by lib/db/src/apply-push-packet.mjs
-- after an identity check; a constraint that already exists is skipped.
--
-- Rollback: drop the tables and columns created here (their data is lost),
-- or restore the pre-packet backup.

CREATE TABLE IF NOT EXISTS "crm_lead_owner_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"value_key" text NOT NULL,
	"value_label" text NOT NULL,
	"staff_id" integer NOT NULL,
	"rule" text NOT NULL,
	"leads_updated" integer DEFAULT 0 NOT NULL,
	"legacy_name_added" boolean DEFAULT false NOT NULL,
	"decided_by_staff_id" integer,
	"decided_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_lead_owner_mappings_rule" CHECK ("crm_lead_owner_mappings"."rule" IN ('display_name', 'legacy_name', 'email', 'manual'))
);

CREATE TABLE IF NOT EXISTS "crm_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"domain" text,
	"website" text,
	"phone" text,
	"industry" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"notes" text,
	"owner_staff_id" integer,
	"created_by_staff_id" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_contact_merges" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"primary_lead_id" integer NOT NULL,
	"merged_lead_id" integer NOT NULL,
	"signal" text NOT NULL,
	"primary_snapshot" jsonb NOT NULL,
	"merged_snapshot" jsonb NOT NULL,
	"fields_filled" jsonb NOT NULL,
	"conflicts" jsonb NOT NULL,
	"moved" jsonb NOT NULL,
	"merged_by_staff_id" integer,
	"merged_by_label" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_duplicate_dismissals" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_id_low" integer NOT NULL,
	"lead_id_high" integer NOT NULL,
	"signal" text NOT NULL,
	"reason" text,
	"dismissed_by_staff_id" integer,
	"dismissed_by_label" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"password_hash" text,
	"password_updated_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"mfa_secret" text,
	"mfa_enrolled_at" timestamp with time zone,
	"mfa_recovery_hashes" text[] DEFAULT '{}'::text[] NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"legacy_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"extra_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"revoked_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"reminder_email_enabled" boolean DEFAULT false NOT NULL,
	"daily_digest_enabled" boolean DEFAULT false NOT NULL,
	"daily_digest_hour" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_by_staff_id" integer,
	CONSTRAINT "ck_crm_staff_role" CHECK ("crm_staff"."role" IN ('owner', 'technical_admin', 'operations_manager')),
	CONSTRAINT "ck_crm_staff_status" CHECK ("crm_staff"."status" IN ('invited', 'active', 'disabled')),
	CONSTRAINT "ck_crm_staff_email_lower" CHECK ("crm_staff"."email" = lower("crm_staff"."email"))
);

CREATE TABLE IF NOT EXISTS "crm_staff_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_staff_login_attempts_scope" CHECK ("crm_staff_login_attempts"."scope" IN ('ip', 'account'))
);

CREATE TABLE IF NOT EXISTS "crm_staff_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"mfa_satisfied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);

CREATE TABLE IF NOT EXISTS "crm_staff_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"delivery" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_staff_id" integer,
	CONSTRAINT "ck_crm_staff_tokens_kind" CHECK ("crm_staff_tokens"."kind" IN ('invite', 'password_reset'))
);

CREATE TABLE IF NOT EXISTS "crm_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_staff_id" integer,
	"requested_by_label" text NOT NULL,
	"approver_staff_id" integer,
	"decided_by_staff_id" integer,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_approvals_status" CHECK ("crm_approvals"."status" IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "crm_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" integer,
	"uploaded_by_staff_id" integer,
	"uploaded_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_crm_attachments_size" CHECK ("crm_attachments"."size_bytes" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"author_staff_id" integer,
	"author_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_crm_comments_entity_type" CHECK ("crm_comments"."entity_type" IN ('project', 'task', 'lead', 'deal', 'ticket', 'document'))
);

CREATE TABLE IF NOT EXISTS "crm_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"entity_type" text,
	"entity_id" integer,
	"read_at" timestamp with time zone,
	"occurrence_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_project_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"depends_on_milestone_id" integer,
	"blocked_reason" text,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_project_milestones_status" CHECK ("crm_project_milestones"."status" IN ('pending', 'in_progress', 'done', 'blocked'))
);

CREATE TABLE IF NOT EXISTS "crm_project_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_type" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "crm_project_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"body" text NOT NULL,
	"stage_at_update" text,
	"author_staff_id" integer,
	"author_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"dedupe_key" text NOT NULL,
	"external_dispatched_at" timestamp with time zone,
	"external_ref" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_scheduled_jobs_status" CHECK ("crm_scheduled_jobs"."status" IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "ck_crm_scheduled_jobs_attempts" CHECK ("crm_scheduled_jobs"."attempts" >= 0 AND "crm_scheduled_jobs"."attempts" <= "crm_scheduled_jobs"."max_attempts")
);

CREATE TABLE IF NOT EXISTS "crm_delivery_recovery_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_staff_id" integer,
	"actor_label" text NOT NULL,
	"previous_state" text NOT NULL,
	"previous_idempotency_key" text,
	"new_idempotency_key" text,
	"duplicate_risk" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_delivery_recovery_actions_action" CHECK ("crm_delivery_recovery_actions"."action" IN ('retry', 'resend', 'acknowledge')),
	CONSTRAINT "ck_crm_delivery_recovery_actions_reason" CHECK (length(btrim("crm_delivery_recovery_actions"."reason")) >= 3)
);

CREATE TABLE IF NOT EXISTS "crm_reminder_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"recipient_staff_id" integer,
	"recipient_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"attempt_started_at" timestamp with time zone,
	"attempt_worker" text,
	"provider_ref" text,
	"failure_reason" text,
	"failure_detail" text,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"last_recovery_action" text,
	"last_recovery_by_staff_id" integer,
	"last_recovery_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" integer,
	"resolution" text,
	"resolution_note" text,
	"origin" text DEFAULT 'live' NOT NULL,
	"legacy_raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crm_reminder_deliveries_occurrence" UNIQUE NULLS NOT DISTINCT("job_id","occurrence_at","recipient_staff_id","recipient_address"),
	CONSTRAINT "ck_crm_reminder_deliveries_state" CHECK ("crm_reminder_deliveries"."state" IN ('pending', 'attempting', 'accepted', 'refused', 'uncertain')),
	CONSTRAINT "ck_crm_reminder_deliveries_origin" CHECK ("crm_reminder_deliveries"."origin" IN ('live', 'migrated', 'migrated_unattributed', 'migrated_unparsed')),
	CONSTRAINT "ck_crm_reminder_deliveries_resolution" CHECK ("crm_reminder_deliveries"."resolution" IS NULL OR "crm_reminder_deliveries"."resolution" IN ('acknowledged', 'resent', 'accepted')),
	CONSTRAINT "ck_crm_reminder_deliveries_recovery_action" CHECK ("crm_reminder_deliveries"."last_recovery_action" IS NULL
      OR "crm_reminder_deliveries"."last_recovery_action" IN ('retry', 'resend', 'acknowledge')),
	CONSTRAINT "ck_crm_reminder_deliveries_recipient" CHECK (("crm_reminder_deliveries"."recipient_staff_id" IS NOT NULL AND "crm_reminder_deliveries"."recipient_address" IS NULL)
      OR ("crm_reminder_deliveries"."recipient_staff_id" IS NULL AND "crm_reminder_deliveries"."recipient_address" IS NOT NULL)
      OR ("crm_reminder_deliveries"."origin" <> 'live'
          AND "crm_reminder_deliveries"."recipient_staff_id" IS NULL
          AND "crm_reminder_deliveries"."recipient_address" IS NULL)),
	CONSTRAINT "ck_crm_reminder_deliveries_next_attempt" CHECK ("crm_reminder_deliveries"."next_attempt_at" IS NULL OR "crm_reminder_deliveries"."state" = 'pending'),
	CONSTRAINT "ck_crm_reminder_deliveries_attempt" CHECK ("crm_reminder_deliveries"."attempt" >= 0),
	CONSTRAINT "ck_crm_reminder_deliveries_resend_count" CHECK ("crm_reminder_deliveries"."resend_count" >= 0),
	CONSTRAINT "ck_crm_reminder_deliveries_resolved_pair" CHECK (("crm_reminder_deliveries"."resolved_at" IS NULL) = ("crm_reminder_deliveries"."resolution" IS NULL))
);

CREATE TABLE IF NOT EXISTS "crm_appointment_attendees" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointment_id" integer NOT NULL,
	"staff_id" integer,
	"external_email" text,
	"external_name" text,
	"response_status" text DEFAULT 'invited' NOT NULL,
	"invitation_outcome" text,
	"invitation_reason" text,
	"invitation_method" text,
	"invitation_sequence" integer,
	"invitation_at" timestamp with time zone,
	"invitation_provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_appointment_attendees_who" CHECK (("crm_appointment_attendees"."staff_id" IS NOT NULL) <> ("crm_appointment_attendees"."external_email" IS NOT NULL)),
	CONSTRAINT "ck_crm_appointment_attendees_response" CHECK ("crm_appointment_attendees"."response_status" IN ('invited', 'accepted', 'declined', 'tentative')),
	CONSTRAINT "ck_crm_appointment_attendees_invitation_outcome" CHECK ("crm_appointment_attendees"."invitation_outcome" IS NULL OR "crm_appointment_attendees"."invitation_outcome" IN ('sent', 'not_configured', 'rejected', 'failed', 'uncertain')),
	CONSTRAINT "ck_crm_appointment_attendees_invitation_method" CHECK ("crm_appointment_attendees"."invitation_method" IS NULL OR "crm_appointment_attendees"."invitation_method" IN ('REQUEST', 'CANCEL'))
);

CREATE TABLE IF NOT EXISTS "crm_appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"location" text,
	"meeting_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"lead_id" integer,
	"project_id" integer,
	"deal_id" integer,
	"organizer_staff_id" integer,
	"created_by_staff_id" integer,
	"created_by_label" text NOT NULL,
	"reminder_minutes_before" integer,
	"ical_sequence" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_staff_id" integer,
	"cancel_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_appointments_status" CHECK ("crm_appointments"."status" IN ('scheduled', 'cancelled', 'completed')),
	CONSTRAINT "ck_crm_appointments_order" CHECK ("crm_appointments"."end_at" >= "crm_appointments"."start_at")
);

CREATE TABLE IF NOT EXISTS "crm_attachment_blobs" (
	"attachment_id" integer PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_document_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"owner_staff_id" integer,
	"requested_by_staff_id" integer,
	"requested_by_label" text NOT NULL,
	"received_at" timestamp with time zone,
	"received_attachment_id" integer,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_document_requests_status" CHECK ("crm_document_requests"."status" IN ('pending', 'received', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "crm_document_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"attachment_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_downloads" integer,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_downloaded_at" timestamp with time zone,
	"shared_with_label" text
);

CREATE TABLE IF NOT EXISTS "crm_invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_invoice_line_items_amounts" CHECK ("crm_invoice_line_items"."quantity" > 0 AND "crm_invoice_line_items"."unit_price" >= 0 AND "crm_invoice_line_items"."line_total" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"deal_id" integer,
	"quote_id" integer,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"internal_notes" text,
	"issued_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"document_attachment_id" integer,
	"created_by_staff_id" integer,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_invoices_status" CHECK ("crm_invoices"."status" IN ('draft', 'issued', 'part_paid', 'paid', 'void')),
	CONSTRAINT "ck_crm_invoices_discount_type" CHECK ("crm_invoices"."discount_type" IN ('none', 'percent', 'amount')),
	CONSTRAINT "ck_crm_invoices_amounts" CHECK ("crm_invoices"."subtotal" >= 0 AND "crm_invoices"."total" >= 0
        AND "crm_invoices"."discount_amount" >= 0 AND "crm_invoices"."amount_paid" >= 0),
	CONSTRAINT "ck_crm_invoices_void_is_unpaid" CHECK ("crm_invoices"."status" <> 'void' OR "crm_invoices"."amount_paid" = 0)
);

CREATE TABLE IF NOT EXISTS "crm_quote_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_quote_line_items_amounts" CHECK ("crm_quote_line_items"."quantity" > 0 AND "crm_quote_line_items"."unit_price" >= 0 AND "crm_quote_line_items"."line_total" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"deal_id" integer,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"internal_notes" text,
	"valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_deal_id" integer,
	"accepted_typed_name" text,
	"accepted_from_ip" text,
	"accepted_by_portal_account_id" integer,
	"declined_at" timestamp with time zone,
	"declined_reason" text,
	"expired_at" timestamp with time zone,
	"document_attachment_id" integer,
	"created_by_staff_id" integer,
	"created_by_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_quotes_status" CHECK ("crm_quotes"."status" IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
	CONSTRAINT "ck_crm_quotes_discount_type" CHECK ("crm_quotes"."discount_type" IN ('none', 'percent', 'amount')),
	CONSTRAINT "ck_crm_quotes_amounts" CHECK ("crm_quotes"."subtotal" >= 0 AND "crm_quotes"."total" >= 0 AND "crm_quotes"."discount_amount" >= 0),
	CONSTRAINT "ck_crm_quotes_accepted_has_deal" CHECK ("crm_quotes"."status" <> 'accepted' OR "crm_quotes"."accepted_deal_id" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_kb_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_staff_id" integer,
	"author_label" text,
	"updated_by_staff_id" integer,
	"updated_by_label" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_kb_articles_status" CHECK ("crm_kb_articles"."status" IN ('draft', 'published')),
	CONSTRAINT "ck_crm_kb_articles_published_at" CHECK ("crm_kb_articles"."status" <> 'published' OR "crm_kb_articles"."published_at" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"visibility" text NOT NULL,
	"body" text NOT NULL,
	"sent_by_staff_id" integer,
	"sent_by_label" text,
	"origin" text NOT NULL,
	"delivery_state" text,
	"delivery_attempt" integer,
	"next_attempt_at" timestamp with time zone,
	"attempt_started_at" timestamp with time zone,
	"attempt_worker" text,
	"delivery_idempotency_key" text,
	"delivered_to" text,
	"delivery_provider_ref" text,
	"delivery_failure_reason" text,
	"delivery_failure_detail" text,
	"delivery_resend_count" integer,
	"last_recovery_action" text,
	"last_recovery_by_staff_id" integer,
	"last_recovery_at" timestamp with time zone,
	"delivery_resolved_at" timestamp with time zone,
	"delivery_resolved_by_staff_id" integer,
	"delivery_resolution" text,
	"delivery_resolution_note" text,
	"inbound_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_support_messages_visibility" CHECK ("crm_support_messages"."visibility" IN ('customer', 'internal')),
	CONSTRAINT "ck_crm_support_messages_origin" CHECK ("crm_support_messages"."origin" IN ('staff', 'customer', 'automated', 'legacy')),
	CONSTRAINT "ck_crm_support_messages_internal_is_ours" CHECK ("crm_support_messages"."visibility" <> 'internal' OR "crm_support_messages"."origin" <> 'customer'),
	CONSTRAINT "ck_crm_support_messages_delivery_state" CHECK ("crm_support_messages"."delivery_state" IS NULL OR "crm_support_messages"."delivery_state" IN (
      'pending', 'attempting', 'accepted', 'refused', 'uncertain')),
	CONSTRAINT "ck_crm_support_messages_recovery_action" CHECK ("crm_support_messages"."last_recovery_action" IS NULL OR "crm_support_messages"."last_recovery_action" IN (
      'retry', 'resend', 'acknowledge')),
	CONSTRAINT "ck_crm_support_messages_delivery_resolution" CHECK ("crm_support_messages"."delivery_resolution" IS NULL OR "crm_support_messages"."delivery_resolution" IN (
      'acknowledged', 'resent', 'accepted')),
	CONSTRAINT "ck_crm_support_messages_internal_never_sent" CHECK ("crm_support_messages"."visibility" = 'customer'
      OR ("crm_support_messages"."delivery_state" IS NULL
          AND "crm_support_messages"."delivery_idempotency_key" IS NULL
          AND "crm_support_messages"."delivered_to" IS NULL
          AND "crm_support_messages"."next_attempt_at" IS NULL
          AND "crm_support_messages"."delivery_provider_ref" IS NULL)),
	CONSTRAINT "ck_crm_support_messages_customer_words_never_sent" CHECK ("crm_support_messages"."origin" <> 'customer' OR "crm_support_messages"."delivery_state" IS NULL),
	CONSTRAINT "ck_crm_support_messages_next_attempt" CHECK ("crm_support_messages"."next_attempt_at" IS NULL OR "crm_support_messages"."delivery_state" = 'pending'),
	CONSTRAINT "ck_crm_support_messages_delivery_attempt" CHECK ("crm_support_messages"."delivery_attempt" IS NULL OR "crm_support_messages"."delivery_attempt" >= 0),
	CONSTRAINT "ck_crm_support_messages_resend_count" CHECK ("crm_support_messages"."delivery_resend_count" IS NULL OR "crm_support_messages"."delivery_resend_count" >= 0),
	CONSTRAINT "ck_crm_support_messages_resolved_pair" CHECK (("crm_support_messages"."delivery_resolved_at" IS NULL) = ("crm_support_messages"."delivery_resolution" IS NULL)),
	CONSTRAINT "ck_crm_support_messages_resolved_needs_delivery" CHECK ("crm_support_messages"."delivery_resolved_at" IS NULL OR "crm_support_messages"."delivery_state" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"request_type" text,
	"lead_id" integer NOT NULL,
	"project_id" integer,
	"assigned_to_staff_id" integer,
	"assigned_at" timestamp with time zone,
	"opened_by_staff_id" integer,
	"opened_by_label" text,
	"first_response_at" timestamp with time zone,
	"last_customer_message_at" timestamp with time zone,
	"last_staff_message_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" integer,
	"resolution" text,
	"resolution_note" text,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"kb_article_id" integer,
	"conversation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_support_tickets_status" CHECK ("crm_support_tickets"."status" IN ('new', 'open', 'waiting_on_customer', 'resolved', 'closed')),
	CONSTRAINT "ck_crm_support_tickets_priority" CHECK ("crm_support_tickets"."priority" IN ('urgent', 'high', 'normal', 'low')),
	CONSTRAINT "ck_crm_support_tickets_source" CHECK ("crm_support_tickets"."source" IN ('staff', 'service_request', 'email', 'phone')),
	CONSTRAINT "ck_crm_support_tickets_request_type" CHECK ("crm_support_tickets"."request_type" IS NULL OR "crm_support_tickets"."request_type" IN (
      'content_change', 'bug_report', 'new_feature', 'hosting_or_domain',
      'billing_question', 'training_or_how_to', 'access_request', 'other')),
	CONSTRAINT "ck_crm_support_tickets_resolution_value" CHECK ("crm_support_tickets"."resolution" IS NULL OR "crm_support_tickets"."resolution" IN (
      'fixed', 'answered', 'workaround_provided', 'duplicate', 'not_reproducible',
      'withdrawn_by_customer', 'no_response_from_customer', 'out_of_scope', 'other')),
	CONSTRAINT "ck_crm_support_tickets_resolution_required" CHECK ("crm_support_tickets"."status" NOT IN ('resolved', 'closed') OR "crm_support_tickets"."resolution" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_portal_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_portal_accounts_status" CHECK ("crm_portal_accounts"."status" IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS "crm_portal_document_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"attachment_id" integer NOT NULL,
	"granted_by_staff_id" integer,
	"granted_by_label" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_portal_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_staff_id" integer,
	"created_by_label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_staff_id" integer,
	"delivery_state" text,
	"delivery_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_portal_proposal_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"deal_id" integer NOT NULL,
	"portal_account_id" integer,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"typed_name" text NOT NULL,
	"accepted_from_ip" text,
	"deal_value_at_acceptance" numeric(10, 2),
	"deal_name_at_acceptance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_portal_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"portal_account_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preheader" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"segment_id" integer,
	"design_id" integer,
	"audience_mode" text DEFAULT 'segment' NOT NULL,
	"audience_definition" jsonb,
	"audience_lead_ids" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"scheduled_timezone" text,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"ai_content_state" text DEFAULT 'none' NOT NULL,
	"ai_drafted_at" timestamp with time zone,
	"ai_grounding" jsonb,
	"ai_approved_by_staff_id" integer,
	"ai_approved_by_label" text,
	"ai_approved_at" timestamp with time zone,
	"created_by_staff_id" integer,
	"created_by_label" text,
	"updated_by_staff_id" integer,
	"updated_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_marketing_campaigns_status" CHECK ("crm_marketing_campaigns"."status" IN ('draft','scheduled','sending','paused','cancelled','sent')),
	CONSTRAINT "ck_crm_marketing_campaigns_audience_mode" CHECK ("crm_marketing_campaigns"."audience_mode" IN ('segment','filter','list')),
	CONSTRAINT "ck_crm_marketing_campaigns_ai_state" CHECK ("crm_marketing_campaigns"."ai_content_state" IN ('none','draft','approved')),
	CONSTRAINT "ck_crm_marketing_campaigns_ai_approval" CHECK ("crm_marketing_campaigns"."ai_content_state" <> 'approved' OR "crm_marketing_campaigns"."ai_approved_at" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_marketing_designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text,
	"preheader" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_staff_id" integer,
	"created_by_label" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_marketing_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"reason" text,
	"excluded_by_staff_id" integer,
	"excluded_by_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_marketing_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"address" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"exclusion_reason" text,
	"exclusion_detail" text,
	"rendered_subject" text,
	"rendered_html" text,
	"fallbacks_used" jsonb,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_marketing_recipients_status" CHECK ("crm_marketing_recipients"."status" IN ('pending','sent','failed','excluded','test')),
	CONSTRAINT "ck_crm_marketing_recipients_exclusion_reason" CHECK ("crm_marketing_recipients"."status" <> 'excluded' OR "crm_marketing_recipients"."exclusion_reason" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_marketing_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"created_by_staff_id" integer,
	"created_by_label" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_automation_action_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"action_index" integer NOT NULL,
	"action_type" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"detail" text,
	"affected_record_type" text,
	"affected_record_id" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_automation_action_runs_status" CHECK ("crm_automation_action_runs"."status" IN (
    'succeeded', 'skipped', 'failed', 'unknown', 'awaiting_approval', 'rejected')),
	CONSTRAINT "ck_crm_automation_action_runs_type" CHECK ("crm_automation_action_runs"."action_type" IN (
    'assign_owner', 'create_task', 'notify', 'set_field', 'add_note',
    'schedule_follow_up', 'request_approval')),
	CONSTRAINT "ck_crm_automation_action_runs_attempts" CHECK ("crm_automation_action_runs"."attempts" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_automation_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"action_index" integer NOT NULL,
	"action_type" text NOT NULL,
	"approver_staff_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"record_type" text NOT NULL,
	"record_id" integer NOT NULL,
	"decided_by_staff_id" integer,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_automation_approvals_status" CHECK ("crm_automation_approvals"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "ck_crm_automation_approvals_reject_reason" CHECK ("crm_automation_approvals"."status" <> 'rejected' OR "crm_automation_approvals"."decision_reason" IS NOT NULL),
	CONSTRAINT "ck_crm_automation_approvals_decided" CHECK ("crm_automation_approvals"."status" = 'pending' OR "crm_automation_approvals"."decided_at" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_automation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"record_type" text NOT NULL,
	"record_id" integer NOT NULL,
	"occurrence_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chain_depth" integer DEFAULT 0 NOT NULL,
	"chain_rule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caused_by_execution_id" integer,
	"target_rule_ids" jsonb,
	"source" text DEFAULT 'producer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"processed_at" timestamp with time zone,
	"cancelled_reason" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_automation_events_status" CHECK ("crm_automation_events"."status" IN (
    'pending', 'processing', 'processed', 'cancelled', 'failed')),
	CONSTRAINT "ck_crm_automation_events_source" CHECK ("crm_automation_events"."source" IN ('producer', 'sweep', 'manual')),
	CONSTRAINT "ck_crm_automation_events_record_type" CHECK ("crm_automation_events"."record_type" IN (
    'lead', 'deal', 'task', 'appointment', 'document_request', 'message')),
	CONSTRAINT "ck_crm_automation_events_attempts" CHECK ("crm_automation_events"."attempts" >= 0 AND "crm_automation_events"."max_attempts" >= 1),
	CONSTRAINT "ck_crm_automation_events_cancel_needs_reason" CHECK ("crm_automation_events"."status" <> 'cancelled' OR "crm_automation_events"."cancelled_reason" IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "crm_automation_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"trigger" text NOT NULL,
	"record_type" text NOT NULL,
	"record_id" integer NOT NULL,
	"occurrence_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"condition_outcome" text DEFAULT 'not_evaluated' NOT NULL,
	"stop_reason" text,
	"detail" text,
	"chain_depth" integer DEFAULT 0 NOT NULL,
	"chain_rule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caused_by_execution_id" integer,
	"trigger_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"started_by_staff_id" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_automation_executions_status" CHECK ("crm_automation_executions"."status" IN (
    'queued', 'running', 'completed', 'failed', 'stopped', 'awaiting_approval')),
	CONSTRAINT "ck_crm_automation_executions_condition" CHECK ("crm_automation_executions"."condition_outcome" IN (
    'matched', 'not_matched', 'not_evaluated')),
	CONSTRAINT "ck_crm_automation_executions_stop_reason" CHECK ("crm_automation_executions"."stop_reason" IS NULL OR "crm_automation_executions"."stop_reason" IN (
    'stop_condition', 'approval_rejected', 'chain_depth_exceeded', 'rate_cap_exceeded',
    'rule_disabled', 'record_missing')),
	CONSTRAINT "ck_crm_automation_executions_stop_needs_reason" CHECK ("crm_automation_executions"."status" <> 'stopped' OR "crm_automation_executions"."stop_reason" IS NOT NULL),
	CONSTRAINT "ck_crm_automation_executions_record_type" CHECK ("crm_automation_executions"."record_type" IN (
    'lead', 'deal', 'task', 'appointment', 'document_request', 'message')),
	CONSTRAINT "ck_crm_automation_executions_depth" CHECK ("crm_automation_executions"."chain_depth" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_automation_recovery_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" integer NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_staff_id" integer,
	"actor_label" text NOT NULL,
	"previous_status" text NOT NULL,
	"previous_attempts" integer DEFAULT 0 NOT NULL,
	"previous_failure" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_automation_recovery_actions_target" CHECK ("crm_automation_recovery_actions"."target_kind" IN ('event', 'run')),
	CONSTRAINT "ck_crm_automation_recovery_actions_action" CHECK ("crm_automation_recovery_actions"."action" IN ('retry', 'acknowledge')),
	CONSTRAINT "ck_crm_automation_recovery_actions_reason" CHECK (length(btrim("crm_automation_recovery_actions"."reason")) >= 3),
	CONSTRAINT "ck_crm_automation_recovery_actions_attempts" CHECK ("crm_automation_recovery_actions"."previous_attempts" >= 0)
);

CREATE TABLE IF NOT EXISTS "crm_automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"conditions" jsonb DEFAULT '{"combine":"and","conditions":[]}'::jsonb NOT NULL,
	"stop_conditions" jsonb DEFAULT '{"combine":"or","conditions":[]}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_chain_depth" integer DEFAULT 3 NOT NULL,
	"window_cap" integer DEFAULT 5 NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"max_action_attempts" integer DEFAULT 3 NOT NULL,
	"inactivity_days" integer DEFAULT 14 NOT NULL,
	"created_by_staff_id" integer,
	"created_by_label" text,
	"updated_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "ck_crm_automation_rules_trigger" CHECK ("crm_automation_rules"."trigger" IN (
    'lead_created', 'lead_status_changed', 'deal_stage_changed', 'deal_won', 'deal_lost',
    'task_overdue', 'appointment_booked', 'document_request_completed',
    'inbound_message_received', 'no_activity_for_days')),
	CONSTRAINT "ck_crm_automation_rules_depth" CHECK ("crm_automation_rules"."max_chain_depth" >= 1 AND "crm_automation_rules"."max_chain_depth" <= 10),
	CONSTRAINT "ck_crm_automation_rules_window_cap" CHECK ("crm_automation_rules"."window_cap" >= 1 AND "crm_automation_rules"."window_cap" <= 500),
	CONSTRAINT "ck_crm_automation_rules_window_minutes" CHECK ("crm_automation_rules"."window_minutes" >= 1 AND "crm_automation_rules"."window_minutes" <= 10080),
	CONSTRAINT "ck_crm_automation_rules_attempts" CHECK ("crm_automation_rules"."max_action_attempts" >= 1 AND "crm_automation_rules"."max_action_attempts" <= 10),
	CONSTRAINT "ck_crm_automation_rules_inactivity_days" CHECK ("crm_automation_rules"."inactivity_days" >= 1 AND "crm_automation_rules"."inactivity_days" <= 365)
);

CREATE TABLE IF NOT EXISTS "crm_conversation_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"staff_id" integer,
	"external_address" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_crm_conv_participants_identity" CHECK (("crm_conversation_participants"."staff_id" IS NOT NULL AND "crm_conversation_participants"."external_address" IS NULL)
      OR ("crm_conversation_participants"."staff_id" IS NULL AND "crm_conversation_participants"."external_address" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS "crm_conversation_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crm_conversation_reads_staff_conv" UNIQUE("staff_id","conversation_id")
);

CREATE TABLE IF NOT EXISTS "crm_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"provider" text,
	"identity_key" text NOT NULL,
	"contact_id" integer,
	"external_address" text,
	"external_name" text,
	"subject" text,
	"provider_thread_ref" text,
	"reply_token" text,
	"reference_chain" text[],
	"status" text DEFAULT 'unassigned' NOT NULL,
	"assigned_to_staff_id" integer,
	"assigned_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" integer,
	"first_message_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crm_conversations_identity" UNIQUE("identity_key"),
	CONSTRAINT "uq_crm_conversations_reply_token" UNIQUE("reply_token"),
	CONSTRAINT "ck_crm_conversations_channel" CHECK ("crm_conversations"."channel" IN ('phone', 'email')),
	CONSTRAINT "ck_crm_conversations_status" CHECK ("crm_conversations"."status" IN ('unassigned', 'assigned', 'awaiting_customer', 'resolved'))
);

CREATE TABLE IF NOT EXISTS "crm_message_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"body" text,
	"subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crm_message_drafts_conv_staff" UNIQUE("conversation_id","staff_id")
);

CREATE TABLE IF NOT EXISTS "crm_email_send_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"halted_at" timestamp with time zone,
	"halt_reason" text,
	CONSTRAINT "uq_crm_email_send_counters_conv_window" UNIQUE("conversation_id","window_start")
);

CREATE TABLE IF NOT EXISTS "crm_email_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"bounce_type" text,
	"detail" text,
	"source" text DEFAULT 'provider' NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_crm_email_suppressions_address" UNIQUE("address")
);

CREATE TABLE IF NOT EXISTS "crm_inbound_email_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"svix_id" text NOT NULL,
	"email_id" text,
	"event_type" text NOT NULL,
	"state" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb,
	"message_id" integer,
	"conversation_id" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "uq_crm_inbound_email_events_svix" UNIQUE("svix_id")
);

CREATE TABLE IF NOT EXISTS "crm_unmatched_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" text,
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"headers" jsonb,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by_staff_id" integer,
	"resolved_at" timestamp with time zone,
	"attached_conversation_id" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_email_provider_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"svix_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_email_id" text,
	"crm_ref" text,
	"recipient" text,
	"sender_domain" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"click_link" text,
	"bounce_type" text,
	"detail" text,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"match_status" text,
	"matched_records" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "uq_crm_email_provider_events_svix" UNIQUE("svix_id"),
	CONSTRAINT "ck_crm_email_provider_events_state" CHECK ("crm_email_provider_events"."state" IN ('received', 'processing', 'processed', 'failed', 'ignored')),
	CONSTRAINT "ck_crm_email_provider_events_match" CHECK ("crm_email_provider_events"."match_status" IS NULL OR "crm_email_provider_events"."match_status" IN ('matched', 'unmatched', 'not_applicable')),
	CONSTRAINT "ck_crm_email_provider_events_attempts" CHECK ("crm_email_provider_events"."attempts" >= 0)
);

ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "assigned_to_staff_id" integer;

ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "company_id" integer;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "due_kind" text DEFAULT 'date' NOT NULL;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "assigned_to_staff_id" integer;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "created_by_staff_id" integer;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "completed_by_staff_id" integer;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "priority" text;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "remind_at" timestamp with time zone;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "recurrence" text;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "blocked_reason" text;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "checklist" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "crm_tasks" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "conversation_id" integer;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "sent_by_staff_id" integer;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "sent_by_label" text;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "origin" text;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "subject" text;

ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "provider_message_id" text;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "owner_staff_id" integer;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "probability" integer;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "won_at" timestamp with time zone;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "lost_at" timestamp with time zone;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "closed_by_staff_id" integer;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "lost_reason" text;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "lost_reason_detail" text;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "converted_project_id" integer;

ALTER TABLE "crm_deals" ADD COLUMN IF NOT EXISTS "converted_at" timestamp with time zone;

ALTER TABLE "crm_transactions" ADD COLUMN IF NOT EXISTS "invoice_id" integer;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "owner_staff_id" integer;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "collaborator_staff_ids" integer[] DEFAULT '{}'::integer[];

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "next_action" text;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "next_action_due_at" timestamp with time zone;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "blocked_reason" text;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "priority" text;

ALTER TABLE "crm_projects" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

ALTER TABLE "crm_lead_owner_mappings" ADD CONSTRAINT "crm_lead_owner_mappings_staff_id_crm_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "crm_lead_owner_mappings" ADD CONSTRAINT "crm_lead_owner_mappings_decided_by_staff_id_crm_staff_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_owner_staff_id_crm_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_created_by_staff_id_crm_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "crm_staff_sessions" ADD CONSTRAINT "crm_staff_sessions_staff_id_crm_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "crm_staff_tokens" ADD CONSTRAINT "crm_staff_tokens_staff_id_crm_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "crm_delivery_recovery_actions" ADD CONSTRAINT "crm_delivery_recovery_actions_delivery_id_crm_reminder_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."crm_reminder_deliveries"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "crm_reminder_deliveries" ADD CONSTRAINT "crm_reminder_deliveries_job_id_crm_scheduled_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "ix_crm_lead_owner_mappings_value_key" ON "crm_lead_owner_mappings" USING btree ("value_key");

CREATE INDEX IF NOT EXISTS "ix_crm_lead_owner_mappings_created_at" ON "crm_lead_owner_mappings" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_companies_normalized_name" ON "crm_companies" USING btree ("normalized_name");

CREATE INDEX IF NOT EXISTS "ix_crm_companies_domain" ON "crm_companies" USING btree ("domain");

CREATE INDEX IF NOT EXISTS "ix_crm_companies_owner_staff_id" ON "crm_companies" USING btree ("owner_staff_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_contact_merges_merged" ON "crm_contact_merges" USING btree ("merged_lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_contact_merges_primary" ON "crm_contact_merges" USING btree ("primary_lead_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_duplicate_dismissals_pair" ON "crm_duplicate_dismissals" USING btree ("lead_id_low","lead_id_high");

CREATE INDEX IF NOT EXISTS "ix_crm_duplicate_dismissals_low" ON "crm_duplicate_dismissals" USING btree ("lead_id_low");

CREATE INDEX IF NOT EXISTS "ix_crm_duplicate_dismissals_high" ON "crm_duplicate_dismissals" USING btree ("lead_id_high");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_staff_email" ON "crm_staff" USING btree ("email");

CREATE INDEX IF NOT EXISTS "ix_crm_staff_status" ON "crm_staff" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ix_crm_staff_login_attempts_lookup" ON "crm_staff_login_attempts" USING btree ("scope","subject","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_staff_sessions_token_hash" ON "crm_staff_sessions" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "ix_crm_staff_sessions_staff_id" ON "crm_staff_sessions" USING btree ("staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_staff_sessions_expires_at" ON "crm_staff_sessions" USING btree ("expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_staff_tokens_token_hash" ON "crm_staff_tokens" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "ix_crm_staff_tokens_staff_kind" ON "crm_staff_tokens" USING btree ("staff_id","kind");

CREATE INDEX IF NOT EXISTS "ix_crm_approvals_entity" ON "crm_approvals" USING btree ("entity_type","entity_id");

CREATE INDEX IF NOT EXISTS "ix_crm_approvals_status" ON "crm_approvals" USING btree ("status","approver_staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_attachments_entity" ON "crm_attachments" USING btree ("entity_type","entity_id");

CREATE INDEX IF NOT EXISTS "ix_crm_comments_entity" ON "crm_comments" USING btree ("entity_type","entity_id","created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_notifications_staff" ON "crm_notifications" USING btree ("staff_id","read_at","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_notifications_occurrence" ON "crm_notifications" USING btree ("occurrence_key") WHERE "crm_notifications"."occurrence_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_project_milestones_project" ON "crm_project_milestones" USING btree ("project_id","order_index");

CREATE INDEX IF NOT EXISTS "ix_crm_project_milestones_due" ON "crm_project_milestones" USING btree ("due_date");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_project_templates_name" ON "crm_project_templates" USING btree ("name");

CREATE INDEX IF NOT EXISTS "ix_crm_project_updates_project" ON "crm_project_updates" USING btree ("project_id","created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_scheduled_jobs_dedupe_key" ON "crm_scheduled_jobs" USING btree ("dedupe_key");

CREATE INDEX IF NOT EXISTS "ix_crm_scheduled_jobs_due" ON "crm_scheduled_jobs" USING btree ("status","run_at");

CREATE INDEX IF NOT EXISTS "ix_crm_delivery_recovery_actions_delivery" ON "crm_delivery_recovery_actions" USING btree ("delivery_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_delivery_recovery_actions_actor" ON "crm_delivery_recovery_actions" USING btree ("actor_staff_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_reminder_deliveries_job" ON "crm_reminder_deliveries" USING btree ("job_id");

CREATE INDEX IF NOT EXISTS "ix_crm_reminder_deliveries_state_occurrence" ON "crm_reminder_deliveries" USING btree ("state","occurrence_at");

CREATE INDEX IF NOT EXISTS "ix_crm_reminder_deliveries_due" ON "crm_reminder_deliveries" USING btree ("state","next_attempt_at");

CREATE INDEX IF NOT EXISTS "ix_crm_appointment_attendees_appointment" ON "crm_appointment_attendees" USING btree ("appointment_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_appointment_attendees_staff" ON "crm_appointment_attendees" USING btree ("appointment_id","staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_appointments_start" ON "crm_appointments" USING btree ("start_at");

CREATE INDEX IF NOT EXISTS "ix_crm_appointments_organizer" ON "crm_appointments" USING btree ("organizer_staff_id","start_at");

CREATE INDEX IF NOT EXISTS "ix_crm_appointments_lead" ON "crm_appointments" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_document_requests_entity" ON "crm_document_requests" USING btree ("entity_type","entity_id");

CREATE INDEX IF NOT EXISTS "ix_crm_document_requests_status_due" ON "crm_document_requests" USING btree ("status","due_date");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_document_shares_token_hash" ON "crm_document_shares" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "ix_crm_document_shares_attachment" ON "crm_document_shares" USING btree ("attachment_id");

CREATE INDEX IF NOT EXISTS "ix_crm_invoice_line_items_invoice" ON "crm_invoice_line_items" USING btree ("invoice_id","position");

CREATE INDEX IF NOT EXISTS "ix_crm_invoices_lead" ON "crm_invoices" USING btree ("lead_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_invoices_deal" ON "crm_invoices" USING btree ("deal_id");

CREATE INDEX IF NOT EXISTS "ix_crm_invoices_quote" ON "crm_invoices" USING btree ("quote_id");

CREATE INDEX IF NOT EXISTS "ix_crm_invoices_status_due" ON "crm_invoices" USING btree ("status","due_date");

CREATE INDEX IF NOT EXISTS "ix_crm_quote_line_items_quote" ON "crm_quote_line_items" USING btree ("quote_id","position");

CREATE INDEX IF NOT EXISTS "ix_crm_quotes_lead" ON "crm_quotes" USING btree ("lead_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_quotes_deal" ON "crm_quotes" USING btree ("deal_id");

CREATE INDEX IF NOT EXISTS "ix_crm_quotes_status" ON "crm_quotes" USING btree ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_kb_articles_slug" ON "crm_kb_articles" USING btree ("slug");

CREATE INDEX IF NOT EXISTS "ix_crm_kb_articles_status_id" ON "crm_kb_articles" USING btree ("status","id");

CREATE INDEX IF NOT EXISTS "ix_crm_kb_articles_category" ON "crm_kb_articles" USING btree ("category");

CREATE INDEX IF NOT EXISTS "ix_crm_support_messages_ticket" ON "crm_support_messages" USING btree ("ticket_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_messages_visibility" ON "crm_support_messages" USING btree ("ticket_id","visibility","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_support_messages_idempotency" ON "crm_support_messages" USING btree ("delivery_idempotency_key") WHERE "crm_support_messages"."delivery_idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_support_messages_inbound" ON "crm_support_messages" USING btree ("inbound_message_id") WHERE "crm_support_messages"."inbound_message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_support_messages_delivery_due" ON "crm_support_messages" USING btree ("delivery_state","next_attempt_at") WHERE "crm_support_messages"."delivery_state" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_support_messages_delivery_open" ON "crm_support_messages" USING btree ("delivery_state","id") WHERE "crm_support_messages"."delivery_state" IS NOT NULL AND "crm_support_messages"."delivery_resolved_at" IS NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_status_id" ON "crm_support_tickets" USING btree ("status","id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_conversation" ON "crm_support_tickets" USING btree ("conversation_id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_assignee_id" ON "crm_support_tickets" USING btree ("assigned_to_staff_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_priority_id" ON "crm_support_tickets" USING btree ("priority","id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_lead" ON "crm_support_tickets" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_support_tickets_project" ON "crm_support_tickets" USING btree ("project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_accounts_lead" ON "crm_portal_accounts" USING btree ("lead_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_accounts_email" ON "crm_portal_accounts" USING btree ("email");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_document_grants" ON "crm_portal_document_grants" USING btree ("lead_id","attachment_id");

CREATE INDEX IF NOT EXISTS "ix_crm_portal_document_grants_lead" ON "crm_portal_document_grants" USING btree ("lead_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_invitations_token_hash" ON "crm_portal_invitations" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "ix_crm_portal_invitations_lead" ON "crm_portal_invitations" USING btree ("lead_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_proposal_acceptances_deal" ON "crm_portal_proposal_acceptances" USING btree ("deal_id");

CREATE INDEX IF NOT EXISTS "ix_crm_portal_proposal_acceptances_lead" ON "crm_portal_proposal_acceptances" USING btree ("lead_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_portal_sessions_token_hash" ON "crm_portal_sessions" USING btree ("token_hash");

CREATE INDEX IF NOT EXISTS "ix_crm_portal_sessions_account" ON "crm_portal_sessions" USING btree ("portal_account_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_campaigns_status" ON "crm_marketing_campaigns" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_campaigns_segment" ON "crm_marketing_campaigns" USING btree ("segment_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_marketing_designs_name" ON "crm_marketing_designs" USING btree ("name");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_designs_archived" ON "crm_marketing_designs" USING btree ("archived_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_marketing_exclusions" ON "crm_marketing_exclusions" USING btree ("campaign_id","lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_exclusions_campaign" ON "crm_marketing_exclusions" USING btree ("campaign_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_marketing_recipients" ON "crm_marketing_recipients" USING btree ("campaign_id","lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_recipients_campaign_status" ON "crm_marketing_recipients" USING btree ("campaign_id","status");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_marketing_segments_name" ON "crm_marketing_segments" USING btree ("name");

CREATE INDEX IF NOT EXISTS "ix_crm_marketing_segments_archived" ON "crm_marketing_segments" USING btree ("archived_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_automation_action_runs_step" ON "crm_automation_action_runs" USING btree ("execution_id","action_index");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_action_runs_execution" ON "crm_automation_action_runs" USING btree ("execution_id","action_index");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_action_runs_affected" ON "crm_automation_action_runs" USING btree ("affected_record_type","affected_record_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_automation_approvals_step" ON "crm_automation_approvals" USING btree ("execution_id","action_index");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_approvals_pending" ON "crm_automation_approvals" USING btree ("status","approver_staff_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_approvals_rule" ON "crm_automation_approvals" USING btree ("rule_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_automation_events_occurrence" ON "crm_automation_events" USING btree ("trigger","record_type","record_id","occurrence_key");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_events_due" ON "crm_automation_events" USING btree ("status","next_attempt_at");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_events_record" ON "crm_automation_events" USING btree ("record_type","record_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_automation_executions_occurrence" ON "crm_automation_executions" USING btree ("rule_id","trigger","record_type","record_id","occurrence_key");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_executions_rule" ON "crm_automation_executions" USING btree ("rule_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_executions_record" ON "crm_automation_executions" USING btree ("record_type","record_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_executions_status" ON "crm_automation_executions" USING btree ("status","next_attempt_at");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_executions_window" ON "crm_automation_executions" USING btree ("rule_id","record_id","created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_recovery_actions_target" ON "crm_automation_recovery_actions" USING btree ("target_kind","target_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_recovery_actions_actor" ON "crm_automation_recovery_actions" USING btree ("actor_staff_id","id");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_rules_trigger" ON "crm_automation_rules" USING btree ("trigger","enabled");

CREATE INDEX IF NOT EXISTS "ix_crm_automation_rules_archived" ON "crm_automation_rules" USING btree ("archived_at");

CREATE INDEX IF NOT EXISTS "ix_crm_conv_participants_conversation" ON "crm_conversation_participants" USING btree ("conversation_id");

CREATE INDEX IF NOT EXISTS "ix_crm_conversation_reads_staff" ON "crm_conversation_reads" USING btree ("staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_conversations_last_message" ON "crm_conversations" USING btree ("last_message_at");

CREATE INDEX IF NOT EXISTS "ix_crm_conversations_status" ON "crm_conversations" USING btree ("status","last_message_at");

CREATE INDEX IF NOT EXISTS "ix_crm_conversations_contact" ON "crm_conversations" USING btree ("contact_id");

CREATE INDEX IF NOT EXISTS "ix_crm_conversations_assignee" ON "crm_conversations" USING btree ("assigned_to_staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_conversations_external" ON "crm_conversations" USING btree ("external_address");

CREATE INDEX IF NOT EXISTS "ix_crm_message_drafts_staff" ON "crm_message_drafts" USING btree ("staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_email_suppressions_reason" ON "crm_email_suppressions" USING btree ("reason");

CREATE INDEX IF NOT EXISTS "ix_crm_inbound_email_events_email" ON "crm_inbound_email_events" USING btree ("email_id");

CREATE INDEX IF NOT EXISTS "ix_crm_inbound_email_events_state" ON "crm_inbound_email_events" USING btree ("state","received_at");

CREATE INDEX IF NOT EXISTS "ix_crm_unmatched_emails_status" ON "crm_unmatched_emails" USING btree ("status","received_at");

CREATE INDEX IF NOT EXISTS "ix_crm_email_provider_events_email" ON "crm_email_provider_events" USING btree ("provider_email_id","event_type");

CREATE INDEX IF NOT EXISTS "ix_crm_email_provider_events_ref" ON "crm_email_provider_events" USING btree ("crm_ref");

CREATE INDEX IF NOT EXISTS "ix_crm_email_provider_events_type_occurred" ON "crm_email_provider_events" USING btree ("event_type","occurred_at");

CREATE INDEX IF NOT EXISTS "ix_crm_email_provider_events_work" ON "crm_email_provider_events" USING btree ("state","next_attempt_at");

CREATE INDEX IF NOT EXISTS "ix_crm_email_provider_events_domain" ON "crm_email_provider_events" USING btree ("sender_domain","event_type","occurred_at");

ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_assigned_to_staff_id_crm_staff_id_fk" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "public"."crm_staff"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "ix_crm_leads_assigned_to_staff_id" ON "crm_leads" USING btree ("assigned_to_staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_leads_company_id" ON "crm_leads" USING btree ("company_id");

CREATE INDEX IF NOT EXISTS "ix_crm_tasks_assignee_status_due" ON "crm_tasks" USING btree ("assigned_to_staff_id","status","due_date");

CREATE INDEX IF NOT EXISTS "ix_crm_tasks_remind_at" ON "crm_tasks" USING btree ("remind_at");

CREATE INDEX IF NOT EXISTS "ix_crm_messages_conversation" ON "crm_messages" USING btree ("conversation_id","created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_messages_sent_by" ON "crm_messages" USING btree ("sent_by_staff_id");

CREATE INDEX IF NOT EXISTS "ix_crm_transactions_invoice" ON "crm_transactions" USING btree ("invoice_id");

ALTER TABLE "crm_tasks" ADD CONSTRAINT "ck_crm_tasks_due_kind" CHECK ("crm_tasks"."due_kind" IN ('date', 'time'));
