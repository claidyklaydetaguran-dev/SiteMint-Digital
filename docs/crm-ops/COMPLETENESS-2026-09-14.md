# Verified completeness — 2026-09-14

> **Superseded by `COMPLETENESS-2026-09-15.md`.** Kept as the snapshot it was,
> because parts of it were later corrected by evidence rather than by opinion —
> most of all the page table, where 31 of 46 pages had never been opened. Do not
> cite these numbers as current.

Two tables, as asked. Read the method first, because the numbers mean nothing
without it.

## Method

`verified completeness = passed acceptance criteria ÷ total required criteria × 100`

- Criteria are written from the original 18-area brief **before** counting, not
  derived from what happens to work.
- A criterion passes only on evidence: a committed test that fails when the
  behaviour breaks, a browser interaction actually performed, or a recorded
  command exit code. **Rendering a page, or a route returning 200, passes
  nothing.**
- **Implemented-but-unverified is counted as NOT passed** and listed separately.
  It is not missing; it is unproven, and those are different claims.
- Nothing was removed from a denominator to improve a percentage. Deferred
  scope (offline editing, push) stays in the denominator and counts as failed,
  because it is absent from the product regardless of why.

### Environments

| Tag | What it is |
|---|---|
| **L** | Local: web `localhost:22065` + API `localhost:8080` against `crm_preview`. |
| **T** | Automated suites against `crm_test`. |
| **P** | Production `sitemintdigital.com`. |

**Nothing in this release is verified in P.** The production host serves the
site and a stale Express build — `/api/healthz` answers `{"status":"ok"}` but
`/api/readyz` and every `/api/crm/*` route return 404. There is no deployed CRM
API, so no CRM workflow has been exercised anywhere a customer or the team
would actually use it.

---

## Table 1 — the 18 core feature areas

| # | Area | Passed / total | % | Env | Evidence | Missing / blocked |
|---|---|---|---|---|---|---|
| 1 | Contact management | 4 / 7 | **57%** | L, T | Contacts list, detail, create/edit persist; merged history on the detail tab | No separate account entity (a customer is a lead with status `Client`); **no duplicate review**; **no import/export round trip** |
| 2 | Lead management | 4 / 6 | **67%** | L, T | Discovery intake → lead; 18 smart lists; scoring engine; assignment permission-gated | `assignedTo` is still free text, not a staff reference; no reviewed legacy-name mapping |
| 3 | Sales pipeline | 7 / 7 | **100%** | L, T | `crmSales.test.ts`; 3 concurrent conversions → 1 project verified in browser; forecast keeps pipeline/weighted/contracted/received apart with stated bases | — |
| 4 | Customer communication | 6 / 9 | **67%** | L, T | Durable conversations; read/assign/resolve proven independent in browser; sender attribution 4/4; inbound ingestion + reply-token correlation tested | **Inbound not active** (no MX, no API key); **no delivery-event verification**; nothing provider-verified |
| 5 | Tasks, activities, reminders | 8 / 8 | **100%** | L, T | My Day verified across 5 buckets, empty state, forced API failure + recovery, 375px, built app; durable reminder engine; overdue semantics corrected and DST-tested | — |
| 6 | Support & knowledge base | 7 / 9 | **78%** | L, T | 23 + 19 tests; internal-note isolation verified live in browser; delivery state machine; reply-token correlation | **Not provider-verified** — every test mocks the mail seam, no message has reached Resend; no customer has replied |
| 7 | Marketing automation | 9 / 11 | **82%** | L, T | Guided 4-step flow walked in browser; **hand-picking an unsubscribed contact verified excluded** (size 2, eligible 1); suppression, fallbacks, pause/cancel, autosave conflict | **No real send observed** (no API key); **opens/clicks genuinely untracked** and reported as such |
| 8 | Reporting & analytics | 8 / 9 | **89%** | L, T | 39 figures each with definition, denominator and its own rows; count derived from the detail query; money agreed at $16,000 across 3 surfaces | 4 email-engagement figures report "not tracked" — needs the Resend webhook |
| 9 | Documents | 5 / 8 | **63%** | L, T | Upload, versioning, authenticated download, hashed share tokens with expiry/ceiling/revocation, document requests | **Invoices and quotes not built**; **no signing integration** — uploads and accepted proposals are explicitly `not_a_signature` |
| 10 | Workflow automation & approvals | 9 / 10 | **90%** | L, T | 19 + 5 + 10 tests; three loop brakes; approvals by identity; durable event log; time triggers now fire with corrected overdue semantics. **Failed events and runs now have an operator surface** — Operations → Automation, `GET /api/crm/automation/failures` (+ 12 tests) — with retry withheld wherever re-running could repeat a side effect | The failure surface has **not been walked in a signed-in browser**: its 375px layout, empty and error states were verified against the real component with a stubbed API, and the payload it renders is verified by `crmAutomationFailures.test.ts`, but nobody has yet clicked retry or acknowledge in the live CRM |
| 11 | Users, roles, permissions | 8 / 9 | **89%** | L, T | scrypt, TOTP, revocable sessions, CSRF, throttling, audit; **activation proven to grant the identical 37-permission owner set**; restricted user refused at every boundary | MFA not enrolled on any real account yet |
| 12 | Interaction history | 6 / 6 | **100%** | L, T | 23 sources merged, keyset-paged; **"What the client can see" verified to drop an internal note** while keeping the customer reply and meeting; unattributed rows labelled | — |
| 13 | Calendar & scheduling | 5 / 8 | **63%** | L, T | Create, reschedule, mark held, cancel, `.ics` export, reminders driven live | **Attendee invitation email not built** (`invitationsSent: false`, reported not implied); `.ics` is an export, not sync |
| 14 | Integrations | 0 / 5 | **0%** | — | — | No connectors. Needs owner decisions on providers |
| 15 | Mobile / offline / push | 4 / 8 | **50%** | L | 43 CRM + 8 portal pages at 375px, zero overflow; **Deals edit tapped and the dialog opened on a touch device**; 4 tap targets enlarged | Discovery/Settings tables **source-fixed only, not verified populated**; **offline editing deferred by decision**; **push not built** |
| 16 | Customer portal | 6 / 8 | **75%** | T | 21 tests, 12/12 isolation mutations caught; cross-contact access returns 404 not 403; documents default-deny; accepted proposal never labelled signed | **Never exercised by a real customer session end to end**; no invitation delivered |
| 17 | Security | 6 / 9 | **67%** | L, T | MFA + audit; **webhook signature enforcement verified live** (unsigned 400, forged 400, signed 200, hour-old replay 400); backup/restore drill scripts; **destructive-cleanup guard now prevents a suite deleting real accounts** | Transport/at-rest encryption are hosting properties, unevidenced; no restore rehearsal on a real target; **one unexplained activation of the owner account (see handoff)** |
| 18 | Dashboard | 6 / 6 | **100%** | L, T | 11 clickable panels, counts from one server function, filters, polling that pauses when hidden; uninstrumented metrics say why rather than showing zero | — |

