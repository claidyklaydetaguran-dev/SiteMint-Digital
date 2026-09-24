# Platform Preview Release-Readiness Audit — Phase 2C.1

> Documentation and audit checkpoint only. No application code, styles, copy,
> routes, images, feature flags, or dependencies were changed to produce this
> report. Last updated: 2026-07-20.
>
> **Reconciled by Checkpoint 2C.1.1 (2026-07-20):** the classification language in
> this document was corrected to match the underlying evidence more precisely — no
> finding, measurement, screenshot, or test result was altered. See the note at the
> end of each corrected section for what changed and why. The full rationale is
> recorded in `IMPLEMENTATION_ROADMAP.md`'s Checkpoint 2C.1.1 entry.

## 1. Executive Summary

This checkpoint audits the SiteMint Platform preview (`/platform-preview`,
feature-flagged behind `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED`) as it stands after
Checkpoint 2B.3, in which the "Selected Work" section became a real, data-driven
component (`portfolioProjects.ts`) rather than placeholder content.

**Headline finding: the preview is technically sound and ready for continued Level 1
(local) and Level 2 (private-deployed, stakeholder-only) review.** No release-blocking
defect was found inside the platform-preview component tree itself — copy claims are
accurate and honestly labeled, the feature flag fails closed, routing is fully gated,
no secrets or PII are exposed, and the portfolio content matches its owner-approved
manifest exactly. The current implementation displays no numerical performance,
conversion, revenue, lead, customer-count, or outcome claims, so it requires no metric
permission today — that requirement only activates if a future checkpoint adds such a
claim (see §12).

**The preview is not ready to replace the current public homepage (Level 3) or receive
paid traffic (Level 4).** The real, still-open requirements for those levels are: a
hardened, privacy-disclosed Discovery form (§20), completed remaining accessibility
verification (§15), a written release/rollback plan (§23), and a deliberate,
owner-made analytics decision (§4/§17) — either build measurement before switching, or
accept the absence as a named business-risk exception. A reusable per-route SEO
*system* is a recommended architectural improvement for when product/service landing
pages launch, not a precondition for replacing the content at `/` (§18); the specific,
narrow requirement for Level 3 is verifying the activated `/` route's own title, meta
description, canonical, Open Graph/Twitter tags, and structured data, and confirming
the preview's `noindex` behavior is not carried onto the public route. None of these
require code changes under this checkpoint — they define the scope of a future Phase
2C.2 correction checkpoint.

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

**CONDITIONALLY READY FOR STAKEHOLDER REVIEW ONLY** — not approved for public
lead-generation use or paid traffic. The preview's own surface (routing, flag gating,
SEO exclusion, security posture, portfolio content, theming, responsiveness) is sound
enough to deploy privately for controlled owner/stakeholder review. Analytics is not
required for this level. Conditions for treating Level 2 as ready:
- it is not treated as a production lead-generation launch;
- reviewers are told that Discovery-form hardening remains incomplete and that
  production submission reliability should not be assumed;
- no paid traffic is directed to it;
- the remaining accessibility verification items (§15) are disclosed as pending, not
  claimed as passed.
No code change is required to proceed under these conditions.

## 6. Level 3 Readiness — Public Homepage Switch

**NOT READY.** The actual outstanding requirements, none of which require code
changes to state (implementation is a separate, future checkpoint):
- **Discovery-form privacy and production hardening** (§20): accurate privacy
  disclosure near the form, a real working Privacy destination, a real working Terms
  destination where shown, server-side schema validation, safe success/failure
  behavior, and confirmation that the submit endpoint and acknowledgment flow work
  end-to-end without exposing a raw error or private implementation detail. Rate
  limiting and bot protection should be completed here when the form will be exposed
  publicly, or explicitly documented as a release exception with owner acceptance.
- **Working Privacy/Terms destinations** wherever shown on the activated homepage —
  the existing dead placeholder controls (§21) must not remain classified as merely
  cosmetic once the page is collecting personal information from the public.
