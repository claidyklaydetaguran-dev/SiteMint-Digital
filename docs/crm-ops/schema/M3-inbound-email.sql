-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M3 inbound email
--
-- Reviewed schema change for the integration owner. Apply AFTER
-- M3-conversations.sql, which creates crm_conversations.
--
-- PROPERTIES
--   * Additive only. Four new tables plus two nullable columns on
--     crm_conversations. No existing column is altered, renamed or dropped.
--   * Idempotent and transactional.
--   * Touches only crm_* tables.
--
-- Nothing here is active until the configuration in §5 of the release package
-- is present. Without it, the webhook route answers 503 and no mail is
-- received — which is a stated, visible state rather than a silent drop.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Reply addressing on conversations ───────────────────────────────────
--
-- `reply_token` is the primary correlation key for an inbound reply, not a
-- convenience. Resend's inbound API exposes no SPF/DKIM/spam verdict, so a
-- message's `from` address is an unauthenticated claim; matching a reply on
-- the sender alone would let anyone insert a message into a client's thread by
-- setting a header. The token travels out in our own Reply-To and comes back
-- in the recipient address, where it cannot be forged without knowing it.
--
-- `reference_chain` exists because Resend does not thread automatically — its
-- own documentation shows the application maintaining the References array and
-- passing it back on each send.

ALTER TABLE crm_conversations ADD COLUMN IF NOT EXISTS reply_token     text;
ALTER TABLE crm_conversations ADD COLUMN IF NOT EXISTS reference_chain text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_crm_conversations_reply_token'
  ) THEN
    ALTER TABLE crm_conversations
      ADD CONSTRAINT uq_crm_conversations_reply_token UNIQUE (reply_token);
  END IF;
END $$;

-- ── 2. Webhook event log (the deduplication boundary) ──────────────────────
--
-- Two different unique keys, because they catch different duplicates:
--   svix_id   the delivery attempt — catches Resend's automatic retries
--             (immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h)
--   email_id  the message itself — catches an operator replaying an already
--             delivered event from the dashboard, which reuses the payload and
--             would otherwise create a second copy of a real client email
--
-- email_id is indexed rather than constrained because it is null for payloads
-- that never named one, and a UNIQUE constraint would be the wrong shape for
-- that; the duplicate check runs in code against this index.

CREATE TABLE IF NOT EXISTS crm_inbound_email_events (
  id              serial PRIMARY KEY,
  svix_id         text NOT NULL,
  email_id        text,
  event_type      text NOT NULL,
  state           text NOT NULL DEFAULT 'received',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  payload         jsonb,
  message_id      integer,
  conversation_id integer,
  received_at     timestamp with time zone NOT NULL DEFAULT now(),
  processed_at    timestamp with time zone,
  CONSTRAINT uq_crm_inbound_email_events_svix UNIQUE (svix_id)
);

CREATE INDEX IF NOT EXISTS ix_crm_inbound_email_events_email
  ON crm_inbound_email_events (email_id);
CREATE INDEX IF NOT EXISTS ix_crm_inbound_email_events_state
  ON crm_inbound_email_events (state, received_at);

-- ── 3. Suppression mirror ──────────────────────────────────────────────────
--
-- Resend maintains the authoritative suppression list and exposes it over its
-- API. This is a local mirror so a contact can show "unmailable" without a
-- network call, and so a send is refused before it is attempted.

CREATE TABLE IF NOT EXISTS crm_email_suppressions (
  id                   serial PRIMARY KEY,
  address              text NOT NULL,
  reason               text NOT NULL,
  bounce_type          text,
  detail               text,
  source               text NOT NULL DEFAULT 'provider',
  suppressed_at        timestamp with time zone NOT NULL DEFAULT now(),
  released_at          timestamp with time zone,
  released_by_staff_id integer,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uq_crm_email_suppressions_address UNIQUE (address)
);

CREATE INDEX IF NOT EXISTS ix_crm_email_suppressions_reason
  ON crm_email_suppressions (reason);

-- ── 4. Unmatched mail ──────────────────────────────────────────────────────
--
-- The alternative is dropping mail we cannot place, which for a business inbox
-- is unacceptable: a real client writing from an unfamiliar address would
-- vanish. Everything lands somewhere, and anything ambiguous lands here.

CREATE TABLE IF NOT EXISTS crm_unmatched_emails (
  id                       serial PRIMARY KEY,
  email_id                 text,
  from_address             text,
  to_address               text,
  subject                  text,
  body_text                text,
  body_html                text,
  headers                  jsonb,
  reason                   text NOT NULL,
  status                   text NOT NULL DEFAULT 'pending',
  resolved_by_staff_id     integer,
  resolved_at              timestamp with time zone,
  attached_conversation_id integer,
  received_at              timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_crm_unmatched_emails_status
  ON crm_unmatched_emails (status, received_at);

-- ── 5. Reply-loop brake ────────────────────────────────────────────────────
--
-- Their auto-responder answering our auto-responder is an infinite loop that
-- bills real money and floods a real person. Header heuristics catch the
-- polite cases; a hard per-conversation cap catches the rest.

CREATE TABLE IF NOT EXISTS crm_email_send_counters (
  id              serial PRIMARY KEY,
  conversation_id integer NOT NULL,
  window_start    timestamp with time zone NOT NULL,
  sent            integer NOT NULL DEFAULT 0,
  halted_at       timestamp with time zone,
  halt_reason     text,
  CONSTRAINT uq_crm_email_send_counters_conv_window UNIQUE (conversation_id, window_start)
);

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--
--   BEGIN;
--   DROP TABLE IF EXISTS crm_email_send_counters;
--   DROP TABLE IF EXISTS crm_unmatched_emails;
--   DROP TABLE IF EXISTS crm_email_suppressions;
--   DROP TABLE IF EXISTS crm_inbound_email_events;
--   ALTER TABLE crm_conversations DROP CONSTRAINT IF EXISTS uq_crm_conversations_reply_token;
--   ALTER TABLE crm_conversations DROP COLUMN IF EXISTS reference_chain;
--   ALTER TABLE crm_conversations DROP COLUMN IF EXISTS reply_token;
--   COMMIT;
--
-- Rolling this back discards received mail that was stored here and nowhere
-- else. Resend retains inbound content for only 30 days, so after that window
-- it cannot be re-fetched. Export crm_unmatched_emails and any email-channel
-- rows in crm_messages before rolling back in anger.
-- ───────────────────────────────────────────────────────────────────────────
