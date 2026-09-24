-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — calendar attendee invitations
--
-- Reviewed schema change for the integration owner. Hand-written rather than
-- produced by `drizzle-kit push` for the reason the rest of this directory
-- gives: push is a WHOLE-SCHEMA reconciler, so running it to add six columns
-- also applies every other in-flight barrel change, and it cannot be answered
-- non-interactively when it decides to prompt.
--
-- PROPERTIES
--   * Additive only. No existing column is altered, renamed, retyped or
--     dropped. No data is deleted. Existing rows get NULL (never invited) and
--     sequence 0 (the revision they are already at).
--   * Idempotent. Every statement is IF NOT EXISTS guarded, so a partial run
--     resumes and a completed run is a no-op.
--   * Touches only `crm_appointments` and `crm_appointment_attendees`. No
--     voice_*, intake_*, discovery_*, scheduling_*, helpdesk_* or stripe.*
--     object is referenced.
--   * The two CHECK constraints admit NULL, so they cannot fail against
--     historical rows.
--
-- WHY ical_sequence IS A COLUMN AND ical_uid IS NOT
--   RFC 5545 §3.8.7.4: an attendee's calendar replaces an event it already
--   holds only when the incoming message carries the SAME UID and a HIGHER
--   SEQUENCE. The sequence is state — it must survive a restart and must never
--   go backwards — so it is stored. The UID is derived from the row's primary
--   key (`sitemint-crm-appointment-<id>@sitemintdigital.com`), which makes it
--   stable for the life of the row by construction rather than by remembering
--   to write it down.
--
-- ROLLBACK is at the bottom, commented out.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. The revision number every scheduling message carries ────────────────

ALTER TABLE crm_appointments
  ADD COLUMN IF NOT EXISTS ical_sequence integer NOT NULL DEFAULT 0;

-- ── 2. What the mail seam actually said, per attendee ──────────────────────
--
-- These record DELIVERY, not acceptance. `response_status` above them stays
-- what staff recorded, because nothing ingests an RSVP reply and pretending
-- otherwise is the exact dishonesty this work exists to remove.
--
-- The vocabulary is `staffMail.ts`'s own, unchanged: not_configured, rejected,
-- failed, uncertain — plus `sent`. NULL means no invitation has ever been
-- attempted for this row, which is a different fact from one that was
-- attempted and refused.

ALTER TABLE crm_appointment_attendees
  ADD COLUMN IF NOT EXISTS invitation_outcome     text,
  ADD COLUMN IF NOT EXISTS invitation_reason      text,
  ADD COLUMN IF NOT EXISTS invitation_method      text,
  ADD COLUMN IF NOT EXISTS invitation_sequence    integer,
  ADD COLUMN IF NOT EXISTS invitation_at          timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_provider_id text;

-- ── 3. Constraints ─────────────────────────────────────────────────────────
--
-- Added separately and guarded, because ADD CONSTRAINT has no IF NOT EXISTS
-- in PostgreSQL before 16 and this must run on whatever the deployment has.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_crm_appointment_attendees_invitation_outcome'
  ) THEN
    ALTER TABLE crm_appointment_attendees
      ADD CONSTRAINT ck_crm_appointment_attendees_invitation_outcome
      CHECK (invitation_outcome IS NULL OR invitation_outcome IN
        ('sent', 'not_configured', 'rejected', 'failed', 'uncertain'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_crm_appointment_attendees_invitation_method'
  ) THEN
    ALTER TABLE crm_appointment_attendees
      ADD CONSTRAINT ck_crm_appointment_attendees_invitation_method
      CHECK (invitation_method IS NULL OR invitation_method IN ('REQUEST', 'CANCEL'));
  END IF;
END $$;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (uncomment to reverse; discards the record of what was sent)
--
-- BEGIN;
-- ALTER TABLE crm_appointment_attendees
--   DROP CONSTRAINT IF EXISTS ck_crm_appointment_attendees_invitation_outcome,
--   DROP CONSTRAINT IF EXISTS ck_crm_appointment_attendees_invitation_method;
-- ALTER TABLE crm_appointment_attendees
--   DROP COLUMN IF EXISTS invitation_outcome,
--   DROP COLUMN IF EXISTS invitation_reason,
--   DROP COLUMN IF EXISTS invitation_method,
--   DROP COLUMN IF EXISTS invitation_sequence,
--   DROP COLUMN IF EXISTS invitation_at,
--   DROP COLUMN IF EXISTS invitation_provider_id;
-- ALTER TABLE crm_appointments DROP COLUMN IF EXISTS ical_sequence;
-- COMMIT;
-- ───────────────────────────────────────────────────────────────────────────
