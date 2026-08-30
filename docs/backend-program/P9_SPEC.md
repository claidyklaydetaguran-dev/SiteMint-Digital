# P9 — Deployment, recovery, and operations

Objective: the platform can be deployed, watched, backed up, restored,
rolled back, and activated — as code and committed procedure, with zero
deploys performed. The recurring properties: read-only-by-default
tooling, guards that make the dangerous target unreachable, and derived
(never pinned) expectations.

## Scope

- **Migration preflight** (`lib/db/src/migrate-preflight.mjs`, `pnpm
  --filter @workspace/db run preflight`): read-only report over the
  existing guard machinery — the migrate-guard decision, per-domain
  applied/pending, HASH DRIFT detection (the edited-applied-migration
  trap caught before any migrate command locks itself out), and the
  ordered command plan (bootstrap `migrate:fresh` first on an empty
  database). Never writes, locks, or spawns drizzle-kit. Pure report
  builder (`buildPreflightReport`) + renderer, fixture-tested.
  (`readState` exported from migrate-guard for reuse.)
- **Backup + restore drill** (`db-backup.mjs`, `db-restore-drill.mjs`,
  guards in `restore-guards.mjs`): pg_dump/pg_restore wrappers where the
  connection string NEVER touches a command line (decomposed into PG*
  env vars — the shell-secret-echo lesson as code); backup refuses
  overwrite and requires a .dump/.sql `--out`; the drill target's
  database NAME must declare itself disposable (drill/disposable/
  scratch/throwaway) and is refused outright when it contains
  prod/production/live/staging — the forbidden check outranks the
  allowed one. The drill verifies the restored shape (public table
  count + the three domain journal tables) DERIVED from the committed
  inventory, never pinned.
- **Environment contract** (`api-server src/lib/envContract.ts`): the
  declarative registry of all 40 program variables (14 exact-"true"
  flags, 12 secrets, 13 configs, 2 identifiers[+core]), completeness-
  tested against a source scan of every `*_ENV_VAR` constant — an
  undocumented variable cannot ship. `validateEnvContract` surfaces the
  two silent misconfiguration classes: flag values that do not enable
  ("TRUE"/"1"/"yes" → warning) and fail-closed configs that would refuse
  at use time (probed via the real loaders, lazily → error), with
  feature-owned configs probed only under their owning flag. Boot logs
  findings (`logEnvContractFindings`) without changing any behavior.
- **Manifests + contracts** (`deploy/`): STAGING_MANIFEST (services,
  ports, flags-all-off posture, staging-only deviations),
  PRODUCTION_MANIFEST (non-negotiables incl. CORS fail-at-boot,
  HMAC-only webhooks, artifact policy `none`, migration ceremony
  backup→drill→preflight→guarded-migrate), STARTUP_CONTRACT (boot
  sequence, sweep registrations, healthz/readyz/metricz semantics, what
  an orchestrator may and may not conclude).
- **Runbooks** (`runbooks/`): ROLLBACK (per-migration rollback files +
  their refusal guards + journal-row clearing), SECRET_ROTATION (every
  secret; the built-in zero-miss overlap for the Vapi webhook secret;
  the CALENDAR_TOKEN_KEY not-silently-rotatable warning), NUMBER_PAUSE
  (three layers, application-first; pause_requested decision guidance),
  INCIDENT (severity, first-five-minutes, critical-code → first-response
  table, containment principles). Plus RELEASE_CHECKLIST and
  PILOT_ACTIVATION (six stages, owner steps marked, per-step
  verification).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Restore drill aimed at a real database | Name-based guard: forbidden names refused first, disposable naming required |
| Secrets leaking via process lists / logs | URL→PG* decomposition; preflight/backup never print DATABASE_URL |
| Migrating a drifted or unbaselined database | Preflight surfaces guard refusal + hash drift read-only, before migrate commands |
| Editing an applied migration (hash lockout) | Preflight names the exact drifted tag and the rule |
| Flag typos silently disabling safety features | Boot env-contract warnings ("leaves it OFF") |
| Enabled-but-broken config discovered mid-incident | Boot env-contract errors probe the real loaders |
| Undocumented env vars accumulating | Registry completeness test against the source scan |
| Backup overwrite / unverified backups | Out-path guard; the drill is the verification, documented weekly |

## Tests

`lib/db/deployRecoveryContract.test.ts` (tsx, in the aggregate chain):
preflight report on five database shapes (empty→bootstrap-first plan,
fully applied, partial→only-pending-domain, hash drift→refusal naming
the trap, legacy-unbaselined→baseline-only plan); drill-target guard
matrix (six refusals incl. prod-outranks-drill); backup out-path guard;
URL→PG* decomposition (encoded credentials, default port, sslmode,
wrong protocol); derived-shape lockstep with `expectedApplicationTables`.
`api-server src/lib/envContract.test.ts` (vitest, 6 cases): registry
completeness via source scan, no duplicates, clean-default validation,
flag-shape warnings, fail-closed config errors, flag-conditional
probing.

## Exit criteria

- Workspace typecheck clean; secret scan 0 findings; `git diff --check`
  clean; CI (gates + voice-matrix) green on the PR.
- No migration in this phase (tooling only); no deploy performed; no
  provider/secret/flag touched anywhere.
- Protected files: 0-line diff vs main.

## Deliberately out of scope / residual

- Executing any deploy, migration, backup, or drill against a real
  environment — every command here is for the operator, gated by the
  checklists.
- Graceful-drain shutdown contract (documented residual in
  STARTUP_CONTRACT).
- CALENDAR_TOKEN_KEY re-encryption tooling (rotation currently means
  reconnecting firms; documented in SECRET_ROTATION).
- pg_dump/pg_restore presence is assumed at operator machines; the CI
  suite tests the guards, not the binaries.
