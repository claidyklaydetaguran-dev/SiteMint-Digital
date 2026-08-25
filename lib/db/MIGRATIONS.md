# `@workspace/db` — migration mechanisms and runbook

> Referenced by `CLAUDE.md`, `docs/sitemint-platform/DISCOVERY_FORM_HARDENING_PRD.md`
> and `docs/sitemint-platform/DISCOVERY_DOMAIN_CONTRACT.md`. Authored under
> AR-001G (pre-staging security hardening).
>
> **This document does not authorize running anything.** No migration was
> executed while writing it, and none may be executed without separate,
> explicit owner authorization naming the environment.

## 1. Two mechanisms, deliberately separated

This package uses **two different** Drizzle Kit mechanisms against the same
database. They are not interchangeable, and the separation is a safety
boundary (ADR-05, `docs/ai-receptionist/DATABASE_STRATEGY.md`).

| Mechanism | Config | Schema barrel | Tables it can see |
|---|---|---|---|
| **Push** (diff-and-apply, no history) | `drizzle.config.ts` | `src/schema/index.ts` | `intake_*`, `crm_*`, `discovery_submissions`, `form_submissions` — the shared barrel only |
| **Versioned migrations** (numbered SQL + journal) | `drizzle.voice.config.ts`, `drizzle.scheduling.config.ts`, `drizzle.discovery.config.ts` | dedicated per-domain barrels | `voice_*`, `scheduling_*`, discovery domain-contract objects |

The domain tables are **not exported from the shared barrel**. That is what
makes it structurally impossible for `drizzle-kit push` to discover, create,
alter, or drop them — push literally cannot see them.

## 2. Exact commands

Run from the repository root. Every one of these reads `DATABASE_URL`.

| Command | Manages | Mode |
|---|---|---|
| `pnpm --filter @workspace/db run push` | CRM + intake + discovery base tables | Push — applies immediately, no history |
| `pnpm --filter @workspace/db run push-force` | same | Push, skipping prompts — **never** use outside a scratch database |
| `pnpm --filter @workspace/db run generate:voice` | `voice_*` | Generates SQL from a schema diff; no database connection |
| `pnpm --filter @workspace/db run migrate:voice` | `voice_*` | Applies pending versioned migrations |
| `pnpm --filter @workspace/db run generate:scheduling` | `scheduling_*` | Generates SQL; no database connection |
| `pnpm --filter @workspace/db run migrate:scheduling` | `scheduling_*` | Applies pending versioned migrations |
| `pnpm --filter @workspace/db run migrate:discovery` | discovery domain contract | Applies pending versioned migrations |

`generate:*` performs a filesystem diff against that config's own migration
history and does **not** open a database connection. `dbCredentials.url` is
still required for the config module to load, so a syntactically valid but
unreachable value is sufficient to generate.

### Discovery migration script

`migrate:discovery` was registered under AR-001G. It invokes the pre-existing
`drizzle.discovery.config.ts` and the pre-existing committed migration
`drizzle/discovery/0000_discovery-domain-contract.sql`; it adds no dependency,
no schema change, and no new migration, and it never runs during test, build,
or start. Before it existed, that committed migration had no documented way to
be applied at all.

`generate:discovery` is deliberately **not** registered. Generating a new
discovery migration is a schema-change activity and is out of scope here.

## 3. Required order for a fresh isolated staging database

The domain migrations are **not** self-sufficient. Every one of them adds a
foreign key to `intake_firms`, and the discovery migration additionally does
`ALTER TABLE "discovery_submissions"` — a table it does not create. Both of
those objects come from the shared barrel, i.e. from push. Running a domain
migration first fails on a missing relation.

1. `pnpm --filter @workspace/db run push` — creates `intake_*`, `crm_*`,
   `discovery_submissions`, `form_submissions`.
2. `pnpm --filter @workspace/db run migrate:voice` — `voice_assistants`,
   `provider_webhook_events`, `voice_issues`, each FK → `intake_firms(id)`.
3. `pnpm --filter @workspace/db run migrate:scheduling` — the five
   `scheduling_*` tables; FKs → `intake_firms(id)` and, internally,
   `scheduling_appointment_types(id)`.
4. `pnpm --filter @workspace/db run migrate:discovery` — additive columns on
   `discovery_submissions` plus `discovery_delivery_jobs` and
   `discovery_ai_briefs`.

Steps 2, 3 and 4 are independent of one another and may be run in any order
among themselves. **Step 1 must precede all three.**

### Scheduling order note

`scheduling_appointment_requests` references `scheduling_appointment_types`.
Both are created by the same single migration (`0000_superb_rhodey`), which
already orders its own statements, so there is nothing to sequence by hand —
but never split that file or apply its statements selectively.

### Stripe boot migrations

`artifacts/api-server/src/index.ts` calls `runMigrations({ databaseUrl })` from
the third-party `stripe-replit-sync` package at startup. These are that
package's own internal tables, they are **not** managed by this package, and
they are not part of the ordering above. They are unaffected by
`STRIPE_BOOT_SYNC_ENABLED`, which gates only the external webhook-registration
and backfill step — not this internal migration.

### Discovery migration status

`0000_discovery-domain-contract.sql` is **generated and reviewed only**. As of
this document it has never been applied to any database. It is additive:
new nullable/defaulted columns on `discovery_submissions`, plus two new
tables. No table is dropped or renamed, no existing column is altered or
removed, no data is modified or backfilled, and `form_submissions` is
untouched.

## 4. Before running anything: identify the database