- **Remaining accessibility verification** (§15): automated scan, exhaustive keyboard
  traversal, screen-reader review, and the other items listed there.
- **Homepage metadata verification** (§18): confirm the activated `/` route's title,
  meta description, canonical URL, Open Graph/Twitter tags, and structured-data
  behavior are correct, and confirm the preview's `noindex, nofollow` behavior is not
  carried onto the public homepage. A complete, reusable per-route SEO *system* is a
  recommended architectural improvement for future product/service landing pages —
  it is not, by itself, required merely to replace the content at `/`.
- **A written release and rollback plan** (§23), which remains entirely absent.
- **A deliberate analytics decision** (§4/§17): build page-view, primary-CTA-click,
  and Discovery-form-funnel measurement before switching, or have the owner
  explicitly accept launching without it as a named business-risk exception. Absence
  of analytics is a business-readiness condition, not a technical rendering blocker,
  and is tracked separately from the items above.
- **Any remaining public-link verification** (§22): the four external portfolio
  domains were not independently re-verified live this checkpoint.

No numerical performance, conversion, revenue, lead, customer-count, or outcome claim
is displayed by the current implementation, so lack of metric/proof-point permission
is **not** included as a Level 3 blocker here — see §12 for the governance rule that
applies if a future checkpoint adds such a claim.

## 7. Level 4 Readiness — Paid-Traffic Readiness

**BLOCKED.** Requires everything in Level 3 (now genuinely complete, not merely
attempted) plus:
- analytics and conversion tracking (page-view, primary-CTA-click, Discovery-form
  start, Discovery-form submission success, Discovery-form submission failure) and a
  campaign-attribution strategy — required at this level, unlike Level 3 where it is
  a strong recommendation with an owner-risk-acceptance escape valve;
- full anti-spam/anti-abuse protection on the Discovery form: rate limiting, bot
  protection or an equivalent control, and duplicate-submission/idempotent handling;
- verified email/CRM delivery of Discovery-form submissions;
- operational monitoring and a spam-monitoring response plan;
- campaign-specific claim and landing-page review, including confirmation that no
  portfolio project's metric/proof-point permission has been granted (none has been,
  per `PORTFOLIO_PERMISSION_MANIFEST.md`) before any ad copy attempts to cite an
  outcome.

## 8. Release-Readiness Matrix

`release-readiness-matrix.txt` in the owner-review package is the original Phase 2C.1
category-by-category table and is unchanged (per this checkpoint's scope, only this
document and the roadmap may be edited). Its per-category detail remains accurate;
where its category verdicts implied metric-permission or a complete per-route SEO
system as Level 3/4 blockers, treat §6/§7/§12/§18 of this document as the reconciled,
authoritative classification. Reconciled summary verdict:

- **Level 1 — local private review: READY.**
- **Level 2 — controlled private deployed preview: CONDITIONALLY READY FOR
  STAKEHOLDER REVIEW ONLY** (not approved for public lead-generation use or paid
  traffic).
- **Level 3 — public homepage switch: NOT READY** (Discovery-form privacy/production
  hardening; working Privacy/Terms destinations; remaining accessibility
  verification; homepage metadata verification; a release/rollback plan; a
  deliberate analytics decision with explicit owner risk acceptance if launching
  without it; remaining public-link verification — lack of metric permission and
  lack of a complete per-route SEO framework are explicitly **not** included here).
- **Level 4 — paid traffic: BLOCKED** (all Level 3 requirements, plus analytics and
  conversion tracking, campaign attribution, full anti-spam/abuse protection,
  verified form delivery, operational monitoring, and campaign-specific claim/
  landing-page review).

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
- Discovery form: no rate limiting, no bot/spam protection, no server-side schema
  validation beyond three truthy-field checks, no privacy disclosure, no working
  Privacy/Terms destination, weak duplicate-submission guard, and a
  dead/unreachable `SuccessScreen` code path (form submission actually
  full-page-navigates to `/thank-you`, `setDone(true)` is never called). Rate
  limiting and bot protection specifically are required at Level 4 and should be
  completed at Level 3 (or explicitly accepted by the owner as a documented
  exception) before public exposure.
