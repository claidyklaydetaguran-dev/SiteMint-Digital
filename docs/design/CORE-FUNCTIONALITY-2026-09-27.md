# Receptionist core functionality release

Owner direction: defer pricing, repair core workflows and Settings, preserve the approved Mint Clarity workspace, then publish. No price, paid plan, credit package or provider activation is enabled by this release.

## Fixed

- Assistant follows Overview in the navigation.
- Business profile read failures no longer expose an editable empty profile. A retry restores editing only after a successful read.
- A profile save invalidates the session summary so the workspace business name refreshes, and uses the timezone returned by the server.
- Failed saves preserve the unsaved form; duplicate submission is guarded while saving.
- Phone setup requests are owner-only in the UI, matching server permissions.
- Production publish/sync/browser-call routes require an active catalogued subscription regardless of a missing or false activation flag. This is not proof of suspension of already assigned inbound numbers.
- Windows schema-path normalization lets the canonical fresh-database bootstrap run for local integration verification.
- Prior approved workspace implementation, inquiry-to-portal wiring and main-screen refinements are included in the candidate.

## Verification

- Fresh isolated PostgreSQL database on localhost:55439, crm_test_d. No production database touched.
- Final API tests: 147 files, 2,464 tests passed, zero skipped, with database connected. Includes account/team access, SMS records, support ownership, scheduling and provider abstraction tests. Provider mocks are not real carrier calls.
- Legacy API scripts: 9/9 passed.
- Workspace typecheck and script contracts passed.
- Public frontend tests: 190 passed.
- Helpdesk and public Vite builds passed. Public prerender and final browser checks are recorded in qa-workspace/core-*.log.
- Settings browser integration at 1440px and 390px verifies load-failure protection, retry, save/reload and rejected-save draft retention using intercepted test-only transport.
- Main workspace browser review covers eight routes on desktop/mobile. These tests use fictional isolated data, not production accounts.
- CI gates and the voice-build matrix pass at `c628f27f` (run 36330942297). API/helpdesk typechecks and final builds pass. Direct recovery behavior checks verify one bounded automatic chunk reload, explicit user reload, and ordinary render-error retry.
- No schema or migration delta from the existing Replit d2ab383a source.

## Preview limitation identified

The existing localhost:8784 design preview has a partial fixture API. Settings endpoints without fixtures return 503. It is not the production backend and cannot prove those features are missing or working. Do not use it as the only acceptance environment. The Settings regression harness supplies explicit isolated responses and asserts request/results; API database tests separately verify persistence and authorization.

## What remains external acceptance

| Surface | Local evidence | Remaining production evidence |
| --- | --- | --- |
| Signup, login, recovery, team | Account and tenant HTTP/database tests | Real email delivery and owner-controlled acceptance |
| Business and assistant configuration | UI save/reload checks; backend tests | Save/reload on deployed owner account |
| Calendar and appointments | Scheduling/calendar integration tests | Customer OAuth and real calendar booking/cancellation |
| Numbers and transfers | Provider abstraction and role checks | Number provisioning/forwarding and owned-destination call |
| SMS and replay | Consent, messages, recording/access tests | Carrier delivery; approved recording policy and retained audio |
| Support and records | Database persistence/ownership tests | Deployed notification delivery |

Number setup is still request-based, not an automatic purchase flow. Scripted simulation is labeled and creates no real call/booking. No live calling, SMS, recording or billing readiness claim should be made solely from these checks. Pricing work is paused by the owner. Existing activation gates remain in place.

## Published application and live verification

The marketing application was published from `release/core-public-0927`, source
`39ea7afd8`, packaged commit `a7a63f472`. Its public `/release.json` confirms the
new entry points. The backend/dashboard application repair `c628f27f` was
published successfully (Replit build `162e94e4-b204-4628-b989-3e3b2fe07bac`).
Production serves `index-fGcVrInl.js`, containing the new route-recovery copy.
Health and readiness return 200; neither checks the missing table below.
Database-copy and Stripe-sync controls were off. PR #37 tracks the source.

Live owner-session checks verified:

- Business profile saves successfully and persists on reload.
- Assistant draft opens and the scripted simulation returns the saved greeting.
- All ten Settings destinations render, including Calendar, Team, Billing,
  Usage, Phone, transfer contacts, text settings, support and issues.
- The calendar reports connected; appointment history and the appointment form
  load. No real event was created or cancelled.
- Registration validates required fields. No new real account or legal terms
  acceptance was performed; email delivery remains unverified this turn.
- Usage no longer calls an unconfigured allowance “unlimited”; signup clearly
  distinguishes free simulated setup from subscription/activation for live calls.

These are specific observations, not a claim that every action on every screen
was executed. No invitation, support email, carrier SMS or call was sent.

## Production blocker found after publication

Contacts returns HTTP 500 because production is missing `voice_sms_inbound`.
Global search therefore reports partial results. Replit's production database
inventory and application logs corroborate this. The earlier statement that
there is no migration delta versus Replit source is true **but does not prove
that production applied the migrations already present in that source**.

See `PRODUCTION-CONTACTS-REPAIR-2026-09-27.md` for the exact existing migration
0015, authorization boundary, backup/preflight sequence and acceptance checks.
Production preflight refused because `PROD_DATABASE_URL` is unset; no database
mutation was attempted. This remains a launch blocker, not an empty state.

The same audit exposed an independently reproducible contact-summary correlation
bug. The two-business regression fails on the former query and passes with
explicit qualified columns. The repaired query cannot borrow another firm's
unread-text count or opt-out status. A stale lazy-loaded page also now offers an
explicit page reload instead of retrying the cached failed import.

## Readiness verdict

Published UI and core application improvements: yes. Fully operational client
receptionist: **not yet**. Contacts/text schema repair, owner-controlled email
acceptance and real-provider activation/testing remain. Current capabilities
still block live message-taking, calendar tools and transfer for the reviewed
account; a connected calendar alone does not enable the assistant's tools.
Pricing remains deferred, as requested. Do not advertise automatic number
purchase, included call credits, live SMS or replay as verified available.
