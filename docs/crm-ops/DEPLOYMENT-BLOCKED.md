# Deploying to production — the verified plan

Updated 2026-09-16. This supersedes the earlier version. **The workspace is
healthy** (the "container will not boot" diagnosis was a background-tab symptom
and was wrong), and everything below was observed from inside the workspace,
the Replit dashboard, or a live request. **Nothing in production has been
changed.**

**What blocks the publish today: two Secrets only the owner can enter.**
Checked by key name at 23:46 UTC on 2026-09-15: `SNAPSHOT_SOURCE` and
`ADMIN_PASSWORD` are both absent from Web Asset Builder.

---

## 1. Topology, confirmed

```
sitemintdigital.com (+ www) ─► Replit app "SiteMint-Digital"
                               marketing server; NO database, NO secrets.
                               Proxies /api, /admin, /app, /ai-toolkit,
                               /ai-receptionist/dashboard — and now /portal —
                               to ↓, forwarding Origin and X-Forwarded-Host.
sitemintdigital.replit.app ─►  Replit app "Web Asset Builder"
                               Autoscale, [deployment] router = "application".
                               The production database (57.13 MB) lives here.
```

**`/portal` was missing from that list**, so every customer portal invitation
link answered the marketing 404. Fixed in source (`fae2c8d`) and as the release
artifact `release/marketing-dist-2026-09-16` @ `1912a3b`. **That app still needs
a republish** — a separate, small drop from the CRM publish.

**Artifact mode.** Publishing rebuilds the API only
(`pnpm --filter @workspace/api-server run build`); `web-agency` and `helpdesk`
are `serve = "static"` from `dist/public`, so **both frontends must be built in
the workspace before Publish** or the old bundles ship.

**DNS is editable inside Replit** (the domain is Replit-registered):
SiteMint-Digital → Tools → Domains → sitemintdigital.com → Manage → DNS Records.
name.com credentials are not needed. Baseline as of 2026-09-16: A `@`, TXT `@`
(replit-verify), TXT `@` (google-site-verification), TXT `_dmarc`,
TXT `resend._domainkey`, MX `send`, TXT `send` (SPF), TXT `www`, A `www`.

## 2. Production is far behind, and that is the whole risk

- **Database:** the original 27 tables with real, modest data — 3 leads,
  40 tasks, 2 projects, 10 activities, 8 discovery submissions, 7 form
  submissions, 23 landing-page views, 1 intake firm, 8 receptionist sessions,
  2 toolkit purchases, 1 campaign. No `crm_staff`, no conversations, support,
  billing, marketing, portal or automation tables, and **no voice or scheduling
  tables**. The workspace's development database (`heliumdb`) is similarly old
  (35 tables).
- **The running API** answers only `/api/healthz`. `/api/readyz` and every
  `/api/crm/*` route 404. A 200 from `/api/healthz` proves nothing here.
- The candidate owns **117 application tables** (83 barrel + 34 domain), rising
  to 119 when the receptionist's voice 0013 lands.

## 3. Who does what

The release is one api-server serving both products, so it is a joint release
with the receptionist session. Agreed protocol:

- `release/sitemint-production-2026-09-16` on origin is the **only** integration
  branch. Neither side force-pushes or rewrites the other's files; each pushes
  fast-forwards and sends the other the SHA to re-gate.
- The CRM session holds the **deploy lock** for Web Asset Builder and for the
  SiteMint-Digital `/portal` republish, on these conditions: the upgrade SQL and
  the restore-rehearsal evidence go to the receptionist session first; only a
  commit containing its receptionist commits and passing the DB-backed gates is
  published; receptionist exposure stays dormant (invite-only signup, voice flags
  exactly as it specifies); and it is told immediately before Publish.

### Owner actions — CRM side (these are asked once, here)

1. **`SNAPSHOT_SOURCE`** — the production database connection string, from
   Database → Production Database → Settings → Connection string. Used only
   inside the Replit shell, for the backup and the restore rehearsal.
2. **`ADMIN_PASSWORD`** — a new strong value from a password manager, not a
   personal password. Needed once to create the first production owner account,
   and for break-glass recovery.
3. After the API is live: a **Resend receiving key** (full access, stored as
   `RESEND_RECEIVING_API_KEY`) and the **webhook signing secrets**
   (`RESEND_WEBHOOK_SECRET` for delivery events, `RESEND_INBOUND_WEBHOOK_SECRET`
   for the inbound endpoint — they are per endpoint and must not be shared).
