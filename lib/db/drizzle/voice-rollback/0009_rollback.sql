-- Rollback for voice/0009_pale_triathlon.sql (per-assistant browser tokens).
-- Additive-only migration: dropping the three columns is the complete reversal.
-- Any tokens already minted at the provider are NOT deleted by this — revoke
-- them in the provider dashboard if the feature is being withdrawn, otherwise
-- they simply become unreferenced.
-- After running this, clear the 0009 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "browser_token_issued_at";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "browser_token_value";
ALTER TABLE "voice_assistants" DROP COLUMN IF EXISTS "browser_token_id";
