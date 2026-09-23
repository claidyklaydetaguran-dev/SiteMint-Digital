# SiteMint frontend handoff — updated 2026-09-24

## Launch-audit release candidate (2026-09-24) — read `LAUNCH-AUDIT-2026-09-24.md` first

The canonical branch is `design/mint-clarity-public-release`; every other branch (including `main`, 499 commits behind) is contained in it. The candidate on `claude/sitemint-launch-audit-7c01bb` builds, typechecks and tests clean on Linux (web-agency 18 files / 185 tests; api-server 1,723 non-database tests; helpdesk and api-server builds; `lib/db` push-packet contract 89 checks). It is **not published**: the owner must approve the branch push, the marketing transfer and, separately, the backend publish.

What changed, in one paragraph: the scroll-linked homepage hero, the demonstration autoplay and the receptionist background film now work on phones (gated only on reduced-motion/reduced-data, with 960 px renditions of the same approved films); the SiteMint Digital wordmark reloads the homepage at the top from anywhere; the receptionist hero reads "Get started" / "See how it works"; two dead anchors, three contrast defects, the unreadable 404 exits and the untitled signup page were fixed; scene and team images are responsive WebP; the never-used react-query provider is gone; the marketing server caches, negotiates brotli/gzip, revalidates with ETags and sends hardening headers; the API gained compression, security headers, HTML-escaped emails and limits on two public forms; a reviewed additive index packet (`0003`) is ready for rehearsal.

**Launch blocker that no code change fixes:** production `POST /api/discovery/submit` returns 503 because `PUBLIC_FORM_SUBMISSIONS_ENABLED` is off in the deployed backend. The public "Start a project" journey cannot create a lead until the owner enables it. Full decision table, issue register, acceptance matrix, deployment and rollback steps are in `LAUNCH-AUDIT-2026-09-24.md`.

Local QA pattern used (and reusable): Linux tree `/opt/sitemint-launch` in the `Ubuntu` WSL distro with `npx -y pnpm@10.26.1`; prerender on Windows against the Linux dist; the real `mkt/marketing-server.mjs` served on loopback for browser and Lighthouse checks; PageSpeed's anonymous API quota is exhausted, use `npx lighthouse@12` locally.

## Published state as of 2026-09-23 — superseded by the section above for source and candidate status

The owner-authorized frontend release is published on https://sitemintdigital.com. Public release.json reports source commit `b58a537`; packaged assets are in `65155b6`, with the cross-platform checksum correction in `405a839`, on `design/mint-clarity-public-release` in GitHub.

Public changes include the three approved videos, scroll-linked leaf hero, visible-section autoplay demo, compact navigation, icon playback controls, all three real team profiles, Simply Save Solar and OneFilAm highlights, four decorative hero backgrounds, restrained heading/hover motion, background line graphics, and reduced-motion fallbacks. Both local frontend builds and typechecks passed; public prerender produced 22 documents plus the SPA fallback. Live audit: 14 public pages returned HTTP 200 with one H1, three private entry routes returned HTTP 200, and API health returned JSON. Films loaded and all three team names were verified live. Narrow-screen CTA stacking was corrected; final mobile interaction coverage is not comprehensive.

Web Asset Builder was published separately, confirmed by Replit's "Published your app" state. Build: `4cc08726-78dc-4213-bfaf-fa81e1dbd652`; deployment: `eb7f0e0b-e301-492f-a337-82ef4c7d01a1`. The authenticated receptionist Settings page was reloaded and visually verified in the light Mint workspace after publication. CRM, portal and Discovery presentation files were included; every authenticated workflow was not re-tested.

The application workspace remains on `feature/ai-receptionist-visible-progress`, with rollback branch `backup/before-mint-b58a537` from baseline `bd48891a`. Only presentation files were imported: helpdesk Overview and mint-workspace.css, web-agency mint-operations.css, PortalShell.tsx/mint-portal.css, and mint-discovery.css. Two existing helpdesk compile issues were repaired in that Replit branch: nullable caller display now falls back to "Unknown caller"; VoiceModelTab uses existing findVoicePreset and handles missing presets before cost/latency components. Reconcile these changes into the next canonical branch before editing; those newer files are absent from the older local design checkout. No backend, database schema, auth or provider configuration was changed by this release. Database copying and Stripe sandbox synchronization were off when publishing.

