# SiteMint CRM — Milestone 3 operational handoff

Written 2026-09-11. Supersedes nothing; read alongside `CONTINUATION.md` and
`COVERAGE-MATRIX.md`.

---

## 1. Where the code is

| | |
|---|---|
| Branch | `claude/sitemint-crm-operations-124038` |
| Tip commit | `eca5ed8` |
| Pushed? | **No.** The branch exists only in this working tree. |
| Base | `b0a5f49`, with upstream `abfe8bb` merged in at `5eb4c0b` |

Milestone 3 is eight commits:

- `f918be8` — document store, document requests, share links, internal calendar,
  mailbox verification, exactly-once external delivery
- `d664dea` — the Documents and Calendar screens, plus three defects running it
  exposed
- `2c4e54d` — tests for the last-active-owner guard, which nothing had executed
- `059894f` — lead-timeline attribution, working CC/BCC, and the exactly-once
  send guard that was written but never read
- `bb85f7c` — this handoff, and coverage-matrix corrections
- `7ee42d1` — Calendar and Documents verified at 375px
- `5080d7b` — real per-person unread state for the shared customer inbox
- `eca5ed8` — communications findings folded into the handoff and matrix

Nothing has been pushed, deployed, or run against staging or production. No
email has been sent to anybody.

### Milestone 3 is NOT complete

M3 was scoped as Sales, Communications, Documents and Calendar. Two of those
four are done:

| Area | State |
|---|---|
| Documents | implemented and tested locally |
| Calendar | implemented and tested locally |
| Communications | **unfinished** — no durable conversation identity, no inbound email, no sender on SMS or calls |
| Sales | **not started** — the Contacts → Lead → Deal → Proposal → Project → Invoice chain is not closed |

Calling M3 complete because two screens work would misreport the milestone.
It is partially complete, and §4 lists what is actually in the way.

---

## 2. What is usable right now, locally

Start two processes:

```bash
DATABASE_URL=... ADMIN_PASSWORD=... CRM_PUBLIC_BASE_URL=http://localhost:22065 node artifacts/api-server/dist/index.mjs
```

```bash
MSYS_NO_PATHCONV=1 PORT=22065 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/web-agency run dev
```

Then open `http://localhost:22065/admin`.

Working end to end, verified in a browser against a live database rather than
only in tests:

- **Sign-in** — individual staff accounts, httpOnly session cookie, CSRF token,
  TOTP available per person.
- **Command Center** — every panel reads real data or says why it cannot.
- **My Day** — one person's tasks in their own timezone.
- **Operations / Projects** — projects, template tasks, progress from real task
  state.
- **Calendar** (`/admin/crm/calendar`) — create, reschedule, mark held, cancel,
  export `.ics`. Appointments, task due dates and lead follow-ups render as
  three distinct layers.
- **Documents** (`/admin/crm/documents`) — upload with versioning, per-record
  listing, download, expiring share links with a download ceiling and
  revocation, and a register of what you are still waiting on from clients.
- **Inbox / Communications** — unread counts that are real: they survive a
  reload, they are yours rather than the team's, and you can see who else has
  already opened a conversation before you reply to it.

### The acceptance scenario that was actually run

1. Signed in as an owner at `/admin`.
2. Created an appointment through the Calendar form for 15 Sep, 14:00, with an
   internal attendee and a client email, reminder 30 minutes before.
3. The reminder job appeared in `crm_scheduled_jobs` at `13:30` — thirty
   minutes before the start, not at some default.
4. The Command Center "Upcoming appointments" panel moved to `1` and named it.
5. Rescheduling moved the job with it; cancelling set the job to `cancelled`.
6. Recorded a document request against the project — "Waiting on clients"
   moved to `1` and the project picked up a badge.
7. Uploaded a PDF, then a second version of the same filename: the list showed
   `v2` with "Show 1 older version".
8. An SVG upload was refused `415`.
9. Created a share link. Downloading it with no credentials at all returned
   `200` with `Content-Disposition: attachment`, `X-Content-Type-Options:
   nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`. The
   download count went to 1. After revoking, the same link returned `404` with
   the identical message a completely bogus token gets.

---

## 3. Claidy's account

**Her account has been created through the normal invite flow, in the local
development environment only.** It exists as:

- email `claidyklaydetaguran@gmail.com`
- display name `Claidy Taguran`
- role `owner` (equal, full access, as directed)
- status `invited`
- `emailVerifiedAt` — **null**

