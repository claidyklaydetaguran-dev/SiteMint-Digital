# CRM workstream → Integration owner handoff

> From: CRM operations session (branch `claude/sitemint-crm-operations-124038`)
> To: the receptionist/integration session (owner of merges and shared deployment)
> Date: 2026-09-11. Base: shared checkpoint `b0a5f49`
> (`feature/ai-receptionist-private-beta-readiness`). The two sessions do not
> share messages — this file is the contract.

## What this branch contains

All commits on `claude/sitemint-crm-operations-124038` after `b0a5f49`. Scope:
CRM UI/routes/tests only. **Zero bytes changed** in any protected file
(verified: `git diff b0a5f49 -- <every protected path>` is empty), no schema
changes, no migrations, no new dependencies, no deployments, no production data
touched. Full audit and readiness: `docs/crm-ops/AUDIT-2026-09-11.md`.

### Files changed and why (by area)

**Security / correctness**
- `web-agency/src/pages/crm/CrmDiscovery.tsx` — 6 raw `fetch()` calls with a
  local token getter replaced with `adminFetch` (the O-10 contract); the page now
  participates in 401-redirect and cookie transition.
- `web-agency/src/pages/crm/opsContract.test.ts` — new guard: any bare `fetch(`
  or `adminToken` read under `pages/crm|ops` fails (the `API()` wrapper loophole
  that let the above pass is closed).
- `api-server/src/routes/admin.ts` — **submissions section only**:
  `GET /admin/submissions/export/csv` moved above `GET /admin/submissions/:id`
  (it was unreachable — `:id="export"` → 400). Login/session code untouched, but
  watch this file at merge time since you also own edits in it.

**Honest UI + resilience**
- `CrmLeads.tsx` — search input actually filters (was `readOnly`); dead bulk
  strip/Columns/"Me" controls removed; fabricated "Outgoing call/Email" channel
  label removed; load error state + retry (was a stuck spinner); mobile: nested
  `<a>` hydration errors fixed, smart-list rail collapsed by default on phones.
- `CrmTasks.tsx`, `CrmPipeline.tsx`, `CrmProjects.tsx` — error state + retry.
- `CrmCalendar.tsx` — fake day/week view switcher removed.
- `CrmSettings.tsx` — no-op "Save Settings" removed; email test mode is now the
  server's truth via new `GET /api/crm/settings/status` (read-only) instead of a
  local toggle; stale "default password" claim replaced with the fail-closed
  reality; team list labeled as a static directory.
- `CrmAdminSettings.tsx` — rewritten: only real destinations are cards; the
  hardcoded always-on "SMS not connected" banner now consults
  `/api/crm/phone/status`; unbuilt capabilities listed as text.
- `CrmExecutiveDashboard.tsx` — two new best-effort sections completing the
  command center: "Inquiries Needing a Response" (discovery `crmStatus=New`) and
  "Approaching Deadlines" (projects with `targetLaunchDate` ≤ 14 days / missed).

**Integration visibility (read-only — your pipeline stays the only writer)**
- `api-server/src/routes/crm.ts` — new `GET /crm/receptionist-signup-jobs`:
  SELECT-only over `voice_signup_jobs` ⟕ `intake_firms`, surfacing
  `permanently_failed` jobs to the operator. No retry endpoint on purpose.
- `CrmReceptionistAccounts.tsx` — shows a red panel when any signup job is
  permanently failed (this state was previously invisible outside server logs).

**Tests / infra**
- `api-server/src/routes/crmOperationsJourney.test.ts` — 17-test DB-backed
  journey (inquiry → assign → proposal → project → 409-idempotent retry →
  progress → follow-up → verified cleanup), gated on `CRM_TEST_DATABASE_URL`,
  skipped without it. Run:
  `CRM_TEST_DATABASE_URL=postgres://… npx vitest run src/routes/crmOperationsJourney.test.ts`
- `api-server/src/lib/adminPassword.test.ts` — the "exactly one reader" scan now
  excludes `*.test.ts` (tests may SET the env as a fixture; production sources
  still can't read it). Flagging since it's your AR-001G contract file.
- `web-agency/vite.config.ts` — opt-in dev proxy: `API_PROXY_TARGET` env maps
  `/api` in `vite dev` only. Unset (Replit) → behavior identical.

## Baseline defects found at b0a5f49 that are YOURS to fix

1. **`lib/db/migrationOrderContract.test.ts`** expects **29** domain tables;
   voice migration `0008` (voice_signup_jobs) makes **30**.
2. **`lib/db/migrateFreshStateContract.test.ts`** expects 29 domain / 58 public;
   actual 30 / 59.
   Both fail at the checkpoint itself, and because `scripts test` is
   `&&`-chained they mask every suite after them in `pnpm run test`. One-line
   count updates in each.

## Requested schema decision (not implemented — your call)

The firm↔lead join currently rests on jsonb `result.crmLeadId`, email match,
and a `"(firm N)"` notes string. Proposal: additive nullable
`crm_leads.intake_firm_id` written by the `crm_link` job. Full integration
contract (identifiers, allowed fields, write ownership, retry/dedupe,
staging-vs-production): AUDIT doc, final section. Until then, do not delete
completed `crm_link` job rows — they are the only durable mapping.

## Verification state on this branch (all local, Windows worktree)

- `pnpm run typecheck` — clean.
- api-server vitest — **1081/1081 pass** (with `CRM_TEST_DATABASE_URL` set;
  1064 pass + 17 skip without it). Note: `signupPipeline.test.ts` needs any
  `DATABASE_URL` present to collect (your file imports `@workspace/db` at module
  scope) — an inert `postgresql://127.0.0.1:1/never_connected` suffices.
- scripts contract chain — every suite passes individually except the two
  table-count contracts above (pre-existing, yours).
- Builds: web-agency, api-server, helpdesk all pass.
- Protected-file diff vs b0a5f49 — 0 lines.
- Live browser pass against an isolated local PostgreSQL 18 (WSL) with the full
  59-table schema: login, dashboard (new sections live), discovery, leads
  (search/mobile), settings, admin hub, receptionist accounts — no console
  errors attributable to the app after fixes.

## Merge notes

- No shared-file conflicts expected except possibly `routes/admin.ts` (route
  reorder hunk) and `adminPassword.test.ts` (one line) — both flagged above.
- Nothing here needs env/config changes in staging or production.
  `API_PROXY_TARGET` and `CRM_TEST_DATABASE_URL` are local-dev/test only.
- Rollback: revert the branch commits; no data or schema to unwind.
