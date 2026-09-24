# V5 Backend Contract & Security — migration packet

> Owner: Backend Contract & Security reviewer (V5 program, see V5-BLUEPRINT.md
> §15). Written in the `wp/backend` worktree. **Nothing in this packet
> authorizes running anything.** No migration has been generated or applied by
> this work. `pnpm --filter @workspace/db run generate:voice`, any `push`, and
> any `migrate:*` command all require separate, explicit owner authorization
> naming the target environment (CLAUDE.md, `lib/db/MIGRATIONS.md`).
>
> This packet exists because this PR ships **schema files only** — three new
> versioned-migration tables (`voice_*`) and two new push-mode tables
> (`crm_*`) — and could not run `drizzle-kit generate` or `push` itself
> (Windows cannot run `drizzle-kit` in this worktree; the lead runs it on
> Linux, per the standing instruction for this workstream).

## 1. Versioned-migration tables (voice domain, migration `0007`)

Schema files: `lib/db/src/schema/voice/voiceOnboarding.ts`,
`voiceBetaRequests.ts`, `voiceInvites.ts`, exported from
`lib/db/src/schema/voice/index.ts`. Domain barrel:
`lib/db/drizzle.voice.config.ts` → `./src/schema/voice/index.ts`, journal
table `drizzle.__drizzle_migrations_voice`.

### `voice_onboarding_states`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `firm_id` | integer NOT NULL, FK → `intake_firms.id` ON DELETE CASCADE | UNIQUE — one row per firm |
| `current_step` | text, nullable | next step the hub should open; CHECK `~ '^[a-z_]{1,40}$'` when present |
| `steps` | jsonb NOT NULL DEFAULT `'{}'` | keyed by step key → `{status, updatedAt}`; CHECK `jsonb_typeof(steps) = 'object'` |
| `completed_at` | timestamptz, nullable | |
| `created_at`, `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Constraints/indexes: `uq_voice_onboarding_states_firm` (UNIQUE on `firm_id`,
doubles as the required firm index), `ck_voice_onboarding_states_steps_object`,
`ck_voice_onboarding_states_current_step`.

Purpose: persistent onboarding-hub progress (V5 PR-5, workbook A-4/PR-5). One
row per firm, created lazily by the first `GET /api/receptionist/onboarding`.

### `voice_beta_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name`, `business_name` | text NOT NULL | |
| `work_email` | text NOT NULL | CHECK stored lowercase (`= lower(work_email)`) |
| `phone`, `message` | text, nullable | |
| `source` | text NOT NULL | CHECK `~ '^[a-z0-9_.-]{1,60}$'` |
| `status` | text NOT NULL DEFAULT `'new'` | CHECK IN `('new','contacted','invited','declined')` |
| `created_at`, `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Constraints/indexes: `ix_voice_beta_requests_status_created` (on `status`,
`created_at`), plus the three CHECKs above. **No `firm_id`** — deliberate: a
beta request arrives before any firm exists; it is a platform-owned lead row,
not customer-owned data (see the schema file's comment for the full
divergence rationale from the blanket "every voice table has firm_id"
rule — same pattern as inventory `voice_numbers` rows).

Purpose: `POST /api/public/beta-requests` (V5 PR-4, blueprint §14/§16).

### `voice_invites`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `code_hash` | text NOT NULL | UNIQUE; sha256 hex of the raw invite code — the raw code is never stored |
| `email` | text, nullable | CHECK stored lowercase when present |
| `note` | text, nullable | |
| `created_by` | text NOT NULL | `'admin'` today |
| `expires_at` | timestamptz NOT NULL | |
| `redeemed_at` | timestamptz, nullable | set exactly once, by a guarded UPDATE |
| `redeemed_firm_id` | integer, nullable, FK → `intake_firms.id` ON DELETE SET NULL | |
| `created_at`, `updated_at` | timestamptz NOT NULL DEFAULT now() | |

Constraints/indexes: `uq_voice_invites_code_hash` (UNIQUE),
`ix_voice_invites_redeemed_firm`, `ck_voice_invites_hash_shape` (64 lowercase
hex chars), `ck_voice_invites_email_lower`. No firm_id (platform-owned until
redeemed, same divergence rationale as beta requests). No "redeemed implies
redeemed_firm_id" CHECK — deliberate, because the FK is `ON DELETE SET NULL`
and such a CHECK would make deleting a firm fail.

Purpose: invite-only self-service signup (V5 S-1,
`POST /api/receptionist/auth/invite-signup`), plus admin issuance
(`POST`/`GET /api/admin/voice/invites`).

### Compatibility, locks, expected impact

All three tables are **new** — `CREATE TABLE`, no `ALTER` on any existing
table, no new column on `intake_firms` or any other frozen table. Expected
lock: `ACCESS EXCLUSIVE` on the new table only, for the duration of table
creation — sub-second on an empty table, no contention with any existing
query (nothing joins to a table that does not yet exist). No backfill, no
data migration. Safe to apply while the application is live; the application
code that reads these tables (this PR) already degrades gracefully if the
tables are absent (see §3), so **generate → review → apply is not
time-pressured** against a deploy.

