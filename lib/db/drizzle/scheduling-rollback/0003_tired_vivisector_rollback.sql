-- Rollback for drizzle/scheduling/0003_tired_vivisector.sql
--
-- 0003 is additive only: one nullable column and one partial unique index over
-- it. Reversing it drops the idempotency key that lets a retried voice tool
-- call be recognised as the same booking request.
--
-- DATA LOSS: the recorded tool-call ids. No appointment row is removed and no
-- other column is touched — the requests themselves survive intact. After this
-- runs, a retried tool call would once again create a second request (or, more
-- likely, be refused because the caller's own first request occupies the slot).
--
-- Back the database up first (pnpm --filter @workspace/db run backup --
--   --target <name> --expect-db <db> --expect-fingerprint <hex12> ...).
--
-- Run inside a transaction so a partial rollback cannot happen:
--
--   BEGIN;
--   \i 0003_tired_vivisector_rollback.sql
--   -- verify, then:
--   COMMIT;
--
-- Afterwards remove the 0003 row from the scheduling journal, or the next
-- migrate:scheduling believes it is still applied and refuses to replay it:
--
--   DELETE FROM drizzle.__drizzle_migrations_scheduling WHERE created_at = 1789203213657;

DROP INDEX IF EXISTS "uq_scheduling_appointment_requests_firm_tool_call";

ALTER TABLE "scheduling_appointment_requests" DROP COLUMN IF EXISTS "tool_call_id";
