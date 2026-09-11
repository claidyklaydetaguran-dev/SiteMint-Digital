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
| `https://www.youtube.com/watch?v=74qo2kJsTAM` | **No.** | Nothing is claimed from it. No part of this document rests on it. |

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

The reference lists 14 areas. SiteMint's register has 18: the extra four
(receptionist operations, the live dashboard, unified customer history, and the
customer portal) are SiteMint's own scope, not the reference's.

---

## The mapping

Status vocabulary is the matrix's, deliberately conservative: **Done** =
implemented, exercised against a real database or browser, and covered by a
committed test. **Partial** = usable but incomplete. **Not started** = no
implementation.

| # | Reference feature | SiteMint screen | Status | Acceptance evidence |
|---|---|---|---|---|
| 1 | Contact management — store customer/prospect details and complete interaction history | Contacts (`/admin/crm/leads`), Contact detail | **Partial** | `crm_leads` + `CrmLeadDetail`. A customer is still a lead with status `Client`; there is no separate account entity, and no duplicate review. The "complete interaction history" half is area 12 below. |
| 2 | Lead management — capture, status, assignment, scoring | Contacts, Pipeline, Discovery CRM | **Partial** | Discovery intake → lead, 18 smart lists, the locked `leadScore` engine. Assignment is permission-gated, but `assignedTo` is still free text rather than a staff reference. |
| 3 | Sales pipeline — visualise opportunities, track stages, forecast revenue | Pipeline, Deals, Sales Workspace | **Done** | `crmSales.test.ts`. Deal owner, per-deal probability, recorded outcome with a closed lost-reason vocabulary. Won → project conversion is idempotent on `converted_project_id`: three concurrent conversions produce one project, verified live in the browser this session (one 201, two 200, one project id). Forecast keeps pipeline / weighted / contracted / received as four separate figures, each with its basis stated. |
| 4 | Customer communication — email, SMS, call logging, meeting scheduling | Inbox, Communications Center, Calendar | **Partial — built, one external blocker** | `crmInbox.test.ts`, `crmEmailInbound.test.ts`, `phoneAttribution.test.ts` (4/4, verified this session). Durable conversations with identity, participants, per-person read position and drafts. Read state, assignment and resolution proven independent in the browser this session: reading left status and assignee untouched, resolving left read state untouched, marking unread left the resolution standing. Inbound email is implemented but **not active** — it needs an MX record on a reply subdomain. |
| 5 | Task and activity management — tasks, appointments, follow-up reminders | My Day, All Tasks, Operations, Calendar | **Done** | One task system across every surface; durable reminder engine (`crm_scheduled_jobs`) that is timezone-correct, deduped, claim-once and cancel-on-change. My Day verified in the browser this session across all five buckets, the empty state, an API failure with working recovery, and 375px. |
| 6 | Customer support — tickets, complaints, service requests, knowledge base | Support (`/admin/crm/support`) | **Done** | `crmSupport.test.ts` — 23 tests, independently re-run. Separate `crm_support_*` tables; the internal/customer boundary is one column with no default plus a check constraint, and the customer projection filters in SQL. Verified live that an internal note never appears in the customer view. **Nothing sends yet** — replies are recorded and the delivery seam is marked. |
| 7 | Marketing automation — campaigns, segmentation, performance tracking, workflows | Marketing, Campaign Builder, Campaign Queue | **Done** | `crmMarketing.test.ts` — 16 tests, 12 of 12 mutations detected. Segments re-evaluated at send time, exclusions itemised with reasons, a visual designer rendering email-safe HTML on the server, mandatory personalisation fallbacks, staff-only test sends, pause/resume/cancel. Opens and clicks report as untracked rather than 0%. AI drafting is grounded, refuses to run unconfigured, and stays a draft until approved. A scheduled campaign still needs somebody to press send. |
| 8 | Reporting and analytics — sales, acquisition, dashboards, KPIs, revenue | Reporting, Command Center | **Done** | 39 figures, each with its definition, denominator and the rows behind it; the count is derived from the detail query, so the two cannot disagree. Verified in the browser against real data. Money uses `TRANSACTION_RECEIVED_STATUS`, and all three money surfaces agreed at $16,000 across 4 transactions this pass. `REPORTING-DEFINITIONS.md` records every definition and limitation. |
| 9 | Document management — contracts, proposals, invoices, uploads, versioning, sharing | Documents | **Partial** | Upload, versioning, authenticated download (`attachment` + `nosniff`), share links with hashed tokens, expiry, download ceilings and revocation, and document requests. **Invoices are not built, and nothing here is a signature** — an uploaded file and an accepted proposal are both explicitly labelled `signatureStatus: "not_a_signature"`. |
| 10 | Workflow automation — task automation, approvals, notifications, triggers | Automation Queue | **Done** | `crmAutomation.test.ts` (19) plus `automationProducers.test.ts` (5). Triggers, conditions against the current record, approvals by identity, execution history, retry budgets, stop conditions, and three independent loop brakes. Real business events now fire rules — lead created, lead status changed, deal won, deal lost — through a helper that cannot fail the write that caused it. Two time-based triggers still need a periodic sweep. |
| 11 | User management — authentication, role-based access, permissions, activity logs | People, My Account, Admin Hub | **Done** | Per-person accounts, scrypt passwords, TOTP with recovery codes, durable revocable sessions, CSRF, DB-backed throttling, an owner-editable permission matrix enforced in the API, and an audit trail. The three owners hold equal Super Admin access; a restricted new hire is refused at every boundary, re-verified this session by the connected journey. |
| 12 | *(SiteMint addition)* Unified customer history | Contact detail → Full History | **Done** | `crmHistory.test.ts` — 12 tests, 6 of 6 history mutations detected. 23 sources merged, keyset-paged, every entry carrying an explicit visibility. Verified in the browser: an internal support note is present for staff and absent from "What the client can see", while the customer reply and meeting remain. Unattributed historical rows are labelled, never credited to a person. |
| 13 | Calendar and scheduling — appointments, team calendars, invitations, reminders | Calendar | **Partial** | Create, reschedule, mark held, cancel, `.ics` export, and appointments driving the reminder engine, all verified live. **Two honest gaps, both reported by the API rather than implied:** attendee invitation email is not built (`invitationsSent: false` with a note saying why), and `.ics` is an export, not two-way provider synchronisation. |
| 14 | Mobile access — mobile-friendly interface, Android/iOS, offline, push | every CRM screen | **Partial** | All 43 CRM/ops pages and 8 portal pages audited at 375px with zero horizontal-overflow findings. Named remaining defects: unreachable hover-only controls on Deals, an unscrollable 10-column table on Discovery, two clipped tables. **Offline and push are not built**, verified by searching every source tree for service workers, web-push, PushManager, VAPID and IndexedDB and finding none. No stub was added; both need an owner decision. |
| 15 | Security — encryption, backup/recovery, MFA, audit logs, compliance | Settings, Admin Hub | **Partial** | MFA and security logging are done. Backup and restore-drill scripts exist (`pnpm --filter @workspace/db run backup` / `restore:drill`) and the release package requires a proven restore before deployment. Transport and at-rest encryption are hosting properties, not yet evidenced for the target environment. |

### Reference features with no SiteMint gap

Every one of the reference's 14 areas is represented above. The reference names
nothing that SiteMint has decided not to do.

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
