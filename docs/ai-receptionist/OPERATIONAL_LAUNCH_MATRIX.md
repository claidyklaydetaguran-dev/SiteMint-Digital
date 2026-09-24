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
| 2026-09-25 ~06:00 | all | Release candidate 5dcae921: Linux gate (typecheck, full test chain, api/helpdesk/web-agency builds, 20-variant voice matrix) and CI run 36051407581 | local Linux + GitHub CI | — | all green | all green | 5dcae921 |
| 2026-09-25 ~06:10 | all | Production workspace: backup ref `backup/before-operational-0925` (= 7dd0b854 tree), checked out 5dcae921 as `release/operational-0925`, built api-server dist (new code present by grep) | production workspace (not published) | — | built | built; NOT published — deploy step stopped by the session permission classifier, awaiting owner | 5dcae921 |

### Re-verification 2026-09-25 (session 2, before any change)

| Check | Observed |
|---|---|
| Git | PR #36 open, head 0aff7620 (docs) on release candidate 5dcae921 |
| Production code | Still the 7dd0b854 release: readiness "published" check reads "Publish your receptionist." (the new code would name the missing configuration); `provider-status.artifactPolicy = unknown` |
| Production data | Assistant 1 still `draft`, not provider-linked; subscription `source: none` |
| Publish | Nothing was published since 7dd0b854. The workspace is on `release/operational-0925` (5dcae921) with the API dist built, unpublished |
| Vapi (production org) | Unchanged: one number +1 609 307 2692 → hand-built assistant ec5ae808 "AI Receptionist", no server URL; assistants "AI Receptionist", "Riley"; one credential, SiteMint production webhook HMAC (ab8f2204…) |
| New finding | The app's **Configurations** (non-secret) panel holds `STRIPE_WEBHOOK_SECRET` with a CI placeholder value. If the deployment uses it, the checkout webhook signature is verifiable with a public string. Tracked as H-11 |

### Release candidate 2 — d2ab383a (2026-09-25, session 2)

| Gate | Result |
|---|---|
| CI (GitHub) | run 36059931281 green on d2ab383a (full gates + voice matrix) |
| Linux gate | typecheck 0, full `pnpm run test` 0, 20/20 voice variants, api/helpdesk/web-agency builds 0 |
| Real database | voice 0015 applied to a clone of the test DB (journal 15→16, idempotent re-run); all 146 api-server test files pass against it (2457 tests, none skipped) |
| Rollback rehearsal | `0015_rollback.sql` on a second clone: table dropped, both constraints restored, text-origin contact kept as `manual` |
| Layout (harness, real build) | owner 66 captures (22 routes × 390/820/1440) and staff 27 captures, 0 horizontal overflow, 0 console errors; new screens: Contacts → Texts, Billing → Receptionist plan, staff notes |

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
| H-3 | H | 3 | Owner approve/decline/cancel/reschedule never notified the caller | audit, confirmed | Fixed on branch (60c4e72b): text and/or email on the channels the caller agreed to (STOP wins); unit + real-DB tests |
| H-4 | H | 3 | Owner reschedule freed the old time and deleted its event before the new time was confirmed | audit, confirmed | Fixed on branch (60c4e72b): new time booked first; original kept on failure (`not_confirmed`); raced original cancels the new booking |
| H-5 | H | 5 | Refused transfers were recorded as "unknown" | audit, confirmed | Fixed on branch: new `declined` state, "Not put through", with the reason |
| H-6 | H | 5 | Blind transfer: busy/no-answer lost the caller | audit, confirmed | Fixed on branch: provider warm transfer with a fallback that keeps the assistant on the line; needs the live transfer test |
| H-7 | H | 7 | Voice billing webhook lost an event whose apply failed | audit, confirmed | Fixed on branch: ledger row released; a lost race answers 500 |
| H-8 | H | 7 | Checkout never created the voice subscription; nothing reflected grace/suspended/cancelled | audit, confirmed | Fixed on branch (b197297d, owner-authorized change to `receptionistBilling.ts`): checkout activates `VOICE_CHECKOUT_PLAN_CODE`; payment_failed/succeeded/deleted/resumed move the plan; Billing shows the state; signed-event real-DB tests. Stripe sandbox run pending keys |
| H-9 | H | 4 | "yes" re-subscribed an opted-out caller; no status callback; no send cap | audit, confirmed | Fixed on branch: START/UNSTOP only; StatusCallback per send; daily caps 20/business, 100/total (defaults); HELP left to Twilio's built-in opt-out replies |
| H-10 | H | 4 | Voice SMS signature URL was built from the request protocol behind the TLS proxy | audit, confirmed | Fixed on branch: verified against VOICE_SMS_PUBLIC_ORIGIN / the VOICE_SERVER_URL origin |
| M-1 | M | 8 | Staff saw owner-only controls and learned only from a 403 | audit, confirmed | Fixed on branch (d2ab383a): `OwnerOnly` on every staff-refused action, pinned by contract test; staff pass captured at 390/820/1440 |
| M-2 | M | 3 | `findRequest` scanned only the 200 newest requests | audit, confirmed | Fixed on branch: direct firm-scoped lookup by public id |
| M-3 | M | 3 | Expired holds are never expired | audit | Open |
| M-4 | M | 5 | Deprecated `/receptionist/voice/transfer-destinations` routes still live | audit | Open |
| H-11 | H | 7 | `STRIPE_WEBHOOK_SECRET` appears as a non-secret configuration holding a CI placeholder value in the production app | Replit Secrets pane (value visible in the Configurations list) | Open: owner replaces it with the real Stripe endpoint secret as a Secret |
| M-5 | M | 3 | Dashboard approval of an older pending request did not re-check conflicts | audit, confirmed | Fixed on branch: other live requests, blocked periods and calendar busy time counted (`slot_conflict`, `conflict_check_failed`) |
| M-6 | M | 6 | No recording retention, deletion or access rule existed | audit, confirmed | Fixed on branch: required disclosure/retention/access when policy is `full`; owner Delete; hourly retention sweep. Production stays `none` |
| M-7 | M | 4 | Inbound replies other than STOP/START were not stored or shown | audit, confirmed | Fixed on branch: voice migration 0015 (`voice_sms_inbound`) + Contacts Texts thread; rehearsed forward/rollback on local clones |

