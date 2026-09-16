# Reporting definitions and the unified customer history

> The traceability record for `/api/crm/reports/*` and `/api/crm/history/*`.
> Written 2026-09-12. Authoritative alongside the code, not instead of it —
> `GET /api/crm/reports/figures` and `GET /api/crm/history-sources` return the
> same facts from the running system, so a claim here can be checked rather
> than believed.

---

## 1. Why this document exists

A number on a dashboard is not information. "Win rate: 0%" is four different
statements depending on what you cannot see:

- nobody has closed anything yet (there is no rate);
- forty deals closed and all forty were lost (there is a rate, and it is bad);
- deals close but nothing records the outcome (nothing is measured);
- the reader filtered on a status no write path produces (the figure is
  structurally zero and always will be).

That last one is not hypothetical here. Two surfaces in this CRM once filtered
"money received" on the status `'received'` — a value nothing has ever written —
while a third used `'completed'` and was right. The result was a business
looking at a zero next to a correct revenue figure with no way to tell which to
believe. `TRANSACTION_RECEIVED_STATUS` exists because of that, and every money
figure in this document imports it rather than spelling a status out.

So four rules govern every figure below, and they are enforced in the API, not
merely described here:

| Rule | Where it is enforced |
|---|---|
| A figure states its **definition** and its **denominator** | `definition` and `denominator` on every figure in `/crm/reports/summary` |
| A figure hands back **the rows it counted**, and the count equals that list | the `detail` URL, `/crm/reports/detail/<key>`; the summary value is computed **from those rows**, so there is no second query to disagree with |
| A figure nothing measures reports **unavailable**, never `0` | `available: false` plus `unavailableReason` and `wouldRequire` |
| A ratio with an **empty denominator** is `null`, never `0%` | ratio evaluation in `crmReports.ts` |

And one rule governs the timeline: **never invent an actor.**

---

## 2. Timezone

Days are counted in a named IANA zone, and the zone is returned with every
response (`window.timezone`).

- Request it with `?timezone=Asia/Manila`.
- Otherwise it is the signed-in staff member's `crm_staff.timezone`.
- Otherwise `UTC`.

The window runs from the start of `from` to the **end of `to`** in that zone —
`to` is inclusive as a day. The boundaries are computed by PostgreSQL
(`date::timestamp AT TIME ZONE zone`), not by offset arithmetic in Node, so a
DST transition inside the window is handled by the zone database rather than by
a subtraction that is wrong twice a year.

This matters in practice: a payment recorded at 20:30 UTC belongs to that UTC
day and to the **next** day in Manila. Same rows, same question, two correct
and different answers. `window.definition` states which one you are reading.

Default window when none is given: the last 30 days, ending today.

---

## 3. Filters

`from`, `to`, `timezone`, `ownerStaffId`, `source` (contact source), `stage`
(deal stage), `status` (support ticket status).

Not every figure can honour every filter, and a filter that silently does
nothing is worse than one that is refused. Each figure therefore returns
`honoursFilters` and `ignoredFilters`, and the UI shows the second list.

Two figures ignore the date range entirely because they are snapshots of *now*
and nothing records what they looked like in the past: `openPipelineValue` and
`tasksOverdueNow`. `completedPaymentsMissingReceivedAt` is a data-quality
census and is deliberately global.

---

## 4. The figures

39 figures. `Unit` is `count`, `currency`, `percent`, `days` or `minutes`.
Every row's "Source and filter" is the literal predicate the query uses; "in
window" means `>= start AND < end` against the column named.

### 4.1 Acquisition

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `leadsCreated` | count | Contact records created in the window. | `crm_leads.created_at` in window; plus `source` | none (a count) | Counts when the RECORD was created here, not when the enquiry arrived. An imported backlog all lands on its import date. |
| `leadStatusChanges` | count | Activity rows of type `status_changed` in the window, each carrying the status moved from and to. | `crm_activities WHERE type = 'status_changed'`, `created_at` in window | none | **Only the contact-edit route writes this activity.** A status set by CSV import, by the sales conversion path, or by any other writer leaves no row. This is a LOWER BOUND on status movement, not a census — reported because the rows are real, not because the set is complete. |

