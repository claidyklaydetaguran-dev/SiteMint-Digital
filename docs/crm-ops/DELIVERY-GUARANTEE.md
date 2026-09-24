# Reminder email delivery — what is actually guaranteed

Rewritten 2026-09-12 for M4. Authoritative for reminder delivery.
Supersedes every earlier claim about "exactly-once" reminder email, including
the wording in `M3-OPERATIONAL-HANDOFF.md` and the 2026-09-11 version of this
file.

Two things were wrong before, and both are worth naming because the shape of
the mistake keeps recurring.

**First**, the original code wrote `crm_scheduled_jobs.external_dispatched_at`
*before* calling the mail provider and treated that marker as proof of
delivery. A marker written before a request proves only that a request was
started, so a 500, a dropped connection or a timeout left the marker behind and
every future attempt returned early. The reminder was **silently lost forever**,
and nothing anywhere recorded that it had been. Preventing duplicates had
created silent message loss — the worse failure, because a duplicate is a mild
annoyance somebody can see and a missing message is invisible to everybody,
including the person who needed it.

**Second**, the fix for that packed one delivery record per (occurrence,
recipient) into `external_ref` as newline-separated text. The state machine was
right; the storage was not. Every question worth asking became a substring
match, every write became a read-modify-write of one column, and the column had
to be capped — so unresolved history could be **discarded to make room**. A
record nobody can find is a record that was lost.

Delivery state now lives in `crm_reminder_deliveries`, one row per (occurrence,
recipient), with no cap.

---

## 1. What is guaranteed

**In one paragraph.** For each occurrence of each reminder and each recipient of
it, the CRM causes at most one message unless a person deliberately asks for a
second copy, and records the outcome as one of five facts: nothing handed over,
an attempt in flight, accepted, refused, or unknown. Only a recorded
*acceptance* — or a person's explicit closure — stops a later attempt. A failure
that **proves** nothing reached the provider is retried automatically, because
such a retry cannot duplicate. An outcome we could not observe is **never**
retried automatically and is left visible to an operator until somebody decides.
This is **at-most-once automatic delivery with visible ambiguity**. It is *not*
exactly-once, it is not at-least-once, and no part of it should be described as
either.

| | |
|---|---|
| **Guaranteed** | A recipient never receives two copies of one occurrence because of a worker crash, an expired lease, two workers running at once, or a retry the system performs by itself. |
| **Guaranteed** | An occurrence is never silently suppressed by a failure. Every non-accepted outcome is a row, and every row is reachable through the operator list (§5) — page by page, with no cap. |
| **Guaranteed** | Every recipient of a reminder that emails several people is tracked separately. One attendee's outcome never decides another's. |
| **Guaranteed** | A recurring reminder's later occurrences are never suppressed by an earlier occurrence's record. `occurrence_at` is part of the record's identity. |
| **Guaranteed** | A retry never changes the occurrence. The occurrence is the idempotency identity; moving it would silently create an unprotected duplicate. |
| **Guaranteed** | `POST .../deliveries/:id/retry` cannot produce a second copy. It re-uses the original idempotency key, and it is **withdrawn** in the one case where that would stop being true (§4). |
| **Guaranteed** | One in-app notification per occurrence and person, enforced by a unique index rather than by whichever caller remembers. |
| **NOT guaranteed** | That every reminder is delivered. A refusal, an exhausted retry and an unknown outcome all end with no certainty of arrival. All three leave a visible row and no further automatic attempt. |
| **NOT guaranteed** | That an `uncertain` row was not delivered. It may have been. Nobody knows, including us. |
| **NOT guaranteed** | That a **person's** re-send cannot duplicate. It carries a new key precisely so it is not collapsed — that is what makes it a second copy. It says so before it will run. |
| **NOT guaranteed** | Exactly-once. It is not achievable against an API that cannot be asked "did you already take this?" and does not remember keys for longer than a day. |

