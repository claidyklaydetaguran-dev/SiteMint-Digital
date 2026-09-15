# Deploying the CRM to production — verified state and plan

Updated 2026-09-15. **This replaces the earlier version of this file, which
said the Web Asset Builder workspace container would not boot. That diagnosis
was wrong.** The workspace was healthy: a Replit workspace opened in a
background browser tab defers its container connection while
`document.hidden` is true, which produces exactly the symptom recorded then
("Loading project…", zero terminals). Overriding `document.hidden` in the page
brought up two live terminals within seconds. The check that would have caught
it was already in the project notes and was skipped.

Everything below was observed from inside the workspace or the Replit
dashboard. Nothing in production has been changed.

---

## 1. Topology (confirmed from inside, not assumed)

```
sitemintdigital.com (+ www) ─► Replit app "SiteMint-Digital"
                               marketing server; NO database, NO secrets
                               proxies /api etc. to ↓, forwarding the browser's
                               Origin unchanged and setting X-Forwarded-Host
sitemintdigital.replit.app ─►  Replit app "Web Asset Builder"
                               Autoscale, deploymentTarget = "autoscale",
                               [deployment] router = "application"
                               Production database (57.13 MB)
```

Web Asset Builder is the only app holding the production database and serving
`/api`, so the CRM deploys there. The marketing app is not a substitute: a
pending Replit Agent task on it proposes running the CRM on the marketing app,
which is the topology change the owner ruled out.

### How a publish builds it — artifact mode

Every artifact has `.replit-artifact/artifact.toml`, so the application router
starts one service per artifact:

| Artifact | Production build | Production run |
|---|---|---|
| api-server (`/api`, port 8080) | **`pnpm --filter @workspace/api-server run build`** | `node --enable-source-maps artifacts/api-server/dist/index.mjs`, health `/api/healthz` |
| web-agency (`/`, port 22065) | **none** | `serve = "static"` from `artifacts/web-agency/dist/public` |
| helpdesk (`/ai-receptionist/dashboard`) | **none** | `serve = "static"` from `artifacts/helpdesk/dist/public` |

So a publish **does** rebuild the API, but **does not** rebuild either
frontend — it serves whatever `dist/public` was last built in the workspace.
Both frontends must be built explicitly before publishing
(`PORT` and `BASE_PATH` are required by their Vite configs).

### The workspace checkout

The workspace is a full clone of the monorepo with a GitHub remote. It is on
the receptionist branch (`feature/ai-receptionist-private-beta-readiness`) with
**2 local commits never pushed** (2026-07-28 scheduling verification notes) —
a backup ref for them was created before anything else was touched. The CRM
release branch is already fetched there. The working tree is clean.

---

## 2. Production is much further behind than "a stale build"

**Database** — 27 original tables with real, modest data: 3 leads, 40 tasks,
2 projects, 10 activities, 8 discovery submissions, 7 form submissions,
23 landing-page views, 1 intake firm, 8 receptionist sessions, 2 toolkit
purchases, 1 campaign. **No `crm_staff`, no conversations, support, billing,
marketing, portal or automation tables, and no voice or scheduling tables.**

The workspace's development database is similarly old (35 tables).

**The running API** answers only `/api/healthz`. `/api/readyz`, every
`/api/crm/*` route, `/api/receptionist/me` and `/api/discovery/v1/health` all
return 404. A 200 from `/api/healthz` proves nothing here.

---

## 3. Hard blockers found before any publish

Each of these would break production if the release were simply published.