- Remaining accessibility verification (§15) — not a confirmed defect, but genuinely
  unverified and therefore blocking for Level 3/4 specifically.
- No release-engineering plan (activation method, environment-variable plan,
  homepage route-switch plan, metadata transition plan, smoke-test checklist,
  rollback procedure, cache/CDN considerations, post-release monitoring, a named
  owner responsible for rollback, and confirmation of what happens to the preview
  route after activation) — carried forward as still-unwritten from the prior
  activation audit. This remains a genuine blocker.
- Homepage metadata verification not yet performed for the activated `/` route
  (§18) — a specific, narrow verification step, not a request for a new
  architecture.
- Analytics/conversion tracking: a strong business-readiness condition and strongly
  recommended before Level 3, but distinguished here from a technical rendering
  blocker — an owner who explicitly accepts launching without measurement is
  recording a business-risk exception, not overriding a technical blocker. Required
  (not optional) at Level 4.

**Explicitly not classified as Level 3/4 blockers, corrected this checkpoint:**
- Lack of owner-granted metric/proof-point permission for any portfolio project is
  **not** a blocker for the current implementation, because it displays no
  numerical performance, conversion, revenue, lead, customer-count, or outcome
  claim. It becomes a governance gate only if/when a future checkpoint proposes
  adding such a claim (§12).
- Absence of a complete, reusable per-route SEO *system* is **not** a blocker for
  replacing the content at `/` — it is a recommended architectural improvement,
  required later when product/service landing pages launch (§18).

**Kept genuinely separate, per governance requirement:** the known receptionist
auth/session database safe-error concern (§19) does not block static local preview
review and does not inherently block controlled viewing of the marketing preview; it
remains a blocker only for activating or promoting the affected AI Receptionist
authenticated/product workflows, and must not be read as a general homepage finding.

## 11. Non-Blocking Improvements

- Current lack of metric/proof-point permission for portfolio projects is a
  governance constraint on any *future* numerical claim, not a defect or an
  activation blocker for the page as it exists today (see §6, §12).
- `ServicesSection.tsx`'s "CRM Systems" service tile sits close enough to the
  AI-Receptionist CRM/follow-up topic that a stricter copy pass may want the
  distinction (implementation service vs. automated intake hand-off) made explicit.
- Three divergent, un-consolidated portfolio-data copies exist (`Home.tsx`,
  `Portfolio.tsx`, `portfolioProjects.ts`) with different URLs/asset sets — a
  pre-existing, non-preview-specific duplication.
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

Note: the real, currently-live `Footer.tsx`'s "Privacy Policy"/"Terms of Service"
being styled as clickable but carrying no `href`/`onClick` is **no longer listed as
non-blocking here** — per §6/§20's reconciled classification, working Privacy/Terms
destinations are a genuine Level 3 requirement once the page collects personal
information from the public, so this item moved to §10's Level 3 blocker list. It
remains true that this defect exists on the live site today and was not introduced
by, and is not part of, the preview.

## 12. Copy and Claim Findings

Full verbatim findings are in `claim-audit.txt` (owner-review package). Summary: no
category defined in the audit brief (SMS availability, voice-in-development framing,
CRM/follow-up not-yet-complete framing, AI Toolkit in-development framing, fabricated
metrics, unsupported testimonials/customer counts/outcomes, client phone numbers in
preview content, Claidy's excluded statistics, rejected Shasta metrics, internal
audit/permission language leaking into rendered copy) produced a confirmed violation.
One non-blocking clarity item is noted (§11, CRM service vs. hand-off distinction).

