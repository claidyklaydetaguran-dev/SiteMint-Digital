# Mint Clarity public design release

Status: PUBLISHED to https://sitemintdigital.com on 2026-09-20. Public release marker confirms sourceCommit 3094afe; homepage asset is index-B309onjv.js. Replit confirms publication.

## Scope

Approved Mint Clarity homepage and AI receptionist reference pages are now React components. Their project, signup, sign-in, contact, and guided-demo links use existing application routes. Sample conversations and dashboard data remain visibly illustrative. Receptionist pricing remains request-based.

The existing public service, pricing, work, process, about, insight, and legal pages retain their content and behavior with shared Mint navigation, footer, palette, and type. They have not all been individually redesigned to the same degree as the two approved reference pages. Authentication, CRM, dashboard, APIs, worker behavior, and database schema are not modified by this release.

Source baseline: 8a7aa11838895c1afb91556a0594ffce53c245da. Implementation checkout is isolated from the owner's original repository and Claude worktrees.

## Structure

- `MintHome.tsx`: eager homepage, optimized illustrative WebP hero, service routes.
- `MintReceptionist.tsx`: lazy product page, keyboard-accessible example tabs, assisted setup, request pricing, existing signup and voice-demo destinations.
- `MintChrome.tsx`: shared responsive navigation, explicit receptionist/client sign-in chooser, footer and scroll behavior.
- `mint.css`: approved prototype styling scoped under `.mint-site`.
- `mint-legacy.css`: token and component adaptation for retained public subpages.
- `PublicShell.tsx`: existing v4 route compatibility now selects Mint chrome; v2/v3/auth/dashboard shells are retained.

## Checks performed

- Production Vite frontend build passed.
- TypeScript frontend check passed after building the existing discovery-contract declaration dependency.
- Frontend Vitest suite: 17 files, 161 tests passed. This suite excludes historical standalone visual contract scripts; those were not represented as passing.
- Browser: homepage and receptionist desktop/mobile layouts; keyboard example-tab navigation; mobile menu; eleven service/company/legal routes at 390px without horizontal overflow.
- Source route inventory checks passed. Authenticated backend journeys and calls have not been exercised by this visual release.

## Publishing handoff

The owner signed into Replit. The SiteMint-Digital app is confirmed to own sitemintdigital.com and www.sitemintdigital.com. The marketing package was transferred through release/mint-clarity-3094afe on GitHub. All 313 file checksums passed on Replit. The old mkt directory is retained as mkt.rollback-mint-3094afe.

The existing prerender build completed for 22 HTML documents and the SPA-fallback manifest. Local marketing-server checks returned 200 for home, receptionist, services, and signup; unknown paths returned 404. Preserve the existing backend upstream and production config. Do not redeploy Web Asset Builder or run migrations for this visual update.

After publishing, verify actual homepage asset hashes, homepage/receptionist visuals, service deep links, signup, receptionist login, staff CRM entry, client portal, and API proxy responses through the public domain. A frontend release does not establish that calendar, SMS, billing, or notification delivery works end to end.

## Next visual pass

Use existing product screenshots and a few deliberately chosen service illustrations. Keep each image next to one concrete outcome and one useful action. Do not imply fictional businesses, sample data, or generated people are client testimonials. Preserve short explanatory text so owners know what they are buying and where to go next.

## Live verification result

Homepage, receptionist, services, pricing, about, work, discovery, and signup documents return HTTP 200 with index-B309onjv.js. Browser-verified homepage imagery and receptionist example tabs work. Receptionist sign-in and admin entry still load the pre-existing backend builds. Unknown public paths return 404. /api/healthz returns 200.

Two pre-existing backend limitations remain: /api/readyz returns 404; /portal/sign-in now passes the marketing proxy and returns HTTP 200, but its upstream React application renders "404 Page Not Found". This is not a working client portal. No authenticated action, real call, message delivery, calendar, or billing operation was claimed verified.

Release artifact branch: https://github.com/claidyklaydetaguran-dev/SiteMint-Digital/tree/release/mint-clarity-3094afe . Deployed package commit: 2c1a37a6. Rollback files remain in the Replit workspace at mkt.rollback-mint-3094afe.
