# SiteMint CRM — release package for the integration owner

Prepared 2026-09-11. Everything here is reversible preparation. **Nothing has
been pushed, deployed, or run against staging or production, and no email or
SMS has been sent to anybody.**

This document is written for the integration owner, who under
`docs/ai-receptionist/INTEGRATION_OWNERSHIP.md` is the only session that
deploys to shared environments or runs migrations anywhere.

---

## 1. The candidate

| | |
|---|---|
| Branch | `claude/sitemint-crm-operations-124038` |
| Candidate commit | `51e5baf` |
| Pushed? | **No.** The branch exists only in the CRM session's worktree. |
| Base | `b0a5f49`, with receptionist `abfe8bb` merged at `5eb4c0b` |
| Contains `main`? | Yes — `main` (`57ea6c8`) is an ancestor. |

### Integration dependencies

- **No dependency on the voice branch.** `feature/ai-receptionist-private-beta-readiness`
  (`6adf786`, `46864d8`) adds no tables and is not required by anything here.
  Merge order between the two is free.
- **Shared files touched**, which under the ownership contract are the
  integration owner's to merge:
  - `lib/db/src/schema/*.ts` — five new schema modules, one edited
  - `lib/db/src/schema/index.ts` — barrel exports
  - `artifacts/api-server/src/routes/index.ts` — two router registrations
  - `lib/db/migrateFreshStateContract.test.ts` — table-count pins
  - **`artifacts/api-server/src/app.ts` is NOT touched.** The inbound webhook
    lives under the existing `/api/crm/webhooks/resend` raw-body mount, which
    is a prefix mount and already covers it.
- **Protected files:** `phone.ts` is modified under the owner's explicit
  written authorization of 2026-09-11 (sender attribution). Every other
  protected file in CLAUDE.md has a zero-line diff — verified, not assumed.

---

## 2. Target environment

**This release targets one environment and it must be named before anything
runs.** The CRM session cannot choose it and has never connected to one.

What is known about the candidate target (SiteMint-Voice-Staging), from the
integration owner's own `2026-09-11-voice-to-crm-staging-table-contract.md`:

- 57 public base tables, 20 of them `voice_*`
- **zero `crm_staff*` tables** — the M1–M3 CRM schema has never been applied
- `ADMIN_PASSWORD` unset → bootstrap and break-glass recovery both 503
- no Resend variables → no mail can be sent or received

So this is a first application of the CRM schema, not an upgrade of an
existing one. Confirm the `DATABASE_URL` in use is the one intended before
step 4. Do not print it.

---

## 3. Reviewed schema diff

The CRM owns **41 `crm_*` tables** after this release. Of those, M1–M3 on this
branch add the following; everything else already exists in environments that
have ever had the CRM.

### 3a. Tables added by M1 (staff identity)

`crm_staff`, `crm_staff_sessions`, `crm_staff_tokens`,
`crm_staff_login_attempts`

### 3b. Tables added by M2 (operations and reminders)

`crm_scheduled_jobs`, `crm_notifications`, `crm_comments`, `crm_approvals`,
`crm_project_milestones`, `crm_project_updates`, `crm_project_templates`

### 3c. Tables added by M3

| File | Adds |
|---|---|
| *(documents/calendar — pushed with the rest of M3)* | `crm_attachment_blobs`, `crm_document_requests`, `crm_document_shares`, `crm_appointments`, `crm_appointment_attendees` |
| `schema/M3-conversations.sql` | `crm_conversations`, `crm_conversation_participants`, `crm_message_drafts`, `crm_conversation_reads` + 6 columns on `crm_messages` |
| `schema/M3-inbound-email.sql` | `crm_inbound_email_events`, `crm_email_suppressions`, `crm_unmatched_emails`, `crm_email_send_counters` + 2 columns on `crm_conversations` |

### 3d. Columns added to existing tables

| Table | Columns | Note |
|---|---|---|
| `crm_messages` | `conversation_id`, `sent_by_staff_id`, `sent_by_label`, `origin`, `subject`, `provider_message_id` | all nullable, no defaults, no backfill in DDL |
| `crm_staff` | `email_verified_at` | M3 |
| `crm_staff_tokens` | `delivery` | M3, defaults `'manual'` |
| `crm_scheduled_jobs` | `external_dispatched_at`, `external_ref` | M3 |
| `crm_conversations` | `reply_token`, `reference_chain` | M3 inbound email |

