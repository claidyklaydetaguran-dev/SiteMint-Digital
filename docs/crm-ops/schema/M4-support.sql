-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M4 Support
--
-- Reviewed schema change for the integration owner. Order-independent of the
-- three M3 files; it creates three new tables and touches nothing existing.
--
-- Additive only, in the strongest sense: no existing table, column, index,
-- constraint or row is altered. In particular the legacy `helpdesk_tickets`,
-- `helpdesk_messages`, `helpdesk_contacts` and `helpdesk_agents` tables and
-- their routes are left exactly as they are.
--
-- Why new tables rather than columns on helpdesk_tickets — the full reasoning
-- is in lib/db/src/schema/crmSupport.ts. In short: `helpdesk_tickets.contact_id`
-- is NOT NULL against a separate contact universe (`helpdesk_contacts`, not
-- `crm_leads`); `assignee_id` points at `helpdesk_agents`, not `crm_staff`; and
-- the legacy routes — which must keep working — write any status with no state
-- machine, take the message author's NAME from the request body, and carry
-- their own `is_internal_note` boolean. Sharing rows would leave two columns
-- independently claiming to control customer visibility and a hole straight
-- through the state machine. All four legacy tables are empty in both the test
-- and preview databases, and no UI in the repo calls those routes.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M4-support.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M4-support.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Tickets ────────────────────────────────────────────────────────────────
--
-- No ticket_number column: the public reference is derived from the immutable
-- id at read time (SUP-00042), so two concurrent creates cannot be handed the
-- same number the way the legacy count(*)-based scheme can.

CREATE TABLE IF NOT EXISTS crm_support_tickets (
  id                        serial PRIMARY KEY,
  subject                   text NOT NULL,
  description               text,

  status                    text NOT NULL DEFAULT 'new',
  priority                  text NOT NULL DEFAULT 'normal',
  source                    text NOT NULL DEFAULT 'staff',
  request_type              text,

  -- A support ticket with no customer is not a ticket. No FK: every other
  -- crm_* table omits them, and adding one here would silently change what
  -- happens when another team's route deletes a contact.
  lead_id                   integer NOT NULL,
  project_id                integer,

  assigned_to_staff_id      integer,
  assigned_at               timestamp with time zone,

  opened_by_staff_id        integer,
  opened_by_label           text,

  -- First reply to the CUSTOMER. An internal note is not a response to anybody
  -- and must never be allowed to satisfy this.
  first_response_at         timestamp with time zone,
  last_customer_message_at  timestamp with time zone,
  last_staff_message_at     timestamp with time zone,

  resolved_at               timestamp with time zone,
  resolved_by_staff_id      integer,
  resolution                text,
  resolution_note           text,
  closed_at                 timestamp with time zone,

  reopened_at               timestamp with time zone,
  reopen_count              integer NOT NULL DEFAULT 0,

  kb_article_id             integer,

  created_at                timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_support_tickets_status
    CHECK (status IN ('new', 'open', 'waiting_on_customer', 'resolved', 'closed')),
  CONSTRAINT ck_crm_support_tickets_priority
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  CONSTRAINT ck_crm_support_tickets_source
    CHECK (source IN ('staff', 'service_request', 'email', 'phone')),
  CONSTRAINT ck_crm_support_tickets_request_type
    CHECK (request_type IS NULL OR request_type IN (
      'content_change', 'bug_report', 'new_feature', 'hosting_or_domain',
      'billing_question', 'training_or_how_to', 'access_request', 'other')),
  CONSTRAINT ck_crm_support_tickets_resolution_value
    CHECK (resolution IS NULL OR resolution IN (
      'fixed', 'answered', 'workaround_provided', 'duplicate', 'not_reproducible',
      'withdrawn_by_customer', 'no_response_from_customer', 'out_of_scope', 'other')),
  -- "Resolution requires a reason", enforced here rather than trusting whichever
  -- route happens to be careful.
  CONSTRAINT ck_crm_support_tickets_resolution_required
    CHECK (status NOT IN ('resolved', 'closed') OR resolution IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_status_id
  ON crm_support_tickets (status, id);
CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_assignee_id
  ON crm_support_tickets (assigned_to_staff_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_priority_id
  ON crm_support_tickets (priority, id);
CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_lead
  ON crm_support_tickets (lead_id);
CREATE INDEX IF NOT EXISTS ix_crm_support_tickets_project
  ON crm_support_tickets (project_id);

-- ── Thread ─────────────────────────────────────────────────────────────────
--
-- `visibility` has NO DEFAULT, deliberately. The legacy helpdesk's
-- `is_internal_note boolean NOT NULL DEFAULT false` means a write that forgets
-- to say lands customer-side; here a write that forgets to say fails.

CREATE TABLE IF NOT EXISTS crm_support_messages (
  id              serial PRIMARY KEY,
  ticket_id       integer NOT NULL,

  visibility      text NOT NULL,
  body            text NOT NULL,

  sent_by_staff_id integer,
  sent_by_label    text,
  origin           text NOT NULL,

  created_at      timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_support_messages_visibility
    CHECK (visibility IN ('customer', 'internal')),
  CONSTRAINT ck_crm_support_messages_origin
    CHECK (origin IN ('staff', 'customer', 'automated', 'legacy')),
  -- An internal note is ours by definition; it can never be attributed to the
  -- customer, which would be a note they "wrote" and cannot see.
  CONSTRAINT ck_crm_support_messages_internal_is_ours
    CHECK (visibility <> 'internal' OR origin <> 'customer')
);

CREATE INDEX IF NOT EXISTS ix_crm_support_messages_ticket
  ON crm_support_messages (ticket_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_support_messages_visibility
  ON crm_support_messages (ticket_id, visibility, id);

-- ── Knowledge base ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_kb_articles (
  id                  serial PRIMARY KEY,
  slug                text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  category            text,
  status              text NOT NULL DEFAULT 'draft',

  author_staff_id     integer,
  author_label        text,
  updated_by_staff_id integer,
  updated_by_label    text,

  published_at        timestamp with time zone,

  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_kb_articles_status CHECK (status IN ('draft', 'published')),
  CONSTRAINT ck_crm_kb_articles_published_at
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_kb_articles_slug
  ON crm_kb_articles (slug);
CREATE INDEX IF NOT EXISTS ix_crm_kb_articles_status_id
  ON crm_kb_articles (status, id);
CREATE INDEX IF NOT EXISTS ix_crm_kb_articles_category
  ON crm_kb_articles (category);

COMMIT;

-- ROLLBACK
--   BEGIN;
--   DROP TABLE IF EXISTS crm_support_messages;
--   DROP TABLE IF EXISTS crm_support_tickets;
--   DROP TABLE IF EXISTS crm_kb_articles;
--   COMMIT;
--
-- Rolling back destroys every support ticket, its whole thread — including the
-- internal notes, which exist nowhere else — and every knowledge-base article.
-- Nothing else in the schema references these tables, so the drop is clean, but
-- it is not recoverable. Take a dump of the three tables first if rolling back
-- in anger.
