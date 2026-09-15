# Verified completeness

> **Generated** from `docs/crm-ops/completeness/criteria.json` and `pages.json` by `render.ts` — do not edit by hand. As of 2026-09-15.

## Method

`verified completeness = passed criteria ÷ total criteria × 100`, computed from the rows below.

- A criterion passes only on evidence: a committed test that fails when the behaviour breaks, an action actually performed and checked, or a recorded exit code. Rendering a page, or a route returning 200, passes nothing.
- Statuses: **Passed**; **Built, not proven** (implemented, unverified — not passed); **Not passed**; **Deferred by decision** (kept in the denominator).
- Environments: **L** local (web :22065, API :8080, preview database) · **T** automated suites on a disposable database · **R** verified at the real provider · **P** production.
- Nothing is removed from a denominator to improve a percentage.

## Table 1 — the 18 core feature areas

**131 / 150 criteria = 87.3% verified.** At the real provider: 8. In production: **0**.

By status: Passed 131 · Built, not proven 1 · Not passed 17 · Deferred by decision 1.

The denominator is 143 baseline criteria plus 7 added from the owner's brief after the baseline was set; each is listed under "Criteria added after the baseline" with its reason.

| # | Area | Passed / total | % | Verified in | In production | What is not passed |
|---|---|---|---|---|---|---|
| 1 | Contact management | 6 / 7 | **85.7%** | L, T | 0 | 1.7 Companies/accounts are modelled separately from the people who work there |
| 2 | Lead management | 6 / 6 | **100.0%** | L, T | 0 | — |
| 3 | Sales pipeline | 7 / 7 | **100.0%** | L, T | 0 | — |
| 4 | Customer communication | 7 / 9 | **77.8%** | L, T, R | 0 | 4.8 Inbound replies arrive through the real provider; 4.9 Delivery events from the real provider update message state |
| 5 | Tasks, activities and reminders | 8 / 8 | **100.0%** | L, T | 0 | — |
| 6 | Support and knowledge base | 8 / 9 | **88.9%** | L, T, R | 0 | 6.9 A customer's emailed reply lands on the right ticket |
| 7 | Marketing automation | 15 / 17 | **88.2%** | L, T, R | 0 | 7.11 Engagement is measured where the provider supports it; 7.17 A real AI draft is produced in the campaign editor |
| 8 | Reporting and analytics | 8 / 9 | **88.9%** | L, T | 0 | 8.9 Email engagement figures come from real provider events |
| 9 | Documents | 7 / 8 | **87.5%** | L, T | 0 | 9.8 Agreements can be signed electronically through a provider |
| 10 | Workflow automation and approvals | 10 / 10 | **100.0%** | T | 0 | — |
| 11 | Users, roles and permissions | 9 / 10 | **90.0%** | L, T | 0 | 11.9 Two-step verification is enrolled on the real owner accounts |
| 12 | Interaction history | 6 / 6 | **100.0%** | L, T | 0 | — |
| 13 | Calendar and scheduling | 7 / 8 | **87.5%** | L, T, R | 0 | 13.8 Two-way sync with external calendars |
| 14 | Integrations | 0 / 5 | **0.0%** | — | 0 | 14.1 An accounting or payments connector; 14.2 Calendar provider sync; 14.3 An e-signature provider; 14.4 Team notifications to a chat tool; 14.5 Outbound webhooks or an API for other systems |
| 15 | Mobile, offline and push | 6 / 8 | **75.0%** | L, T | 0 | 15.6 Offline editing with a write queue (deferred); 15.7 Push notifications |
| 16 | Customer portal | 8 / 8 | **100.0%** | L, T, R | 0 | — |
| 17 | Security | 7 / 9 | **77.8%** | L, T | 0 | 17.8 Encryption in transit and at rest is evidenced for production (built, not proven); 17.9 A backup has been restored into an isolated target |
| 18 | Dashboard | 6 / 6 | **100.0%** | L, T | 0 | — |

## Table 2 — every CRM page, one row per registered route

50 routes derived from the router (41 staff, 7 customer, 2 token-landing). Each is scored against the same 6 checks:

- **open** — Opens in a browser with a real session and populated data, with no console errors
- **action** — Its main action was performed in a browser and the result checked
- **persist** — After a full reload the page shows the stored result (for a page that changes nothing: the same stored data)
- **permission** — The wrong person is refused or scoped — proven in a browser or by an API test
- **recovery** — A failed request shows a real error state and the page recovers
- **mobile** — At 375px no element is clipped or unreachable (content without a scrollable ancestor is measured, not page scroll)

**142 / 300 page checks = 47.3%.** Pages passing all 6: 1. Pages passing none: 2.

By status: Passed 142 · Built, not proven 156 · Not passed 2 · Deferred by decision 0.

| Check | Pages passing |
|---|---|
| open | 41 / 50 (82.0%) |
| action | 21 / 50 (42.0%) |
| persist | 10 / 50 (20.0%) |
| permission | 20 / 50 (40.0%) |
| recovery | 2 / 50 (4.0%) |
| mobile | 48 / 50 (96.0%) |

