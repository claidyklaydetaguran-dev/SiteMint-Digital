# Customer Dashboard Plan (AI Receptionist application) — reconciled 2026-09-04

> **Owner decisions applied (D-1…D-9, C-1…C-6, B-1…B-6, A-1…A-4, U-1…U-4, S-1…S-3).** Where a
> row below conflicts with OWNER-REVIEW-WORKBOOK.md, the workbook wins. Superseded items:
> the 2026-09-03 nav proposal (replaced by the D-2 nav), bottom mobile nav (D-9 keeps the
> drawer), "Integrations page with a calendar card" (Calendar lives under Scheduling, D-8/B-4),
> "Sync" wording (C-5: Save changes / Publish update), "Booking preview" (B-5: Test Booking).
> Persistent onboarding needs an additive migration (owner approval).

> Planning document. Each item maps to a row in CURRENT-STATE.md §4 and a requirement in
> AI-RECEPTIONIST-PRIVATE-BETA.md. Implementation phases are contract-aware: every listed
> page has a committed contract test that pins copy or structure, so each change starts by
> updating the contract module, then the page.

## 1. Screen-by-screen plan

| Screen | Today | Target for beta | Contract touched | States required |
|---|---|---|---|---|
| Login | done | add "Forgot password" once reset UI exists | loginContract | loading, invalid, rate-limited (429 → "try again in X") |
| Signup (web-agency) | done, flag off | invite code field (optional) | signupContract | field errors, duplicate (non-enumerating), network |
| Onboarding hub (new `/setup`) | none | checklist: business info → assistant prompt → voice → hours → appointment types → calendar → test call → number; each row done/pending/blocked with deep link; progress = signal thread | new setupContract | empty (new firm), partial, complete, blocked (flag off) |
| Overview | SMS-only readiness rail | status header (assistant state chip, number, calendar), today's activity (calls, conversations, appointment requests), needs-attention list fed by `/voice/issues` + over-cap, recent activity; onboarding pointer while incomplete | overviewContract (pinned literals) | skeleton, empty, error+retry, partial (one query failed) |
| Assistant (list) | done | single-assistant default for beta: list still exists, "create" hidden when one exists (owner decision) | assistantsContract | skeleton, empty, error, delete confirm |
| Assistant → Setup / Prompt / Voice & model | done | add breadcrumb; "how a caller hears this" preview labelled simulated; cost hint line | builder contracts | publish in-flight (fieldset disabled), publish error humanised, unsaved guard |
| Test call | built, flag off | in-builder panel; mic permission prompt copy; fails closed with reason | browser-voice contract | unavailable (no public key), connecting, live, ended, error |
| Availability | done (voice-flagged) | move out of voice flag; breadcrumb Scheduling / Availability | appointmentsContract | loading, saved, error |
| Appointment types | done | same | same | max-20 reached (disabled with reason) |
| Appointments | list; booked rows inert | list + detail drawer; **Approve** (pending → booked), **Reschedule** (booked → replacement), **Cancel** (booked → cancelled) via the calendar router; sync status per row; filters by state | appointmentsContract (stale "no endpoint" comment removed) | empty, error, disabled when calendar not connected (visible reason), conflict 409, not_booked 409 |
| Calendar (new) | status line only | connect card (scoped permissions explained) → start OAuth; connected card (provider, since, disconnect with consequence text); error card with retry; reads `?calendar=connected|error` | new calendarContract | not connected, connecting, connected, error, disabled (flag off) |
| Calls | done (voice-flagged) | rename "Call Logs" → "Calls"; inbound-in-progress chip; metadata-only explanation | callLogs contracts | loading, empty, error, not-found |
| Conversations | done | keep; label as SMS channel | conversationsContract | done |
| Contacts | capability state | minimal list (name, number, source, last activity) + detail with linked calls/conversations; needs a new read route | new contactsContract | loading, empty, error |
| Phone number | ComingSoon | number card (assigned number, state, capabilities), pause/unpause, "managed by SiteMint" lock for SMS | new numbersContract | none assigned (setup pointer), assigned, paused, error |
| Transfers / SMS | none / none | "coming later" capability-state tiles, honest copy | nav metadata | disabled |
| Integrations | ComingSoon | one page with the Calendar card (reuse Calendar screen) + "more later" | nav metadata | as Calendar |
| Usage & limits | SMS meter | minutes this period, calls, included minutes, cap state (`pause_requested` banner), SMS conversations | billingContract | loading, error, over cap |
| Billing | done | keep; plan catalog when decided | billingContract | not configured (already handled) |
| Issues | none | list of open issues (level, code, plain message, occurrences, first/last seen), resolve; "all clear" empty state with last-checked time | new issuesContract | loading, empty, error |
| Settings | read-only | firm profile fields (name, industry, timezone), sign-out; honours `?calendar=` | settingsContract | loading, error, saved |
| 404 / capability states | mixed | every unrouted or flag-off path renders the capability-state page with a back link; never a bare 404 for a known feature | routes contract | disabled, not found |

## 2. Navigation and shell changes

- Sidebar groups per INFORMATION-ARCHITECTURE §3; groups collapsible, no nested scroll;
  active item = rail + tinted background + `aria-current`; breadcrumb on nested screens.
- Preview/synthetic banner: revive `DemoModeBanner` (parameterised) for any fixture data.
- Mobile: bottom nav ≤5 groups; deep screens push with a visible back control.

## 3. Flag plan

| Build flag | Beta value | Reason |
|---|---|---|
| `VITE_VOICE_PLATFORM_ENABLED` | true | assistants, calls, appointments |
| `VITE_VOICE_PUBLISH_ENABLED` | true | publish from the dashboard (owner-approved per firm) |
| `VITE_VOICE_BROWSER_TEST_ENABLED` | true | test call step |
| `VITE_VOICE_SYNC_ENABLED` | true | re-sync after prompt edits |
| (new) calendar UI needs no build flag | — | runtime `CALENDAR_*` flags govern |

The AR-001M content boundary still applies: nothing voice-gated may leak into a build with
the flag off (the 16/20-variant voice matrix stays in CI).

## 4. Order of work (each phase = one PR, one contract update, gates green)

1. Unbundle Availability / Appointment types / Calendar status from the voice flag.
2. Calendar connection screen + Settings query handling.
3. Appointments lifecycle controls (approve / reschedule / cancel booked).
4. Onboarding hub + Overview status header.
5. Usage (voice minutes) + Issues page.
6. Contacts minimal read route + page.
7. Phone number page over existing routes + guarded inventory insert (admin).
8. Nav regroup, breadcrumbs, capability-state for every path, 404.
9. Test-call certification run (owner-authorised paid call).

## 4a. Approved navigation (D-2)

Overview · Setup · Assistant (Configuration, Prompt, Voice) · Scheduling (Availability, Appointment Types, Calendar, Appointments) · Activity (Calls, Conversations, Contacts) · Channels (Phone Number, SMS, Transfers when implemented) · Account (Usage, Billing, Settings, Support). Removed from nav until functional: Tools, Voice Library, Knowledge, Analytics, Testing, Structured Outputs, Integrations, API Keys.

## 5. Out of scope for the beta dashboard

Tools, knowledge base, voice library, analytics, testing suite, structured outputs, API keys,
squads, outbound, team members, integrations beyond calendar.