---

## 2. Where the state lives

`crm_reminder_deliveries`, one row per (occurrence, recipient), UNIQUE on
`(job_id, occurrence_at, recipient_staff_id, recipient_address)` — created with
`NULLS NOT DISTINCT`, which is load-bearing rather than a nicety: every staff
row has a NULL `recipient_address`, and under PostgreSQL's default the
constraint would never fire on exactly the rows it exists to protect. Schema in
`lib/db/src/schema/crmDeliveries.ts`; DDL in `docs/crm-ops/schema/M4-deliveries.sql`.

The identity rule everything hangs off:

> **`occurrence_at` is the job's original `run_at` and never changes.**
> `next_attempt_at` is the separate, movable thing. A retry moves only the
> second one.

The five states, and whether a machine will act on each:

| State | Meaning | Retried automatically? |
|---|---|---|
| `pending` | Nothing is in flight and the provider demonstrably holds nothing. Either nothing has been attempted yet, or an attempt provably never reached it. | Only if `next_attempt_at` is set. Null means "waiting for a person". |
| `attempting` | A request is in flight, or the worker that started it was lost. | No. After five minutes another worker promotes it to `uncertain`. |
| `accepted` | The provider took the message and (usually) returned an id. **The only machine-written state that stops further sending.** | No. |
| `refused` | The provider looked at the message and said no — bad address, unverified domain, a key without permission. Deterministic; nothing was delivered. | No. Fix the cause, then retry by hand. |
| `uncertain` | Bytes went out and we never learned the answer. It may or may not have arrived. | **Never.** This is the state a person has to resolve. |

`next_attempt_at IS NULL OR state = 'pending'` is a check constraint, so "an
automatic attempt is scheduled" can only ever be true of a row a worker may
actually claim. Closing a case clears it.

`resolved_at` / `resolution` / `resolved_by_staff_id` / `resolution_note` record
a **person's** closure — `acknowledged`, `resent` or `accepted` — and are written
as one fact (a check constraint keeps the timestamp and the word together).

`crm_scheduled_jobs.external_dispatched_at` and `external_ref` are **history
only**. Nothing writes them any more. They are deliberately not cleared (§7).

`crm_scheduled_jobs.last_error` still carries a `delivery <state>: <reason>`
copy of the most recent non-accepted outcome, so it surfaces where operators
already look. It is a convenience, not the record.

---

## 3. Classifying an outcome — the exact mapping

This is the most consequential judgement in the whole path. Read an unknown
outcome as "not sent" and you duplicate somebody's mail; read a real failure as
"sent" and you lose it silently.

`staffMail.ts` collapses a send into four `MailFailure` classes, and its
`failed` class lumps together two things that must not be confused:

* a connection that **never opened** — the request was never written to a
  socket, so no message can exist anywhere; and
* a **5xx or rate-limit answer** — which means the request *was* written, the
  provider received it, and only then something went wrong on its side.

**A 5xx does not prove that no side effect occurred.** The provider may have
taken the message and failed to answer about it. So `classifyDeliveryOutcome()`
in `crmScheduler.ts` re-reads the outcome and is deliberately more conservative
than the layer beneath it:

| Outcome from `trySendStaffMail` | Delivery state | Automatic retry |
|---|---|---|
| `sent` | `accepted` | — |
| `not_configured` (returned before any request is built) | `pending` | yes |
| `rejected` — the provider answered "no" | `refused` | no |
| `failed`, and the reason names a transport code that rules the request out | `pending` | yes |
| `failed`, anything else — a 5xx, a rate limit | `uncertain` | **no** |
| `uncertain` — timeout, socket hang up, 409 `concurrent_idempotent_requests` | `uncertain` | no |

The codes that count as "provably not sent" are `ECONNREFUSED`, `ENOTFOUND`,
`EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`, `ERR_INVALID_URL` and the TLS
certificate failures — `NEVER_LEFT_CODES`, mirrored from `staffMail.ts`.

