-- Rollback for voice/0014_member_accounts_policy_contacts.sql
-- (team member passwords and invitation binding, policy acceptance records,
-- and contact origin/email/notes).
--
-- Additive-only migration, so the reversal drops what it added. That destroys:
--   * every team member's password, so no member can sign in afterwards
--     (the business's own account is unaffected);
--   * every outstanding invitation binding, so open invitations stop working;
--   * the record of which Terms and Privacy versions each business accepted;
--   * the origin, email and notes of every contact.
-- Export what matters first:
--
--   SELECT firm_id, policy, version, accepted_by, accepted_at
--     FROM voice_policy_acceptances ORDER BY firm_id, accepted_at;
--   SELECT id, firm_id, phone_e164, origin, email, notes
--     FROM voice_contacts WHERE origin <> 'call' OR email IS NOT NULL OR notes IS NOT NULL;
--
-- Constraints and the index go before their columns so a partially applied
-- migration reverses cleanly. Every statement is IF EXISTS.
--
-- Also end member sessions, which the pre-0014 application would otherwise
-- treat as sessions of an unknown address:
--
--   DELETE FROM receptionist_sessions s USING intake_firms f
--    WHERE s.firm_id = f.id AND lower(s.email) <> lower(f.email);
--
-- Run the application version that predates 0014 afterwards.
--
-- After running this, clear the 0014 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

ALTER TABLE "voice_firm_members" DROP CONSTRAINT IF EXISTS "ck_voice_firm_members_invite_hash_shape";
ALTER TABLE "voice_contacts" DROP CONSTRAINT IF EXISTS "ck_voice_contacts_notes_length";
ALTER TABLE "voice_contacts" DROP CONSTRAINT IF EXISTS "ck_voice_contacts_email_length";
ALTER TABLE "voice_contacts" DROP CONSTRAINT IF EXISTS "ck_voice_contacts_origin";
DROP INDEX IF EXISTS "ix_voice_firm_members_email_status";
ALTER TABLE "voice_firm_members" DROP COLUMN IF EXISTS "invite_token_hash";
ALTER TABLE "voice_firm_members" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "voice_contacts" DROP COLUMN IF EXISTS "notes";
ALTER TABLE "voice_contacts" DROP COLUMN IF EXISTS "email";
ALTER TABLE "voice_contacts" DROP COLUMN IF EXISTS "origin";
DROP TABLE IF EXISTS "voice_policy_acceptances";