| # | Blocker | Evidence | Consequence if ignored |
|---|---|---|---|
| 1 | **No CORS allowlist** | `CORS_ALLOWED_ORIGINS` is in neither the app's Secrets nor `.replit` `[userenv]`. `app.ts:40` calls `resolveCorsPolicy(process.env)` at module load, and it throws in production when the value is missing | **The new API crashes before listening** and the platform restart-loops it. Today's build predates that rule, which is the only reason production runs |
| 2 | **Boot migrates only Stripe's schema** | `index.ts` wires `runMigrations: runStripeMigrations`; background workers start immediately after | CRM and voice routes, and the workers, would hit tables that do not exist. **The reviewed schema upgrade must be applied before the new build is published, never after** |
| 3 | **No `ADMIN_PASSWORD`** | Absent from Secrets and userenv; `POST /crm/staff/bootstrap` returns 503 without it | No first owner can be created in production, so nobody can sign in |
| 4 | **`CRM_EMAIL_TEST_MODE` unset** | Mail is simulated unless the exact string `false` is set | Invitations, resets and support replies would be recorded but never sent |

Not blockers, but decided at deploy time rather than guessed:

- **`TRUSTED_PROXY_HOPS`** defaults to 0 (trust no forwarded header), so login
  throttling buckets everyone behind the proxy together. Traffic through the
  domain and through `*.replit.app` crosses different numbers of hops, so the
  value is set only after observing real forwarded headers in production.
- **`CRM_PUBLIC_BASE_URL`** is unset, but activation links fall back to the
  existing `CRM_BASE_URL`.

Already present and reusable: `RESEND_API_KEY`, `SESSION_SECRET`, and Replit's
AI integration (`AI_INTEGRATIONS_OPENAI_API_KEY` / `…_BASE_URL`, a local
Modelfarm proxy billed to Replit usage credits).

---

## 4. Backup and recovery

- **Point-in-time recovery: On, last 7 days.** Scheduled backups: **Off.**
- The dashboard offers the production connection string, but it is a secret, so
  the owner copies it into a workspace Secret (`SNAPSHOT_SOURCE`) rather than it
  being relayed.
- The workspace has `pg_dump`, `pg_restore`, `initdb`, `pg_ctl` and `postgres`,
  so the rehearsal happens entirely inside Replit: dump production, start a
  throwaway Postgres under `/tmp`, restore into it, compare row counts table by
  table. Production data never leaves Replit.

---

## 5. Integration

The receptionist branch on GitHub has only **4 commits** the CRM branch lacks
(voice browser tokens, publish digest, browser-test error classification, and
voice migration `0009`). A dry-run merge conflicts only in three
`lib/db/*Contract.test.ts` count pins — no application code. The release is
that merge, gated like any other candidate.

---

## 6. Order of operations

1. Owner adds `SNAPSHOT_SOURCE` → dump production, restore into a throwaway
   database inside the workspace, prove row counts match.
2. Assemble the release: CRM branch + the 4 receptionist commits; resolve the
   contract pins; full gates on the exact candidate.
3. Build the upgrade: compare production's real schema with the candidate's,
   generate additive DDL, apply it to the restored copy, and boot the candidate
   against that copy before touching production.
4. Owner adds `ADMIN_PASSWORD`; set `CORS_ALLOWED_ORIGINS`
   (`https://sitemintdigital.com,https://www.sitemintdigital.com,https://sitemintdigital.replit.app`)
   and `CRM_EMAIL_TEST_MODE=false`.
5. Apply the rehearsed upgrade to production.
6. In the workspace: check out the candidate, build the API explicitly and both
   frontends with their env, then Publish.
7. Verify by behaviour: `/api/readyz` 200 (the old build has no such route);
   the owner bootstraps their own account at `/admin`; an authenticated CRM
   write persists; workers claim a planted job; receptionist sign-in and the
   SMS STOP webhook still behave.

## Do not

- Toggle "Enable Receiving" on the apex domain in Resend — it writes an apex MX
  record. Inbound goes on `reply.sitemintdigital.com` as its own domain.
- Publish before steps 3–5, or treat a changed frontend bundle or a 200 from
  `/api/healthz` as proof of a backend deploy.
- Point production at a test database, or copy `@sitemintdigital.test` fixture
  accounts into it.