### 3e. What the diff does NOT do

- No existing column is altered, renamed, retyped or dropped.
- No `voice_*`, `intake_*`, `discovery_*`, `scheduling_*`, `helpdesk_*` or
  `stripe.*` object is referenced by any statement.
- No foreign keys are added. The existing `crm_*` tables do not use them
  (`crm_messages.lead_id` is already a bare integer), and adding FK enforcement
  now would fail against historical rows whose referent was since deleted.
- No data is deleted. `DROP TABLE IF EXISTS crm_thread_reads` is the single
  drop, and it targets a table introduced and superseded within this same
  unpushed branch — it has never existed in a deployed environment.

### 3f. Do not use `drizzle-kit push` for this

Two reasons, both found the hard way:

1. Push wanted an interactive prompt (it asks whether a table is a rename) and
   cannot prompt in a non-interactive shell. Answering that prompt unseen is
   exactly the risk this package exists to remove.
2. `tablesFilter: ["crm_*"]` narrows **introspection** as well as the write
   set, so every non-CRM table looks absent and push tries to re-create it. A
   local attempt failed with `relation "discovery_submissions" already exists`.

Apply the reviewed `.sql` files instead. They are idempotent and transactional.

---

## 4. Backup and restore verification

`lib/db` already ships both tools. Run them in this order and keep the output.

```bash
pnpm --filter @workspace/db run backup
```

```bash
pnpm --filter @workspace/db run restore:drill
```

The drill is the part that matters: a backup nobody has restored is a
hypothesis. Do not proceed past step 5 until a restore has actually been
demonstrated against this environment's dump, and record the timestamp of the
dump you proved.

---

## 5. Application order

1. Confirm the target `DATABASE_URL`. Do not print it.
2. Take the backup and run the restore drill (§4).
3. Apply M1 + M2 + M3 documents/calendar schema. If the environment has never
   had the CRM, this is the whole `crm_*` set.
4. Apply `docs/crm-ops/schema/M3-conversations.sql`.
5. Apply `docs/crm-ops/schema/M3-inbound-email.sql` — **after** step 4, which
   creates `crm_conversations`.
6. Deploy the application at `51e5baf`.
7. Run the conversation backfill: `POST /api/crm/inbox/backfill` as an owner.
   It is idempotent, resumable, and reports `scanned / linked / quarantined`.
   A non-zero `quarantined` is not a failure — it is history that named
   neither a contact nor a counterparty, preserved for review rather than
   guessed.
8. Bootstrap the first owner, then invite the others (§8).

### Rollback and compatibility

- **Roll back code before schema.** The inbox routes select the new columns;
  schema-first rollback breaks a running deployment.
- Each `.sql` file carries its own rollback block at the foot.
- The schema is forward-compatible with the *old* code: every addition is
  nullable and unreferenced by pre-M3 code paths, so `51e5baf`'s schema running
  under the previous application is safe. The reverse is not true.
- **One-way door:** rolling back `M3-inbound-email.sql` discards received mail
  stored there and nowhere else. Resend retains inbound content for only 30
  days, so past that window it cannot be re-fetched. Export
  `crm_unmatched_emails` and the email-channel rows of `crm_messages` first.

---

## 6. Configuration

Names only. No values appear in this repository or this document.

### Required for the CRM to function

| Variable | Why | Failure if absent |
|---|---|---|
| `DATABASE_URL` | the database | server does not start |
| `ADMIN_PASSWORD` | bootstrap of the first owner, and break-glass recovery | both return 503; there is no fallback and none may be added |
| `CORS_ALLOWED_ORIGINS` | required in production | startup fails before the port opens |
| `CRM_PUBLIC_BASE_URL` | activation and reset links are built from it, never from the request host (which an attacker controls) | links cannot be built at all; invitations are unusable |

### Required for outbound mail

| Variable | Note |
|---|---|
| `RESEND_API_KEY` | without it, every invite/reset/reminder reports `delivery: "manual"` with a readable reason |
| `CRM_EMAIL_TEST_MODE` | must be the **exact string** `false`. Anything else keeps mail simulated |
| `RESEND_FROM_EMAIL` | optional; defaults to `SiteMint Digital Solutions <noreply@sitemintdigital.com>` |

### Required for inbound mail

