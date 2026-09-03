# AI Receptionist — Smallest Honest Private Beta

> Planning document. Defines the invite-only beta scope and sorts every requirement into
> four columns. "Certified" means proven on staging with written evidence; see
> CURRENT-STATE.md for the code state behind each row.

## 1. Beta definition

- **Who:** 1–3 invited service businesses with one location and one calendar each,
  onboarded personally by SiteMint. Manual invoicing; no self-serve billing required.
- **What they get:** a voice receptionist on a dedicated SiteMint-provisioned number that
  answers, qualifies against their prompt, checks real availability, books / reschedules /
  cancels against their Google Calendar, and shows them calls, conversations, contacts,
  usage and issues in a dashboard. A browser test call before go-live.
- **What they do not get yet (visibly "coming later"):** SMS follow-up from the voice
  product, human transfer, integrations beyond Google Calendar, self-serve billing, team
  members, recordings or transcripts (policy `none`).

## 2. Requirement matrix

Legend: ✅ exists and certified · 🟡 exists, not certified or not wired · ❌ missing.
Columns: **OP** required for owner preview · **PB** required for invite-only private beta ·
**PL** required before public launch · **Post** post-launch.

| # | Requirement | State | OP | PB | PL | Post | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Signup and login | 🟡 signup flag off; login ✅ | ✓ | ✓ | ✓ | | flip `PUBLIC_REGISTRATION_ENABLED`; or invite-only signup token (P8 tokens exist) |
| 2 | Password reset | 🟡 backend only | | | ✓ | | `PASSWORD_RESET_REQUESTS_ENABLED` + a two-screen UI |
| 3 | Guided onboarding | ❌ | ✓ (planned prototype) | ✓ | ✓ | | checklist route with deep links; persistence can be derived (config rows present) for the beta |
| 4 | Business information | ✅ (SMS agent-config) | ✓ | ✓ | ✓ | | reuse `agent-config` fields as firm profile until a firm-profile route exists |
| 5 | Assistant prompt | 🟡 built, behind voice flag | ✓ | ✓ | ✓ | | PromptTab |
| 6 | Voice selection | 🟡 built, behind voice flag | ✓ | ✓ | ✓ | | VoiceModelTab; sample playback is Post |
| 7 | Hours and availability | ✅ M2, behind voice flag | ✓ | ✓ | ✓ | | unbundle from `VITE_VOICE_PLATFORM_ENABLED` |
| 8 | Appointment types | ✅ M2 | ✓ | ✓ | ✓ | | wholesale PUT is fine |
| 9 | Google Calendar connection UI | 🟡 backend ✅ M2, UI ❌ | ✓ (fixture) | ✓ | ✓ | | connect / status / disconnect screen; Settings must read `?calendar=connected` |
| 10 | Browser test call | 🟡 built, **not certified** | | ✓ | ✓ | | needs one authorised paid web call; AR-002C blocker was the provider widget, not SiteMint's path |
| 11 | Assigned phone number | ❌ provisioning; 🟡 routes | | ✓ | ✓ | | owner acquires a voice-only number; admin inserts inventory row (no code path today — needs a guarded admin script or route) |
| 12 | Inbound calling | 🟡 backend (assistant-request from inventory) | | ✓ | ✓ | | certify with a scripted real call (PILOT_ACTIVATION Stage 3) |
| 13 | Availability during a call | ✅ tool loop (P3) | | ✓ | ✓ | | certified only via synthetic webhook; re-verify live in Stage 2 |
| 14 | Create / reschedule / cancel booking | ✅ M4 backend; ❌ dashboard controls | ✓ (fixture) | ✓ | ✓ | | wire approve / cancel-booked / reschedule to the calendar router; update the pinned contract |
| 15 | Conversations (SMS intake) | ✅ | ✓ | ✓ | ✓ | | existing product |
| 16 | Calls list + detail | 🟡 behind voice flag | ✓ | ✓ | ✓ | | metadata-only by policy |
| 17 | Contacts | ❌ backend, ❌ UI | ✓ (fixture) | ✓ (minimal) | ✓ | | minimal: list of callers derived from `voice_contacts` + intake conversations |
| 18 | Usage and limits | 🟡 SMS meter ✅; voice minutes uncalled | ✓ | ✓ | ✓ | | call `GET /voice/usage`; show cap posture |
| 19 | Safe failure handling | 🟡 issues backend ✅, UI ❌ | ✓ (fixture) | ✓ | ✓ | | minimal Issues page over `GET /voice/issues`; error states already exist per page |
| 20 | Admin visibility and support | 🟡 roster ✅, diagnostics route ✅, UI ❌ | ✓ (fixture) | ✓ | ✓ | | Receptionist Ops → Firms screen |
| 21 | Alerts to SiteMint staff | 🟡 flags off | | ✓ | ✓ | | `VOICE_ALERTS_ENABLED` + Resend key (Stage 4) |
| 22 | Billing self-serve | 🟡 | | | ✓ | | plan catalog decision; Stripe test-clock run (Stage 5) |
| 23 | SMS from the voice product | 🟡 flags off | | | | ✓ | Stage 6, owner policy; remains "coming later" |
| 24 | Human transfer | 🟡 backend | | | | ✓ | "coming later" tile |
| 25 | Integrations page | ❌ | | | ✓ | | calendar card at minimum |
| 26 | Team members | 🟡 backend | | | | ✓ | auth change not authorised |
| 27 | Recordings / transcripts | policy `none` | | | | decision | legal + owner |
| 28 | Legal pages approved | ❌ | | | ✓ | | counsel |
| 29 | Domain cutover (`app.`) | ❌ | | | ✓ | | separate program |
| 30 | Production deployment of PR #30 frontend | 🟡 build proven | | ✓ | ✓ | | merge + deploy after owner review |

## 3. Certified today vs needed for beta (summary)

Certified on staging: login rate limiting, signup, assistant publish (once), Vapi HMAC
webhooks, calendar M2 (availability + free/busy), M3 (booking capture), M4 (create /
reschedule / cancel / reconcile), metering ledger row, database restore/parity procedures.

Not yet certified and required for beta: browser test call (SiteMint path), number
assignment + inbound call, live tool loop on a real call, alerts.

## 4. Beta go/no-go gates

1. All PB rows green on the deployed origin.
2. PILOT_ACTIVATION.md Stages 0–4 executed with evidence; Stage 5–6 explicitly deferred.
3. `git diff` on protected files = 0; secret scan clean; contract suites green.
4. One real inbound call by the owner, booked into a test calendar, then cancelled, with
   the expected rows and no transcript stored.
5. Owner sign-off on OWNER-REVIEW-WORKBOOK.md for the app pages.

## 5. Readiness estimate (as of 2026-09-03)

| Milestone | Estimate | Basis |
|---|---|---|
| Owner preview | **ready now** (this package) | mode A + mode B servers, screenshots, ledger |
| Invite-only private beta | **not ready** — roughly 9 frontend work items (rows 3, 9, 11, 14, 17, 18, 19, 20 + flag unbundling) plus 4 certification runs (10, 11/12, 13, 21) | each item is one contract-aware phase; no new dependency expected |
| Public launch | **not ready** — beta items plus rows 2, 22, 25, 28, 29 and the honesty copy fixes on the website | legal and domain programs are owner-driven |
