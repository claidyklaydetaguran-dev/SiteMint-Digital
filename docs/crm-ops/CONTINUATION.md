# CRM implementation — continuation checkpoint

> Resume here. Do not re-run discovery; everything below is verified.
> Last updated: 2026-09-11, during Milestone 3 (Documents and Calendar done,
> Communications in progress, Sales not started).

## Where things stand

**Branch:** `claude/sitemint-crm-operations-124038` (NOT pushed)
**HEAD:** `eca5ed8` — clean tree
**Merged:** receptionist `83ff869`, then `abfe8bb` at `5eb4c0b`.
**Upstream:** `main` is `57ea6c8` and is already contained in this branch.
Newer voice commits (`6adf786`, `46864d8`) live on
`feature/ai-receptionist-private-beta-readiness`, which the integration owner
merges — they add no tables, so they do not move the barrel pins.

**Milestone 3 status:** Documents and Calendar are implemented and tested
locally. Communications is unfinished (no durable conversation identity, no
inbound email, no sender recorded on SMS or calls). Sales is not started. M3 is
partially complete; do not report it as done.

```
eca5ed8 docs(crm): fold the communications findings into the handoff and matrix
5080d7b feat(crm): real per-person unread state for the shared customer inbox
059894f fix(crm): attribute the lead timeline, honour CC/BCC, close the send-crash window
7ee42d1 docs(crm): record that Calendar and Documents were verified at 375px
bb85f7c docs(crm): M3 operational handoff, and matrix corrections
2c4e54d test(crm): exercise the last-active-owner guard, which nothing had run
d664dea feat(crm): Documents and Calendar screens, and a delete permission for files
f918be8 feat(crm): document store, document requests, share links, internal calendar
5eb4c0b Merge commit 'abfe8bb'
```

Earlier (M1–M2):

```
4a03d19 feat(crm): M2 frontend — Operations workspace, My Day, and navigation
1dfd779 feat(crm): M2 backend — Operations, My Day, and a real reminder engine
936c72e feat(crm): owner-authorized staff-session migration for phone.ts and intakeAgent.ts
a2df72e docs(crm): M1 coverage register and integration handoff
1962459 Merge commit '83ff869'
955ef55 chore(crm): pin the barrel and migration counts
af5ffea feat(crm): unify the CRM routes under staff authentication
f2a39b1 feat(crm): individual staff accounts, durable sessions, permission matrix
```

## Verification state (all local; nothing deployed)

- `pnpm run typecheck` — clean.
- api-server vitest — **1150/1150** with `CRM_TEST_DATABASE_URL` set.
- `pnpm run test` — exits 0 with `DATABASE_URL` + `CRM_TEST_DATABASE_URL` set.
  **Always redirect to a file and check `$?`** — piping to `tail` reports tail's
  exit code and has already hidden a real failure once.
- Builds: web-agency, api-server, helpdesk all pass.
- Browser-verified: bootstrap → 3 Super Admins → invite/activate → My Day
  buckets → reminder fires → Operations drawer (milestones/updates/tasks).

## How to run everything locally

```bash
# Postgres lives in WSL; the isolated test DB is crm_test.
wsl.exe -d Ubuntu -- bash -c "sudo service postgresql start"
# schema push (temp config needed — the base drizzle config's path.join breaks on Windows)
# api-server (entry is dist/index.mjs, NOT .js)
PORT=8080 NODE_ENV=development DATABASE_URL="postgresql://crm_test:crm_test_local@localhost:5432/crm_test" ADMIN_PASSWORD="crm-preview-2026" node artifacts/api-server/dist/index.mjs
# frontend (MSYS_NO_PATHCONV stops Git Bash mangling BASE_PATH=/)
MSYS_NO_PATHCONV=1 PORT=22065 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 npx vite --config artifacts/web-agency/vite.config.ts
```

## Immediate next step

**Milestone 3 — Sales, Communications, Documents, Calendar** (areas C, D, I, M).
The Command Center is finished and verified; M2 is complete.

Highest-value first:
1. **Documents** — `crm_attachments` exists (versions, content hash, private
   storage key) but has no upload/download endpoints or UI. Needs authenticated
   upload, size/type validation, private storage, permission-checked download.
2. **Communications** — unify Inbox/SMS/calls into one threaded model with
   ownership, unread state and drafts. Inbound email needs a provider decision.
3. **Calendar** — an internal team calendar does not exist; the Command Center
   `appointments` panel is unavailable until it does.
4. **Contacts** — import/export, duplicate review, richer fields.

## Then, in order

3. **M3 — Sales + Communications + Documents + Calendar** (areas C, D, I, M).
4. **M4 — Campaign designer, AI drafts, support tickets, reporting** (F, G, H, J).
5. **M5 — Integrations, mobile/PWA, customer portal, release prep** (N, O, P).

## Known blockers and dependencies

| Blocker | Effect | Needs |
|---|---|---|
| No verified staff email addresses | Real accounts cannot be created; only test identities exist | One address per person from the owner |
| No inbound mailbox integration | Two-way email is impossible; outbound-only via Resend | Provider decision (Gmail/Outlook) + credentials |
| No e-signature provider | "Documents signed" is honestly unavailable | Provider decision |
| No site analytics / video instrumentation | Return visits and video views unavailable | Instrumentation decision |
| `CRM_LEGACY_BEARER_ENABLED` still on | Shared token still works | Flip to `false` AFTER the three real accounts are verified |
| MFA optional, not required | Privileged production access unenforced | Decide: require MFA for owners, then enforce at login |

## Traps already paid for — do not rediscover

- `refusePassword` rejects any string containing "password".
- X-Forwarded-For: our proxy **appends**, so with 1 trusted hop the **rightmost**
  entry is the real client. `TRUSTED_PROXY_HOPS` defaults to 0 (ignore header).
- vitest now runs `fileParallelism: false` — three DB suites share one database
  and each needs a known starting state.
- A reminder whose time just passed must still fire (24h stale floor), and
  `settle()` is guarded on the claimed `runAt` so recurring jobs survive.
- Tailwind class order resolves by stylesheet order, not attribute order.
- `crm_projects.name` is NOT NULL and PATCH nulls empty strings — never send an
  empty name.
- The receptionist workstream owns all schema pushes and migrations. This branch
  ships schema SHAPE only; see `docs/product-plan/handoffs/`.
