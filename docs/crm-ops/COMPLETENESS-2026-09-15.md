# Verified completeness — 2026-09-15

Supersedes `COMPLETENESS-2026-09-14.md`. Read the method before the numbers.

## Method

`verified completeness = passed acceptance criteria ÷ total required criteria × 100`

- Criteria are written from the original 18-area brief **before** counting, not
  derived from what happens to work. The denominators are unchanged from the
  14 Sept table so the two are comparable.
- A criterion passes only on evidence: a committed test that fails when the
  behaviour breaks, a browser interaction actually performed, or a recorded
  command exit code. **Rendering a page, or a route returning 200, passes
  nothing.**
- **Implemented-but-unverified counts as NOT passed** and is listed separately.
  It is not missing; it is unproven, and those are different claims.
- Nothing was removed from a denominator to improve a percentage. Deferred
  scope (offline editing, push) stays in and counts as failed, because it is
  absent from the product regardless of why.

### Environments

| Tag | What it is |
|---|---|
| **L** | Local: web `localhost:22065` + API `localhost:8080` against `crm_preview`. |
| **T** | Automated suites against `crm_test`. |
| **R** | Verified at the real provider (Resend), not simulated. |
| **P** | Production `sitemintdigital.com`. |

**Nothing in this release runs in P.** `sitemintdigital.com` is a marketing app
that reverse-proxies `/api` to a second Replit deployment last published ~2
months ago. On that deployment only `/api/healthz` answers; `/api/readyz`,
every `/api/crm/*` route, `/api/receptionist/me` and `/api/discovery/v1/health`
all return 404. The deployment could not be updated this session — see
§"Production" below.

---

## Table 1 — the 18 core feature areas

