# Activation Readiness Audit — Phase 2B.1

> Documentation-only checkpoint. Evaluates whether the feature-flagged
> `/platform-preview` prototype (Phase 2A–2A.4) is ready to become the live
> homepage. No activation, deployment, merge, or code change occurred.
> **Activation is not approved by this audit.**

## A. Content

| Area | Status | Notes |
|---|---|---|
| Headline/positioning | Present, consistent with `HeroSection.tsx` | Not re-read in full this checkpoint beyond confirming presence; recommend a dedicated copy pass in 2B.3 |
| Products represented | AI Receptionist, AI Toolkit, CRM/web-agency system | Uses the honest capability-labeling system (`capabilityStatus.ts`: available / in-development / planned / conceptual) — this is a strong existing safeguard against overclaiming |
| Services | Present | — |
| Capability labels | Present and grounded — Phase 2A.1 explicitly built this to avoid implying more is live than is real | Verified the labeling file exists and is documented as the single source of truth |
| Portfolio proof | Text-only currently (see `PORTFOLIO_EVIDENCE_AUDIT.md`) | Primary content gap for this section |
| Company information | Present in `index.html` JSON-LD (`Organization` schema: name, url, email, phone, address region) | — |
| Contact information | `info.sitemint@gmail.com`, `+1 949 880 6515` in schema | — |
| Pricing destination | Links to existing `/pricing` route (outside preview, unchanged) | — |
| Sign In destination | **Previously verified** — `signInHref` (`navConfig.ts`) resolves to `/ai-receptionist/dashboard/login`, AI Receptionist customer access, checked against `artifacts/helpdesk/src/App.tsx`'s registered routes during Phase 2A.2/2A.3. No `/admin` exposure, no internal CRM login exposure, no AI Toolkit login. This is not presently an unresolved architecture question | Reverify during final activation testing, as a regression check rather than an open question |
| Legal links | Not confirmed present in preview shell this checkpoint | **Needs verification in 2B.3** |
| Unsupported claims | None found — capability-labeling system and qualitative-only portfolio outcomes both actively prevent this | Existing discipline should be preserved, not weakened, when visuals are added |
| Placeholder copy | None found in the files reviewed | — |
| Owner approvals | Preview remains explicitly "activation not approved" per every prior checkpoint's standing note (`IMPLEMENTATION_ROADMAP.md`) | Still true today |

## B. Conversion

| Area | Status | Notes |
|---|---|---|
| Primary CTA | Present (links to `/discovery`) | — |
| Secondary CTA | Present | — |
| Discovery/project form | Real, working form at `/discovery`, submits to `POST /api/discovery/submit` | Backend route exists (`artifacts/api-server/src/routes/discovery.ts`), inserts into `discoverySubmissions`, computes lead score/tags/package recommendation, triggers `sendFormEmails` |
| Form acknowledgement | Not traced end-to-end this checkpoint (no submission was made — instructed not to submit a production form) | Static-code read only |
| CRM lead capture | Discovery submissions insert into DB; onward CRM linkage not traced this checkpoint | — |
| Conversion tracking | **None found** — no `gtag`/GA/Plausible/PostHog/Segment snippet anywhere in `web-agency/index.html` or `src/` | Confirmed gap, not a preview-specific issue — the *current live* site has the same gap. See classification note below: not a technical blocker to rendering, but a real gap by the time paid advertising or the public homepage switch happens |
| Error handling | Present in form code (`fetch` + response handling observed at line 582 of `Discovery.tsx`) | Not exhaustively reviewed |
| Success state | Not traced in depth this checkpoint | Flag for 2B.3 |
| Spam protection | No obvious CAPTCHA, honeypot, rate limiter, or equivalent protection was found during the limited static review of `Discovery.tsx` and `discovery.ts` | Direct verification is still required across `Discovery.tsx`, `POST /api/discovery/submit`, route middleware, reverse-proxy/platform controls, and server-side rate limiting before this is treated as either present or absent. Classified as: needs verification before activation, not a confirmed absence |
| Mobile conversion path | Not tested in a browser this checkpoint (documentation-only checkpoint, no browser testing performed) | Flag for 2B.3 |

