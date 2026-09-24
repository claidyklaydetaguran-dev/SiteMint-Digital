-- Rollback for voice/0013_support_requests.sql
-- (support requests a business sends, and their threads).
--
-- Additive-only migration, so the reversal is dropping the two new tables.
-- That destroys every support request and every message in every thread —
-- including anything a business is still waiting on an answer for. Export them
-- first if they matter; nothing else holds them:
--
--   SELECT r.id, r.firm_id, r.subject, r.category, r.status, r.created_at,
--          m.author, m.body, m.created_at
--     FROM voice_support_requests r
--     JOIN voice_support_messages m ON m.request_id = r.id
--    ORDER BY r.id, m.created_at;
--
-- Messages are dropped before requests so a partially applied migration
-- reverses in the same order it was built. Dropping the tables also drops
-- their indexes, CHECK constraints and foreign keys.
--
-- Run the application version that predates 0013 afterwards: the Support page
-- and its routes read these tables.
--
-- After running this, clear the 0013 journal row per
-- docs/backend-program/runbooks (ROLLBACK — journal-row clearing).

DROP TABLE IF EXISTS "voice_support_messages";
DROP TABLE IF EXISTS "voice_support_requests";
