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

| Mechanism | Config | Schema barrel | Tables it manages |
|---|---|---|---|
| **Push** (diff-and-apply, no history) | `drizzle.config.ts` | `src/schema/index.ts` | `intake_*`, `crm_*`, `discovery_submissions`, `form_submissions` — the shared barrel only |
| **Versioned migrations** (numbered SQL + journal) | `drizzle.voice.config.ts`, `drizzle.scheduling.config.ts`, `drizzle.discovery.config.ts` | dedicated per-domain barrels | `voice_*`, `scheduling_*`, discovery domain-contract objects |

The domain tables are **not exported from the shared barrel**. That stops push
creating or altering them. It does **not** stop push dropping them.

### The push boundary is `tablesFilter`, not the barrel

An earlier version of this section said the barrel made it "structurally
impossible" for push to touch the domain tables, and that push "literally
cannot see them". That was wrong, and wrong in the one direction that destroys
schema.

`drizzle-kit push` is a whole-schema reconciler. It introspects every table in
the managed schema and diffs it against the barrel; anything present in the
database that the barrel does not export is a **deletion candidate**. Absence
from the barrel is therefore not protection — it is the trigger. Measured on an
isolated staging database under AR-001O: a second
`pnpm --filter @workspace/db run migrate:fresh` dropped all ten
domain-migration-owned tables (public base tables 37 → 27) while printing only
its success line and exiting 0. The shared journal was untouched, so every
domain migration still reported as applied and re-running them recreated
nothing.

The real boundary is `tablesFilter` in `drizzle.config.ts`:

| Pattern | Protects |
|---|---|
| `!voice_*` | `voice_assistants`, `voice_issues`, and any future `voice_*` table |
| `!provider_webhook_events` | `provider_webhook_events` |
| `!discovery_ai_briefs` | `discovery_ai_briefs` |
| `!discovery_delivery_jobs` | `discovery_delivery_jobs` |
| `!scheduling_*` | all five `scheduling_*` tables, and any future one |

Each entry is a minimatch glob matched against the bare table name; a leading
`!` negates it. drizzle-kit applies the filter while **introspecting the
database**, so an excluded table never enters the "current database" snapshot at
all: push cannot create, alter, rename or drop it, and it can never become a
deletion candidate, because there is nothing on either side of the diff to
compare.

`discovery_*` is deliberately **not** a wildcard. `discovery_submissions` is
barrel-owned and must stay managed by push — the discovery migration only adds
columns to it — so the two discovery domain tables are excluded by exact name.

`schemaFilter` is pinned to `["public"]` in the same config. That is what keeps
the Stripe connector's `stripe` schema outside the managed set. Never set it to
`[]`: an empty list removes the WHERE clause from drizzle's introspection
queries and pulls in every schema in the database.

`migrationOrderContract.test.ts` section 11 fails if a required exclusion is
removed or weakened, if `discovery_submissions` is ever excluded, or if a
barrel-owned family stops being managed.

### `migrate:fresh` runs push only to bootstrap an empty database

`drizzle-kit push` is **bootstrap-only**. The canonical runner
(`src/migrate-fresh.mjs`) classifies the connected database *before* it changes
anything, and executes step 1 only when that database is genuinely empty:

| Classified state | Condition | What runs |
|---|---|---|
| **fresh** | the shared journal is absent or holds no rows, **and** no table stands in `public` | push, then voice, discovery, scheduling |
| **initialized** | the shared journal holds committed rows **and** all 27 barrel-owned base tables exist | voice, discovery, scheduling only — push is skipped |
| **unsafe** | anything else | nothing at all — the runner exits nonzero before any mutation |

On an initialized database the runner prints, before the ordered migrations:

```
Base schema already initialized; skipping drizzle-kit push
```

Classification reads the PostgreSQL catalog directly through the
already-installed `pg` dependency — `to_regclass` on the shared journal,
`count(*)` of its rows, and the `public` base-table list from `pg_class`. It
never parses drizzle-kit's human-formatted output and never infers state from an
exit code. It fails closed, changing nothing, when the journal is empty but
tables already stand, when the journal is populated but a barrel-owned sentinel
is missing, when the catalog cannot be read, or on any other state it cannot
classify confidently. It does **not** try to repair an ambiguous database.

A bootstrap is also verified rather than trusted: after push reports success the
runner re-reads the catalog, and refuses to run a single domain migration if the
barrel-owned tables are still missing. An exit code is not proof.

**`migrate:fresh` is not a general schema-drift repair command.** An existing
database must evolve through committed migrations — ordered, reviewable and
journalled. If the shared barrel gains a table, run `push` deliberately and on
purpose; `migrate:fresh` reports the database as drifted and stops, rather than
reconciling it silently.

`tablesFilter` above is unchanged and remains a **defense-in-depth** boundary for
the one run where push still executes — the bootstrap. It is no longer the only
thing standing between a rerun and the ten domain tables, because a rerun no
longer runs push at all.

