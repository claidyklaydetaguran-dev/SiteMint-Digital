-- Rollback for voice/0011_fat_firebrand.sql
-- (primary contact and default location for a business profile).
--
-- Additive-only migration, so the reversal is dropping the one new table. That
-- destroys every business's saved primary contact and default location — take
-- a backup first if the data matters, because nothing else holds it. The
-- business name, industry and timezone live elsewhere and are unaffected.
--
-- Dropping the table also drops its unique index, CHECK constraints and the
-- foreign key to intake_firms.
--
-- After running this, clear the 0011 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

DROP TABLE IF EXISTS "voice_business_profiles";
