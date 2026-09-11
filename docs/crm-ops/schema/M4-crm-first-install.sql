-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — FIRST INSTALLATION of the complete crm_* schema
--
-- For an environment that has never had the CRM. The release runbook used to
-- say "apply the whole crm_* set", naming no file and no command, which is not
-- something an integration owner can execute. This is that file.
--
-- Produced by `pg_dump --schema-only --no-owner --no-privileges` restricted to
-- `public.crm_*` from a database at the candidate commit, then guarded and
-- reviewed. It is NOT a `drizzle-kit push`: push prompts interactively, and
-- its `tablesFilter` narrows introspection so that every non-CRM table looks
-- absent — which makes its output unreviewable and its prompts unanswerable
-- during a deployment.
--
-- PROPERTIES
--   * 60 tables, all `crm_*`. No voice_*, intake_*, discovery_*,
--     scheduling_*, helpdesk_* or stripe.* object is referenced.
--   * Schema only. Contains no rows, no credentials, no customer data.
--   * Idempotent, and this was verified by running it twice against a virgin
--     database and comparing table, index and constraint counts. Every CREATE
--     is IF NOT EXISTS; each of the 82 named constraints is applied only
--     when `pg_constraint` does not already hold it, because PostgreSQL has no
--     `ADD CONSTRAINT IF NOT EXISTS`.
--   * Safe inside one transaction.
--
-- WHEN TO USE THIS FILE
--   * First installation → this file alone. It already contains every column
--     the M3 and M4 upgrade files add, so do NOT also run those afterwards.
--     They would be no-ops, but running them invites the belief that a first
--     install is an upgrade.
--   * Existing CRM → do NOT use this file. Apply the incremental upgrade
--     artifacts (M3-*.sql, M4-*.sql) in the order §5 of RELEASE-PACKAGE.md
--     gives.
--
-- VERIFY AFTER RUNNING
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name LIKE 'crm\_%';
--   -- expected: 60
--
-- TABLES CREATED
--   crm_activities
--   crm_admin_audit_log
--   crm_admin_sessions
--   crm_appointment_attendees
--   crm_appointments
--   crm_approvals
--   crm_attachment_blobs
--   crm_attachments
--   crm_automation_action_runs
--   crm_automation_approvals
--   crm_automation_executions
--   crm_automation_rules
--   crm_behavioral_events
--   crm_campaign_events
--   crm_campaign_recipients
--   crm_campaign_scheduled_messages
--   crm_campaign_steps
--   crm_campaigns
--   crm_comments
--   crm_conversation_participants
--   crm_conversation_reads
--   crm_conversations
--   crm_deals
--   crm_delivery_recovery_actions
--   crm_document_requests
--   crm_document_shares
--   crm_email_send_counters
--   crm_email_suppressions
--   crm_email_templates
--   crm_inbound_email_events
--   crm_kb_articles
--   crm_leads
--   crm_marketing_campaigns
--   crm_marketing_designs
--   crm_marketing_exclusions
--   crm_marketing_recipients
--   crm_marketing_segments
--   crm_message_drafts
--   crm_messages
--   crm_notifications
--   crm_portal_accounts
--   crm_portal_document_grants
--   crm_portal_invitations
--   crm_portal_proposal_acceptances
--   crm_portal_sessions
--   crm_project_milestones
--   crm_project_templates
--   crm_project_updates
--   crm_projects
--   crm_reminder_deliveries
--   crm_scheduled_jobs
--   crm_staff
--   crm_staff_login_attempts
--   crm_staff_sessions
--   crm_staff_tokens
--   crm_support_messages
--   crm_support_tickets
--   crm_tasks
--   crm_transactions
--   crm_unmatched_emails
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_activities (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb,
    created_by text DEFAULT 'admin'::text NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_activities_id_seq OWNED BY public.crm_activities.id;

CREATE TABLE IF NOT EXISTS public.crm_admin_audit_log (
    id integer NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    target text,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_admin_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_admin_audit_log_id_seq OWNED BY public.crm_admin_audit_log.id;

CREATE TABLE IF NOT EXISTS public.crm_admin_sessions (
    id integer NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip text,
    user_agent text,
    revoked_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_admin_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_admin_sessions_id_seq OWNED BY public.crm_admin_sessions.id;

CREATE TABLE IF NOT EXISTS public.crm_appointment_attendees (
    id integer NOT NULL,
    appointment_id integer NOT NULL,
    staff_id integer,
    external_email text,
    external_name text,
    response_status text DEFAULT 'invited'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_appointment_attendees_response CHECK ((response_status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'tentative'::text]))),
    CONSTRAINT ck_crm_appointment_attendees_who CHECK (((staff_id IS NOT NULL) <> (external_email IS NOT NULL)))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_appointment_attendees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_appointment_attendees_id_seq OWNED BY public.crm_appointment_attendees.id;

CREATE TABLE IF NOT EXISTS public.crm_appointments (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    location text,
    meeting_url text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    lead_id integer,
    project_id integer,
    deal_id integer,
    organizer_staff_id integer,
    created_by_staff_id integer,
    created_by_label text NOT NULL,
    reminder_minutes_before integer,
    cancelled_at timestamp with time zone,
    cancelled_by_staff_id integer,
    cancel_reason text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_appointments_order CHECK ((end_at >= start_at)),
    CONSTRAINT ck_crm_appointments_status CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_appointments_id_seq OWNED BY public.crm_appointments.id;

CREATE TABLE IF NOT EXISTS public.crm_approvals (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    title text NOT NULL,
    detail text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by_staff_id integer,
    requested_by_label text NOT NULL,
    approver_staff_id integer,
    decided_by_staff_id integer,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_approvals_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_approvals_id_seq OWNED BY public.crm_approvals.id;

CREATE TABLE IF NOT EXISTS public.crm_attachment_blobs (
    attachment_id integer NOT NULL,
    bytes bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS public.crm_attachments (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_key text NOT NULL,
    content_hash text,
    version integer DEFAULT 1 NOT NULL,
    supersedes_id integer,
    uploaded_by_staff_id integer,
    uploaded_by_label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ck_crm_attachments_size CHECK ((size_bytes >= 0))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_attachments_id_seq OWNED BY public.crm_attachments.id;

CREATE TABLE IF NOT EXISTS public.crm_automation_action_runs (
    id integer NOT NULL,
    execution_id integer NOT NULL,
    action_index integer NOT NULL,
    action_type text NOT NULL,
    status text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    detail text,
    affected_record_type text,
    affected_record_id integer,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_automation_action_runs_attempts CHECK ((attempts >= 0)),
    CONSTRAINT ck_crm_automation_action_runs_status CHECK ((status = ANY (ARRAY['succeeded'::text, 'skipped'::text, 'failed'::text, 'unknown'::text, 'awaiting_approval'::text, 'rejected'::text]))),
    CONSTRAINT ck_crm_automation_action_runs_type CHECK ((action_type = ANY (ARRAY['assign_owner'::text, 'create_task'::text, 'notify'::text, 'set_field'::text, 'add_note'::text, 'schedule_follow_up'::text, 'request_approval'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_automation_action_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_automation_action_runs_id_seq OWNED BY public.crm_automation_action_runs.id;

CREATE TABLE IF NOT EXISTS public.crm_automation_approvals (
    id integer NOT NULL,
    execution_id integer NOT NULL,
    rule_id integer NOT NULL,
    action_index integer NOT NULL,
    action_type text NOT NULL,
    approver_staff_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    summary text NOT NULL,
    record_type text NOT NULL,
    record_id integer NOT NULL,
    decided_by_staff_id integer,
    decided_at timestamp with time zone,
    decision_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_automation_approvals_decided CHECK (((status = 'pending'::text) OR (decided_at IS NOT NULL))),
    CONSTRAINT ck_crm_automation_approvals_reject_reason CHECK (((status <> 'rejected'::text) OR (decision_reason IS NOT NULL))),
    CONSTRAINT ck_crm_automation_approvals_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_automation_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_automation_approvals_id_seq OWNED BY public.crm_automation_approvals.id;

CREATE TABLE IF NOT EXISTS public.crm_automation_executions (
    id integer NOT NULL,
    rule_id integer NOT NULL,
    trigger text NOT NULL,
    record_type text NOT NULL,
    record_id integer NOT NULL,
    occurrence_key text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    condition_outcome text DEFAULT 'not_evaluated'::text NOT NULL,
    stop_reason text,
    detail text,
    chain_depth integer DEFAULT 0 NOT NULL,
    chain_rule_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    caused_by_execution_id integer,
    trigger_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    started_by_staff_id integer,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_automation_executions_condition CHECK ((condition_outcome = ANY (ARRAY['matched'::text, 'not_matched'::text, 'not_evaluated'::text]))),
    CONSTRAINT ck_crm_automation_executions_depth CHECK ((chain_depth >= 0)),
    CONSTRAINT ck_crm_automation_executions_record_type CHECK ((record_type = ANY (ARRAY['lead'::text, 'deal'::text, 'task'::text, 'appointment'::text, 'document_request'::text, 'message'::text]))),
    CONSTRAINT ck_crm_automation_executions_status CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'stopped'::text, 'awaiting_approval'::text]))),
    CONSTRAINT ck_crm_automation_executions_stop_needs_reason CHECK (((status <> 'stopped'::text) OR (stop_reason IS NOT NULL))),
    CONSTRAINT ck_crm_automation_executions_stop_reason CHECK (((stop_reason IS NULL) OR (stop_reason = ANY (ARRAY['stop_condition'::text, 'approval_rejected'::text, 'chain_depth_exceeded'::text, 'rate_cap_exceeded'::text, 'rule_disabled'::text, 'record_missing'::text]))))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_automation_executions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_automation_executions_id_seq OWNED BY public.crm_automation_executions.id;

CREATE TABLE IF NOT EXISTS public.crm_automation_rules (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    trigger text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    conditions jsonb DEFAULT '{"combine": "and", "conditions": []}'::jsonb NOT NULL,
    stop_conditions jsonb DEFAULT '{"combine": "or", "conditions": []}'::jsonb NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    max_chain_depth integer DEFAULT 3 NOT NULL,
    window_cap integer DEFAULT 5 NOT NULL,
    window_minutes integer DEFAULT 60 NOT NULL,
    max_action_attempts integer DEFAULT 3 NOT NULL,
    created_by_staff_id integer,
    created_by_label text,
    updated_by_staff_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT ck_crm_automation_rules_attempts CHECK (((max_action_attempts >= 1) AND (max_action_attempts <= 10))),
    CONSTRAINT ck_crm_automation_rules_depth CHECK (((max_chain_depth >= 1) AND (max_chain_depth <= 10))),
    CONSTRAINT ck_crm_automation_rules_trigger CHECK ((trigger = ANY (ARRAY['lead_created'::text, 'lead_status_changed'::text, 'deal_stage_changed'::text, 'deal_won'::text, 'deal_lost'::text, 'task_overdue'::text, 'appointment_booked'::text, 'document_request_completed'::text, 'inbound_message_received'::text, 'no_activity_for_days'::text]))),
    CONSTRAINT ck_crm_automation_rules_window_cap CHECK (((window_cap >= 1) AND (window_cap <= 500))),
    CONSTRAINT ck_crm_automation_rules_window_minutes CHECK (((window_minutes >= 1) AND (window_minutes <= 10080)))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_automation_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_automation_rules_id_seq OWNED BY public.crm_automation_rules.id;

CREATE TABLE IF NOT EXISTS public.crm_behavioral_events (
    id integer NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer NOT NULL,
    event_type text NOT NULL,
    label text,
    d_client_intent numeric(5,2),
    d_urgency numeric(5,2),
    d_trust numeric(5,2),
    d_project_readiness numeric(5,2),
    d_budget_confidence numeric(5,2),
    d_communication_score numeric(5,2),
    d_referral_probability numeric(5,2),
    metadata jsonb
);

CREATE SEQUENCE IF NOT EXISTS public.crm_behavioral_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_behavioral_events_id_seq OWNED BY public.crm_behavioral_events.id;

CREATE TABLE IF NOT EXISTS public.crm_campaign_events (
    id integer NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_recipient_id integer NOT NULL,
    event_type text NOT NULL,
    metadata jsonb
);

CREATE SEQUENCE IF NOT EXISTS public.crm_campaign_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_campaign_events_id_seq OWNED BY public.crm_campaign_events.id;

CREATE TABLE IF NOT EXISTS public.crm_campaign_recipients (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    campaign_id integer NOT NULL,
    lead_id integer NOT NULL,
    status text DEFAULT 'selected'::text NOT NULL,
    disc_style_used text,
    personalized_subject text,
    personalized_body text,
    last_error text,
    resend_email_id text,
    enrolled_at timestamp with time zone,
    enrollment_status text DEFAULT 'active'::text NOT NULL,
    current_step integer DEFAULT 0
);

CREATE SEQUENCE IF NOT EXISTS public.crm_campaign_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_campaign_recipients_id_seq OWNED BY public.crm_campaign_recipients.id;

CREATE TABLE IF NOT EXISTS public.crm_campaign_scheduled_messages (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    campaign_id integer NOT NULL,
    recipient_id integer NOT NULL,
    step_id integer,
    lead_id integer NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    subject text,
    body text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    resend_email_id text,
    last_error text,
    metadata jsonb
);

CREATE SEQUENCE IF NOT EXISTS public.crm_campaign_scheduled_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_campaign_scheduled_messages_id_seq OWNED BY public.crm_campaign_scheduled_messages.id;

CREATE TABLE IF NOT EXISTS public.crm_campaign_steps (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id integer NOT NULL,
    step_number integer DEFAULT 1 NOT NULL,
    day_offset integer DEFAULT 0 NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    subject text,
    body text,
    call_prompt text,
    task_description text,
    send_time text DEFAULT 'immediate'::text NOT NULL,
    business_days_only boolean DEFAULT true NOT NULL,
    intent_label text,
    branch_on_event text,
    branch_window_hours integer,
    branch_true_next_step_id integer,
    branch_false_next_step_id integer
);

CREATE SEQUENCE IF NOT EXISTS public.crm_campaign_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_campaign_steps_id_seq OWNED BY public.crm_campaign_steps.id;

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    type text DEFAULT 'broadcast'::text NOT NULL,
    objective text,
    tone_profile text,
    description text,
    stop_on_reply boolean DEFAULT true NOT NULL,
    auto_send boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_campaigns_id_seq OWNED BY public.crm_campaigns.id;

CREATE TABLE IF NOT EXISTS public.crm_comments (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    body text NOT NULL,
    is_internal boolean DEFAULT true NOT NULL,
    author_staff_id integer,
    author_label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT ck_crm_comments_entity_type CHECK ((entity_type = ANY (ARRAY['project'::text, 'task'::text, 'lead'::text, 'deal'::text, 'ticket'::text, 'document'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_comments_id_seq OWNED BY public.crm_comments.id;

CREATE TABLE IF NOT EXISTS public.crm_conversation_participants (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    role text DEFAULT 'customer'::text NOT NULL,
    staff_id integer,
    external_address text,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_conv_participants_identity CHECK ((((staff_id IS NOT NULL) AND (external_address IS NULL)) OR ((staff_id IS NULL) AND (external_address IS NOT NULL))))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_conversation_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_conversation_participants_id_seq OWNED BY public.crm_conversation_participants.id;

CREATE TABLE IF NOT EXISTS public.crm_conversation_reads (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    conversation_id integer NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_message_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_conversation_reads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_conversation_reads_id_seq OWNED BY public.crm_conversation_reads.id;

CREATE TABLE IF NOT EXISTS public.crm_conversations (
    id integer NOT NULL,
    channel text NOT NULL,
    provider text,
    identity_key text NOT NULL,
    contact_id integer,
    external_address text,
    external_name text,
    subject text,
    provider_thread_ref text,
    status text DEFAULT 'unassigned'::text NOT NULL,
    assigned_to_staff_id integer,
    assigned_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by_staff_id integer,
    first_message_at timestamp with time zone,
    last_message_at timestamp with time zone,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    message_count integer DEFAULT 0 NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    review_reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_token text,
    reference_chain text[],
    CONSTRAINT ck_crm_conversations_channel CHECK ((channel = ANY (ARRAY['phone'::text, 'email'::text]))),
    CONSTRAINT ck_crm_conversations_status CHECK ((status = ANY (ARRAY['unassigned'::text, 'assigned'::text, 'awaiting_customer'::text, 'resolved'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_conversations_id_seq OWNED BY public.crm_conversations.id;

CREATE TABLE IF NOT EXISTS public.crm_deals (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer,
    name text NOT NULL,
    value numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    stage text DEFAULT 'Lead'::text NOT NULL,
    close_date date,
    notes text,
    owner_staff_id integer,
    probability integer,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    closed_by_staff_id integer,
    lost_reason text,
    lost_reason_detail text,
    converted_project_id integer,
    converted_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_deals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_deals_id_seq OWNED BY public.crm_deals.id;

CREATE TABLE IF NOT EXISTS public.crm_delivery_recovery_actions (
    id integer NOT NULL,
    delivery_id integer NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    actor_staff_id integer,
    actor_label text NOT NULL,
    previous_state text NOT NULL,
    previous_idempotency_key text,
    new_idempotency_key text,
    duplicate_risk text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_delivery_recovery_actions_action CHECK ((action = ANY (ARRAY['retry'::text, 'resend'::text, 'acknowledge'::text]))),
    CONSTRAINT ck_crm_delivery_recovery_actions_reason CHECK ((length(btrim(reason)) >= 3))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_delivery_recovery_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_delivery_recovery_actions_id_seq OWNED BY public.crm_delivery_recovery_actions.id;

CREATE TABLE IF NOT EXISTS public.crm_document_requests (
    id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date timestamp with time zone,
    owner_staff_id integer,
    requested_by_staff_id integer,
    requested_by_label text NOT NULL,
    received_at timestamp with time zone,
    received_attachment_id integer,
    cancelled_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_document_requests_status CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'cancelled'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_document_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_document_requests_id_seq OWNED BY public.crm_document_requests.id;

CREATE TABLE IF NOT EXISTS public.crm_document_shares (
    id integer NOT NULL,
    attachment_id integer NOT NULL,
    token_hash text NOT NULL,
    created_by_staff_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    max_downloads integer,
    download_count integer DEFAULT 0 NOT NULL,
    last_downloaded_at timestamp with time zone,
    shared_with_label text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_document_shares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_document_shares_id_seq OWNED BY public.crm_document_shares.id;

CREATE TABLE IF NOT EXISTS public.crm_email_send_counters (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    window_start timestamp with time zone NOT NULL,
    sent integer DEFAULT 0 NOT NULL,
    halted_at timestamp with time zone,
    halt_reason text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_email_send_counters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_email_send_counters_id_seq OWNED BY public.crm_email_send_counters.id;

CREATE TABLE IF NOT EXISTS public.crm_email_suppressions (
    id integer NOT NULL,
    address text NOT NULL,
    reason text NOT NULL,
    bounce_type text,
    detail text,
    source text DEFAULT 'provider'::text NOT NULL,
    suppressed_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    released_by_staff_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_email_suppressions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_email_suppressions_id_seq OWNED BY public.crm_email_suppressions.id;

CREATE TABLE IF NOT EXISTS public.crm_email_templates (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_email_templates_id_seq OWNED BY public.crm_email_templates.id;

CREATE TABLE IF NOT EXISTS public.crm_inbound_email_events (
    id integer NOT NULL,
    svix_id text NOT NULL,
    email_id text,
    event_type text NOT NULL,
    state text DEFAULT 'received'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    payload jsonb,
    message_id integer,
    conversation_id integer,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_inbound_email_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_inbound_email_events_id_seq OWNED BY public.crm_inbound_email_events.id;

CREATE TABLE IF NOT EXISTS public.crm_kb_articles (
    id integer NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    category text,
    status text DEFAULT 'draft'::text NOT NULL,
    author_staff_id integer,
    author_label text,
    updated_by_staff_id integer,
    updated_by_label text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_kb_articles_published_at CHECK (((status <> 'published'::text) OR (published_at IS NOT NULL))),
    CONSTRAINT ck_crm_kb_articles_status CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_kb_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_kb_articles_id_seq OWNED BY public.crm_kb_articles.id;

CREATE TABLE IF NOT EXISTS public.crm_leads (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    company text,
    phone text,
    email text NOT NULL,
    website text,
    source text DEFAULT 'Manual Entry'::text NOT NULL,
    service_interest text,
    status text DEFAULT 'New Inquiry'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    assigned_to text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    last_contacted_at timestamp with time zone,
    next_follow_up_at timestamp with time zone,
    notes text,
    estimated_value numeric(10,2),
    package_type text,
    discovery_form_status text DEFAULT 'Not Started'::text,
    proposal_status text DEFAULT 'Not Started'::text,
    sow_status text DEFAULT 'Not Started'::text,
    discovery_submission_id integer,
    sms_consent boolean DEFAULT false NOT NULL,
    sms_opt_out boolean DEFAULT false NOT NULL,
    generated_proposal text,
    generated_sow text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_leads_id_seq OWNED BY public.crm_leads.id;

CREATE TABLE IF NOT EXISTS public.crm_marketing_campaigns (
    id integer NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    preheader text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    segment_id integer,
    design_id integer,
    status text DEFAULT 'draft'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    paused_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    completed_at timestamp with time zone,
    ai_content_state text DEFAULT 'none'::text NOT NULL,
    ai_drafted_at timestamp with time zone,
    ai_grounding jsonb,
    ai_approved_by_staff_id integer,
    ai_approved_by_label text,
    ai_approved_at timestamp with time zone,
    created_by_staff_id integer,
    created_by_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_marketing_campaigns_ai_approval CHECK (((ai_content_state <> 'approved'::text) OR (ai_approved_at IS NOT NULL))),
    CONSTRAINT ck_crm_marketing_campaigns_ai_state CHECK ((ai_content_state = ANY (ARRAY['none'::text, 'draft'::text, 'approved'::text]))),
    CONSTRAINT ck_crm_marketing_campaigns_status CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'paused'::text, 'cancelled'::text, 'sent'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_marketing_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_marketing_campaigns_id_seq OWNED BY public.crm_marketing_campaigns.id;

CREATE TABLE IF NOT EXISTS public.crm_marketing_designs (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    subject text,
    preheader text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by_staff_id integer,
    created_by_label text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_marketing_designs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_marketing_designs_id_seq OWNED BY public.crm_marketing_designs.id;

CREATE TABLE IF NOT EXISTS public.crm_marketing_exclusions (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    lead_id integer NOT NULL,
    reason text,
    excluded_by_staff_id integer,
    excluded_by_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_marketing_exclusions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_marketing_exclusions_id_seq OWNED BY public.crm_marketing_exclusions.id;

CREATE TABLE IF NOT EXISTS public.crm_marketing_recipients (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    lead_id integer NOT NULL,
    address text,
    status text DEFAULT 'pending'::text NOT NULL,
    exclusion_reason text,
    exclusion_detail text,
    rendered_subject text,
    rendered_html text,
    fallbacks_used jsonb,
    provider_message_id text,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_marketing_recipients_exclusion_reason CHECK (((status <> 'excluded'::text) OR (exclusion_reason IS NOT NULL))),
    CONSTRAINT ck_crm_marketing_recipients_status CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'excluded'::text, 'test'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_marketing_recipients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_marketing_recipients_id_seq OWNED BY public.crm_marketing_recipients.id;

CREATE TABLE IF NOT EXISTS public.crm_marketing_segments (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    definition jsonb NOT NULL,
    created_by_staff_id integer,
    created_by_label text,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_marketing_segments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_marketing_segments_id_seq OWNED BY public.crm_marketing_segments.id;

CREATE TABLE IF NOT EXISTS public.crm_message_drafts (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    staff_id integer NOT NULL,
    body text,
    subject text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_message_drafts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_message_drafts_id_seq OWNED BY public.crm_message_drafts.id;

CREATE TABLE IF NOT EXISTS public.crm_messages (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer,
    direction text NOT NULL,
    channel text NOT NULL,
    body text,
    twilio_sid text,
    from_number text,
    to_number text,
    status text,
    error_code text,
    duration integer,
    call_status text,
    metadata jsonb,
    conversation_id integer,
    sent_by_staff_id integer,
    sent_by_label text,
    origin text,
    subject text,
    provider_message_id text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_messages_id_seq OWNED BY public.crm_messages.id;

CREATE TABLE IF NOT EXISTS public.crm_notifications (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    href text,
    entity_type text,
    entity_id integer,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    occurrence_key text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_notifications_id_seq OWNED BY public.crm_notifications.id;

CREATE TABLE IF NOT EXISTS public.crm_portal_accounts (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    session_epoch integer DEFAULT 0 NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_portal_accounts_status CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_portal_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_portal_accounts_id_seq OWNED BY public.crm_portal_accounts.id;

CREATE TABLE IF NOT EXISTS public.crm_portal_document_grants (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    attachment_id integer NOT NULL,
    granted_by_staff_id integer,
    granted_by_label text NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_portal_document_grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_portal_document_grants_id_seq OWNED BY public.crm_portal_document_grants.id;

CREATE TABLE IF NOT EXISTS public.crm_portal_invitations (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    created_by_staff_id integer,
    created_by_label text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by_staff_id integer,
    delivery_state text,
    delivery_detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_portal_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_portal_invitations_id_seq OWNED BY public.crm_portal_invitations.id;

CREATE TABLE IF NOT EXISTS public.crm_portal_proposal_acceptances (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    deal_id integer NOT NULL,
    portal_account_id integer,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    typed_name text NOT NULL,
    accepted_from_ip text,
    deal_value_at_acceptance numeric(10,2),
    deal_name_at_acceptance text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_portal_proposal_acceptances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_portal_proposal_acceptances_id_seq OWNED BY public.crm_portal_proposal_acceptances.id;

CREATE TABLE IF NOT EXISTS public.crm_portal_sessions (
    id integer NOT NULL,
    portal_account_id integer NOT NULL,
    lead_id integer NOT NULL,
    token_hash text NOT NULL,
    csrf_hash text NOT NULL,
    epoch integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_portal_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_portal_sessions_id_seq OWNED BY public.crm_portal_sessions.id;

CREATE TABLE IF NOT EXISTS public.crm_project_milestones (
    id integer NOT NULL,
    project_id integer NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    depends_on_milestone_id integer,
    blocked_reason text,
    completed_at timestamp with time zone,
    completed_by_staff_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_project_milestones_status CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'blocked'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_project_milestones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_project_milestones_id_seq OWNED BY public.crm_project_milestones.id;

CREATE TABLE IF NOT EXISTS public.crm_project_templates (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    project_type text,
    tasks jsonb DEFAULT '[]'::jsonb NOT NULL,
    milestones jsonb DEFAULT '[]'::jsonb NOT NULL,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by_staff_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_project_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_project_templates_id_seq OWNED BY public.crm_project_templates.id;

CREATE TABLE IF NOT EXISTS public.crm_project_updates (
    id integer NOT NULL,
    project_id integer NOT NULL,
    body text NOT NULL,
    stage_at_update text,
    author_staff_id integer,
    author_label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_project_updates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_project_updates_id_seq OWNED BY public.crm_project_updates.id;

CREATE TABLE IF NOT EXISTS public.crm_projects (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer,
    deal_id integer,
    name text NOT NULL,
    project_type text,
    stage text DEFAULT 'New Lead'::text NOT NULL,
    budget numeric(10,2),
    start_date date,
    target_launch_date date,
    assigned_to text,
    notes text,
    proposal_link text,
    discovery_form_link text,
    maintenance_plan text,
    launch_checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    owner_staff_id integer,
    collaborator_staff_ids integer[] DEFAULT '{}'::integer[],
    next_action text,
    next_action_due_at timestamp with time zone,
    blocked_reason text,
    priority text,
    archived_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_projects_id_seq OWNED BY public.crm_projects.id;

CREATE TABLE IF NOT EXISTS public.crm_reminder_deliveries (
    id integer NOT NULL,
    job_id integer NOT NULL,
    occurrence_at timestamp with time zone NOT NULL,
    recipient_staff_id integer,
    recipient_address text,
    subject text NOT NULL,
    body text NOT NULL,
    idempotency_key text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone,
    attempt_started_at timestamp with time zone,
    attempt_worker text,
    provider_ref text,
    failure_reason text,
    failure_detail text,
    resend_count integer DEFAULT 0 NOT NULL,
    last_recovery_action text,
    last_recovery_by_staff_id integer,
    last_recovery_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by_staff_id integer,
    resolution text,
    resolution_note text,
    origin text DEFAULT 'live'::text NOT NULL,
    legacy_raw text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_reminder_deliveries_attempt CHECK ((attempt >= 0)),
    CONSTRAINT ck_crm_reminder_deliveries_next_attempt CHECK (((next_attempt_at IS NULL) OR (state = 'pending'::text))),
    CONSTRAINT ck_crm_reminder_deliveries_origin CHECK ((origin = ANY (ARRAY['live'::text, 'migrated'::text, 'migrated_unattributed'::text, 'migrated_unparsed'::text]))),
    CONSTRAINT ck_crm_reminder_deliveries_recipient CHECK ((((recipient_staff_id IS NOT NULL) AND (recipient_address IS NULL)) OR ((recipient_staff_id IS NULL) AND (recipient_address IS NOT NULL)) OR ((origin <> 'live'::text) AND (recipient_staff_id IS NULL) AND (recipient_address IS NULL)))),
    CONSTRAINT ck_crm_reminder_deliveries_recovery_action CHECK (((last_recovery_action IS NULL) OR (last_recovery_action = ANY (ARRAY['retry'::text, 'resend'::text, 'acknowledge'::text])))),
    CONSTRAINT ck_crm_reminder_deliveries_resend_count CHECK ((resend_count >= 0)),
    CONSTRAINT ck_crm_reminder_deliveries_resolution CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['acknowledged'::text, 'resent'::text, 'accepted'::text])))),
    CONSTRAINT ck_crm_reminder_deliveries_resolved_pair CHECK (((resolved_at IS NULL) = (resolution IS NULL))),
    CONSTRAINT ck_crm_reminder_deliveries_state CHECK ((state = ANY (ARRAY['pending'::text, 'attempting'::text, 'accepted'::text, 'refused'::text, 'uncertain'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_reminder_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_reminder_deliveries_id_seq OWNED BY public.crm_reminder_deliveries.id;

CREATE TABLE IF NOT EXISTS public.crm_scheduled_jobs (
    id integer NOT NULL,
    kind text NOT NULL,
    run_at timestamp with time zone NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    last_error text,
    dedupe_key text NOT NULL,
    cancelled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    external_dispatched_at timestamp with time zone,
    external_ref text,
    CONSTRAINT ck_crm_scheduled_jobs_attempts CHECK (((attempts >= 0) AND (attempts <= max_attempts))),
    CONSTRAINT ck_crm_scheduled_jobs_status CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_scheduled_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_scheduled_jobs_id_seq OWNED BY public.crm_scheduled_jobs.id;

CREATE TABLE IF NOT EXISTS public.crm_staff (
    id integer NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    password_hash text,
    password_updated_at timestamp with time zone,
    mfa_secret text,
    mfa_enrolled_at timestamp with time zone,
    mfa_recovery_hashes text[] DEFAULT '{}'::text[] NOT NULL,
    session_epoch integer DEFAULT 0 NOT NULL,
    legacy_names text[] DEFAULT '{}'::text[] NOT NULL,
    extra_permissions text[] DEFAULT '{}'::text[] NOT NULL,
    revoked_permissions text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    disabled_at timestamp with time zone,
    created_by_staff_id integer,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    reminder_email_enabled boolean DEFAULT false NOT NULL,
    daily_digest_enabled boolean DEFAULT false NOT NULL,
    daily_digest_hour integer DEFAULT 8 NOT NULL,
    email_verified_at timestamp with time zone,
    CONSTRAINT ck_crm_staff_email_lower CHECK ((email = lower(email))),
    CONSTRAINT ck_crm_staff_role CHECK ((role = ANY (ARRAY['owner'::text, 'technical_admin'::text, 'operations_manager'::text]))),
    CONSTRAINT ck_crm_staff_status CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_staff_id_seq OWNED BY public.crm_staff.id;

CREATE TABLE IF NOT EXISTS public.crm_staff_login_attempts (
    id integer NOT NULL,
    scope text NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_staff_login_attempts_scope CHECK ((scope = ANY (ARRAY['ip'::text, 'account'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_staff_login_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_staff_login_attempts_id_seq OWNED BY public.crm_staff_login_attempts.id;

CREATE TABLE IF NOT EXISTS public.crm_staff_sessions (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    token_hash text NOT NULL,
    csrf_hash text NOT NULL,
    epoch integer DEFAULT 0 NOT NULL,
    mfa_satisfied boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    ip text,
    user_agent text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_staff_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_staff_sessions_id_seq OWNED BY public.crm_staff_sessions.id;

CREATE TABLE IF NOT EXISTS public.crm_staff_tokens (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    kind text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_by_staff_id integer,
    delivery text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT ck_crm_staff_tokens_kind CHECK ((kind = ANY (ARRAY['invite'::text, 'password_reset'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_staff_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_staff_tokens_id_seq OWNED BY public.crm_staff_tokens.id;

CREATE TABLE IF NOT EXISTS public.crm_support_messages (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    visibility text NOT NULL,
    body text NOT NULL,
    sent_by_staff_id integer,
    sent_by_label text,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_support_messages_internal_is_ours CHECK (((visibility <> 'internal'::text) OR (origin <> 'customer'::text))),
    CONSTRAINT ck_crm_support_messages_origin CHECK ((origin = ANY (ARRAY['staff'::text, 'customer'::text, 'automated'::text, 'legacy'::text]))),
    CONSTRAINT ck_crm_support_messages_visibility CHECK ((visibility = ANY (ARRAY['customer'::text, 'internal'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_support_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_support_messages_id_seq OWNED BY public.crm_support_messages.id;

CREATE TABLE IF NOT EXISTS public.crm_support_tickets (
    id integer NOT NULL,
    subject text NOT NULL,
    description text,
    status text DEFAULT 'new'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    source text DEFAULT 'staff'::text NOT NULL,
    request_type text,
    lead_id integer NOT NULL,
    project_id integer,
    assigned_to_staff_id integer,
    assigned_at timestamp with time zone,
    opened_by_staff_id integer,
    opened_by_label text,
    first_response_at timestamp with time zone,
    last_customer_message_at timestamp with time zone,
    last_staff_message_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by_staff_id integer,
    resolution text,
    resolution_note text,
    closed_at timestamp with time zone,
    reopened_at timestamp with time zone,
    reopen_count integer DEFAULT 0 NOT NULL,
    kb_article_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_crm_support_tickets_priority CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text, 'low'::text]))),
    CONSTRAINT ck_crm_support_tickets_request_type CHECK (((request_type IS NULL) OR (request_type = ANY (ARRAY['content_change'::text, 'bug_report'::text, 'new_feature'::text, 'hosting_or_domain'::text, 'billing_question'::text, 'training_or_how_to'::text, 'access_request'::text, 'other'::text])))),
    CONSTRAINT ck_crm_support_tickets_resolution_required CHECK (((status <> ALL (ARRAY['resolved'::text, 'closed'::text])) OR (resolution IS NOT NULL))),
    CONSTRAINT ck_crm_support_tickets_resolution_value CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['fixed'::text, 'answered'::text, 'workaround_provided'::text, 'duplicate'::text, 'not_reproducible'::text, 'withdrawn_by_customer'::text, 'no_response_from_customer'::text, 'out_of_scope'::text, 'other'::text])))),
    CONSTRAINT ck_crm_support_tickets_source CHECK ((source = ANY (ARRAY['staff'::text, 'service_request'::text, 'email'::text, 'phone'::text]))),
    CONSTRAINT ck_crm_support_tickets_status CHECK ((status = ANY (ARRAY['new'::text, 'open'::text, 'waiting_on_customer'::text, 'resolved'::text, 'closed'::text])))
);

CREATE SEQUENCE IF NOT EXISTS public.crm_support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_support_tickets_id_seq OWNED BY public.crm_support_tickets.id;

CREATE TABLE IF NOT EXISTS public.crm_tasks (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id integer,
    project_id integer,
    type text DEFAULT 'Follow Up'::text NOT NULL,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    created_by text DEFAULT 'admin'::text NOT NULL,
    assigned_to_staff_id integer,
    created_by_staff_id integer,
    completed_by_staff_id integer,
    priority text,
    remind_at timestamp with time zone,
    recurrence text,
    blocked_reason text,
    checklist jsonb DEFAULT '[]'::jsonb,
    archived_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS public.crm_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_tasks_id_seq OWNED BY public.crm_tasks.id;

CREATE TABLE IF NOT EXISTS public.crm_transactions (
    id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deal_id integer NOT NULL,
    lead_id integer,
    amount numeric(10,2) NOT NULL,
    method text NOT NULL,
    stripe_payment_intent_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    received_at timestamp with time zone,
    notes text
);

CREATE SEQUENCE IF NOT EXISTS public.crm_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_transactions_id_seq OWNED BY public.crm_transactions.id;

CREATE TABLE IF NOT EXISTS public.crm_unmatched_emails (
    id integer NOT NULL,
    email_id text,
    from_address text,
    to_address text,
    subject text,
    body_text text,
    body_html text,
    headers jsonb,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resolved_by_staff_id integer,
    resolved_at timestamp with time zone,
    attached_conversation_id integer,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.crm_unmatched_emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.crm_unmatched_emails_id_seq OWNED BY public.crm_unmatched_emails.id;

ALTER TABLE ONLY public.crm_activities ALTER COLUMN id SET DEFAULT nextval('public.crm_activities_id_seq'::regclass);

ALTER TABLE ONLY public.crm_admin_audit_log ALTER COLUMN id SET DEFAULT nextval('public.crm_admin_audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.crm_admin_sessions ALTER COLUMN id SET DEFAULT nextval('public.crm_admin_sessions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_appointment_attendees ALTER COLUMN id SET DEFAULT nextval('public.crm_appointment_attendees_id_seq'::regclass);

ALTER TABLE ONLY public.crm_appointments ALTER COLUMN id SET DEFAULT nextval('public.crm_appointments_id_seq'::regclass);

ALTER TABLE ONLY public.crm_approvals ALTER COLUMN id SET DEFAULT nextval('public.crm_approvals_id_seq'::regclass);

ALTER TABLE ONLY public.crm_attachments ALTER COLUMN id SET DEFAULT nextval('public.crm_attachments_id_seq'::regclass);

ALTER TABLE ONLY public.crm_automation_action_runs ALTER COLUMN id SET DEFAULT nextval('public.crm_automation_action_runs_id_seq'::regclass);

ALTER TABLE ONLY public.crm_automation_approvals ALTER COLUMN id SET DEFAULT nextval('public.crm_automation_approvals_id_seq'::regclass);

ALTER TABLE ONLY public.crm_automation_executions ALTER COLUMN id SET DEFAULT nextval('public.crm_automation_executions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_automation_rules ALTER COLUMN id SET DEFAULT nextval('public.crm_automation_rules_id_seq'::regclass);

ALTER TABLE ONLY public.crm_behavioral_events ALTER COLUMN id SET DEFAULT nextval('public.crm_behavioral_events_id_seq'::regclass);

ALTER TABLE ONLY public.crm_campaign_events ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_events_id_seq'::regclass);

ALTER TABLE ONLY public.crm_campaign_recipients ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_recipients_id_seq'::regclass);

ALTER TABLE ONLY public.crm_campaign_scheduled_messages ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_scheduled_messages_id_seq'::regclass);

ALTER TABLE ONLY public.crm_campaign_steps ALTER COLUMN id SET DEFAULT nextval('public.crm_campaign_steps_id_seq'::regclass);

ALTER TABLE ONLY public.crm_campaigns ALTER COLUMN id SET DEFAULT nextval('public.crm_campaigns_id_seq'::regclass);

ALTER TABLE ONLY public.crm_comments ALTER COLUMN id SET DEFAULT nextval('public.crm_comments_id_seq'::regclass);

ALTER TABLE ONLY public.crm_conversation_participants ALTER COLUMN id SET DEFAULT nextval('public.crm_conversation_participants_id_seq'::regclass);

ALTER TABLE ONLY public.crm_conversation_reads ALTER COLUMN id SET DEFAULT nextval('public.crm_conversation_reads_id_seq'::regclass);

ALTER TABLE ONLY public.crm_conversations ALTER COLUMN id SET DEFAULT nextval('public.crm_conversations_id_seq'::regclass);

ALTER TABLE ONLY public.crm_deals ALTER COLUMN id SET DEFAULT nextval('public.crm_deals_id_seq'::regclass);

ALTER TABLE ONLY public.crm_delivery_recovery_actions ALTER COLUMN id SET DEFAULT nextval('public.crm_delivery_recovery_actions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_document_requests ALTER COLUMN id SET DEFAULT nextval('public.crm_document_requests_id_seq'::regclass);

ALTER TABLE ONLY public.crm_document_shares ALTER COLUMN id SET DEFAULT nextval('public.crm_document_shares_id_seq'::regclass);

ALTER TABLE ONLY public.crm_email_send_counters ALTER COLUMN id SET DEFAULT nextval('public.crm_email_send_counters_id_seq'::regclass);

ALTER TABLE ONLY public.crm_email_suppressions ALTER COLUMN id SET DEFAULT nextval('public.crm_email_suppressions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_email_templates ALTER COLUMN id SET DEFAULT nextval('public.crm_email_templates_id_seq'::regclass);

ALTER TABLE ONLY public.crm_inbound_email_events ALTER COLUMN id SET DEFAULT nextval('public.crm_inbound_email_events_id_seq'::regclass);

ALTER TABLE ONLY public.crm_kb_articles ALTER COLUMN id SET DEFAULT nextval('public.crm_kb_articles_id_seq'::regclass);

ALTER TABLE ONLY public.crm_leads ALTER COLUMN id SET DEFAULT nextval('public.crm_leads_id_seq'::regclass);

ALTER TABLE ONLY public.crm_marketing_campaigns ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_campaigns_id_seq'::regclass);

ALTER TABLE ONLY public.crm_marketing_designs ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_designs_id_seq'::regclass);

ALTER TABLE ONLY public.crm_marketing_exclusions ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_exclusions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_marketing_recipients ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_recipients_id_seq'::regclass);

ALTER TABLE ONLY public.crm_marketing_segments ALTER COLUMN id SET DEFAULT nextval('public.crm_marketing_segments_id_seq'::regclass);

ALTER TABLE ONLY public.crm_message_drafts ALTER COLUMN id SET DEFAULT nextval('public.crm_message_drafts_id_seq'::regclass);

ALTER TABLE ONLY public.crm_messages ALTER COLUMN id SET DEFAULT nextval('public.crm_messages_id_seq'::regclass);

ALTER TABLE ONLY public.crm_notifications ALTER COLUMN id SET DEFAULT nextval('public.crm_notifications_id_seq'::regclass);

ALTER TABLE ONLY public.crm_portal_accounts ALTER COLUMN id SET DEFAULT nextval('public.crm_portal_accounts_id_seq'::regclass);

ALTER TABLE ONLY public.crm_portal_document_grants ALTER COLUMN id SET DEFAULT nextval('public.crm_portal_document_grants_id_seq'::regclass);

ALTER TABLE ONLY public.crm_portal_invitations ALTER COLUMN id SET DEFAULT nextval('public.crm_portal_invitations_id_seq'::regclass);

ALTER TABLE ONLY public.crm_portal_proposal_acceptances ALTER COLUMN id SET DEFAULT nextval('public.crm_portal_proposal_acceptances_id_seq'::regclass);

ALTER TABLE ONLY public.crm_portal_sessions ALTER COLUMN id SET DEFAULT nextval('public.crm_portal_sessions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_project_milestones ALTER COLUMN id SET DEFAULT nextval('public.crm_project_milestones_id_seq'::regclass);

ALTER TABLE ONLY public.crm_project_templates ALTER COLUMN id SET DEFAULT nextval('public.crm_project_templates_id_seq'::regclass);

ALTER TABLE ONLY public.crm_project_updates ALTER COLUMN id SET DEFAULT nextval('public.crm_project_updates_id_seq'::regclass);

ALTER TABLE ONLY public.crm_projects ALTER COLUMN id SET DEFAULT nextval('public.crm_projects_id_seq'::regclass);

ALTER TABLE ONLY public.crm_reminder_deliveries ALTER COLUMN id SET DEFAULT nextval('public.crm_reminder_deliveries_id_seq'::regclass);

ALTER TABLE ONLY public.crm_scheduled_jobs ALTER COLUMN id SET DEFAULT nextval('public.crm_scheduled_jobs_id_seq'::regclass);

ALTER TABLE ONLY public.crm_staff ALTER COLUMN id SET DEFAULT nextval('public.crm_staff_id_seq'::regclass);

ALTER TABLE ONLY public.crm_staff_login_attempts ALTER COLUMN id SET DEFAULT nextval('public.crm_staff_login_attempts_id_seq'::regclass);

ALTER TABLE ONLY public.crm_staff_sessions ALTER COLUMN id SET DEFAULT nextval('public.crm_staff_sessions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_staff_tokens ALTER COLUMN id SET DEFAULT nextval('public.crm_staff_tokens_id_seq'::regclass);

ALTER TABLE ONLY public.crm_support_messages ALTER COLUMN id SET DEFAULT nextval('public.crm_support_messages_id_seq'::regclass);

ALTER TABLE ONLY public.crm_support_tickets ALTER COLUMN id SET DEFAULT nextval('public.crm_support_tickets_id_seq'::regclass);

ALTER TABLE ONLY public.crm_tasks ALTER COLUMN id SET DEFAULT nextval('public.crm_tasks_id_seq'::regclass);

ALTER TABLE ONLY public.crm_transactions ALTER COLUMN id SET DEFAULT nextval('public.crm_transactions_id_seq'::regclass);

ALTER TABLE ONLY public.crm_unmatched_emails ALTER COLUMN id SET DEFAULT nextval('public.crm_unmatched_emails_id_seq'::regclass);

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_activities_pkey'
                    AND conrelid = 'public.crm_activities'::regclass) THEN
    ALTER TABLE ONLY public.crm_activities ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_admin_audit_log_pkey'
                    AND conrelid = 'public.crm_admin_audit_log'::regclass) THEN
    ALTER TABLE ONLY public.crm_admin_audit_log ADD CONSTRAINT crm_admin_audit_log_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_admin_sessions_pkey'
                    AND conrelid = 'public.crm_admin_sessions'::regclass) THEN
    ALTER TABLE ONLY public.crm_admin_sessions ADD CONSTRAINT crm_admin_sessions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_appointment_attendees_pkey'
                    AND conrelid = 'public.crm_appointment_attendees'::regclass) THEN
    ALTER TABLE ONLY public.crm_appointment_attendees ADD CONSTRAINT crm_appointment_attendees_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_appointments_pkey'
                    AND conrelid = 'public.crm_appointments'::regclass) THEN
    ALTER TABLE ONLY public.crm_appointments ADD CONSTRAINT crm_appointments_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_approvals_pkey'
                    AND conrelid = 'public.crm_approvals'::regclass) THEN
    ALTER TABLE ONLY public.crm_approvals ADD CONSTRAINT crm_approvals_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_attachment_blobs_pkey'
                    AND conrelid = 'public.crm_attachment_blobs'::regclass) THEN
    ALTER TABLE ONLY public.crm_attachment_blobs ADD CONSTRAINT crm_attachment_blobs_pkey PRIMARY KEY (attachment_id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_attachments_pkey'
                    AND conrelid = 'public.crm_attachments'::regclass) THEN
    ALTER TABLE ONLY public.crm_attachments ADD CONSTRAINT crm_attachments_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_automation_action_runs_pkey'
                    AND conrelid = 'public.crm_automation_action_runs'::regclass) THEN
    ALTER TABLE ONLY public.crm_automation_action_runs ADD CONSTRAINT crm_automation_action_runs_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_automation_approvals_pkey'
                    AND conrelid = 'public.crm_automation_approvals'::regclass) THEN
    ALTER TABLE ONLY public.crm_automation_approvals ADD CONSTRAINT crm_automation_approvals_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_automation_executions_pkey'
                    AND conrelid = 'public.crm_automation_executions'::regclass) THEN
    ALTER TABLE ONLY public.crm_automation_executions ADD CONSTRAINT crm_automation_executions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_automation_rules_pkey'
                    AND conrelid = 'public.crm_automation_rules'::regclass) THEN
    ALTER TABLE ONLY public.crm_automation_rules ADD CONSTRAINT crm_automation_rules_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_behavioral_events_pkey'
                    AND conrelid = 'public.crm_behavioral_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_behavioral_events ADD CONSTRAINT crm_behavioral_events_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_events_pkey'
                    AND conrelid = 'public.crm_campaign_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_events ADD CONSTRAINT crm_campaign_events_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_recipients_pkey'
                    AND conrelid = 'public.crm_campaign_recipients'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_scheduled_messages_pkey'
                    AND conrelid = 'public.crm_campaign_scheduled_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_scheduled_messages ADD CONSTRAINT crm_campaign_scheduled_messages_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_steps_pkey'
                    AND conrelid = 'public.crm_campaign_steps'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_steps ADD CONSTRAINT crm_campaign_steps_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaigns_pkey'
                    AND conrelid = 'public.crm_campaigns'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaigns ADD CONSTRAINT crm_campaigns_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_comments_pkey'
                    AND conrelid = 'public.crm_comments'::regclass) THEN
    ALTER TABLE ONLY public.crm_comments ADD CONSTRAINT crm_comments_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_conversation_participants_pkey'
                    AND conrelid = 'public.crm_conversation_participants'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversation_participants ADD CONSTRAINT crm_conversation_participants_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_conversation_reads_pkey'
                    AND conrelid = 'public.crm_conversation_reads'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversation_reads ADD CONSTRAINT crm_conversation_reads_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_conversations_pkey'
                    AND conrelid = 'public.crm_conversations'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversations ADD CONSTRAINT crm_conversations_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_deals_pkey'
                    AND conrelid = 'public.crm_deals'::regclass) THEN
    ALTER TABLE ONLY public.crm_deals ADD CONSTRAINT crm_deals_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_delivery_recovery_actions_pkey'
                    AND conrelid = 'public.crm_delivery_recovery_actions'::regclass) THEN
    ALTER TABLE ONLY public.crm_delivery_recovery_actions ADD CONSTRAINT crm_delivery_recovery_actions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_document_requests_pkey'
                    AND conrelid = 'public.crm_document_requests'::regclass) THEN
    ALTER TABLE ONLY public.crm_document_requests ADD CONSTRAINT crm_document_requests_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_document_shares_pkey'
                    AND conrelid = 'public.crm_document_shares'::regclass) THEN
    ALTER TABLE ONLY public.crm_document_shares ADD CONSTRAINT crm_document_shares_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_email_send_counters_pkey'
                    AND conrelid = 'public.crm_email_send_counters'::regclass) THEN
    ALTER TABLE ONLY public.crm_email_send_counters ADD CONSTRAINT crm_email_send_counters_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_email_suppressions_pkey'
                    AND conrelid = 'public.crm_email_suppressions'::regclass) THEN
    ALTER TABLE ONLY public.crm_email_suppressions ADD CONSTRAINT crm_email_suppressions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_email_templates_pkey'
                    AND conrelid = 'public.crm_email_templates'::regclass) THEN
    ALTER TABLE ONLY public.crm_email_templates ADD CONSTRAINT crm_email_templates_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_inbound_email_events_pkey'
                    AND conrelid = 'public.crm_inbound_email_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_inbound_email_events ADD CONSTRAINT crm_inbound_email_events_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_kb_articles_pkey'
                    AND conrelid = 'public.crm_kb_articles'::regclass) THEN
    ALTER TABLE ONLY public.crm_kb_articles ADD CONSTRAINT crm_kb_articles_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_leads_pkey'
                    AND conrelid = 'public.crm_leads'::regclass) THEN
    ALTER TABLE ONLY public.crm_leads ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_marketing_campaigns_pkey'
                    AND conrelid = 'public.crm_marketing_campaigns'::regclass) THEN
    ALTER TABLE ONLY public.crm_marketing_campaigns ADD CONSTRAINT crm_marketing_campaigns_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_marketing_designs_pkey'
                    AND conrelid = 'public.crm_marketing_designs'::regclass) THEN
    ALTER TABLE ONLY public.crm_marketing_designs ADD CONSTRAINT crm_marketing_designs_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_marketing_exclusions_pkey'
                    AND conrelid = 'public.crm_marketing_exclusions'::regclass) THEN
    ALTER TABLE ONLY public.crm_marketing_exclusions ADD CONSTRAINT crm_marketing_exclusions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_marketing_recipients_pkey'
                    AND conrelid = 'public.crm_marketing_recipients'::regclass) THEN
    ALTER TABLE ONLY public.crm_marketing_recipients ADD CONSTRAINT crm_marketing_recipients_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_marketing_segments_pkey'
                    AND conrelid = 'public.crm_marketing_segments'::regclass) THEN
    ALTER TABLE ONLY public.crm_marketing_segments ADD CONSTRAINT crm_marketing_segments_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_message_drafts_pkey'
                    AND conrelid = 'public.crm_message_drafts'::regclass) THEN
    ALTER TABLE ONLY public.crm_message_drafts ADD CONSTRAINT crm_message_drafts_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_messages_pkey'
                    AND conrelid = 'public.crm_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_messages ADD CONSTRAINT crm_messages_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_notifications_pkey'
                    AND conrelid = 'public.crm_notifications'::regclass) THEN
    ALTER TABLE ONLY public.crm_notifications ADD CONSTRAINT crm_notifications_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_portal_accounts_pkey'
                    AND conrelid = 'public.crm_portal_accounts'::regclass) THEN
    ALTER TABLE ONLY public.crm_portal_accounts ADD CONSTRAINT crm_portal_accounts_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_portal_document_grants_pkey'
                    AND conrelid = 'public.crm_portal_document_grants'::regclass) THEN
    ALTER TABLE ONLY public.crm_portal_document_grants ADD CONSTRAINT crm_portal_document_grants_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_portal_invitations_pkey'
                    AND conrelid = 'public.crm_portal_invitations'::regclass) THEN
    ALTER TABLE ONLY public.crm_portal_invitations ADD CONSTRAINT crm_portal_invitations_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_portal_proposal_acceptances_pkey'
                    AND conrelid = 'public.crm_portal_proposal_acceptances'::regclass) THEN
    ALTER TABLE ONLY public.crm_portal_proposal_acceptances ADD CONSTRAINT crm_portal_proposal_acceptances_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_portal_sessions_pkey'
                    AND conrelid = 'public.crm_portal_sessions'::regclass) THEN
    ALTER TABLE ONLY public.crm_portal_sessions ADD CONSTRAINT crm_portal_sessions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_project_milestones_pkey'
                    AND conrelid = 'public.crm_project_milestones'::regclass) THEN
    ALTER TABLE ONLY public.crm_project_milestones ADD CONSTRAINT crm_project_milestones_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_project_templates_pkey'
                    AND conrelid = 'public.crm_project_templates'::regclass) THEN
    ALTER TABLE ONLY public.crm_project_templates ADD CONSTRAINT crm_project_templates_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_project_updates_pkey'
                    AND conrelid = 'public.crm_project_updates'::regclass) THEN
    ALTER TABLE ONLY public.crm_project_updates ADD CONSTRAINT crm_project_updates_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_projects_pkey'
                    AND conrelid = 'public.crm_projects'::regclass) THEN
    ALTER TABLE ONLY public.crm_projects ADD CONSTRAINT crm_projects_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_reminder_deliveries_pkey'
                    AND conrelid = 'public.crm_reminder_deliveries'::regclass) THEN
    ALTER TABLE ONLY public.crm_reminder_deliveries ADD CONSTRAINT crm_reminder_deliveries_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_scheduled_jobs_pkey'
                    AND conrelid = 'public.crm_scheduled_jobs'::regclass) THEN
    ALTER TABLE ONLY public.crm_scheduled_jobs ADD CONSTRAINT crm_scheduled_jobs_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_login_attempts_pkey'
                    AND conrelid = 'public.crm_staff_login_attempts'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff_login_attempts ADD CONSTRAINT crm_staff_login_attempts_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_pkey'
                    AND conrelid = 'public.crm_staff'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff ADD CONSTRAINT crm_staff_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_sessions_pkey'
                    AND conrelid = 'public.crm_staff_sessions'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff_sessions ADD CONSTRAINT crm_staff_sessions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_tokens_pkey'
                    AND conrelid = 'public.crm_staff_tokens'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff_tokens ADD CONSTRAINT crm_staff_tokens_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_support_messages_pkey'
                    AND conrelid = 'public.crm_support_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_support_messages ADD CONSTRAINT crm_support_messages_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_support_tickets_pkey'
                    AND conrelid = 'public.crm_support_tickets'::regclass) THEN
    ALTER TABLE ONLY public.crm_support_tickets ADD CONSTRAINT crm_support_tickets_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_tasks_pkey'
                    AND conrelid = 'public.crm_tasks'::regclass) THEN
    ALTER TABLE ONLY public.crm_tasks ADD CONSTRAINT crm_tasks_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_transactions_pkey'
                    AND conrelid = 'public.crm_transactions'::regclass) THEN
    ALTER TABLE ONLY public.crm_transactions ADD CONSTRAINT crm_transactions_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_unmatched_emails_pkey'
                    AND conrelid = 'public.crm_unmatched_emails'::regclass) THEN
    ALTER TABLE ONLY public.crm_unmatched_emails ADD CONSTRAINT crm_unmatched_emails_pkey PRIMARY KEY (id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_conversation_reads_staff_conv'
                    AND conrelid = 'public.crm_conversation_reads'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversation_reads ADD CONSTRAINT uq_crm_conversation_reads_staff_conv UNIQUE (staff_id, conversation_id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_conversations_identity'
                    AND conrelid = 'public.crm_conversations'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversations ADD CONSTRAINT uq_crm_conversations_identity UNIQUE (identity_key);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_conversations_reply_token'
                    AND conrelid = 'public.crm_conversations'::regclass) THEN
    ALTER TABLE ONLY public.crm_conversations ADD CONSTRAINT uq_crm_conversations_reply_token UNIQUE (reply_token);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_email_send_counters_conv_window'
                    AND conrelid = 'public.crm_email_send_counters'::regclass) THEN
    ALTER TABLE ONLY public.crm_email_send_counters ADD CONSTRAINT uq_crm_email_send_counters_conv_window UNIQUE (conversation_id, window_start);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_email_suppressions_address'
                    AND conrelid = 'public.crm_email_suppressions'::regclass) THEN
    ALTER TABLE ONLY public.crm_email_suppressions ADD CONSTRAINT uq_crm_email_suppressions_address UNIQUE (address);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_inbound_email_events_svix'
                    AND conrelid = 'public.crm_inbound_email_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_inbound_email_events ADD CONSTRAINT uq_crm_inbound_email_events_svix UNIQUE (svix_id);
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'uq_crm_message_drafts_conv_staff'
                    AND conrelid = 'public.crm_message_drafts'::regclass) THEN
    ALTER TABLE ONLY public.crm_message_drafts ADD CONSTRAINT uq_crm_message_drafts_conv_staff UNIQUE (conversation_id, staff_id);
  END IF;
END $guard$;

CREATE INDEX IF NOT EXISTS ix_crm_admin_audit_log_action ON public.crm_admin_audit_log USING btree (action);

CREATE INDEX IF NOT EXISTS ix_crm_admin_audit_log_created_at ON public.crm_admin_audit_log USING btree (created_at);

CREATE INDEX IF NOT EXISTS ix_crm_admin_sessions_expires_at ON public.crm_admin_sessions USING btree (expires_at);

CREATE INDEX IF NOT EXISTS ix_crm_appointment_attendees_appointment ON public.crm_appointment_attendees USING btree (appointment_id);

CREATE INDEX IF NOT EXISTS ix_crm_appointments_lead ON public.crm_appointments USING btree (lead_id);

CREATE INDEX IF NOT EXISTS ix_crm_appointments_organizer ON public.crm_appointments USING btree (organizer_staff_id, start_at);

CREATE INDEX IF NOT EXISTS ix_crm_appointments_start ON public.crm_appointments USING btree (start_at);

CREATE INDEX IF NOT EXISTS ix_crm_approvals_entity ON public.crm_approvals USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS ix_crm_approvals_status ON public.crm_approvals USING btree (status, approver_staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_attachments_entity ON public.crm_attachments USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_action_runs_affected ON public.crm_automation_action_runs USING btree (affected_record_type, affected_record_id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_action_runs_execution ON public.crm_automation_action_runs USING btree (execution_id, action_index);

CREATE INDEX IF NOT EXISTS ix_crm_automation_approvals_pending ON public.crm_automation_approvals USING btree (status, approver_staff_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_approvals_rule ON public.crm_automation_approvals USING btree (rule_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_record ON public.crm_automation_executions USING btree (record_type, record_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_rule ON public.crm_automation_executions USING btree (rule_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_status ON public.crm_automation_executions USING btree (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS ix_crm_automation_executions_window ON public.crm_automation_executions USING btree (rule_id, record_id, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_automation_rules_archived ON public.crm_automation_rules USING btree (archived_at);

CREATE INDEX IF NOT EXISTS ix_crm_automation_rules_trigger ON public.crm_automation_rules USING btree (trigger, enabled);

CREATE INDEX IF NOT EXISTS ix_crm_comments_entity ON public.crm_comments USING btree (entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_conv_participants_conversation ON public.crm_conversation_participants USING btree (conversation_id);

CREATE INDEX IF NOT EXISTS ix_crm_conversation_reads_staff ON public.crm_conversation_reads USING btree (staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_assignee ON public.crm_conversations USING btree (assigned_to_staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_contact ON public.crm_conversations USING btree (contact_id);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_external ON public.crm_conversations USING btree (external_address);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_last_message ON public.crm_conversations USING btree (last_message_at);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_status ON public.crm_conversations USING btree (status, last_message_at);

CREATE INDEX IF NOT EXISTS ix_crm_delivery_recovery_actions_actor ON public.crm_delivery_recovery_actions USING btree (actor_staff_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_delivery_recovery_actions_delivery ON public.crm_delivery_recovery_actions USING btree (delivery_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_document_requests_entity ON public.crm_document_requests USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS ix_crm_document_requests_status_due ON public.crm_document_requests USING btree (status, due_date);

CREATE INDEX IF NOT EXISTS ix_crm_document_shares_attachment ON public.crm_document_shares USING btree (attachment_id);

CREATE INDEX IF NOT EXISTS ix_crm_email_suppressions_reason ON public.crm_email_suppressions USING btree (reason);

CREATE INDEX IF NOT EXISTS ix_crm_inbound_email_events_email ON public.crm_inbound_email_events USING btree (email_id);

CREATE INDEX IF NOT EXISTS ix_crm_inbound_email_events_state ON public.crm_inbound_email_events USING btree (state, received_at);

CREATE INDEX IF NOT EXISTS ix_crm_kb_articles_category ON public.crm_kb_articles USING btree (category);

CREATE INDEX IF NOT EXISTS ix_crm_kb_articles_status_id ON public.crm_kb_articles USING btree (status, id);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_campaigns_segment ON public.crm_marketing_campaigns USING btree (segment_id);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_campaigns_status ON public.crm_marketing_campaigns USING btree (status);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_designs_archived ON public.crm_marketing_designs USING btree (archived_at);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_exclusions_campaign ON public.crm_marketing_exclusions USING btree (campaign_id);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_recipients_campaign_status ON public.crm_marketing_recipients USING btree (campaign_id, status);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_segments_archived ON public.crm_marketing_segments USING btree (archived_at);

CREATE INDEX IF NOT EXISTS ix_crm_message_drafts_staff ON public.crm_message_drafts USING btree (staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_messages_conversation ON public.crm_messages USING btree (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_messages_sent_by ON public.crm_messages USING btree (sent_by_staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_notifications_staff ON public.crm_notifications USING btree (staff_id, read_at, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_portal_document_grants_lead ON public.crm_portal_document_grants USING btree (lead_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_portal_invitations_lead ON public.crm_portal_invitations USING btree (lead_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_portal_proposal_acceptances_lead ON public.crm_portal_proposal_acceptances USING btree (lead_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_portal_sessions_account ON public.crm_portal_sessions USING btree (portal_account_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_project_milestones_due ON public.crm_project_milestones USING btree (due_date);

CREATE INDEX IF NOT EXISTS ix_crm_project_milestones_project ON public.crm_project_milestones USING btree (project_id, order_index);

CREATE INDEX IF NOT EXISTS ix_crm_project_updates_project ON public.crm_project_updates USING btree (project_id, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_due ON public.crm_reminder_deliveries USING btree (state, next_attempt_at);

CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_job ON public.crm_reminder_deliveries USING btree (job_id);

CREATE INDEX IF NOT EXISTS ix_crm_reminder_deliveries_state_occurrence ON public.crm_reminder_deliveries USING btree (state, occurrence_at);

CREATE INDEX IF NOT EXISTS ix_crm_scheduled_jobs_due ON public.crm_scheduled_jobs USING btree (status, run_at);

CREATE INDEX IF NOT EXISTS ix_crm_staff_login_attempts_lookup ON public.crm_staff_login_attempts USING btree (scope, subject, created_at);

CREATE INDEX IF NOT EXISTS ix_crm_staff_sessions_expires_at ON public.crm_staff_sessions USING btree (expires_at);

CREATE INDEX IF NOT EXISTS ix_crm_staff_sessions_staff_id ON public.crm_staff_sessions USING btree (staff_id);

CREATE INDEX IF NOT EXISTS ix_crm_staff_status ON public.crm_staff USING btree (status);

CREATE INDEX IF NOT EXISTS ix_crm_staff_tokens_staff_kind ON public.crm_staff_tokens USING btree (staff_id, kind);

CREATE INDEX IF NOT EXISTS ix_crm_support_messages_ticket ON public.crm_support_messages USING btree (ticket_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_support_messages_visibility ON public.crm_support_messages USING btree (ticket_id, visibility, id);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_assignee_id ON public.crm_support_tickets USING btree (assigned_to_staff_id, id);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_lead ON public.crm_support_tickets USING btree (lead_id);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_priority_id ON public.crm_support_tickets USING btree (priority, id);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_project ON public.crm_support_tickets USING btree (project_id);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_status_id ON public.crm_support_tickets USING btree (status, id);

CREATE INDEX IF NOT EXISTS ix_crm_tasks_assignee_status_due ON public.crm_tasks USING btree (assigned_to_staff_id, status, due_date);

CREATE INDEX IF NOT EXISTS ix_crm_tasks_remind_at ON public.crm_tasks USING btree (remind_at);

CREATE INDEX IF NOT EXISTS ix_crm_unmatched_emails_status ON public.crm_unmatched_emails USING btree (status, received_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_admin_sessions_token_hash ON public.crm_admin_sessions USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_appointment_attendees_staff ON public.crm_appointment_attendees USING btree (appointment_id, staff_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_action_runs_step ON public.crm_automation_action_runs USING btree (execution_id, action_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_approvals_step ON public.crm_automation_approvals USING btree (execution_id, action_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_automation_executions_occurrence ON public.crm_automation_executions USING btree (rule_id, trigger, record_type, record_id, occurrence_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_document_shares_token_hash ON public.crm_document_shares USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_kb_articles_slug ON public.crm_kb_articles USING btree (slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_designs_name ON public.crm_marketing_designs USING btree (name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_exclusions ON public.crm_marketing_exclusions USING btree (campaign_id, lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_recipients ON public.crm_marketing_recipients USING btree (campaign_id, lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_segments_name ON public.crm_marketing_segments USING btree (name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_notifications_occurrence ON public.crm_notifications USING btree (occurrence_key) WHERE (occurrence_key IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_accounts_email ON public.crm_portal_accounts USING btree (email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_accounts_lead ON public.crm_portal_accounts USING btree (lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_document_grants ON public.crm_portal_document_grants USING btree (lead_id, attachment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_invitations_token_hash ON public.crm_portal_invitations USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_proposal_acceptances_deal ON public.crm_portal_proposal_acceptances USING btree (deal_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_sessions_token_hash ON public.crm_portal_sessions USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_project_templates_name ON public.crm_project_templates USING btree (name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_reminder_deliveries_occurrence ON public.crm_reminder_deliveries USING btree (job_id, occurrence_at, recipient_staff_id, recipient_address) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_scheduled_jobs_dedupe_key ON public.crm_scheduled_jobs USING btree (dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_staff_email ON public.crm_staff USING btree (email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_staff_sessions_token_hash ON public.crm_staff_sessions USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_staff_tokens_token_hash ON public.crm_staff_tokens USING btree (token_hash);

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_behavioral_events_lead_id_crm_leads_id_fk'
                    AND conrelid = 'public.crm_behavioral_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_behavioral_events ADD CONSTRAINT crm_behavioral_events_lead_id_crm_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_events_campaign_recipient_id_crm_campaign_recipien'
                    AND conrelid = 'public.crm_campaign_events'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_events ADD CONSTRAINT crm_campaign_events_campaign_recipient_id_crm_campaign_recipien FOREIGN KEY (campaign_recipient_id) REFERENCES public.crm_campaign_recipients(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_recipients_campaign_id_crm_campaigns_id_fk'
                    AND conrelid = 'public.crm_campaign_recipients'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_campaign_id_crm_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_recipients_lead_id_crm_leads_id_fk'
                    AND conrelid = 'public.crm_campaign_recipients'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_recipients ADD CONSTRAINT crm_campaign_recipients_lead_id_crm_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_scheduled_messages_campaign_id_crm_campaigns_id_fk'
                    AND conrelid = 'public.crm_campaign_scheduled_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_scheduled_messages ADD CONSTRAINT crm_campaign_scheduled_messages_campaign_id_crm_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_scheduled_messages_lead_id_crm_leads_id_fk'
                    AND conrelid = 'public.crm_campaign_scheduled_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_scheduled_messages ADD CONSTRAINT crm_campaign_scheduled_messages_lead_id_crm_leads_id_fk FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_scheduled_messages_recipient_id_crm_campaign_recip'
                    AND conrelid = 'public.crm_campaign_scheduled_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_scheduled_messages ADD CONSTRAINT crm_campaign_scheduled_messages_recipient_id_crm_campaign_recip FOREIGN KEY (recipient_id) REFERENCES public.crm_campaign_recipients(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_scheduled_messages_step_id_crm_campaign_steps_id_f'
                    AND conrelid = 'public.crm_campaign_scheduled_messages'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_scheduled_messages ADD CONSTRAINT crm_campaign_scheduled_messages_step_id_crm_campaign_steps_id_f FOREIGN KEY (step_id) REFERENCES public.crm_campaign_steps(id) ON DELETE SET NULL;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_steps_branch_false_next_step_id_crm_campaign_steps'
                    AND conrelid = 'public.crm_campaign_steps'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_steps ADD CONSTRAINT crm_campaign_steps_branch_false_next_step_id_crm_campaign_steps FOREIGN KEY (branch_false_next_step_id) REFERENCES public.crm_campaign_steps(id) ON DELETE SET NULL;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_steps_branch_true_next_step_id_crm_campaign_steps_'
                    AND conrelid = 'public.crm_campaign_steps'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_steps ADD CONSTRAINT crm_campaign_steps_branch_true_next_step_id_crm_campaign_steps_ FOREIGN KEY (branch_true_next_step_id) REFERENCES public.crm_campaign_steps(id) ON DELETE SET NULL;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_campaign_steps_campaign_id_crm_campaigns_id_fk'
                    AND conrelid = 'public.crm_campaign_steps'::regclass) THEN
    ALTER TABLE ONLY public.crm_campaign_steps ADD CONSTRAINT crm_campaign_steps_campaign_id_crm_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES public.crm_campaigns(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_delivery_recovery_actions_delivery_id_fkey'
                    AND conrelid = 'public.crm_delivery_recovery_actions'::regclass) THEN
    ALTER TABLE ONLY public.crm_delivery_recovery_actions ADD CONSTRAINT crm_delivery_recovery_actions_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.crm_reminder_deliveries(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_reminder_deliveries_job_id_fkey'
                    AND conrelid = 'public.crm_reminder_deliveries'::regclass) THEN
    ALTER TABLE ONLY public.crm_reminder_deliveries ADD CONSTRAINT crm_reminder_deliveries_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.crm_scheduled_jobs(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_sessions_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_staff_sessions'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff_sessions ADD CONSTRAINT crm_staff_sessions_staff_id_crm_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.crm_staff(id) ON DELETE CASCADE;
  END IF;
END $guard$;

DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_staff_tokens_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_staff_tokens'::regclass) THEN
    ALTER TABLE ONLY public.crm_staff_tokens ADD CONSTRAINT crm_staff_tokens_staff_id_crm_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.crm_staff(id) ON DELETE CASCADE;
  END IF;
END $guard$;

--;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--
-- This file is a FIRST installation, so its rollback is "remove the CRM".
-- That discards every CRM row in the database. It is appropriate only when the
-- install has just failed and the environment had no CRM data beforehand —
-- never as a way to undo an upgrade.
--
-- Take a backup and prove a restore first (`pnpm --filter @workspace/db run
-- backup`, then `restore:drill`). Then, if it is genuinely a fresh failed
-- install:
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.crm_unmatched_emails CASCADE;
--   DROP TABLE IF EXISTS public.crm_transactions CASCADE;
--   DROP TABLE IF EXISTS public.crm_tasks CASCADE;
--   DROP TABLE IF EXISTS public.crm_support_tickets CASCADE;
--   DROP TABLE IF EXISTS public.crm_support_messages CASCADE;
--   DROP TABLE IF EXISTS public.crm_staff_tokens CASCADE;
--   DROP TABLE IF EXISTS public.crm_staff_sessions CASCADE;
--   DROP TABLE IF EXISTS public.crm_staff_login_attempts CASCADE;
--   DROP TABLE IF EXISTS public.crm_staff CASCADE;
--   DROP TABLE IF EXISTS public.crm_scheduled_jobs CASCADE;
--   DROP TABLE IF EXISTS public.crm_reminder_deliveries CASCADE;
--   DROP TABLE IF EXISTS public.crm_projects CASCADE;
--   DROP TABLE IF EXISTS public.crm_project_updates CASCADE;
--   DROP TABLE IF EXISTS public.crm_project_templates CASCADE;
--   DROP TABLE IF EXISTS public.crm_project_milestones CASCADE;
--   DROP TABLE IF EXISTS public.crm_portal_sessions CASCADE;
--   DROP TABLE IF EXISTS public.crm_portal_proposal_acceptances CASCADE;
--   DROP TABLE IF EXISTS public.crm_portal_invitations CASCADE;
--   DROP TABLE IF EXISTS public.crm_portal_document_grants CASCADE;
--   DROP TABLE IF EXISTS public.crm_portal_accounts CASCADE;
--   DROP TABLE IF EXISTS public.crm_notifications CASCADE;
--   DROP TABLE IF EXISTS public.crm_messages CASCADE;
--   DROP TABLE IF EXISTS public.crm_message_drafts CASCADE;
--   DROP TABLE IF EXISTS public.crm_marketing_segments CASCADE;
--   DROP TABLE IF EXISTS public.crm_marketing_recipients CASCADE;
--   DROP TABLE IF EXISTS public.crm_marketing_exclusions CASCADE;
--   DROP TABLE IF EXISTS public.crm_marketing_designs CASCADE;
--   DROP TABLE IF EXISTS public.crm_marketing_campaigns CASCADE;
--   DROP TABLE IF EXISTS public.crm_leads CASCADE;
--   DROP TABLE IF EXISTS public.crm_kb_articles CASCADE;
--   DROP TABLE IF EXISTS public.crm_inbound_email_events CASCADE;
--   DROP TABLE IF EXISTS public.crm_email_templates CASCADE;
--   DROP TABLE IF EXISTS public.crm_email_suppressions CASCADE;
--   DROP TABLE IF EXISTS public.crm_email_send_counters CASCADE;
--   DROP TABLE IF EXISTS public.crm_document_shares CASCADE;
--   DROP TABLE IF EXISTS public.crm_document_requests CASCADE;
--   DROP TABLE IF EXISTS public.crm_delivery_recovery_actions CASCADE;
--   DROP TABLE IF EXISTS public.crm_deals CASCADE;
--   DROP TABLE IF EXISTS public.crm_conversations CASCADE;
--   DROP TABLE IF EXISTS public.crm_conversation_reads CASCADE;
--   DROP TABLE IF EXISTS public.crm_conversation_participants CASCADE;
--   DROP TABLE IF EXISTS public.crm_comments CASCADE;
--   DROP TABLE IF EXISTS public.crm_campaigns CASCADE;
--   DROP TABLE IF EXISTS public.crm_campaign_steps CASCADE;
--   DROP TABLE IF EXISTS public.crm_campaign_scheduled_messages CASCADE;
--   DROP TABLE IF EXISTS public.crm_campaign_recipients CASCADE;
--   DROP TABLE IF EXISTS public.crm_campaign_events CASCADE;
--   DROP TABLE IF EXISTS public.crm_behavioral_events CASCADE;
--   DROP TABLE IF EXISTS public.crm_automation_rules CASCADE;
--   DROP TABLE IF EXISTS public.crm_automation_executions CASCADE;
--   DROP TABLE IF EXISTS public.crm_automation_approvals CASCADE;
--   DROP TABLE IF EXISTS public.crm_automation_action_runs CASCADE;
--   DROP TABLE IF EXISTS public.crm_attachments CASCADE;
--   DROP TABLE IF EXISTS public.crm_attachment_blobs CASCADE;
--   DROP TABLE IF EXISTS public.crm_approvals CASCADE;
--   DROP TABLE IF EXISTS public.crm_appointments CASCADE;
--   DROP TABLE IF EXISTS public.crm_appointment_attendees CASCADE;
--   DROP TABLE IF EXISTS public.crm_admin_sessions CASCADE;
--   DROP TABLE IF EXISTS public.crm_admin_audit_log CASCADE;
--   DROP TABLE IF EXISTS public.crm_activities CASCADE;
--   COMMIT;
--
-- CASCADE is required because the sequences own their columns. Nothing outside
-- `crm_*` is referenced, so no other product's tables are affected.
-- ───────────────────────────────────────────────────────────────────────────