| # | Route | Page | Passed / 6 | % | Verified in | Not passed yet |
|---|---|---|---|---|---|---|
| 1 | `/admin` | Sign-in and first-run setup | 4 / 6 | 66.7% | L, T | persist, recovery |
| 2 | `/admin/activate` | Staff invitation and password-reset landing | 5 / 6 | 83.3% | L, T | recovery |
| 3 | `/admin/dashboard` | Legacy Discovery Portal | 0 / 6 | 0.0% | — | open, action, persist, permission, recovery, mobile |
| 4 | `/admin/submissions/:id` | Legacy submission detail | 0 / 6 | 0.0% | — | open, action, persist, permission, recovery, mobile |
| 5 | `/admin/crm/dashboard` | Command Center | 3 / 6 | 50.0% | L | persist, permission, recovery |
| 6 | `/admin/crm/leads/:id/dna` | Lead DNA | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 7 | `/admin/crm/leads/:id` | Contact record | 4 / 6 | 66.7% | L, T, R | persist, recovery |
| 8 | `/admin/crm/leads` | Contacts | 4 / 6 | 66.7% | L, T | persist, recovery |
| 9 | `/admin/crm/communications` | Communications | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 10 | `/admin/crm/intelligence/behavioral` | Behavioral intelligence | 1 / 6 | 16.7% | L | open, action, persist, permission, recovery |
| 11 | `/admin/crm/intelligence/automation-queue` | Automation queue | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 12 | `/admin/crm/inbox` | Inbox | 4 / 6 | 66.7% | L | permission, recovery |
| 13 | `/admin/crm/tasks` | All tasks | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 14 | `/admin/crm/calendar` | Calendar | 4 / 6 | 66.7% | L, R | permission, recovery |
| 15 | `/admin/crm/deals` | Deals | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 16 | `/admin/crm/transactions` | Transactions | 3 / 6 | 50.0% | L | persist, permission, recovery |
| 17 | `/admin/crm/projects` | Projects | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 18 | `/admin/crm/documents` | Documents | 4 / 6 | 66.7% | L | permission, recovery |
| 19 | `/admin/crm/support` | Support | 5 / 6 | 83.3% | L, T | recovery |
| 20 | `/admin/crm/pipeline` | Pipeline | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 21 | `/admin/crm/reporting` | Reporting | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 22 | `/admin/crm/admin` | Admin hub | 4 / 6 | 66.7% | L | permission, recovery |
| 23 | `/admin/crm/workspace` | Sales workspace | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 24 | `/admin/crm/campaigns` | Sequences | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 25 | `/admin/crm/campaign-builder` | Marketing | 6 / 6 | 100.0% | L, T, R | — |
| 26 | `/admin/crm/campaign-queue` | Sequence queue | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 27 | `/admin/crm/discovery` | Discovery submissions | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 28 | `/admin/crm/intake-cases` | Intake cases | 1 / 6 | 16.7% | L | open, action, persist, permission, recovery |
| 29 | `/admin/crm/receptionist-accounts` | Receptionist accounts | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 30 | `/admin/crm/email-templates` | Email templates | 1 / 6 | 16.7% | L | open, action, persist, permission, recovery |
| 31 | `/admin/crm/import` | Import contacts | 3 / 6 | 50.0% | L | persist, permission, recovery |
| 32 | `/admin/crm/duplicates` | Duplicate review | 3 / 6 | 50.0% | L, T | persist, permission, recovery |
| 33 | `/admin/crm/settings` | Settings | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 34 | `/admin/crm/people` | People | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 35 | `/admin/crm/account` | My account | 4 / 6 | 66.7% | L | permission, recovery |
| 36 | `/admin/crm/operations` | Operations | 1 / 6 | 16.7% | L | open, action, persist, permission, recovery |
| 37 | `/admin/crm/my-day` | My Day | 5 / 6 | 83.3% | L | permission |
| 38 | `/admin/ops/firms/:id` | Receptionist firm detail | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 39 | `/admin/ops/firms` | Receptionist firms | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 40 | `/admin/ops/issues` | Receptionist issues | 2 / 6 | 33.3% | L, T | open, action, persist, recovery |
| 41 | `/admin/ops/usage` | Receptionist usage | 2 / 6 | 33.3% | L, T | open, action, persist, recovery |
| 42 | `/admin/ops/numbers` | Receptionist numbers | 2 / 6 | 33.3% | L, T | open, action, persist, recovery |
| 43 | `/portal/sign-in` | Portal sign-in | 2 / 6 | 33.3% | L | action, persist, permission, recovery |
| 44 | `/portal/accept` | Portal invitation landing | 4 / 6 | 66.7% | L, T, R | persist, recovery |
| 45 | `/portal` | Portal home | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 46 | `/portal/projects` | Portal projects | 3 / 6 | 50.0% | L, T | action, persist, recovery |
| 47 | `/portal/documents` | Portal documents | 4 / 6 | 66.7% | L, T | persist, recovery |
| 48 | `/portal/proposals` | Portal quotes and proposals | 4 / 6 | 66.7% | L, T | persist, recovery |
| 49 | `/portal/invoices` | Portal invoices | 4 / 6 | 66.7% | L, T | persist, recovery |
| 50 | `/portal/support` | Portal support | 5 / 6 | 83.3% | L, T | recovery |

## Criteria added after the baseline

| ID | Criterion | Added | Why | Status |
|---|---|---|---|---|
| 7.12 | Audience preview, preflight and the send apply one eligibility rule | 2026-09-15 | Owner brief §4: audience preview and sending use the same eligibility rules | Passed |
| 7.13 | A retry or an ambiguous provider outcome never delivers a message twice | 2026-09-15 | Owner brief §4: retries and ambiguous outcomes without duplicate delivery | Passed |
| 7.14 | An unsaved draft survives a failed save or a lost connection and can be restored | 2026-09-15 | Owner brief §4: save and resume drafts, and preserve drafts on failures | Passed |
| 7.15 | Templates are editable, and branding and personalisation render identically in preview and delivery | 2026-09-15 | Owner brief §4: template editing, branding and personalisation | Passed |
| 7.16 | Marketing, Sequences and the Sequence queue each say plainly what they are | 2026-09-15 | Owner brief §4: campaigns, sequences and queues must be understandable | Passed |
| 7.17 | A real AI draft is produced in the campaign editor | 2026-09-15 | Owner brief §2: verify a real draft in the campaign editor | Not passed |
| 11.10 | Receptionist accounts, receptionist firms and firm diagnostics work with a staff session and enforce permissions | 2026-09-15 | Owner brief §3: the three pages whose data requests reject staff sessions | Passed |

## Deferred scope, shown rather than hidden

- **15.6** Offline editing with a write queue — Deferred by owner decision: online-first for this release

## Appendix A — every criterion

### 1. Contact management

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 1.1 | Create, view and edit a contact, and the change persists | Passed | L, T | Contacts create/edit persisted in the browser; crm.ts lead routes covered by crmM3 and journey suites |
| 1.2 | List, search and filter contacts, including smart lists | Passed | L, T | 18 smart lists on /admin/crm/leads; export sent exactly the 16 visible ids, 9 when filtered to Client |
| 1.3 | A contact shows its complete interaction history | Passed | L, T | Full History tab on /admin/crm/leads/:id; crmHistory.test.ts |
| 1.4 | CSV import previews before committing, maps columns explicitly, reports per-row errors and does not duplicate on re-import | Passed | L, T | crmContacts.test.ts (25 tests, 7 deliberate mutations caught); browser walk: 2 created / 2 failed with reasons |
| 1.5 | CSV export respects the current selection and is permission-gated | Passed | L, T | Export gated on data.export; formula-injection neutralised; crmContacts.test.ts |
| 1.6 | Likely duplicates are found and merged without losing history, with durable dismissal | Passed | L, T | /admin/crm/duplicates found 10 real pairs; merge repoints 12 history sources and deletes nothing |
| 1.7 | Companies/accounts are modelled separately from the people who work there | Not passed | — | Not built: a customer is still a lead with status Client |