### Rollback

`lib/db/drizzle/voice-rollback/0007_rollback.sql` (committed by this PR, NOT
part of the automatic migration journal, never applied by `drizzle-kit
migrate`). Refuses to run while any invite has been redeemed, or any beta
request has left `'new'` — see the file's header comment for the full
guard and data-loss statement. **Rename it to
`0007_<generated-tag>_rollback.sql`** once the lead generates the real
migration file, matching every other file in that directory
(`000N_<tag>_rollback.sql`); the SQL content does not change.

### Backup requirement

Standard operating backup before any migration apply, per
`lib/db/MIGRATIONS.md` — no table-specific backup beyond that; these are
brand-new, empty tables at apply time.

### Target database

**Not yet chosen by this PR.** Staging is currently PAUSED (see
`project_sitemint_owner_replan_2026_09` session memory / CURRENT-STATE.md).
Do not run `generate:voice` or any `migrate:*` against any database without
first running `pnpm --filter @workspace/db run preflight` to confirm which
database `DATABASE_URL` actually points at (never print the URL itself —
`lib/db/MIGRATIONS.md` §"identify the active database environment").

### Evidence checklist for the lead (fill in before/at apply time)

- [ ] `pnpm --filter @workspace/db run generate:voice` run on Linux; new file
      `lib/db/drizzle/voice/0007_<tag>.sql` + updated
      `lib/db/drizzle/voice/meta/_journal.json` and snapshot committed
      together (the Drizzle-snapshot-gap trap: a hand-authored or
      snapshot-less migration makes the next `generate` re-emit it — see
      session memory `project_sitemint_drizzle_snapshot_gap`).
- [ ] `lib/db/drizzle/voice-rollback/0007_rollback.sql` renamed to match the
      generated tag; content unchanged; committed in the same PR as the
      generated migration.
- [ ] Confirmed target environment via `preflight` (not printed).
- [ ] Backup taken per `MIGRATIONS.md`.
- [ ] `pnpm --filter @workspace/db run migrate:voice` applied; verified the
      three tables exist with the exact constraints above (`\d
      voice_onboarding_states` etc., or an information_schema query).
- [ ] **`lib/db/migrationOrderContract.test.ts`** — the hand-pinned check
      `"the committed migrations create exactly twenty-six domain tables"`
      (line ~638) MUST be updated from 26 to **29** (3 new `voice_*`
      tables) in the SAME commit as the generated migration — that count is
      derived from the committed migration SQL, not the schema files, so it
      cannot be updated before the migration exists, and CI will fail until
      it is. No other pinned count in that file changes (the 26→29 pin is
      the only one touched; `scheduling`/`discovery` counts are unaffected).
- [ ] Full test suite (`pnpm run test`) and typecheck
      (`pnpm run typecheck`) green after the migration lands, including the
      new route/lib tests listed in the implementation report.
- [ ] `git diff` on every protected file (CLAUDE.md list) = 0 lines.

## 2. Push-mode tables (CRM domain — additive, no owner-approval gate beyond
the standing CRM push-mode agreement)

Schema file: `lib/db/src/schema/crmAdminSessions.ts`, exported from
`lib/db/src/schema/index.ts` (the shared push-mode barrel). Applied with
`pnpm --filter @workspace/db run push` (drizzle-kit push, diff-and-apply, no
migration file/journal — same mechanism as every other `crm_*` table).

### `crm_admin_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `token_hash` | text NOT NULL | UNIQUE; sha256 hex of the raw cookie token |
| `created_at`, `last_seen_at` | timestamptz NOT NULL DEFAULT now() | `last_seen_at` slides forward on each validated request (12h idle window) |
| `expires_at` | timestamptz NOT NULL | fixed at creation (7d absolute) |
| `ip`, `user_agent` | text, nullable | |
| `revoked_at` | timestamptz, nullable | set by logout |

Indexes: `uq_crm_admin_sessions_token_hash` (UNIQUE), `ix_crm_admin_sessions_expires_at`.

### `crm_admin_audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `actor` | text NOT NULL | `'admin'` until roles exist |
| `action` | text NOT NULL | e.g. `admin.login`, `admin.logout` |
| `target` | text, nullable | never a secret |
| `ip` | text, nullable | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Indexes: `ix_crm_admin_audit_log_created_at`, `ix_crm_admin_audit_log_action`.

Purpose: O-1 persistent admin sessions (httpOnly `admin_session` cookie,
12h/7d TTL) and its audit trail. `push` is a whole-schema reconciler
(`lib/db/MIGRATIONS.md` §"the push boundary is tablesFilter, not the
barrel") — these two tables are additive-only diffs against the current
push-managed schema; nothing is altered or dropped. Compatibility: none of
the frozen `intake_*`/`crm_*` tables are touched.

### Degrade-gracefully contract (important for sequencing)

**The admin cookie-session code in this PR does not require this push to
have run.** `lib/admin-session.ts`'s `createAdminSession` /
`validateAdminSessionCookie` / `revokeAdminSession` wrap every database
call so a missing table (or any DB error) degrades to "cookie mode
unavailable" — the existing bearer-token admin login keeps working exactly
as it does today, with no behavior change, whether or not this push has
been applied. This was verified with a real HTTP boot test against a
database that refuses every query (`v5PublicWriteRuntime.test.ts`,
"V5 admin cookie sessions — degrade-gracefully behaviour"). **This push can
be scheduled independently of the voice migration above, whenever
convenient** — there is no ordering dependency between §1 and §2, and no
urgency either way.

## 3. Application-side degrade-gracefully summary (for reviewer confidence,
not something the lead needs to configure)

