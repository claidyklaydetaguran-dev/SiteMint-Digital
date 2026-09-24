# Runbook — migration rollback

Rolling back one applied domain migration. Slow by design: every step is
a decision point.

**Step 0 — identify the environment.** Run
`pnpm --filter @workspace/db run preflight` and read the per-domain
counts. Confirm out loud which database this is. Never print
`DATABASE_URL`.

**Step 1 — back up.**
`pnpm --filter @workspace/db run backup -- --out backups/pre-rollback-<date>.dump`
then prove it restores:
`DRILL_DATABASE_URL=... pnpm --filter @workspace/db run restore:drill -- --from backups/pre-rollback-<date>.dump`
→ must print PASS.

**Step 2 — read the rollback file.** Every voice/scheduling migration
has committed rollback SQL:

| Migration | Rollback file | Refuses while |
| --- | --- | --- |
| voice 0002 (provider sync) | `voice-rollback/0002_provider_sync_state_rollback.sql` | (see file header; applied to staging 2026-08-30) |
| voice 0003 (contacts/SMS) | `voice-rollback/0003_thin_lifeguard_rollback.sql` | any SMS mid-flight (`sending`) |
| voice 0004 (numbers/transfers) | `voice-rollback/0004_lying_jamie_braddock_rollback.sql` | any number assigned/paused |
| voice 0005 (reviews/usage/caps) | `voice-rollback/0005_shiny_supernaut_rollback.sql` | ledger non-empty or caps undecided |
| voice 0006 (billing/accounts) | `voice-rollback/0006_dizzy_komodo_rollback.sql` | live subscriptions or audit rows |
| scheduling 0001 (calendar) | `scheduling-rollback/0001_black_reavers_rollback.sql` | (see file header) |

The refusal guards are the point — satisfy them deliberately (release
numbers, export the ledger/audit) rather than deleting the guard.

**Step 3 — apply the rollback SQL manually** (psql, inside the
transaction the file already opens). The guards RAISE and abort the
transaction when unsafe.

**Step 4 — clear the journal row.** The rollback does NOT touch
`drizzle.__drizzle_migrations_<domain>`; delete the single row whose
`created_at` matches the rolled-back migration, or the forward migration
can never re-apply.

**Step 5 — verify.** `preflight` again: the domain must now show the
migration as pending (and ONLY that), with no hash drift.

**Never:**
- edit the bytes of any applied migration (hash-locks every migrate
  command; `preflight` reports it as HASH DRIFT),
- roll back by editing schema by hand,
- run any of this against production without the owner present.
