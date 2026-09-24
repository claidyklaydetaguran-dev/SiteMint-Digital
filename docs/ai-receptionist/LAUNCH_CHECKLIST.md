# AI Receptionist Browser Voice — Staging Launch Checklist

## 1. Confirm the release source

- [ ] Use `redesign/frontend-v2` — the current AR-001 implementation branch, on
      the Windows worktree. The historical names `feature/ai-receptionist-today-mvp`
      and `claude/milestone-1-f2b-readiness-kvbe27` are **superseded** and exist
      in neither worktree.
- [ ] Treat the Linux `master` branch (the `/opt/sitemint-v2-p*` candidate) as a
      **local validation candidate only**. It is where typecheck, tests and the
      build matrix run; it is not a release source and not a deployment target.
- [ ] Confirm the worktree is clean except for the reviewed release diff.
- [ ] Confirm no protected file listed in `CLAUDE.md` changed.
- [ ] Do not merge or deploy another Claude voice branch.

### How the release actually reaches staging

**No branch has been pushed, and no Git push is authorized.** Replit publishes
a reviewed filesystem snapshot, not a Git ref. An owner-approved staging
transfer therefore uses a **reviewed source archive** of the release tree —
reviewed file by file before transfer — and never a `git push`, merge, or PR.

AR-001G was pre-staging security hardening only. **No staging execution is
authorized**, and AR-001 remains active and unaccepted.

## 2. Configure staging

Set these as staging secrets or build variables. Never paste their values into a prompt, log, issue, commit, or screenshot.

