---
name: AI Receptionist SaaS foundation
description: Key patterns and gotchas from building the AI Receptionist multi-tenant auth, trial cap, and admin oversight.
---

## DB session persistence
Sessions live in `receptionist_sessions` table (token PK, firm_id FK, email, created_at, expires_at).
Lib at `artifacts/api-server/src/lib/receptionistAuth.ts` — all functions are async.
Cookie name: `receptionist_session`, 30-day TTL, HTTP-only.
Separate from CRM admin auth (Bearer token in localStorage — no cookies, zero collision).

**Why:** In-memory Map loses sessions on every server restart/redeploy — unacceptable for a product.

## Unique constraint gotcha
Drizzle creates a UNIQUE CONSTRAINT (not a raw index) when you use `.unique()` on a column.
To replace it: `ALTER TABLE foo DROP CONSTRAINT constraint_name` — NOT `DROP INDEX`.
`DROP INDEX` fails with "cannot drop index because constraint requires it".
Then: `CREATE UNIQUE INDEX ON foo(col) WHERE col IS NOT NULL` for a nullable partial unique index.

**Why:** Multiple NULLs must be allowed (seeded test firms have null email).

## Trial cap design
Cap is computed dynamically at read time from creation-order rank vs. `trialConversationsLimit`.
No static `isOverCap` flag stored — if plan upgrades, old conversations stop showing capped automatically.
In the SMS webhook: cap only applies to NEW conversations (tracked with `isNewConversation` flag).
Existing in-progress conversations always proceed through the full AI loop regardless of cap.
Logic: count all firm conversations AFTER creating the new row; if count > limit, skip AI + SMS reply.
Inbound message is always logged (never silently drop a lead).

**How to apply:** Any future cap-enforcement point (e.g. email intake) should follow the same pattern.

## Admin oversight endpoint
`GET /api/admin/receptionist-accounts` — in `routes/receptionistAdmin.ts`, uses same requireAdmin (Bearer) as crm.ts.
Filters by `isNotNull(intakeFirms.email)` to exclude old admin-configured test firms.
Uses a SQL subquery for conversation count (no JOIN needed since drizzle handles it inline).
Nav entry: Operations → "Receptionist Accounts" at `/admin/crm/receptionist-accounts`.
Old "AI Intake Cases" renamed to "AI Intake Scoring" to distinguish the two Operations entries.
