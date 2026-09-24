-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — provider delivery and engagement events
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY: one NEW
-- table, `crm_email_provider_events`. No existing table, column, constraint or
-- index is created, altered, renamed or dropped by this file, and it writes no
-- data.
--
-- The shape is defined in lib/db/src/schema/crmEmailEvents.ts and this file is
-- the same thing said in SQL, with drizzle's own constraint and index names, so
-- a later `drizzle-kit push` finds nothing to rename. CRM tables are otherwise
-- maintained with push; this file exists so the table can be created on a
-- database without running push at all (push needs a TTY, and its tablesFilter
-- breaks introspection — see the M4 files for the same note).
--
-- ORDER: apply this file BEFORE starting the application version that ships it.
-- That version's webhook route writes to this table on the first event it
-- receives, and the events it would drop cannot be asked for again: Resend's
-- retry schedule is finite (immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h) and
-- then the event is gone. The previous application version keeps working after
-- this file is applied: the table is new and nothing else reads it.
--
-- ── What it is for ─────────────────────────────────────────────────────────
--
-- Until now the CRM recorded only its own half of a send — "the provider
-- accepted this and returned an id" — which is the weakest true statement
-- available. It is not delivery. A message that bounced ten seconds later left
-- no trace on the record it belonged to, an unknown outcome could never be
-- resolved by evidence, and every engagement figure had to be reported as
-- untracked because nothing was writing one.
--
-- Every verified webhook event is written here BEFORE it is interpreted, and
-- delivery state and engagement are derived from these rows rather than
-- materialised beside them. Three consequences, each deliberate:
--
--   * A processing fault is retryable without asking the provider to send the
--     event again — which it will not do once its retries are exhausted.
--   * Out-of-order events cannot corrupt a stored answer. An `email.sent`
--     retried at ten hours arriving after its `email.delivered` changes
--     nothing, because the answer is recomputed from per-state timestamps.
--   * "We received 412 events and matched 408" stays answerable, because the
--     four that matched nothing are rows rather than log lines.
--
-- ── Why svix_id is the unique key ──────────────────────────────────────────
--
-- Resend retries a failed delivery eight times and an operator can replay a
-- delivered event from the dashboard. Without this constraint one open becomes
-- eight opens, and every engagement figure built on top is a multiple of the
-- truth rather than a measurement. `provider_email_id` is deliberately NOT
-- unique: one email legitimately produces many events, and several opens of
-- one message are the whole point of counting them.
--
-- ── Apply with ─────────────────────────────────────────────────────────────
--   psql -v ON_ERROR_STOP=1 "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M6-email-provider-events.sql
--   psql -v ON_ERROR_STOP=1 "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M6-email-provider-events.sql
--
-- IDEMPOTENT and safe to re-run: every statement is guarded, and none of them
-- touches a row.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Roll the APPLICATION back first (see ORDER above), then:
--
--   BEGIN;
--   DROP TABLE IF EXISTS crm_email_provider_events;
--   COMMIT;
--
-- Dropping it loses every recorded provider event, and they cannot be
-- re-requested. Nothing else depends on the table: no other table references
-- it, and every record that carries a provider id or a `crm_ref` tag keeps its
-- own columns exactly as they were.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS crm_email_provider_events (
  id                  serial PRIMARY KEY,

  -- The `svix-id` header: one delivery attempt of one event.
  svix_id             text NOT NULL,
  -- `email.delivered`, `email.opened`, … exactly as the provider named it.
  -- Not constrained to a list on purpose: an unrecognised type is stored as
  -- evidence and ignored, which is strictly better than refusing a signed
  -- event because the provider added a new one.
  event_type          text NOT NULL,

  -- `data.email_id` — the provider's id for the message this is about.
  provider_email_id   text,
  -- Our own `crm_ref` tag, echoed back. It is what lets an event reach a
  -- record whose send outcome was UNCERTAIN: those sends never learned a
  -- provider id, so without the tag a `delivered` event for one of them could
  -- never be recognised as the evidence that closes it.
  crm_ref             text,

  recipient           text,
  -- Domain of `data.from`. Open/click tracking is configured per domain in
  -- Resend, so "has tracking ever produced an event here" is a per-domain
  -- question, and it is the question that decides whether engagement figures
  -- are reported at all instead of being shown as zero.
  sender_domain       text,

  -- The event's own time, from the payload's TOP-LEVEL created_at. Deliberately
  -- not data.created_at, which is when the EMAIL was created: reading that as
  -- the event time stamps every open with the moment the message was sent.
  occurred_at         timestamp with time zone NOT NULL,

  click_link          text,
  bounce_type         text,
  detail              text,

  -- The verified payload, whole, so an interpretation can be redone later
  -- against the original rather than against what an earlier version of the
  -- code happened to extract from it.
  payload             jsonb NOT NULL,

  state               text NOT NULL DEFAULT 'received',
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  next_attempt_at     timestamp with time zone,
  claimed_at          timestamp with time zone,

  match_status        text,
  matched_records     jsonb,

  received_at         timestamp with time zone NOT NULL DEFAULT now(),
  processed_at        timestamp with time zone,

  CONSTRAINT uq_crm_email_provider_events_svix UNIQUE (svix_id),

  CONSTRAINT ck_crm_email_provider_events_state
    CHECK (state IN ('received', 'processing', 'processed', 'failed', 'ignored')),

  -- `unmatched` is a normal outcome, not an error: mail sent from another
  -- system on the same domain, or a record deleted since, produces events
  -- nobody here owns.
  CONSTRAINT ck_crm_email_provider_events_match
    CHECK (match_status IS NULL OR match_status IN ('matched', 'unmatched', 'not_applicable')),

  CONSTRAINT ck_crm_email_provider_events_attempts CHECK (attempts >= 0)
);