4. Enrol **MFA** and confirm the timezone at `/admin/crm/account`.
5. The **real email addresses** for Shasta and Saisa. Until then their
   onboarding stays pending; nothing else waits on it.

The receptionist session separately owns: Google Cloud terms acceptance, the
production OAuth client id/secret, `CALENDAR_TOKEN_KEY`, the Vapi HMAC
credential id, the transfer recipient, privacy/terms approval, plan/SMS scope,
and the spoken call test.

## 4. Configuration, in the order the code actually reads it

Measured against the code, not assumed:

- **Required before the first boot — one variable.** `CORS_ALLOWED_ORIGINS`
  (`app.ts` resolves it at module load and throws in production):
  `https://sitemintdigital.com,https://www.sitemintdigital.com,https://sitemintdigital.replit.app`.
  Also set `CRM_EMAIL_TEST_MODE=false` before Publish so live mail is
  deliberate, and `CRM_PUBLIC_BASE_URL=https://sitemintdigital.com`.
- **Read at the moment of use**, so a missing value is a clean refusal rather
  than a crash: `ADMIN_PASSWORD` (bootstrap/login), `VOICE_ARTIFACT_POLICY=none`
  (assistant publish fails closed without it), the voice webhook and tools
  groups (set each group complete or leave it off), the voice alert trio plus
  `RESEND_API_KEY`, `VOICE_DASHBOARD_BASE_URL`, the calendar group, and
  `CRM_EMAIL_TEST_MODE`.
- `VITE_VOICE_*` are **build-time** flags for the helpdesk bundle, not runtime.
- `STRIPE_BOOT_SYNC_ENABLED=false`. `TRUSTED_PROXY_HOPS` is decided only after
  observing real forwarded headers in production.
- **`CRM_LEGACY_BEARER_ENABLED=false`, set BEFORE the first publish — a
  requirement, not a preference.** Both gates fall back to the legacy shared
  credential, and that path carries no identity, so there are no permissions to
  check and it calls straight through. Until the flag is `false`, every
  permission in the CRM and on the operator routes is advisory for whoever holds
  that one password.

  It is safe before the first owner exists, which was checked rather than
  assumed: `GET /crm/staff/bootstrap-state` and `POST /crm/staff/bootstrap`
  (crmStaff.ts:185, :194) carry no gate at all — the first is a bare count, and
  the second throttles by IP, refuses once any staff row exists, and verifies
  `ADMIN_PASSWORD` from the request body. The sign-in screen reads that ungated
  count and shows the setup stage, then posts straight to bootstrap. Nothing in
  that path consults the flag, so setting it first leaves no window in which
  production is both public and maximally permissive.

  **Caveat for whoever runs the bootstrap:** the screen currently treats "could
  not read the count" as "accounts exist" and shows the sign-in form. If the
  setup screen does not appear on a fresh deployment, reload before concluding
  anything is wrong.

## 5. The schema upgrade

**Never `push` and never `migrate:fresh` against production**: push is a
whole-schema reconciler that also drops orphaned sequences, and migrate:fresh
bootstraps empty databases only.

1. **Barrel tables (`crm_*`, `intake_*`, `discovery_submissions`,
   `form_submissions`, helpdesk, …):** apply reviewed DDL generated by diffing
   production's real catalog against a push-built reference catalog of the exact
   candidate (`scratchpad/catalog.mjs` + `catalog-diff.mjs`; additive only,
   every non-additive difference is reported for a decision, never applied).
   The 20 reviewed artifacts in `docs/crm-ops/schema/` are the source of truth
   for anything they cover, including the two newest:
   `M7-companies.sql` and `M7-reminder-delivery-uniqueness.sql`.
2. **`M5-task-due-kind.sql` is the one file that writes to existing rows** and
   production has 40 tasks. Run it exactly once, and record the before/after
   count of overdue open tasks — the backfill's promise is that the number does
   not change.
3. **voice 0000–0013 and scheduling 0000–0003** go through
   `migrate:voice` / `migrate:scheduling` with `--target prod --expect-db
   <name> --expect-fingerprint <hex12> --confirm prod`. Production has no
   `drizzle` schema at all, so no journal baselining is needed.