| # | Area | Passed / total | % | Env | Evidence | Missing / blocked |
|---|---|---|---|---|---|---|
| 1 | Contact management | 6 / 7 | **86%** | L, T | **Import** previews before committing and refuses a plan that no longer hashes to the approved one; a bad row reports its reason without aborting the file; re-import matches rather than duplicating. **Export** respects the visible selection, permission-gated on `data.export`. **Duplicate review** at `/admin/crm/duplicates` found 10 real pairs in the preview data; merge repoints history and deletes nothing. 25 tests, **mutation-tested with 7 deliberate regressions, all caught** | No separate account entity — a customer is still a lead with status `Client` |
| 2 | Lead management | 4 / 6 | **67%** | L, T | Discovery intake → lead; 18 smart lists; scoring engine; assignment permission-gated | **`assignedTo` is still free text, not a staff reference**; no reviewed legacy-name mapping. Not attempted this session |
| 3 | Sales pipeline | 7 / 7 | **100%** | L, T | `crmSales.test.ts`; 3 concurrent conversions → 1 project; forecast keeps pipeline/weighted/contracted/received apart with stated bases | — |
| 4 | Customer communication | 7 / 9 | **78%** | L, T, **R** | Durable conversations; read/assign/resolve proven independent; sender attribution 4/4; **outbound now provider-verified — a CRM message reached `claidyklaydetaguran@gmail.com` and Resend reports it `Delivered`** | **Inbound not active** (no MX, no webhook destination); **no delivery-event processing** |
| 5 | Tasks, activities, reminders | 8 / 8 | **100%** | L, T | My Day across 5 buckets, empty state, forced API failure + recovery, 375px, built app. **`due_kind` now stores whether a deadline is a day or a moment** instead of inferring it from midnight; DST-tested both UK transitions; created two tasks in the browser, reloaded, and confirmed a date-only task shows "Today" with no misleading `00:00` while a timed one shows "Today 09:00" | — |
| 6 | Support & knowledge base | 7 / 9 | **78%** | L, T | 23 + 19 tests; internal-note isolation verified live; delivery state machine; reply-token correlation | **No support message has gone through the live provider**, and no customer has replied |
| 7 | Marketing automation | 9 / 11 | **82%** | L, T | Guided 4-step flow (Audience → Email → Preview/test → Send) walked again today, autosave live, suppression shown inline, nobody pre-ticked. **Fixed today: a campaign mailed one person once per duplicate contact row** — the picker showed one contact five times; now 5 in, 1 eligible, 4 excluded with a reason naming the recipient. Mutation-tested | **No campaign has been sent through the live provider**; **opens/clicks genuinely untracked** and reported as such |
| 8 | Reporting & analytics | 8 / 9 | **89%** | L, T | 39 figures each with definition, denominator and its own rows; money agreed at $16,000 across 3 surfaces | 4 email-engagement figures report "not tracked" — needs the Resend event webhook, which needs a deployed destination |
| 9 | Documents | 7 / 8 | **88%** | L, T | **Quotes and invoices built**: line items, server-side totals immune to a tampered client total, integer minor units (float drift refused, not rounded), declared state machines, payments reconciling with the existing money contract, rendered into the existing document store and visible in the portal. 21 tests | **No signing integration.** An accepted quote is still explicitly `not_a_signature`; requirements written up in `E-SIGNATURE-REQUIREMENTS.md` as deferred, not done |
| 10 | Workflow automation & approvals | 10 / 10 | **100%** | L, T | 19 + 5 + 10 + 12 tests; three loop brakes; approvals by identity; durable event log. **Failed automation is now visible** in Operations with two genuinely different verbs — retry buys exactly one more attempt through the ordinary path (occurrence key and all three brakes re-applied), acknowledge re-runs nothing. Retry refused where it cannot be made safe, with the reason on the card | — |
| 11 | Users, roles, permissions | 8 / 9 | **89%** | L, T | scrypt, TOTP, revocable sessions, CSRF, throttling, audit; activation grants the identical 37-permission owner set; restricted user refused at every boundary. **Timezone is now settable and validated** (it was read-only, so every account was stuck on UTC) | **MFA is not enrolled on any real account yet** — the capability exists on My Account, nobody has used it |
| 12 | Interaction history | 6 / 6 | **100%** | L, T | 23 sources merged, keyset-paged; "What the client can see" drops an internal note while keeping the customer reply; unattributed rows labelled | — |
| 13 | Calendar & scheduling | 7 / 8 | **88%** | L, T | Create, reschedule, mark held, cancel, `.ics` export, reminders. **Attendee invitations built**: stable UID, incrementing SEQUENCE so an update replaces rather than duplicates, `METHOD:CANCEL` on cancellation, a non-material edit mails nobody, attendee in another timezone gets the right instant. 24 tests | **`.ics` is an export, not two-way calendar sync.** No invitation has been sent through the live provider |
| 14 | Integrations | 0 / 5 | **0%** | — | — | No connectors. Needs owner decisions on providers |
| 15 | Mobile / offline / push | 5 / 8 | **63%** | L | **30 CRM pages checked at a real emulated 375×812 viewport: none scrolls horizontally.** Discovery and Settings now confirmed rendering populated, not just source-fixed. Deals edit tapped and the dialog opened on a touch device | **Offline editing deferred by owner decision**; **push not built** — no service worker, Workbox, VitePWA, web-push, PushManager or VAPID anywhere |
| 16 | Customer portal | 6 / 8 | **75%** | T, L | 21 tests, 12/12 isolation mutations caught; cross-contact access returns 404 not 403; documents default-deny; accepted proposal never labelled signed. All 8 portal pages render with customer chrome and **no staff chrome leaked** | **No staff UI could issue an invitation** — found today, the API had no caller anywhere in the frontend. Being built; not counted until verified. **Never exercised by a real customer session end to end** |
| 17 | Security | 7 / 9 | **78%** | L, T | MFA + audit; webhook signature enforcement verified live (unsigned 400, forged 400, signed 200, hour-old replay 400); destructive-cleanup guard prevents a suite deleting real accounts, and now aborts the whole test run if pointed at the preview database. **The 14 Sept "unexplained activation" is resolved** — see §Account below | Transport/at-rest encryption are hosting properties, unevidenced; **no restore rehearsal on a real target** |
| 18 | Dashboard | 6 / 6 | **100%** | L, T | 11 clickable panels, counts from one server function, filters, polling that pauses when hidden; uninstrumented metrics say why rather than showing zero | — |

**Totals: 118 / 143 criteria = 82.5% verified locally** (was 108 / 143 = 75.5%).
**0% verified in production.** One capability — outbound email — is now verified
at the real provider.

---

## Table 2 — every CRM page, one row each

Derived from the router by `routeInventory.ts`, not hand-listed: **47 pages**
(39 staff + 8 portal). The 14 Sept table said 46; `/admin/crm/duplicates` is new.
That reconciliation is why the count moved.

Status vocabulary:
- **Walked** — a real action performed and its result checked.
- **Signed in, rendered** — opened with a real staff session against real
  preview data; content present, **zero console errors, zero failed API calls**.
- **Renders, data refused** — the page loads but its own API call is rejected.
- **Not opened** — no evidence.

All rows below marked L were opened on 2026-09-15 in a real browser with a real
staff session. The 375px column is a real emulated 375×812 viewport.

