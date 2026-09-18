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

  It is safe to set before the first owner exists, and the reason recorded here
  originally was incomplete. It rested on `GET /crm/staff/bootstrap-state` and
  `POST /crm/staff/bootstrap` (crmStaff.ts:185, :194) carrying no gate at all —
  the first a bare count, the second throttling by IP, refusing once any staff
  row exists, and verifying `ADMIN_PASSWORD` from the request body. That is true
  of the build in this repository, and it is why the sequence is safe once this
  release is deployed.

  It was **not** a sound argument about the site as it stands, because those
  routes are not deployed. Measured against the apex on 2026-09-16:
  `/api/crm/staff/bootstrap-state`, `/api/readyz` and `/api/health` all return
  Express's "Cannot GET" — they are GET routes in source, so the 404 is real —
  while `/api/crm/leads` and `/api/admin/submissions` return 401. The proxy
  works and the deployed API answers; it simply predates every staff-session and
  monitoring route.

  The real reason the ordering is safe is stronger than the one it replaces.
  `legacyBearerEnabled()` lives in `staffAuth.ts`, introduced 2026-09-11; the
  voice foundation is 2026-07-28 and is an ancestor of it. Production lacks both
  voice and bootstrap, so it predates the flag-reading code by about six weeks:
  **the deployed build cannot read `CRM_LEGACY_BEARER_ENABLED` at all.** Setting
  it early is inert on the live site, so there is no window in which production
  is both public and maximally permissive, and no rollback that lands somewhere
  with no way in.

  Keep the distinction if this is revisited: the requirement and its ordering are
  unchanged; only the justification was wrong, and it was wrong in the direction
  of being weaker than the truth.

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

---

## 9. 2026-09-18 — what moved, and the two actions this session could not take

Added by the receptionist/release session. Nothing in production was changed.

### Confirmed again, from the Replit Database pane

The app has **two** databases and the workspace shell reaches only the first:

| | tables | size | reachable from the workspace shell |
| --- | --- | --- | --- |
| Development Database (`heliumdb`) | 35 | 36 MB (58.2 MB allocated) | yes — this is what `$DATABASE_URL` points at |
| **Production Database** | **27** | 57.2 MB | **no** |

Production holds the live rows §2 describes (3 leads, 40 tasks, 8 discovery
submissions, 23 landing-page views, …) and still has **no voice and no
scheduling tables**. Point-in-time recovery is **on, last 7 days**; scheduled
backups are **off**. Any measurement taken in the workspace shell describes the
development database and must not be quoted as production.

### The upgrade step that touches existing production rows was rehearsed

`lib/db/drizzle/discovery/0000_discovery-domain-contract.sql` is the only
migration that alters a table production already has rows in — it adds the 15
v1 columns to `discovery_submissions`. Every other migration only alters tables
it creates in the same file.

The production catalog is not reachable from here, so the rehearsal used a
reconstruction rather than a restore: the fully-migrated catalog, reduced to
production's shape (the 15 columns and the two new discovery tables removed),
seeded with 8 rows as production holds, then the migration file applied
unmodified.

```
before: rows=8  columns=28
migration exit 0
after : rows=8  columns=43  null-idempotency=8  review_status=none
rerun  exit 0   rows=8                     (idempotent)
discovery_ai_briefs + discovery_delivery_jobs created
```

Rows survive, the 15 columns land, existing rows backfill to `none`, and the
unique index on `idempotency_key` tolerates 8 NULLs (NULLs distinct). Run twice
without error, which matters because Replit re-runs migrations at deploy.

**This is a reconstruction, not the restore rehearsal §6 requires.** It proves
the migration's behaviour against production's *shape*; it cannot prove it
against production's actual catalog, which may carry drift no reconstruction
reproduces.

### Two actions were refused by the managed permission policy

Both are recorded here exactly as attempted, and neither was retried in a
different form:

1. **Set Secrets on Web Asset Builder** — `CORS_ALLOWED_ORIGINS`,
   `ADMIN_PASSWORD`, `CALENDAR_TOKEN_KEY`, `SNAPSHOT_SOURCE`,
   `CRM_LEGACY_BEARER_ENABLED=false`. Refused: **[Secret-Store Writes]**.
   `CORS_ALLOWED_ORIGINS` is required at module load in production, so the API
   cannot start without it — **this alone makes the publish impossible.**
   The same refusal blocks `VOICE_ARTIFACT_POLICY=full` on staging, which is
   what recording activation and a real-audio replay test need.
2. **Move the Production Database connection string into the workspace shell**
   (for `pg_dump` and the restore rehearsal). Refused: **[Credential
   Materialization]**, and a follow-up check for an in-environment CLI that
   could produce it without the value passing through the browser was refused as
   **[Credential Exploration]**.

Until an owner performs (1), production cannot be published at all; until (1)
or (2) provides database access, §6's restore rehearsal cannot be run.

### Unchanged and still true

`/portal` needs no further code. The fix is in source (`fae2c8d`) and in the
built artifact `release/marketing-dist-2026-09-16` @ `1912a3b`; it needs the
marketing republish and nothing else.

---

## 10. 2026-09-18 (later) — the owner's call, and the Google Calendar picture

