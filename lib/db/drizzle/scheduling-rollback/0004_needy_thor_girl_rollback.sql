-- Rollback for drizzle/scheduling/0004_needy_thor_girl.sql
--
-- 0004 is additive only: one nullable column naming the call a request was
-- made on, and one non-unique index over it. Reversing it removes the only
-- key that joins an appointment request back to the conversation that
-- produced it.
--
-- DATA LOSS: the recorded call ids. No appointment row is removed and no other
-- column is touched — every request, its time, its caller and its status
-- survive intact. What is lost is the link: the post-call email returns to
-- reporting "nothing outstanding" for a call that requested a time, and the
-- call record stops listing the appointment, because nothing connects them.
--
-- Back the database up first (pnpm --filter @workspace/db run backup --
--   --target <name> --expect-db <db> --expect-fingerprint <hex12> ...).
--
-- Run inside a transaction so a partial rollback cannot happen:
--
--   BEGIN;
--   \i 0004_needy_thor_girl_rollback.sql
--   -- verify, then:
--   COMMIT;
--
-- Afterwards remove the 0004 row from the scheduling journal, or the next
-- migrate:scheduling believes it is still applied and refuses to replay it:
--
--   DELETE FROM drizzle.__drizzle_migrations_scheduling WHERE created_at = 1789696437713;

DROP INDEX IF EXISTS "ix_scheduling_appointment_requests_firm_provider_call";

ALTER TABLE "scheduling_appointment_requests" DROP COLUMN IF EXISTS "provider_call_id";
