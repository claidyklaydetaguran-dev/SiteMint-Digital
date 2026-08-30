-- MANUAL ROLLBACK ONLY. Not part of the automatic Drizzle migration journal
-- and never applied by `drizzle-kit migrate`. Do not wire this file into any
-- automated process.
--
-- Rolls back migration: lib/db/drizzle/voice/0006_dizzy_komodo.sql
-- (P8: subscription state, account security tokens, account states,
-- firm membership, and the audit log).
--
-- Run only by an operator, deliberately, and only after confirming the
-- target database. It does not remove this migration's row from
-- `drizzle.__drizzle_migrations_voice`; clear that row separately before
-- the forward migration can be applied again.
--
-- VERIFY BACKUPS FIRST.
--
-- SAFETY GUARD: refuse while any subscription is live (active/grace/
-- suspended — dropping the billing linkage of a paying or mid-dunning
-- firm loses the only record of what they are owed), and refuse while the
-- audit log holds rows (compliance evidence — export or archive it
-- deliberately first).
--
-- LOSS ON ROLLBACK: subscription/billing state, unconsumed account tokens
-- (outstanding reset/verification/invitation emails become dead links),
-- email-verification flags, the member roster, and the audit trail.

BEGIN;

DO $$
DECLARE
  live_subs integer;
  audit_rows integer;
BEGIN
  SELECT count(*) INTO live_subs FROM "voice_subscriptions" WHERE "state" IN ('active', 'grace', 'suspended');
  IF live_subs > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % live subscription(s) (active/grace/suspended). Cancel or migrate them deliberately first.', live_subs;
  END IF;
  SELECT count(*) INTO audit_rows FROM "voice_audit_log";
  IF audit_rows > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: voice_audit_log holds % row(s) of compliance evidence. Export/archive it deliberately first.', audit_rows;
  END IF;
END $$;

DROP TABLE IF EXISTS "voice_audit_log";
DROP TABLE IF EXISTS "voice_firm_members";
DROP TABLE IF EXISTS "voice_account_states";
DROP TABLE IF EXISTS "voice_account_tokens";
DROP TABLE IF EXISTS "voice_subscriptions";

COMMIT;
