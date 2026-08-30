# Active SiteMint Delivery

**Only active delivery:** `AR-001 — AI Receptionist Browser Voice Launch Candidate`

**Current implementation branch:** `redesign/frontend-v2` (Windows worktree).

**Linux `master`** — the `/opt/sitemint-v2-p*` candidate — is a **local
validation candidate only**. It is where typecheck, tests and the build matrix
run, because the workspace prunes the Windows esbuild/rollup binaries. It is
not a release source and not a deployment target.

**Historical / superseded branch references:** `claude/milestone-1-f2b-readiness-kvbe27`
(canonical starting point) and `feature/ai-receptionist-today-mvp` (working branch).
Neither exists in the current worktrees or their local remote-tracking refs. They are
retained here as historical references and treated as superseded by
`redesign/frontend-v2` unless later proven otherwise against the remote.

**Nothing has been pushed.** No branch in either worktree has been pushed,
merged, or proposed as a PR, and no Git push is authorized. Replit publishes a
reviewed filesystem snapshot rather than a Git ref, so an owner-approved
staging transfer uses a **reviewed source archive**, never a push.

**Exit requirement:** A staging user can sign in, create and save an assistant, publish it to Vapi exactly once, complete a browser microphone call, and see accurate status/error handling. Typecheck, tests, builds, protected-file checks, and the launch checklist must pass.

The following are explicitly not active today:

- Inbound phone-number calling
- Appointment-calendar tools
- End-of-call transcript or recording ingestion
- CRM contact handoff
- Usage billing
- Contacts and analytics expansion
- Public production launch

## Status

AR-001 remains **active and unexecuted**. It is not accepted.

- **AR-001A — completed.** Provider-safe test infrastructure: a browser voice-client
  fake and a publish-service harness driving the real `publishAssistant()` through
  deterministic fakes. Test-only; zero production files changed.
- **AR-001B — staging execution blocked.** The readiness audit found no evidenced
  isolated staging environment and no verified provider-resource cleanup path.
- **AR-001C — completed.** A guarded operator-only staging cleanup command
  (`pnpm --filter @workspace/scripts run cleanup-staging-assistant`), dry-run by
  default, plus corrections to this file, `LAUNCH_CHECKLIST.md` and `CLAUDE.md`.
- **AR-001D — completed as a read-only contract audit, and it required correction.**
  It executed nothing and changed nothing. It found the AR-001C cleanup command not
  yet safe for controlled staging validation: a Vapi DELETE 404 was treated as proof
  of absence and cleared the local provider link; only the documented `200` success
  shape was unvalidated; `400`/`422` were not mapped to a definitive rejection; the
  request deadline stopped at the response headers and did not cover the body read;
  and CLI identifiers used permissive numeric coercion.
- **AR-001E — completed.** The cleanup-hardening correction for those findings. A
  404 is now classified as uncertain and performs zero local writes; the
  `already_absent` success shape is removed and unrepresentable; deletion is
  definitive only on HTTP `200` with a JSON assistant object whose `id` exactly
  matches the requested id; every other 2xx is uncertain; `400`/`422` map to
  `VALIDATION_FAILED`; the timeout covers dispatch, headers, body read and parse;
  and CLI identifiers require strict positive base-10 integers, rejected before any
  database or provider module is loaded. No acknowledgement flag was added, and none
  may be: operator acknowledgement cannot convert undocumented provider behavior
  into proof. Partial success (remote deleted, local reconcile failed) now stops and
  requires manual dashboard verification plus a separately authorized reconciliation
  procedure, instead of advising a blind rerun.

- **AR-001F — completed as an owner decision record.** It provisioned nothing.
  The approved staging shape is recorded under "Approved staging decisions"
  below.
- **AR-001G — completed as pre-staging security hardening.** Source, tests and
  documentation only; it provisioned nothing and executed no staging. Four
  corrections landed: a credentialed CORS allowlist replacing
  `cors({ origin: true, credentials: true })`; fail-closed admin
  authentication with the hardcoded password fallback removed; opt-in Stripe
  boot synchronization behind `STRIPE_BOOT_SYNC_ENABLED`, defaulting off; and
  an explicit server-owned `VOICE_ARTIFACT_POLICY`, with `none` disabling
  provider recording and transcript retention. Plus the migration runbook
  (`lib/db/MIGRATIONS.md`), a `migrate:discovery` script for the already
  committed discovery migration, and the branch/staging documentation
  corrections. No provisioning, no provider request, no database connection,
  no Stripe request, no media activity, and no push or deployment.

## Approved staging decisions (AR-001F)

Recorded and preserved. **None of these has been provisioned.** Each still
requires a separate prompt and explicit confirmation before any real
provider activity.

- Separate Replit staging App and deployment.
- Separate Replit-managed PostgreSQL staging database.
- Separate Vapi organization and keys.
- Default `*.replit.app` staging hostname; no custom domain and no DNS change.
- Reviewed archive transfer; **no Git push**.
- No Stripe connector.
- No Twilio, Resend, Google, CRM, calendar, or production secrets.
- No phone number, no PSTN call, no SMS, no email, no external webhooks.
- Recording and transcription retention disabled for the disposable staging
  browser test (`VOICE_ARTIFACT_POLICY=none`).
- Staging destroyed after provider and local cleanup are confirmed.
- Claidy: technical operator, cleanup operator, incident owner.
  Shasta: owner approver and live publish observer.
- Reported minimal usage cost accepted, subject to account-plan verification.

**Real Vapi behavior remains unverified.** Every AR-001E assertion is made against
local fetch stubs. Nothing in this correction contacted `api.vapi.ai`, used a
provider credential, or touched a database, and the cleanup command has still never
been run against a real provider. AR-001G is likewise entirely offline: its
artifact-policy payload is asserted against the official Vapi types installed
in this workspace and a local fetch stub, never against `api.vapi.ai`.

**No staging execution is authorized.** Before AR-001 staging UAT may begin, three
prerequisites remain: an isolated staging environment with its own database and
provider account, evidenced by the owner; explicit owner authorization for real
provider activity; and isolated staging evidence of what a Vapi DELETE 404 actually
means for a same-organization versus a cross-organization assistant, since the
cleanup command deliberately refuses to reconcile without it.

AR-001G narrowed the configuration risk in that environment but did not remove
any of those three prerequisites, and did not create the environment. The
staging secret-name profile — what must be set and what must be absent — is in
`docs/ai-receptionist/LAUNCH_CHECKLIST.md` §2, §2a.

No additional phase or release may begin until AR-001 is either accepted or explicitly cancelled.