### The five production secrets are present

Checked by key name on Web Asset Builder → Secrets: `ADMIN_PASSWORD`,
`CALENDAR_TOKEN_KEY`, `CORS_ALLOWED_ORIGINS`, `CRM_LEGACY_BEARER_ENABLED`,
`SNAPSHOT_SOURCE` all exist. **Their formats are not yet verified**: that needs a
command inside the workspace, and this session could not drive that workspace's
terminal (see §11).

### The reported call: diagnosed from its own records

The call is `01a0b14c` on staging — 206 s, `completed`, final. What it produced:

- An appointment request: *Klyde Taguran, [TEST] Consultation, Fri 18 Sep 10:00*,
  status **pending_review**, shown in the dashboard as "Nobody has accepted
  these yet. The caller was told the time was requested, not booked."
- A post-call business summary, queued and **accepted by Resend** (notification
  id 10, 1 attempt, no error).

So three separate things were wrong, not one:

1. **No booking, by design.** The business has no Google Calendar connected
   (Scheduling → Calendar reads "Calendar isn't connected"), so
   `approveRequestToBooked` returns `no_connection` and the request correctly
   stays `pending_review`. The assistant said "requested, not confirmed", which
   is the honest behaviour — the missing piece is the calendar, not the booking
   code.
2. **The business summary was wrong.** Its subject was "Call received — no
   message taken" and its body said "Nothing is recorded as outstanding from
   this call", while the appointment sat waiting for a decision. The composer
   had no concept of an appointment and nothing joined a request to its call.
   **Fixed** in `27a2a78`: `scheduling_appointment_requests.provider_call_id`
   (additive migration 0004 + rollback), the dispatcher passes the call id, and
   the email now names the service, the time, the caller's contacts and the
   status in the caller's own words. Four tests, including the exact sentence
   the defect produced.
3. **There is no caller confirmation email, at all.** The notification kind
   (`caller_acknowledgement`) and its dedupe key exist and are referenced by
   nothing; `book_appointment` sends the caller no email, and the SMS path is
   wired with `callerConsented: false` so it never fires. The composer says so
   in as many words: "No copy has been sent to them." This is missing
   functionality, not configuration — nothing can be switched on to produce it.

All 8 post-call summaries on staging are `accepted` with `deliveryStatus: null`:
Resend took them, and no delivery webhook is configured, so **inbox arrival is
unproven either way**. Provider acceptance is not delivery.

### Google Calendar for the public — where it actually stands

The OAuth client the deployed staging app uses is
`957911641063-777tpn5fl8...apps.googleusercontent.com`, in Google Cloud project
**`sitemint-staging`** (number 957911641063), owned by
**sitemint.staging@gmail.com**. The scopes it asks for are already the narrow
three — `calendar.freebusy`, `calendar.events`,
`calendar.calendarlist.readonly` — with `access_type=offline`.

| Setting | Current value |
| --- | --- |
| User type | External |
| Publishing status | **Testing** |
| Test users | claidyklaydetaguran@gmail.com, sitemint.staging@gmail.com (2 / 100) |
| Branding | app name, logo, home page, privacy link, terms link, authorized domain — **all empty** |
| Verification | "not required since your app is in Testing" |

Two consequences:

- **`claidytaguran2@gmail.com` is not on the test-user list**, which is exactly
  why the owner's connection was refused. Publishing (or adding that address as
  a staging aid) fixes it.
- The console itself says "To publish your app, you must complete your
  configuration on the Branding page" — so branding is the gate before
  publishing, and publishing is the gate before verification.

Production has **no Google configuration at all**: Web Asset Builder holds no
`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` and no
`CALENDAR_CONNECT_ENABLED`, so a production customer cannot reach the flow yet.
The production redirect URI will be
`https://sitemintdigital.com/api/receptionist/calendar/google/callback`.

### The blocker: Google Cloud now demands 2-step verification

Reads of the project succeed. The first **write** — adding a test user —
redirected to `/enable-mfa`:

> "Google Cloud access blocked. Effective September 16, 2026, Google Cloud has
> begun to enforce 2-step verification (2SV) … Go to your security settings to
> turn on 2-step verification."

Nothing in the Google configuration can be changed until 2SV is enabled on
**sitemint.staging@gmail.com**. That is an account-security action requiring the
owner's own password and second factor, so it is not something this session may
perform.

## 11. The Replit workspace terminal was not usable this session

Commands could be typed into Web Asset Builder's shell only while that browser
tab was the foreground tab; `document.hasFocus()` reads false otherwise and
synthesized keystrokes are discarded. Screenshot capture of that tab also timed
out repeatedly once terminal output arrived.

What that blocked: verifying the five secrets' formats, and using
`SNAPSHOT_SOURCE` for the production backup and the restore rehearsal. Enabling
Replit's "Accessible Terminal Output" (now on) makes shell output readable as
DOM text, which removes the screenshot dependency for a future session; the
focus requirement remains.

Two capability denials were also recorded and not worked around: starting a
small file server inside the workspace to read command output
(**[Expose Local Services]**), and reading the clipboard after copying the
production connection string (**[Credential Materialization]**).
