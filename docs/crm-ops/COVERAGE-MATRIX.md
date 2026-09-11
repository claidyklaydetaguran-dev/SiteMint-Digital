# SiteMint CRM — 18-area coverage register

> Branch `claude/sitemint-crm-operations-124038` @ `1962459` (merges receptionist `83ff869`).
> Updated 2026-09-11 at the end of Milestone 1. Nothing here may silently leave scope.

Status vocabulary — deliberately conservative:
**Done** = implemented, exercised against a real database or browser, and covered by a committed test.
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
| 6 | Support tickets / knowledge base | **Pre-existing** | `helpdesk_*` tables and routes live but unlinked to `crm_leads`; SLA columns evaluated by nothing; no agent login. |
| 7 | Segments, campaigns, automation | **Pre-existing** | The most complete subsystem: sequences, queue, scheduler, branch gates. `campaigns.send` is now a distinct permission. No visual email designer, no AI drafting. |
| 8 | Reporting and KPIs | **Partial (advanced M3)** | Sales reporting is now traceable: every figure on the forecast and the Command Center money panel carries its definition and its denominator. A serious defect was fixed — "Money received" was structurally $0 on every surface, because the readers filtered on a status value that no write path has ever produced and that is not in the declared vocabulary; a business reading that panel would have concluded it had never been paid. `TRANSACTION_RECEIVED_STATUS` names it once and a contract test asserts a real payment appears on all three money surfaces. Still missing: acquisition and campaign reporting, workload reporting, and any reporting on project profitability. |
| 9 | Documents / proposals / invoices | **Partial (advanced M3)** | Upload, versioning, per-record listing, authenticated download and a Documents screen are built. `crm_attachment_blobs` splits bytes from metadata; 25 MB cap; MIME allowlist excluding SVG; every file served `attachment` + `nosniff` + sandbox CSP. Share links: sha256-hashed token, expiry, download ceiling, revocation, and one generic refusal for invalid/expired/revoked/bogus alike. `crm_document_requests` makes "waiting on the client" a real outstanding ask. `documents.delete` separated from `documents.write`. Still missing: invoices, and any signing integration — an upload and an accepted proposal are explicitly NOT signatures. |
| 10 | Workflows, approvals, notifications | **Partial** | Campaign scheduler is real. Workflow steps are computed **client-side**; there is no server engine, no execution history. |
| 11 | **Staff auth, roles, permissions, audit** | **Done (M1)** | Per-person accounts, scrypt passwords, TOTP + recovery codes, durable revocable sessions, CSRF, DB-backed throttling, owner-editable permission matrix enforced in the API, audit trail. 36 DB-backed tests. |
| 12 | Unified interaction / purchase / note history | **Partial (advanced M3)** | Every lead-timeline entry defaulted to `created_by = "admin"` and nothing overrode it, so the timeline could not say which owner did anything; it now names the signed-in person at all thirteen write sites in `crm.ts` and in `phone.ts`. Messages carry `origin` (staff / automated / inbound / legacy) and a sender id, and belong to a conversation. Still fragmented: `crm_activities`, `crm_messages`, `crm_behavioral_events` and campaign events remain four separate streams with no single merged customer timeline view. |
| 13 | Calendars and scheduling | **Done (M3)** | `crm_appointments` with a start/end ordering constraint and an XOR attendee constraint (staff member or external email, never both). Create, reschedule, mark held, cancel and `.ics` export from the Calendar screen. Appointments drive the M2 reminder engine: verified live that a reminder lands exactly N minutes before the start, follows a reschedule, and is cancelled with the appointment. Three layers stay distinct — appointments, tasks due, lead follow-ups. Not built: attendee invitation email (`invitationsSent: false` is reported, never implied) and two-way provider sync — `.ics` is labelled an export. |
| 14 | Mailbox / accounting / ERP / e-commerce | **Not started** | No connectors. Requires owner decisions on providers before any work. |
| 15 | Responsive / mobile / offline / push | **Partial** | Shell responsive; leads list verified at 375px. **Calendar and Documents verified at 375px (M3)**: no horizontal overflow on either, and the appointment form becomes a full-width bottom sheet whose sticky footer keeps the submit button on screen. Inbox/Pipeline/Communications remain desktop-only. No PWA, offline or push. |
| 16 | Customer portal | **Not started** | Explicitly the final, separately gated milestone. |
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