### 2. Lead management

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 2.1 | Leads are captured from the website and Discovery forms | Passed | L, T | Discovery intake → lead, covered by discovery and journey suites |
| 2.2 | Lead status is tracked through the pipeline | Passed | L, T | Stage/status on lead detail; smart lists by status |
| 2.3 | Leads are scored and prioritised | Passed | L, T | Locked leadScore engine; score shown on leads and DNA page |
| 2.4 | Changing who owns a lead is permission-gated | Passed | T | Assignment requires leads.assign; restricted users refused in crmStaffAuth.test.ts |
| 2.5 | Leads are assigned to a staff member by reference, not free text | Passed | T | crm_leads.assigned_to_staff_id is written by lead create/edit, imports and merges, and read by My Day, Command Center and the inactivity sweep; crmLeadAssignment.test.ts and every other suite green on the committed candidate a3c56b3 |
| 2.6 | Existing free-text owners are mapped by reviewed rules, with a visible list of unresolved names | Passed | L, T | M6-lead-assignee.sql and the TypeScript backfill agree on one answer table (mutation-checked both ways, green on a3c56b3). On real preview data the panel listed “Claidy Taguran” as matching two accounts, assumed nobody, and a mapping chosen there persisted after reload |

### 3. Sales pipeline

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 3.1 | Deals carry a stage, value and owner | Passed | L, T | crmSales.test.ts; /admin/crm/deals edit dialog opened on a touch device |
| 3.2 | The pipeline is visualised by stage | Passed | L | /admin/crm/pipeline and deals kanban rendered with real deals |
| 3.3 | Per-deal likelihood feeds a weighted forecast whose basis is stated | Passed | T | crmSales.test.ts: deal likelihood vs stage default reported |
| 3.4 | Won and lost outcomes are recorded, with a closed vocabulary of loss reasons | Passed | T | crmSales.test.ts outcome and loss-reason tests |
| 3.5 | A won deal converts into a project exactly once, even concurrently | Passed | L, T | 3 concurrent conversions → 1 project, verified in browser and crmSales.test.ts |
| 3.6 | Pipeline, weighted, contracted and received stay four separate figures | Passed | T | crmSales.test.ts forecast separation |
| 3.7 | Money agrees across the dashboard, forecast and transactions | Passed | L, T | $16,000 / 4 transactions agreed on three surfaces; crmMoneyContract.test.ts |

### 4. Customer communication

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 4.1 | Conversations are durable, with per-person read state, assignment and resolution | Passed | L, T | Read/assign/resolve proven three independent facts in the browser; crmInbox.test.ts |
| 4.2 | One inbox, with drafts that survive a reload | Passed | L | Draft survived reload on /admin/crm/inbox |
| 4.3 | Messages and calls record which staff member sent them | Passed | T | Sender attribution 4/4 in phoneAttribution and inbox suites |
| 4.4 | Outbound email is delivered by the real provider | Passed | L, T, R | CRM password-setup email and portal invitation reached claidyklaydetaguran@gmail.com; Resend shows Delivered |
| 4.5 | Bounced and complained addresses are suppressed for all mail | Passed | T | crmEmailInbound.test.ts suppression and case-normalisation tests |
| 4.6 | Reply loops are prevented | Passed | T | looksAutomated + outbound loop control tests |
| 4.7 | An inbound reply is matched to its conversation by an unforgeable token | Passed | T | crmEmailInbound.test.ts token correlation, with the provider fetch mocked |
| 4.8 | Inbound replies arrive through the real provider | Not passed | — | Blocked: needs the deployed webhook, a reply.sitemintdigital.com MX record, and a full-access RESEND_RECEIVING_API_KEY |
| 4.9 | Delivery events from the real provider update message state | Not passed | — | Blocked: no Resend webhook configured; needs the deployed API |

### 5. Tasks, activities and reminders

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 5.1 | Tasks have staff assignment, priority, recurrence, checklists and blocked reasons | Passed | L, T | crmOperations.test.ts (22 tests) |
| 5.2 | My Day groups work into overdue, due today, upcoming and more | Passed | L, T | Five buckets verified in the browser and crmOperations.test.ts |
| 5.3 | A deadline stores whether it is a day or a moment, judged in the assignee's zone, safe across DST | Passed | L, T | overdueSemantics.test.ts (18); two tasks created, page reloaded, both displayed correctly |
| 5.4 | Each person can set their own timezone | Passed | L, T | crmStaffAuth.test.ts timezone test; Asia/Manila set and persisted in the browser |
| 5.5 | Reminders are durable: claimed once, deduplicated, cancelled on change, retried | Passed | T | Scheduled-jobs engine suites |
| 5.6 | A failed reminder is visible with safe recovery | Passed | L, T | Delivery Issues tab; retry/resend/acknowledge distinguished in tests |
| 5.7 | A failed request shows an error state and recovers | Passed | L | Forced 500 on My Day, Retry recovered |
| 5.8 | Usable at 375px | Passed | L | My Day measured at a real 375×812 viewport: nothing clipped |

### 6. Support and knowledge base

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 6.1 | Tickets carry assignment, priority and status | Passed | L, T | crmSupport.test.ts; ticket created in the browser |
| 6.2 | Internal notes can never reach the customer | Passed | L, T | Database CHECK plus route test; internal note proven absent from the customer view |
| 6.3 | A customer reply goes through the delivery state machine | Passed | T | crmSupportDelivery.test.ts (19 tests, 10/10 mutations caught) |
| 6.4 | Replies correlate back to the ticket by token | Passed | T | Per-ticket reply token tests |
| 6.5 | Delivery is labelled honestly | Passed | L, T | Strongest label is 'accepted by the mail provider'; unsent replies read 'Waiting — not sent' |
| 6.6 | Knowledge-base articles can be written and published | Passed | T | crmSupport.test.ts KB routes |
| 6.7 | Customers raise and follow requests in the portal | Passed | L, T | crmPortal.test.ts tickets; /portal/support listed SUP-00002 for a real customer session |
| 6.8 | A support reply is delivered to a real mailbox | Passed | L, R | On candidate a3c56b3, a staff reply recorded while the server had no mail key was retried once the key was configured: recovery POST 200, reusing the original idempotency key, shown as Accepted by the mail provider. It arrived in the controlled mailbox at 14:42:43 UTC as “[SUP-00002] [CRM-TEST] Where is my welcome pack?” |
| 6.9 | A customer's emailed reply lands on the right ticket | Not passed | — | Blocked with 4.8: inbound not live |