| # | Route | Status | 375px | Evidence |
|---|---|---|---|---|
| 1 | `/admin` | Signed in, rendered | — | Login shell |
| 2 | `/admin/crm/dashboard` | **Walked** | clean | Money panel cross-checked against forecast + transactions; $16,000 / 4 transactions agreed |
| 3 | `/admin/crm/my-day` | **Walked** | clean | Two tasks created, **reloaded**, bucketing and display confirmed for both deadline kinds; invalid kind refused 400 |
| 4 | `/admin/crm/leads` | **Walked** | clean | Export sent exactly the 16 visible ids; filtered to `Client` sent 9 |
| 5 | `/admin/crm/leads/:id` (`/6`) | **Walked** | clean | Full History tab; "What the client can see" drops the internal note. Controls enumerated — this is how the missing portal invitation was found |
| 6 | `/admin/crm/leads/:id/dna` | Signed in, rendered | clean | 727 chars, Lead DNA for a named contact |
| 7 | `/admin/crm/duplicates` | **Walked** | clean | 10 real duplicate pairs in preview data; merge preserves history from both sides |
| 8 | `/admin/crm/import` | **Walked** | clean | Upload → preview (2 create / 2 error with per-row reasons, 1 ignored column) → mapping editor → commit → "2 Created, 2 Failed" |
| 9 | `/admin/crm/deals` | **Walked** | clean | Edit tapped at 375px on a touch device; dialog opened with all fields reachable |
| 10 | `/admin/crm/pipeline` | Signed in, rendered | clean | 3,199 chars of real pipeline |
| 11 | `/admin/crm/projects` | Signed in, rendered | clean | Project pipeline populated |
| 12 | `/admin/crm/tasks` | Signed in, rendered | clean | Kind-aware overdue labels |
| 13 | `/admin/crm/calendar` | Signed in, rendered | clean | Populated; create/reschedule/cancel/`.ics` verified in an earlier milestone |
| 14 | `/admin/crm/documents` | Signed in, rendered | clean | 1,922 chars; billing panel present |
| 15 | `/admin/crm/inbox` | **Walked** | clean | Read / assign / resolve proven three independent facts; draft survived reload |
| 16 | `/admin/crm/communications` | Signed in, rendered | clean | Populated |
| 17 | `/admin/crm/support` | **Walked** | clean | Ticket created, internal note + customer reply posted, internal note proven absent from the customer view |
| 18 | `/admin/crm/operations` | Signed in, rendered | clean | Four tabs incl. the new Automation tab; honest empty states |
| 19 | `/admin/crm/reporting` | Signed in, rendered | clean | 7,447 chars — 39 figures with definitions; "cannot measure" section present |
| 20 | `/admin/crm/transactions` | **Walked** | clean | 4 rows, $16,000 total, count matches list |
| 21 | `/admin/crm/discovery` | Signed in, rendered | clean | Renders; the 10-column table fix now confirmed live, not only in source |
| 22 | `/admin/crm/settings` | Signed in, rendered | clean | 4,346 chars populated; the clipped-table fix now confirmed live |
| 23 | `/admin/crm/campaign-builder` | **Walked** | clean | Create → step 1 Audience; 13 contacts listed, nobody pre-ticked, suppression shown inline; **duplicate-address exclusion verified on real data (5 in, 1 eligible, 4 excluded)**; AI drafting refuses with a plain-language 503 |
| 24 | `/admin/crm/campaigns` | Signed in, rendered | clean | Sequence builder |
| 25 | `/admin/crm/campaign-queue` | Signed in, rendered | clean | Sequence message queue |
| 26 | `/admin/crm/email-templates` | Signed in, rendered | clean | Empty state |
| 27 | `/admin/crm/workspace` | Signed in, rendered | clean | Sales Workspace, 1,324 chars |
| 28 | `/admin/crm/people` | Signed in, rendered | clean | 1,492 chars |
| 29 | `/admin/crm/account` | **Walked** | clean | Timezone set to `Asia/Manila` and persisted; fake zone refused 400 |
| 30 | `/admin/crm/admin` | Signed in, rendered | clean | Staff admin, 1,277 chars |
| 31 | `/admin/crm/intelligence/automation-queue` | Signed in, rendered | clean | 7,928 chars populated |
| 32 | `/admin/crm/intelligence/behavioral` | Signed in, rendered | — | Renders; honest empty state |
| 33 | `/admin/crm/intake-cases` | Signed in, rendered | — | Renders with its own empty state |
| 34 | `/admin/crm/receptionist-accounts` | **Renders, data refused** | — | **`401 /api/admin/receptionist-accounts`** — see §Legacy auth |
| 35 | `/admin/ops/firms` | **Renders, data refused** | — | **`401 /api/admin/receptionist-accounts`** |
| 36 | `/admin/ops/firms/:id` | **Renders, data refused** | — | **`401 /api/admin/voice/firms/4/diagnostics`** |
| 37 | `/admin/ops/issues` | Signed in, rendered | — | Renders; Receptionist Ops, another workstream |
| 38 | `/admin/ops/numbers` | Signed in, rendered | — | Renders; Receptionist Ops |
| 39 | `/admin/ops/usage` | Signed in, rendered | — | Renders; Receptionist Ops |
| 40 | `/portal/sign-in` | Signed in, rendered | — | Customer chrome; no staff banner |
| 41 | `/portal` | Rendered (signed out) | — | Customer chrome; `401 /api/portal/me` — correct with no portal session |
| 42 | `/portal/projects` | Rendered (signed out) | — | Customer chrome; 401 as above |
| 43 | `/portal/documents` | Rendered (signed out) | — | Customer chrome; 401 as above |
| 44 | `/portal/proposals` | Rendered (signed out) | — | Customer chrome; 401 as above |
| 45 | `/portal/invoices` | Rendered (signed out) | — | Customer chrome; 401 as above |
| 46 | `/portal/support` | Rendered (signed out) | — | Customer chrome; 401 as above |
| 47 | `/portal/accept` | Rendered (signed out) | — | "Set your password" — the token landing page |