**Totals: 108 / 143 criteria = 75.5% verified locally. 0% verified in production.**

---

## Table 2 — every CRM page

38 staff pages + 8 portal pages, derived from the router by
`routeInventory.ts`, not hand-listed.

Legend: **Walked** = a real action performed and its result checked.
**Rendered** = loaded and inspected, no workflow exercised. **Not opened** =
no evidence this session.

| Route | Status | Env | Evidence |
|---|---|---|---|
| `/admin` | Rendered | L | Login page loads |
| `/admin/crm/dashboard` | **Walked** | L | Money panel cross-checked against forecast + transactions; $16,000 / 4 transactions agreed |
| `/admin/crm/my-day` | **Walked** | L | 5 buckets, empty state, forced 500 + working Retry, 375px, built app, direct + sidebar nav |
| `/admin/crm/support` | **Walked** | L | Ticket created, internal note + customer reply posted, internal note proven absent from customer view |
| `/admin/crm/campaign-builder` | **Walked** | L | 4-step flow, 3 audience modes, nobody pre-ticked, suppression bypass attempt refused |
| `/admin/crm/deals` | **Walked** | L | Edit tapped at 375px on a touch device; Edit Deal dialog opened with all fields reachable |
| `/admin/crm/leads/:id` | **Walked** | L | Full History tab; "What the client can see" drops the internal note |
| `/admin/crm/inbox` | **Walked** | L | Read / assign / resolve proven three independent facts; draft survived reload |
| `/admin/crm/transactions` | **Walked** | L | 4 rows, $16,000 total, count matches list |
| `/admin/crm/operations` | Rendered | L | Delivery Issues tab with honest empty state |
| `/admin/crm/reporting` | Rendered | L | 39 figures with definitions; "cannot measure" section present |
| `/admin/crm/campaigns` | Rendered | L | Sequence builder; renamed in nav to "Sequences" |
| `/admin/crm/campaign-queue` | Rendered | L | Sequence queue; renamed to "Sequence Queue" |
| `/admin/crm/discovery` | **Rendered empty only** | L | Empty state; **the 10-column table fix is source-verified, NOT exercised populated** |
| `/admin/crm/settings` | **Rendered empty only** | L | **Clipped-table fix source-verified, NOT exercised populated** |
| `/admin/crm/calendar` | Not opened this session | — | Verified in an earlier milestone (create/reschedule/cancel/.ics, reminders live) |
| `/admin/crm/documents` | Not opened this session | — | Verified earlier (upload, download headers, share links) |
| `/admin/crm/projects`, `/tasks`, `/pipeline`, `/workspace`, `/people`, `/account`, `/admin`, `/import`, `/email-templates`, `/communications`, `/intake-cases`, `/receptionist-accounts`, `/leads`, `/leads/:id/dna`, `/intelligence/behavioral`, `/intelligence/automation-queue` | **Not opened this session** | — | No evidence gathered. Route registered and classified only |
| `/admin/ops/firms`, `/firms/:id`, `/issues`, `/numbers`, `/usage` | **Not opened this session** | — | Receptionist Ops, owned by another workstream |
| `/portal/sign-in` | Rendered | L | Customer chrome, no "AUTHORIZED PERSONNEL" banner |
| `/portal`, `/accept`, `/projects`, `/documents`, `/proposals`, `/invoices`, `/support` | **Not opened** | T only | Covered by 21 API tests; **no page opened in a browser, no real customer session** |

**Pages walked: 9 of 46 (20%). Rendered only: 6. Not opened: 31.**

That is the honest figure, and it is the weakest part of this release. A
passing API test does not establish that a page works.

---

## Deferred and optional, shown rather than hidden

| Item | State | Why |
|---|---|---|
| Offline editing / write queue | **Deferred by owner decision** | Online-first this release. Counted as failed in area 15 |
| Browser push notifications | **Not built** | Verified absent — no service worker, Workbox, VitePWA, web-push, PushManager or VAPID anywhere. No stub added |
| Third-party integrations | **Not started** | Needs provider decisions |

---

## The reference video

`https://www.youtube.com/watch?v=74qo2kJsTAM` — **not watched. No timestamps
are claimed, because none were observed.** The written companion article was
fetched on 2026-09-12 and its 14 feature areas are mapped in
`REFERENCE-MAPPING.md`. Our brief is 18 areas and remains 18; the reference's
shorter list has never narrowed it.