### 7. Marketing automation

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 7.1 | One guided flow: Audience → Email → Preview/test → Send or schedule | Passed | L | Walked on /admin/crm/campaign-builder |
| 7.2 | Audiences by saved segment, filter or hand-picked contacts, with nobody pre-ticked | Passed | L, T | Three audience modes walked; crmMarketing.test.ts |
| 7.3 | Suppression and unsubscribes hold, even for hand-picked contacts | Passed | L, T | Hand-picking an unsubscribed contact: size 2, eligible 1, excluded 1 with reason |
| 7.4 | One inbox is mailed once when several contacts share it, and the reason is shown | Passed | L, T | 5 contacts sharing an address → 1 eligible, 4 excluded naming the recipient; mutation-tested |
| 7.5 | Merge fields render with fallbacks and missing values are warned about before sending | Passed | T | crmMarketing.test.ts fallback and merge-token tests |
| 7.6 | Autosave refuses to overwrite a newer version | Passed | T | Version-conflict tests |
| 7.7 | AI copy cannot be sent unapproved, and unavailable drafting says so | Passed | L, T | Approval gate tests; local drafting refuses with a plain-language 503 |
| 7.8 | Pause stops mid-batch; cancel does not claim to un-send | Passed | T | crmMarketing.test.ts pause and cancel |
| 7.9 | A scheduled campaign starts itself only behind a fail-closed flag | Passed | T | Scheduler flag tests |
| 7.10 | A campaign test email is delivered to a real mailbox | Passed | L, R | From a draft duplicated from a designed campaign, “Send a test” to the owner's staff address (test-send 200) arrived at 14:42:53 UTC as “[TEST] A quicker way to book Vega Family Dentistry”. It was marked as a staff-only test and rendered with the chosen contact's merge fields; no customer received it (candidate a3c56b3) |
| 7.11 | Engagement is measured where the provider supports it | Not passed | — | Opens/clicks need a Resend tracking subdomain and event webhook; reported as untracked, not zero |
| 7.12 | Audience preview, preflight and the send apply one eligibility rule | Passed | T | One 13-contact fixture gives the same answer, reason for reason, from preview, preflight and the send ledger (crmMarketingDelivery.test.ts, green on the committed candidate a3c56b3) |
| 7.13 | A retry or an ambiguous provider outcome never delivers a message twice | Passed | T | Claim-before-send, same-key retry, simultaneous retry and crash-resume tests, plus a provider 5xx stored as unknown and never retried (matching reminders and support); mutation-checked, green on the committed candidate a3c56b3 |
| 7.14 | An unsaved draft survives a failed save or a lost connection and can be restored | Passed | L, T | campaignDraft.test.ts (12) and campaignRequests.test.ts (9). In the browser on a test draft, a subject edit whose autosave failed like a dropped connection read “Not saved — The server did not answer… Your changes are kept in this browser until they are saved.”, with no false Saved. After a full reload the campaign offered “This browser kept changes to this campaign that were never saved” with Restore / Discard. Restore saved it (PATCH 200, “Saved”), and a second reload showed the restored subject from the server with no copy left in the browser |
| 7.15 | Templates are editable, and branding and personalisation render identically in preview and delivery | Passed | T | Preview and delivery compared byte for byte (subject, HTML, text, stored copy, branding and fallbacks), and template editing tested; green on the committed candidate a3c56b3 |
| 7.16 | Marketing, Sequences and the Sequence queue each say plainly what they are | Passed | L, T | messagingConcepts.test.ts. In the browser, each page opens with a heading and a summary of what it is (“One email, sent once, to a list of people”; “Several messages over days”; “Every message a sequence has scheduled”), and the nav reads Marketing / Sequences / Sequence Queue. The Sequences page's leftover “Campaigns” tab and empty states were renamed (03d339e) |
| 7.17 | A real AI draft is produced in the campaign editor | Not passed | — | The production server's AI integration answered a real request (HTTP 200, 2026-09-15), but no draft has come through the editor: the local server has no AI key and production still runs the old build |

### 8. Reporting and analytics

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 8.1 | Every figure has a written definition | Passed | L, T | 39 figures with definitions on /admin/crm/reporting; crmReports.test.ts |
| 8.2 | Every figure states its denominator | Passed | T | crmReports.test.ts |
| 8.3 | Every figure drills to the rows behind it, and the count equals the list | Passed | T | Count derived from the detail query in crmReports.test.ts |
| 8.4 | Money figures agree across every surface | Passed | L, T | crmMoneyContract.test.ts; $16,000 cross-checked in the browser |
| 8.5 | Figures that cannot be measured say so instead of showing zero | Passed | L | 'Cannot measure' section present on the reporting page |
| 8.6 | The sales forecast states its basis | Passed | T | crmSales.test.ts |
| 8.7 | Operations and delivery figures are reported | Passed | L, T | Operations and delivery-issue counts |
| 8.8 | Marketing delivery counts equal their recipient lists | Passed | T | crmMarketing.test.ts counts-equal-lists |
| 8.9 | Email engagement figures come from real provider events | Not passed | — | Blocked with 4.9 and 7.11 |

### 9. Documents

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 9.1 | Files upload with versioning | Passed | L, T | crmM3.test.ts |
| 9.2 | Downloads are authenticated and sent with safe headers | Passed | L, T | Customer download: 200, attachment disposition, nosniff, exact bytes |
| 9.3 | Share links are hashed, expiring, capped and revocable | Passed | T | crmM3.test.ts share tokens |
| 9.4 | Documents can be requested from a customer | Passed | T | Document request routes tested |
| 9.5 | Quotes have line items and totals computed on the server | Passed | L, T | crmBilling.test.ts tampered totals ignored; $4,200 quote itemised correctly for a customer |
| 9.6 | Invoices come from accepted quotes and payments reconcile with the money figures | Passed | T | crmBilling.test.ts payment moves all four money figures |
| 9.7 | Quotes and invoices become documents the customer can see | Passed | L, T | Quote-QUO-00001.txt listed and downloadable in the portal |
| 9.8 | Agreements can be signed electronically through a provider | Not passed | — | No provider chosen; requirements in E-SIGNATURE-REQUIREMENTS.md; acceptance is explicitly not a signature |

