-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M3 sales chain
--
-- Reviewed schema change for the integration owner. Order-independent of the
-- other two M3 files; it touches only crm_deals.
--
-- Additive only: nine nullable columns, no defaults, no backfill. Existing
-- deals keep exactly the values they have, and a deal that was won before this
-- release simply has no won_at — which is accurate, because nobody recorded
-- one. It is not invented from updated_at.
--
-- converted_project_id is the idempotency key for turning a won deal into a
-- project: a second conversion attempt finds the existing project and returns
-- it rather than creating duplicate work with duplicate tasks.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS owner_staff_id       integer;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS probability          integer;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS won_at               timestamp with time zone;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS lost_at              timestamp with time zone;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS closed_by_staff_id   integer;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS lost_reason          text;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS lost_reason_detail   text;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS converted_project_id integer;
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS converted_at         timestamp with time zone;
COMMIT;

-- ROLLBACK
--   BEGIN;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS converted_at;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS converted_project_id;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS lost_reason_detail;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS lost_reason;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS closed_by_staff_id;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS lost_at;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS won_at;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS probability;
--   ALTER TABLE crm_deals DROP COLUMN IF EXISTS owner_staff_id;
--   COMMIT;
--
-- Rolling back loses the deal-to-project links, so a later re-conversion would
-- create a SECOND project for work that already exists. Export
-- (id, converted_project_id) before rolling back in anger.
