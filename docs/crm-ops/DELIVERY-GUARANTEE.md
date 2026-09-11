# Reminder email delivery — what is actually guaranteed

Written 2026-09-11. Authoritative for `crm_scheduled_jobs` external delivery.
Supersedes every earlier claim about "exactly-once" reminder email, including
the wording in `M3-OPERATIONAL-HANDOFF.md`, the `crmScheduler.ts` header, and
the `external_dispatched_at` comment in `lib/db/src/schema/crmOperations.ts`.

This document exists because the previous claim was false. It said the engine
"never double-sends", justified by row locking plus a marker written before the
send. Row locking says nothing about a third party, and a marker written before
a request proves only that a request was *started*. The next section says what
that cost.

---

## 1. The claim that was wrong, and what it cost

The old `maybeEmail()`:

1. returned early if `external_dispatched_at >= run_at`;
2. wrote `external_dispatched_at = now()` **before** calling Resend;
3. called Resend;
4. recorded `external_ref` on success.

Step 2 commits the suppression before anything is known about step 3. So if
Resend answered 500, or the connection was refused, or the request timed out,
the marker was already written and every future attempt returned at step 1. The
reminder was **silently lost forever**, and nothing anywhere recorded that it
had been.

Preventing duplicates had created silent message loss. Silent loss is the worse
failure: a duplicate reminder is a mild annoyance a person can see, and a
missing one is invisible to everybody, including the person who needed it.

---

## 2. What is guaranteed now

