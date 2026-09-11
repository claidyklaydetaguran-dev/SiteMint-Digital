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
| 4 | Email / SMS / calls | **Partial** | Reads and sends exist via `phone.ts`/Resend, now on staff sessions with per-route permissions (owner-authorized 2026-09-11; webhooks untouched). No inbound email/mailbox integration — that remains the real gap. |
| 5 | Tasks, activities, follow-ups, reminders | **Done (M2)** | One task system across Operations/Sales/leads with real staff assignment, priorities, recurrence, checklists and blocked reasons. Durable reminder engine (`crm_scheduled_jobs`): timezone-correct, deduped, claim-once, cancel-on-change, retry-with-backoff, visible permanent failures. 22 tests. |
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
| 18 | Live dashboard / activities / priorities | **Partial** | Backend complete (M2): `/crm/command-center` serves 11 activity panels where each count comes from the same function as its list, plus a traceable sales summary and an activity feed. Uninstrumented metrics return `available:false` with a reason, never a zero. **Frontend wiring of the clickable buttons is the next step.** |

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