No password was chosen for her and none was invented. No email was sent: the
local server has no `RESEND_API_KEY`, so the invite was recorded with
`delivery: "manual"` and the activation link was handed back to the operator
instead of going anywhere.

### The environment question, answered plainly

**There is no deployed environment that can host this account today.** Per the
integration owner's `2026-09-11-voice-to-crm-staging-table-contract.md`:

- the staging database has **zero `crm_staff*` tables** — the M1–M3 schema has
  never been pushed there
- `ADMIN_PASSWORD` is unset on staging, so bootstrap and break-glass recovery
  both return `503`
- no Resend variables are configured, so no invitation could be delivered

So the honest state is: the onboarding flow is built and proven, and the
account is prepared locally. It becomes her real account the moment the schema
and three config values reach a deployed environment — see §5.

### The verification rule, proven in both directions

The owner's instruction was not to mark the address verified merely because it
appeared in a prompt. That is enforced by where the flag is set, not by
convention:

| Token `delivery` | Activation result | `emailVerifiedAt` |
|---|---|---|
| `manual` (operator passed the link on) | account becomes `active` | **stays null** |
| `email` (server delivered it to the mailbox) | account becomes `active` | **set** |

Both rows were executed against the live server. The only difference between
them was the `delivery` column — which is exactly what a configured Resend
sets. An operator-relayed link proves somebody received a link; it does not
prove whose mailbox it is, so it does not confer verification.

### What Claidy will see

The invite link points at `{CRM_PUBLIC_BASE_URL}/admin/activate?kind=invite&token=…`.
That screen was loaded in a browser: it renders "Set your password", shows her
email address, and asks for a password and a confirmation. It was deliberately
**not** submitted — the password is hers to choose.

### This email is an identifier and nothing else

No Gmail inbox is connected, no OAuth is configured, this address is not a
campaign sender, and it is attached to exactly one identity. Shasta's and
Saisa's accounts are unaffected by not having addresses yet.

---

## 4. Blockers, in priority order

1. **No environment can host the real accounts.** Staging has no `crm_staff*`
   tables, no `ADMIN_PASSWORD`, no mail provider. Fixing this is a deployment
   and migration act, which under `INTEGRATION_OWNERSHIP.md` belongs to the
   integration owner, not to this session.
2. **No mail provider anywhere.** Until `RESEND_API_KEY` is set *and*
   `CRM_EMAIL_TEST_MODE` is the exact string `"false"`, every invite, reset and
   reminder email reports `delivery: "manual"` with a readable reason. Nothing
   fails silently, but nothing is delivered either — and mailbox verification
   cannot be earned, because earning it requires a real delivery.
3. **Attendee invitations are not built.** Adding someone to an appointment
   records that they are expected. The API returns `invitationsSent: false` and
   the UI says so. Do not read the attendee list as "these people were told".
4. **`.ics` is an export, not a sync.** It copies an event into another
   calendar once. Later edits here do not follow it. Two-way sync needs a
   provider integration that does not exist.
5. **No e-signature provider.** Uploaded files and accepted proposals are not
   signed documents and are never labelled as such.
6. **Files live in Postgres.** `crm_attachment_blobs` stores bytes as `bytea`,
   capped at 25 MB each. That is fine at current volume and will need an object
   store before it is not. `storage_key` already records where each blob lives
   so an adapter has somewhere to hook in.
7. **The legacy shared bearer token is still accepted.** It stays until the
   three owners have signed in on a deployed environment; see §5 step 6.
8. **SMS and call messages still record no sender.** The lead timeline is now
   attributed to the person who acted, but `crm_messages` has no sender column
   and the code that would set one lives in `routes/phone.ts`, which CLAUDE.md
   protects and which this session is only authorised to touch for the
   authentication change already made. You cannot currently tell which of the
   three of you sent a given SMS. Fixing it needs an owner instruction naming
   that file.
9. **There is no inbound email.** Nothing ingests mail. The Resend webhook
   handles delivery events for campaign sends — opened, clicked, bounced — not
   received messages. A client replying by email lands nowhere in the CRM.
10. **There is no conversation table.** Threads are assembled in memory per
    request from the latest 200 messages globally, so thread identity is
    unstable and older conversations drop off a busy list. Unread state is
    keyed on the lead, which is how that grouping already works.