**A known limitation, stated rather than buried.** The outcome this layer
receives has already been collapsed to a class and a reason *string*, so the
"provably not sent" test is a match on that string. When a transport error is
wrapped (undici reports `fetch failed` with the real code on the `cause`), the
code is not in the string and the outcome lands in `uncertain`. That is the
conservative direction — the cost is an operator row, not a duplicate — but it
means the automatic retry path is narrower than it could be. The fix is to
carry the provider `statusCode` and the transport `code` on `MailOutcome`;
`staffMail.ts` was outside this change's scope. **Where the evidence is absent,
`uncertain` is chosen.**

Automatic retries, when they happen at all, are durable: `next_attempt_at` moves
to now + 30 s, then 2 min, then 10 min, for at most three attempts. After that
`next_attempt_at` is null and the row waits for a person. Nothing sleeps inside
a job handler, so a worker that dies between attempts loses nothing.

### Failure before the provider call

If mail cannot be sent in this environment at all (`RESEND_API_KEY` unset, or
`CRM_EMAIL_TEST_MODE` not `"false"`), the delivery layer writes **nothing** — no
row, no marker, no `last_error`. The occurrence is untouched and goes out
normally once mail is configured. This is deliberate: a row here would claim the
occurrence had been handled, which is the original bug wearing a new hat.

A staging environment therefore shows no delivery records at all. That is
correct, and it is **not** evidence that delivery works.

---

## 4. The provider's 24-hour idempotency window

Verified against <https://resend.com/docs/dashboard/emails/idempotency-keys>:

* The `idempotencyKey` retention window is **24 hours only.** After 24 hours the
  same key sends again. It is a short-horizon duplicate suppressor, **not a
  permanent ledger**. `RESEND_IDEMPOTENCY_WINDOW_MS` in `staffMail.ts` records
  the number and a test pins it.
* **409 `concurrent_idempotent_requests`** — two requests with the same key are
  in flight. Not a hard failure, and never treated as one: it reads as
  `uncertain`, because the other request is probably delivering the message.
* **409 `invalid_idempotent_request`** — a key reused with a different payload.
  That is our bug; nothing was sent; it reads as `refused`.

The key is `<dedupe_key>:<occurrence ISO>:<staff id>` — stable for one
recipient's copy of one occurrence, different for the next occurrence, and
different for each recipient. The recipient matters: two attendees of one
appointment get different messages, and reusing a key across them is exactly the
"same key, different payload" that Resend answers with
`invalid_idempotent_request`.

**What the window decides, and what it does not.** The automatic path does not
depend on it: a `pending` retry is only ever scheduled where the provider
demonstrably holds nothing, and an `uncertain` row is never retried
automatically. The window decides exactly one thing — whether an operator's
**retry** is still safe:

* inside 24 hours of the last attempt, a retry carries the same key, the
  provider collapses it, and a second copy cannot appear;
* past 24 hours the key is inert, so a retry of an `uncertain` row could deliver
  a second copy.

So past the window **retry is withdrawn**, not merely warned about:
`availableActions` omits it and the route answers `409` pointing at re-send.
That is what keeps "a retry cannot duplicate" a guarantee rather than a hope.

---

## 5. Finding deliveries that need somebody

**One truth, over HTTP.** (The previous version of this file contradicted itself
here — a section saying the list was "not yet on an HTTP route" followed by an
"Update:" saying it had been added. Both are gone.)

`GET /api/crm/operations/deliveries` — the whole queue, **keyset paged on the
delivery id** (`cursor`, `nextCursor`), filterable by `state`, and defaulting to
what is unresolved. Each row carries the recipient, the original occurrence, the
attempt number, the provider reference, the outcome, the reason, whether the
idempotency window is still open, the recovery actions available *for that row*,
and a plain-English `guidance` line. `counts.matchingFilters` is the whole
filtered set, not the page.