> **Not offered:** "contacts qualified in this period". `crm_leads.status` is the
> status *now*. Counting today's state and dating it last month is the kind of
> figure that is wrong in a way nobody notices. `leadStatusChanges` is the
> honest partial answer.

### 4.2 Sales

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `dealsOpened` | count | Deals created in the window. | `crm_deals.created_at` in window; plus `ownerStaffId`, `source`, `stage` | none | |
| `dealsWon` | count | Deals whose `won_at` — the instant somebody marked them won, **not** the expected close date — falls in the window. | `crm_deals WHERE won_at IS NOT NULL` in window; plus `ownerStaffId`, `source` | none | |
| `dealsLost` | count | Deals whose `lost_at` falls in the window. | `crm_deals WHERE lost_at IS NOT NULL` in window; plus `ownerStaffId`, `source` | none | |
| `winRate` | percent | Won as a share of deals **decided** in the window. | numerator `dealsWon`; denominator `dealsWon` plus `dealsLost` | Deals won plus deals lost, both dated by when they were decided | Open deals are excluded: they have not been decided, and counting them as losses would make every healthy pipeline look like a failure. `null` when nothing was decided. |
| `contractedValue` | currency | Face value of deals won in the window. AGREED money, not money that arrived. | `sum(crm_deals.value) WHERE won_at` in window; plus `ownerStaffId`, `source` | The deals counted by `dealsWon` | Compare against `moneyReceived`; the gap is the business's actual exposure. |
| `openPipelineValue` | currency | Face value of every deal not yet won or lost. An upper bound, **not** weighted by likelihood and **not** a prediction. | `sum(crm_deals.value) WHERE stage NOT IN ('Won','Lost')`; plus `ownerStaffId`, `source`, `stage` | Deals currently at a stage other than Won or Lost | A snapshot of **now**. Ignores the date range — "the pipeline as it stood last March" is not recorded. For a likelihood-weighted forecast see `GET /crm/sales/forecast`. |
| `medianDaysToWin` | days | Median of `won_at` minus `created_at` for deals won in the window. | `crm_deals WHERE won_at` in window; plus `ownerStaffId`, `source` | Deals won in the window | Median rather than mean, so one nine-month deal does not move the number everybody plans around. |

### 4.3 Revenue

All money figures filter on `TRANSACTION_RECEIVED_STATUS` / `'pending'` /
`'refunded'`. The received status is **imported from `lib/db`** and never typed
out in `crmReports.ts`.

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `moneyReceived` | currency | Money the business actually has. | `sum(crm_transactions.amount) WHERE status = TRANSACTION_RECEIVED_STATUS AND coalesce(received_at, created_at)` in window; plus `source` (via deal to contact) | Payments recorded as received in the window | Dated by `received_at`, falling back to `created_at` where a received row has none. `completedPaymentsMissingReceivedAt` says how often that fallback is used. |
| `paymentsReceived` | count | The number of those transactions. | same rows as `moneyReceived` | none | Exactly the rows `moneyReceived` sums, so the two can never disagree. |
| `moneyPending` | currency | Charges started but not settled. | `sum(amount) WHERE status = 'pending' AND created_at` in window | Pending transactions in the window | Deliberately **not** added to money received. |
| `moneyRefunded` | currency | Refunds in the window. | `sum(amount) WHERE status = 'refunded' AND coalesce(received_at, created_at)` in window | Refunded transactions in the window | Reported separately rather than netted off: a month with heavy refunds and a quiet month are not the same month. |
| `completedPaymentsMissingReceivedAt` | count | Data quality — received transactions that do not record **when**. | `crm_transactions WHERE status = TRANSACTION_RECEIVED_STATUS AND received_at IS NULL` | none | Global; ignores every filter including the date range. Exists to make the `coalesce` above visible instead of hidden. |