| Variable | Where used | Required value |
|---|---|---|
| `DATABASE_URL` | API and migration | Staging database only |
| `NODE_ENV` | API runtime | `production` |
| `PORT` | API runtime | `8080` |
| `BASE_PATH` | Dashboard build | `/ai-receptionist/dashboard` |
| `CORS_ALLOWED_ORIGINS` | API runtime | The staging origin only — see below |
| `ADMIN_PASSWORD` | API runtime | A **new staging-only** secret — see below |
| `STRIPE_BOOT_SYNC_ENABLED` | API runtime | `false` |
| `VOICE_PUBLISH_ENABLED` | API runtime | `true` for staging UAT |
| `VOICE_ARTIFACT_POLICY` | API runtime | `none` — the only value approved for AR-001 |
| `VAPI_API_KEY` | API runtime | Vapi private server key (staging organization) |
| `VOICE_RUNTIME_CATALOG_JSON` | API runtime | Reviewed JSON catalog described below |
| `VITE_VOICE_PLATFORM_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_PUBLISH_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_BROWSER_TEST_ENABLED` | Dashboard build | `true` |
| `VOICE_SYNC_ENABLED` | API runtime | `false` — see AR-001V.1 below |
| `VITE_VOICE_SYNC_ENABLED` | Dashboard build | `false` — see AR-001V.1 below |
| `VOICE_BROWSER_TEST_ENABLED` | API runtime | `false` — see AR-001V.1 below |
| `VITE_VAPI_PUBLIC_KEY` | Dashboard build | Vapi public browser key (staging organization) |
| `PUBLIC_REGISTRATION_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |
| `PUBLIC_FORM_SUBMISSIONS_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |
| `PUBLIC_ANALYTICS_WRITES_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |
| `AI_TOOLKIT_CHECKOUT_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |
| `PUBLIC_SCHEDULING_REQUESTS_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |
| `PASSWORD_RESET_REQUESTS_ENABLED` | API runtime | `false` — see AR-002B-R4/R5/R6 below |

### AR-002B-R4 through R8 — six independent public-write capabilities

Every write the API accepts from an unauthenticated caller sits behind one of
these, each with the same exact-string contract as the voice flags: only the
literal lowercase `true` enables. Absent, empty, `TRUE`, `1` or anything else
means disabled, so a typo fails closed instead of quietly opening a public
write path. They are deliberately separate — a deployment may want lead
capture on while self-registration stays off — and must never be combined.

| Flag | Opens |
|---|---|
| `PUBLIC_REGISTRATION_ENABLED` | `POST /api/receptionist/auth/signup` (creates a firm, a session, and availability defaults) |
| `PUBLIC_FORM_SUBMISSIONS_ENABLED` | `POST /api/contact/submit`, `/api/discovery/submit`, `/api/landing-test/submit` (insert `form_submissions`, send notification email) |
| `PUBLIC_ANALYTICS_WRITES_ENABLED` | `POST /api/landing-test/view` (inserts `landing_page_views`) |
| `AI_TOOLKIT_CHECKOUT_ENABLED` | `POST /api/ai-toolkit/checkout` (creates a Stripe Checkout Session) |
| `PUBLIC_SCHEDULING_REQUESTS_ENABLED` | `POST /api/public/schedule/:slug/requests` (persists a booking request) |
| `PASSWORD_RESET_REQUESTS_ENABLED` | `POST /api/receptionist/account/password-reset/request` (mints a reset token, writes an audit row, sends mail) |

`AI_TOOLKIT_CHECKOUT_ENABLED` is deliberately **not** `STRIPE_BOOT_SYNC_ENABLED`:
boot-time webhook registration and customer checkout are different capabilities
with different blast radii, and one flag for both would make enabling either
enable both. `POST /api/v1/discovery-submissions` is covered by
`PUBLIC_FORM_SUBMISSIONS_ENABLED` alongside the other lead forms.

`PUBLIC_SCHEDULING_REQUESTS_ENABLED` gates **only** the booking write. The
read-only availability endpoints — `GET /public/schedule/:slug/config`,
`/days` and `/slots` — stay available, because they persist nothing and a
booking page that cannot render its availability is not safer.

`PASSWORD_RESET_REQUESTS_ENABLED` gates **only** reset *initiation*. The
token-proven routes — `password-reset/complete`, `verify-email/confirm` and
`members/accept` — are untouched, so anyone already holding a valid token can
still use it. It is independent of `RESEND_API_KEY`: having a mail provider
configured is not consent to expose password recovery.

> **Turning this flag off disables password recovery for real customers.** It
> is the one flag in this set whose "off" position has a direct product cost,
> which is why it is explicit rather than folded into another capability. Set
> it to `true` in any environment where real customers sign in.

When enabled, the reset flow keeps the properties audited in AR-002B-R8 and
pinned by `lib/accountSecurity/passwordResetSecurity.test.ts`: one identical
generic response for known and unknown addresses, no account-existence
disclosure, the existing fixed-window IP limiter (10/hour, keyed
`pw-reset:<ip>`), single-use tokens that expire in 30 minutes, only a SHA-256
hash of a 256-bit random token stored at rest, no token value ever logged, the
audit row preserved, and at most one email per accepted request — always to
the address on file rather than the one supplied by the caller.

While disabled each returns `503` with a short generic sentence that names no
flag, environment or internal state. Sign-in, sign-out, and every
authenticated, signature-verified or token-proven route are unaffected.

### The route-security contract

`lib/routeSecurity.ts` re-derives the full mutating-route inventory from source
on every CI run and compares it against the committed manifest in
`lib/routeSecurity.manifest.ts` (127 routes). CI fails when a new `POST`/`PUT`/
`PATCH`/`DELETE` route appears unclassified, when a route loses its recorded
protection, or when a new route reachable without authentication, signature,
credential or default-off flag appears.

Rate limiting and honeypots are explicitly **not** counted as protection. They
bound abuse; they do not control access. Treating them as guards is what caused
the AR-002B-R5 inventory to miss the writer below.

The manifest keeps two separate lists. `KNOWN_OPEN_ROUTES` is for routes proven
incapable of persisting data or acting externally — the bar is a clean
side-effect scan **and** no delegation to an imported function, because a
source scan cannot see across a module boundary.
`OPEN_WRITERS_PENDING_AUTHORIZATION` holds open routes that do write or act
externally and have not yet been authorized to close; each entry states exactly
what it does. Both lists are asserted exactly, so nothing can join or leave
either one silently.

**As of AR-002B-R8 both lists are empty.** Every one of the 127 mutating
routes is reachable only behind authentication, a verified signature, a
credential, a single-use token, or a default-off capability flag. The lists
are kept rather than deleted on purpose: emptiness is asserted as a fact, and
removing the mechanism would make the count zero by construction and prove
nothing.

### API root liveness (AR-002B-R5)

`GET /api` returns `200 {"status":"ok"}` and `HEAD /api` returns `200` with no
body. This exists for the platform health probe: before R5 the API root had no
handler, so it fell through to Express's default `404`, which the probe read as
an unhealthy deployment. It performs no database query, creates no session,
makes no outbound request, and discloses no environment, version or build
detail. It is liveness only — readiness (`GET /api/readyz`, which does ping the
database) and `GET /api/healthz` are unchanged, and unknown paths under `/api`
still `404`.

### AR-001V.1 — three independent voice capabilities

Each capability has its own switch, each defaults to `false`, and each accepts
only the exact literal string `true`. Granting one never grants another.

| Capability | Server switch (authoritative) | Client build switch |
|---|---|---|
| Publish a **new** assistant (`createAssistant`) | `VOICE_PUBLISH_ENABLED` | `VITE_VOICE_PUBLISH_ENABLED` |
| Update an **already-published** assistant (`updateAssistant`) | `VOICE_SYNC_ENABLED` | `VITE_VOICE_SYNC_ENABLED` |
| Issue browser-test metadata (the provider assistant id) | `VOICE_BROWSER_TEST_ENABLED` | `VITE_VOICE_BROWSER_TEST_ENABLED` |

The server switch is the boundary; the client switch only decides whether the
code and control are built at all. With a server switch off, a crafted request
is refused before any database claim, provider construction, or credential
read — for the browser-test endpoint, before the row is even looked up, so the
existence of an assistant cannot be probed.

All three `VITE_*` flags are canonicalised to the literal `"true"`/`"false"` by
`artifacts/helpdesk/vite.config.ts` before Rollup builds the module graph, so a
`false` value removes the gated code rather than merely hiding it. The committed
16-variant build matrix
(`pnpm --filter @workspace/scripts run test:voice-boundary:matrix`) covers the
combinations.

### `CORS_ALLOWED_ORIGINS` (required in production)

A comma-separated list of **bare origins**. Exact scheme, hostname and optional
port; nothing else. The server refuses to start when `NODE_ENV=production` and
this is missing, empty, or malformed — it fails during module load, before the
HTTP port is ever opened.

Rejected by validation, deliberately: a wildcard `*`; the literal `null`; a
trailing slash; any path, query string or fragment; embedded credentials
(`https://user:pass@host`); a written-out default port (`https://host:443`); a
non-lowercase scheme or host; and any scheme other than `http` or `https`.

