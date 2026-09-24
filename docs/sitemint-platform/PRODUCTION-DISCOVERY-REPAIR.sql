-- ════════════════════════════════════════════════════════════════════════
-- SiteMint P0 — production Discovery submission repair (2026-09-08)
--
-- ROOT CAUSE (proven from deployment logs): the deployed backend's insert
-- into "discovery_submissions" names 15 columns the PRODUCTION database
-- never received —
--   error: column "schema_version" of relation "discovery_submissions"
--          does not exist
-- The committed migration that adds them
-- (lib/db/drizzle/discovery/0000_discovery-domain-contract.sql) was never
-- applied to production (the known shared-journal skip). Every statement
-- below is copied from that reviewed migration: additive only, idempotent
-- (IF NOT EXISTS), no existing column/row is altered, nothing is dropped.
-- The single behavioural deviation: duplicate_resolved_at uses the
-- equivalent spelled type "timestamptz".
--
-- HOW TO APPLY (about 60 seconds):
--   Web Asset Builder app → Database → Production Database → My Data
--   → Enable Editing → SQL console → paste this whole file → Run.
--   Then flip Enable Editing back OFF.
--   (The Claude session prepared this but was permission-blocked from
--   executing DDL against the production database itself.)
--
-- AFTER APPLYING: tell Claude "migration applied" — it will re-run the
-- controlled synthetic test submission end-to-end and verify the 201 +
-- reference + records + acknowledgment/team emails.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS schema_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS form_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS idempotency_payload_hash text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS idempotency_payload_hash_key_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS idempotency_canonicalization_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_fingerprint text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS fingerprint_key_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_review_status text DEFAULT 'none' NOT NULL;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_of_submission_id integer;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_resolved_at timestamptz;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_resolved_by text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS duplicate_resolution_reason_code text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS privacy_policy_version text;
ALTER TABLE discovery_submissions ADD COLUMN IF NOT EXISTS is_automatically_scored boolean;