### 4.4 Operations

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `tasksCreated` | count | Tasks created in the window, archived ones included. | `crm_tasks.created_at` in window; plus `ownerStaffId` (assignee) | none | Archiving hides work from a queue; it does not unmake it. |
| `tasksCompleted` | count | Tasks completed in the window, whenever created. | `crm_tasks WHERE completed_at` in window; plus `ownerStaffId` | none | |
| `taskThroughput` | percent | Completions as a share of creations in the window. | numerator `tasksCompleted`; denominator `tasksCreated` | Tasks created in the window | **Not** a per-task completion rate — the two sets overlap but are not the same tasks. Above 100% means the backlog shrank. |
| `tasksOverdueNow` | count | Unfinished, unarchived tasks past their due date as of the request. | `crm_tasks WHERE status <> 'completed' AND archived_at IS NULL AND due_date < now()`; plus `ownerStaffId` | none | A snapshot of now; ignores the date range. Nothing records what was overdue on a past date. |
| `appointmentsScheduled` | count | Appointments whose `start_at` falls in the window, whatever their status now. | `crm_appointments.start_at` in window; plus `ownerStaffId` (organizer) | none | |
| `appointmentsCancelled` | count | Of those, the ones now cancelled. | `crm_appointments WHERE cancelled_at IS NOT NULL AND start_at` in window | none | |
| `meetingCancellationRate` | percent | Cancelled as a share of scheduled. | numerator `appointmentsCancelled`; denominator `appointmentsScheduled` | Meetings whose `start_at` falls in the window | `null` when no meetings were scheduled. |

### 4.5 Support

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `ticketsOpened` | count | Support tickets created in the window. | `crm_support_tickets.created_at` in window; plus `ownerStaffId` (assignee), `status` | none | |
| `ticketsResolved` | count | Tickets resolved in the window, whenever opened. | `crm_support_tickets WHERE resolved_at` in window; plus `ownerStaffId` | none | |
| `medianFirstResponseMinutes` | minutes | Median of `first_response_at` minus `created_at` for tickets opened in the window that have had a first reply. | `crm_support_tickets WHERE first_response_at IS NOT NULL AND created_at` in window | Tickets opened in the window that have received a first reply | `first_response_at` is stamped only by a **customer-visible** message from staff — an internal note is not a reply to anybody. Tickets still waiting are EXCLUDED, which flatters the figure; `ticketsOpened` minus this denominator is how many are missing. |
| `ticketResolutionRate` | percent | Resolutions as a share of tickets opened in the window. | numerator `ticketsResolved`; denominator `ticketsOpened` | Tickets opened in the window | As with tasks, the two sets overlap but are not identical. Measures whether the queue is shrinking, not what share of *these* tickets got solved. |

