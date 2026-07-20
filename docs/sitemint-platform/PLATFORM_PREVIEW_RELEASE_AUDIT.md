# Platform Preview Release-Readiness Audit — Phase 2C.1

> Documentation and audit checkpoint only. No application code, styles, copy,
> routes, images, feature flags, or dependencies were changed to produce this
> report. Last updated: 2026-07-20.

## 1. Executive Summary

This checkpoint audits the SiteMint Platform preview (`/platform-preview`,
feature-flagged behind `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED`) as it stands after
Checkpoint 2B.3, in which the "Selected Work" section became a real, data-driven
component (`portfolioProjects.ts`) rather than placeholder content.

**Headline finding: the preview is technically sound and ready for continued Level 1
(local) and Level 2 (private-deployed) review.** No release-blocking defect was found
inside the platform-preview component tree itself — copy claims are accurate and
honestly labeled, the feature flag fails closed, routing is fully gated, no secrets or
PII are exposed, and the portfolio content matches its owner-approved manifest exactly.

**The preview is not ready to replace the current public homepage (Level 3) or receive
paid traffic (Level 4).** The blockers for those levels are largely pre-existing,
site-wide issues that predate this preview and are not introduced by it: the shared
Discovery form lacks rate limiting and bot protection, there is no analytics/conversion
tracking anywhere on the site, no per-route SEO system exists for a public launch, and
a full accessibility verification pass (axe-core scan, exhaustive keyboard walk,
screen-reader pass) has not yet been performed. None of these require code changes
under this checkpoint — they define the scope of a future Phase 2C.2 correction
checkpoint.

**Explicit decision this checkpoint: do not activate the preview publicly, do not
replace the current homepage, do not enable paid traffic.** This is unchanged from
every prior SiteMint Platform checkpoint.

## 2. Baseline

- Branch: `claude/sitemint-phase-2c1-audit-xz1cdo`
- HEAD at audit start: `8d5040b08952f0a26eda97073cebdb64f78543f3`
- Parent: `9b94a54697a0ef02a0c912791dbfaefa41da98b5`
- Working tree: clean at audit start and throughout (verified repeatedly via
  `git status --short`)
- `git log --oneline --decorate -8` confirmed HEAD is "SiteMint Platform / Phase 2B.3:
  build data-driven Selected Work experience," directly following the Phase 2B.2.4
  portfolio-approval-recording commit — consistent with the expected checkpoint
  sequence.
- Feature flag confirmed controlled by `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED`
  (`artifacts/web-agency/src/lib/platformPreviewFlag.ts`), defaulting to `false` and
  failing closed for any value other than the exact string `"true"`.
- Current public homepage (`/`, `Home.tsx` + real `Navbar.tsx`/`Footer.tsx`) confirmed
  unchanged and unaffected by the preview route, which is registered separately in
  `App.tsx` outside the public `<Layout>` switch.
- No deployment or production process was active in this environment at any point
  during the audit; only local `pnpm run dev` / `pnpm run build` were run.

## 3. Audit Methodology

Three methods were combined:

1. **Static/code audit** — direct reading of every file under
   `artifacts/web-agency/src/components/platform-preview/`,
   `artifacts/web-agency/src/pages/PlatformPreview.tsx`, `App.tsx`, the real
   `Navbar.tsx`/`Footer.tsx`, `Discovery.tsx`, and the corresponding backend route,
   cross-referenced against `docs/sitemint-platform/PORTFOLIO_PERMISSION_MANIFEST.md`
   and `PORTFOLIO_ASSET_MANIFEST.md`.
2. **Dependency/build audit** — real command execution: `pnpm install
   --frozen-lockfile`, the design-tokens accessibility test suite, workspace-wide and
   web-agency-scoped typechecks, and a real production build, all captured verbatim
   (see §17).
3. **Live/dynamic audit** — the web-agency dev server was started locally with
   `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED=true`, and pre-installed headless Chromium
   (via Playwright) was driven to capture screenshots across 8 responsive breakpoints,
   light/dark themes, and a sampled keyboard-only Tab walk. A second server instance
   was started with the flag unset to independently re-confirm fail-closed behavior
   and inspect the network-request list for absence of preview assets.