Known validation exception: Replit web-agency typecheck still reports pre-existing Discovery shared-contract mismatches (PROJECT_STAGES/projectStage/growth fields). Both application Vite builds passed, and the helpdesk typecheck passed after the two repairs. Do not report the entire Replit workspace as type-clean.

Next work is functional acceptance, not another redesign: verify real Discovery submission and CRM persistence, login/recovery/invitations and tenant isolation, production phone organization/routing (609 intended production, 860 staging), actual delivery and billing, and Google access beyond approved testers. A successful page load is not evidence these workflows pass. Preserve existing user drafts at local port 8772; its preview has no backend proxy. Marketing rollback copy is `mkt.rollback-before-b58a537` in SiteMint-Digital Replit; local pre-release package is `work/mkt-before-b58a537` beside this checkout.

## Read this first

Continue the existing product. Do not start a new frontend, new CRM, new design system or replacement auth flow. The owner approved Mint Clarity: forest green, soft mint, warm white, DM Sans, readable business language, illustrative product previews and restrained motion.

This is a frontend implementation handoff, not evidence that the whole product is production-ready. Public pages were browser-reviewed; authenticated CRM/receptionist/customer workflows still need backend integration verification with authorized test accounts. Keep these statuses separate in every release report.

Working checkout: `work/sitemint-mint-release` beneath the current Codex workspace. Local branch: `design/mint-clarity-public-release`. The `github` remote is GitHub; `origin` points at `C:/SiteMint-Digital` and must not be used as the GitHub publishing destination. Preserve the owner's other worktrees and uncommitted work. Reconcile newer Claude changes before applying this branch; never reset another checkout to this snapshot.

## Product boundaries to preserve

- SiteMint Digital is a digital studio with websites, business systems and an AI receptionist product.
- First receptionist customers: US small and medium service businesses. Setup is assisted. Philippines expansion is later.
- Receptionist pricing: request pricing for an assisted pilot. Subscription and usage are charged to the business, not to callers.
- CRM: SiteMint staff only. Client portal: invited customers and their own projects/documents/quotes/invoices/support. Receptionist workspace: each business and its authorized team.
- Google OAuth app ownership belongs to SiteMint; each customer connects their own Google account/calendar. SiteMint's company email must not become every customer's calendar. Reconfirm tenant-scoped storage and callback binding before activation.
- No invented client testimonials, savings, delivery claims, or production-readiness badges. Marketing examples remain examples.

## Final public structure

| Route | Purpose / next action | Implementation |
| --- | --- | --- |
| `/` | Studio overview → services or discovery | `MintHome.tsx` |
| `/services` | Service overview → relevant detail | `ServicesV3.tsx` |
| `/websites-apps` | Website/application offering → discovery | `WebsitesAppsV3.tsx` |
| `/discovery-systems` | Intake and discovery offering → discovery | `DiscoverySystemsV3.tsx` |
| `/ai-systems` | Workflow/CRM service offering → discovery | `AiSystemsV5.tsx` |
| `/ai-receptionist` | Product explanation → pilot pricing, signup or example tour | `MintReceptionist.tsx` |
| `/ai-receptionist/demo` | Guided illustrative product tour | `AiReceptionistDemoV5.tsx` |
| `/ai-receptionist/signup` | Existing registration contract → workspace | `LandingReceptionistSignup.tsx` |
| `/work` | Inspect clearly labelled project/demo evidence | `WorkV3.tsx` |
| `/pricing` | Existing website starting estimates + separate receptionist pilot | `PricingV5.tsx` |
| `/start` | Project expectations, contact and optional scope summary | `StartV3.tsx`, `InquiryContext.tsx` |
| `/start?service=ai-receptionist` | Assisted pilot inquiry, subscription/usage context, email action | Same Start page, product-aware variant |
| `/discovery` | Existing structured inquiry and browser draft | `DiscoveryPage.tsx`; preserve request contract |
| `/thank-you` | Existing submission receipt | `ThankYou.tsx` |
| `/about`, `/process`, `/insights` | Company, delivery approach and educational content | Existing V3 pages in Mint chrome |
| `/privacy`, `/terms` | Existing legal content | Existing legal pages, no policy rewrite |
| Unknown public route | Useful 404 with real exits | `NotFoundV5.tsx` |