| Variable | Note |
|---|---|
| `CRM_INBOUND_EMAIL_DOMAIN` | the reply subdomain, e.g. `reply.sitemintdigital.com` |
| `RESEND_INBOUND_WEBHOOK_SECRET` | falls back to `RESEND_WEBHOOK_SECRET`. See the trap below |
| `RESEND_WEBHOOK_SECRET` | already used by the delivery-event webhook |

**The signing-secret trap.** A Resend signing secret is per *endpoint*. If you
add a new webhook endpoint for `email.received`, it gets its **own** secret and
the existing `RESEND_WEBHOOK_SECRET` will not verify it. Either subscribe
`email.received` on the existing endpoint and reuse the secret, or set
`RESEND_INBOUND_WEBHOOK_SECRET`. Decide deliberately; a mismatch shows up as
every inbound message failing signature verification with a 400.

### Retiring the legacy shared token

`CRM_LEGACY_BEARER_ENABLED=false` retires it. **Only after all three owners
have signed in on the deployed environment** — setting it earlier locks
everyone out.

---

## 7. Sender and domain requirements

### Outbound

The sending domain must already be verified in Resend with its DKIM records
published. This is presumably done, since outbound already works in other
environments — confirm rather than assume.

### Inbound — this needs a DNS change and it is the one hard external blocker

**Inbound MX is exclusive.** Resend's own documentation is explicit: if its MX
record is not the lowest-priority record on the domain, inbound does not work;
and pointing it at the apex *"will route all emails destined to
`<anything>@example.com` to Resend, instead of your previous provider."* Two
providers cannot share one domain's inbound — equal MX priorities do not split
delivery, they just pick one server.

**Therefore: use a dedicated subdomain.** `reply.sitemintdigital.com`. This
leaves company mail on the apex completely untouched.

Exact steps:

1. In Resend, verify `reply.sitemintdigital.com` as a domain.
2. Copy the MX record Resend shows for it. **The value is per-domain and is
   only shown in the dashboard** — Resend deliberately does not publish static
   values, so it cannot be pre-filled here.
3. Publish that MX on `reply.sitemintdigital.com`. Do not touch the apex MX.
4. Add a webhook subscribed to `email.received` pointing at
   `https://<deployment>/api/crm/webhooks/resend/inbound`.
5. Set `CRM_INBOUND_EMAIL_DOMAIN=reply.sitemintdigital.com`.

**This is the exact remaining external action.** The code, tests,
configuration surface and verification procedure are complete and committed;
what is missing is a DNS record and a dashboard subscription, neither of which
this session can or should perform.

Until it is done, `GET /api/crm/email/inbound/status` reports
`configured: false` and names the missing variable, and the webhook route
answers 503 — a stated state, not a silent drop.

### A security note worth carrying into the decision

Resend's inbound API exposes **no SPF, DKIM or spam verdict**. The `from`
address on received mail is an unauthenticated claim. The CRM therefore
correlates replies primarily on an unguessable token in the recipient address
(`c-<token>@reply…`), which cannot be forged without knowing it, and records
`senderAuthenticated: false` on every inbound message so nothing downstream
mistakes the header for an identity. Do not add a feature that trusts `from`.

---

## 8. Accounts

### Claidy Taguran — `claidyklaydetaguran@gmail.com` — Owner/Super Admin

**Status of the local invitation: it no longer exists.** The automated test
suites truncate the shared test database, and they have run many times since
the account was created. That is expected and is not a loss — nothing about it
was durable or meant to be. The account must be created fresh in the target
environment.

Create it there through the normal flow:

1. Bootstrap the first owner account using `ADMIN_PASSWORD`.
2. From Settings, invite `claidyklaydetaguran@gmail.com` as **owner**.
3. She follows the emailed link and chooses her own password.

**Do not** copy any development password, session cookie or activation token
into the target environment. None of them is valid there and treating one as
if it were would defeat the point of the flow.

### Mailbox verification

`crm_staff.email_verified_at` is set **only** when the person followed a link
the server itself delivered to that mailbox. This is enforced by
`crm_staff_tokens.delivery`, which is `"email"` only on a real send.

A consequence worth stating plainly, because it is a deliberate trade:
when mail is not configured, the API hands the activation token back to the
operator so the account can still be set up — and an account activated that way
becomes `active` with `email_verified_at` still null. Relaying a link by hand
proves somebody received a link, not whose mailbox it is. **If you want
verified mailboxes, configure Resend before inviting anyone.**

The token is returned to the operator *only* when nothing was emailed
(`delivery: "manual"`). When a send succeeds, the response omits the token
entirely, so an emailed token is never also exposed through the API — which
would have made mailbox control unprovable.