Only exactly listed origins receive credentialed CORS approval. There is no
prefix, suffix, subdomain or wildcard matching, so a lookalike host such as
`https://<staging-host>.attacker.example` is denied. Outside production —
and only outside production — loopback origins (`localhost`, `127.0.0.1`,
`[::1]`) with an explicit port are also permitted; arbitrary LAN hosts and
`*.replit.dev` are not, in any environment.

Syntactically valid forms:

```
https://<your-staging-host>.replit.app
https://app.example.com
http://127.0.0.1:4173
```

Set it to the staging dashboard origin only. **Do not commit a real staging
hostname to this repository** — it belongs in the deployment's secrets, not in
Git.

### `ADMIN_PASSWORD` (required for the CRM admin route)

There is no fallback password any more, in any environment. Without this
variable `POST /api/admin/login` returns `503` and admin authentication is
simply unavailable — it can never be guessed.

Generate a **new, staging-only** secret. Never reuse the production admin
password, and never reuse the literal that previously existed as a fallback.
Set it even though the AR-001 browser-voice journey does not use the admin
route: leaving it unset is safe, but setting it to anything shared is not.

### `STRIPE_BOOT_SYNC_ENABLED` (leave `false`)

Leave this `false` and **attach no Stripe connector to the staging App**. When
it is false or absent the server acquires no Stripe connector, performs no
webhook lookup or creation, runs no backfill, and makes no external Stripe
request at all; it logs one informational line and continues booting. Only the
exact lowercase string `true` enables it — `TRUE`, `1`, `yes` and any other
value fail closed.

