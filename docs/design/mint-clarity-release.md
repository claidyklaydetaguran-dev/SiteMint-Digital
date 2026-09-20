# Mint Clarity public design release

Status: implemented locally; production publishing is pending. No live deployment has been changed.

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

The available Replit browser is signed out. The marketing app must be opened by the owner in an authenticated browser and identified as the app currently serving sitemintdigital.com before release.

The frontend build is not yet the complete production marketing artifact. Run the existing `artifacts/web-agency/scripts/prerender.mjs` release step against a fresh `dist/public`, then verify rendered public documents, legitimate SPA fallback routes, 404 behavior, and the marketing proxy. Preserve the existing backend upstream and production config. Do not redeploy Web Asset Builder or run migrations for this visual update.

After publishing, verify actual homepage asset hashes, homepage/receptionist visuals, service deep links, signup, receptionist login, staff CRM entry, client portal, and API proxy responses through the public domain. A frontend release does not establish that calendar, SMS, billing, or notification delivery works end to end.

## Next visual pass

Use existing product screenshots and a few deliberately chosen service illustrations. Keep each image next to one concrete outcome and one useful action. Do not imply fictional businesses, sample data, or generated people are client testimonials. Preserve short explanatory text so owners know what they are buying and where to go next.
