# Handoff — CRM workstream → integration owner (2026-09-11)

Per `docs/ai-receptionist/INTEGRATION_OWNERSHIP.md`. One file, dated, no shared
session state assumed.

**Branch:** `claude/sitemint-crm-operations-124038` @ `1962459` (not pushed).
**Base:** `b0a5f49`; this branch **merges your `83ff869`**, so it is current with
the integration branch and should merge back cleanly.
**Milestone:** M1 — individual staff accounts, sessions, permissions, attribution.

## 1. Schema changes needing your push (shared, additive, push-mode)

New file `lib/db/src/schema/crmStaff.ts`, exported from the barrel. Four tables,
all `crm_*` push-mode like every other CRM table. **Nothing existing is
altered**, no domain migration is involved, and I have run push only against my
own isolated local database — never staging, never production.

| Table | Purpose |
|---|---|
| `crm_staff` | one row per person: email (unique, lowercased), display name, role, status, scrypt password hash, TOTP secret, recovery-code hashes, `session_epoch`, per-person permission grants |
| `crm_staff_sessions` | one row per issued cookie; sha256 hash only, 12h idle / 7d absolute, CSRF hash, epoch snapshot |
| `crm_staff_tokens` | single-use expiring invite / password-reset tokens |
| `crm_staff_login_attempts` | durable throttling ledger (process memory does not throttle a scaled deployment) |

Rows are never deleted — a person is `disabled`, so their historical work keeps
their name. `crm_staff_sessions` and `crm_staff_tokens` cascade from `crm_staff`.

## 2. Shared files I changed, and why

| File | Change | Risk |
|---|---|---|
| `lib/db/src/schema/index.ts` | one export line | none |
| `artifacts/api-server/src/routes/index.ts` | register `crmStaffRouter` **before** the CRM routers so `/crm/staff/*` is not swallowed by a parameterised `/crm/:x` route | low; ordering is load-bearing |
| `lib/db/migrationOrderContract.test.ts` | domain pin 29 → 30 | **your** voice 0008 (`voice_signup_jobs`) changed this |
| `lib/db/migrateFreshStateContract.test.ts` | domain 29 → 30, application 58 → 59 (yours); barrel 29 → 33, application → 63 (mine) | both derived counts |
| `lib/db/baselineJournalsContract.test.ts` | folder count 11 → 12 | **yours** — voice 0008 |
| `artifacts/api-server/src/lib/routeSecurity{,.manifest}.ts` | new `"staff"` protection class; `requireStaff` / `requireCrmAuth` signals; 18 new manifest entries | contract still green |

**Why three count pins had drifted:** the `scripts` suite is `&&`-chained, so the
two failing table-count contracts were hiding every suite after them. With them
fixed, a third (`baselineJournalsContract`) surfaced — also voice 0008. The full
workspace chain now exits 0; it had not been green before this branch.

## 3. Authentication cutover — action required from you

The six CRM route files this workstream owns now use `requireCrmAuth()`, which
accepts a per-person staff session first and falls back to the legacy shared
bearer **while `CRM_LEGACY_BEARER_ENABLED` is not `"false"`**.

Cutover sequence, whenever you are ready:
1. Deploy (flag unset → legacy bearer still works, nothing breaks).
2. Owner opens `/admin`, creates the first owner account with `ADMIN_PASSWORD`.
3. Owner invites the others from `/admin/crm/people`.
4. Set `CRM_LEGACY_BEARER_ENABLED=false`. The shared token stops working
   everywhere at once and permissions become genuinely enforced.

**Still bearer-only, and not mine to change:**

- **CLAUDE.md-protected:** `routes/phone.ts` (`/crm/conversations`,
  `/crm/phone/*`, a lead's `messages`/`sms`/`call`) and `routes/intakeAgent.ts`
  (`/api/intake/*`). These are CRM-facing reads used by the Command Center,
  Inbox, Communications and Intake Cases. **They reject staff sessions**, so
  after step 4 those screens lose their data unless an owner authorizes the same
  one-line guard swap. This needs an explicit owner instruction naming the files.
- **Yours:** `receptionistAdmin.ts`, `adminVoiceDiagnostics.ts`,
  `publicBetaRequests.ts` region (`/api/admin/receptionist-accounts`,
  `/api/admin/voice/*`). Swapping their local `requireAdmin` for
  `requireCrmAuth()` is a one-line change per file if you want staff sessions to
  reach the ops screens.

Until then the client lists those paths as *transitional foreign auth* and does
not treat their 401 as a sign-out — without that, signing in as a person and
opening the Command Center bounced straight back to the login page. That list
is in `artifacts/web-agency/src/lib/adminFetch.ts`; delete entries as routes
are unified.

## 4. Contract already relied upon, restated

Your signup pipeline's `crm_leads` columns (`name, company, phone, email,
source, service_interest, status, priority, tags, notes`) are untouched, and
`source='AI Receptionist Signup'` / tag `AI Receptionist` still work. M1 added
no column to `crm_leads`. The durable `crm_leads.intake_firm_id` proposal from
`docs/crm-ops/AUDIT-2026-09-11.md` is still open and still yours to decide.

## 5. Small thing you may want

`src/lib/signupPipeline/signupPipeline.test.ts` imports `@workspace/db` at
module scope, so it fails collection unless `DATABASE_URL` is set — which
`pnpm run test` does not set. Everything else in the suite tolerates its
absence. A lazy import inside the test would make the bare `pnpm run test`
green without an environment variable.

## 6. Verification on this branch

- `pnpm run typecheck` — clean.
- `pnpm run test` — **exit 0** with `DATABASE_URL` + `CRM_TEST_DATABASE_URL` set;
  api-server 1119/1119, every scripts contract green.
- Builds: web-agency, api-server, helpdesk all pass.
- 36 M1 acceptance tests against an isolated PostgreSQL 18, plus a browser pass
  of bootstrap → invite → activate → sign in as a second person → permission
  refusal.
- Protected-file diff vs `b0a5f49`: **0 lines** (phone.ts, intakeAgent.ts, the
  receptionist backend set, the four locked engines, `intakeAgent.ts` schema).
- No push, no deploy, no migration outside the local test database, no customer
  contact.