A known environment constraint affected this checkpoint's tooling: the environment's
outbound proxy intercepts traffic even to `localhost` unless explicitly bypassed,
which initially caused headless-browser navigations to hang; this was diagnosed and
worked around by disabling the proxy environment variables for the browser-automation
process only (a debugging step, not a change to any committed configuration). See
§22 for what this means for external-link verification.

## 4. Level 1 Readiness — Local Private Review

**READY.** The preview builds and runs correctly locally behind the flag with no
defects found that would block an internal owner review session. All sections
render, the flag fails closed, and no code changes are required to review it today.

## 5. Level 2 Readiness — Private Deployed Preview

**CONDITIONALLY READY.** The preview's own surface (routing, flag gating, SEO
exclusion, security posture, portfolio content, theming, responsiveness) is sound
enough to deploy privately for controlled review. The caveats are about surfaces the
preview links to but does not own: the Discovery form it funnels "Start a Project"
CTAs to has no rate limiting or bot protection, and a full accessibility verification
pass has not yet been run. Recommend proceeding to a private deployment with these
two caveats disclosed to reviewers, rather than blocking Level 2 outright.

## 6. Level 3 Readiness — Public Homepage Switch

**NOT READY.** Missing, in order of impact: (a) a per-route SEO system for public
launch (canonical/OG/meta beyond the current single static `index.html` head), (b) a
hardened Discovery form (rate limiting, bot protection, server-side validation,
privacy disclosure, duplicate-submission guard), (c) a completed accessibility
verification pass, (d) an explicit flag-removal / route-switch / rollback / monitoring
plan (none exists yet, carried forward as still-true from
`ACTIVATION_READINESS_AUDIT.md`), and (e) a decision on the ~2 MB ordinary-entry
bundle, which is pre-existing and site-wide, not preview-specific, but becomes more
consequential once the preview's traffic profile is the general public rather than
internal reviewers.

## 7. Level 4 Readiness — Paid-Traffic Readiness

**NOT READY / BLOCKED.** Requires everything in Level 3 plus: zero analytics or
conversion tracking currently exists anywhere in `web-agency` (live site or preview),
and no portfolio project has an owner-granted metric/proof-point permission per
`PORTFOLIO_PERMISSION_MANIFEST.md` — both are prerequisites for responsible
paid-traffic spend and neither can be assessed as "ready" from repository evidence
alone.

## 8. Release-Readiness Matrix

See `release-readiness-matrix.txt` in the owner-review package for the full
category-by-category table (feature flag, copy/claims, portfolio, SEO,
security/privacy, forms/spam, accessibility, responsive, theme, performance,
route/link integrity, analytics, release engineering) against all four levels.
Summary verdict repeated here: L1 READY, L2 CONDITIONALLY READY, L3 NOT READY, L4
NOT READY/BLOCKED.

## 9. Verified Strengths

- Feature flag is fail-closed by construction (`parseBooleanFlag` requires the exact
  string `"true"`), single import site, matching the precedent set by
  `artifacts/helpdesk/src/lib/featureFlags.ts`.
- Route gating renders the app's ordinary `NotFound` inline when the flag is false —
  no redirect, no partial render, no preview asset requests (confirmed live: the only
  preview-named network request with the flag off is the tiny flag-evaluation module
  itself, not any page code, styles, or images).
- `noindex, nofollow` correctly injected on mount and restored on unmount
  (`usePreviewDocumentMeta()` in `PlatformPreview.tsx`); `/platform-preview` is absent
  from both `robots.txt` and `sitemap.xml`.
- Capability labeling is honest and consistent everywhere it appears: SMS marked
  "available," voice marked "in development," CRM/follow-up marked "planned," AI
  Toolkit marked "in development" — with zero contradicting instances found across
  every component file read.
- Demo data (`AiReceptionistDemo.tsx`) is clearly and prominently disclosed as
  synthetic, in the rendered UI itself, not merely in a code comment.