### 10. Workflow automation and approvals

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 10.1 | Rules combine triggers, conditions and actions | Passed | T | crmAutomation.test.ts (19) |
| 10.2 | Time-based triggers fire | Passed | T | automationSweep.test.ts |
| 10.3 | Three loop brakes stop runaway automation | Passed | T | Loop-brake tests |
| 10.4 | Approvals are decided by an identified person | Passed | T | Approval tests |
| 10.5 | Every run is recorded in a durable event log | Passed | T | crm_automation_events tests |
| 10.6 | A trigger occurrence executes at most once | Passed | T | Occurrence-key uniqueness test |
| 10.7 | Failed automation is visible in the product | Passed | T | Automation tab in Operations; crmAutomationFailures.test.ts; component checked at 375px against a stubbed API, not yet clicked live |
| 10.8 | Retry buys exactly one more attempt through the ordinary path | Passed | T | crmAutomationFailures.test.ts |
| 10.9 | Acknowledge records a decision and re-runs nothing | Passed | T | Rows asserted byte-identical after acknowledge |
| 10.10 | Retry is refused where it cannot be made safe, with the reason shown | Passed | T | Unknown outcomes and loop-braked runs refused |

### 11. Users, roles and permissions

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 11.1 | Every person has an individual account with a properly hashed password | Passed | L, T | scrypt; crmStaffAuth.test.ts |
| 11.2 | Two-step verification with single-use recovery codes | Passed | T | crmStaffAuth.test.ts enrols MFA and consumes a recovery code once |
| 11.3 | Sessions are revocable, and a credential change ends them | Passed | L, T | Epoch invalidation; all exposed sessions revoked 2026-09-14 |
| 11.4 | Mutating requests require a CSRF token | Passed | T | CSRF rejection tests |
| 11.5 | Sign-in attempts are throttled | Passed | T | Throttling tests |
| 11.6 | Actions are audited per person | Passed | L, T | crm_admin_audit_log entries by real actor |
| 11.7 | The three owners hold identical full access; future hires get role-based access | Passed | L, T | Activation grants the identical 37-permission owner set; roles for hires |
| 11.8 | A restricted user is refused at every API boundary | Passed | T | Restricted-user tests across suites, including receptionistOpsAuth.test.ts |
| 11.9 | Two-step verification is enrolled on the real owner accounts | Not passed | — | Available on My Account; not enrolled on any real account yet |
| 11.10 | Receptionist accounts, receptionist firms and firm diagnostics work with a staff session and enforce permissions | Passed | L, T | On candidate a3c56b3 Receptionist Accounts loaded with a staff session (200, where it answered 401 before) and listed a fixture firm; receptionistOpsAuth.test.ts green on the same candidate |

### 12. Interaction history

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 12.1 | Activity from every source is merged into one timeline | Passed | L, T | 23 sources; crmHistory.test.ts |
| 12.2 | Long histories page without dropping entries | Passed | T | Keyset pagination on (occurred_at, source, id) |
| 12.3 | Entries say who acted, and unattributed ones are labelled | Passed | L, T | Attribution tests |
| 12.4 | A customer-visible view drops internal notes | Passed | L | 'What the client can see' verified in the browser |
| 12.5 | History survives merging duplicate contacts | Passed | T | crmContacts.test.ts merge preserves both sides |
| 12.6 | Customer replies and meetings appear in the history | Passed | L, T | History includes customer replies and appointments |

### 13. Calendar and scheduling

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 13.1 | Appointments can be created, rescheduled and cancelled | Passed | L, T | Verified in an earlier milestone; crmM3.test.ts |
| 13.2 | A past meeting can be marked held | Passed | L, T | crmM3.test.ts |
| 13.3 | Appointments export as .ics | Passed | L, T | Shared generator with invitations |
| 13.4 | Appointment reminders fire | Passed | L, T | Reminder engine |
| 13.5 | Attendees receive an invitation their calendar can add | Passed | L, T, R | crmCalendarInvites.test.ts (24). On candidate a3c56b3, an appointment created in the browser mailed both attendees (201, “2 invitations accepted by the mail provider”). The invitation arrived at 14:42:59 UTC with invite.ics (text/calendar) attached, and was stored as METHOD REQUEST with outcome sent |
| 13.6 | A material change updates the invitation; a trivial edit mails nobody | Passed | L, T, R | crmCalendarInvites.test.ts proves SEQUENCE increments and that a non-material edit mails nobody; the silent case was not repeated live. On candidate a3c56b3, rescheduling in the browser (PATCH 200) stored sequence 1 for both attendees, and “Updated: [CRM-TEST] Invitation provider check” arrived at 14:44:40–41 UTC with the new time and what changed |
| 13.7 | A cancellation removes it from attendees' calendars | Passed | L, T, R | METHOD:CANCEL tests. On candidate a3c56b3, cancelling in the browser (PATCH 200, after the confirmation naming who is told) stored CANCEL at sequence 2 for both attendees, and “Cancelled: [CRM-TEST] Invitation provider check” arrived at 14:45:33–34 UTC with the calendar file that removes the event. The invitation, update and cancellation share one event at sequences 0, 1 and 2 |
| 13.8 | Two-way sync with external calendars | Not passed | — | Not built; .ics is an export |

### 14. Integrations

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 14.1 | An accounting or payments connector | Not passed | — | Not built for the CRM |
| 14.2 | Calendar provider sync | Not passed | — | Not built for the CRM (the receptionist has its own Google calendar connector) |
| 14.3 | An e-signature provider | Not passed | — | No provider chosen |
| 14.4 | Team notifications to a chat tool | Not passed | — | Not built |
| 14.5 | Outbound webhooks or an API for other systems | Not passed | — | Not built |