Keyset, not offset, for a sharper reason than usual: an unresolved delivery is a
message somebody may never have received, and a page that can drop one is worse
than no page at all because it looks complete. Requires `settings.read`.

`GET /api/crm/operations/deliveries/:id` — one delivery plus its full recovery
history: who retried, who re-sent, who acknowledged, and the reason each gave.

`GET /api/crm/operations/jobs` — carries a **capped preview** of the same list
alongside `deliveriesNeedingAttentionTotal`, so a short list can never read as a
complete one. `getSchedulerStatus().deliveriesNeedingAttention` is the same
count, refreshed each worker tick.

A delivery "needs somebody" when it is unresolved and either `attempting`,
`refused`, `uncertain`, or `pending` **with at least one attempt behind it**. A
`pending` row with no attempt yet is simply queued and is nobody's problem.

Direct SQL, for a console:

```sql
-- Unknown delivery state: may or may not have reached the recipient.
SELECT d.id, j.kind, j.dedupe_key, d.occurrence_at, d.recipient_staff_id,
       d.attempt, d.failure_reason, d.failure_detail
FROM crm_reminder_deliveries d
JOIN crm_scheduled_jobs j ON j.id = d.job_id
WHERE d.state = 'uncertain' AND d.resolved_at IS NULL
ORDER BY d.id DESC;

-- Everything needing a human, including refusals and stalled retries.
SELECT d.id, j.kind, j.dedupe_key, d.occurrence_at, d.recipient_staff_id,
       d.state, d.attempt, d.next_attempt_at, d.failure_reason, d.failure_detail
FROM crm_reminder_deliveries d
JOIN crm_scheduled_jobs j ON j.id = d.job_id
WHERE d.resolved_at IS NULL
  AND (d.state IN ('attempting', 'refused', 'uncertain')
       OR (d.state = 'pending' AND d.attempt > 0))
ORDER BY d.id DESC;
```

---

## 6. The three things an operator can do

Not one button. They are genuinely different acts and are named for what they
do. All three require `settings.write` and a `reason` of at least three
characters, and all three write a `crm_delivery_recovery_actions` row with the
staff id, the action, the reason, the state it was in, the keys before and
after, and the time. That table is the record; `crm_admin_audit_log` is written
too, but it deliberately swallows its own failures and carries no reason, which
is fine for an audit trail and disqualifying for the row that proves a case was
closed.

| Action | What it does | Refused when |
|---|---|---|
| `POST .../deliveries/:id/retry` | The **same** occurrence, recipient, message and idempotency key. Only `next_attempt_at` moves. Cannot duplicate. | The delivery is `accepted`, is in flight, or is `uncertain` past the 24-hour window (§4). |
| `POST .../deliveries/:id/resend` | A deliberate **new copy** with a **new** key (`<key>#resend<n>.<nonce>`), so the provider will not collapse it. Never the default. | `confirmDuplicateRisk: true` is absent from the body — the refusal returns the duplicate-risk explanation rather than a bare error. A value that is merely truthy does not count. |
| `POST .../deliveries/:id/acknowledge` | Closes the case without sending anything: resolution `acknowledged`, the reason stored as the note, and any scheduled attempt cleared. The *fact* is unchanged — an `uncertain` row stays `uncertain`, because we still do not know. | The delivery was accepted, is in flight, or is already resolved. |

When a retry or a re-send a person asked for is later **accepted**, the worker
closes the case in their name: resolution `accepted` or `resent`, attributed to
the operator who asked. An ordinary first-time success closes nothing, because
nobody had to do anything.

What to do about each state:

| State | Do this |
|---|---|
| `attempting` | Wait one worker tick. It is either an active send or a lost worker, and the next tick turns the second case into `uncertain`. Do nothing before then. |
| `uncertain`, still protected | The attempt was under 24 hours ago. **Retry** — it carries the same key, so the provider collapses it into the original. |
| `uncertain`, no longer protected | Retry is gone, and correctly so. Ask the recipient whether it arrived, then either **re-send** (accepting that they may get two) or **acknowledge**. |
| `refused` | Read the reason. Fix the address, the sending domain or the API key first; retrying an unchanged refusal produces the identical refusal. |
| `pending` with a `next_attempt_at` | Nothing to do — the provider demonstrably holds nothing and the worker will try again. |
| `pending` with no `next_attempt_at` | Automatic attempts are exhausted. **Retry** is safe here; nothing was delivered. |

The UI for all of this is the **Delivery** view in
`/admin/crm/operations`. Re-send is marked as creating a duplicate, is never the
pre-selected action, and requires ticking a confirmation before it will run.

---

## 7. What happened to the old packed records

`migratePackedDeliveryRecords()` moves everything out of `external_ref` into
real rows, once per process at scheduler start. Three rules:

* **Idempotent** — every insert is guarded by the UNIQUE index, so a restart
  costs a scan and changes nothing.
* **Non-destructive** — `external_ref` and `external_dispatched_at` are never
  cleared, so the source text survives even a rollback of the new tables.
* **Nothing is dropped.** A line this scheme cannot confidently read is stored
  verbatim in `legacy_raw` as an `uncertain` row with `origin =
  'migrated_unparsed'`, which keeps it on the operator list until a person
  decides what it was. Guessing at it, or skipping it, is how history
  disappears.

Correctness does not depend on the bulk migration having run: `ensureDeliveryRow()`
seeds a new record from whatever the packed column said about that occurrence
and recipient, so a message the old scheme already sent is never sent again
either way. The bulk pass exists to make inherited **unresolved** records
*visible*.

How old records are read:

* `accepted` → `accepted`, provider id preserved.
* `rejected` → `refused`.
* `attempting` → `uncertain`. Any attempt still in flight at migration time
  belongs to a process that is gone.
* `acknowledged` → `uncertain`, resolved as `acknowledged` with a note saying
  the original acknowledgement recorded no actor, because it did not.
* `failed` → re-read under the **current** rule rather than trusted. The old
  classifier called a 5xx "definitely not taken"; this one does not. If the
  stored detail names a transport code that rules the request out it stays
  `pending`; otherwise it becomes `uncertain`. One rule, applied to old records
  and new ones alike.
* A pre-2026-09 marker with a provider id beside it → `accepted`. A marker with
  none → `uncertain`, unattributed, because that is all the old marker ever
  meant. Expect a few of these on the attention list the first time it is read.
  That is the old silent loss becoming visible, not a new fault.

Unattributed rows are the only ones allowed to name no recipient, enforced by a
check constraint scoped to `origin <> 'live'`.

---

## 8. Two workers, one message

* **Claiming is one conditional `UPDATE`.** PostgreSQL serialises the row, the
  loser re-evaluates its `WHERE` against the winner's committed state, matches
  nothing, and returns empty. There is no window between checking and claiming
  because there is no separate check.
* **A lease can expire mid-send.** After five minutes an `attempting` row is
  promoted to `uncertain` by `recoverStaleAttempts()`. It is not re-sent — we do
  not know whether a message exists — and it is not lost: it becomes a visible,
  actionable row.
* **The worker that made the attempt may still settle it.** The settle is guarded
  on the attempt number *and* the worker id, so a worker whose in-flight record
  another worker already promoted to `uncertain` may still improve its own guess
  to the real answer, and can never touch a different attempt's verdict.
* **A killed worker loses nothing.** The record survives the process; the next
  pass finds it.

---

## 9. Known gaps, stated rather than hidden

* **The "provably not sent" test matches on the reason string** (§3). A wrapped
  transport error lands in `uncertain` instead of being retried automatically.
  Conservative, but narrower than it should be; the fix is upstream in
  `staffMail.ts`.