- Portfolio content exactly matches the owner-approved manifest: correct
  featured/supporting placement, correct desktop-only/mobile-only/responsive-pair
  visual modes, Shasta correctly and deliberately absent, no empty device frame is
  even structurally possible (`DesktopFrame`/`MobileFrame` return `null` when their
  asset is absent).
- No secrets, credentials, internal admin paths, raw error messages, or private data
  found anywhere in the preview component tree.
- Design-token accessibility test suite (`lib/design-tokens/test/tokens.test.mjs`)
  passed in full this checkpoint — 36+ live-parsed WCAG contrast assertions across
  light and dark themes.
- Real production build reproduces the Phase 2A.4 bundle-size estimates almost
  exactly, confirming those earlier figures were not stale guesses.

## 10. Blocking Issues (by target level)

None block Level 1. Blocking Level 3/4 only (not Level 1/2):
- No per-route SEO system for a public, non-flag-gated launch.
- Discovery form: no rate limiting, no bot/spam protection, no server-side schema
  validation beyond three truthy-field checks, no privacy disclosure, weak
  duplicate-submission guard, and a dead/unreachable `SuccessScreen` code path
  (form submission actually full-page-navigates to `/thank-you`, `setDone(true)` is
  never called).
- No release-engineering plan (flag removal, route switch, rollback, monitoring,
  smoke tests) — carried forward as still-unwritten from the prior activation audit.
- Zero analytics/conversion tracking anywhere on the site.
- No owner-granted metric/proof-point permission for any portfolio project (blocks
  any paid-ad copy that would want to cite a real outcome).

## 11. Non-Blocking Improvements

- `ServicesSection.tsx`'s "CRM Systems" service tile sits close enough to the
  AI-Receptionist CRM/follow-up topic that a stricter copy pass may want the
  distinction (implementation service vs. automated intake hand-off) made explicit.
- Three divergent, un-consolidated portfolio-data copies exist (`Home.tsx`,
  `Portfolio.tsx`, `portfolioProjects.ts`) with different URLs/asset sets — a
  pre-existing, non-preview-specific duplication.
- The real, currently-live `Footer.tsx`'s "Privacy Policy"/"Terms of Service" are
  styled as clickable but have no `href`/`onClick` at all — a genuine dead control,
  but on the live site today, not introduced by or part of the preview.
- `react-icons` and `ogl` are both confirmed (via real grep, not just carried-forward
  hypothesis) to have zero import sites anywhere in `web-agency/src` — both are
  real dead-dependency removal candidates for a future cleanup checkpoint.
- Google Fonts are still loaded via a render-blocking CSS `@import` rather than a
  `<link rel="preconnect">` pattern — pre-existing, site-wide, not preview-specific.
- CRM/admin routes are not lazy-split in `App.tsx` (unlike `/platform-preview`, which
  is the only lazy-loaded route) — a plausible, now partially evidence-supported
  contributor to the ~2 MB ordinary-entry bundle.
- The AI Toolkit's disabled CTA renders as a `<span aria-disabled="true">` rather
  than a native `<button disabled>` — functionally correct (excluded from tab order,
  not clickable) but a native disabled button would be more idiomatic.

## 12. Copy and Claim Findings

Full verbatim findings are in `claim-audit.txt` (owner-review package). Summary: no
category defined in the audit brief (SMS availability, voice-in-development framing,
CRM/follow-up not-yet-complete framing, AI Toolkit in-development framing, fabricated
metrics, unsupported testimonials/customer counts/outcomes, client phone numbers in
preview content, Claidy's excluded statistics, rejected Shasta metrics, internal
audit/permission language leaking into rendered copy) produced a confirmed violation.
One non-blocking clarity item is noted (§11, CRM service vs. hand-off distinction).

## 13. Portfolio Findings

- Hand Homecare: featured, responsive-pair (desktop 1221×850 + mobile 388×838),
  matches manifest.
- OneFilAm Community: supporting, responsive-pair (desktop 1221×844 + mobile
  388×840), matches manifest.
- Herlinda Valdovinos: supporting, desktop-only (1218×804); `mobileAsset` field is
  entirely absent from the data — correctly matches the manifest's finding that
  mobile capture is not approved (nav does not collapse on mobile).