**Walked: 11. Signed in and rendered with real data: 22. Renders but its data
call is refused: 3. Rendered signed-out (portal, correct): 7. Never opened: 0.**

Every one of the 39 staff pages was opened with a real session; **zero console
errors across all of them**. That is a genuine change from 14 Sept, when 31 of
46 had never been opened. It is still not the same as "tested": 22 of them were
looked at, not used.

### The portal caveat, stated plainly

The 7 portal content pages were rendered **signed out**. Their 401s are correct
behaviour, not a defect — but it means no portal page has been seen with a
customer's real data, because until today nothing in the CRM could issue an
invitation. That is the single biggest remaining hole in this table.

### Legacy auth — 3 pages a staff session cannot use

`/admin/crm/receptionist-accounts`, `/admin/ops/firms` and `/admin/ops/firms/:id`
call routes still guarded by the old `requireAdmin` (the shared
`ADMIN_PASSWORD`) rather than `requireStaff`/`requireCrmAuth`. A signed-in
member of staff therefore reaches the page and gets an error. These are
Receptionist Ops routes belonging to another workstream, so they were **not
changed** — reported for the integration owner instead.

---

## Provider capabilities, reported separately

| Capability | State | Evidence |
|---|---|---|
| **Outbound sending** | **Verified** | Domain `sitemintdigital.com` was already **Verified** in Resend (DKIM `resend._domainkey`, SPF + feedback MX on `send.`, region us-east-1). A new key `SiteMint CRM (sending)` was created, scoped to **Sending access** on **that domain only** — proven by the API refusing a read with `restricted_api_key`. A real CRM message reached the owner's mailbox; Resend shows **Delivered** |
| **Inbound receiving** | **Not configured — blocked** | `reply.sitemintdigital.com` does not exist yet. Resend will not publish the MX target outside its dashboard, and it must not be pointed anywhere until a deployed webhook destination exists. The apex still has **no MX at all**, so nothing to preserve |
| **Delivery-event processing** | **Not configured — blocked** | Needs a webhook endpoint at a public URL. Resend currently has **zero webhooks** configured. Signature verification, replay protection and dedup are implemented and tested, but no real event has been processed |
| **Open / click tracking** | **Available but not set up** | Resend offers it behind a **custom tracking subdomain**, unconfigured. Until then, opens and clicks are genuinely unmeasurable and the product says so rather than showing zero |
| **AI drafting** | **Not configured — needs you** | `platform.openai.com` redirects to `/login` in the authorised Chrome profile, so no key could be created. The product refuses honestly: HTTP 503, plain-language message, no invented draft. Nothing fabricated |

**Nothing was auto-released.** No campaign was sent, no queue drained, no
customer contacted. The only real email sent all session was the owner's own
password-setup link.

---

## Deferred and optional, shown rather than hidden

| Item | State | Why |
|---|---|---|
| Offline editing / write queue | **Deferred by owner decision** | Online-first this release. Counted as failed in area 15 |
| Browser push notifications | **Not built** | Verified absent — no service worker, Workbox, VitePWA, web-push, PushManager or VAPID anywhere |
| Third-party integrations | **Not started** | Needs provider decisions |
| E-signature | **Deferred, requirements written** | `E-SIGNATURE-REQUIREMENTS.md`; no provider chosen |
| Two-way calendar sync | **Not built** | `.ics` is an export |

---

## The reference video

`https://www.youtube.com/watch?v=74qo2kJsTAM` — **not watched. No timestamps are
claimed, because none were observed.** The written companion article was fetched
on 2026-09-12 and its 14 feature areas are mapped in `REFERENCE-MAPPING.md`. Our
brief is 18 areas and remains 18; the reference's shorter list has never
narrowed it.