### The `DROP SEQUENCE` errors are gone, and must stay gone

An earlier version of this section called them expected output. They were not.

drizzle-kit drops a serial column's owned sequence from the introspected snapshot
inside the same per-table loop that `tablesFilter` short-circuits. An excluded
table's `<table>_id_seq` therefore stayed in the snapshot with nothing in the
barrel to match it, and push appended a `DROP SEQUENCE` for each one. PostgreSQL
refused every one of them with `2BP01`:

```
ERROR:  cannot drop sequence voice_assistants_id_seq because other objects depend on it
DETAIL:  default value for column id of table voice_assistants depends on sequence voice_assistants_id_seq
```

Eight destructive statements that failed only because something else happened to
depend on their target, reported through an exit code that could not see them —
push swallows the error and still exits 0 — is not acceptable steady-state
output. Since correction 5 an initialized `migrate:fresh` starts no push child
process at all, so **no `DROP SEQUENCE` line may appear on an initialized
rerun.** If one does, the runner classified the database wrongly: stop, and treat
it as a stop condition (section 9).

A `DROP TABLE` was never acceptable and still is not.

## 2. Exact commands

Run from the repository root. Every one of these reads `DATABASE_URL`.

| Command | Manages | Mode |
|---|---|---|
| `pnpm --filter @workspace/db run migrate:fresh` | **all of the below, in the required order** | Canonical initialisation. Classifies the database first; push runs only to bootstrap an empty one. Stops at the first failure |
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
3. `pnpm --filter @workspace/db run migrate:discovery` — additive columns on
   `discovery_submissions` plus `discovery_delivery_jobs` and
   `discovery_ai_briefs`.
4. `pnpm --filter @workspace/db run migrate:scheduling` — the five
   `scheduling_*` tables; FKs → `intake_firms(id)` and, internally,
   `scheduling_appointment_types(id)`.

**Run them in exactly this order.** Step 1 must precede the other three, and
steps 2–4 are **chronological, not interchangeable**. An earlier version of
this document said they could be run in any order among themselves; that was
wrong, and following it silently loses the discovery migration.

All four domains record into the *same* journal table,
`drizzle.__drizzle_migrations` (§6), and drizzle-kit decides what is pending by
comparing each journal entry's `when` against the newest `created_at` already
recorded — a global watermark, not a per-domain set difference. Applying a
domain whose migration is newer therefore makes every older domain look
already-applied. The committed `when` values are:

| `when` | domain | tag |
|---|---|---|
| 1784372011129 | voice | `0000_military_komodo` |
| 1784444570582 | voice | `0001_empty_sage` |
| 1784601043137 | discovery | `0000_discovery-domain-contract` |
| 1785251267367 | scheduling | `0000_superb_rhodey` |

Running scheduling before discovery pushes the watermark past discovery's
timestamp. `migrate:discovery` then prints `[✓] migrations applied
successfully!` and applies nothing, leaving `discovery_delivery_jobs` and
`discovery_ai_briefs` uncreated; re-running it does not help. This was
confirmed on a fresh database during AR-001O.

Prefer the single canonical command. On an empty database it applies all four
steps in this order; on an already-initialised one it skips step 1 entirely and
applies only steps 2-4, which the journal watermark then resolves as no-ops.
Either way it stops at the first failure:

```bash
pnpm --filter @workspace/db run migrate:fresh
```

`lib/db/migrationOrderContract.test.ts` pins the order, the shared-journal
identity, and the chronology of the committed journals.
`lib/db/migrateFreshStateContract.test.ts` pins the state model: that an empty
database bootstraps with exactly one push, that an initialised one skips push,
that every ambiguous state fails closed before mutating anything, and that no
connection component can reach a log line.

### Why the discovery migration is idempotent

Ordering alone is not enough. `discovery_submissions` is reachable from the
shared barrel (`src/schema/index.ts` re-exports `./submissions`), so step 1
already creates the table **and** all 15 of the Phase-2C.2B columns, both of
its constraints and all four of its indexes. Step 3 then tried to add them a
second time and aborted on its very first statement, so the fresh-database
sequence could not succeed in any order: after push the columns already
existed, before push the table did not.

Every statement in `0000_discovery-domain-contract.sql` is therefore
idempotent — `ADD COLUMN IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT
EXISTS`, `CREATE TABLE IF NOT EXISTS`, and a `DO $$ … EXCEPTION WHEN
duplicate_object THEN null; END $$;` guard for the two constraint forms
Postgres offers no `IF NOT EXISTS` for. No column, type, default,
nullability, constraint body, index definition, statement order, or the
journal timestamp changed.

Editing a migration that a database has already recorded is safe **for this
migrator only**, and the contract test pins the reason: drizzle-kit 0.31.10
delegates to drizzle-orm 0.45.2 `PgDialect.migrate`, which decides pending
work solely from `created_at` vs the journal `when`, and which stores each
migration's sha256 but never reads it back to compare. There is no checksum
validation to fail and no path that re-runs an already-recorded migration.
Do not assume this of a future drizzle version — section 6 of the contract
test fails first if it changes.

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

