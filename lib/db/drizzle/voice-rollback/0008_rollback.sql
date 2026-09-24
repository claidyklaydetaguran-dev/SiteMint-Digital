-- Rollback for voice/0008_common_thor.sql (voice_signup_jobs).
-- Additive-only migration: dropping the table is the complete reversal.
-- After running this, clear the 0008 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).
DROP TABLE IF EXISTS "voice_signup_jobs";
