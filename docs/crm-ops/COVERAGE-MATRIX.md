# SiteMint CRM — 18-area coverage register

> Branch `claude/sitemint-crm-operations-124038`. Updated 2026-09-12 at the
> end of Milestone 4. Nothing here may silently leave scope. The candidate
> commit is named in RELEASE-PACKAGE.md §1 rather than repeated here, so the
> two cannot drift apart.

Status vocabulary — deliberately conservative:
**Done** = implemented, exercised against a real database or browser, covered by a committed test, AND
the outward effect a person depends on actually happens. A feature whose visible result is recorded
but never reaches the person waiting for it is **Partial**, however well the code is tested.
**Partial** = usable but incomplete against the reference brief.
**Pre-existing** = shipped before this program; audited but not re-verified this pass.
**Not started** = no implementation.
**Blocked** = cannot proceed without something outside this workstream (named).

| # | Area | Status | Where it stands |
|---|---|---|---|
| 1 | Contacts / customer records | **Pre-existing** | `crm_leads` + `CrmLeadDetail`. A "customer" is still a lead with status `Client`; no separate account entity. Duplicate review and import/export unbuilt. |
| 2 | Leads: capture, assignment, scoring | **Pre-existing** | Discovery intake → lead, 18 smart lists, locked `leadScore` engine. Assignment is now permission-gated but `assignedTo` is still free text (M1b). |
| 3 | Pipeline, deals, forecasting | **Done (M3)** | The chain now closes: a won deal converts into a project idempotently (`converted_project_id` is the key — three concurrent conversions produce one project), carrying the agreed value so the two halves of the business cannot drift apart. Deals have an owner, a per-deal likelihood, and a recorded outcome; losing requires a reason from a closed vocabulary, and the reasons are returned as counts. The forecast keeps pipeline, weighted, contracted and received as four separate figures, each with its basis stated, and reports how much of the weighting is the deal's own judgement versus a stage default. A win rate with no decided deals is null, not 0%. Still missing: multi-currency, and quote/invoice documents as distinct objects. |
| 4 | Email / SMS / calls | **Done (M3)** | Durable `crm_conversations` with identity, participants, per-person read position, drafts and handling state; keyset pagination and search, so an old conversation is on a later page rather than gone. One canonical inbox component behind both entry points. **Genuine two-way email**: `email.received` ingestion with two-key deduplication (delivery id and message id), content persisted at ingest because the provider keeps it only 30 days, correlation on an unforgeable reply token rather than the unauthenticated `from`, an unmatched queue so no client message is ever dropped, bounce/complaint suppression for all mail (not just campaigns), and reply-loop protection. SMS and calls now record which of the three owners sent them. Not active until an MX record exists on a reply subdomain — the one external blocker, documented in RELEASE-PACKAGE.md §7. |
| 5 | Tasks, activities, follow-ups, reminders | **Done (M2)** | One task system across Operations/Sales/leads with real staff assignment, priorities, recurrence, checklists and blocked reasons. Durable reminder engine (`crm_scheduled_jobs`): timezone-correct, deduped, claim-once, cancel-on-change, retry-with-backoff, visible permanent failures. 22 tests. |
| 6 | Support tickets / knowledge base | **Partial (M4)** | Separate `crm_support_*` tables rather than columns on the legacy `helpdesk_*` ones — those key contacts to `helpdesk_contacts` (NOT NULL) and assignees to `helpdesk_agents`, neither of which is the CRM's universe, and their surviving routes carry a second, independent notion of customer visibility. The boundary here is one `visibility` column with NO default, so a write that forgets it fails rather than landing customer-side, plus a check constraint that a resolved or closed ticket carries a resolution. Verified live: an internal note is visible to staff and absent from the whole customer-view payload, searched as raw text. Ownership, priorities, an explicit status machine, service requests and a knowledge base are all built. 23 tests. **Not Done, and this is why:** a customer reply is *recorded*, not sent. The ticket, the thread, the internal/customer boundary, priorities, assignment, service requests and the knowledge base are all built and tested — but a client waiting for an answer does not receive one, so the area cannot be called complete. Outbound delivery through the shared mail system is the remaining work. |
| 7 | Segments, campaigns, automation | **Done (M4)** | Segments store a definition, never a member list, because `within_days` is relative and a frozen list would quietly mail people it was told to exclude; count, preview and send call one resolver. Exclusions are evaluated at send time and every excluded contact gets a row with its reason. Unsubscribe reuses `crm_email_suppressions` rather than starting a second list. Visual block designer rendering email-safe HTML on the server, saved templates, mandatory personalisation fallbacks, staff-only test sends, schedule/pause/resume/cancel. AI drafting refuses to run unconfigured and rejects generated text making price, discount, guarantee, award, statistic, testimonial or named-client claims; copy stays a draft until a named person approves it. 16 tests, 12 of 12 mutations detected. Opens and clicks are genuinely untracked and report as such. **Scheduled campaigns now start themselves**, on the CRM scheduler tick, behind `CRM_MARKETING_AUTOSEND_ENABLED` — fail-closed on the exact string `"true"`, because this is the only worker that can email customers with nobody pressing Send. Preflight is re-run at start rather than trusted from scheduling time, and paused or cancelled campaigns are skipped, never resumed. Until the flag is set in an environment, the schedule response says so plainly instead of implying an alarm clock. |
| 8 | Reporting and KPIs | **Done (M4)** | 39 figures across acquisition, sales, revenue, operations, support, campaigns and communications, each carrying its definition, denominator, sources and limitations. Traceability is structural rather than promised: the summary runs the detail query and derives its number from those rows, so a count cannot disagree with the list behind it. A ratio with an empty denominator is null, never a fabricated 0%. The timezone days are counted in is stated on every response. Four email-engagement figures report as untracked because the webhook that would write them is unconfigured. `REPORTING-DEFINITIONS.md` is the traceability record. Verified in the browser against real data. |
| 9 | Documents / proposals / invoices | **Partial (advanced M3)** | Upload, versioning, per-record listing, authenticated download and a Documents screen are built. `crm_attachment_blobs` splits bytes from metadata; 25 MB cap; MIME allowlist excluding SVG; every file served `attachment` + `nosniff` + sandbox CSP. Share links: sha256-hashed token, expiry, download ceiling, revocation, and one generic refusal for invalid/expired/revoked/bogus alike. `crm_document_requests` makes "waiting on the client" a real outstanding ask. `documents.delete` separated from `documents.write`. Still missing: invoices, and any signing integration — an upload and an accepted proposal are explicitly NOT signatures. |
| 10 | Workflows, approvals, notifications | **Done (M4)** | A server-side engine: 10 triggers with typed payloads, conditions evaluated against the current record rather than a snapshot, 7 database-internal actions, approvals gated by identity, and execution history queryable per rule and per record. Three independent loop brakes — a UNIQUE index on (rule, trigger, record, occurrence), a chain depth carried through the payload, and a per-record window cap. No action type has an outbound channel, so an automation cannot contact a customer by construction. 19 engine tests, 13 of 13 mutations detected. **Producers were the real gap and are now wired**: lead created, lead status changed, deal won and deal lost emit through a fire-and-forget helper that cannot fail the write that caused it. `task_overdue` and `no_activity_for_days` still need a periodic sweep that does not exist. |
| 11 | **Staff auth, roles, permissions, audit** | **Done (M1)** | Per-person accounts, scrypt passwords, TOTP + recovery codes, durable revocable sessions, CSRF, DB-backed throttling, owner-editable permission matrix enforced in the API, audit trail. 36 DB-backed tests. |
| 12 | Unified interaction / purchase / note history | **Done (M4)** | 23 event sources across 11 tables merged into one chronological timeline per contact — communications, notes, meetings, documents, deals and their stage changes, projects, payments and support. Keyset-paged on `(occurred_at, source, id)` so older history cannot vanish or duplicate as new events arrive. Every entry carries an explicit `internal` or `customer` visibility, and the customer projection is filtered twice. It never invents an actor: rows whose `created_by` is the literal "admin" read as unattributed rather than credited to somebody. Verified in the browser — an internal support note is visible to staff and gone from "What the client can see", while the customer reply and the meeting remain. |
| 13 | Calendars and scheduling | **Done (M3)** | `crm_appointments` with a start/end ordering constraint and an XOR attendee constraint (staff member or external email, never both). Create, reschedule, mark held, cancel and `.ics` export from the Calendar screen. Appointments drive the M2 reminder engine: verified live that a reminder lands exactly N minutes before the start, follows a reschedule, and is cancelled with the appointment. Three layers stay distinct — appointments, tasks due, lead follow-ups. Not built: attendee invitation email (`invitationsSent: false` is reported, never implied) and two-way provider sync — `.ics` is labelled an export. |
| 14 | Mailbox / accounting / ERP / e-commerce | **Not started** | No connectors. Requires owner decisions on providers before any work. |
| 15 | Responsive / mobile / offline / push | **Partial (M4)** | All 43 CRM/ops pages plus 8 portal pages audited at 375px: **zero horizontal-overflow findings**. My Day verified at 375px this pass. Real remaining defects, cited rather than summarised: `CrmDeals.tsx` edit/delete are 24px AND inside `opacity-0 group-hover:`, so they are unreachable on touch; `CrmDiscovery.tsx` has a 10-column table with no scroll container and no mobile alternative; two tables sit inside `overflow-hidden` and are clipped rather than scrollable. **Offline and push are NOT built** — verified by searching for service workers, Workbox, VitePWA, web-push, PushManager, VAPID and IndexedDB across every source tree and finding none. No stub was added. Both need an owner decision before any work; see `PORTAL-AND-MOBILE.md`. |
| 16 | Customer portal | **Done (M4)** | A third auth system — its own cookie, CSRF header, tables and TTL — structurally unable to reach a staff route, and vice versa. Isolation is at the data layer: every read goes through a scoped helper that builds the contact filter into the query, so a route cannot forget it, and the tenant key comes off the session rather than a path or body value. Cross-contact access returns 404, not 403, because a 403 confirms the record exists. Documents are default-deny through an explicit grant table rather than inferred from association. An accepted proposal records a typed name and is never labelled signed. 21 tests; 12 of 12 mutations detected, including every isolation mutation. A defect found and fixed on the way: the portal first reused the staff login throttle, which behind a proxy would have locked out every client at once. |
| 17 | Encryption, backups, MFA, security logging | **Partial** | MFA and security logging **Done** (M1). Transport/at-rest encryption and backups are hosting properties not yet evidenced; no restore rehearsal. |
| 18 | Live dashboard / activities / priorities | **Done (M2)** | 11 clickable activity panels rendering their records inline; each count and list come from one server function. Range + Mine/Team filters, 60s polling that pauses when hidden, stale indicator, refresh preserving all state. Uninstrumented metrics say why, never zero. Money kept distinct: pipeline / contracted / received. |

