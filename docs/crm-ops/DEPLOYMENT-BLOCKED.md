# Deploying the CRM API — what is in the way, precisely

Written 2026-09-15 after attempting the deployment with full owner
authorisation. Everything here is a read-only observation; nothing in
production was changed.

## The topology, re-confirmed

```
sitemintdigital.com  ─────►  Replit app "SiteMint-Digital"
  (+ www)                    marketing server, bundle index-Ddshz1FS.js
                             NO database, NO secrets at all
                                    │
                      reverse-proxies /api
                                    ▼
sitemintdigital.replit.app ─►  Replit app "Web Asset Builder"
                             Autoscale 2vCPU / 4GiB / max 3, North America
                             Production database CONNECTED (57.13 MB / 100 GB)
                             Development database (58.13 MB / 20 GB)
                             last published ~2 months ago
                             also serves /ai-receptionist/dashboard, /ai-toolkit
```

So **Web Asset Builder is the only app with the production database and the
only one serving `/api`.** Any CRM deployment has to happen there.

### What that deployment currently answers

| Path | Result |
|---|---|
| `/api/healthz` | **200** `{"status":"ok"}` |
| `/api/readyz` | 404 |
| `/api/crm/*` | 404 |
| `/api/receptionist/me` | 404 |
| `/api/discovery/v1/health` | 404 |
| `/api/metricz` | 404 |

`/api/readyz` returns an Express "Cannot GET" page with the Replit script
injected, so it *is* that app's Express — just far older than the commit that
added `readyz`. **A 200 from `/api/healthz` is not evidence the API works**; it
is the one route that happens to predate everything else.

## The blocker

**The Web Asset Builder workspace container will not start.**

Every pane that needs the container hangs on "Loading project…" — Secrets, Git,
and the Production Database detail view all do. After a hard reload
(`ctrl+shift+R`, the documented fix for this symptom), a probe of the page
returns:

```
{ xtermEls: 0, wrappers: 0, canvases: 1, loadingText: true }
```

Zero terminal instances. Clicking a Shell tab selects it and renders a blank
pane; typing into it does nothing.

**Consequence — all five of these are unreachable:**

1. **Shell** — cannot inspect the deployed source or run anything.
2. **Secrets** — cannot read what is configured or add `RESEND_API_KEY`,
   `CRM_INBOUND_EMAIL_DOMAIN`, `RESEND_INBOUND_WEBHOOK_SECRET`.
3. **Connection string** — cannot back up the production database, which the
   owner's own instruction requires *before* any schema change.
4. **Code transfer** — cannot get the current monorepo into the workspace.
5. **Build + publish** — `Republish` ships the existing `dist/index.mjs`; it
   does **not** rebuild the api-server. Publishing without first running
   `pnpm --filter @workspace/api-server run build` in that workspace deploys
   stale compiled JavaScript, silently.

The SiteMint-Digital app *does* load, but it has no database and only proxies
`/api` onward, so it is not a substitute.

There is also a Replit Agent task on SiteMint-Digital sitting at **"Waiting for
input — Get the CRM running on Repli…"**, so this has already been attempted
through the Agent.

## What has to happen first

**Get a Shell prompt in `replit.com/@claidyklayde/Web-Asset-Builder`.** Until
that works, none of the deployment steps can run. If a hard reload does not fix
it, this is a Replit support question — the app has been idle two months and the
container may need rebuilding.

Once the shell is up, in this order:

1. **Back up the production database and prove the backup restores.** 57 MB is
   small enough to `pg_dump` and restore into a scratch database as a rehearsal.
   Do not skip the restore half — an unverified backup is not a backup.
2. **Review the CRM schema additions.** They are additive only: `CREATE TABLE
   IF NOT EXISTS` plus a few nullable columns, in the reviewed artifacts under
   `docs/crm-ops/schema/`. Nothing drops or renames an existing column. The
   receptionist, discovery and billing tables are untouched.
3. **Transfer the release** (branch `claude/sitemint-crm-operations-124038`,
   now pushed to GitHub, so a `git clone`/`fetch` from the workspace is far
   better than a hand transfer if the workspace has network access).
4. **Build the api-server explicitly**, then Republish.
5. **Verify by behaviour, not by bundle hash.** The frontend rebuilds on every
   publish, so a changed bundle hash "confirms" deploys that included no backend
   change at all. Use a one-bit marker only the new code can produce:
   `GET /api/readyz` returning 200 is exactly that, since the deployed build
   does not have the route.
6. Then, and only then, configure inbound email — the MX record must not point
   anywhere until `POST /api/crm/webhooks/resend/inbound` exists at a public URL.

## Do not do this

- **Do not toggle "Enable Receiving" on the `sitemintdigital.com` domain in
  Resend.** That writes an **apex MX record**, which the owner explicitly ruled
  out. Inbound goes on `reply.sitemintdigital.com` as its own Resend domain.
- **Do not republish Web Asset Builder as a way of "refreshing" it** without the
  explicit api-server build first, or you ship stale backend code.
- **Do not point production at a test database**, and do not copy the
  `@sitemintdigital.test` fixture accounts into production. They are demo rows.
