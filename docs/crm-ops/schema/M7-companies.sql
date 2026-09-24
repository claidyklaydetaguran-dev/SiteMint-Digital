-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — companies, modelled separately from the people who work there
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * one NEW table, crm_companies — a company or account the business deals
--     with: its name, web domain, website, phone, industry, address, notes and
--     the member of staff who looks after it, plus an archive marker;
--   * one NEW column on crm_leads, company_id — NULLABLE, a foreign key to
--     crm_companies(id) ON DELETE SET NULL, with its own index;
--   * their foreign keys, indexes and comments.
--
-- `crm_leads.company` (the typed company name) is NOT dropped, renamed,
-- narrowed or altered, and no other column or table is touched. NO ROW in any
-- existing table is changed: this file contains no backfill (see below).
--
-- ORDER: apply this file BEFORE starting the application version that ships
-- it. That version selects crm_leads.company_id on every contact query, and
-- fails without the column. The previous version keeps working after this file
-- is applied: the column is nullable, nothing writes it, and the table is new.
--
-- The shape is defined in lib/db/src/schema/crmCompanies.ts and
-- lib/db/src/schema/crmLeads.ts, and this file is the same thing said in SQL,
-- with drizzle's own constraint and index names and crm_companies' columns in
-- the schema's order, so a later `drizzle-kit push` finds nothing to rename or
-- reorder. CRM tables are otherwise maintained with push. A FIRST INSTALLATION
-- (M4-crm-first-install.sql) does not carry this table or column, so a virgin
-- install must still run this file.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- A customer was a lead with status "Client", and the business that person
-- works for was the free-text crm_leads.company. Two people from one business
-- were two unrelated rows that happened to share some characters, so nothing
-- could answer "what do we have going on with this business?" — its people,
-- deals, projects, open tickets, quotes and invoices — and a company with
-- nobody attached to it yet could not be recorded at all.
--
-- ── Why there is no backfill ───────────────────────────────────────────────
--
-- crm_leads.company holds whatever somebody typed or imported: "Acme",
-- "ACME Ltd", "Acme Limited ", "acme". Whether those are one organisation is a
-- judgement, and so is whether two gmail.com addresses are colleagues (they are
-- not). A backfill would make that judgement silently, for every contact, on
-- the morning this file was applied.
--
-- So the CRM offers it instead, as suggestions a person reviews (Companies →
-- "Review suggestions from your contacts"): contacts not yet linked, grouped by
-- their normalised company text, and separately by work email domain with the
-- free-mail providers excluded. A person picks the groups, chooses to create a
-- company or link to an existing one, sees a summary, and applies it in one
-- transaction. Nothing is linked that somebody did not choose.
--
-- ── The two matching keys ──────────────────────────────────────────────────
--
--   normalized_name  name lower-cased, trimmed, internal whitespace collapsed
--                    to one space. Computed by the APPLICATION at write time
--                    (artifacts/api-server/src/lib/companies.ts), never here:
--                    lower() follows the database's locale and the
--                    application's JavaScript follows Unicode, so a SQL-side
--                    key could disagree with the application about the same
--                    name on some installs. This file writes no rows, so it
--                    never has to compute one.
--   domain           lower-case host, no scheme, no leading "www.", no path
--                    ("https://www.Acme.com/about" → "acme.com").
--
-- Neither is UNIQUE, deliberately. Two genuinely different businesses can
-- share a name, and a group and its subsidiary can share a domain. A match is a
-- duplicate WARNING when a company is created — the candidates are shown and a
-- person may open the existing one or create the new one anyway.
--
-- ── Foreign keys ───────────────────────────────────────────────────────────
--
--   crm_leads.company_id → crm_companies(id) ON DELETE SET NULL. The CRM
--     refuses to delete a company while a current contact is linked (the
--     route answers 409 and the person unlinks or archives instead), so in
--     practice SET NULL only ever clears a merged-away contact row, which is
--     retained history rather than part of the book. A contact must never
--     become undeletable, or point at a company that is gone.
--   crm_companies.owner_staff_id and created_by_staff_id → crm_staff(id)
--     ON DELETE SET NULL, for the reason crm_leads.assigned_to_staff_id is:
--     staff rows are disabled rather than deleted, but a deleted one must not
--     make the company undeletable or name somebody who no longer exists.
--
-- ── Apply with ─────────────────────────────────────────────────────────────
--   psql -v ON_ERROR_STOP=1 "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M7-companies.sql
--   psql -v ON_ERROR_STOP=1 "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M7-companies.sql
--
-- Take the backup and the restore drill first (RELEASE-PACKAGE.md §4).
--
-- IDEMPOTENT, and safe to re-run: every CREATE is IF NOT EXISTS, the column is
-- ADD COLUMN IF NOT EXISTS, and each named constraint is added only when
-- pg_constraint does not already hold it (PostgreSQL has no ADD CONSTRAINT IF
-- NOT EXISTS). A second run changes nothing, including after people have
-- created companies and linked contacts.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Roll the APPLICATION back first (see ORDER above). Dropping the column loses
-- every link a person made between a contact and a company, and dropping the
-- table loses the companies themselves. crm_leads.company still holds the typed
-- names, so the suggestions can be reviewed again — the work is repeatable, not
-- recoverable. Export the companies first if they matter.
--
--   BEGIN;
--   ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_company_id_crm_companies_id_fk;
--   DROP INDEX IF EXISTS ix_crm_leads_company_id;
--   ALTER TABLE crm_leads DROP COLUMN IF EXISTS company_id;
--   DROP TABLE IF EXISTS crm_companies;
--   COMMIT;
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- Two concurrent runs of this file queue behind each other rather than racing
-- the guarded constraint checks below.
SELECT pg_advisory_xact_lock(hashtext('crm_companies'));