- Claidy Taguran: supporting, mobile-only (388×528); `desktopAsset` field is entirely
  absent — correctly matches the manifest's finding that the desktop capture is
  missing the animated word "Solutions" and remains unapproved.
- Shasta Greene: confirmed absent from `portfolioProjects.ts` entirely, with an
  in-file comment explaining why (approved future project, no cleared screenshot) —
  matches the manifest's rejected-asset finding; not rendered as an empty card.
- Every referenced image has explicit `width`/`height`, a descriptive (non-generic)
  `alt` string, and `loading="lazy" decoding="async"`. No eager-preload directive
  found for any portfolio image. No image with a `visualMode` that would require an
  asset it doesn't have — structurally impossible per `PortfolioVisual.tsx`'s
  `if (!asset) return null;` guards in both `DesktopFrame` and `MobileFrame`.
- "View all work" confirmed to point to `/portfolio`, a real registered route.
- External project links (`publicUrl`) all use `target="_blank" rel="noopener
  noreferrer"`. Live reachability of the four external project domains was not
  independently re-verified this checkpoint (see §22).

## 14. Responsive Findings

Full-page screenshots were captured at all 8 required breakpoints (320×568 through
1920×1080; see `responsive-issues-board.jpg` and the individual PNGs in the
owner-review package). No horizontal overflow, clipped heading, hidden CTA, or empty
device frame was observed at any sampled breakpoint. The featured-project visual
(`FeaturedVisual`) explicitly stacks the mobile frame below the desktop frame on
narrow viewports rather than overlapping it, and supporting responsive-pair projects
stack rather than overlap at narrow widths per the component's own documented design
intent — confirmed visually consistent with that intent in the captured screenshots.
Sticky-navigation collision and late-image-loading section jump were not
independently instrumented (e.g. no CLS measurement tool was run) — treat as
verification-pending rather than confirmed-clean for those two specific items.

## 15. Accessibility Findings

Full findings are in `accessibility-audit.txt`. Summary: one primary `<h1>` confirmed,
correct heading hierarchy in all files read, correct accessible radiogroup patterns
for the goal selector and connected-mode toggle, correct button-vs-link discipline
throughout (with one non-blocking exception, §11), visible focus ring confirmed
present at every sampled keyboard-Tab stop, skip-link confirmed present and
functional, alt text confirmed descriptive on every portfolio image, no color-only
meaning (capability badges pair color with text). A list of specific
verification-pending items (full axe-core scan, exhaustive Tab walk of all ~50+
interactive elements, precise touch-target measurement, live reduced-motion
re-verification, mobile-menu focus-trap behavior, nav-dropdown disclosure focus
return, screen-reader software pass) is enumerated at the end of that file — none
are confirmed defects, all are recommended scope for a dedicated Phase 2C.2
accessibility checkpoint before Level 3.

## 16. Theme Findings

The shared design-tokens package's accessibility test suite
(`lib/design-tokens/test/tokens.test.mjs`) passed in full this checkpoint — every
`--sm-*` component/semantic token pairing (focus ring, status badges, danger/action
colors, inverse text, disabled-state text/border) meets its target WCAG contrast
ratio in both light and dark themes, confirmed via live-parsed relative-luminance
checks, not just static color review. Full-page dark-theme screenshots were captured
for hero, mid-page, and footer regions (`dark-theme-contrast-board.jpg`); visual
review found no obvious contrast or device-frame-visibility issue in the captured
regions. A full computed-contrast pass across every actual rendered text/background
combination in the page (as opposed to the token layer) was not run this checkpoint
and is listed as verification-pending in `accessibility-audit.txt`.

## 17. Performance Findings

Full findings, including the real production-build byte counts, are in
`performance-summary.txt`. Headline numbers from this checkpoint's actual
`pnpm run build`:
- Ordinary entry: `index-8k9L5IcM.js` 2,016.40 kB (gzip 528.08 kB), `index-DhnL7eZS.css`
  200.78 kB (gzip 30.58 kB).
- Preview chunk (lazy-loaded): `PlatformPreview-CS3DUcBD.js` 71.13 kB (gzip 16.97 kB),
  `PlatformPreview-C0bHnvaV.css` 10.29 kB (gzip 2.29 kB).