* **A person's re-send can duplicate.** That is what it is for. It says so, and
  what it said is recorded against the delivery.
* **Nothing here proves a message was *read*.** `accepted` means the provider
  took it, and that is all it has ever meant.

  Bounces and complaints ARE now consumed, and so is the rest of what the
  provider says: `crm_email_provider_events` records every verified webhook
  event and the delivery state shown against a record is derived from those
  events (`lib/emailDeliveryState.ts`). That changes what a screen can show. It
  changes exactly one thing about this guarantee, and only in the direction of
  more certainty:

  > A provider `email.delivered` event for an `uncertain` delivery moves it to
  > `accepted`. That is evidence of arrival rather than an inference from a
  > failure class, and it is what takes the row off the operator's list without
  > anybody having to chase it.

  Nothing else changes. No event turns an uncertain outcome into a failure, no
  event schedules an automatic retry, and a `refused` stays refused — evidence
  that some other message arrived does not overturn a refusal of this one. An
  `email.sent` event is recorded and displayed but deliberately rewrites
  nothing: it says the provider accepted the message, which is what `accepted`
  already claims, and the state it would overwrite is one a person is looking
  at.

  Matching an event to a delivery uses the provider id where one was learned
  and the `crm_ref` tag otherwise (`lib/emailRefs.ts`) — the tag being the only
  path to an uncertain record, which by definition never learned an id.
* **`CRM_EMAIL_TEST_MODE` and an unset `RESEND_API_KEY` mean nothing is ever
  sent and nothing is recorded** (§3).
* **`crm_reminder_deliveries` grows without bound.** That is deliberate — a cap
  is what discarded unresolved history last time — but there is no archival
  policy yet.

---

## 10. Where this is enforced

| | |
|---|---|
| State machine, classification, migration, recovery | `artifacts/api-server/src/lib/crmScheduler.ts` |
| Failure classes and the 24 h constant | `artifacts/api-server/src/lib/staffMail.ts` |
| Schema and the closed state vocabulary | `lib/db/src/schema/crmDeliveries.ts` |
| Reviewed DDL and rollback | `docs/crm-ops/schema/M4-deliveries.sql` |
| Operator API | `artifacts/api-server/src/routes/crmOperations.ts` |
| Operator UI | `artifacts/web-agency/src/pages/crm/CrmOperations.tsx` (the Delivery view) |
| Tests | `artifacts/api-server/src/routes/crmDeliveries.test.ts` |

The suite drives the operator API against a real PostgreSQL database and the
real Express app, and covers: a retry preserving the occurrence, recipient,
message and key while moving only the next attempt; a retry not duplicating the
in-app notification; a re-send refused without explicit confirmation and issuing
a new key with it; a re-send refused for a merely truthy confirmation;
acknowledging an unknown outcome with a reason and recording the actor;
acknowledging clearing a scheduled attempt; an unknown outcome never being
retried automatically; a 5xx read as unknown while a refused connection is read
as unsent and a refusal as a refusal; every unresolved record staying reachable
past the display limit; a killed worker's in-flight delivery being recovered
without a second send; two workers racing one delivery and only one message
going out; the job-level retry keeping `run_at`; and the packed column being
migrated without guessing at or dropping anything.

Each guard was checked by reintroducing the defect it prevents — **sixteen
mutations, sixteen detected, none survived.** The list is in the report that
accompanied this change; it includes moving the occurrence on a retry, issuing a
new key on a retry, dropping the notification identity, reusing the key on a
re-send, skipping the re-send confirmation, dropping the actor from the audit,
auto-retrying an unknown outcome, reading a 5xx as "not sent", breaking the
cursor so unresolved rows fall off the end, never recovering a stale attempt,
making the claim non-atomic, dropping unreadable packed lines, keeping retry on
offer past the idempotency window, restoring `run_at = now()` on the job retry,
dropping the reason requirement, and leaving a scheduled attempt on an
acknowledged row.