The internal database migrations that startup requires are unaffected by this
flag. Explicit, user-initiated billing checkout is also unaffected.

### `VOICE_ARTIFACT_POLICY` (must be `none`)

Server-owned. It is never accepted in an API request body, never read from a
persisted assistant config, and cannot be influenced by a firm or a browser.

`none` sends Vapi an explicit `artifactPlan` of
`recordingEnabled: false`, `videoRecordingEnabled: false`, `pcapEnabled: false`,
`transcriptPlan: { enabled: false }` — so **no call audio is recorded and no
transcript is retained**.

Read `none` precisely: it disables everything Vapi *retains*. It does not stop
speech-to-text from happening during the call, and nothing can — a voice
assistant works by transcribing the caller in real time so the model can
respond. What is disabled is retention of `call.artifact.transcript`, not the
in-call transcription itself. Vapi's own call-log metadata
(`artifactPlan.loggingEnabled`) is left at the provider default under every
policy; it holds call metadata rather than audio or transcript, and with no
server URL configured for staging it is the only diagnostic an operator has.

If publishing is enabled and this variable is missing or invalid, the publish
fails **before** the assistant row is claimed and before any request reaches
Vapi. If publishing is disabled, nothing provider-related happens at all.

`transcript_only` and `full` exist in the code but are **not approved** for
AR-001. Only `none` is.

Receptionist sessions use **server-generated randomness**, not a signing secret.
`createSession()` generates a 40-byte token with `crypto.randomBytes` and stores it
in the `receptionist_sessions` table, so session persistence and integrity depend on
the database rather than on an environment variable. No `SESSION_SECRET` is read
anywhere in the code path; `DATABASE_URL` and genuine database isolation are the
staging requirements that matter here.

`VOICE_RUNTIME_CATALOG_JSON` must be version `1` and may contain only SiteMint's four preset keys. Replace every placeholder with an identifier verified in the connected Vapi account:

```json
{
  "version": 1,
  "presets": [
    {
      "key": "natural-balanced",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "fast-response",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "highest-intelligence",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "budget-friendly",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    }
  ]
}
```

The dashboard flags and public key are embedded during the Vite build. Rebuild after changing them. The Vapi private key is server-only.

## 2a. Staging security profile — what must be ABSENT

Secret **names** only. No value from this list may be set on the staging App,
and no actual value may be written into this file, a prompt, a log, an issue,
or a screenshot.

Nothing below is needed by the AR-001 browser-voice journey. Each one, if
present, creates a path to a real external mutation or to production data.

| Must be absent | Why |
|---|---|
| Production `DATABASE_URL` | Staging must use its own Replit-managed PostgreSQL database |
| Production `VAPI_API_KEY` | Staging uses a separate Vapi organization and its own keys |
| Production `VITE_VAPI_PUBLIC_KEY` | Same — the browser key must be the staging organization's |
| `VAPI_WEBHOOK_SECRET` | No webhook destination is configured for staging |
| Any Stripe connector | `STRIPE_BOOT_SYNC_ENABLED=false`; attach no connector |
| `STRIPE_WEBHOOK_SECRET` | No Stripe webhook is registered for staging |
| `INTAKE_TWILIO_ACCOUNT_SID`, `INTAKE_TWILIO_AUTH_TOKEN` | The intake SMS pipeline must never be reachable from staging |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | CRM Twilio credentials — no SMS or voice from staging |
| `RESEND_API_KEY` | No email may be sent from staging |
| Google Calendar credentials | No calendar access from staging |
| Production `ADMIN_PASSWORD` | Use a new staging-only secret instead |
| Production CRM credentials | No production CRM access from staging |
| Any other production provider credential | Staging is isolated by construction |
| Any phone-provider credential | No phone number is provisioned |
| Any forwarding number | No PSTN call is in scope |
| Any production session or cookie | Never copy a session into staging |

