-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — contact de-duplication: merges and dismissals
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * two NEW tables, crm_contact_merges and crm_duplicate_dismissals;
--   * their indexes.
--
-- Nothing existing is altered, renamed, narrowed or dropped. No column is
-- added to crm_leads, and no row in any existing table is changed. Safe to
-- apply while the application is running: code that does not know about these
-- tables is unaffected, and code that does treats "no rows" as "no merges and
-- no dismissals", which is the correct starting state.
--
-- The shape is defined in lib/db/src/schema/crmContactDedupe.ts and this file
-- is the same thing said in SQL. CRM tables are otherwise maintained with
-- `drizzle-kit push`; this file exists so the change can be applied to an
-- environment without running a whole-schema reconcile against it.
--
-- ── Why a merge is recorded rather than performed destructively ─────────────
--
-- `leads.delete` is OWNER_ONLY (lib/staffPermissions.ts). If merging deleted
-- the losing contact, anybody holding `leads.write` would have a delete button
-- wearing a different label and the owner-only boundary would be decorative.
--
-- So a merge repoints every related row onto the surviving contact and then
-- RETAINS the merged-away lead row, recording the whole operation here. The
-- contact list hides a merged-away lead with a NOT EXISTS join against
-- crm_contact_merges; nothing is destroyed, and an owner who disagrees with a
-- merge can see exactly what it did and to which records.
--
-- `merged_lead_id` is UNIQUE. That is not decoration either: it is what makes
-- the contact-list exclusion a plain NOT EXISTS rather than a ranked lookup,
-- and what makes "this contact has already been merged away" a single-row
-- question with one answer.
--
-- ── What the snapshots are for ─────────────────────────────────────────────
--
-- `primary_snapshot` and `merged_snapshot` are the two lead rows exactly as
-- they stood immediately before the merge. `conflicts` names every field where
-- the two disagreed and which value won. Together they mean a merge can be
-- read back field by field long after the fact — the losing value is preserved
-- verbatim rather than only summarised in the surviving contact's notes.
--
-- ── Dismissals ─────────────────────────────────────────────────────────────
--
-- A dismissal is "these two are not the same person", and it has to be durable
-- or review re-offers a pair somebody has already judged, forever. The pair is
-- stored canonically — `lead_id_low` is always the smaller id — so (7, 12) and
-- (12, 7) are one row under one unique key, and a dismissal cannot be defeated
-- by presenting the pair the other way round.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--
--   DROP TABLE IF EXISTS crm_duplicate_dismissals;
--   DROP TABLE IF EXISTS crm_contact_merges;
--
-- Dropping crm_contact_merges makes every merged-away contact reappear in the
-- contact list, because the exclusion join has nothing left to exclude on. The
-- repointed related rows STAY on the surviving contact — they were moved, not
-- copied — so the merged contact comes back with its history now belonging to
-- the other one. Roll back only if no merge has been performed.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS crm_contact_merges (
  id                 serial PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  primary_lead_id    integer NOT NULL,
  merged_lead_id     integer NOT NULL,
  signal             text NOT NULL,
  primary_snapshot   jsonb NOT NULL,
  merged_snapshot    jsonb NOT NULL,
  fields_filled      jsonb NOT NULL,
  conflicts          jsonb NOT NULL,
  moved              jsonb NOT NULL,
  merged_by_staff_id integer,
  merged_by_label    text NOT NULL
);

COMMENT ON TABLE crm_contact_merges IS
  'One row per contact merge. The merged-away lead row is RETAINED; this row is what hides it from the contact list and what records exactly which related rows moved.';
COMMENT ON COLUMN crm_contact_merges.moved IS
  'Per-table result of the merge: rows repointed, rows that could not move because the survivor already held an equivalent row under a unique key, and why.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contact_merges_merged
  ON crm_contact_merges (merged_lead_id);
CREATE INDEX IF NOT EXISTS ix_crm_contact_merges_primary
  ON crm_contact_merges (primary_lead_id, id);

CREATE TABLE IF NOT EXISTS crm_duplicate_dismissals (
  id                    serial PRIMARY KEY,
  created_at            timestamptz NOT NULL DEFAULT now(),
  lead_id_low           integer NOT NULL,
  lead_id_high          integer NOT NULL,
  signal                text NOT NULL,
  reason                text,
  dismissed_by_staff_id integer,
  dismissed_by_label    text NOT NULL
);

COMMENT ON TABLE crm_duplicate_dismissals IS
  'A judged pair: "these two are not the same person". lead_id_low is always the smaller id, so the pair has one canonical form and one unique key.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_duplicate_dismissals_pair
  ON crm_duplicate_dismissals (lead_id_low, lead_id_high);
CREATE INDEX IF NOT EXISTS ix_crm_duplicate_dismissals_low
  ON crm_duplicate_dismissals (lead_id_low);
CREATE INDEX IF NOT EXISTS ix_crm_duplicate_dismissals_high
  ON crm_duplicate_dismissals (lead_id_high);

COMMIT;