**Metric-permission governance (reconciled this checkpoint):** the current
implementation displays no numerical performance, conversion, revenue, lead,
customer-count, or outcome claim anywhere in the audited files — confirmed by the
same read that produced the findings above. Because no metric is displayed, no
metric permission is required for the current implementation, and this is correctly
not counted as a Level 3/4 blocker (§6, §10). This is a forward-looking governance
rule, not a current defect: any future checkpoint that proposes adding a numerical
claim must first obtain separate evidence and owner/client permission for that
specific claim, per `PORTFOLIO_PERMISSION_MANIFEST.md`'s existing standard that
visual/publication approval never implies metric approval. Unsupported metrics must
remain excluded regardless. No metric was added by this checkpoint.

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

**Level classification (reconciled this checkpoint):** Level 2 controlled preview —
conditionally acceptable, on the strength of the verified positive findings above
(no confirmed defect, visible focus rings, working skip link, passing token-contrast
tests, clean sampled responsive layouts) with the verification-pending list disclosed
to reviewers as pending, not claimed as passed. Level 3 public switch — the remaining
accessibility verification items above are required before switching. Level 4 paid
traffic — the same Level 3 accessibility requirements remain required; paid traffic
does not add a distinct accessibility requirement beyond completing Level 3's. This
report does not claim WCAG conformance at any level; it reports what was verified
and what remains open.

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

**Analytics classification (reconciled this checkpoint):** analytics/conversion
tracking is not required for Level 2 controlled stakeholder review. For Level 3, it
is a strong business-readiness condition and strongly recommended before the
homepage switch, but is tracked as distinct from a technical rendering blocker — an
owner who intentionally accepts launching without measurement is recording an
explicit business-risk exception, not clearing a technical defect. For Level 4, it
is required, at minimum covering: page-view measurement, primary-CTA-click
measurement, Discovery-form start, Discovery-form submission success, Discovery-form
submission failure, a campaign-attribution strategy, and a consent/privacy treatment
appropriate to whichever analytics system is selected. No analytics was implemented
by this checkpoint.

## 18. SEO/Indexing Findings

`noindex, nofollow` confirmed injected at runtime while `/platform-preview` is
mounted, and confirmed restored on unmount. Canonical link confirmed removed while
mounted, restored on unmount. `robots.txt` and `sitemap.xml` both confirmed to omit
`/platform-preview` (checked directly against the live dev server's served files).
The real homepage's existing static SEO surface (canonical, OG/Twitter cards,
`Organization` JSON-LD in `index.html`) is unaffected by and independent of the
preview.

**Reconciled Level 3 requirement:** activating the homepage switch does **not**
inherently require building a complete, reusable per-route SEO system merely to
replace the content at `/`. The specific, narrow verification required before that
switch is: confirm the activated `/` route's final title; confirm its meta
description; confirm its canonical URL; confirm its Open Graph and Twitter metadata;
confirm structured-data behavior; confirm the activated `/` route actually receives
the intended metadata (not leftover preview values); and confirm that the preview's
`noindex, nofollow` runtime behavior is not carried onto the public homepage once
activated. A broader, reusable per-route metadata system remains a recommended
architectural improvement and will become genuinely required once additional
product/service landing pages launch beyond `/` — it is not weakened or waived for
that future need, only correctly scoped out of what replacing `/` alone requires.

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

**Kept explicitly separate (reconciled this checkpoint), not to be lost inside
general homepage findings:**
- It does not block static local preview review (Level 1).
- It does not inherently block controlled viewing of the marketing preview (Level 2).
- It remains a blocker for activating or promoting the affected AI Receptionist
  authenticated/product workflows specifically — a distinct product surface from
  this marketing preview and the public homepage.
- The receptionist implementation was not inspected further or modified during this
  reconciliation checkpoint; the finding above was produced entirely by the prior
  Phase 2C.1 audit's read of `receptionistAuth.ts`.

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
preview's own code, but the preview is the thing funneling new traffic to it.

**Level-by-level classification (reconciled this checkpoint):**
- **Level 1 (local private review): READY.** No real submission is required for a
  visual-only review of the preview.
