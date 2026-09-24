# AI Receptionist — production promotion plan (prepared 2026-09-11)

Prepared, not executed. The owner authorised promotion "once the relevant
operational checks pass"; the gating check — a real two-way conversation and a
completed account journey — has not passed yet. Nothing in this document has
been run against production.

## 1. Verified production inventory (read-only probes, no writes)

Production is the **SiteMint-Digital** Replit App serving `sitemintdigital.com`
(marketing + internal CRM + api-server). Measured 2026-09-11:

| Surface | Production today | Staging (verified working) |
|---|---|---|
| Marketing bundle | `index-Ddshz1FS.js` | `index-Cgvd7HzO.js` |
| Dashboard bundle | `index-DLS6lKjV.js` — 1,000,498 B, single bundle | `index-tmcjg74D.js` — 368,008 B + 72 split chunks |
| `/api/healthz` | `200` | `200` |
| `/api/readyz` | **`404` — route does not exist** | `200 {"status":"ready"}` |
| `POST /api/receptionist/auth/invite-signup` | **`404` — route does not exist** | `503` (route present, flag-gated) |
| Dashboard `verify-email` page | absent from bundle | present (`VerifyEmail-uJbP0L_f.js`) |
| Dashboard `password-reset` page | absent from bundle | present |

The production backend therefore predates the boot-readiness gate, the
invite-signup route, the account-security routes, and the signup pipeline. It is
a larger gap than a single feature promotion.

## 2. The one ordering constraint that must not be broken

Production's marketing build still advertises **"Client Sign In"** and
**"Request Private Beta"**; it does **not** contain the "Create Account" CTA.
That is currently the safe state, because production has no invite-signup route
to receive a signup.

Promoting the marketing build on its own would publish a "Create Account"
call-to-action that resolves to a form whose submit returns `404` in
production — exactly the "link to an unfinished account journey" the owner
prohibited.

**So the promotion is atomic: backend + database + dashboard + marketing +
configuration ship together, or none of them do.**

`/ai-receptionist/signup` is already reachable by direct URL in production and
renders a form that cannot succeed. It is unlinked from navigation, so no
customer path reaches it, but it should be gated or removed as part of this
promotion rather than left as a latent dead end.

## 3. Change set

**Database** — the SiteMint-Digital production database, which is a *different*
database from the staging deployment's `neondb`. Nothing about the staging
migration implies these are present.
1. Identify the target database without printing its URL; confirm it is the
   live SiteMint production database and take a `pg_dump` backup first.
2. Verify every already-applied voice migration's file hash against
   `drizzle.__drizzle_migrations_voice` **before** applying anything. Abort on
   any drift (an applied migration's bytes must never be rewritten — a
   `git checkout` that normalises line endings is enough to lock the runner
   out).
3. Apply only the missing versioned migrations through the guarded runner.
   Never `push`, never copy a database over another.
4. Re-verify: journal row count, last hash equals the file's sha256, the new
   tables exist, and the pre-existing firm / assistant / lead counts are
   **unchanged**.

**Backend** — deploy the api-server at the promoted commit. This adds
`/api/readyz`, the account-security routes, the invite-signup route, and the
signup-pipeline worker. Preserve: Discovery routes, the CRM admin routes, the
Twilio webhooks on the intake SMS number, and every other existing API consumer.

**Dashboard** — deploy `index-tmcjg74D.js` equivalent, built at the promoted
commit with the three `VITE_VOICE_*_ENABLED` flags set deliberately.

**Marketing** — deploy the nav change (Create Account) **only in the same
release** as the backend above.

**Configuration (Secrets)** — set before the release is announced:
`VOICE_ALERTS_ENABLED=true`, `RESEND_API_KEY`, `VOICE_ALERTS_FROM`,
`VOICE_ALERTS_TO`, `INVITE_SIGNUP_ENABLED=true`,
`PASSWORD_RESET_REQUESTS_ENABLED=true`. Leave
`PUBLIC_REGISTRATION_ENABLED` **unset** — the shipped signup page is
invite-gated and never calls the open-registration route.

## 4. Stays inactive and accurately labelled

Telephone calling, call forwarding, transfer/handoff, billing activation,
phone-number purchases, and any provider integration not verified by a real
call remain off. Browser calling does not establish inbound telephone
readiness and must not be described as if it did. `VOICE_ARTIFACT_POLICY`
stays `none`; the existing recording/transcript policy and the legal/indexing
settings are unchanged by this release.

## 5. Rollback

- **Database:** the pre-migration `pg_dump`, plus the committed rollback SQL for
  each voice migration (`lib/db/drizzle/voice-rollback/*.sql`). The migrations
  are additive, so rollback is dropping the new tables, not restoring rows.
- **Backend / dashboard / marketing:** Replit keeps prior deployment versions;
  redeploy the previous build. The current production identifiers to roll back
  *to* are recorded in §1 above — marketing `index-Ddshz1FS.js`, dashboard
  `index-DLS6lKjV.js`.
- **Configuration:** every capability added here is a single fail-closed flag.
  Unsetting `INVITE_SIGNUP_ENABLED` closes signup instantly without a redeploy;
  unsetting `VOICE_ALERTS_ENABLED` stops all outbound account email.