Also confirm, before the browser test:

- [ ] No phone number is imported into the staging Vapi organization.
- [ ] The SiteMint intake SMS number is **not** in the staging Vapi
      organization, and Vapi SMS management is not enabled on any number.
- [ ] No PSTN call, SMS, or email can originate from staging.
- [ ] No external webhook destination is configured.
- [ ] Recording and transcription retention are disabled
      (`VOICE_ARTIFACT_POLICY=none`).

## 3. Verify code before touching the database

```bash
pnpm run test
pnpm run typecheck
PORT=21622 BASE_PATH=/ai-receptionist/dashboard pnpm run build
```

- [ ] All commands pass.
- [ ] Review `git diff --check`.
- [ ] Review the generated voice migration and rollback SQL.

## 4. Apply the migrations to staging

This is a manual, owner-approved action requiring separate authorization that
names the environment. **Follow `lib/db/MIGRATIONS.md`** — it holds the full
runbook: how to prove `DATABASE_URL` is staging without printing it, the
baseline row counts to capture first, the read-only verification queries, the
rollback boundaries, and the stop conditions.

Order matters on a fresh isolated database. Every domain migration adds a
foreign key to `intake_firms`, and the discovery migration alters the existing
`discovery_submissions` table — all of which come from `push`:

```bash
pnpm --filter @workspace/db run push
```

```bash
pnpm --filter @workspace/db run migrate:voice
```

```bash
pnpm --filter @workspace/db run migrate:scheduling
```

```bash
pnpm --filter @workspace/db run migrate:discovery
```

- [ ] `DATABASE_URL` proven to be the staging database, and recorded, before
      anything ran.
- [ ] Baseline row counts captured before, and unchanged after.
- [ ] Migrations applied to staging only.
- [ ] `voice_assistants`, `provider_webhook_events`, and `voice_issues` exist with firm foreign keys and indexes.
- [ ] Existing `intake_*` and `crm_*` schema remains unchanged.
- [ ] No production data was copied and no customer data was seeded.

## 5. Run the real staging journey

- [ ] Sign up or sign in through `/ai-receptionist/dashboard/login`.
- [ ] Open Assistants and create one from a template.
- [ ] Save a valid name, greeting, prompt, and non-custom voice preset.
- [ ] Publish once.
- [ ] Confirm status becomes `Published` and provider becomes `Connected`.
- [ ] Start Browser Test and accept microphone permission.
- [ ] Speak at least three turns and confirm usable response latency and audio.
- [ ] End the test and confirm the UI returns to a terminal ended state.
- [ ] Reload the page and confirm the assistant remains published.
- [ ] Repeat once on a 390px-wide mobile viewport.
- [ ] Verify no browser console errors or secret/provider payload leakage.

## 6. Release decision

The browser voice launch candidate is accepted only when every staging item passes. Phone calls, appointment booking, transcripts, recordings, CRM handoff, contacts, analytics, and voice billing remain separate work and must not be described as complete.

## 6a. Clean up the staging assistant (required)

Publishing creates a real assistant inside the provider account. Nothing in the
dashboard can remove it, and the local row cannot be deleted while it carries a
provider link, so cleanup is an explicit operator step.

The command is dry-run by default and refuses to run unless
`VOICE_STAGING_CLEANUP_ENABLED=true` and `NODE_ENV` is not `production`.

### Manual provider-dashboard pre-check (required before any real deletion)

Do this in the Vapi dashboard **before** running the command with `--execute`.
It is not automated and must not be: no linked-resource API is assumed to
exist, and none may be invented to skip this step.