### 15. Mobile, offline and push

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 15.1 | Staff pages have no clipped or unreachable content at 375px | Passed | L | Every staff route measured at a real 375×812 viewport with the validated clipped-content metric (evening of 2026-09-15). The sweep found two defects the earlier record had missed, both fixed and re-measured: the shared header's action row hid the profile menu (sign out, My account) on every staff page, and the Sequences header hid “New sequence”. Every measurable route now shows 0. The two legacy Discovery Portal pages redirect a staff session, so they could not be measured as themselves |
| 15.2 | Wide tables scroll inside their own container | Passed | L | Import plan table scrolls in a 342px container |
| 15.3 | Controls are reachable by touch | Passed | L | Deals edit tapped and the dialog opened on a touch device |
| 15.4 | Populated Discovery and Settings tables are verified on a phone | Passed | L | Both rendered populated and measured at 375px |
| 15.5 | Connection loss is shown, and unsent work is preserved rather than lost | Passed | L, T | Online-first connection banner and draft vault |
| 15.6 | Offline editing with a write queue | Deferred by decision | — | Deferred by owner decision: online-first for this release |
| 15.7 | Push notifications | Not passed | — | Not built: no service worker, PushManager or VAPID anywhere |
| 15.8 | Portal pages have no clipped or unreachable content at 375px | Passed | L | All 8 portal routes measured at a real 375×812 emulated viewport on candidate a3c56b3 with a customer session: 0 elements clipped without a scrollable ancestor. The metric was validated in the same page: a planted clipped element was flagged, and the same element inside a scroller was not |

### 16. Customer portal

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 16.1 | Customers have their own sign-in and sessions, separate from staff | Passed | L, T | Portal session coexists with no staff session; crmPortal.test.ts |
| 16.2 | A customer can never see another customer's records | Passed | T | 12/12 isolation mutations caught; cross-contact access answers 404 |
| 16.3 | Documents are hidden unless explicitly granted | Passed | L, T | Default-deny tests; only granted files listed for a real customer |
| 16.4 | Staff can invite, re-send and revoke portal access, with honest delivery | Passed | L, T, R | Invitation sent from the contact page reached the controlled mailbox; token withheld when emailed; crmPortalAccess.test.ts |
| 16.5 | A customer accepts an offer in writing, once, and it is never called a signature | Passed | L, T | Quote accepted through the portal; a quoted deal is not separately acceptable (409) |
| 16.6 | Invoices and money received are shown without inventing a balance | Passed | L, T | Portal invoices page and crmBilling.test.ts |
| 16.7 | The portal says plainly what is waiting on the customer | Passed | L | 'Review and accept' for a waiting quote links to the quotes page |
| 16.8 | A customer completes every portal journey end to end with real data | Passed | L, R | Walked with a real customer session: the emailed invitation (delivered by the provider) and sign-up, projects, a document download, quote acceptance, a support message answered by staff, and an issued invoice with its line items (the last three on candidate a3c56b3) |

### 17. Security

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 17.1 | Two-step verification and an audit trail exist | Passed | L, T | See 11.2 and 11.6 |
| 17.2 | Webhook signatures are enforced, including replays | Passed | L | Unsigned 400, forged 400, signed 200, hour-old replay 400 |
| 17.3 | Tests cannot wipe real data or each other's sessions | Passed | T | Disposable-database guard; per-database run lock proven by overlapping runs |
| 17.4 | Cross-origin access is refused unless explicitly allowed | Passed | T | corsPolicy.test.ts; production refuses to start without an allowlist |
| 17.5 | Secrets are never logged or returned | Passed | T | Sanitised boot errors; env contract reports names only |
| 17.6 | Exposed credentials were rotated | Passed | L | Exposed reset token and every live session revoked; epochs bumped |
| 17.7 | The unexplained account activation was resolved with evidence | Passed | L | User-agent strings: the 07:04 session was the assistant's own browser pane; the later setup was the owner's own browser |
| 17.8 | Encryption in transit and at rest is evidenced for production | Built, not proven | — | HSTS observed on the domain; at-rest encryption is a hosting property not yet evidenced |
| 17.9 | A backup has been restored into an isolated target | Not passed | — | Waiting on the owner adding SNAPSHOT_SOURCE; point-in-time recovery is on (7 days) |

### 18. Dashboard

| ID | Criterion | Status | Env | Evidence / gap |
|---|---|---|---|---|
| 18.1 | Panels are clickable and open the rows behind them | Passed | L, T | 11 clickable panels |
| 18.2 | Counts come from one server function | Passed | T | crmCommandCenter tests |
| 18.3 | The dashboard can be filtered | Passed | L | Scope and day filters |
| 18.4 | Refresh pauses when the page is hidden | Passed | T | Polling pause test |
| 18.5 | Metrics without instrumentation explain why instead of showing zero | Passed | L | Uninstrumented panels state their reason |
| 18.6 | The money panel agrees with the ledger | Passed | L, T | Cross-checked against forecast and transactions |

## Appendix B — every page check