-- "What is known about this email" — every delivery-state and engagement read.
CREATE INDEX IF NOT EXISTS ix_crm_email_provider_events_email
  ON crm_email_provider_events (provider_email_id, event_type);

-- The tag path, for records that never learned a provider id.
CREATE INDEX IF NOT EXISTS ix_crm_email_provider_events_ref
  ON crm_email_provider_events (crm_ref);

-- Reporting windows.
CREATE INDEX IF NOT EXISTS ix_crm_email_provider_events_type_occurred
  ON crm_email_provider_events (event_type, occurred_at);

-- The processing sweep: stored events that still need interpreting.
CREATE INDEX IF NOT EXISTS ix_crm_email_provider_events_work
  ON crm_email_provider_events (state, next_attempt_at);

-- "Has this sending domain ever recorded an open?"
CREATE INDEX IF NOT EXISTS ix_crm_email_provider_events_domain
  ON crm_email_provider_events (sender_domain, event_type, occurred_at);

COMMENT ON TABLE crm_email_provider_events IS
  'Every verified provider webhook event (sent/delivered/delayed/bounced/complained/failed/suppressed/opened/clicked), stored before it is interpreted. One row per svix-id, so a provider retry or a dashboard replay cannot double-count. Delivery state and engagement are DERIVED from these rows, never materialised beside them.';
COMMENT ON COLUMN crm_email_provider_events.crm_ref IS
  'The crm_ref tag the outbound message carried (<kind>-<id>), echoed back by the provider. The only way to attach an event to a send whose outcome was uncertain and therefore has no provider id.';
COMMENT ON COLUMN crm_email_provider_events.occurred_at IS
  'The event time (payload top-level created_at), NOT data.created_at, which is when the email was created.';

COMMIT;

-- ── After applying ─────────────────────────────────────────────────────────
--
-- 1. The table exists and is empty. Expected: 0.
--
--    SELECT count(*) FROM crm_email_provider_events;
--
-- 2. What has arrived since, by type — the first thing to look at when asking
--    whether the webhook is actually wired up:
--
--    SELECT event_type, count(*), min(occurred_at), max(occurred_at)
--      FROM crm_email_provider_events
--     GROUP BY event_type ORDER BY 2 DESC;
--
-- 3. Events that reached nothing of ours, and events whose interpretation is
--    stuck. Both are normal in small numbers and worth reading:
--
--    SELECT id, event_type, provider_email_id, crm_ref, recipient, occurred_at
--      FROM crm_email_provider_events
--     WHERE match_status = 'unmatched' ORDER BY id DESC LIMIT 50;
--
--    SELECT id, event_type, state, attempts, last_error, received_at
--      FROM crm_email_provider_events
--     WHERE state IN ('failed', 'processing') ORDER BY id DESC LIMIT 50;