| Table | Reader | Behavior before the table exists |
|---|---|---|
| `voice_onboarding_states` | `lib/voiceOnboarding/onboardingService.ts` | Falls back to an in-process, per-firm in-memory map; logs the fallback once per process; `GET`/`PUT /api/receptionist/onboarding` both keep working (progress just doesn't survive a restart). |
| `voice_beta_requests` | `routes/publicBetaRequests.ts` | The route is flag-gated (`PUBLIC_BETA_REQUESTS_ENABLED`, default off); with the flag off nothing touches the table. With the flag on and the table absent, the insert throws and the route answers `500` (not a silent success) — do not enable the flag before the migration lands. |
| `voice_invites` | `routes/receptionistInvites.ts` | Same shape as beta requests: flag-gated (`INVITE_SIGNUP_ENABLED`, default off); do not enable before the migration lands. |
| `crm_admin_sessions` / `crm_admin_audit_log` | `lib/admin-session.ts` | Degrades gracefully as described in §2 — safe to leave the push unapplied indefinitely; the bearer-token admin UI is completely unaffected. |

## 4. New environment variables (documented here per CLAUDE.md — `.env.example`
does not yet list these; this packet is authoritative until it does)

| Variable | Kind | Default | Effect |
|---|---|---|---|
| `INVITE_SIGNUP_ENABLED` | flag | unset = off | Exact string `"true"` enables `POST /api/receptionist/auth/invite-signup`. Independent of `PUBLIC_REGISTRATION_ENABLED`. |
| `PUBLIC_BETA_REQUESTS_ENABLED` | flag | unset = off | Exact string `"true"` enables `POST /api/public/beta-requests`. Independent of every other public-write flag. |
| `PUBLIC_DEMO_ENABLED` | flag | unset = off | Exact string `"true"` is necessary but NOT sufficient — `POST /api/public/demo/session` also requires a real `DemoSessionProvider` to be wired through the `PublishServiceDependencies`-style injection seam in `lib/publicDemo/demoSessionProvider.ts`; the shipped production factory always throws, so this route is a structural 503 in every environment until a live provider is deliberately added in a future, separately-reviewed change. **No Vapi key, URL, or SDK reference exists anywhere in `lib/publicDemo/` or `routes/publicDemo.ts`** (proven by `v5RouteContracts.test.ts`). |
| `PUBLIC_DEMO_MAX_CONCURRENT` | config | unset = demo cannot start | Integer 1–50. Required alongside the flag; the demo route refuses (same generic 503) if either cap is missing or malformed. |
| `PUBLIC_DEMO_DAILY_CAP_CENTS` | config | unset = demo cannot start | Integer cents, 1–1,000,000. |

All five are registered in `artifacts/api-server/src/lib/envContract.ts` and
covered by its completeness test (`envContract.test.ts`), which scans the
whole `src/` tree for `*_ENV_VAR` constants — an unregistered variable fails
CI, so this table cannot silently drift from the code.

## 5. What is intentionally NOT in this PR

- No route, migration, or code touches any protected file (CLAUDE.md list).
- No live demo provider — `PUBLIC_DEMO_ENABLED=true` alone changes nothing
  observable; see §4.
- No frontend changes — this is the backend contract/security half of the
  V5 program only (blueprint §15's "Backend Contract & Security Reviewer"
  row).
- No `drizzle-kit generate`, `push`, or `migrate:*` was run by this PR
  against any database, staging or otherwise.

## Disposable-database test result (2026-09-04, lead-run)

A throwaway PostgreSQL 16 cluster (unix socket only, /tmp, destroyed after the run) on the
WSL build tree at the integrated branch head:

| Step | Result |
|---|---|
| migrate:fresh on an empty database | exit 0 — 58 public base tables; voice journal 8 rows (0000–0007); discovery 1; scheduling 2 |
| 0007 objects | voice_onboarding_states, voice_beta_requests, voice_invites present with CHECKs and indexes |
| Push-mode admin tables | crm_admin_sessions, crm_admin_audit_log created by the barrel |
| Rollback 0007 (committed SQL) | exit 0 — all three tables dropped, transaction committed |
| Journal-row clear + migrate:voice | exit 0 — all three tables re-created (the ROLLBACK runbook journal-clear step verified) |
| Existing product tables | intake_firms, voice_assistants, scheduling_appointment_requests, crm_leads intact throughout |

No Development, staging, Production or Replit database was touched. Execution against any
persistent database remains owner-gated (checklist B-09).