- [ ] Confirm the provider assistant ID, character for character, against the
      dry-run output.
- [ ] Confirm the Vapi organization / workspace the assistant belongs to is the
      staging one, not any other organization.
- [ ] Confirm **zero phone numbers** reference the assistant.
- [ ] Confirm **zero squads** reference the assistant.
- [ ] Confirm **zero workflows** reference the assistant.
- [ ] Record who performed the check, and when, alongside this checklist.
- [ ] **Stop if any link exists.** Remove the link first, or escalate — do not
      delete a linked assistant.

Vapi does not document what deleting an assistant does to a resource that
references it. Never assume deletion cascades to a phone number, squad, or
workflow, and never assume it leaves them intact either.

### Run the command

```bash
pnpm --filter @workspace/scripts run cleanup-staging-assistant -- --firm-id=<n> --assistant-id=<n>
```

`--firm-id` and `--assistant-id` must be positive decimal integers — no sign,
no leading zero, no exponent, no whitespace. A malformed identifier is refused
before the database module is loaded.

- [ ] Read the dry-run output and copy the reported provider assistant id.
- [ ] Complete the pre-check above.
- [ ] Re-run with `--confirm=<that id> --execute`.
- [ ] Confirm the command reports `CLEANED` and exits 0.
- [ ] Confirm the assistant is a draft again, then delete it normally.
- [ ] Confirm the assistant is gone from the provider account.

`CLEANED` is reported only when Vapi returned its one documented success for
this endpoint: HTTP `200` carrying a JSON assistant object whose `id` is
exactly the id that was requested. Every other response — any other 2xx, an
empty or unparseable body, a missing or mismatched id — is reported as
uncertain and changes nothing locally.

Stop rules — do not improvise past any of these:

- **UNCERTAIN**: the remote outcome is unknown. Do not re-run to "make sure", and do
  not assume deletion. Verify the resource in the provider account first.
- **UNCERTAIN with `providerErrorCode: NOT_FOUND`**: the provider answered HTTP 404.
  Vapi does not document whether that means the assistant is absent, inaccessible,
  or owned by a different organization, so **a 404 does not authorize local
  reconciliation**. Nothing was written. Stop and escalate to the owner; do not
  re-run, and do not edit the row by hand.
- **PROVIDER REFUSED**: the request was definitively rejected. Nothing was deleted
  and local state is unchanged. Resolve the cause before re-running. No
  provider-dashboard investigation is required for this outcome — the remote
  outcome is known.
- **PARTIAL**: remote deletion is confirmed but the local row was not reconciled.
  Blindly rerunning cannot repair this: the second `DELETE` would answer 404, which
  proves nothing. Verify the assistant's absence in the provider dashboard, then
  reconcile local state only under a separately authorized procedure. A stale local
  link is the safer end state; do not clear it to tidy up.
- Never use the voice rollback SQL as cleanup. Dropping the tables destroys the only
  record of the provider assistant id and orphans the remote resource permanently.

### Handling the identifiers

- `--confirm=<providerAssistantId>` is typed on the command line and will be
  retained in shell history. Treat provider assistant IDs as operationally
  sensitive identifiers: they name a real remote resource and appear nowhere in
  the dashboard.
- Clear or exclude the history entry afterwards on any shared operator machine.
- Secrets, API keys, connection strings, tokens, and session cookies must never
  appear in the command, in its arguments, or in anything pasted into a log,
  ticket, or this checklist. The command is designed to need none of them on the
  command line: `VAPI_API_KEY` and `DATABASE_URL` are read from the environment.

## Rollback

1. Set `VOICE_PUBLISH_ENABLED=false`.
2. Set all three `VITE_VOICE_*_ENABLED` flags to `false`.
3. Rebuild and redeploy the dashboard.
4. Leave the additive voice tables in place; do not run destructive rollback SQL during an incident.
5. Confirm the existing SMS receptionist still answers and handles STOP/START correctly.