### Shasta and Saisa

Their accounts are created the same way once their addresses are available.
Not having them does not block anything else.

### Ongoing release requirements to track

- MFA enrolment for all three owners (TOTP is built; enrolment is per person)
- Account recovery rehearsal — break-glass via `ADMIN_PASSWORD` should be
  exercised once, deliberately, before it is needed
- Legacy shared-token retirement (§6)
- All three owners must receive any new permission as features are added;
  the role defaults stay restrictive for future staff

---

## 9. Worker behaviour and health

**There is no separate worker to deploy.** Two loops run inside the api-server
process:

| Loop | Interval | Source |
|---|---|---|
| CRM reminder engine | 30s | `startCrmScheduler` in `src/index.ts` |
| Signup pipeline | 15s | `startSignupJobWorker` |

Jobs are rows claimed with `FOR UPDATE SKIP LOCKED`, so running several
instances is safe. An idle tick is one indexed SELECT.

### The hosting question, which must be answered before relying on reminders

**An in-process scheduler only runs while a process is running.** If the target
deployment sleeps, scales to zero, or is a request-driven autoscale
deployment, reminders do not fire while nothing is serving traffic — they fire
late, in a burst, when something next wakes the process. Nothing in the code
can compensate for that.

Before treating reminders as reliable, establish which of these the target is:

- **Always-on process** → nothing to do; the in-process scheduler is correct.
- **Scales to zero / sleeps** → the scheduler needs an external heartbeat
  (a scheduled HTTP ping frequent enough to keep a process alive) or the
  reminder loop must move to a platform scheduler that invokes
  `POST /api/crm/operations/jobs/run`. That route already exists and is
  permission-gated, so this is a configuration choice rather than new code.

Note the existing memory on this: the `.replit` run-line environment is inert
for Autoscale deployments — only Secrets reach them. Verify the deployment
type, do not infer it.

### Health checks

- `GET /api/readyz` — process liveness only. It says nothing about whether the
  scheduler is claiming jobs.
- `GET /api/crm/operations/jobs` — pending, running and permanently-failed
  counts. This is the one that shows whether reminders are actually moving.
- `GET /api/crm/email/inbound/status` — inbound configuration, failed-fetch
  count, unmatched-waiting count.
- `GET /api/crm/email/inbound/failures` — inbound messages whose content fetch
  failed and can still be retried inside the provider's 30-day window.

A liveness probe proving a worker is alive is not the same as proving it
claims work. The documented way to prove the latter is to plant a stale
`processing` row and watch it get reclaimed.

---

## 10. Deployment smoke tests

Run in order, against the deployed environment, as a real signed-in owner.

1. `GET /api/readyz` → 200.
2. Sign in at `/admin` as the bootstrapped owner. Session cookie set, CSRF
   token returned.
3. `GET /api/crm/command-center` → every panel either has real data or states
   why it is unavailable. No panel should report 0 where it means "unknown".
4. `GET /api/crm/inbox/conversations?limit=5` → 200, and `readStateAvailable`
   is `true` (it is `false` on the legacy shared token).
5. `POST /api/crm/inbox/backfill` → `scanned`/`linked`/`quarantined` reported.
   Re-run it; the second run must report `scanned: 0`.
6. Create an appointment 30 minutes out with a reminder. Confirm a row appears
   in `crm_scheduled_jobs` at the right instant, then cancel it and confirm the
   job moves to `cancelled`.
7. Upload a document to a project, download it back, and confirm the response
   carries `Content-Disposition: attachment` and `X-Content-Type-Options:
   nosniff`.
8. Create a share link, fetch it with no credentials, confirm the download
   count increments, revoke it, and confirm the same link then 404s with the
   same message a bogus token gets.
9. `GET /api/crm/email/inbound/status` → `configured: true` once §7 is done.
10. Send a test email to a mailbox you control, reply to it, and confirm the
    reply appears on the conversation within a minute. This is the one that
    proves two-way email end to end.
11. Confirm the three owners produce three distinct `sent_by_staff_id` values
    on outbound messages, and that `crm_admin_audit_log` names each of them.

### What must NOT be done during smoke testing

No campaign, SMS or call may be sent to a real customer. Use mailboxes and
numbers you control. `CRM_EMAIL_TEST_MODE` should stay at its default until
step 10 is deliberately reached.
