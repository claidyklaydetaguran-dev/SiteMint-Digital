-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M4 Customer Portal
--
-- Reviewed schema change for the integration owner. Order-independent of the
-- other M3/M4 files; it creates five new tables and touches nothing existing.
--
-- Additive only, in the strongest sense: no existing table, column, index,
-- constraint or row is altered. In particular `crm_leads`, `crm_projects`,
-- `crm_deals`, `crm_transactions`, `crm_attachments`, `crm_document_requests`,
-- `crm_support_tickets` and `crm_support_messages` are read by the portal and
-- written by nothing here except the two writes the portal is allowed to make
-- (a customer's document upload and a customer's ticket reply), which use the
-- existing columns exactly as staff routes do.
--
-- Why a THIRD authentication system rather than reusing one of the two that
-- exist — the full reasoning is in lib/db/src/schema/crmPortal.ts. In short: a
-- staff session resolves to grants over EVERY contact and has no per-contact
-- narrowing anywhere in its model, and a receptionist session resolves to an
-- `intake_firms` row in a different product. A third cookie name also means a
-- portal session is not merely unauthorised at a staff route, it is invisible
-- to one — `resolveStaffSession` reads `crm_staff_session` and finds nothing.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M4-portal.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M4-portal.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The portal identity ────────────────────────────────────────────────────
--
-- lead_id is UNIQUE: the contact IS the tenant. Two accounts over one contact
-- would be two doors into one tenant with no way to tell which one revoking
-- access closed.
--
-- `email` is a snapshot taken when access was granted, not a live read of
-- crm_leads.email. Editing a contact's address in the CRM must not silently
-- hand the portal login to a different mailbox.

CREATE TABLE IF NOT EXISTS crm_portal_accounts (
  id             serial PRIMARY KEY,
  lead_id        integer NOT NULL,
  email          text NOT NULL,
  password_hash  text NOT NULL,
  status         text NOT NULL DEFAULT 'active',
  session_epoch  integer NOT NULL DEFAULT 0,
  last_sign_in_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_crm_portal_accounts_status
    CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_accounts_lead
  ON crm_portal_accounts (lead_id);
-- Addresses are lowercased at write time, so this is a real uniqueness
-- guarantee over the identifier people actually type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_accounts_email
  ON crm_portal_accounts (email);

-- ── Invitations ────────────────────────────────────────────────────────────
--
-- Only the sha256 of the token is stored, so a leaked row cannot be turned
-- back into a working invitation. Single-use (accepted_at), expiring
-- (expires_at), revocable (revoked_at). The raw value exists exactly once: in
-- the response to the staff member who created it. It is never logged.

CREATE TABLE IF NOT EXISTS crm_portal_invitations (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL,
  email             text NOT NULL,
  token_hash        text NOT NULL,
  created_by_staff_id integer,
  created_by_label  text NOT NULL,
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by_staff_id integer,
  delivery_state    text,
  delivery_detail   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_invitations_token_hash
  ON crm_portal_invitations (token_hash);
CREATE INDEX IF NOT EXISTS ix_crm_portal_invitations_lead
  ON crm_portal_invitations (lead_id, id);

-- ── Sessions ───────────────────────────────────────────────────────────────
--
-- lead_id is carried here as well as on the account, and it is the value every
-- scoped query uses. That denormalisation is the point: resolving the tenant
-- costs one row read on the session itself, so no route has a reason to derive
-- the scope for itself — and therefore no chance to derive it wrongly.

CREATE TABLE IF NOT EXISTS crm_portal_sessions (
  id                serial PRIMARY KEY,
  portal_account_id integer NOT NULL,
  lead_id           integer NOT NULL,
  token_hash        text NOT NULL,
  csrf_hash         text NOT NULL,
  epoch             integer NOT NULL DEFAULT 0,
  expires_at        timestamptz NOT NULL,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  ip                text,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_sessions_token_hash
  ON crm_portal_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_crm_portal_sessions_account
  ON crm_portal_sessions (portal_account_id, id);

-- ── What a customer may see ────────────────────────────────────────────────
--
-- Default-deny, and that is the whole design. Deriving visibility from
-- association — "every attachment on this contact, their deals and their
-- projects" — is wrong in a way that only shows up once: staff attach internal
-- things to records all the time (a subcontractor's scope, a screenshot of a
-- complaint, a margin sheet), and the day somebody does, the customer can read
-- it and nobody finds out.
--
-- A file the customer uploaded themselves gets a grant written at upload time,
-- so this stays the single source of truth rather than the first of two.

CREATE TABLE IF NOT EXISTS crm_portal_document_grants (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL,
  attachment_id     integer NOT NULL,
  granted_by_staff_id integer,
  granted_by_label  text NOT NULL,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_document_grants
  ON crm_portal_document_grants (lead_id, attachment_id);
CREATE INDEX IF NOT EXISTS ix_crm_portal_document_grants_lead
  ON crm_portal_document_grants (lead_id, id);

-- ── Proposal acceptance ────────────────────────────────────────────────────
--
-- A customer said yes to a deal, in the portal, on a date. That is the entire
-- claim, and the table is shaped so nothing larger can be read into it: there
-- is no signed_at, no signature, no signer_verified, because none of those
-- things happened. `typed_name` is what the person typed into the box — it is
-- evidence of intent and nothing more, and the column name says "typed" so no
-- later reader mistakes it for an identity check.
--
-- Accepting does NOT move the deal to Won. Closing a deal is a staff act with
-- its own route, permission and audit entry.

CREATE TABLE IF NOT EXISTS crm_portal_proposal_acceptances (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL,
  deal_id           integer NOT NULL,
  portal_account_id integer,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  typed_name        text NOT NULL,
  accepted_from_ip  text,
  deal_value_at_acceptance numeric(10, 2),
  deal_name_at_acceptance  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One acceptance per deal. A double-click is not two agreements.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_proposal_acceptances_deal
  ON crm_portal_proposal_acceptances (deal_id);
CREATE INDEX IF NOT EXISTS ix_crm_portal_proposal_acceptances_lead
  ON crm_portal_proposal_acceptances (lead_id, id);

COMMIT;

-- ROLLBACK
--   BEGIN;
--   DROP TABLE IF EXISTS crm_portal_proposal_acceptances;
--   DROP TABLE IF EXISTS crm_portal_document_grants;
--   DROP TABLE IF EXISTS crm_portal_sessions;
--   DROP TABLE IF EXISTS crm_portal_invitations;
--   DROP TABLE IF EXISTS crm_portal_accounts;
--   COMMIT;
--
-- Rolling back removes every customer's portal login and every record of which
-- files they were allowed to see — and, in crm_portal_proposal_acceptances,
-- the only record that a customer ever agreed to a proposal. That last one
-- exists nowhere else: the deal row does not carry it, deliberately. Nothing in
-- the schema references these tables, so the drop is clean, but it is not
-- recoverable. Take a dump of the five tables first if rolling back in anger.
--
-- Files the customer uploaded are NOT removed by this rollback: they are rows
-- in crm_attachments / crm_attachment_blobs like any other document, and they
-- survive. Only the grant that made them visible in the portal goes.