### 4.6 Campaigns

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `campaignEmailsSent` | count | Campaign emails the provider accepted, sent in the window — across the marketing campaigns and both legacy ledgers. | `crm_marketing_recipients`, `crm_campaign_recipients` and `crm_campaign_scheduled_messages`, each `WHERE status = 'sent' AND sent_at` in window | none | Spans all three ledgers deliberately: it is the denominator of the open and click rates, so it must be drawn from the same population as its numerator. "Sent" means the provider accepted it. It is not delivery, and certainly not readership. |
| `campaignSendFailures` | count | Campaign recipients at status `failed`, created in the window. | `crm_campaign_recipients WHERE status = 'failed' AND created_at` in window | none | The LEGACY ledger only. A marketing campaign's failures are split by what is actually known about each — refused, never handed over, or unconfirmed — on that campaign's own results screen; folding those three into one number here would lose the distinction that decides whether a message may safely be sent again. |
| `campaignEmailsOpened` | count | Campaign emails whose **first** recorded open falls in the window, counted once per message. | `crm_email_provider_events WHERE event_type = 'email.opened'`, matched to a campaign email by the provider's message id or by the `crm_ref` tag the send carried | Campaign emails sent in the window | **Conditionally unavailable** — see section 5. Once per message, not once per event: one recipient opening four times is one person who opened it, and counting four produces rates above 100%. An open is a tracking image loading — privacy proxies and security scanners load it — so it is never proof anybody read anything. |
| `campaignEmailsClicked` | count | Campaign emails whose **first** recorded click falls in the window, counted once per message. | `crm_email_provider_events WHERE event_type = 'email.clicked'`, matched the same way | Campaign emails sent in the window | **Conditionally unavailable** — see section 5. Security scanners follow links to check them, so a click is not always a person. |
| `campaignOpenRate` | percent | Opens as a share of sends. | numerator `campaignEmailsOpened`; denominator `campaignEmailsSent` | Campaign emails sent in the window | Unavailable whenever its numerator is. |
| `campaignClickRate` | percent | Clicks as a share of sends. | numerator `campaignEmailsClicked`; denominator `campaignEmailsSent` | Campaign emails sent in the window | Unavailable whenever its numerator is. |
| `campaignAttributedRevenue` | currency | Money that arrived because of a campaign. | none | none | **Permanently unavailable** — see section 5. |

### 4.7 Communications

| Key | Unit | Definition | Source and filter | Denominator | Limitations |
|---|---|---|---|---|---|
| `messagesSent` | count | Outbound messages — SMS, calls, email — created in the window. | `crm_messages WHERE direction <> 'inbound' AND created_at` in window | none | Not owned by anybody, so `ownerStaffId` is ignored. |
| `messagesReceived` | count | Inbound messages created in the window. | `crm_messages WHERE direction = 'inbound' AND created_at` in window | none | |
| `outboundSmsWithProviderStatus` | count | Outbound SMS in the window for which Twilio's status callback reported something. | `crm_messages WHERE channel = 'sms' AND direction <> 'inbound' AND status IS NOT NULL` in window | none | This, not "all outbound SMS", is the only denominator a delivery rate can honestly use. |
| `outboundSmsDelivered` | count | Outbound SMS in the window at provider status `delivered`. | `crm_messages WHERE channel = 'sms' AND direction <> 'inbound' AND status = 'delivered'` in window | Outbound SMS in the window with any provider status | |
| `smsDeliveryRate` | percent | Confirmed deliveries as a share of outbound SMS carrying a provider status. | numerator `outboundSmsDelivered`; denominator `outboundSmsWithProviderStatus` | Outbound SMS with a recorded provider status | Messages with no status are excluded from **both** halves rather than counted as failures: "the callback never arrived" is not "the phone never rang". |
| `conversationsResolved` | count | Conversations whose `resolved_at` falls in the window. | `crm_conversations WHERE resolved_at` in window; plus `ownerStaffId` (assignee) | none | |
| `medianMinutesToFirstReply` | minutes | How long a customer waits for the first answer to a new conversation. | none | none | **Permanently unavailable** — see section 5. |

---

## 5. Figures that report themselves as not tracked

A fabricated zero is worse than an honest gap, because a zero is a
measurement: it claims somebody looked. These report `available: false` with a
reason and, where applicable, what would have to exist to fix it.

### 5.1 Conditional — depends on this environment

**`campaignEmailsOpened`, `campaignEmailsClicked`, `campaignOpenRate`,
`campaignClickRate`**

Availability is decided by EVIDENCE, not by configuration. The question is not
whether a secret is set but whether an open (or a click) has ever actually been
recorded for the current sending domain, and whether that had begun before the
window being asked about ended. Three separate answers, all of them honest:

| State | What the figure says |
|---|---|
| No event of that kind has ever been recorded for this sending domain | *Not measured — open/click tracking isn't enabled for this sending domain.* When `RESEND_WEBHOOK_SECRET` is also unset, the reason names it, because then no event can be received at all. |
| Events exist, but the first one came **after** this window ended | *Not measured in this period* — nothing was measuring while these messages were sent. |
| Events exist from before the window ended | A real figure, carrying the privacy-proxy caveat, plus a note naming the date measurement began when the window starts before it. |