4. **discovery 0000 will fail on production as written**: its first statements
   are 15 `ALTER TABLE discovery_submissions ADD COLUMN` without `IF NOT
   EXISTS`, and production already has all 15 (added through the SQL console on
   2026-09-09). Create only the missing discovery tables, then insert that one
   journal row with `hash` = sha256 of the raw `.sql` and `created_at` = the
   journal's `when`, exactly as `baseline-journals.mjs` computes them. This goes
   into the reviewed upgrade file for the receptionist session to read.
5. **Replit's publish-time "Generated migrations" gate** diffs the workspace
   development database against production and applies DDL itself without
   writing our journals. Expand "View full SQL", classify every statement, and
   approve nothing destructive. Bringing the development database to the same
   schema first makes that diff empty, which is the safest state to approve.

## 6. Backup and rehearsal, before anything touches production

Point-in-time recovery is **on (last 7 days)**; scheduled backups are **off**.
The workspace has `pg_dump`, `pg_restore`, `initdb`, `pg_ctl` and `postgres`, so
the whole rehearsal happens inside Replit and production data never leaves it:

1. Prove the identity of `SNAPSHOT_SOURCE` without printing it
   (`current_database()`, table count 27, the row counts above).
2. `pg_dump -Fc` to a path outside the repository; record the timestamp.
3. `initdb` a throwaway cluster under `/tmp`, restore into it, and compare row
   counts table by table against the source.
4. Apply the upgrade to the restored copy; re-run the catalog diff against the
   reference until it is empty but for known, reported differences.
5. Boot the candidate API against the restored copy and exercise it: `/api/readyz`
   200, bootstrap an owner, an authenticated write persists, a planted stale
   `processing` row is reclaimed by the worker.
6. **Inspect what the workers would do on first boot against real data** —
   pending scheduled messages, active sequences, due reminders — before live
   mail is enabled, so publishing cannot release old work to customers.

## 7. Publish, then prove it by behaviour

Check out the candidate in the workspace; `pnpm install --frozen-lockfile`;
build the API; build `web-agency` and `helpdesk` with their required env
(helpdesk needs `PORT` and `BASE_PATH=/ai-receptionist/dashboard` plus the four
`VITE_VOICE_*` flags); set the Secrets in §4; tell the receptionist session;
Publish; classify the migration gate; then verify:

- `GET /api/readyz` → 200 (the current build has no such route);
- the owner bootstraps their own account at `/admin` and signs in;
- an authenticated CRM write persists across a reload;
- `GET /api/crm/operations/jobs` shows the scheduler claiming work;
- the receptionist sign-in and the SMS STOP webhook still behave;
- the customer portal answers on `sitemintdigital.com/portal` after the
  marketing republish.

**A changed frontend bundle or a 200 from `/api/healthz` is not evidence.**

### The hosting question that must be answered before reminders are trusted

The reminder engine, the signup worker and the delivery queues run **inside the
api-server process**. Web Asset Builder is an **Autoscale** deployment
(2 vCPU / 4 GiB, max 3 — read from its own settings on 2026-09-16), and
Autoscale scales to zero: while nothing is serving traffic, nothing fires, and
the work arrives late in a burst. Nothing in the code can compensate.

Three options, with what each actually costs the owner:

1. **Reserved VM** — always on, from about $15/month for the smallest shared
   machine (0.5 vCPU / 2 GiB). The deployment settings say changing type
   "requires unpublish and publish again", so it means a deliberate republish
   rather than a toggle. Reminders then fire on time with no extra moving parts.
2. **Stay on Autoscale and drive the queue from outside**, by calling
   `POST /api/crm/operations/jobs/run` on a schedule. That route exists and is
   permission-gated, so this is configuration, not new code — but it needs
   something outside this deployment to do the calling, on a schedule at least
   as frequent as the shortest reminder you care about.
3. **Accept late reminders**, in which case say so in the product rather than
   letting someone believe a reminder will arrive at a particular minute.

**Recommendation: (1) for the first release.** It is the only option that makes
the reminder engine's promise true without adding a second system to maintain,
and $15/month is small against the cost of a missed client follow-up. This is an
owner decision because it is a recurring charge.

## Do not

- Toggle "Enable Receiving" on the apex domain in Resend — it writes an apex MX.
  Inbound belongs on `reply.sitemintdigital.com` as its own domain.
- Publish before the rehearsal in §6, or treat a bundle hash as proof.
- Point production at a test database, or copy `@sitemintdigital.test` fixture
  accounts into it.
- Approve the two queued Replit Agent tasks on the SiteMint-Digital app ("Get
  the CRM running on Replit with a live database", "Connect external services").
  They propose the topology the owner ruled out.