Preserve aliases `/portfolio`, `/contact`, `/automation`, the retired vertical redirects and `/app/*` compatibility. Central route definitions and App.tsx remain authoritative.

## Changes in this polish pass

- Main navigation marks the current page. Mobile menu closes on navigation; Escape restores focus to its toggle. Sign-in disclosure closes outside, on blur and on Escape. Staff sign-in stays in the footer rather than being offered as customer signup.
- Footer exposes pricing, insights and contact; sign-in includes a help route. Receptionist and client sign-ins remain separate.
- Request-pricing links retain receptionist intent. The pilot variant avoids requiring the general website questionnaire first.
- Pricing configuration carries a summary in sessionStorage, using only `?scope=draft` in the URL. Freeform notes are capped at 2,000 characters. Storage failure is explicit. No backend payload changes.
- Start shows the summary and explicit email/copy actions. Email launches the visitor's mail app; it does not send automatically. Copying into discovery is still manual and is described as such. Do not claim a CRM lead exists from viewing this panel.
- Signup and client sign-in receive scoped Mint colors; portal entry has working contact and home exits. Portal source changes are not live merely because public marketing is published.
- Shared public controls, focus outlines, headings, small-screen actions and reduced-motion behavior are consistent. The 404 no longer mislabels receptionist login as client-portal login.

## Component ownership

Public shell: `artifacts/web-agency/src/components/mint/MintChrome.tsx`, `mint.css`, `mint-legacy.css`; signup/portal brand layer: `mint-auth.css`. Keep overrides scoped. Avoid global CSS that can unintentionally recolor CRM status, chart or destructive states.

Receptionist application: `artifacts/helpdesk`; its `AppShell`, `DashboardShell`, `lib/routes.ts` and `lib/nav.ts` already implement the workspace layout and navigation. Do not create a second dashboard. Existing information architecture covers Overview, Setup, Assistant, Scheduling, Activity, Channels and Account. Voice-gated routes must remain gated. Existing tenant session and loading/error states must remain intact.

Staff CRM: `artifacts/web-agency/src/pages/crm`, `CrmLayout.tsx`, admin guards and `adminFetch`. Reuse existing lead/company/pipeline/task/inbox/calendar/project/document/support/billing/operations pages. Do not add a second CRM or expose staff records through a public route.

Customer portal: `artifacts/web-agency/src/pages/portal`. Reuse existing sign-in, invitation acceptance, overview, projects, documents, proposals, invoices and support pages. Keep portal CSRF/session handling separate from staff and receptionist auth.

The authenticated workspace interiors were source-reviewed in this pass, not comprehensively visually signed off against real customer data. Their acceptance gate is below; no claim of full operational readiness is made.

## Deployment boundaries and known gaps

The SiteMint-Digital Replit app serves marketing and proxies private routes/API to Web Asset Builder. Publishing marketing does not update the upstream receptionist, staff CRM or customer portal application.

Previously verified live public release: source `3094afe`, package `2c1a37a6`, record `5920fce`, branch `release/mint-clarity-3094afe`. Read `mint-clarity-release.md` for the actual release status; this handoff is not the deployment log.

Known live gaps from the previous deployment: `/api/readyz` returned 404; `/portal/sign-in` returned HTTP 200 but upstream rendered a React 404. A 200 response is not sufficient evidence. Fix by reconciling and deploying the correct upstream app after its own release gates, not by bypassing the marketing proxy or replacing auth with mock data.

