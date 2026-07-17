# AI Receptionist — Database Strategy

## Tables

| Table | Purpose |
|---|---|
| `intake_firms` | One row per customer firm. Owns the Twilio number, plan tier, Stripe customer/subscription IDs, agent config fields (greeting, business description, qualifying questions). |
| `intake_conversations` | One row per inbound caller session, keyed by `(firm_id, caller_phone)`. No deduplication by date — one conversation per caller-firm pair total. |
| `intake_messages` | All SMS messages for every conversation, with `direction` (`inbound` / `outbound`). |
| `intake_cases` | Structured data extracted by the LLM per conversation. Scored on `conversationComplete`. One row per conversation. |
| `receptionist_sessions` | Cookie-backed auth sessions for the helpdesk dashboard. `expires_at` is enforced on read; expired rows are purged opportunistically on signup. |

## Key Invariants

- One conversation per `(firmId, callerPhone)` pair. There is no per-date deduplication.
- **Trial cap**: `intake_firms.trial_conversations_limit` (default 20) controls when AI replies are suppressed for new conversations. The cap is enforced in the SMS webhook, not in the dashboard query.
- **Plan tiers**: `trial` | `paid`. Promoted to `paid` by the Stripe webhook on `checkout.session.completed`; reverted to `trial` on `customer.subscription.deleted`.
- `isOverCap` is a computed view derived at read time in `GET /api/receptionist/conversations` — it is not stored in the DB. See DECISION_LOG.md.

## Structural Gaps (no FK constraints or indexes today)

The `intake_*` tables currently have **no foreign-key constraints** (beyond `receptionist_sessions.firm_id → intake_firms.id`) and **no secondary indexes**. Queries are full-table scans. This is acceptable at current data volumes but will degrade as conversation counts grow. Adding indexes on `(firm_id, caller_phone)` for `intake_conversations` and `(conversation_id)` for `intake_messages` and `intake_cases` is deferred until Phase 1A or later.

## Dead Schema (do not push)

`lib/db/src/schema/conversations.ts` and `lib/db/src/schema/messages.ts` define `conversations` and
`messages` tables respectively. **Neither table exists in the database.** These files are dead schema
code, likely from an earlier design iteration. Do not run `drizzle-kit push` on them. They should not
be imported or referenced. Removal is deferred to the migration-transition ADR below.

---

## Migration Transition (ADR-05 — PROPOSED)

### Current state
Drizzle ORM is used in **push mode** (`drizzle-kit push`): schema changes are applied directly to the
database from the TypeScript schema files with no migration files generated or tracked.

### Target state
All **new** receptionist schema changes (Phase 1A onwards) will use **versioned Drizzle Kit
migrations** with the following process:

1. **Baseline introspection**: run `drizzle-kit introspect` on the current dev database to produce a
   baseline migration representing the existing schema before the new migration workflow begins.
2. **New changes**: each schema change generates a new numbered migration file committed to the repo.
3. **Production sync**: migrations are applied explicitly via `drizzle-kit migrate` (not push). Automatic
   production schema sync is **forbidden**.
4. **Scope**: CRM tables (`crm_*`) continue using push until a separate ADR approves their migration.

### Status
**PROPOSED — not yet approved or implemented.** The schema is **frozen** until this ADR is approved.
No new `intake_*` table or column changes may be pushed in the interim.

### Rationale
Push mode provides no rollback path and no audit trail of what changed and when. As the AI Receptionist
moves toward paying customers, accidental schema changes in production become a data-loss risk.
