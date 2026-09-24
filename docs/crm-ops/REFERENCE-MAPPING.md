# Reference mapping — the tutorial's feature list against SiteMint

Maintained alongside `COVERAGE-MATRIX.md`. The matrix is the 18-area register
this programme works to; this file is the narrower question "where did each
feature the reference names actually end up in SiteMint, and what is the
evidence."

---

## What was actually reviewed, and what was not

Being precise about this matters, because the two sources carry very different
weight.

| Source | Reviewed? | What it gives us |
|---|---|---|
| `https://tutorial101.blogspot.com/2026/08/crm-customer-relationship-management_0720438368.html` | **Yes — the written article, fetched 2026-09-12.** | A numbered list of 14 feature areas with one-line descriptions. |
| `https://www.youtube.com/watch?v=74qo2kJsTAM` | **Partly — 32 sampled frames, 2026-09-16.** See "What was sampled in the video" below. | Scene-level confirmation that the reference is a Django-admin-style CRM: sign-in, dashboard shell, record tables, modal forms, a confirmation dialog, a calendar, invoice/payment tables, a bar-chart report, user management, notifications. **No text-level detail**, so no requirement in this document rests on it. |

Two limits on how far the article can be used:

1. **It is a feature list, not evidence.** The article names what a CRM should
   do. It demonstrates nothing about whether its own implementation handles
   concurrency, permissions, delivery failure or partial writes — the problems
   that consumed most of this programme. A row appearing in the reference is a
   requirement to satisfy, never a specification to copy, and never proof that
   the reference's version works.
2. **It is a different system.** The article's stack is Python Django with
   MySQL and it names no tables. SiteMint is a pnpm/TypeScript monorepo on
   Express and PostgreSQL with Drizzle. Nothing from the reference changes the
   stack, the schema conventions or the branding; the mapping is of *intent*
   only.

### What was sampled in the video, and what that is worth

Reviewed 2026-09-16. Duration 51:29 (3,089 s), channel Cairocoders, published
2026-08-27. **The player exposed no caption track**, so nothing below rests on a
transcript, and there are no chapter markers. Frames were sampled by driving the
player's own `seekTo` while it played — a paused background tab does not repaint,
so every paused capture returns a stale frame, which is a trap worth recording.

**The limit that matters:** the only capture surface that reliably rendered live
frames is ~350 px wide, so these are **scene-level observations**. Body text was
not legible except where quoted. A larger browser tab was tried and never
repainted the video surface; capturing the frame to a canvas at full resolution
works but the page's content policy blocks sending it anywhere.

Sampled: 0:01, 1:00, 2:00, 2:03, 3:00, 4:00, 4:02, 5:00, 6:02, 8:02, 10:02,
12:02, 14:02, 16:02, 18:02, 20:02, 22:02, 24:02, 26:02, 28:02, 30:02, 32:02,
34:02, 36:02, 38:02, 40:02, 42:02, 44:02, 46:02, 48:02, 50:02, 51:02 — 32 frames.
Everything between those points, about 49 of the 51 minutes, was **not** inspected.

| Range | What the sampled frames showed |
|---|---|
| 0:01–3:00 | Sign-in card, then admin-style list pages with status chips and filters |
| 4:00–12:02 | Code-along in VS Code: editor, file tree, terminal, autocomplete |
| 14:02–16:02 | Sign-in card again, then the application shell (sidebar, header, primary action) |
| 18:02–26:02 | Record tables (rows, badges, per-row actions) and a two-column modal create/edit form |
| 28:02 | Month calendar grid ("October 2026" legible) |
| 30:02–34:02 | Report layout with a summary panel; tables of numbered records with amounts |
| 36:02–38:02 | Warning overlay, and a confirmation dialog ("Are you sure?" legible) |
| 40:02–46:02 | Settings/profile form, a success toast, an edit modal, a bar-chart report |
| 48:02–51:02 | User-management table with role/status chips, a notifications list, a create form |