## Milestone 1 — delivered and proven

| Requirement (brief §3) | Evidence |
|---|---|
| Individual accounts for three people | `crm_staff`; bootstrap → invite → activate driven end to end in a browser |
| Editable display names; surface spelling variants, never guess | `displayName` editable; `legacyNames[]` column reserved for reviewed mapping. **No account was created from a name** — see Open questions |
| Explicit permission matrix | `lib/staffPermissions.ts`, 32 permissions, 3 roles, owner-editable per-person grants |
| Enforced on every backend route and record access | `requireStaff` / `requireCrmAuth`; operations manager refused `DELETE /api/crm/leads/:id` with `leads.delete` in test and in the browser |
| Prevent self-escalation / unauthorized role assignment / last-owner removal | `refuseRoleChange`, `refuseStatusChange`; owner-only grants cannot be side-loaded; all three proven by test |
| Maintained secure password hashing | scrypt N=2^16 via `node:crypto` — no new dependency; parameters stored per-hash so they can be raised |
| Login/logout, single-use expiring invites and resets | 7-day invites, 1-hour resets, consumed atomically; replay returns 404 (tested) |
| Profile settings, disable/reactivate, session list/revocation | `/admin/crm/account`, `/admin/crm/people` |
| MFA enrolment with recovery | RFC 6238 TOTP + 10 single-use 64-bit recovery codes; recovery-code replay refused (tested) |
| Durable per-user sessions replacing the shared bearer | `crm_staff_sessions`, 12h idle / 7d absolute, `session_epoch` mass-revocation, survives restart |
| Rotation at auth/security changes; revocation on logout/disable/reset | Every path bumps the epoch; proven by four separate tests |
| Secure HttpOnly cookie + SameSite + CSRF + fail-closed | Verified on the wire; forged and cross-session CSRF both refused |
| Throttling suitable for multiple instances | `crm_staff_login_attempts` in the database, not process memory |
| Client address from real proxy topology | `TRUSTED_PROXY_HOPS`, default 0 = trust no forwarded header; spoof test included |

