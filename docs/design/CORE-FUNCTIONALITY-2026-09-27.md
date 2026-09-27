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
- API tests: 147 files, 2,463 tests passed, zero skipped, with database connected. Includes account/team access, SMS records, support ownership, scheduling and provider abstraction tests. Provider mocks are not real carrier calls.
- Legacy API scripts: 9/9 passed.
- Workspace typecheck and script contracts passed.
- Public frontend tests: 190 passed.
- Helpdesk and public Vite builds passed. Public prerender and final browser checks are recorded in qa-workspace/core-*.log.
- Settings browser integration at 1440px and 390px verifies load-failure protection, retry, save/reload and rejected-save draft retention using intercepted test-only transport.
- Main workspace browser review covers eight routes on desktop/mobile. These tests use fictional isolated data, not production accounts.
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

Release source and deployment results will be appended after publication; a local commit alone is not a deployment.