**What this changes here: nothing.** It confirms the article's feature list is a
fair description of the reference's own screens, at the level of "these screens
exist". It demonstrates nothing about field-level behaviour, permissions,
delivery, concurrency or data model, so every row in the mapping still moves only
on SiteMint's own evidence.

**The reference lists 14 areas. SiteMint's brief is 18, and 18 is the scope.**
The table below carries all 18, numbered to match `COVERAGE-MATRIX.md`, so
neither document can quietly track a different set. Where the reference has
nothing to say about an area, the row says so — an area is not out of scope
because a tutorial summary omitted it.

---

## The mapping

Status vocabulary is the matrix's, deliberately conservative: **Done** =
implemented, exercised against a real database or browser, and covered by a
committed test. **Partial** = usable but incomplete. **Not started** = no
implementation.

| # | Area (matrix numbering) | In the reference? | SiteMint screen | Status | Acceptance evidence |
|---|---|---|---|---|---|
| 1 | Contacts / customer records | ref §1 | Contacts, Contact detail | **Partial** | `crm_leads` + `CrmLeadDetail`. A customer is still a lead with status `Client`; no separate account entity. Duplicate review and import/export are the named gaps. |
| 2 | Leads: capture, assignment, scoring | ref §2 | Contacts, Pipeline, Discovery CRM | **Partial** | Discovery intake → lead, 18 smart lists, the locked `leadScore` engine. `assignedTo` is still free text rather than a staff reference — the named gap. |
| 3 | Pipeline, deals, forecasting | ref §3 | Pipeline, Deals, Sales Workspace | **Done** | `crmSales.test.ts`. Won → project conversion idempotent on `converted_project_id`; three concurrent conversions produced one project, verified live. Forecast keeps pipeline / weighted / contracted / received apart, each with its basis stated. |
| 4 | Email / SMS / calls | ref §4 | Inbox, Communications Center, Calendar | **Partial — built, one external blocker** | `crmInbox`, `crmEmailInbound`, `phoneAttribution` suites. Read state, assignment and resolution proven independent in the browser. Inbound email is built but **not active** until MX exists on the reply subdomain. |
| 5 | Tasks, activities, follow-ups, reminders | ref §5 | My Day, All Tasks, Operations, Calendar | **Done** | One task system; durable reminder engine that is timezone-correct, deduped, claim-once and cancel-on-change. My Day verified across all five buckets, the empty state, a forced API failure with working recovery, and 375px. |
| 6 | Support tickets / knowledge base | ref §6 | Support | **Partial** | 23 tests. Tickets, thread, internal/customer boundary (one column, no default, plus a check constraint), priorities, assignment, service requests, knowledge base. **A customer reply is recorded, not sent** — so a client waiting for an answer does not get one. Outbound delivery is the remaining work. |
| 7 | Segments, campaigns, automation | ref §7 | Marketing, Campaign Builder, Campaign Queue | **Partial** | 16 tests, 12/12 mutations detected. Segments re-evaluated at send time, exclusions itemised with reasons, server-rendered email-safe HTML, mandatory personalisation fallbacks, staff-only test sends, pause/resume/cancel, scheduled auto-start behind a fail-closed flag. Opens and clicks are genuinely untracked and say so. The operator flow itself is being rebuilt — see M5. |
| 8 | Reporting and KPIs | ref §8 | Reporting, Command Center | **Done** | 39 figures, each with definition, denominator and the rows behind it; the count is derived from the detail query so the two cannot disagree. Verified in the browser. All three money surfaces agreed at $16,000 across 4 transactions. |
| 9 | Documents / proposals / invoices | ref §9 | Documents | **Partial** | Upload, versioning, authenticated download, hashed share tokens with expiry/ceiling/revocation, document requests. **Invoices and quotes are not built, and nothing here is a signature** — every file and accepted proposal is labelled `not_a_signature`. |
| 10 | Workflows, approvals, notifications | ref §10 | Automation Queue | **Partial** | 19 engine tests + 5 producer tests, 13/13 mutations detected. Triggers, current-record conditions, approvals by identity, execution history, three independent loop brakes. Lead and deal events fire rules. `task_overdue` and `no_activity_for_days` need a periodic sweep that does not exist — the named gap. |
| 11 | Staff auth, roles, permissions, audit | ref §11 | People, My Account, Admin Hub | **Done** | Per-person accounts, scrypt, TOTP + recovery codes, revocable sessions, CSRF, DB-backed throttling, owner-editable permission matrix enforced in the API, audit trail. Three equal Super Admins; a restricted new hire refused at every boundary, re-verified by the connected journey. |
| 12 | Unified interaction / purchase / note history | **Not in it** | Contact detail → Full History | **Done** | 12 tests, 6/6 history mutations detected. 23 sources merged, keyset-paged, explicit visibility per entry. Verified live: an internal support note is present for staff and absent from "What the client can see". Unattributed rows are labelled, never credited to a person. |
| 13 | Calendars and scheduling | ref §12 | Calendar | **Partial** | Create, reschedule, mark held, cancel, `.ics` export, appointments driving the reminder engine — all verified live. **Attendee invitation email is not built** (`invitationsSent: false`, reported rather than implied) and `.ics` is an export, not two-way sync. |
| 14 | Mailbox / accounting / ERP / e-commerce | **Not in it** | — | **Not started** | No connectors. The reference does not raise integrations either; this is SiteMint's own scope and needs owner decisions on providers before any work. |
| 15 | Responsive / mobile / offline / push | ref §13 | every CRM screen | **Partial** | All 43 CRM/ops and 8 portal pages audited at 375px, zero horizontal-overflow findings. Named remaining defects: hover-only Deals controls unreachable on touch, Discovery's unscrollable 10-column table, two clipped tables. **Offline editing is deliberately deferred this release (online-first); push is not built.** |
| 16 | Customer portal | **Not in it** | /portal/* | **Partial** | 21 tests, 12/12 mutations detected including every isolation mutation. Third auth system, isolation at the data layer, cross-contact access returns 404 not 403, documents default-deny via explicit grants, an accepted proposal is never labelled signed. Not yet exercised by a real customer session end to end. |
| 17 | Encryption, backups, MFA, security logging | ref §14 | Settings, Admin Hub | **Partial** | MFA and security logging done. Backup and restore-drill scripts exist and the release package requires a proven restore before deployment. Transport and at-rest encryption are hosting properties, not yet evidenced for the target environment. |
| 18 | Live dashboard / activities / priorities | **Not in it** | Command Center | **Done** | 11 clickable panels rendering their records inline; each count and list come from one server function. Range and Mine/Team filters, polling that pauses when hidden, refresh preserving state. Uninstrumented metrics say why, never zero. |

### The four areas the reference never mentions

Areas 12, 14, 16 and 18 — unified customer history, third-party integrations,
the customer portal and the live dashboard — are SiteMint's own scope. They
are tracked here at the same weight as the rest, because the brief is 18 areas
and a tutorial's table of contents does not narrow it.

### Reference features with no SiteMint gap

Every one of the reference's 14 areas is represented above, and so are the four
SiteMint areas it never mentions. The reference names nothing SiteMint has
decided not to do, and SiteMint tracks four things it never thought to ask for.

### SiteMint scope the reference does not cover

Receptionist operations, the live Command Center, and the customer portal — the
last of which is now built. The
portal in particular has an isolation requirement the reference never raises: a
signed-in customer must reach only their own records, and an attempt on another
contact's record must return 404 rather than 403, because a 403 confirms the
record exists.

---

## Keeping this honest

When a row changes, change it here and in `COVERAGE-MATRIX.md` together, and
move it only on evidence — a committed test, a browser verification, or a
command whose real exit code was recorded. "The reference lists it" is not
evidence, and neither is "the code exists".