- **Level 2 (controlled private deployed preview): CONDITIONALLY READY, for
  owner/stakeholder review only**, on these conditions: it is not treated as a
  production lead-generation launch; reviewers are told that form hardening remains
  incomplete; no paid traffic is directed to it; and production submission
  reliability is not assumed.
- **Level 3 (public homepage switch): REQUIRED before the homepage directs public
  users to this form** — accurate privacy disclosure near the form; a real, working
  Privacy destination; a real, working Terms destination where shown; server-side
  schema validation; safe success and failure behavior; confirmation that the form
  endpoint and acknowledgment flow work; and confirmation that no raw error or
  private implementation detail is returned. Rate limiting and bot protection should
  be completed at this level when the form will be exposed publicly, or explicitly
  documented as a release exception with owner acceptance — prefer classifying them
  as required.
- **Level 4 (paid traffic): REQUIRED** — rate limiting; bot protection or an
  equivalent anti-abuse control; server-side schema validation; privacy disclosure;
  working Privacy/Terms destinations; duplicate-submission protection or idempotent
  handling; safe success and failure states; verified email/CRM delivery; analytics
  and conversion tracking; and a spam-monitoring operational response plan.

The existing dead/placeholder Privacy and Terms controls on the real, live site
(§21) must not remain classified solely as cosmetic once the page is collecting
personal information from the public — they are a genuine Level 3 requirement, not
merely a cleanup item. No form was submitted and no email was sent during this or
the prior checkpoint's audit.

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
preview and not touched by any checkpoint. Per §6/§20's reconciled classification,
this is not merely a cosmetic flag: working Privacy/Terms destinations are a genuine
Level 3 requirement once a page collects personal information from the public, so
this finding carries forward as a named Level 3 requirement, not only owner
awareness.

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
1. Harden the Discovery form for Level 3: accurate privacy disclosure, a real
   working Privacy destination, a real working Terms destination where shown,
   server-side schema validation, safe success/failure behavior, confirmed
   endpoint/acknowledgment-flow behavior with no raw-error exposure, and either wire
   up or remove the dead `SuccessScreen` code path. Add rate limiting and bot
   protection at this stage, or record an explicit owner-accepted release exception
   if deferred. Add the remaining Level 4 anti-abuse/duplicate-submission/verified-
   delivery items when paid traffic is being planned.
2. Run a full accessibility verification pass: automated axe-core scan (both
   themes), exhaustive keyboard walk of every interactive element, mobile-menu
   focus-trap/Escape behavior, nav-dropdown disclosure focus-return behavior, and a
   screen-reader software pass.
3. Write the release-engineering plan required before any Level 3 consideration:
   activation method, environment-variable plan, homepage route-switch plan,
   metadata transition plan, smoke-test checklist, rollback procedure, cache/CDN
   considerations, post-release monitoring, a named owner responsible for rollback,
   and confirmation of whether the preview route stays hidden, is removed, or
   remains noindexed after activation.
4. Verify homepage metadata for the activated `/` route specifically (title, meta
   description, canonical, Open Graph/Twitter, structured data, confirmation the
   preview's `noindex` behavior does not carry over) — this is a verification task,
   not a request to build a new per-route SEO system.
5. Bring the owner a deliberate analytics decision before Level 3: build the
   minimum measurement set (page views, primary-CTA clicks, Discovery-form start/
   success/failure) and a campaign-attribution plan, or record explicit owner
   acceptance of launching without it as a named business-risk exception. Required,
   not optional, before Level 4.
6. Decide on and address the ~2 MB ordinary-entry bundle (candidates already
   evidence-supported this checkpoint: remove `react-icons` and `ogl`, lazy-split
   CRM/admin routes, reconsider Google Fonts loading strategy).
7. Non-blocking: consolidate the three divergent portfolio-data copies; consider the
   CRM service vs. automated-hand-off copy clarification (§11).

No numerical claim should be added to the preview in this future checkpoint without
first obtaining the separate evidence and owner/client permission that
`PORTFOLIO_PERMISSION_MANIFEST.md` already requires for any metric.

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
