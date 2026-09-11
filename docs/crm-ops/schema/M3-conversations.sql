-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M3 conversation foundation
--
-- Reviewed schema change for the integration owner. Hand-written rather than
-- produced by `drizzle-kit push` so that every statement can be read before it
-- runs: push wanted to prompt about a table rename and cannot do so
-- non-interactively, and answering that prompt blind is exactly the failure
-- mode this file avoids.
--
-- PROPERTIES
--   * Additive only. No existing column is altered, renamed, retyped or
--     dropped. No data is deleted.
--   * Idempotent. Every statement is IF NOT EXISTS / IF EXISTS guarded, so a
--     partial run resumes and a completed run is a no-op.
--   * Touches only `crm_*`. No voice_*, intake_*, discovery_*, scheduling_*,
--     helpdesk_* or stripe.* object is referenced.
--   * No foreign keys are added. The existing crm_* tables do not use them
--     (crm_messages.lead_id is already a bare integer), and introducing FK
--     enforcement here would fail against historical rows whose referent has
--     since been deleted. Referential integrity is enforced in the
--     application, consistent with the rest of the CRM.
--
-- ORDER: tables first, then the columns on crm_messages, then indexes. Safe to
-- run inside a single transaction.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Conversations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_conversations (
  id                   serial PRIMARY KEY,
  channel              text NOT NULL,
  provider             text,
  identity_key         text NOT NULL,
  contact_id           integer,
  external_address     text,
  external_name        text,
  subject              text,
  provider_thread_ref  text,
  status               text NOT NULL DEFAULT 'unassigned',
  assigned_to_staff_id integer,
  assigned_at          timestamp with time zone,
  resolved_at          timestamp with time zone,
  resolved_by_staff_id integer,
  first_message_at     timestamp with time zone,
  last_message_at      timestamp with time zone,
  last_inbound_at      timestamp with time zone,
  last_outbound_at     timestamp with time zone,
  message_count        integer NOT NULL DEFAULT 0,
  needs_review         boolean NOT NULL DEFAULT false,
  review_reason        text,
  metadata             jsonb,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_conversations_identity UNIQUE (identity_key),
  CONSTRAINT ck_crm_conversations_channel CHECK (channel IN ('phone', 'email')),
  CONSTRAINT ck_crm_conversations_status
    CHECK (status IN ('unassigned', 'assigned', 'awaiting_customer', 'resolved'))
);

CREATE INDEX IF NOT EXISTS ix_crm_conversations_last_message ON crm_conversations (last_message_at);
CREATE INDEX IF NOT EXISTS ix_crm_conversations_status       ON crm_conversations (status, last_message_at);
CREATE INDEX IF NOT EXISTS ix_crm_conversations_contact      ON crm_conversations (contact_id);
CREATE INDEX IF NOT EXISTS ix_crm_conversations_assignee     ON crm_conversations (assigned_to_staff_id);
CREATE INDEX IF NOT EXISTS ix_crm_conversations_external     ON crm_conversations (external_address);

-- ── 2. Participants ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_conversation_participants (
  id               serial PRIMARY KEY,
  conversation_id  integer NOT NULL,
  role             text NOT NULL DEFAULT 'customer',
  staff_id         integer,
  external_address text,
  display_name     text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  -- One of ours or one of theirs. Both or neither is a bug, refused here
  -- rather than left to every caller to remember.
  CONSTRAINT ck_crm_conv_participants_identity CHECK (
    (staff_id IS NOT NULL AND external_address IS NULL)
    OR (staff_id IS NULL AND external_address IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_crm_conv_participants_conversation
  ON crm_conversation_participants (conversation_id);

-- ── 3. Drafts ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_message_drafts (
  id              serial PRIMARY KEY,
  conversation_id integer NOT NULL,
  staff_id        integer NOT NULL,
  body            text,
  subject         text,
  created_at      timestamp with time zone NOT NULL DEFAULT now(),
  updated_at      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_message_drafts_conv_staff UNIQUE (conversation_id, staff_id)
);

CREATE INDEX IF NOT EXISTS ix_crm_message_drafts_staff ON crm_message_drafts (staff_id);

-- ── 4. Per-person read position ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_conversation_reads (
  id                   serial PRIMARY KEY,
  staff_id             integer NOT NULL,
  conversation_id      integer NOT NULL,
  last_read_at         timestamp with time zone NOT NULL DEFAULT now(),
  last_read_message_id integer,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_conversation_reads_staff_conv UNIQUE (staff_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS ix_crm_conversation_reads_staff ON crm_conversation_reads (staff_id);

-- `crm_thread_reads` was introduced earlier on this same unpushed branch and
-- superseded by the table above before release. It has never existed in a
-- deployed environment, so this is a no-op there; the guard exists only so a
-- developer machine that ran the intermediate state converges.
DROP TABLE IF EXISTS crm_thread_reads;

-- ── 5. crm_messages: additive columns ──────────────────────────────────────
--
-- All nullable, no defaults, no backfill in this file. Existing rows keep
-- exactly the values they have; `conversation_id` and `origin` are populated
-- afterwards by the idempotent application backfill
-- (POST /api/crm/inbox/backfill), which is re-runnable and reports what it did.

ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS conversation_id     integer;
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS sent_by_staff_id    integer;
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS sent_by_label       text;
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS origin              text;
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS subject             text;
ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE INDEX IF NOT EXISTS ix_crm_messages_conversation ON crm_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ix_crm_messages_sent_by      ON crm_messages (sent_by_staff_id);

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--
-- Safe because the change is purely additive: dropping these removes only
-- data this feature created. Message history is untouched — the columns below
-- are indexes into conversations, not the messages themselves.
--
--   BEGIN;
--   DROP INDEX IF EXISTS ix_crm_messages_sent_by;
--   DROP INDEX IF EXISTS ix_crm_messages_conversation;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS provider_message_id;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS subject;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS origin;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS sent_by_label;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS sent_by_staff_id;
--   ALTER TABLE crm_messages DROP COLUMN IF EXISTS conversation_id;
--   DROP TABLE IF EXISTS crm_conversation_reads;
--   DROP TABLE IF EXISTS crm_message_drafts;
--   DROP TABLE IF EXISTS crm_conversation_participants;
--   DROP TABLE IF EXISTS crm_conversations;
--   COMMIT;
--
-- The application tolerates the rolled-back state only if the code is rolled
-- back with it: the inbox routes select these columns. Roll back code first,
-- then schema.
-- ───────────────────────────────────────────────────────────────────────────