Open tracking and click tracking are **separate settings** on the domain in
Resend (and both need a verified tracking subdomain), so each metric is asked
about separately: opens can be measured while clicks are not.

`0%` is never used for any of this. A zero is a measurement — it says "we
looked, and the answer was none" — and the whole point of the distinction is
that nobody looked.

Turn tracking on for the sending domain, point the delivery webhook at
`POST /api/crm/webhooks/resend` (`docs/crm-ops/EMAIL-EVENTS-ACTIVATION.md`), and
all four become real figures with no code change — from the first event
onwards, which is the date the figures then cite.

> Bounce-derived numbers have the same dependency. `campaignSendFailures` is
> reported unconditionally because the send path also writes `failed` rows
> itself; a bounce that only the webhook would have recorded is missing from it
> when the webhook is off.

### 5.2 Structural — nothing in the schema can answer it

**`campaignAttributedRevenue`** — nothing links a payment, or the deal it
belongs to, to the campaign that influenced it. The only join available is
"this contact once received a campaign", and turning that into a revenue number
would be an attribution *model* presented as a *measurement* — a figure that
rises whenever you email more people, whether or not the emails did anything.

*Would require:* a campaign reference recorded on the deal or the transaction
at the point it is created.

**`medianMinutesToFirstReply`** — `crm_conversations` records `last_inbound_at`
and `last_outbound_at`: the most recent of each, and nothing else. The earliest
reply to the earliest message cannot be recovered from a thread that has since
continued. Computing it from the two "last" columns would answer a different
question and label it with this one's name. (Support tickets **do** record
this; see `medianFirstResponseMinutes`.)

*Would require:* a `first_response_at` column on `crm_conversations`, stamped
by the first outbound message after an inbound one.

### 5.3 Deliberately not offered at all

- **"Contacts qualified this period"** — see the note under 4.1.
- **Weighted forecast** — it exists, correctly, at `GET /crm/sales/forecast`,
  which states its stage-default assumption. Duplicating it here with a second
  set of assumptions would produce two forecasts that disagree.

---

## 6. Traceability

Every available counted figure carries `detail`, a URL onto
`GET /api/crm/reports/detail/<key>` with the same filters. That endpoint
returns `count`, `sum`, `median` and `rows`.

The guarantee is structural, not procedural: **the summary runs the detail
query and derives its number from those rows.** There is no separate
`count(*)`, so there is nothing for the count to disagree with. `count` always
equals `rows.length`, and `value` is `rows.length`, `sum(amount)` or
`median(amount)` according to the figure's unit.

Two refusals, both deliberate:

- a **ratio** returns `409` and names its numerator and denominators, because a
  ratio has no rows of its own;
- an **untracked** figure returns `409` with its reason, rather than an empty
  list that would read as "we looked and found none".

Detail lists are capped at 5000 rows. Past that a figure reports
`traceable: false` and says so in its `limitations` rather than silently
handing back a partial list.

---

## 7. The unified customer history

`GET /api/crm/history/:leadId` merges 23 event sources into one order.
`GET /api/crm/history/:leadId/customer` is the customer-visible projection.
`GET /api/crm/history-sources` returns the table below from the running system.

### 7.1 Sort key and paging

`(occurred_at, source, id)`, newest first. Every part is immutable once the
entry exists.

Paging is **keyset**, not offset. `?cursor=` names a position in the history
rather than a count into it, so events arriving while you page cannot shift,
skip or repeat the older ones. Walk until `nextCursor` is null; that is the
whole history, exactly once. No total is reported — a total over a merged,
growing history is a second query that can disagree with the pages it labels.