**In one paragraph.** For each occurrence of each reminder and each recipient
of it, the CRM hands the message to Resend at most once unless a human
deliberately re-sends it, and records the outcome of that hand-off as one of
five facts: nothing attempted, attempt in flight, accepted, refused, or
unknown. Only a recorded *acceptance* (or a human's explicit acknowledgement)
stops a later attempt. A transient failure where the provider demonstrably did
not take the message is retried, because such a retry cannot duplicate. An
outcome we could not observe is **never** retried automatically and is instead
left visible to an operator. This is **at-most-once automatic delivery with
visible ambiguity** — it is *not* exactly-once, it is not at-least-once, and no
part of it should be described as either.

Stated as guarantees and non-guarantees:

| | |
|---|---|
| **Guaranteed** | A recipient never receives two copies of one occurrence as a result of a worker crash, an expired lease, two workers, or a retry the system performs by itself. |
| **Guaranteed** | An occurrence is never silently suppressed by a failure. Every non-accepted outcome is written to the row and is queryable (§5). |
| **Guaranteed** | Every recipient of a job that emails several people is tracked separately. One attendee's outcome — success or failure — never decides another's. |
| **Guaranteed** | A recurring reminder's later occurrences are never suppressed by an earlier occurrence's record. Delivery records are tied to `run_at`. |
| **Guaranteed** | In-app notifications are unaffected by all of this. They are written in the same database as the job, so they have no crash window. |
| **NOT guaranteed** | That every reminder is delivered. A refusal or an exhausted transient failure ends with no message; an unknown outcome ends with no certainty. All three leave a visible row and no further automatic attempt. |
| **NOT guaranteed** | That an `uncertain` row was not delivered. It may have been. Nobody knows, including us. |
| **NOT guaranteed** | That a **human** re-send cannot duplicate. Past 24 hours it certainly can (§4). |
| **NOT guaranteed** | Exactly-once. It is not achievable against an API that cannot be asked "did you already take this?" and does not remember keys for longer than a day. |

---

## 3. The state machine

Delivery state lives in `crm_scheduled_jobs.external_ref`, a text column — no
schema change was made, and none is needed. It holds one newline-separated
record per (occurrence, recipient):

```
<state>|<run_at ISO>#<staffId>|<attemptId>|<detail>
```

- `<run_at ISO>` — the occurrence. This is what lets one row carry a recurring
  reminder: a record for a different occurrence is ignored.
- `#<staffId>` — the recipient. **One record per person, not per job.** An
  appointment reminder is a single job row that emails every staff attendee, so
  a per-occurrence record would let attendee one's success suppress attendee
  two's message — the same silent loss wearing a different hat. A record with
  no `#` is unattributed and covers every recipient of that occurrence; only
  inherited pre-2026-09 markers are written that way, because the old marker
  never recorded who it was for.
- `attemptId` — `<n>.<nonce>`, unique per attempt. A worker may only ever
  resolve the attempt it made itself.
- `detail` — the provider's message id on success, otherwise a short reason.
  `|` and newlines are stripped from it, so `|` only ever separates fields and
  a record always parses.

Records for the current occurrence are all kept. Records for older occurrences
are kept only while unresolved — answered ones are history — and are capped at
ten, so a recurring job that fails daily cannot grow the column without bound.

`external_dispatched_at` keeps its old meaning: the instant of the most recent
hand-off. It is still stamped before the call, and it is **no longer evidence of
delivery**. `last_error` carries a `delivery <state>: <reason>` copy of any
non-accepted outcome so it surfaces where operators already look.

Every write is a read-modify-write with a compare-and-set on the exact column
value that was read, so two workers can never both believe they own an
occurrence (§6).

| State | Meaning | Retried automatically? |
|---|---|---|
| *(no record)* | Nothing has been attempted for this occurrence. | Yes — it is sent. |
| `attempting` | A request is in flight, or the worker that started it was lost. | No. The next worker to see it promotes it to `uncertain`. |
| `accepted` | Resend took the message and returned an id. | No. **The only machine-written state that suppresses.** |
| `rejected` | Resend answered with a refusal — bad address, unverified domain, key without permission, `invalid_idempotent_request`. Nothing was delivered, and repeating it unchanged changes nothing. | No. Fix the cause, then re-run. |
| `failed` | Resend definitively did not take it, for a reason that may pass: 5xx, `rate_limit_exceeded`, or a connection that never opened (`ECONNREFUSED`, `ENOTFOUND`, TLS failure). | Yes — up to three attempts in one run (0 / 250 ms / 1 s). Safe by construction: the provider is known not to hold a copy. |
| `uncertain` | Bytes went out and we never learned the answer: timeout, socket hang up, aborted read, a 409 `concurrent_idempotent_requests`, or a worker lost mid-call. | **Never.** This is the state a person has to resolve. |
| `acknowledged` | A human looked at an `uncertain` row and closed it. | No. |

The classification lives in `classifyProviderError()` and
`classifyThrownMailError()` in `artifacts/api-server/src/lib/staffMail.ts`, and
both are pure and directly tested. The one judgement that matters in all of it:
**anything unrecognised is `uncertain`**, never `failed`. Guessing "it didn't go"
and retrying is how duplicates happen.

### Why a transient failure is retried and an unknown one is not

They are not the same event. `failed` means we have the provider's own word
that it did not take the message (an error response with no id) or that the
request never reached it at all. A retry therefore cannot produce a second
message, at any age, with or without an idempotency key. `uncertain` means we
have no such word. A retry there is a coin flip against a person's inbox, so a
machine does not get to make it.

### Failure before the provider call

If mail is not configured at all (`RESEND_API_KEY` unset, or
`CRM_EMAIL_TEST_MODE` not `"false"`), the delivery layer writes **nothing** —
no marker, no record, no `last_error`. The occurrence is untouched and goes out
normally once mail is configured. This is deliberate: the old code stamped its
marker before discovering that no send was possible, which permanently
suppressed the reminder in exactly the environments where it had never been
sent.

---

## 4. Resend's 24-hour idempotency window

Verified this session against
<https://resend.com/docs/dashboard/emails/idempotency-keys>:

- The `idempotencyKey` retention window is **24 hours only.** After 24 hours,
  the same key sends again. It is a short-horizon duplicate suppressor, **not a
  permanent ledger**, and `RESEND_IDEMPOTENCY_WINDOW_MS` in `staffMail.ts`
  records the number with a test that pins it.
- Resend answers **409 `concurrent_idempotent_requests`** when two requests
  carrying the same key are in flight. That is *not* a hard failure and is
  never treated as one — it is read as `uncertain`, because the other request
  is probably delivering the message.
- Resend answers **409 `invalid_idempotent_request`** when a key is reused with
  a different payload. That is our bug; nothing was sent; it is read as
  `rejected`.

**What this means here.** The key used is
`<dedupe_key>:<run_at ISO>:<staffId>` — stable for one recipient's message in
one occurrence, different for the next occurrence, and different for each
recipient. The recipient matters: two attendees of the same appointment get
different messages, and reusing one key across them is precisely the "same key,
different payload" that Resend answers with `invalid_idempotent_request`.

The key is *belt and braces only*. The automatic path does not depend on it:

- `failed` retries cannot duplicate regardless of the key or the elapsed time.
- `uncertain` occurrences are never retried automatically, so the window never
  decides anything.
- The one place the key genuinely earns its keep is the narrow race in §6 —
  worker A in flight, worker B reclaiming — which resolves inside seconds, far
  inside 24 hours.

**Past the 24-hour horizon**, the key is inert. A retry of an occurrence whose
attempt is more than 24 hours old will deliver a second copy if the first one
was in fact delivered. Nothing in the automatic path goes there. A human retry
does, and the operator view says so explicitly per row
(`idempotencyProtected: false`).

---

## 5. Finding ambiguous deliveries

Two code paths, both in `artifacts/api-server/src/lib/crmScheduler.ts`:

- `listDeliveriesNeedingAttention(limit)` — every delivery that is not a
  recorded success, **one entry per recipient**, newest row first, each
  carrying `staffId`, `occurrence`, `state`, `attempt`, `detail`,
  `idempotencyProtected`, and a plain-English `guidance` line. **"Which
  reminders are in an unknown delivery state?" is this list filtered to
  `state === "uncertain"`.**
- `countDeliveriesNeedingAttention()` — refreshed on every scheduler tick into
  `getSchedulerStatus()`, which `GET /crm/operations/jobs` already returns. The
  count therefore reaches the operator dashboard as
  `scheduler.deliveriesNeedingAttention` with no route change.

The detail list is not yet on an HTTP route. Adding it is one line in
`artifacts/api-server/src/routes/crmOperations.ts` inside the existing
`GET /crm/operations/jobs` handler:

```ts
deliveriesNeedingAttention: await listDeliveriesNeedingAttention(
  clampLimit(req.query["limit"], 20, 100),
),
```

**Update:** this was added — `GET /crm/operations/jobs` now returns
`deliveriesNeedingAttention` alongside the count, with a `deliveryNote`
explaining what an entry means.

Direct SQL, for a console. Matching on `'%<state>|%'` is exact rather than
approximate: `|` separates fields and is stripped from every detail, so a state
name immediately followed by `|` can only be a record's first field.

```sql
-- Unknown delivery state: may or may not have reached the recipient.
SELECT id, kind, dedupe_key, run_at, external_dispatched_at, external_ref, last_error
FROM crm_scheduled_jobs
WHERE external_ref LIKE '%uncertain|%'
   -- rows written before this scheme: a marker with no provider answer beside it
   OR (external_ref IS NULL
       AND external_dispatched_at IS NOT NULL
       AND external_dispatched_at >= run_at)
ORDER BY updated_at DESC;

-- Everything needing a human, including refusals and exhausted retries.
SELECT id, kind, dedupe_key, run_at, external_ref, last_error
FROM crm_scheduled_jobs
WHERE external_ref LIKE '%attempting|%'
   OR external_ref LIKE '%uncertain|%'
   OR external_ref LIKE '%failed|%'
   OR external_ref LIKE '%rejected|%'
   OR (external_ref IS NULL
       AND external_dispatched_at IS NOT NULL
       AND external_dispatched_at >= run_at)
ORDER BY updated_at DESC;
```

A row can hold several records; read `external_ref` line by line. The digits
after `#` are the `crm_staff.id` the message was for.

### What an operator should do about each one

| State | Do this |
|---|---|
| `attempting` | Wait one worker tick (30 s). It is either an active send or a lost worker, and the next tick turns the second case into `uncertain`. Do nothing before then. |
| `uncertain`, `idempotencyProtected: true` | The attempt was under 24 hours ago. Re-sending carries the same key, so Resend collapses it into the original — a retry here is cheap and safe. Re-send by hand, then acknowledge (below). |
| `uncertain`, `idempotencyProtected: false` | The window has closed; a re-send **will** produce a second copy if the first arrived. Ask the recipient whether they got it, then either re-send or just acknowledge. |
| `failed` | Nothing was delivered. Re-run the job — `POST /crm/operations/jobs/:id/retry` for a row the queue marked failed, or set `status = 'pending'`, `locked_at = NULL` on the row. It cannot duplicate. |
| `rejected` | Read `last_error`. Fix the address, the sending domain or the API key first; retrying an unchanged refusal produces the identical refusal. |

Closing an `uncertain` record once it has been dealt with — the only supported
way, and deliberately a human act. Copy the record's line verbatim out of the
SELECT above, and substitute it with the same line reading `acknowledged`. A
plain `replace()` is used rather than a regex on purpose: PostgreSQL's `.`
matches newlines, so a careless pattern would swallow the neighbouring records.

```sql
UPDATE crm_scheduled_jobs
SET external_ref = replace(
      external_ref,
      -- the line exactly as it appears in external_ref
      'uncertain|2026-09-11T09:00:00.000Z#7|3.a1b2c3|socket hang up',
      'acknowledged|2026-09-11T09:00:00.000Z#7|3.a1b2c3|resent by hand, recipient confirmed'
    ),
    last_error = NULL,
    updated_at = now()
WHERE id = $1;
```

Keep the occurrence and attempt id unchanged — the first says which occurrence
and recipient was closed, the second keeps the history attributable. Only the
state word and the detail should differ.

`acknowledged` is a settled state, so that recipient's occurrence is never sent
again and the record drops off the attention list. Nothing clears an
`uncertain` record automatically. Re-arming the job (a recurring task moving to
its next occurrence) does not clear it either: it stays on the attention list,
tagged with the occurrence and recipient it belongs to, until somebody closes
it.

---

## 6. Two workers on one row

The lease (`LOCK_TIMEOUT_MS`, five minutes) can expire while worker A is still
talking to Resend. Worker B then reclaims the row legitimately. What happens:

1. B finds an `attempting` record and **does not send**. It cannot know whether
   A's request reached the provider, so it promotes the record to `uncertain`
   and stops. No second message.
2. A comes back with the real answer and resolves **its own attempt** —
   matched on `attemptId`, so it can improve B's guess to `accepted` or
   `rejected`, and can never touch a different attempt's verdict or a settled
   one.
3. Claiming a send is a compare-and-set on the exact `external_ref` that was
   read. The loser of a race matches no row, sends nothing, and returns.

If A never comes back — it was killed — the record stays `uncertain` and shows
up in §5. That is the correct outcome: nobody knows, so nobody pretends.

Tested in `crmSchedulerDelivery.test.ts`, "does not double-send when a lease
expires while a send is in flight", which drives a real second `processDueJobs()`
pass from inside the in-flight window.

---

## 7. Known gaps, stated rather than hidden

- **A job re-run writes a second in-app notification.** The delivery guard
  covers email only, by design. An operator retry of a task reminder therefore
  produces a duplicate in-app notification. Not addressed here; it is a
  handler-level concern, not a delivery one.
- **`POST /crm/operations/jobs/:id/retry` sets `run_at = now()`**, which makes
  a *new occurrence*: new idempotency key, no prior delivery record, and
  therefore no protection from Resend at all. It also only targets jobs the
  queue marked `failed`, so it cannot reach an `uncertain` row — those are
  resolved by hand per §5.
- **The attention list is not on an HTTP route yet** (§5). The count is.
- **Rows written before 2026-09-11** are read honestly rather than
  optimistically: a marker with a provider id beside it is `accepted`; a marker
  with none is `uncertain`, because that is all the old code ever meant by it.
  Expect a handful of these to appear on the attention list the first time it is
  read. That is the old silent loss becoming visible, not a new fault.
- **`CRM_EMAIL_TEST_MODE` and an unset `RESEND_API_KEY` mean nothing is ever
  sent**, and nothing is recorded. A staging environment will show no delivery
  records at all, which is correct and not evidence that delivery works.

---

## 8. Where this is enforced

| | |
|---|---|
| State machine, visibility helpers | `artifacts/api-server/src/lib/crmScheduler.ts` |
| Failure classification, 24 h constant | `artifacts/api-server/src/lib/staffMail.ts` |
| Tests | `artifacts/api-server/src/lib/crmSchedulerDelivery.test.ts` |

The test suite covers: failure before the provider call; permanent rejection;
acceptance followed by a lost response; a worker crash before acceptance is
recorded; retry after a restart; an expired lease with a concurrent worker; a
worker that loses the claim race during a retry pause; a retry outside the
24-hour window; one appointment fanning out to several attendees; and
pre-2026-09 rows in both shapes.

Each guard was checked by reintroducing the defect it prevents — fifteen
mutations, including the original marker-before-the-call bug — and confirming
at least one test fails on each. None of them pass when the defect is present.
