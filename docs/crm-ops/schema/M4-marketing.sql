-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M4 Marketing
--
-- Reviewed schema change for the integration owner. Order-independent of the
-- M3 files and of M4-support.sql; it creates five new tables and touches
-- nothing existing.
--
-- Additive only, in the strongest sense: no existing table, column, index,
-- constraint or row is altered. In particular `crm_campaigns`,
-- `crm_campaign_recipients`, `crm_campaign_steps`, `crm_campaign_events`,
-- `crm_campaign_scheduled_messages` and `crm_email_suppressions` are left
-- exactly as they are.
--
-- Why new tables rather than columns on `crm_campaigns` — the full reasoning is
-- in lib/db/src/schema/crmMarketing.ts. In short: `crm_campaigns` is the record
-- for the SEQUENCE engine (`lib/campaignScheduler.ts` selects on its `status`,
-- `auto_send` and `stop_on_reply`), and its status vocabulary is
-- `draft | ready | archived`. A broadcast that can be paused mid-flight needs
-- `sending | paused | cancelled`. Two engines writing one status column is how
-- a paused campaign keeps sending.
--
-- What is deliberately NOT created here: a second suppression list. Global
-- suppression stays in `crm_email_suppressions` (bounces, complaints, and now
-- `reason = 'unsubscribe'`), which `lib/inboundEmail.ts` already owns.
-- `crm_marketing_exclusions` is the different thing — a one-off "leave them out
-- of THIS campaign" judgement that must not leak into every future send.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M4-marketing.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M4-marketing.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Segments ───────────────────────────────────────────────────────────────
--
-- `definition` holds conditions, never members. There is deliberately no
-- `crm_marketing_segment_members` table: a resolved list would be correct on
-- the day it was written and wrong every day after, and a relative condition
-- ("contacted in the last 30 days") cannot be frozen at all without changing
-- what it means.