These figures closely reproduce the Phase 2A.4 carried-forward estimates, confirming
those were not stale guesses. `react-icons` and `ogl` were both re-confirmed via real
grep this checkpoint to have zero import sites in `web-agency/src` (the earlier `ogl`
grep hit was a false positive — a substring match inside a Google Fonts URL, not an
actual import). Every referenced portfolio image has explicit dimensions and
`loading="lazy"`. Classification: no private-preview blocker; the ~2 MB ordinary
entry is a public-homepage/paid-traffic blocker but is pre-existing and site-wide,
not introduced by the preview. No Core Web Vitals figure is claimed anywhere in this
report — no field data exists for this site.

## 18. SEO/Indexing Findings

`noindex, nofollow` confirmed injected at runtime while `/platform-preview` is
mounted, and confirmed restored on unmount. Canonical link confirmed removed while
mounted, restored on unmount. `robots.txt` and `sitemap.xml` both confirmed to omit
`/platform-preview` (checked directly against the live dev server's served files).
The real homepage's existing static SEO surface (canonical, OG/Twitter cards,
`Organization` JSON-LD in `index.html`) is unaffected by and independent of the
preview. Public activation (Level 3) would require building a genuine per-route SEO
system, since today's setup is a single static `<head>` plus one route-scoped runtime
patch — not yet a general solution for multiple public routes.

## 19. Security/Privacy Findings

No API keys, secrets, credentials, or non-approved environment variable references
found in the platform-preview component tree. No internal admin path is ever used as
an actual `href` (only appears in code comments explaining why Sign In does *not*
point there). No raw error message is rendered anywhere in the preview (it makes no
network calls at all — the demo is fully synthetic client-side data). No database
information, provider secrets, or private individual email address found (the one
email present, `info.sitemint@gmail.com`, is the company's existing public support
address, already published elsewhere on the live site). No microphone or live-calling
control exists anywhere in the preview — deliberately and explicitly, per
`AiReceptionistDemo.tsx`'s own design.

Regarding the receptionist auth/session safe-error handling called out in the audit
brief: `artifacts/api-server/src/routes/receptionistAuth.ts` was read (read-only,
protected file, not modified) and found to log errors server-side
(`req.log.error({ err }, ...)`) while returning only a generic `{"error": "Internal
server error"}` to the client on every checked failure path — no raw error/stack
trace exposure was found in this codebase's current state. This is a static-preview
and CRM/receptionist-backend distinction: the static `/platform-preview` page makes
no calls into this code path at all (it is fully synthetic), so it cannot be affected
by anything in `receptionistAuth.ts` regardless of that route's behavior. Any future
finding about this route would affect the AI Receptionist product/dashboard directly,
not the platform preview, and not the public marketing homepage.

## 20. Form/Spam Findings

The Discovery form (`Discovery.tsx` → `POST /api/discovery/submit` →
`artifacts/api-server/src/routes/discovery.ts`) is the destination of every
"Start a Project"/"Build Your SiteMint System" CTA in the preview. Findings: no rate
limiting exists on this endpoint (confirmed via grep across `api-server/src` — no
`rateLimit`/`express-rate-limit` middleware mounted on it); no bot/spam protection
(no honeypot field, no captcha/reCAPTCHA/Turnstile reference anywhere); server-side
validation is limited to three truthy-field checks with no format/type/schema
validation; no privacy disclosure text anywhere in the form flow; weak
duplicate-submission guard (client-side `submitting` flag only prevents mid-flight
resubmission, not post-success or reload-triggered resubmission; server has no
idempotency key or dedup check). A leftover dead-code path was also found: the file
defines a full `SuccessScreen` component and `done` state, but `setDone` is never
called anywhere — actual success UX is a full-page navigation to `/thank-you`, making
`SuccessScreen` unreachable. This form is shared infrastructure, not part of the
preview's own code, but the preview is the thing funneling new traffic to it, so its
readiness gates Level 2+ deployment of the preview in practice.

## 21. Route/Link Findings