11. **Two near-duplicate inbox screens.** `CrmInbox` and the Conversations tab
    of `CrmCommunications` call the same endpoints with the same polling, and
    both sit in the sidebar. Delivery-status pills and SMS retry exist in only
    one of them. Worth collapsing into one.

---

## 5. Activation runbook

Every step below is for the integration owner. Nothing here has been performed.

1. **Identify the target environment explicitly** and confirm its
   `DATABASE_URL` is the one you mean. Do not print it.

2. **Push the CRM schema.** `crm_*` tables use push mode, not versioned
   migrations:

   ```bash
   pnpm --filter @workspace/db run push
   ```

   M3 adds six tables — `crm_attachment_blobs`, `crm_document_requests`,
   `crm_document_shares`, `crm_appointments`, `crm_appointment_attendees` and
   `crm_thread_reads` — and four columns: `crm_staff.email_verified_at`,
   `crm_staff_tokens.delivery`, and `crm_scheduled_jobs.external_dispatched_at`
   / `.external_ref`. All additive. M1 and M2's `crm_staff*` and
   `crm_scheduled_jobs` tables must be pushed first if the environment has
   never had them.

   Do **not** add `tablesFilter: ["crm_*"]` to the push config. It narrows
   introspection as well as the write set, so every non-CRM table looks absent
   and push tries to re-create it — which is how a local attempt failed with
   `relation "discovery_submissions" already exists`.

3. **Set configuration:**

   | Variable | Why |
   |---|---|
   | `ADMIN_PASSWORD` | bootstrap of the first owner, and break-glass recovery. Without it both return `503`. |
   | `CRM_PUBLIC_BASE_URL` | the deployment's own address. Activation links are built from it rather than from the request host, which an attacker controls. Without it, `activationUrl` returns null and links cannot be built at all. |
   | `RESEND_API_KEY` | required for any mail |
   | `CRM_EMAIL_TEST_MODE=false` | the exact string `false`; anything else keeps mail simulated |
   | `RESEND_FROM_EMAIL` | optional; defaults to `SiteMint Digital Solutions <noreply@sitemintdigital.com>` |

4. **No separate worker to deploy.** The reminder engine starts inside the
   api-server process on a 30-second tick (`startCrmScheduler` in
   `artifacts/api-server/src/index.ts`). Jobs are rows claimed with
   `FOR UPDATE SKIP LOCKED`, so running several instances is safe. An idle tick
   is one indexed SELECT.

5. **Bootstrap the first owner**, then invite the other two from Settings.
   Each person follows the emailed link and sets their own password. Do not
   relay links by hand unless you accept that doing so forfeits mailbox
   verification — which is the behaviour, not a bug.

6. **Only after all three have signed in**, set
   `CRM_LEGACY_BEARER_ENABLED=false` to retire the shared token. Verify the
   affected screens still work first.

---

## 6. Access model as built

All three owners hold every permission, including sending campaigns, deleting
records, assigning roles and managing staff. The safeguards the owner asked to
keep are in place and tested:

- **Individual attribution.** `crm_admin_audit_log` records actor (id and
  email), action, target and IP for every staff and security action. Sample
  rows read back from a live server look like
  `staff:129 shasta@… -> staff.invited | staff:130 role:owner delivery:manual`.
- **Confirmation before destructive actions.** Cancelling an appointment and
  deleting a document both confirm first and say what will happen.
- **The last active owner cannot be removed.** Disabling or demoting them is
  refused; re-enabling is still allowed, so the guard cannot block recovery
  from the lockout it prevents.
- **New accounts get nothing automatically.** A staff row is `invited` and
  holds *no* permissions at all until it is active.
- **Owner-only powers are role-bound, not grantable.** `staff.role.assign`,
  `staff.disable`, `billing.manage` and the three hard record deletes cannot be
  side-loaded onto another role through `extraPermissions`.
- **`documents.delete` is new in M3.** Removing a client's file is a different
  act from filing one, and an operations manager is documented as holding no
  destructive deletes. Owners hold it; it can be granted to one person without
  making them an owner.

---

## 7. What Milestone 3 did not finish

Sales and Communications hardening (§3 of the M3 brief) has not been done.
Beyond that, still unbuilt: support tickets and knowledge base, campaign
segmentation and the visual email designer, AI drafting, campaign scheduling
and suppression, triggered workflows, unified interaction history, reporting,
the mobile surfaces, third-party integrations, and the customer portal.

`COVERAGE-MATRIX.md` tracks all eighteen areas.