Calls, calendar booking, caller acknowledgment, notification retries, SMS, transfers and subscription billing need individual evidence. Preserve requested-versus-booked and queued-versus-provider-accepted-versus-delivered distinctions. Do not ask the owner for another call until schema, logs and provider configuration are checked.

## Claude implementation sequence

1. Establish exact local, GitHub, staging and production commit/build identities. Compare with any newer Claude work. Record a single chosen release source; never assume one environment proves another.
2. Reconcile upstream public/private route mounting and deployable artifacts. Keep marketing and backend release units separate. Verify sign-in pages, protected-route redirects and API readiness on the real domain.
3. Verify three isolated audiences: receptionist business, invited project client, SiteMint staff. Exercise tenant/role refusals as well as successful sessions. Retain server-backed loading, empty, error, denied and expired-session states.
4. Make one assisted receptionist journey reliable: registration → verified email → business/assistant setup → customer's calendar → number/provider sync → test call → appointment or message → business follow-up. Distinguish calendar-disconnected requests from confirmed bookings.
5. Verify durable notifications and caller consent, then transfers, SMS and subscription/usage billing. Do not activate paid resources, purchase numbers or create billing relationships merely to complete a visual checklist.
6. Verify discovery → staff CRM persistence and authorized client-portal reads/mutations. Reuse existing APIs and components.
7. Only then update capability copy to reflect demonstrated behavior. Report evidence and remaining blockers without broadening product scope.

## Acceptance checklist for the next implementation

- Test desktop, tablet and narrow mobile with realistic long business names, timestamps, table rows and empty data.
- For each authenticated page: loading, populated, genuinely empty, network failure, forbidden, expired session. Failed requests must not look like empty records or success.
- Modal focus returns; mobile drawers close accessibly; visible labels/errors remain connected; keyboard-only paths work. Retain reduced motion.
- Deep-link reloads land in the correct app. Public content never imports the entire private dashboard eagerly. Session/token-bearing URLs are not added to analytics, screenshots or logs.
- Back/forward, sign-out, expired invitations and reset links remain usable. No customer can see staff CRM or another customer's records.
- Do not use synthetic data as production evidence. Use an authorized test tenant and record both UI result and persisted server outcome for mutations.
- Verify rebuilt assets and release markers through the public domain, not just a preview. Maintain rollback artifacts. Never change applied migration SQL comments or hashes; follow the corrected migration journal ordering and backup/rehearsal gates.

## Validation of this frontend pass

Public routes were checked at 390px for horizontal overflow and failed loaded images. Main public routes and signup/client sign-in were checked at 1440px for overflow, one h1 and broken local anchors. Mobile menu Escape returned focus to the toggle. Pricing summary was carried to Start without placing notes in the URL. No email or form submission was sent by these checks.

The existing web-agency Vitest suite passed 17 files / 161 tests; TypeScript passed. Historical standalone Contract scripts are excluded by this Vitest configuration and are not claimed passing. Final build/prerender results are recorded in the release log.

## September 23 homepage refinement — local candidate

Owner confirmed the homepage should reuse all three existing About profiles and highlight only Simply Save Solar and OneFilAm Community. Implemented using teamV5 and portfolioProjects; real photos and project images were browser-verified loaded.

Added generated decorative hero backgrounds for Services, Work, Pricing and About. Demo video plays muted when visible and pauses offscreen; reduced-motion visitors retain manual playback. Receptionist background control is an accessible play/pause icon. Header shrinks from 94px to 70px on scroll (browser verified).

Validation: current web-agency build and typecheck passed; Vitest 17 files / 161 tests passed. Public prerender is tracked separately. This candidate has not been published in this pass.

Local preview at port 8772 has no API proxy: /api/healthz returns HTML, while production health returns JSON. Local account links now navigate to the live HTTPS app; this is not proof of successful account authentication. Discovery now explains the disconnected preview beside Submit and preserves the browser draft. A real discovery submission and persistence check remains outstanding. Do not claim the preview form or all backend workflows are verified.
