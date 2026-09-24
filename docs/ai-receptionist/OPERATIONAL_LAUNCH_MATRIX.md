# AI Receptionist — operational launch matrix

Owner directive of 2026-09-25: make the AI Receptionist operational for real
customers, one journey at a time, with SiteMint as the first pilot. This file is
the single evidence ledger. A row is **Proven** only when the action ran in the
named environment and the actual result was observed; code reading and local
tests are recorded as such and never as proof of the deployed behaviour.

Branch: `claude/receptionist-operational-0925` (from
`design/mint-clarity-public-release` @ 16746f1c).

## 0. Verified starting state (2026-09-25, production, read-only)

| Fact | Evidence |
|---|---|
| Production = Web Asset Builder deployment behind sitemintdigital.com; deployed commit 7dd0b854 | Replit publishing pane; workspace `git log` |
| Pilot account: firm 2 "SiteMint Digital", info.sitemint@gmail.com, owner/account holder, email confirmed, timezone America/Los_Angeles | `GET /receptionist/auth/me`, `/account/profile`, `/account/email-status` (owner session) |
| Hours Mon–Fri 09:00–17:00; appointment type "Discovery consultation" 30 min | `GET /receptionist/availability/config` |
| Google Calendar connected (primary), health `healthy`, writes enabled | `GET /receptionist/calendar/health` |
| Assistant 1 "SiteMint Digital Receptionist" is a **draft**, never published, no provider link | `GET /receptionist/voice/assistants` |
| No number assigned to the firm; no calls, messages, issues | `/voice/numbers`, `/voice/calls`, `/voice/messages` |
| Every capability `platform_disabled` (messages, scheduling, transfer) | `GET /receptionist/voice/capabilities` |
| No subscription (`entitlements.source = none`) | `GET /receptionist/account/subscription` |
| Production Vapi organisation (d52578f7…) holds exactly one number, **+1 609 307 2692** (provider twilio, active), attached to a hand-built July assistant "AI Receptionist" (not managed by SiteMint), no server URL; one other assistant "Riley"; no credentials before this work | Vapi API read from the production workspace shell, key never printed |
| +1 609 307 2692 is the dev-Twilio number imported into Vapi, **not** the intake SMS number (settled 2026-08-27 from Twilio audit events) | memory: vapi/twilio number identity |
| +1 860 483 9097 is **not** in the production Vapi organisation | same read (count 1) |
| Deployment secrets present: VAPI_API_KEY, VAPI_WEBHOOK_SECRET, VITE_VAPI_PUBLIC_KEY, VOICE_PUBLISH_ENABLED, VITE_VOICE_{PLATFORM,PUBLISH,BROWSER_TEST}_ENABLED, VOICE_RUNTIME_CATALOG_JSON, CALENDAR_{CONNECT,WRITE}_ENABLED, CALENDAR_TOKEN_KEY, GOOGLE_OAUTH_*, PUBLIC_REGISTRATION_ENABLED, PASSWORD_RESET_REQUESTS_ENABLED, VOICE_ALERTS_{ENABLED,FROM,TO}, VOICE_DASHBOARD_BASE_URL, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET, … | Adjust settings → Production app secrets (names only) |
| **Absent**: VOICE_ARTIFACT_POLICY (so every publish returns `publish_disabled`), VOICE_SYNC_ENABLED, VOICE_BROWSER_TEST_ENABLED, VOICE_SERVER_URL, VOICE_WEBHOOK_ATTACH_ENABLED, VAPI_WEBHOOK_CREDENTIAL_ID, VOICE_TOOLS_*, VOICE_SMS_*, VOICE_TWILIO_*, VOICE_PLAN_CATALOG_JSON, VOICE_BILLING_WEBHOOK_SECRET, INVITE_SIGNUP_ENABLED | same |

## 1. Journey status

| # | Journey | Status | Blocking |
|---|---|---|---|
| 1 | Registration, verification, sign-in/reset, team roles, setup, publish | In progress | Production publish configuration (this work) |
| 2 | Inbound call → correct assistant, business answers, outcome recorded, provider failure safe | Not started | J1 publish; owner approval to route +1 609 307 2692; owner's live call |
| 3 | Availability, booking into Google, conflicts, timezone, confirm, reschedule, cancel | Not started | Critical defects C-1, C-2 below must be fixed before scheduling is switched on |
| 4 | Caller texts: confirmations, replies, status, STOP/HELP, consent, limits | Not started | C-3; voice Twilio credentials; owner's owned recipient + spending cap |
| 5 | Transfer with busy/no-answer fallback | Not started | H-5, H-6; consenting recipient |
| 6 | Call history and replay | Not started | Owner decision on recording policy (§4) |
| 7 | Usage and billing | In progress (service gate) | C-4, H-7; Stripe sandbox keys; owner pricing decision |
| 8 | Honest loading/success/failure/permission states everywhere | Not started | — |

## 2. Evidence ledger

| When (UTC) | Journey | Action | Environment | Account | Expected | Actual | Commit |
|---|---|---|---|---|---|---|---|
| 2026-09-25 03:00 | 0 | Read production state (above) | production | firm 2 owner session | — | as recorded in §0 | 7dd0b854 |
| 2026-09-25 03:05 | 2 | Create Vapi HMAC webhook credential in the production organisation (x-vapi-signature / x-vapi-timestamp, sha256 hex, `{timestamp}.{body}`), secret read from the workspace env, never printed | production Vapi | — | 201 | 201, id ab8f2204-61cb-4587-9591-1cd5bb69506f | — |