`0000_discovery-domain-contract.sql` has **never been applied to production**,
and no approved plan applies it there. Under AR-001O it is applied to the
isolated `SiteMint-Voice-Staging` development database only, as part of
`migrate:fresh` on an empty database. It is additive: new
nullable/defaulted columns on `discovery_submissions`, plus two new tables.
No table is dropped or renamed, no existing column is altered or removed, no
data is modified or backfilled, and `form_submissions` is untouched.

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
- A `DROP SEQUENCE` or `2BP01` line appears during a `migrate:fresh` rerun on an
  initialised database. That run should start no push child process at all, so
  the runner classified the database wrongly.
- `migrate:fresh` reports the database as `unsafe`. Do not re-run it and do not
  try to make the state fit; inspect the database and decide deliberately.

## 10. Absolute rules

- Never run any migration or push against production.
- Never run `push` with a domain config (`voice`, `scheduling`, `discovery`).
  Those tables are versioned-migration-only.
- Never copy production data into staging.
- Never seed customer data. Use synthetic records only.
- Never commit or print `DATABASE_URL`, credentials, or a database export.
- Never modify or renumber an already-applied migration; add a new one.
- Never use `migrate:fresh` to reconcile an existing database. It bootstraps an
  empty one and otherwise only applies committed migrations.
- No migration execution without separate owner authorization naming the
  environment.

## 11. `baseline:journals` — preparing for per-domain journals

AR-001Z Commit A. This command does not change how migrations run today. It
prepares a database that already applied migrations under the single shared
journal for the per-domain journals introduced in Commit B.

Without it, the first `migrate:*` after the switch would see an empty
per-domain journal, conclude nothing had been applied, and replay every
migration. No committed voice SQL uses `IF NOT EXISTS`, so that replay aborts
on the first `CREATE TABLE` — loud, but still a failed run.

```bash
pnpm --filter @workspace/db run baseline:journals
```

What it does, all inside ONE transaction holding a transaction-scoped advisory
lock (so it can never interleave with a guarded `migrate:*`):

1. Derives the expected `(hash, created_at)` pairs from the committed migration
   folders — `hash` is sha256 of the raw `.sql` text, exactly what drizzle
   computes in `readMigrationFiles`. Row counts are never used as evidence.
2. Verifies `drizzle.__drizzle_migrations` holds precisely that set. Missing,
   duplicated, unknown, or hash-mismatched rows are refused.
3. Creates `drizzle.__drizzle_migrations_{voice,discovery,scheduling}` with
   drizzle's own DDL (`id SERIAL PRIMARY KEY, hash text NOT NULL, created_at
   bigint`).
4. Inserts only `hash` and `created_at`, letting each table's SERIAL default
   issue the id, so the sequence stays correct for the next real migration.
   Legacy ids are deliberately not copied.
5. Re-reads each destination and requires exact `(hash, created_at)` equality.

It is idempotent only when every destination already matches exactly. A
partial or mismatched destination rolls the whole transaction back and fails.

**It never modifies or drops `drizzle.__drizzle_migrations`.** That table stays
as the recovery point: reverting Commit B restores the previous behaviour with
no replay in either direction.

### Proving it without touching staging

```bash
TEST_DATABASE_URL=postgresql://…/scratch pnpm --filter @workspace/scripts run test:journals
```

The suite refuses to start unless `TEST_DATABASE_URL` is set and differs from
`DATABASE_URL`, and it creates and drops a database per case.

## 12. Per-domain journals (AR-001Z Commit B)

Each domain now records into its own table in the `drizzle` schema:

| domain | journal table |
| --- | --- |
| voice | `__drizzle_migrations_voice` |
| discovery | `__drizzle_migrations_discovery` |
| scheduling | `__drizzle_migrations_scheduling` |

drizzle computes each domain's watermark from that domain's rows alone, so the
cross-domain ordering rule is gone. §3 no longer applies: domain migrations may
be applied in any order after `push`, and a new migration in any domain needs no
coordination with the others.

`push` is unchanged and still records nothing.

### The guard

All three `migrate:*` scripts now run through `src/migrate-guard.mjs`, which
classifies the journals before handing over to drizzle-kit, holding a
session-scoped advisory lock across the child so a baseline cannot interleave:

| state | behaviour |
| --- | --- |
| truly empty database | migrate normally |
| legacy journal populated, per-domain journals absent | **refuse**, name `baseline:journals` |
| correctly baselined | migrate normally (a no-op when nothing is pending) |
| partial, gapped, or hash-mismatched journals | **refuse**, change nothing |

`migrate:fresh` refuses the same un-baselined state, for the same reason.

### Rollback

Revert this commit. The legacy `drizzle.__drizzle_migrations` was never modified,
so the domains fall straight back to the shared watermark with no replay in
either direction; the per-domain tables can then be dropped at leisure.