One row may produce several entries (a deal is opened, won, then converted).
Each is its own `source`, which is what keeps the sort key unique: if
`deal_won` and `deal_converted` both called themselves `deal`, one row could
produce two entries with the same key and a cursor landing between them would
drop one.

### 7.2 Sources, visibility and permissions

Visibility is **a field on every entry, not a convention**. The rule:

> An entry is `customer` only when the customer already sent it, received it,
> attended it, or paid it. **Everything else is internal.**

That is deliberately lopsided. A wrongly-internal entry means a customer portal
shows less than it could; a wrongly-customer entry means private commentary
about a client reaches that client. Those mistakes are not worth the same.

| Source | Kind | Table | Visibility | Needs grant |
|---|---|---|---|---|
| `message` | communication | `crm_messages` | customer | `communications.read` |
| `conversation_resolved` | communication | `crm_conversations` | internal | `communications.read` |
| `activity` | note | `crm_activities` | internal | `leads.read` |
| `comment` | note | `crm_comments` | **per row** (`is_internal`) | `leads.read` |
| `task_created` | task | `crm_tasks` | internal | `leads.read` |
| `task_completed` | task | `crm_tasks` | internal | `leads.read` |
| `appointment_scheduled` | meeting | `crm_appointments` | customer | `leads.read` |
| `appointment_completed` | meeting | `crm_appointments` | customer | `leads.read` |
| `appointment_cancelled` | meeting | `crm_appointments` | customer | `leads.read` |
| `document_requested` | document | `crm_document_requests` | customer | `documents.read` |
| `document_received` | document | `crm_document_requests` | customer | `documents.read` |
| `document_uploaded` | document | `crm_attachments` | internal | `documents.read` |
| `deal_opened` | deal | `crm_deals` | internal | `deals.read` |
| `deal_won` | deal | `crm_deals` | internal | `deals.read` |
| `deal_lost` | deal | `crm_deals` | internal | `deals.read` |
| `deal_converted` | deal | `crm_deals` | internal | `deals.read` |
| `project_started` | project | `crm_projects` | internal | `projects.read` |
| `project_update` | project | `crm_project_updates` | internal | `projects.read` |
| `payment_recorded` | payment | `crm_transactions` | internal | `deals.read` |
| `payment_received` | payment | `crm_transactions` | customer | `deals.read` |
| `ticket_opened` | support | `crm_support_tickets` | internal | `support.read` |
| `ticket_resolved` | support | `crm_support_tickets` | internal | `support.read` |
| `support_message` | support | `crm_support_messages` | **per row** (`visibility`) | `support.read` |

Notes on the less obvious choices:

- **`payment_recorded` is internal, `payment_received` is customer.** A pending
  or failed charge is not news the customer has had; money arriving is.
  `payment_received` filters on `TRANSACTION_RECEIVED_STATUS` with a non-null
  `received_at`.
- **`appointment_cancelled` is customer, but its `cancel_reason` is not.** The
  customer projection drops `detail` entirely and its summary carries only the
  meeting title.
- **`ticket_opened` and `ticket_resolved` are internal.** The customer-facing
  half of support is its `visibility = 'customer'` messages; the resolution
  vocabulary (`fixed`, `not_reproducible`, and the rest) is ours.
- **`document_uploaded` is internal.** A file attached to a record is not
  provably shared with the customer — `crm_document_shares` is what proves
  that, and nothing here reads it.

The customer projection is protected twice: the query filters on
`visibility = 'customer'`, and the result is filtered again on the way out. The
shape also drops `detail`, `status`, `record` and actor notes, so a caller that
ignores `visibility` altogether still cannot read a staff note out of a field
it was not looking at.

### 7.3 Permissions

Sources whose grant the caller does not hold are **not queried at all**, and
the response returns `sources.omitted` naming each withheld source and the
grant that would unlock it. Without that, a timeline that is short because of a
permission boundary is indistinguishable from a quiet client, and those are not
the same fact.