Full findings are in `route-and-link-audit.txt`. Summary: every internal
`Link`/`href` destination inside the platform-preview component tree (navbar, mobile
menu, footer, hero, goal selector, products, services, portfolio, process, final CTA)
resolves to a route genuinely present in `App.tsx`. The only non-internal
destinations are the intentionally-external Sign In link (the separate helpdesk SPA,
by design per the two-auth-system architecture), the four portfolio `publicUrl`s, and
`mailto:`/`tel:` links — all correctly classified, none broken. Zero broken/dead
controls found inside the platform-preview surface itself. One pre-existing broken
control was found on the **real, currently-live** `Footer.tsx` (Privacy
Policy/Terms of Service render as non-functional styled spans) — unrelated to the
preview, not touched, flagged for owner awareness only.

## 22. Known Network-Verification Limitations

This environment's outbound network policy blocks or intercepts requests to domains
outside an explicit allowlist, consistent with every prior SiteMint Platform
checkpoint. As a result: the four external portfolio project domains
(website-crm.replit.app, onefilamcommunity.org, sunshine-herlinda-site.replit.app,
ClaidyTaguranPorfolio.replit.app) were **not** independently re-verified as live this
checkpoint — their status is owner-supplied per the permission/asset manifests, not
independently browser-confirmed. Separately, this checkpoint discovered that the
proxy also intercepts `localhost` traffic from a headless-Chromium process unless the
proxy environment variables are explicitly unset for that process — this was a
debugging obstacle for capturing the owner-review screenshots (worked around locally,
not a change to any committed file) and is noted here in case it recurs for a future
checkpoint's live-testing needs.

## 23. Recommended Correction Checkpoint (Phase 2C.2)

Scope recommendation for the next checkpoint, in priority order:
1. Harden the Discovery form: add rate limiting, bot/spam protection, server-side
   schema validation, a privacy disclosure, and either wire up or remove the dead
   `SuccessScreen` code path.
2. Run a full accessibility verification pass: automated axe-core scan (both
   themes), exhaustive keyboard walk of every interactive element, mobile-menu
   focus-trap/Escape behavior, nav-dropdown disclosure focus-return behavior, and a
   screen-reader software pass.
3. Write the release-engineering plan required before any Level 3 consideration:
   flag-removal plan, homepage-route-switch plan, rollback plan, smoke-test
   checklist, monitoring plan.
4. Decide on and address the ~2 MB ordinary-entry bundle (candidates already
   evidence-supported this checkpoint: remove `react-icons` and `ogl`, lazy-split
   CRM/admin routes, reconsider Google Fonts loading strategy).
5. Add analytics/conversion tracking before any Level 4 consideration.
6. Non-blocking: consolidate the three divergent portfolio-data copies; fix the
   real Footer's dead Privacy Policy/Terms of Service links; consider the CRM
   service vs. automated-hand-off copy clarification (§11).

## 24. Explicit Do-Not-Activate Decision

**The preview is not activated. The current public homepage is not replaced. No
production or deployment process was run.** This checkpoint recommends continued
Level 1 (local) and, with the caveats in §5 disclosed, Level 2 (private-deployed)
review only. Activation past that point is not approved by this checkpoint and
remains an explicit owner decision, consistent with every prior SiteMint Platform
checkpoint's standing note.

## 25. Evidence and Screenshot Paths

All evidence for this checkpoint lives outside the repository at
`/tmp/sitemint-2c1-owner-review/` and is not committed. Contents:
`preview-desktop-light.png`, `preview-desktop-dark.png`, `preview-mobile-320.png`,
`preview-mobile-390.png`, `preview-tablet-768.png`, `preview-wide-1440.png`,
`keyboard-focus-flow.jpg`, `dark-theme-contrast-board.jpg`,
`responsive-issues-board.jpg`, `performance-summary.txt`,
`route-and-link-audit.txt`, `claim-audit.txt`, `accessibility-audit.txt`,
`release-readiness-matrix.txt`, and `SiteMint-Phase-2C1-Owner-Review.zip` (bundling
the preceding 14 files). A `raw/` subdirectory alongside these contains the full
8-breakpoint screenshot sweep and the individual dark-theme/keyboard-focus source
captures used to build the three composite boards.
