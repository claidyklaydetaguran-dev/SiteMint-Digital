# Release checklist

Every deploy of the api-server (staging or production) walks this list.
"Green" always means the REAL CI run on the exact SHA being shipped.

## Before merge

- [ ] Branch off current `main`; one PR; merge commit (no squash/rebase).
- [ ] `gates` job green: typecheck, aggregate suite, disposable-postgres
      journal proofs, api-server build, disabled helpdesk build,
      built-output scan, secret scan, `git diff --check`.
- [ ] `voice-matrix` job green (20-variant strict boundary matrix).
- [ ] Protected-file diff vs main = 0 lines (intake/SMS/auth/billing list
      in `CLAUDE.md`).
- [ ] If a migration ships: rollback SQL committed beside it, journal
      contract pins updated, and the PR says what the rollback refuses on.

## Ship

- [ ] Record the merge SHA being deployed.
- [ ] If migrations are included: follow
      `deploy/PRODUCTION_MANIFEST.md` §Database (backup → drill PASS →
      preflight → guarded migrate → preflight clean). Owner present for
      production.
- [ ] Deploy the build; watch boot.

## Verify (both environments)

- [ ] Boot log shows the expected sweep enabled/disabled lines and
      `[env contract]` has no `error` lines (a deliberate flag flip shows
      as the corresponding enabled line, nothing else changes).
- [ ] `GET /api/healthz` 200, `GET /api/readyz` 200.
- [ ] `GET /api/metricz` with the bearer (where configured): databaseOk
      true, counters sane.
- [ ] SMS regression (staging, and production during windows): STOP
      webhook curl → `<Response></Response>` and the conversation is
      `opted_out`; login rate limit 10×401 → 429. (CLAUDE.md gate 3.)
- [ ] No browser console errors on the dashboard routes that shipped.

## If anything fails

Roll the deploy back to the previous SHA first (builds are
reproducible), THEN diagnose with `runbooks/INCIDENT.md`. Migration
rollback (`runbooks/ROLLBACK.md`) only with the owner.