## Confirmed access policy (owner directive, 2026-09-11)

Decisions received and implemented:

1. **Name spellings — use the CRM's existing roster:** Shasta Greene, Claidy
   Taguran, Saisa Lorraigne.
2. **All three hold a separate full-access Owner / Super Admin account with
   equal access.** Job titles are organizational labels, not access
   restrictions. Verified: each account resolves to all 31 permissions, and all
   three reach every previously-restricted screen.
3. **Future team members get role-based access.** Invitations default to
   `operations_manager` and can never silently create an Owner — proven by test
   and by live API check.
4. **All three may manage staff and permissions**; restricted users cannot
   elevate themselves or anyone else.
5. **Full access does not bypass** authentication, per-person audit, or the
   existing confirmation prompts on destructive actions.
6. **Protected files authorized and migrated:** `phone.ts` and `intakeAgent.ts`
   now use the shared staff-session gate with permission checks. Webhook
   signature validation and all Twilio/SMS/voice/intake behaviour are untouched.

**Still needed before REAL accounts exist:** one verified email address per
person. None was invented. The owner creates their own account at `/admin`
(first-run screen, using the server's `ADMIN_PASSWORD`) and invites the other
two as Owners from `/admin/crm/people` — no code change required.

**Legacy shared token:** still accepted, by design. Retire it by setting
`CRM_LEGACY_BEARER_ENABLED=false` only after the three real accounts are created
and the affected screens are confirmed working, per the owner's instruction.