### `/admin` — Sign-in and first-run setup

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Rendered 2026-09-15 with zero console errors |
| action | Passed | L | M1 (2026-09-11): first-run bootstrap driven end to end in a browser; not repeated on the current build |
| persist | Built, not proven | — | A signed-in session surviving a reload is tested at the API (crmStaffAuth.test.ts), not recorded in a browser |
| permission | Passed | T | Wrong passwords refused and sign-in throttled in the database (crmStaffAuth.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/activate` — Staff invitation and password-reset landing

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | The owner's own account was activated through this page on 2026-09-14 |
| action | Passed | L | Activation completed: account Active and mailbox verified |
| persist | Passed | L | The activated account signs in afterwards and keeps a live session |
| permission | Passed | T | Invitations expire and are consumed atomically; a replayed token answers 404 (crmStaffAuth.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/dashboard` — Legacy Discovery Portal

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Not passed | — | Linked from the CRM sidebar as “Discovery Portal”, but its data (/api/admin/submissions) is guarded by the retired shared admin credential and answers 401 to a staff session. Before the fix (c366c75), opening it also wiped the session's CSRF token and bounced the person to sign-in; it now stays open, but shows 0 leads and 0 proposals instead of saying the data could not be loaded — a misleading zero left on this superseded page |
| action | Built, not proven | — | Unreachable with a staff session |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Built, not proven | — | Could not be measured as itself: a staff session was redirected to sign-in |

### `/admin/submissions/:id` — Legacy submission detail

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Not passed | — | Its data (/api/admin/submissions/:id) is guarded by the retired shared admin credential and answers 401 to a staff session, so it shows nothing; the CRM's Discovery page is the working equivalent |
| action | Built, not proven | — | Unreachable with a staff session |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Built, not proven | — | Could not be measured as itself: a staff session was redirected to sign-in |

### `/admin/crm/dashboard` — Command Center

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session and preview data, zero console errors (2026-09-15) |
| action | Passed | L | Money panel cross-checked against the forecast and transactions: $16,000 across 4 transactions agreed |
| persist | Built, not proven | — | Filters and figures after a reload not recorded |
| permission | Built, not proven | — | Mine/Team scoping not exercised with a restricted user |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15, measured both before and after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/leads/:id/dna` — Lead DNA

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened for a named contact with a real staff session (2026-09-15) |
| action | Built, not proven | — | Read-only page; nothing on it was used beyond viewing |
| persist | Built, not proven | — | Not reloaded |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/leads/:id` — Contact record

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session; Full History tab populated (2026-09-15) |
| action | Passed | L, R | Portal invitation issued and delivered to the controlled mailbox, redeemed, then revoked: /api/portal/me went 200 → 401 |
| persist | Built, not proven | — | The revocation was checked by API response, not by reloading the page |
| permission | Passed | L, T | An operations manager was refused deleting a lead, in a test and in the browser (M1) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Clipped 220 elements at 375px; re-measured after the fix with the clipped-content metric: 0 |

### `/admin/crm/leads` — Contacts

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session and 16 preview contacts (2026-09-15) |
| action | Passed | L | Export sent exactly the 16 visible ids, and 9 when filtered to Client |
| persist | Built, not proven | — | Not reloaded |
| permission | Passed | T | Export requires data.export; a user without it is refused (crmContacts.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/communications` — Communications

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/intelligence/behavioral` — Behavioral intelligence

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a real session but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/intelligence/automation-queue` — Automation queue

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/inbox` — Inbox

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Passed | L | Read, assign and resolve each changed only their own fact |
| persist | Passed | L | An unsent draft survived a full reload |
| permission | Built, not proven | — | Not exercised with a restricted user |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/tasks` — All tasks

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated, deadline labels kind-aware (2026-09-15) |
| action | Built, not proven | — | Not exercised on this page (tasks were created on My Day) |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/calendar` — Calendar

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Passed | L, R | On candidate a3c56b3 an appointment with an external attendee was created (201), rescheduled (200) and cancelled (200) in the browser. The invitation, the update and the cancellation each arrived in the controlled mailbox. Cancel's native confirmation was answered OK, as a user would, because this browser cannot show native dialogs |
| persist | Passed | L | After a full reload and selecting Sep 17, the card showed the rescheduled 11:00–11:30 time, status cancelled, and “Cancellation sent” for both attendees |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/deals` — Deals

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | The edit dialog was opened but no change was saved in the browser |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | At 375px on a touch device the edit control was tapped and every dialog field was reachable |

### `/admin/crm/transactions` — Transactions

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with 4 real rows (2026-09-15) |
| action | Passed | L | Total $16,000 and the count matched the list |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/projects` — Projects

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a populated project pipeline (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/documents` — Documents

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with the billing panel present (2026-09-15) |
| action | Passed | L | From the billing panel, INV-00001 was drafted from the accepted quote (POST 201, line items carried across) and issued (200). The due-date prompt was answered with its proposed default, because this browser cannot show native prompts |
| persist | Passed | L | After a full reload and re-selecting the contact, INV-00001 was still issued with $4,200.00 outstanding, and Invoice-INV-00001.txt was listed in the contact's files |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/support` — Support

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Passed | L | Ticket created with an internal note and a customer reply. On candidate a3c56b3 a staff reply to SUP-00002 was recorded (POST 201) and shown as “Waiting — not sent”, with the reason: this server has no mail key |
| persist | Passed | L | The reply sent from this page was read back by the customer's own session in the portal thread |
| permission | Passed | L, T | The internal note was absent from the customer view; barred by a database CHECK and a route test |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/pipeline` — Pipeline

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a populated pipeline (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/reporting` — Reporting

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with 39 figures and their definitions (2026-09-15) |
| action | Built, not proven | — | Drill-down not exercised in the browser (proven by crmReports.test.ts only) |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/admin` — Admin hub

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session on candidate a3c56b3; the Unmapped lead owners panel listed the real ambiguous name “Claidy Taguran” with both candidate accounts |
| action | Passed | L | Mapped that name to the chosen account from the panel: POST answered 200 and 2 contacts were updated |
| persist | Passed | L | After a full reload: 7 contacts belong to a person, 0 unresolved, and 3 decisions recorded |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/workspace` — Sales workspace

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/campaigns` — Sequences

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/campaign-builder` — Marketing

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with 13 real contacts listed and nobody pre-ticked (2026-09-15) |
| action | Passed | L, R | Audience step on real data: 5 contacts sharing one address → 1 eligible, 4 excluded with a reason naming the recipient. On candidate a3c56b3 a test send rendered for a chosen contact reached the owner's mailbox (test-send 200), marked as a staff-only test |
| persist | Passed | L | A change restored from the browser's kept copy was saved (PATCH 200) and, after a full reload, the campaign list and the database both held it |
| permission | Passed | T | Sending and retry require campaigns.send; a restricted user is refused (crmMarketing.test.ts) |
| recovery | Passed | L | With the autosave failing like a dropped connection, the page said “Not saved — The server did not answer… Your changes are kept in this browser until they are saved.” After a reload it offered Restore / Discard, and Restore saved the change |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/campaign-queue` — Sequence queue

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/discovery` — Discovery submissions

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Rendered populated and measured at 375px after the 10-column table fix |

### `/admin/crm/intake-cases` — Intake cases

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a real session but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/receptionist-accounts` — Receptionist accounts

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | On candidate a3c56b3 its data calls answered 200 to a staff session (401 before the fix) and it listed a [CRM-TEST] fixture firm with plan, phone and trial limit |
| action | Built, not proven | — | Unreachable until the data call works |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session and staff without settings.read (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/email-templates` — Email templates

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a real session but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/import` — Import contacts

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session (2026-09-15) |
| action | Passed | L | Upload → preview (2 to create, 2 errors with reasons, 1 ignored column) → mapping → commit: 2 created, 2 failed |
| persist | Built, not proven | — | The created contacts were not checked after a reload |
| permission | Built, not proven | — | Not exercised with a restricted user |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | At 375px the plan table scrolls inside its own 342px container |

### `/admin/crm/duplicates` — Duplicate review

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with 10 real duplicate pairs (2026-09-15) |
| action | Passed | L, T | A merge kept history from both sides and deleted nothing |
| persist | Built, not proven | — | Not reloaded after the merge |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/settings` — Settings

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | One unbreakable Twilio SID was clipped at 375px; re-measured after the fix with the clipped-content metric: 0 |

### `/admin/crm/people` — People

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated with a real staff session (2026-09-15) |
| action | Built, not proven | — | Not exercised on the current build |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Self-escalation, unauthorised role changes and removing the last owner are refused (crmStaffAuth.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/account` — My account

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real staff session (2026-09-15) |
| action | Passed | L | Timezone set to Asia/Manila; an invented zone was refused with 400 |
| persist | Passed | L | The Asia/Manila timezone persisted |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/operations` — Operations

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a real session; its tabs showed empty states, so it has not been seen with data |
| action | Built, not proven | — | Retry and acknowledge on the Automation tab are proven by tests only |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport with live data, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/crm/my-day` — My Day

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened populated across all five buckets (2026-09-15) |
| action | Passed | L | Two tasks created, one due on a day and one at a time |
| persist | Passed | L | After a reload, the day-only task read Today with no 00:00 and the timed one read Today 09:00 |
| permission | Built, not proven | — | Not exercised with a restricted user |
| recovery | Passed | L | A forced 500 showed an error state and Retry recovered |
| mobile | Passed | L | Measured at a real 375×812 viewport: nothing clipped |

### `/admin/ops/firms/:id` — Receptionist firm detail

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | On candidate a3c56b3 the fixture firm's diagnostics loaded with a staff session (200, 401 before the fix): usage period, calls and open issues shown, and fields the API does not send read Not reported rather than an invented value |
| action | Built, not proven | — | Unreachable until the data call works |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session, staff without settings.read, and a mutation without CSRF or the right grant (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/ops/firms` — Receptionist firms

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | On candidate a3c56b3 it listed the [CRM-TEST] fixture firm with plan, conversations and health to a staff session (200, 401 before the fix) |
| action | Built, not proven | — | Unreachable until the data call works |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session, staff without settings.read, and a mutation without CSRF or the right grant (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/ops/issues` — Receptionist issues

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a staff session on candidate a3c56b3 (data call 200), but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session, staff without settings.read, and a mutation without CSRF or the right grant (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/ops/usage` — Receptionist usage

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a staff session on candidate a3c56b3 (data call 200), but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session and staff without settings.read (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/admin/ops/numbers` — Receptionist numbers

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Built, not proven | — | Opened with a staff session on candidate a3c56b3 (data call 200), but it showed an empty state, so it has not been seen with data |
| action | Built, not proven | — | Not exercised |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Refuses no credential, a forged cookie, a receptionist customer session and staff without settings.read (receptionistOpsAuth.test.ts, green on a3c56b3) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 viewport, evening sweep of 2026-09-15 after the header fix: 0 elements clipped without a scrollable ancestor (validated metric) |

### `/portal/sign-in` — Portal sign-in

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Rendered with customer chrome and no staff chrome (2026-09-15) |
| action | Built, not proven | — | The test customer entered through the invitation link, not this form |
| persist | Built, not proven | — | Not exercised |
| permission | Built, not proven | — | Portal sign-in throttling not exercised |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/accept` — Portal invitation landing

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Rendered from a real emailed invitation (2026-09-15) |
| action | Passed | L, R | Invitation delivered by the provider, password set, account became Active |
| persist | Built, not proven | — | Session checked by API response, not by reloading the page |
| permission | Passed | T | An invitation redeems exactly once (crmPortal.test.ts, 'redeem it once') |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal` — Portal home

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real customer session; 'Review and accept' shown for the waiting quote (2026-09-15) |
| action | Built, not proven | — | The next-action link was shown pointing at the quotes page; following it was not recorded |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Every portal read is scoped to the session's own contact; another customer's records answer 404 (crmPortal.test.ts, 12/12 isolation mutations caught) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/projects` — Portal projects

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real customer session showing that customer's own project (2026-09-15) |
| action | Built, not proven | — | Viewing only |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Scoped to the session's contact; cross-customer access answers 404 (crmPortal.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/documents` — Portal documents

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real customer session; only granted files listed (2026-09-15) |
| action | Passed | L | Downloaded Quote-QUO-00001.txt: 200, attachment disposition, nosniff, exact bytes |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Documents are default-deny through explicit grants; cross-customer access answers 404 (crmPortal.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/proposals` — Portal quotes and proposals

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real customer session and an itemised $4,200 quote (2026-09-15) |
| action | Passed | L, T | The quote was accepted in writing; the same work offered as a deal could not be accepted a second time (409) |
| persist | Built, not proven | — | The accepted state after a reload was proven in crmBilling.test.ts, not in the browser |
| permission | Passed | T | Scoped to the session's contact; another customer's quote answers 404 (crmPortal.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/invoices` — Portal invoices

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with the real customer session on candidate a3c56b3 after staff issued INV-00001: $4,200.00 outstanding, $0.00 paid to date |
| action | Passed | L | INV-00001's breakdown read and checked: Design 1 × $1,500 and Build 2 × $1,350 sum to the $4,200.00 awaiting payment, due Sep 29, 2026 |
| persist | Built, not proven | — | Not exercised |
| permission | Passed | T | Scoped to the session's contact; cross-customer access answers 404 (crmPortal.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |

### `/portal/support` — Portal support

| Check | Status | Env | Evidence |
|---|---|---|---|
| open | Passed | L | Opened with a real customer session listing SUP-00002 (2026-09-15) |
| action | Passed | L | A [CRM-TEST] message added to SUP-00002 from the portal: POST answered 201 and it appeared in the thread |
| persist | Passed | L | After a full reload the reopened ticket showed both messages |
| permission | Passed | T | Tickets are scoped to the session's contact and internal notes never reach it (crmPortal.test.ts) |
| recovery | Built, not proven | — | Not exercised |
| mobile | Passed | L | Real 375×812 emulated viewport on candidate a3c56b3: 0 elements clipped without a scrollable ancestor; the metric flagged a planted clipped element and passed one inside a scroller |
