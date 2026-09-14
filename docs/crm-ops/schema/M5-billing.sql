-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M5 Quotes and Invoices
--
-- Reviewed schema change for the integration owner. Order-independent of the
-- other M3/M4/M5 files.
--
-- ADDITIVE ONLY:
--
--   * four NEW tables — crm_quotes, crm_quote_line_items, crm_invoices,
--     crm_invoice_line_items;
--   * one NEW NULLABLE column, crm_transactions.invoice_id.
--
-- Nothing existing is altered, renamed, narrowed or dropped, and no data moves.
-- Safe to apply while the application is running: the new column is nullable
-- with no default, so every existing row is valid the moment it appears, and
-- the new tables have no dependents until the code that reads them is deployed.
--
-- The shape is defined in lib/db/src/schema/crmBilling.ts and this file is the
-- same thing said in SQL.
--
-- ── Why crm_transactions gains a column instead of a parallel ledger ────────
--
-- Every "money received" figure in this CRM — the Command Center's money panel,
-- the sales forecast, the per-contact chain and the customer portal's "paid to
-- date" — is `sum(crm_transactions.amount)` filtered on
-- `status = 'completed'`. Recording an invoice payment anywhere else would
-- produce a second set of books, and the two would disagree the first week.
-- crmMoneyContract.test.ts exists because that has already happened once here,
-- in a smaller way: two readers filtered on a status string no writer ever
-- wrote, and "money received" was structurally zero while the business was
-- being paid.
--
-- So an invoice payment is an ordinary crm_transactions row, and `invoice_id`
-- is only how the invoice finds the rows that settled it. Nothing reads the new
-- column to compute a money figure; the figures keep summing the column they
-- always summed.
--
-- `deal_id` stays NOT NULL and is deliberately untouched. That is why recording
-- a payment against a standalone invoice requires naming a deal — see
-- routes/crmBilling.ts, which asks for one rather than inventing a placeholder
-- deal that would then inflate the pipeline and the forecast.
--
-- ── Money ──────────────────────────────────────────────────────────────────
--
-- numeric(10,2), exactly like crm_transactions.amount and crm_deals.value.
-- Every figure is computed by the server in integer minor units
-- (artifacts/api-server/src/lib/crmMoney.ts) and only then formatted into these
-- columns. No total is ever read from a request body.
--
-- ── The first-install artifact does NOT contain these tables ───────────────
--
-- `M4-crm-first-install.sql` is a verified snapshot of the 60-table `crm_*`
-- schema as it stood at M4, and RELEASE-PACKAGE.md §5 path A says to run it
-- alone on a virgin database. That instruction is correct for what that file
-- covers and INCOMPLETE from M5 onwards: the first-install artifact predates
-- every M5-*.sql in this directory, this one included. On a virgin database,
-- run M4-crm-first-install.sql first and then each M5-*.sql. Regenerating the
-- first-install artifact (and re-proving the "applied three times, identical
-- counts" claim attached to it) is an owner call, not something to do as a
-- side effect of adding a feature.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M5-billing.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M5-billing.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Quotes ─────────────────────────────────────────────────────────────────
--
-- lead_id is NOT NULL because it is the customer portal's tenant key: a quote
-- with no contact could never be shown to anybody, and every scoped portal read
-- filters on this column.
--
-- deal_id is nullable — a quote is sometimes drafted before the deal exists —
-- but ACCEPTING one is not. ck_crm_quotes_accepted_has_deal is the database
-- saying so, so "which deal did they actually agree to" always has an answer
-- even if a future route forgets to set it.

CREATE TABLE IF NOT EXISTS crm_quotes (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL,
  deal_id           integer,
  title             text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  currency          text NOT NULL DEFAULT 'USD',

  subtotal          numeric(10,2) NOT NULL DEFAULT 0,
  discount_type     text NOT NULL DEFAULT 'none',
  discount_value    numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(10,2) NOT NULL DEFAULT 0,
  total             numeric(10,2) NOT NULL DEFAULT 0,

  -- notes is printed on the document the customer reads.
  -- internal_notes is staff writing to staff and is never serialised into a
  -- portal payload; portalAuth.ts drops it rather than redacting it.
  notes             text,
  internal_notes    text,

  valid_until       timestamptz,
  sent_at           timestamptz,

  -- Acceptance. NOT a signature: there is no verified signer identity, no
  -- tamper-evident document version and no third-party audit trail. The column
  -- is named for the act performed.
  accepted_at       timestamptz,
  accepted_deal_id  integer,
  accepted_typed_name text,
  accepted_from_ip  text,
  accepted_by_portal_account_id integer,

  declined_at       timestamptz,
  declined_reason   text,
  expired_at        timestamptz,

  -- The rendered document in crm_attachments, written when the quote is sent.
  document_attachment_id integer,

  created_by_staff_id integer,
  created_by_label  text NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_quotes_status
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  CONSTRAINT ck_crm_quotes_discount_type
    CHECK (discount_type IN ('none', 'percent', 'amount')),
  -- Money is never negative here. A credit is a different document.
  CONSTRAINT ck_crm_quotes_amounts
    CHECK (subtotal >= 0 AND total >= 0 AND discount_amount >= 0),
  CONSTRAINT ck_crm_quotes_accepted_has_deal
    CHECK (status <> 'accepted' OR accepted_deal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_crm_quotes_lead   ON crm_quotes (lead_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_quotes_deal   ON crm_quotes (deal_id);
CREATE INDEX IF NOT EXISTS ix_crm_quotes_status ON crm_quotes (status);

CREATE TABLE IF NOT EXISTS crm_quote_line_items (
  id           serial PRIMARY KEY,
  quote_id     integer NOT NULL,
  -- Display order, so a re-read returns the list the author arranged.
  position     integer NOT NULL DEFAULT 0,
  description  text NOT NULL,
  quantity     numeric(10,2) NOT NULL DEFAULT 1,
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  -- quantity × unit_price, computed by the server, never supplied by a client.
  line_total   numeric(10,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_quote_line_items_amounts
    CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
);

CREATE INDEX IF NOT EXISTS ix_crm_quote_line_items_quote
  ON crm_quote_line_items (quote_id, position);

-- ── Invoices ───────────────────────────────────────────────────────────────
--
-- amount_paid is a CACHE of the crm_transactions rows carrying this invoice id,
-- recomputed from those rows on every payment rather than incremented. If it
-- and the transactions ever disagreed, the transactions are right — they are
-- what every money figure in this system sums.
--
-- ck_crm_invoices_void_is_unpaid is the same rule the state machine states in
-- TypeScript (there is no part_paid → void transition), put where it cannot be
-- bypassed: voiding an invoice with money against it would leave a payment
-- pointing at a document the business says never existed.

CREATE TABLE IF NOT EXISTS crm_invoices (
  id                serial PRIMARY KEY,
  lead_id           integer NOT NULL,
  deal_id           integer,
  quote_id          integer,
  title             text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  currency          text NOT NULL DEFAULT 'USD',

  subtotal          numeric(10,2) NOT NULL DEFAULT 0,
  discount_type     text NOT NULL DEFAULT 'none',
  discount_value    numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(10,2) NOT NULL DEFAULT 0,
  total             numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid       numeric(10,2) NOT NULL DEFAULT 0,

  notes             text,
  internal_notes    text,

  issued_at         timestamptz,
  due_date          timestamptz,
  paid_at           timestamptz,
  voided_at         timestamptz,
  void_reason       text,

  document_attachment_id integer,

  created_by_staff_id integer,
  created_by_label  text NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_invoices_status
    CHECK (status IN ('draft', 'issued', 'part_paid', 'paid', 'void')),
  CONSTRAINT ck_crm_invoices_discount_type
    CHECK (discount_type IN ('none', 'percent', 'amount')),
  CONSTRAINT ck_crm_invoices_amounts
    CHECK (subtotal >= 0 AND total >= 0 AND discount_amount >= 0 AND amount_paid >= 0),
  CONSTRAINT ck_crm_invoices_void_is_unpaid
    CHECK (status <> 'void' OR amount_paid = 0)
);

CREATE INDEX IF NOT EXISTS ix_crm_invoices_lead       ON crm_invoices (lead_id, id);
CREATE INDEX IF NOT EXISTS ix_crm_invoices_deal       ON crm_invoices (deal_id);
CREATE INDEX IF NOT EXISTS ix_crm_invoices_quote      ON crm_invoices (quote_id);
CREATE INDEX IF NOT EXISTS ix_crm_invoices_status_due ON crm_invoices (status, due_date);

CREATE TABLE IF NOT EXISTS crm_invoice_line_items (
  id           serial PRIMARY KEY,
  invoice_id   integer NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  description  text NOT NULL,
  quantity     numeric(10,2) NOT NULL DEFAULT 1,
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  line_total   numeric(10,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_crm_invoice_line_items_amounts
    CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0)
);

CREATE INDEX IF NOT EXISTS ix_crm_invoice_line_items_invoice
  ON crm_invoice_line_items (invoice_id, position);

-- ── The one change to an existing table ────────────────────────────────────
--
-- A new NULLABLE column with no default. Null means "recorded without an
-- invoice", which is what every row written before M5 is and what the manual
-- and Stripe payment routes still write. Nothing reads it to compute a money
-- figure.

ALTER TABLE crm_transactions ADD COLUMN IF NOT EXISTS invoice_id integer;

CREATE INDEX IF NOT EXISTS ix_crm_transactions_invoice
  ON crm_transactions (invoice_id);

COMMIT;
