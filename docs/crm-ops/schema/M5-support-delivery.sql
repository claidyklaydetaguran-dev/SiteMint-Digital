-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M5 Support delivery
--
-- Reviewed schema change for the integration owner. Depends on
-- `M4-support.sql` (the three Support tables) and on `M3-inbound-email.sql`
-- (`crm_conversations.reply_token`, which this reuses rather than duplicating).
--
-- ADDITIVE ONLY, and every new column is NULLABLE. No existing column, index,
-- constraint or row is altered, and nothing is dropped. A deployment that
-- applies this and then rolls the code back keeps working: every new column
-- simply stays null, and a null `delivery_state` means exactly what it meant
-- before this file existed — "recorded here, not sent anywhere".
--
-- ── What this adds, and why each piece is load-bearing ─────────────────────
--
-- Support could record a customer reply but never send one. Delivery lives on
-- the message row rather than in a side table because a support reply has
-- exactly ONE recipient and ONE occurrence — the message itself — so the
-- (occurrence, recipient) pair that justifies `crm_reminder_deliveries` being
-- its own table collapses to the message's own identity here. The STATE
-- MACHINE is the same one, deliberately: the same five states, the same
-- "`next_attempt_at` is the only thing a retry moves", the same rule that an
-- unknown outcome is never retried by a machine.
--
-- The two constraints that matter most are the ones a future careless write
-- would otherwise get past:
--
--   ck_crm_support_messages_internal_never_sent
--       An internal note cannot carry a delivery state, an idempotency key, a
--       recipient address or a scheduled attempt. The sending code checks
--       `visibility = 'customer'` before it does anything; this constraint is
--       what makes that check impossible to forget, in this route or any
--       future one. A private note reaching a client is the single worst thing
--       this module can do, so the database refuses it rather than trusting a
--       branch.
--
--   ck_crm_support_messages_customer_words_never_sent
--       A message the CUSTOMER sent us is never something we deliver back to
--       them. Without this, a sweep over "customer-visible messages with no
--       delivery state" would happily mail the client their own words.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M5-support-delivery.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M5-support-delivery.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see the project notes on the push table boundary).
--
-- Rollback is at the bottom of this file, commented out.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The ticket's own reply address ─────────────────────────────────────────
--
-- A support ticket gets its own `crm_conversations` row, in its own identity
-- namespace (`email:support-ticket:<id>`), purely so the EXISTING reply-token
-- machinery applies to it unchanged: the conversation mints the token, the
-- outbound Reply-To carries `c-<token>@<inbound domain>`, and the existing
-- inbound webhook already correlates a received message to a conversation by
-- that token. Support therefore gains inbound correlation without a second
-- correlation scheme and without touching `inboundEmail.ts`.
--
-- Per TICKET rather than per contact: `identityKeyFor()` keys a contact's mail
-- on `email:lead:<id>`, so every ticket for one client would otherwise share
-- one token and a reply could not say which ticket it answered.
--
-- Nullable: a ticket has no conversation until the first customer reply is
-- actually sent, and a ticket that never gets one never acquires a row.

ALTER TABLE crm_support_tickets
  ADD COLUMN IF NOT EXISTS conversation_id integer;

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_conversation
  ON crm_support_tickets (conversation_id);

-- ── Delivery, on the message it belongs to ─────────────────────────────────

ALTER TABLE crm_support_messages
  -- NULL means "no delivery exists for this row", which is the correct and
  -- only possible reading for an internal note, for the customer's own words,
  -- and for every row written before this file was applied.
  ADD COLUMN IF NOT EXISTS delivery_state            text,
  ADD COLUMN IF NOT EXISTS delivery_attempt          integer,
  -- Separate from anything else, and the ONLY thing a retry moves.
  ADD COLUMN IF NOT EXISTS next_attempt_at           timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attempt_started_at        timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attempt_worker            text,
  -- Stable across every retry of this message, so the provider collapses a
  -- repeat into the original send. A deliberate re-send gets a NEW one.
  ADD COLUMN IF NOT EXISTS delivery_idempotency_key  text,
  -- The address this was actually handed to, captured at send time so a later
  -- contact edit cannot rewrite where a message went.
  ADD COLUMN IF NOT EXISTS delivered_to              text,
  ADD COLUMN IF NOT EXISTS delivery_provider_ref     text,
  ADD COLUMN IF NOT EXISTS delivery_failure_reason   text,
  ADD COLUMN IF NOT EXISTS delivery_failure_detail   text,
  ADD COLUMN IF NOT EXISTS delivery_resend_count     integer,
  ADD COLUMN IF NOT EXISTS last_recovery_action      text,
  ADD COLUMN IF NOT EXISTS last_recovery_by_staff_id integer,
  ADD COLUMN IF NOT EXISTS last_recovery_at          timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivery_resolved_at      timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivery_resolved_by_staff_id integer,
  ADD COLUMN IF NOT EXISTS delivery_resolution       text,
  ADD COLUMN IF NOT EXISTS delivery_resolution_note  text,
  -- The `crm_messages` row this thread entry was mirrored from, when the
  -- customer's words arrived by email rather than being typed in here.
  ADD COLUMN IF NOT EXISTS inbound_message_id        integer;

-- ── The closed vocabularies ────────────────────────────────────────────────
--
-- The same five states as `crm_reminder_deliveries`, for the same reasons.
-- `accepted` is the strongest thing a provider can tell us and it is NOT
-- "delivered"; `uncertain` is never retried by a machine.

DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_delivery_state
    CHECK (delivery_state IS NULL OR delivery_state IN
      ('pending', 'attempting', 'accepted', 'refused', 'uncertain'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_recovery_action
    CHECK (last_recovery_action IS NULL OR last_recovery_action IN
      ('retry', 'resend', 'acknowledge'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_delivery_resolution
    CHECK (delivery_resolution IS NULL OR delivery_resolution IN
      ('acknowledged', 'resent', 'accepted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── The two constraints this file exists for ───────────────────────────────

-- An internal note is not deliverable, and cannot be made deliverable by any
-- write from any route, now or later.
DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_internal_never_sent
    CHECK (
      visibility = 'customer'
      OR (delivery_state IS NULL
          AND delivery_idempotency_key IS NULL
          AND delivered_to IS NULL
          AND next_attempt_at IS NULL
          AND delivery_provider_ref IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- We never mail the client the words the client sent us.
DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_customer_words_never_sent
    CHECK (origin <> 'customer' OR delivery_state IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── The state-machine invariants, mirrored from M4-deliveries.sql ──────────

-- "An automatic attempt is scheduled" is only ever true of a pending row.
-- A pending row with a NULL next_attempt_at is the "waiting for a person"
-- case — mail is not configured, or an operator has to decide.
DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_next_attempt
    CHECK (next_attempt_at IS NULL OR delivery_state = 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_delivery_attempt
    CHECK (delivery_attempt IS NULL OR delivery_attempt >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_resend_count
    CHECK (delivery_resend_count IS NULL OR delivery_resend_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A closed case and its reason are one fact; neither exists without the other,
-- so "resolved" can never be half-written.
DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_resolved_pair
    CHECK ((delivery_resolved_at IS NULL) = (delivery_resolution IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nothing can be resolved that was never a delivery in the first place.
DO $$ BEGIN
  ALTER TABLE crm_support_messages ADD CONSTRAINT ck_crm_support_messages_resolved_needs_delivery
    CHECK (delivery_resolved_at IS NULL OR delivery_state IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Partial and UNIQUE. The uniqueness is the duplicate-send guard: two writes
-- can never end up holding the same provider idempotency key for different
-- messages, which is the "same key, different payload" Resend answers with
-- `invalid_idempotent_request`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_support_messages_idempotency
  ON crm_support_messages (delivery_idempotency_key)
  WHERE delivery_idempotency_key IS NOT NULL;

-- One received email becomes at most one thread entry, so re-running the
-- ingest — or two workers running it at once — cannot double-post a client's
-- reply into their own ticket.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_support_messages_inbound
  ON crm_support_messages (inbound_message_id)
  WHERE inbound_message_id IS NOT NULL;

-- The worker's claim scan.
CREATE INDEX IF NOT EXISTS ix_crm_support_messages_delivery_due
  ON crm_support_messages (delivery_state, next_attempt_at)
  WHERE delivery_state IS NOT NULL;

-- The "somebody has to look at this" list.
CREATE INDEX IF NOT EXISTS ix_crm_support_messages_delivery_open
  ON crm_support_messages (delivery_state, id)
  WHERE delivery_state IS NOT NULL AND delivery_resolved_at IS NULL;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- Rollback. Safe in the sense that it removes only what this file added; it
-- does destroy the delivery history those columns hold, so take a copy first
-- if any row has a non-null `delivery_state`.
--
-- BEGIN;
--   DROP INDEX IF EXISTS ix_crm_support_messages_delivery_open;
--   DROP INDEX IF EXISTS ix_crm_support_messages_delivery_due;
--   DROP INDEX IF EXISTS uq_crm_support_messages_inbound;
--   DROP INDEX IF EXISTS uq_crm_support_messages_idempotency;
--   ALTER TABLE crm_support_messages
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_resolved_needs_delivery,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_resolved_pair,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_resend_count,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_delivery_attempt,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_next_attempt,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_customer_words_never_sent,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_internal_never_sent,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_delivery_resolution,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_recovery_action,
--     DROP CONSTRAINT IF EXISTS ck_crm_support_messages_delivery_state;
--   ALTER TABLE crm_support_messages
--     DROP COLUMN IF EXISTS inbound_message_id,
--     DROP COLUMN IF EXISTS delivery_resolution_note,
--     DROP COLUMN IF EXISTS delivery_resolution,
--     DROP COLUMN IF EXISTS delivery_resolved_by_staff_id,
--     DROP COLUMN IF EXISTS delivery_resolved_at,
--     DROP COLUMN IF EXISTS last_recovery_at,
--     DROP COLUMN IF EXISTS last_recovery_by_staff_id,
--     DROP COLUMN IF EXISTS last_recovery_action,
--     DROP COLUMN IF EXISTS delivery_resend_count,
--     DROP COLUMN IF EXISTS delivery_failure_detail,
--     DROP COLUMN IF EXISTS delivery_failure_reason,
--     DROP COLUMN IF EXISTS delivery_provider_ref,
--     DROP COLUMN IF EXISTS delivered_to,
--     DROP COLUMN IF EXISTS delivery_idempotency_key,
--     DROP COLUMN IF EXISTS attempt_worker,
--     DROP COLUMN IF EXISTS attempt_started_at,
--     DROP COLUMN IF EXISTS next_attempt_at,
--     DROP COLUMN IF EXISTS delivery_attempt,
--     DROP COLUMN IF EXISTS delivery_state;
--   DROP INDEX IF EXISTS ix_crm_support_tickets_conversation;
--   ALTER TABLE crm_support_tickets DROP COLUMN IF EXISTS conversation_id;
-- COMMIT;
-- ───────────────────────────────────────────────────────────────────────────
