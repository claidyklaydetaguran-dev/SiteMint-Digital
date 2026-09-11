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
| 3 | Pipeline, deals, forecasting | **Pre-existing** | Kanban, deals, transactions. Transactions still N+1 and unpaginated. No weighted forecast. |
| 4 | Email / SMS / calls | **Partial + Blocked** | Reads and sends exist via `phone.ts`/Resend. **Blocked:** `phone.ts` is CLAUDE.md-protected and accepts only the legacy bearer, so those routes reject staff sessions (see Handoff §Protected). No inbound email/mailbox integration. |
| 5 | Tasks, activities, follow-ups, reminders | **Partial** | Tasks/activities persist. **No reminder engine** — dates exist, nothing fires. M2. |
| 6 | Support tickets / knowledge base | **Pre-existing** | `helpdesk_*` tables and routes live but unlinked to `crm_leads`; SLA columns evaluated by nothing; no agent login. |
| 7 | Segments, campaigns, automation | **Pre-existing** | The most complete subsystem: sequences, queue, scheduler, branch gates. `campaigns.send` is now a distinct permission. No visual email designer, no AI drafting. |
| 8 | Reporting and KPIs | **Pre-existing** | `CrmReporting` charts from live endpoints. No traceable KPI definitions or denominators yet. |
| 9 | Documents / proposals / invoices | **Partial** | Proposal + SOW HTML persist on the record. No document entity, uploads, versions or sharing. Lead-sourced proposals still embed invented budget/timeline (`crm.ts` `crmLeadToSubmission`). |
| 10 | Workflows, approvals, notifications | **Partial** | Campaign scheduler is real. Workflow steps are computed **client-side**; there is no server engine, no execution history. |
| 11 | **Staff auth, roles, permissions, audit** | **Done (M1)** | Per-person accounts, scrypt passwords, TOTP + recovery codes, durable revocable sessions, CSRF, DB-backed throttling, owner-editable permission matrix enforced in the API, audit trail. 36 DB-backed tests. |
| 12 | Unified interaction / purchase / note history | **Pre-existing** | `crm_activities` timeline plus three other event tables; fragmented, lead-scoped only. |
| 13 | Calendars and scheduling | **Partial** | `CrmCalendar` is read-only, synthesised from task/follow-up dates. Cannot create or edit. Receptionist-side scheduling tables exist separately. |
| 14 | Mailbox / accounting / ERP / e-commerce | **Not started** | No connectors. Requires owner decisions on providers before any work. |
| 15 | Responsive / mobile / offline / push | **Partial** | Shell responsive; leads list verified at 375px this pass. Inbox/Calendar/Pipeline/Communications remain desktop-only. No PWA, offline or push. |
| 16 | Customer portal | **Not started** | Explicitly the final, separately gated milestone. |
| 17 | Encryption, backups, MFA, security logging | **Partial** | MFA and security logging **Done** (M1). Transport/at-rest encryption and backups are hosting properties not yet evidenced; no restore rehearsal. |
| 18 | Live dashboard / activities / priorities | **Partial** | Command Center answers all five operating questions and has a Refresh. Not yet live-polling, no date range, no Mine/Team scope, no clickable activity buttons. M2. |

## Milestone 1 — delivered and proven

| Requirement (brief §3) | Evidence |
|---|---|
| Individual accounts for three people | `crm_staff`; bootstrap → invite → activate driven end to end in a browser |
| Editable display names; surface spelling variants, never guess | `displayName` editable; `legacyNames[]` column reserved for reviewed mapping. **No account was created from a name** — see Open questions |
| Explicit permission matrix | `lib/staffPermissions.ts`, 31 permissions, 3 roles, owner-editable per-person grants |
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

## Open questions for the owner (blocking real accounts only)

1. **Name spellings differ between sources and must not be guessed.** The brief says *Saisa Lorraine, Clyde Taguran, Shasta Green*; the CRM's existing hardcoded roster says *Saisa Lorraigne, Claidy Taguran, Shasta Greene*. Which spelling is each person's, and are these the same three people?
2. **Email addresses.** None were invented. Real accounts need one verified address each.
3. **Proposed role assignment** — confirm or amend: Shasta = owner; Clyde/Claidy = technical administrator; Saisa = operations manager.
4. **Two defaults worth a decision:** operations managers currently cannot send bulk campaigns (`campaigns.send`) or delete records; both are owner-grantable per person. Technical administrators cannot assign roles, disable people, or delete records.

Nothing above blocks further implementation — M2 continues meanwhile.