-- ── The table ──────────────────────────────────────────────────────────────
--
-- Column order is the schema's order (lib/db/src/schema/crmCompanies.ts).

CREATE TABLE IF NOT EXISTS crm_companies (
  id                  serial PRIMARY KEY,
  name                text NOT NULL,
  normalized_name     text NOT NULL,
  domain              text,
  website             text,
  phone               text,
  industry            text,
  address_line1       text,
  address_line2       text,
  city                text,
  region              text,
  postal_code         text,
  country             text,
  notes               text,
  owner_staff_id      integer,
  created_by_staff_id integer,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_companies_owner_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_companies'::regclass) THEN
    ALTER TABLE crm_companies
      ADD CONSTRAINT crm_companies_owner_staff_id_crm_staff_id_fk
      FOREIGN KEY (owner_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_companies_created_by_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_companies'::regclass) THEN
    ALTER TABLE crm_companies
      ADD CONSTRAINT crm_companies_created_by_staff_id_crm_staff_id_fk
      FOREIGN KEY (created_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- The duplicate warning's two questions, and "whose companies are these".
CREATE INDEX IF NOT EXISTS ix_crm_companies_normalized_name
  ON crm_companies (normalized_name);
CREATE INDEX IF NOT EXISTS ix_crm_companies_domain
  ON crm_companies (domain);
CREATE INDEX IF NOT EXISTS ix_crm_companies_owner_staff_id
  ON crm_companies (owner_staff_id);

COMMENT ON TABLE crm_companies IS
  'A company or account, modelled separately from the people who work there. Contacts point at it through crm_leads.company_id; nothing links a contact automatically.';
COMMENT ON COLUMN crm_companies.normalized_name IS
  'name lower-cased, trimmed, internal whitespace collapsed; computed by the application at write time. NOT unique: drives a duplicate warning a person may override.';
COMMENT ON COLUMN crm_companies.domain IS
  'Normalised web domain: lower-case host, no scheme, no leading www., no path. NOT unique.';
COMMENT ON COLUMN crm_companies.archived_at IS
  'Set when archived: hidden from the company list by default, and no new contact may be linked. People already linked stay linked.';

-- ── The column ─────────────────────────────────────────────────────────────
--
-- Nullable, and stays nullable: "not linked to a company record" is the real
-- state of every existing contact, and of any contact whose company nobody has
-- recorded.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS company_id integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_leads_company_id_crm_companies_id_fk'
                    AND conrelid = 'public.crm_leads'::regclass) THEN
    ALTER TABLE crm_leads
      ADD CONSTRAINT crm_leads_company_id_crm_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES crm_companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- "Who works at this company" — the company record and the contact filter.
CREATE INDEX IF NOT EXISTS ix_crm_leads_company_id
  ON crm_leads (company_id);

COMMENT ON COLUMN crm_leads.company_id IS
  'The company record this contact is linked to. NULL = not linked. Set only by a person (the contact record, or reviewed suggestions); never derived from crm_leads.company, which is kept as typed.';

COMMIT;

-- ── After applying ─────────────────────────────────────────────────────────
--
-- 1. The objects exist under drizzle's names. Expected: 3 constraints, 4 indexes.
--
--    SELECT conname FROM pg_constraint
--     WHERE conname IN ('crm_companies_owner_staff_id_crm_staff_id_fk',
--                       'crm_companies_created_by_staff_id_crm_staff_id_fk',
--                       'crm_leads_company_id_crm_companies_id_fk')
--     ORDER BY 1;
--    SELECT indexname FROM pg_indexes
--     WHERE indexname IN ('ix_crm_companies_normalized_name', 'ix_crm_companies_domain',
--                         'ix_crm_companies_owner_staff_id', 'ix_crm_leads_company_id')
--     ORDER BY 1;
--
-- 2. The column is nullable and nothing was linked by this file. Expected on
--    the FIRST application: is_nullable = YES, linked = 0, companies = 0. (Once
--    the application has been in use, linked and companies are people's work.)
--
--    SELECT is_nullable FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name = 'company_id';
--    SELECT count(*) FILTER (WHERE company_id IS NOT NULL) AS linked, count(*) AS contacts
--      FROM crm_leads;
--    SELECT count(*) AS companies FROM crm_companies;
--
-- 3. How much typed company text is waiting for a person to review — the raw
--    material of the suggestions page. Merged-away contacts are not part of the
--    book and are not offered.
--
--    SELECT count(*) FILTER (WHERE coalesce(btrim(l.company), '') <> '') AS with_company_text,
--           count(*) FILTER (WHERE coalesce(btrim(l.company), '') = '')  AS without_company_text
--      FROM crm_leads l
--     WHERE l.company_id IS NULL
--       AND NOT EXISTS (SELECT 1 FROM crm_contact_merges m WHERE m.merged_lead_id = l.id);
--
-- 4. The existing text column is untouched: same type, same nullability.
--    Expected: text, YES.
--
--    SELECT data_type, is_nullable FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name = 'company';