The legacy shared bearer (`CRM_LEGACY_BEARER_ENABLED`) sees every source — it
already had unrestricted access before staff accounts existed, so this is the
status quo being retired, not a new hole.

### 7.4 Attribution — never invent an actor

Most of this history predates staff accounts. `crm_activities.created_by` and
`crm_tasks.created_by` both carry `DEFAULT 'admin'`, so a large number of rows
claim an author that never existed. Those are reported as **unattributed** and
said to be unattributed. Crediting them to whoever is signed in today, or to
"Admin", would be the system telling a confident lie about who did what.

Resolution order, in `resolveActor()`:

1. `origin` of `inbound` or `customer` gives **customer** (labelled with the
   contact's name).
2. `origin` of `automated` or `system` gives **system** ("Automated").
3. A **staff id** gives **staff**. The id is the only thing that proves a person
   acted. The current display name is put on it per page; an id with no account
   keeps the label captured at write time and says the account is gone.
4. A free-text label that is not a placeholder gives **staff with no id**,
   flagged "recorded by name only — not linked to a staff account".
5. Anything else gives **unattributed**.

Placeholder labels treated as no label at all: `admin`, `administrator`,
`system admin`, `legacy-shared-bearer`, `unknown`, `n/a`, `-`, empty.

Sources that name **nobody**, because the row records ownership rather than
authorship and substituting one for the other would rewrite history whenever a
record is reassigned:

| Source | Why |
|---|---|
| `deal_opened`, `deal_converted` | `owner_staff_id` is whose deal it is *now*. |
| `project_started` | `owner_staff_id` and `assigned_to` are current ownership. |
| `appointment_completed` | Nothing records who marked it complete. |
| `document_received` | `crm_document_requests` has no "received by"; the upload may have come from the customer or from staff filing it, and the row cannot tell. |
| `payment_recorded` (non-Stripe) | A manual payment row records no author. Stripe rows are attributed to the system. |

### 7.5 Known limitations of the merge

- **Messages** are found by `lead_id` **or** by belonging to a conversation
  whose `contact_id` is this contact. A message with neither is not in anyone's
  history — by construction, since nothing says whose it is.
- **Comments, attachments and document requests** are entity-generic. The merge
  includes rows on the contact and on that contact's deals, projects and
  tickets. A row attached to any other entity type is out of scope.
- **`crm_leads.notes`** (a single free-text field on the contact) is not an
  event and has no timestamp, so it is not in the timeline. The lead detail
  page still shows it.
- **Mutable `occurred_at` columns** (`won_at`, `resolved_at`, `received_at`)
  are set once, at the moment the event happens, and the entry does not exist
  before that. An entry therefore *appears* in the history; it never *moves*
  within it. That is what keeps the cursor safe.

---

## 8. Tests

`artifacts/api-server/src/routes/crmHistory.test.ts` (12 tests) and
`artifacts/api-server/src/routes/crmReports.test.ts` (15 tests), both against
real PostgreSQL with the real Express app, gated on `CRM_TEST_DATABASE_URL`.

What they hold to:

- the merge contains every source, in one chronological order, scoped to one
  contact;
- a known history is recovered **exactly once** across many small pages,
  including with a new event landing mid-walk;
- the customer projection contains zero internal entries — checked by planting
  magic strings in internal rows and searching the whole serialised response;
- a row whose author is the literal `admin` default is unattributed and
  carries no staff member's name;
- **every** available counted figure equals the detail list it hands back;
- a ratio over an empty denominator is `null` and says why;
- an untracked figure is `available: false`, not `0`, and refuses to produce
  evidence;
- money uses `TRANSACTION_RECEIVED_STATUS`, keeps pending and refunded apart,
  and moves between days when the timezone changes;
- a restricted reader sees only their grants, and is told what was withheld.

Fixtures live in long-past windows (March 2019 for history, June 2017 for
reporting) that nothing else in the suite occupies, so exact counts are exactly
those rows and not whatever else the shared test database holds.