## 3a. Production configuration for release 1 (to add in Adjust settings → Production app secrets, then Publish)

| Name | Value | Why |
|---|---|---|
| VOICE_ARTIFACT_POLICY | none | publish refuses without it; the approved value (added to the form, not yet published) |
| VOICE_SYNC_ENABLED | true | apply saved changes to a published receptionist |
| VITE_VOICE_SYNC_ENABLED | true | the dashboard control for the same |
| VOICE_BROWSER_TEST_ENABLED | true | browser test calls (the dashboard flag is already on) |
| VOICE_SERVER_URL | https://sitemintdigital.replit.app/api/voice/webhooks/vapi | where Vapi reports calls and tool use |
| VOICE_WEBHOOK_ATTACH_ENABLED | true | attach that URL at publish |
| VAPI_WEBHOOK_CREDENTIAL_ID | ab8f2204-61cb-4587-9591-1cd5bb69506f | the HMAC credential created in the production Vapi org (an identifier, not a secret) |
| VOICE_TOOLS_ATTACH_ENABLED | true | attach messages / booking / transfer tools |
| VOICE_TOOLS_CAPABILITIES | messages,scheduling,transfer | transfer stays inactive until a consenting contact exists |
| VOICE_RECONCILIATION_ENABLED | true | call-state reconciliation, usage backfill, grace expiry |
| VOICE_SERVICE_ACCESS_REQUIRED | true | only activated businesses can publish or start test calls |
| VOICE_PLAN_CATALOG_JSON | [{"planCode":"pilot","includedMinutes":300,"smsIncluded":false}] | the pilot plan SiteMint is activated on |

Rollback: in the workspace `git checkout main` (= 7dd0b854), rebuild api-server, remove the rows above, Publish.

## 4. Owner decisions (asked only when a test is ready)

Collected here; each is asked with the exact setting or test attached.

- Route +1 609 307 2692 from the July hand-built assistant to the SiteMint-managed pilot assistant.
- Live test call time.
- Transfer recipient who has agreed to receive a test transfer.
- Owned SMS recipient and spending cap; voice Twilio credentials (owner-entered).
- Recording policy: disclosure wording, retention period, deletion and access (see CALL_RECORDING_APPROVAL.md).
- Stripe live pricing and activation; sandbox keys for tests.
- Google customer-access approval (OAuth verification) before non-SiteMint businesses connect calendars.
