# V5 Build Checklist (frozen 2026-09-04, baseline)

> Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED — UNVERIFIED · VERIFIED COMPLETE · BLOCKED — OWNER · BLOCKED — EXTERNAL · DEFERRED.
> Weights for scoring: P0 = 5, P1 = 2, Deferred = excluded. An item is VERIFIED COMPLETE only when its tests and preview evidence pass. Updated after every integrated work block; the readiness numbers in PUBLISHABILITY-DASHBOARD.md are computed from this table by `scripts`-free script `readiness.mjs` in the session scratchpad (formula in the dashboard).
> Columns: ID · Workstream · Route/capability · Priority · Status · Commit · Evidence · Preview · Remaining · Blocker owner.

| ID | WS | Route / capability | Pri | Status | Commit | Evidence | Preview | Remaining | Blocker |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | Foundation | System B semantic tokens (`tokens-v5.css`, both apps) | P0 | VERIFIED COMPLETE | b37b70c | Glacier Mint (blue-leaning, hues 185-200°) swapped in place of System B; semantic amber/red untouched | glacier-swap 13 files/147 values, 0 residual; contrast: ink 12.78 AAA, link 5.44 AA, btn-text 6.12; 289 v5-glacier captures | — | — |
| F-02 | Foundation | Public chrome / auth / ops primitive remap to mint (override-only) | P0 | VERIFIED COMPLETE | b37b70c | Glacier Mint (blue-leaning, hues 185-200°) swapped in place of System B; semantic amber/red untouched | glacier-swap 13 files/147 values, 0 residual; contrast: ink 12.78 AAA, link 5.44 AA, btn-text 6.12; 289 v5-glacier captures | — | — |
| F-03 | Foundation | Helpdesk palette remap (light + dark appearance) | P0 | VERIFIED COMPLETE | b37b70c | Glacier Mint (blue-leaning, hues 185-200°) swapped in place of System B; semantic amber/red untouched | glacier-swap 13 files/147 values, 0 residual; contrast: ink 12.78 AAA, link 5.44 AA, btn-text 6.12; 289 v5-glacier captures | — | — |
| F-04 | Foundation | Motion foundation (`Reveal`, reduced motion, budgets) | P1 | VERIFIED COMPLETE | b37b70c | reduced-motion check 0 hidden | sweeps + previews on 127.0.0.1:4170 | — | — |
| F-05 | Foundation | Route scroll-to-top + anchor + back/forward manager (both apps) | P0 | VERIFIED COMPLETE | 2d36c19 | scroll checks 6/6 | sweeps + previews on 127.0.0.1:4170 | — | — |
| F-06 | Foundation | Foundation contract test in the scripts chain | P0 | VERIFIED COMPLETE | b37b70c | registered; chain green | sweeps + previews on 127.0.0.1:4170 | — | — |
| F-07 | Foundation | Accessibility foundations (focus ring token, no mint small text, amber/red reserved) | P0 | VERIFIED COMPLETE | b37b70c | Glacier Mint (blue-leaning, hues 185-200°) swapped in place of System B; semantic amber/red untouched | glacier-swap 13 files/147 values, 0 residual; contrast: ink 12.78 AAA, link 5.44 AA, btn-text 6.12; 289 v5-glacier captures | — | — |
| W-01 | Website | "Signal" removed from public copy/titles/metadata | P0 | VERIFIED COMPLETE | 5cc2ce6 | homeV5Contract: no Signal in public copy | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-02 | Website | Homepage hero copy + CTAs (amendment §6), particles + journey retained | P0 | VERIFIED COMPLETE | 5cc2ce6 | hero literals pinned + swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-03 | Website | Homepage 15-section content architecture (§8), signatures, no card walls | P0 | VERIFIED COMPLETE | 5cc2ce6 | 15 section ids pinned; full-page sweeps | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-04 | Website | Nav: no duplicate receptionist card; mobile group "Explore"; active state on pillar pages | P0 | VERIFIED COMPLETE | 5cc2ce6 | sweep + v4 keyboard contract | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-05 | Website | `/services` anchors + interactive systems map | P1 | VERIFIED COMPLETE | 2d36c19 | #ai-systems lands y=1244; map hash written | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-06 | Website | `/automation` → `/ai-systems` (AI Systems & Automation incl. CRM section), redirect | P1 | VERIFIED COMPLETE | 5cc2ce6 | /automation redirect swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-07 | Website | Truthful `/work` and `/about` copy; team section | P0 | VERIFIED COMPLETE | 5cc2ce6 | copy in build; chain green | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-08 | Website | `/process` five real phases with outputs | P1 | VERIFIED COMPLETE | 5cc2ce6 | five phases swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-09 | Website | Discovery intake submits to backend with all states (flag stays off) | P0 | VERIFIED COMPLETE | 5cc2ce6 | real-mouse walker completed all 8 steps; POST /api/v1/discovery-submissions → 201 + reference; terminal thank-you state rendered | qa-forms.mjs 7/7; shots/forms/form-discovery-final-1440.png | — | — |
| W-10 | Website | `/contact` folded into `/start` (redirect); V2 preview pages removed | P0 | VERIFIED COMPLETE | 5cc2ce6 | /contact redirect swept; V2 pages deleted | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-11 | Website | Pricing rebuilt (three tiers, disclaimer, configurator, honesty check) | P1 | VERIFIED COMPLETE | 5cc2ce6 | pricing swept 5 widths | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-12 | Website | On-brand 404 with five exits (public) | P0 | VERIFIED COMPLETE | 5cc2ce6 | 404 swept with five exits | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-13 | Website | Legacy verticals retired → `/ai-receptionist#use-cases` | P0 | VERIFIED COMPLETE | 5cc2ce6 | vertical redirects swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-14 | Website | Video containers, poster/loading/reduced-motion/mobile fallback, labelled placeholders | P1 | VERIFIED COMPLETE | 5cc2ce6 | placeholder poster renders; reduced motion = poster | sweeps + previews on 127.0.0.1:4170 | — | — |
| W-15 | Website | SEO/metadata (titles, descriptions, sitemap without retired routes) | P1 | IMPLEMENTED — UNVERIFIED | 5cc2ce6 | tsc clean in worktree | — | Linux gates + preview | — |
| W-16 | Website | Privacy/Terms prepared for legal review | P1 | BLOCKED — OWNER | — | drafts exist | — | legal review | Owner |
| R-01 | Receptionist mkt | Product-only landing page, 17 sections, route-aware header (no Start a Project) | P0 | VERIFIED COMPLETE | eb4e314 | 17 sections pinned + swept all widths | sweeps + previews on 127.0.0.1:4170 | — | — |
| R-02 | Receptionist mkt | Simulated Interactive Preview (curated branches, waveform, labelled) | P0 | VERIFIED COMPLETE | df34fda | preview swept; labels pinned | sweeps + previews on 127.0.0.1:4170 | — | — |
| R-03 | Receptionist mkt | Request Beta Access form → `POST /api/public/beta-requests` (flag off) | P0 | VERIFIED COMPLETE | df34fda | click-through: fields filled, 3s-guard waited, POST → 202, success state; mode A shows honest not-available copy | qa-forms.mjs 7/7; shots/forms/form-beta-success-1440.png, form-beta-disabled-1440.png | — | — |
| R-04 | Receptionist mkt | Use-cases section (verified ideas from retired verticals) | P1 | VERIFIED COMPLETE | df34fda | use-cases section swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| R-05 | Receptionist mkt | Live-demo client path behind fail-closed flag; no key, no activation | P1 | VERIFIED COMPLETE | df34fda | contract: no key, flag-gated, 503 test | sweeps + previews on 127.0.0.1:4170 | — | — |
| R-06 | Receptionist mkt | Hero video container + poster strategy (no paid media) | P1 | VERIFIED COMPLETE | df34fda | poster-first container swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-01 | Customer app | Approved navigation (D-2), breadcrumbs, no nested rail scroll, capability states for every path | P0 | VERIFIED COMPLETE | f32f4b2 | boundary 98/98; capability + 404 swept; 240 combos | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-02 | Customer app | Invite-only signup ("Set up your AI Receptionist", S-1 fields) | P0 | VERIFIED COMPLETE | 0d16ba2 | signupContract green; page swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-03 | Customer app | Forgot password + reset UI | P0 | VERIFIED COMPLETE | 0d16ba2 | reset pages swept; contract green | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-04 | Customer app | Persistent 10-step onboarding hub (Setup) | P0 | VERIFIED COMPLETE | 0d16ba2 | setup swept; setupContract green | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-05 | Customer app | Overview redesign (D-1) | P0 | VERIFIED COMPLETE | 0d16ba2 | overviewContract green; states swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-06 | Customer app | One-assistant status card; hide create-another | P0 | VERIFIED COMPLETE | d0dd878 | assistants 246 checks; card swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-07 | Customer app | Configuration fields (C-2) from workspace settings | P0 | VERIFIED COMPLETE | d0dd878 | configuration tab swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-08 | Customer app | Structured prompt + full-prompt preview + "how callers hear this"; Advanced | P0 | VERIFIED COMPLETE | d0dd878 | promptComposer tests; prompt tab swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-09 | Customer app | Voice presets with sample player + provider-neutral asset adapter (no paid samples) | P0 | VERIFIED COMPLETE | d0dd878 | sample player unavailable-state; voice tab swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-10 | Customer app | Test / Publish controls with prerequisite states; "Save changes"/"Publish update" | P0 | VERIFIED COMPLETE | d0dd878 | disabled controls with reasons; contract green | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-11 | Customer app | Availability + Appointment Types unbundled from voice flag; Advanced grouping | P0 | VERIFIED COMPLETE | 3d5daa5 | ungated routes swept in voice+canonical | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-12 | Customer app | Scheduling → Calendar screen (connect/status/reconnect/disconnect/post-OAuth) | P0 | VERIFIED COMPLETE | 3d5daa5 | calendarContract; connect roundtrip fixture | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-13 | Customer app | Appointment lifecycle UI (approve/reschedule/cancel/reconcile) + drawer + confirmations | P0 | VERIFIED COMPLETE | 3d5daa5 | appointmentsContract rewritten; drawer swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-14 | Customer app | Test Booking safety (explicit create, labelled test) | P0 | VERIFIED COMPLETE | 3d5daa5 | testBookingContract; explicit create | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-15 | Customer app | Calls (rename, statuses, retention explanation) | P0 | VERIFIED COMPLETE | b29d4bf | Calls title/statuses; 243 checks | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-16 | Customer app | Minimal Contacts page + detail | P0 | VERIFIED COMPLETE | 3d5daa5 | contactsContract; list+detail swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-17 | Customer app | Phone Number page (assigned/none/paused states; assign/pause over existing routes) | P0 | VERIFIED COMPLETE | 2e19829 | wire-mapped numbersApi; page swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-18 | Customer app | Usage page + rail indicator + paused copy (U-1…U-3) | P0 | VERIFIED COMPLETE | 3d5daa5 | usageContract; paused copy pinned | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-19 | Customer app | Customer Issues page (safe failures) | P0 | VERIFIED COMPLETE | 3d5daa5 | issuesContract; all-clear + resolve | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-20 | Customer app | Settings editable fields (D-7); billing hides dead controls (D-6) | P1 | VERIFIED COMPLETE | 0d16ba2 | settings/billing contracts green | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-21 | Customer app | Mobile drawer + tables→cards below 768 px | P1 | VERIFIED COMPLETE | 3d5daa5 | 360px sweeps: cards, 0 overflow | sweeps + previews on 127.0.0.1:4170 | — | — |
| C-22 | Customer app | Dead code removed (orphaned tabs/components) | P1 | VERIFIED COMPLETE | d0dd878 | orphans deleted; chain green | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-01 | Operations | Shared `adminFetch`, one 401 path, client-side guard, standard states | P0 | VERIFIED COMPLETE | 78bae7e | opsContract; CRM sweep 84/84 | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-02 | Operations | Secure admin sessions UI (cookie login/logout/me) | P0 | VERIFIED COMPLETE | f55d5c4 | vitest cookie tests; guard swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-03 | Operations | Breadcrumbs, single scroll region, in-layout 404 | P1 | VERIFIED COMPLETE | 78bae7e | in-layout 404 swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-04 | Operations | Nav cleanup (Soon items, duplicate Lead DNA, one Command Center) | P1 | VERIFIED COMPLETE | 78bae7e | nav cleanup; sweep | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-05 | Operations | Receptionist Ops: Firms, Firm detail, Issues, Usage, Numbers | P0 | VERIFIED COMPLETE | 78bae7e | 5 ops routes swept 360+1440 | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-06 | Operations | Command Center attention-first (O-2) | P1 | VERIFIED COMPLETE | 78bae7e | command center swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-07 | Operations | Canonical lead statuses + null-safety (O-3) | P1 | VERIFIED COMPLETE | 78bae7e | canonical statuses; chain green | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-08 | Operations | Lead detail simplification (O-4) | P1 | VERIFIED COMPLETE | 78bae7e | lead detail swept | sweeps + previews on 127.0.0.1:4170 | — | — |
| O-09 | Operations | Essential responsive Ops views (M-3) | P1 | VERIFIED COMPLETE | 78bae7e | ops pages 360px card rows | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-01 | Backend | Admin cookie sessions + logout + me + audit (schema push-mode) | P0 | VERIFIED COMPLETE | f55d5c4 | vitest 43/43 incl. cookie degrade | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-02 | Backend | Onboarding state routes + `voice_onboarding_states` schema | P0 | VERIFIED COMPLETE | f55d5c4 | onboarding tests + preview | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-03 | Backend | Contacts read routes | P0 | VERIFIED COMPLETE | f55d5c4 | contacts route tests + preview | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-04 | Backend | Invite-only signup route + invites admin (flag off) | P0 | VERIFIED COMPLETE | f55d5c4 | invite redeem-once test | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-05 | Backend | Public beta-request route + admin list (flag off) | P0 | VERIFIED COMPLETE | f55d5c4 | flag-off 503 + honeypot tests | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-06 | Backend | Live-demo session seam, fail-closed, no provider | P1 | VERIFIED COMPLETE | f55d5c4 | no-provider-import proof | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-07 | Backend | Admin voice issues / usage / numbers routes | P0 | VERIFIED COMPLETE | f55d5c4 | admin ops route tests + ops preview | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-08 | Backend | Migration packet (0007 voice + push-mode CRM) tested on a disposable DB | P0 | VERIFIED COMPLETE | 57c86bd | disposable-DB fresh/rollback/re-apply all green | sweeps + previews on 127.0.0.1:4170 | — | — |
| B-09 | Backend | Migrations applied externally | P0 | BLOCKED — OWNER | — | — | — | execution authorisation | Owner |
| V-01 | Verification | Typecheck + canonical suite + contract suites green on the integrated branch | P0 | VERIFIED COMPLETE | 5461c6f | chain exit 0 (2400 checks); full suite exit 0 | sweeps + previews on 127.0.0.1:4170 | — | — |
| V-02 | Verification | Production builds + voice matrix + built-output scans (incl. web-agency allowlist) | P0 | VERIFIED COMPLETE | c9adeeb | matrix 20/20 (675 assertions); builds+scans clean; wa bundle 0 provider strings | gates on /opt/sitemint-v5 | — | — |
| V-03 | Verification | Five-width sweep, zero overflow, nested-scroll = 0, console clean (all surfaces) | P0 | VERIFIED COMPLETE | 2d36c19 | 334 combos, 0 overflow, errors only expected mode-A 401s | sweeps + previews on 127.0.0.1:4170 | — | — |
| V-04 | Verification | Keyboard/focus/Escape + scroll-to-top/anchor/back tests | P0 | VERIFIED COMPLETE | 2d36c19 | scroll 6/6; v4 keyboard contract in chain | sweeps + previews on 127.0.0.1:4170 | — | — |
| V-05 | Verification | Reduced motion + accessibility (Lighthouse a11y 100 on public pages) | P1 | IMPLEMENTED — UNVERIFIED | 2d36c19 | reduced-motion 6/6; Lighthouse a11y rerun pending | — | Lighthouse on realistic server | — |
| V-06 | Verification | Performance vs R1 baseline (entry JS, LCP, CLS) | P1 | IN PROGRESS | — | entry sizes captured (wa 359.8KB, hd 359.3KB vs R1 ~same) | — | Lighthouse medians vs R1 | — |
| V-07 | Verification | Secret scan + protected-file 0-diff + route-security contract | P0 | VERIFIED COMPLETE | dc601c3 | secret scan 0/1380; protected 0/16; routeSecurity vitest | sweeps + previews on 127.0.0.1:4170 | — | — |
| V-08 | Verification | Unified owner preview index with synthetic-data labels, all states, mobile | P0 | VERIFIED COMPLETE | 2d36c19 | preview index 4170; 7 hd states + 4 crm states | sweeps + previews on 127.0.0.1:4170 | — | — |
| A-01 | Visual accept | Palette approved by owner (Glacier Mint applied globally) | P0 | IN PROGRESS | — | — | — | owner sign-off | Owner |
| A-02 | Visual accept | Visual hierarchy approved | P0 | IN PROGRESS | — | — | — | owner sign-off | Owner |
| A-03 | Visual accept | Spacing and section rhythm approved | P0 | IN PROGRESS | — | — | — | audit + owner sign-off | Owner |
| A-04 | Visual accept | Content density approved (no purposeless empty space) | P0 | IN PROGRESS | — | — | — | audit + owner sign-off | Owner |
| A-05 | Visual accept | Page individuality approved (signatures integrated, not placeholders) | P0 | IN PROGRESS | — | — | — | audit + owner sign-off | Owner |
| A-06 | Visual accept | Imagery implemented (generated, not containers) | P0 | BLOCKED — OWNER | — | manifest ready; generation needs budget approval | — | media budget | Owner |
| A-07 | Visual accept | Required video/media implemented | P1 | BLOCKED — OWNER | — | storyboards ready; generation needs budget approval | — | media budget | Owner |
| A-08 | Visual accept | Desktop visual review passed | P0 | IN PROGRESS | — | — | — | corrected preview | Owner |
| A-09 | Visual accept | Tablet visual review passed | P0 | IN PROGRESS | — | — | — | corrected preview | Owner |
| A-10 | Visual accept | Mobile visual review passed | P0 | IN PROGRESS | — | — | — | corrected preview | Owner |
| A-11 | Visual accept | Final owner visual acceptance passed | P0 | BLOCKED — OWNER | — | — | — | owner review of corrected preview | Owner |
| A-12 | Visual accept | Interaction/motion pass — staggered scroll reveals, container + hover transitions, link/button micro-interactions across all public pages (reduced-motion safe) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (voice note 2): more interactives, text/container/scroll transitions, hovers | — | motion pass merged + captures | — |
| A-13 | Visual accept | AI Receptionist product-page header decluttered (no wrap 360–1920, one primary CTA, calm hierarchy) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (voice note 2): nav bar too messy | — | header redesign merged + captures | — |
| A-14 | Visual accept | UI/feature recommendations delivered to owner (transitions, unique UI, features) | P1 | IN PROGRESS | — | owner directive 2026-09-05 (voice note 2) | — | recommendations section in outcome report | — |
| G-01 | Experience | Motion coverage — every public route (heroes, section titles, intros, lists, tiers, CTAs, visuals; choreographed sequences, varied vocabulary) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-02 | Experience | Motion coverage — Discovery intake (step transitions, progress movement, selected-state and validation feedback) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-03 | Experience | Motion coverage — AI Receptionist page (cinematic: ring, waveform, conversation, rules, availability, result, dashboard) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-04 | Experience | Restrained customer-app transitions (entrances, status, drawers, tabs, setup progress) | P1 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-05 | Experience | Restrained Operations CRM transitions (page/drawer/attention/loading/table) | P1 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-06 | Experience | Full rendered-theme compliance across all ~37 surfaces + anti-regression theme test | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-07 | Experience | Discovery intake visual redesign (split editorial layout; contract preserved) approved by owner | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | owner review of corrected preview | Owner |
| G-08 | Experience | Public-route scroll-to-top on every path change incl. browser Back/Forward + focus to main | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-09 | Experience | Active-nav re-click returns page to top and replays page introduction | P1 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-10 | Experience | SiteMint wordmark: from elsewhere → Home top + hero entrance; on Home → top + hero replay (no hard refresh, no state loss) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-11 | Experience | AI Receptionist full-screen hero (100svh minus nav; preview + CTA + beta status in first viewport) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-12 | Experience | Page-level marketing strategy documented and applied (intent, message, proof, objection, CTAs, next page per route) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| G-13 | Experience | Content-depth approval (no unexplained titles, generic wording, dead space, repeated slogans) | P0 | IN PROGRESS | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | owner review of corrected preview | Owner |
| G-14 | Experience | Media generation (owner-budgeted; people-at-work, product/interface, backgrounds, two hero videos) | P0 | BLOCKED — OWNER | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | media budget approval | Owner |
| G-15 | Experience | Media installation verified in real pages (assets in place, fallbacks, performance treatment) | P0 | NOT STARTED | — | owner directive 2026-09-05 (motion/theme/routing/discovery/marketing pass) | — | implementation + preview verification | — |
| X-01 | External | Browser test call certification | P0 | BLOCKED — OWNER | — | — | — | Stage 2 authorisation | Owner |
| X-02 | External | Phone-number acquisition + assignment | P0 | BLOCKED — OWNER | — | — | — | number purchase | Owner |
| X-03 | External | Inbound-call certification | P0 | BLOCKED — OWNER | — | — | — | Stage 3 | Owner |
| X-04 | External | Google production OAuth + calendar flags | P0 | BLOCKED — OWNER | — | — | — | OAuth client | Owner |
| X-05 | External | Alerts/Resend + reconciliation flags | P0 | BLOCKED — OWNER | — | — | — | Resend key | Owner |
| X-06 | External | Private-beta legal documents reviewed | P0 | BLOCKED — OWNER | — | — | — | legal | Owner |
| X-07 | External | Rollback + support procedures rehearsed on staging | P0 | BLOCKED — OWNER | — | runbooks exist | — | staging resume | Owner |
| X-08 | External | Voice sample assets (licensed) | P0 | BLOCKED — OWNER | — | — | — | asset source | Owner |
| X-09 | External | Hero videos generated (after storyboard approval) | P1 | BLOCKED — OWNER | — | storyboards | — | credits | Owner |
| X-10 | External | Production OAuth, domains, DNS | P1 | BLOCKED — OWNER | — | — | — | DNS | Owner |
| X-11 | External | Public pricing decisions (AI Receptionist) | P1 | BLOCKED — OWNER | — | — | — | cost data | Owner |
| X-12 | External | Billing posture (Stripe voice webhook, test clocks) | P1 | BLOCKED — OWNER | — | — | — | Stripe | Owner |
| X-13 | External | Monitoring on production origin | P1 | BLOCKED — OWNER | — | — | — | deployment | Owner |
| X-14 | External | Production-origin accessibility/performance testing | P1 | BLOCKED — EXTERNAL | — | — | — | deployment | Owner |
| X-15 | External | Security review before public launch | P1 | NOT STARTED | — | — | — | — | — |
| D-01 | Deferred | Public booking link, transfers, integrations marketplace, self-serve Stripe, analytics, knowledge base, API keys, multi-assistant, multi-user, SMS expansion | — | DEFERRED | — | — | — | — | — |