**Never run a migration against an unidentified database.** `DATABASE_URL` is
a secret; do not print it, paste it, or echo it into a log, ticket, or
screenshot.

Prove the target is staging *without* revealing the URL:

```bash
psql "$DATABASE_URL" -Atc "SELECT current_database(), current_user, inet_server_addr();"
```

- [ ] The database name is the staging one you expect, character for character.
- [ ] It is **not** the production database name.
- [ ] Record who checked, and when.

Confirm it is not production by content as well as by name — a staging
database restored from a production dump is still production data:

```bash
psql "$DATABASE_URL" -Atc "SELECT count(*) FROM intake_firms;"
psql "$DATABASE_URL" -Atc "SELECT count(*) FROM intake_conversations;"
```

An isolated staging database has a small, explainable number of rows. If
either count looks like a real customer population, **stop**.

## 5. Baseline row counts (required before, and again after)

Capture these before migrating and re-check them after. A versioned migration
in this repository is additive, so **every one of these must be unchanged**.

```bash
psql "$DATABASE_URL" -Atc "SELECT 'intake_firms', count(*) FROM intake_firms
  UNION ALL SELECT 'intake_conversations', count(*) FROM intake_conversations
  UNION ALL SELECT 'discovery_submissions', count(*) FROM discovery_submissions
  UNION ALL SELECT 'form_submissions', count(*) FROM form_submissions;"
```

## 6. Dry-run and read-only checks

Drizzle Kit has **no** `--dry-run` flag for `migrate`. Do not invent one, and
do not assume a flag that does not exist made a command safe.

What is genuinely available:

- `generate:*` is inherently read-only against the database — it diffs the
  filesystem. Running it and finding **no new migration** proves the committed
  migrations already match the schema barrel.
- Read the SQL. Each migration is committed plain SQL; review it in full
  before applying it.
- Inspect the applied-migration journal directly. Verified against the
  installed `drizzle-orm` 0.45.2 PostgreSQL dialect: the journal is schema
  `drizzle`, table `__drizzle_migrations`, columns `id, hash, created_at`.
  None of the four configs overrides `migrationsSchema`/`migrationsTable`, so
  **all three domains record into this one shared journal**, distinguished by
  hash. Each domain still keeps its own `meta/_journal.json` beside its SQL,
  which is what `generate` diffs against.

```bash
psql "$DATABASE_URL" -Atc "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```

  `created_at` holds the migration folder's epoch-milliseconds value, not a
  wall-clock timestamp of when it was applied. Read it as an identifier.

- Verify object existence without writing:

```bash
psql "$DATABASE_URL" -Atc "SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN
  ('voice_assistants','provider_webhook_events','voice_issues',
   'discovery_delivery_jobs','discovery_ai_briefs');"
```

```bash
psql "$DATABASE_URL" -Atc "SELECT conname FROM pg_constraint
  WHERE conname LIKE '%firm_id_intake_firms_id_fk';"
```

None of the queries in this document contain a real firm id, customer
identifier, hostname, or credential, and none may be edited to add one.

## 7. Verification after applying

- [ ] `voice_assistants`, `provider_webhook_events`, `voice_issues` exist.
- [ ] Each has `firm_id NOT NULL`, a FK to `intake_firms(id)`, an index, and
      `created_at` / `updated_at`.
- [ ] `scheduling_*` tables exist with their firm foreign keys.
- [ ] `discovery_delivery_jobs` and `discovery_ai_briefs` exist.
- [ ] `intake_*` and `crm_*` schema is otherwise unchanged.
- [ ] Section 5 row counts are identical to the baseline.

## 8. Rollback boundaries

Committed rollback SQL exists for the voice and scheduling domains:

- `drizzle/voice-rollback/0000_military_komodo_rollback.sql`
- `drizzle/voice-rollback/0001_empty_sage_rollback.sql`
- `drizzle/scheduling-rollback/0000_superb_rhodey_rollback.sql`

There is **no** committed discovery rollback. Do not improvise one: the
discovery migration alters an existing, populated table, so a hand-written
reversal risks dropping columns that hold real data.

Hard boundaries:

- **Rollback SQL is never provider cleanup.** Dropping `voice_assistants`
  destroys the only record of the provider assistant id and orphans the remote
  Vapi resource permanently. Provider cleanup is
  `pnpm --filter @workspace/scripts run cleanup-staging-assistant`, documented
  in `docs/ai-receptionist/LAUNCH_CHECKLIST.md` §6a — and it must run *before*
  any rollback is even considered.
- Never run destructive rollback SQL during an incident. Leaving additive
  tables in place is the safe end state.
- Rollback is owner-authorized, per-environment, and never automatic.

## 9. Stop conditions

Stop and escalate, changing nothing further, if any of these hold:

- `DATABASE_URL` cannot be proven to be the intended staging database.
- Baseline row counts look like a real customer population.
- The migration journal contains entries this repository does not.
- `generate:*` reports a diff you did not expect — the deployed schema and the
  committed migrations disagree.
- A migration fails part-way. Do not re-run to "make sure"; inspect the
  journal first.
- Post-migration row counts differ from the baseline.
- You are about to run `push` or `push-force` against anything that is not a
  CRM/intake schema you own.

## 10. Absolute rules

- Never run any migration or push against production.
- Never run `push` with a domain config (`voice`, `scheduling`, `discovery`).
  Those tables are versioned-migration-only.
- Never copy production data into staging.
- Never seed customer data. Use synthetic records only.
- Never commit or print `DATABASE_URL`, credentials, or a database export.
- Never modify or renumber an already-applied migration; add a new one.
- No migration execution without separate owner authorization naming the
  environment.