No email was sent, no production form was submitted, no payment or provider
system was touched during this audit.

**Analytics classification** (corrects an earlier overstatement that
conflated "missing" with "blocking"):

- Not required to implement portfolio visuals — a purely technical,
  code-level task with no analytics dependency.
- Strongly recommended before the public homepage switch — launching a
  redesigned homepage with zero conversion visibility is a real business
  risk, even though the page will render and function without it.
- Required before paid campaign landing pages are launched — campaign
  tracking has no meaning without a baseline analytics/event layer.

A homepage can technically render without analytics; the recommendation to
add it before the public switch is not weakened by this classification —
it is a business-risk judgment, not a rendering blocker.

## C. SEO and AI Search

| Area | Status | Notes |
|---|---|---|
| Title/description strategy | Solid on the current live homepage (`index.html`): descriptive title, meta description, OG/Twitter cards, canonical tag | Preview route itself is unmapped to SEO metadata (expected — it's flag-gated and unlisted) |
| Heading hierarchy | Not audited line-by-line this checkpoint | Flag for 2B.3 |
| Crawlability | `robots.txt` allows `/`, disallows `/admin`; **does not mention `/platform-preview`** | Correct as-is — the preview is not meant to be crawled while flag-gated; must be explicitly added to `Disallow` if it ever ships as a separate route rather than replacing `/` |
| Canonical plan | Current canonical is `https://sitemintdigital.com/` | If the preview replaces the homepage, canonical stays the same URL — no redirect-chain risk, but content changes need cache-busting consideration (see Release Safety) |
| Sitemap plan | `sitemap.xml` lists `/`, `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`, `/discovery` — **no `/platform-preview` entry**, correct while flag-gated | Sitemap will not need a new entry if the preview replaces `/` in place |
| Structured-data opportunities | `Organization` schema already present; `WebSite`, `Service`, and `Product`/`SoftwareApplication` schema **not found** | Real opportunity, not a blocker — recommend adding once content is final, not before |
| Internal-link architecture | Preview links to `/portfolio` ("View all work") — consistent with existing site structure | — |
| Visible business information | Name, email, phone present in schema | Physical address is region/country only, no street address — acceptable for a service business, not a local-SEO storefront |
| AI-search-readable HTML content | Preview is server-rendered React (client-rendered SPA via Vite) — no SSR/prerendering found | Real, existing risk shared with the current live site, not preview-specific; AI crawlers that don't execute JS may see an empty shell. Out of scope to fix in 2B.1 |
| Solution-page gaps | The two future landing pages discussed below (`/solutions/*`) do not exist yet | Expected — future work |
| Duplicate-content risk | Low — preview and current homepage are mutually exclusive via the feature flag; no risk of both being crawled simultaneously | — |

No schema or metadata changes were made this checkpoint.

## D. Accessibility

| Area | Status | Notes |
|---|---|---|
| Accessibility history | **Corrected/fixed**: Phase 1B.1 and 1C.1 explicitly corrected the focus and contrast gaps found during Phase 1A's initial token audit — those specific issues are resolved, not open. **Documented, tracked risk (separate from the fixed issues)**: `DESIGN_TOKEN_AUDIT.md` §20 records a *different*, still-live risk — mint/accent misuse outside its approved lane, the `success` token as a white-text fill, and the light-theme focus ring — none of which is confirmed as an end-user-facing defect in shipping `helpdesk` code today, but which could resurface if a *new* surface (e.g. this preview) consumes the shared tokens carelessly. **Not reverified this checkpoint**: whether the preview itself avoids the §20 risk pattern | Do not describe the Phase 1A issues (already corrected in 1B.1/1C.1) as currently unresolved; the §20 risk is a distinct, still-open item, not a restatement of the fixed ones |
| Keyboard/focus | Not tested in a live browser this checkpoint | Flag for 2B.3 — this audit is static-analysis only; not reverified since 1C.1 in this specific preview surface |
| Contrast | See `DESIGN_TOKEN_AUDIT.md` §20 for the still-open risk pattern (distinct from the Phase 1A issues already fixed in 1B.1/1C.1) | — |
| Reduced motion | Not audited this checkpoint | Flag for 2B.3 (preview uses `framer-motion` for animated sections) |
| Headings/landmarks | Not audited line-by-line this checkpoint | Flag for 2B.3 |
| Link text | Spot-checked (`SelectedWorkSection.tsx`, `Portfolio.tsx`) — descriptive ("Visit live site," "View all work"), no bare "click here" found | — |
| Mobile menu | Not tested this checkpoint | Flag for 2B.3 |
| Target sizes | Not measured this checkpoint | Flag for 2B.3 |
| Image alt-text plan | Existing `Portfolio.tsx` pattern (`"{name} website preview"`) is a reasonable baseline; recommended alt pattern for new captures is in `PORTFOLIO_EVIDENCE_AUDIT.md` §5 | — |
| Screenshots containing text | All four existing portfolio screenshots contain readable page text (headlines, nav labels) — none of it is captured as accessible text (it's a static image), which is a real but common trade-off for site-preview thumbnails; not a blocker | — |

No claim of formal WCAG conformance is made by this audit. Final activation
testing still needs, none of which was performed this checkpoint: browser
keyboard testing, focus visibility, contrast review, reduced motion,
headings and landmarks, target sizes, image alt text, and mobile
navigation.

## E. Performance

Investigated the reported ~2 MB ordinary entry-bundle figure.

- **Could not independently rebuild this session** — `node_modules` is not
  installed in this environment (`pnpm --filter @workspace/web-agency run
  build` fails with `vite: not found`), and a fresh install was not
  attempted given the checkpoint's "no broad code-splitting work" and
  general minimal-footprint scope. All figures below are carried forward
  from the last verified measurement in `IMPLEMENTATION_ROADMAP.md`
  (Phase 2A.4): **ordinary entry bundle ~2,016 kB JS / ~199 kB CSS**;
  **preview lazy chunk ~65.33 kB JS / ~10.29 kB CSS, isolated from the
  ordinary bundle** (confirms the preview itself is not the cause of the
  2 MB figure — it loads separately via `React.lazy`).
- **Hypotheses, from static inspection of `package.json` and prior audit
  docs** (`DESIGN_TOKEN_AUDIT.md` §21) — none of the following was
  confirmed by an actual bundle analysis this checkpoint; treat each as an
  unproven candidate, not an established cause, until a real build
  measures it directly:
  - `framer-motion` is a **hypothesis**: per `DESIGN_TOKEN_AUDIT.md` §21 it
    is bundled into the ordinary entry in at least 3 of 4 artifacts
    regardless of use (shipped-but-unused duplication, no shared runtime),
    but its actual byte contribution to *this* bundle was not measured.
  - `react-icons` is the **strongest dead-dependency candidate**: installed
    in `web-agency`, `helpdesk`, and `ai-toolkit` `package.json` files with
    **zero import sites** anywhere in the codebase, per the audit's grep.
    This is closer to confirmed-unused than the other items, but it should
    still not be removed before a dedicated build-and-lockfile checkpoint
    verifies the grep and measures the before/after bundle delta — no
    dependency should be removed on the strength of a documentation
    checkpoint's static read alone.
  - Google Fonts loaded via CSS `@import url(...)` in every artifact is an
    **observed pattern** (render-blocking, no `<link rel="preload">`), not
    a sized hypothesis — its byte/timing cost was not measured.
  - `recharts` (used by CRM reporting pages, `CrmReporting.tsx`) is a
    **hypothesis**: plausible if not route-split away from the public
    marketing entry, but unconfirmed without a real build. Flagged as the
    top candidate to verify first in a future performance checkpoint,
    precisely because it is unconfirmed, not because it is known.
- **Route-level splitting**: `App.tsx` already lazy-loads `PlatformPreview`
  (confirmed via `lazy(() => import("@/pages/PlatformPreview"))`) — the
  preview route itself is well-isolated. The 2 MB figure describes the
  *ordinary* (non-preview) entry, i.e. the current live marketing site +
  CRM code sharing one bundle, not a preview-caused regression.
- **CRM/admin code in public entry**: plausible given `recharts` and CRM
  page files live in the same `artifacts/web-agency` package as the public
  marketing site: `App.tsx` was only spot-checked for the preview route,
  not for whether `/admin/crm/*` routes are lazy-split from the public
  entry. **This is the single highest-value follow-up question** for a
  performance checkpoint — if CRM admin pages are eagerly bundled into the
  public entry, that is a large, fixable win with no risk to protected CRM
  behavior (route-splitting doesn't change CRM logic, only load order).
- **Risk of changing protected CRM behavior**: low, if the fix is limited
  to converting existing CRM route imports to `React.lazy()` the same way
  `PlatformPreview` already is — this changes *when* code loads, not what
  it does. Still recommend a dedicated checkpoint with its own
  before/after bundle measurement rather than folding it into portfolio
  work.
- **Recommendation**: a separate Phase 2B.4 performance checkpoint,
  scoped narrowly to (1) getting a real, current build measurement (2)
  confirming/refuting the CRM-in-public-entry hypothesis (3) removing
  confirmed-dead `react-icons` (4) route-splitting confirmed offenders.
  No code splitting was performed in this checkpoint, consistent with the
  instruction not to.

## F. Release Safety

| Area | Status |
|---|---|
| Feature flag removal plan | Not written yet — needs a explicit plan for flipping `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED` default and then removing the flag/dead branch, not just setting env var true in production |
| Homepage route-switch plan | Not written yet — `App.tsx` currently gates `/platform-preview` as a *separate* route from `/`; activation requires deciding whether the preview becomes `/` directly or `/` conditionally renders it, with implications for the sitemap/canonical/robots items above |
| Rollback plan | Not written yet — should be a same-day flag flip back to false, given the current architecture keeps the preview fully isolated behind the flag |
| Sitemap update plan | Not needed if the preview replaces `/` in place (URL unchanged); needed if it ships at a new route |
| Canonical update plan | Same as sitemap — no change needed if `/` is reused |
| Robots update plan | No change needed if `/` is reused; must add `/platform-preview` to `Disallow` if that route persists post-launch as a leftover |
| Analytics plan | **No analytics exist today, preview or otherwise** — recommend deciding on an analytics strategy before activation, since launching a redesigned homepage with zero conversion visibility is a real business risk, not just a technical one |
| Cache considerations | Not audited this checkpoint (CDN/browser cache headers, Replit deployment specifics) |
| Domain behavior | Not audited this checkpoint |
| Current Replit deployment assumptions | Not verified this checkpoint — `replit.md` exists at repo root and should be read in full before any activation checkpoint |
| Environment configuration | `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED` is documented in `.env.example` only, not set in any real env file found in this repo — expected, since environment-specific env vars are typically not committed |
| Smoke-test checklist | Not written yet — should mirror `CLAUDE.md`'s existing "Verification gates for any receptionist/voice change" pattern, adapted for a homepage-switch: typecheck clean, protected-file diff zero, flag-off behavior unchanged, no console errors, all nav links resolve |
| Monitoring plan | Not written yet |

No activation, deployment, or environment change occurred during this audit.

## G. Business Readiness

Kept explicitly separate from technical readiness per the audit's
instructions.

| Area | Status |
|---|---|
| Product availability accuracy | Capability-labeling system (available/in-development/planned/conceptual) is the existing mechanism for this — sound design, not verified against current real-world product status this checkpoint (that's a business fact, not a code fact) |
| Service capacity | Not assessable from the repository — business question for the owner |
| Onboarding flow | Discovery form → lead score → package recommendation → email exists; whether there's a defined *human* follow-up process after that is a business question, not visible in code |
| Pricing strategy | Existing `/pricing` route, unchanged by this preview work |
| Sales handoff | Not assessable from the repository |
| Support expectations | Not assessable from the repository |
| AI Receptionist readiness | Out of scope for this audit — governed separately by `docs/ai-receptionist/` and its own protected-file rules; not touched |
| AI Toolkit readiness | Represented in the preview via capability labels; actual product readiness is a business fact outside this repo's determination |
| Client-account strategy | Not assessable from the repository |
| Internal CRM preparedness | CRM system itself (`discEngine`, `leadScore`, etc.) is a locked engine per `CLAUDE.md`; not touched or evaluated for readiness beyond confirming discovery-form submissions do flow into it |

These items require owner input, not further code archaeology — flagging
them here so Phase 2B.5 (activation-readiness verification) has a concrete
punch list rather than starting from zero.

## Advertising Landing-Page Plan (documentation only — no routes created)

Two future campaign routes were requested for planning:

### `/solutions/never-miss-a-lead`

- **Target audience**: service businesses currently losing inbound leads
  to slow response times (matches AI Receptionist's core pitch)
- **Problem**: missed calls/messages after hours or during busy periods
- **Promise**: **corrected** — "instant, always-on lead capture and
  response" is too broad; it could be read as claiming voice calling is
  already a complete production service, which is not verified. The
  campaign promise must match verified channel-level readiness: SMS
  receptionist available now; voice experience in development; connected
  CRM and automated follow-up described as platform direction unless
  independently verified. Recommended initial campaign promise: "Help
  customers reach your business and make every inquiry easier to capture,
  organize, and follow up." A more channel-specific promise (e.g. naming
  voice explicitly) may be used only once supported by the verified
  product state at publish time.
- **Proof required**: real AI Receptionist demo or transcript — not yet
  available in a publishable form per capability-labeling status; needs
  confirmation of current in-development vs. available state before this
  page could honestly claim "available now"
- **Interactive demonstration**: a live chat/voice widget demo would be
  the strongest proof; requires product readiness, not just page content
- **Primary CTA**: discovery form, same as existing `/discovery`
- **Tracking event plan**: blocked on the broader analytics gap (§B/§F) —
  no page-level campaign tracking is meaningful until baseline analytics
  exists
- **Content needed**: real capability status confirmation, one proof
  artifact (demo, transcript, or metric)
- **Current capability risk**: publishing this before AI Receptionist is
  confirmed "available" risks an unsupported claim, which the existing
  capability-labeling discipline is specifically designed to prevent
- **Launch dependency**: AI Receptionist status confirmation + analytics

### `/solutions/website-that-follows-up`

- **Target audience**: businesses with a website but no automated
  follow-up/nurture system
- **Problem**: leads go cold after initial contact
- **Promise**: automated follow-up built into the website/CRM system
- **Proof required**: a real example of the CRM's automation
  (`workflowEngine.ts` — locked engine, not evaluated in depth here) in
  action, e.g. a described (not fabricated) workflow
- **Interactive demonstration**: lower priority than the receptionist page;
  a described workflow diagram may suffice initially
- **Primary CTA**: discovery form
- **Tracking event plan**: same blocker as above
- **Content needed**: one real, non-fabricated workflow example description
- **Current capability risk**: lower than the receptionist page, since the
  CRM automation is a real, shipped internal tool already
- **Launch dependency**: analytics; one approved workflow example

Neither route was created. Both depend on the same underlying gap: no
analytics exists yet to make campaign pages measurable, and the
receptionist page specifically depends on confirming real product status
before publishing a claim.

## Summary

### Blockers and improvements, by category

Reorganized from a single flat list into four categories, so an unverified
hypothesis (e.g. bundle-size cause) is not read with the same weight as a
confirmed gap (e.g. no analytics exists).

**A. Blocks portfolio implementation**

1. Missing documented permissions — no owner/client/organizational approval
   on record for any of the four project screenshots.
2. Missing mobile visuals — no mobile screenshot exists for any project.
3. Unoptimized image files — existing desktop PNGs are 1.3–2.4 MB each,
   unsuitable for direct use in a homepage-critical section without
   compression/format conversion.

**B. Blocks or strongly constrains public activation**

1. Final capability confirmation — current real-world status of AI
   Receptionist/AI Toolkit not independently reverified against the
   capability-labeling system this checkpoint.
2. Release and rollback plan — not written yet (flag-removal, homepage
   route-switch, rollback, smoke-test checklist, monitoring).
3. Conversion-form protection verification — spam protection status is
   unverified, not confirmed absent (see Correction 5); needs direct
   verification before the discovery form becomes the primary homepage
   conversion path.
4. Unresolved public bundle measurement — the ~2 MB ordinary entry bundle
   figure is carried forward from Phase 2A.4, not re-measured this
   checkpoint, and its causes are unproven hypotheses (see Performance
   section).
5. Owner content approval — headline/positioning, Sign In destination, and
   legal-link presence need a final confirmation pass even where evidence
   strongly suggests they're already correct.

**C. Required before paid advertising**

1. Analytics and conversion-event tracking — not required to render the
   homepage, but required before any campaign page is measurable.
2. Campaign-specific proof (demo, transcript, or workflow example) for
   each planned `/solutions/*` page.
3. Channel-accurate AI Receptionist claims — campaign copy must reflect
   verified per-channel readiness (SMS now, voice in development), not a
   blanket "always-on" promise.
4. Tested campaign conversion path — not exercised this checkpoint.

**D. Non-blocking improvements**

- Remove confirmed-dead `react-icons` dependency, but only after a
  dedicated build/lockfile checkpoint re-verifies the zero-import-sites
  finding and measures the before/after bundle delta.
- Consolidate duplicate portfolio-data arrays between `Portfolio.tsx` and
  `SelectedWorkSection.tsx` once images are added to both.
- Clean up duplicate/stale files in `attached_assets/screenshots/`.
- Add `WebSite`/`Service`/`SoftwareApplication` structured data.
- Preload Google Fonts instead of CSS `@import`.

### Recommended Phase 2B checkpoint sequence

- **Phase 2B.2** — Capture and approve portfolio visuals (mobile
  screenshots, owner permission sign-off, image optimization).
- **Phase 2B.3** — Implement Selected Work visual proof in
  `SelectedWorkSection.tsx` using the approved, optimized assets;
  resolve the two-copies-of-project-data question; verify accessibility
  items flagged as "not audited this checkpoint" in a real browser.
- **Phase 2B.4** — Public-bundle performance audit: real build
  measurement, confirm/refute CRM-in-public-entry hypothesis, dead-code
  removal, targeted route-splitting. Independent of portfolio work.
- **Phase 2B.5** — Activation-readiness verification: analytics strategy
  decided and implemented, spam protection added to discovery form,
  release-safety plan written (flag removal, rollback, smoke tests), then
  a controlled homepage-switch decision.

This sequence is unchanged from the one proposed going into 2B.1 — nothing
found in this audit suggests reordering it, only that 2B.2 has a smaller
capture task than expected (desktop assets already exist; only mobile and
permissions are outstanding) and that 2B.4's performance work has a
concrete first hypothesis to test (CRM code in the public entry) rather
than starting blind.
