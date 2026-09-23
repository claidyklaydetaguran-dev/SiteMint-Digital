# Mint Clarity release and booking acceptance — 2026-09-23

## Live release
- Public source ba22195, packaged/prerendered in 951a456, published from SiteMint-Digital. Live /release.json confirms ba22195. All 319 package checksums passed before publishing. Marketing rollback: mkt.rollback-before-ba22195.
- Web Asset Builder received seven reviewed workspace presentation files as 28cbe543, then CRM header icon contrast as fef1bc22 (canonical source 54b526d). Final build 0eb765b0-d15b-4b0a-a2a0-6982e16d52c7 published successfully. Live authenticated CRM icon color confirmed rgb(184,229,199). Backend rollback branch: backup/before-mint-ba22195.
- No schema or backend logic changed in this visual release. Development database copying and Stripe synchronization remained off.
- Public changes: interactive receptionist illustration replaces the irrelevant technician scene; homepage work/studio context; Claidy Taguran identified as Technical Director; discovery, navigation, receptionist and CRM Mint styling. SMS copy says activation required, not delivery verified.

## Validation
- Web-agency/helpdesk TypeScript and Vite builds passed. Public tests: 17 files / 161 tests before the final readiness copy edit; standalone login contract check passed after that edit. Final public build and 22-document prerender passed.
- Mobile homepage and discovery checked at 390px without horizontal overflow; mobile menu worked. This is not certification of every page at every viewport.
- Live public route audit: 16 pages return 200 with one H1, description and correct canonical. Robots and sitemap return 200; three private entry routes return 200 with noindex/nofollow. See live-route-audit-2026-09-23.json. API readiness returns 200. Authenticated CRM and receptionist sessions work.

## Production calendar acceptance
- Owner explicitly approved one test appointment with no guests/invitations, followed by cancellation.
- Hidden internal SiteMint acceptance test type (15 minutes) and temporary Thursday 09:00-09:15 opening were used. Request e0019ed1-1322-4a5b-b9fa-ef435a73fc93 progressed Pending review -> Booked -> Cancelled through the live UI. Booked banner confirmed the calendar event was written.
- Read-only production database check confirmed cancelled status, cleared provider event/calendar references, and no customer email or phone. Calendar now reports Connected and working. No calls, SMS, payments or invitations were made.
- Test type is disabled and hidden. Temporary hours were removed.
- Owner subsequently confirmed America/Los_Angeles, Monday-Friday 09:00-17:00, and 30-minute Discovery consultation. These settings were saved and verified after reload. Saturday/Sunday remain closed. Discovery consultation is accepting bookings and eligible for the public scheduling page; the separate public-link switch was not changed.

## Remaining assisted-pilot launch requirements
- Google OAuth remains External/Testing for the three approved accounts; general customer calendar access is not certified.
- Production phone routing/provider synchronization and callbacks still need acceptance; no real-call test performed in this release.
- SMS delivery, CRM application-path email delivery, and subscription/usage billing are not certified. Do not infer these work from the visual release or calendar test.
- Customer portal entry loads, but full invited-client workflow acceptance is separate.
- Public scheduling page currently says it cannot read the link enabled state. That control needs investigation before claiming a public booking link is ready.