CREATE TABLE IF NOT EXISTS crm_marketing_segments (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  description           text,

  definition            jsonb NOT NULL,

  created_by_staff_id   integer,
  created_by_label      text,

  -- Archived, not deleted: a sent campaign still names the segment it used.
  archived_at           timestamp with time zone,

  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_segments_name
  ON crm_marketing_segments (name);
CREATE INDEX IF NOT EXISTS ix_crm_marketing_segments_archived
  ON crm_marketing_segments (archived_at);

-- ── Designs (saved templates) ──────────────────────────────────────────────
--
-- `blocks` is the document; HTML is a render of it. Storing only HTML would
-- mean parsing our own output back into editable blocks to reopen a template,
-- which fails the first time a block carries anything unusual.

CREATE TABLE IF NOT EXISTS crm_marketing_designs (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  description           text,

  subject               text,
  preheader             text,
  blocks                jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_by_staff_id   integer,
  created_by_label      text,
  archived_at           timestamp with time zone,

  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_designs_name
  ON crm_marketing_designs (name);
CREATE INDEX IF NOT EXISTS ix_crm_marketing_designs_archived
  ON crm_marketing_designs (archived_at);

-- ── Campaigns ──────────────────────────────────────────────────────────────
--
-- No FK on segment_id / design_id: every other crm_* table omits them, and
-- adding one here would silently change what happens when another team's route
-- removes a row. Segments and designs are archived rather than deleted for the
-- same reason.

CREATE TABLE IF NOT EXISTS crm_marketing_campaigns (
  id                      serial PRIMARY KEY,
  name                    text NOT NULL,

  subject                 text NOT NULL DEFAULT '',
  preheader               text,
  blocks                  jsonb NOT NULL DEFAULT '[]'::jsonb,

  segment_id              integer,
  design_id               integer,

  status                  text NOT NULL DEFAULT 'draft',
  scheduled_at            timestamp with time zone,
  started_at              timestamp with time zone,
  paused_at               timestamp with time zone,
  cancelled_at            timestamp with time zone,
  completed_at            timestamp with time zone,

  -- The AI approval gate. A column, not a convention, because the send path
  -- has to be able to refuse.
  ai_content_state        text NOT NULL DEFAULT 'none',
  ai_drafted_at           timestamp with time zone,
  ai_grounding            jsonb,
  ai_approved_by_staff_id integer,
  ai_approved_by_label    text,
  ai_approved_at          timestamp with time zone,

  created_by_staff_id     integer,
  created_by_label        text,

  created_at              timestamp with time zone NOT NULL DEFAULT now(),
  updated_at              timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_marketing_campaigns_status
    CHECK (status IN ('draft','scheduled','sending','paused','cancelled','sent')),
  CONSTRAINT ck_crm_marketing_campaigns_ai_state
    CHECK (ai_content_state IN ('none','draft','approved')),
  -- An approved state with nobody's name on it is not an approval.
  CONSTRAINT ck_crm_marketing_campaigns_ai_approval
    CHECK (ai_content_state <> 'approved' OR ai_approved_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_crm_marketing_campaigns_status
  ON crm_marketing_campaigns (status);
CREATE INDEX IF NOT EXISTS ix_crm_marketing_campaigns_segment
  ON crm_marketing_campaigns (segment_id);

-- ── Per-campaign exclusions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_marketing_exclusions (
  id                    serial PRIMARY KEY,
  campaign_id           integer NOT NULL,
  lead_id               integer NOT NULL,
  reason                text,
  excluded_by_staff_id  integer,
  excluded_by_label     text,
  created_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_exclusions
  ON crm_marketing_exclusions (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS ix_crm_marketing_exclusions_campaign
  ON crm_marketing_exclusions (campaign_id);

-- ── The recipient ledger ───────────────────────────────────────────────────
--
-- Excluded recipients get a ROW here, alongside the sent ones, with the reason.
-- The alternative — filtering them out of the audience query — makes "412 sent
-- out of a 460-person segment" unanswerable for the other 48, and an
-- unexplained gap is the shape of a silent drop.
--
-- The CHECK is the structural half of that promise: the database will not store
-- an exclusion that does not say why.

CREATE TABLE IF NOT EXISTS crm_marketing_recipients (
  id                    serial PRIMARY KEY,
  campaign_id           integer NOT NULL,
  lead_id               integer NOT NULL,

  address               text,

  status                text NOT NULL DEFAULT 'pending',
  exclusion_reason      text,
  exclusion_detail      text,

  rendered_subject      text,
  rendered_html         text,
  fallbacks_used        jsonb,

  provider_message_id   text,
  last_error            text,

  sent_at               timestamp with time zone,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_marketing_recipients_status
    CHECK (status IN ('pending','sent','failed','excluded','test')),
  CONSTRAINT ck_crm_marketing_recipients_exclusion_reason
    CHECK (status <> 'excluded' OR exclusion_reason IS NOT NULL)
);

-- One row per contact per campaign. A resend updates this row; it never adds a
-- second one, or "how many people got this" stops being answerable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_marketing_recipients
  ON crm_marketing_recipients (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS ix_crm_marketing_recipients_campaign_status
  ON crm_marketing_recipients (campaign_id, status);

COMMIT;

-- ROLLBACK
--   BEGIN;
--   DROP TABLE IF EXISTS crm_marketing_recipients;
--   DROP TABLE IF EXISTS crm_marketing_exclusions;
--   DROP TABLE IF EXISTS crm_marketing_campaigns;
--   DROP TABLE IF EXISTS crm_marketing_designs;
--   DROP TABLE IF EXISTS crm_marketing_segments;
--   COMMIT;
--
-- Rolling back destroys every saved segment and email design, every campaign,
-- and — most consequentially — the record of who was mailed and who was not.
-- That ledger is the only evidence that a suppressed or unsubscribed address
-- was honoured, so take a dump of crm_marketing_recipients before rolling back
-- in anger. Nothing outside these five tables references them, so the drop is
-- otherwise clean. Rows written to `crm_email_suppressions` with
-- `reason = 'unsubscribe'` are NOT removed by this rollback, and must not be:
-- an unsubscribe outlives the campaign that prompted it.