## 3. Issue register

Severity: **C** critical, **H** high, **M** medium. Source "audit" = found by
reading code on this branch, not yet reproduced; each is re-verified before it
is fixed or closed.

| Id | Sev | Journey | Issue | Source | Status |
|---|---|---|---|---|---|
| C-0 | C | 1/7 | Nothing tied publishing or browser test calls to a plan: with open registration any sign-up could publish and start paid test calls once publishing is configured | code + production flags | Fixed on branch: `VOICE_SERVICE_ACCESS_REQUIRED` gate (publish, sync, browser test) + readiness `not_activated` |
| C-0b | H | 1/8 | Production publish always fails (`publish_disabled`, missing VOICE_ARTIFACT_POLICY) while Setup tells the owner to publish | production flags + code | Fixed on branch: readiness names the real blocker; config pending |
| C-1 | C | 3 | Voice booking path never checked Google busy times (`toolDispatcher.ts` passed no calendar provider) | audit, confirmed in code | Fixed on branch (9c794879): offered times and the in-lock re-check both merge the connected calendar; dashboard approval still does not re-check (M-5) |
| C-2 | C | 3 | Overlapping bookings with different start times could both succeed (lock keyed on exact start) | audit, confirmed in code | Fixed on branch (9c794879): one booking lock per business; real-DB race test pending |
| C-3 | C | 4 | No caller text could ever be sent: consent was never captured on a call | audit, confirmed in code | Fixed on branch: `smsConsent` on book_appointment, true only on the caller's yes at a read-back number; live send blocked on owner (voice Twilio credentials, recipient, cap) |
| C-4 | C | 7/8 | Usage page said "paused because the usage limit was reached" when nothing pauses service | audit, confirmed | Fixed on branch: says minutes used up, calls still answered |
| H-1 | H | 3 | Callers could not cancel/move a booked appointment ("reference not found") | audit, confirmed | Fixed on branch: booked cancel via the calendar service; a move releases the original only after the new time is confirmed |
| H-2 | H | 3 | Two simultaneous approvals could delete the only Google event while the row stayed booked | audit, confirmed | Fixed on branch: the loser keeps an event the winner stamped |
| H-3 | H | 3 | Owner approve/cancel/reschedule never notifies the caller | audit | Open |
| H-4 | H | 3 | Owner reschedule frees the old time and deletes its event before the new time is confirmed | audit | Open |
| H-5 | H | 5 | Refused transfers were recorded as "unknown" | audit, confirmed | Fixed on branch: new `declined` state, "Not put through", with the reason |
| H-6 | H | 5 | Blind transfer: busy/no-answer lost the caller | audit, confirmed | Fixed on branch: provider warm transfer with a fallback that keeps the assistant on the line; needs the live transfer test |
| H-7 | H | 7 | Voice billing webhook lost an event whose apply failed | audit, confirmed | Fixed on branch: ledger row released; a lost race answers 500 |
| H-8 | H | 7 | Checkout (`receptionistBilling.ts`, protected) never creates the voice subscription; "Paid" never reflects grace/suspended/cancelled | audit | Open (protected file: owner must name it to change) |
| H-9 | H | 4 | "yes" re-subscribed an opted-out caller; no status callback; no send cap | audit, confirmed | Fixed on branch: START/UNSTOP only; StatusCallback per send; daily caps 20/business, 100/total (defaults); HELP left to Twilio's built-in opt-out replies |
| H-10 | H | 4 | Voice SMS signature URL was built from the request protocol behind the TLS proxy | audit, confirmed | Fixed on branch: verified against VOICE_SMS_PUBLIC_ORIGIN / the VOICE_SERVER_URL origin |
| M-1 | M | 8 | Staff see owner-only controls on several pages and learn only from a 403 | audit | Open |
| M-2 | M | 3 | `findRequest` scans only the 200 newest requests | audit | Open |
| M-3 | M | 3 | Expired holds are never expired | audit | Open |
| M-4 | M | 5 | Deprecated `/receptionist/voice/transfer-destinations` routes still live | audit | Open |
| M-5 | M | 3 | Dashboard approval of an older pending request does not re-check the calendar | audit | Open |
| M-6 | M | 6 | No recording retention, deletion or access rule existed | audit, confirmed | Fixed on branch: required disclosure/retention/access when policy is `full`; owner Delete; hourly retention sweep. Production stays `none` |
| M-7 | M | 4 | Inbound replies other than STOP/START are not stored or shown | audit | Open (needs a table: reviewed migration) |

## 4. Owner decisions (asked only when a test is ready)

Collected here; each is asked with the exact setting or test attached.

- Route +1 609 307 2692 from the July hand-built assistant to the SiteMint-managed pilot assistant.
- Live test call time.
- Transfer recipient who has agreed to receive a test transfer.
- Owned SMS recipient and spending cap; voice Twilio credentials (owner-entered).
- Recording policy: disclosure wording, retention period, deletion and access (see CALL_RECORDING_APPROVAL.md).
- Stripe live pricing and activation; sandbox keys for tests.
- Google customer-access approval (OAuth verification) before non-SiteMint businesses connect calendars.
