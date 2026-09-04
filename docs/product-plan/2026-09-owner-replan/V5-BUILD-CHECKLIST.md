# V5 Build Checklist (frozen 2026-09-04, baseline)

> Statuses: NOT STARTED · IN PROGRESS · IMPLEMENTED — UNVERIFIED · VERIFIED COMPLETE · BLOCKED — OWNER · BLOCKED — EXTERNAL · DEFERRED.
> Weights for scoring: P0 = 5, P1 = 2, Deferred = excluded. An item is VERIFIED COMPLETE only when its tests and preview evidence pass. Updated after every integrated work block; the readiness numbers in PUBLISHABILITY-DASHBOARD.md are computed from this table by `scripts`-free script `readiness.mjs` in the session scratchpad (formula in the dashboard).
> Columns: ID · Workstream · Route/capability · Priority · Status · Commit · Evidence · Preview · Remaining · Blocker owner.

| ID | WS | Route / capability | Pri | Status | Commit | Evidence | Preview | Remaining | Blocker |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | Foundation | System B semantic tokens (`tokens-v5.css`, both apps) | P0 | IN PROGRESS | — | — | — | — | — |
| F-02 | Foundation | Public chrome / auth / ops primitive remap to mint (override-only) | P0 | IN PROGRESS | — | — | — | — | — |
| F-03 | Foundation | Helpdesk palette remap (light + dark appearance) | P0 | IN PROGRESS | — | — | — | — | — |
| F-04 | Foundation | Motion foundation (`Reveal`, reduced motion, budgets) | P1 | IN PROGRESS | — | — | — | — | — |
| F-05 | Foundation | Route scroll-to-top + anchor + back/forward manager (both apps) | P0 | IN PROGRESS | — | — | — | — | — |
| F-06 | Foundation | Foundation contract test in the scripts chain | P0 | IN PROGRESS | — | — | — | — | — |
| F-07 | Foundation | Accessibility foundations (focus ring token, no mint small text, amber/red reserved) | P0 | IN PROGRESS | — | — | — | — | — |
| W-01 | Website | "Signal" removed from public copy/titles/metadata | P0 | IN PROGRESS | — | — | — | — | — |
| W-02 | Website | Homepage hero copy + CTAs (amendment §6), particles + journey retained | P0 | IN PROGRESS | — | — | — | — | — |
| W-03 | Website | Homepage 15-section content architecture (§8), signatures, no card walls | P0 | IN PROGRESS | — | — | — | — | — |
| W-04 | Website | Nav: no duplicate receptionist card; mobile group "Explore"; active state on pillar pages | P0 | IN PROGRESS | — | — | — | — | — |
| W-05 | Website | `/services` anchors + interactive systems map | P1 | IN PROGRESS | — | — | — | — | — |
| W-06 | Website | `/automation` → `/ai-systems` (AI Systems & Automation incl. CRM section), redirect | P1 | IN PROGRESS | — | — | — | — | — |
| W-07 | Website | Truthful `/work` and `/about` copy; team section | P0 | IN PROGRESS | — | — | — | — | — |
| W-08 | Website | `/process` five real phases with outputs | P1 | IN PROGRESS | — | — | — | — | — |
| W-09 | Website | Discovery intake submits to backend with all states (flag stays off) | P0 | IN PROGRESS | — | — | — | — | — |
| W-10 | Website | `/contact` folded into `/start` (redirect); V2 preview pages removed | P0 | IN PROGRESS | — | — | — | — | — |
| W-11 | Website | Pricing rebuilt (three tiers, disclaimer, configurator, honesty check) | P1 | IN PROGRESS | — | — | — | — | — |
| W-12 | Website | On-brand 404 with five exits (public) | P0 | IN PROGRESS | — | — | — | — | — |
| W-13 | Website | Legacy verticals retired → `/ai-receptionist#use-cases` | P0 | IN PROGRESS | — | — | — | — | — |
| W-14 | Website | Video containers, poster/loading/reduced-motion/mobile fallback, labelled placeholders | P1 | IN PROGRESS | — | — | — | — | — |
| W-15 | Website | SEO/metadata (titles, descriptions, sitemap without retired routes) | P1 | IN PROGRESS | — | — | — | — | — |
| W-16 | Website | Privacy/Terms prepared for legal review | P1 | BLOCKED — OWNER | — | drafts exist | — | legal review | Owner |
| R-01 | Receptionist mkt | Product-only landing page, 17 sections, route-aware header (no Start a Project) | P0 | IN PROGRESS | — | — | — | — | — |
| R-02 | Receptionist mkt | Simulated Interactive Preview (curated branches, waveform, labelled) | P0 | IN PROGRESS | — | — | — | — | — |
| R-03 | Receptionist mkt | Request Beta Access form → `POST /api/public/beta-requests` (flag off) | P0 | IN PROGRESS | — | — | — | — | — |
| R-04 | Receptionist mkt | Use-cases section (verified ideas from retired verticals) | P1 | IN PROGRESS | — | — | — | — | — |
| R-05 | Receptionist mkt | Live-demo client path behind fail-closed flag; no key, no activation | P1 | IN PROGRESS | — | — | — | — | — |
| R-06 | Receptionist mkt | Hero video container + poster strategy (no paid media) | P1 | IN PROGRESS | — | — | — | — | — |
| C-01 | Customer app | Approved navigation (D-2), breadcrumbs, no nested rail scroll, capability states for every path | P0 | IN PROGRESS | — | — | — | — | — |
| C-02 | Customer app | Invite-only signup ("Set up your AI Receptionist", S-1 fields) | P0 | IN PROGRESS | — | — | — | — | — |
| C-03 | Customer app | Forgot password + reset UI | P0 | IN PROGRESS | — | — | — | — | — |
| C-04 | Customer app | Persistent 10-step onboarding hub (Setup) | P0 | IN PROGRESS | — | — | — | — | — |
| C-05 | Customer app | Overview redesign (D-1) | P0 | IN PROGRESS | — | — | — | — | — |
| C-06 | Customer app | One-assistant status card; hide create-another | P0 | IN PROGRESS | — | — | — | — | — |
| C-07 | Customer app | Configuration fields (C-2) from workspace settings | P0 | IN PROGRESS | — | — | — | — | — |
| C-08 | Customer app | Structured prompt + full-prompt preview + "how callers hear this"; Advanced | P0 | IN PROGRESS | — | — | — | — | — |
| C-09 | Customer app | Voice presets with sample player + provider-neutral asset adapter (no paid samples) | P0 | IN PROGRESS | — | — | — | — | — |
| C-10 | Customer app | Test / Publish controls with prerequisite states; "Save changes"/"Publish update" | P0 | IN PROGRESS | — | — | — | — | — |
| C-11 | Customer app | Availability + Appointment Types unbundled from voice flag; Advanced grouping | P0 | IN PROGRESS | — | — | — | — | — |
| C-12 | Customer app | Scheduling → Calendar screen (connect/status/reconnect/disconnect/post-OAuth) | P0 | IN PROGRESS | — | — | — | — | — |
| C-13 | Customer app | Appointment lifecycle UI (approve/reschedule/cancel/reconcile) + drawer + confirmations | P0 | IN PROGRESS | — | — | — | — | — |
| C-14 | Customer app | Test Booking safety (explicit create, labelled test) | P0 | IN PROGRESS | — | — | — | — | — |
| C-15 | Customer app | Calls (rename, statuses, retention explanation) | P0 | IN PROGRESS | — | — | — | — | — |
| C-16 | Customer app | Minimal Contacts page + detail | P0 | IN PROGRESS | — | — | — | — | — |
| C-17 | Customer app | Phone Number page (assigned/none/paused states; assign/pause over existing routes) | P0 | IN PROGRESS | — | — | — | — | — |
| C-18 | Customer app | Usage page + rail indicator + paused copy (U-1…U-3) | P0 | IN PROGRESS | — | — | — | — | — |
| C-19 | Customer app | Customer Issues page (safe failures) | P0 | IN PROGRESS | — | — | — | — | — |
| C-20 | Customer app | Settings editable fields (D-7); billing hides dead controls (D-6) | P1 | IN PROGRESS | — | — | — | — | — |
| C-21 | Customer app | Mobile drawer + tables→cards below 768 px | P1 | IN PROGRESS | — | — | — | — | — |
| C-22 | Customer app | Dead code removed (orphaned tabs/components) | P1 | IN PROGRESS | — | — | — | — | — |
| O-01 | Operations | Shared `adminFetch`, one 401 path, client-side guard, standard states | P0 | IN PROGRESS | — | — | — | — | — |
| O-02 | Operations | Secure admin sessions UI (cookie login/logout/me) | P0 | IN PROGRESS | — | — | — | — | — |
| O-03 | Operations | Breadcrumbs, single scroll region, in-layout 404 | P1 | IN PROGRESS | — | — | — | — | — |
| O-04 | Operations | Nav cleanup (Soon items, duplicate Lead DNA, one Command Center) | P1 | IN PROGRESS | — | — | — | — | — |
| O-05 | Operations | Receptionist Ops: Firms, Firm detail, Issues, Usage, Numbers | P0 | IN PROGRESS | — | — | — | — | — |
| O-06 | Operations | Command Center attention-first (O-2) | P1 | IN PROGRESS | — | — | — | — | — |
| O-07 | Operations | Canonical lead statuses + null-safety (O-3) | P1 | IN PROGRESS | — | — | — | — | — |
| O-08 | Operations | Lead detail simplification (O-4) | P1 | IN PROGRESS | — | — | — | — | — |
| O-09 | Operations | Essential responsive Ops views (M-3) | P1 | IN PROGRESS | — | — | — | — | — |
| B-01 | Backend | Admin cookie sessions + logout + me + audit (schema push-mode) | P0 | IN PROGRESS | — | — | — | — | — |
| B-02 | Backend | Onboarding state routes + `voice_onboarding_states` schema | P0 | IN PROGRESS | — | — | — | — | — |
| B-03 | Backend | Contacts read routes | P0 | IN PROGRESS | — | — | — | — | — |
| B-04 | Backend | Invite-only signup route + invites admin (flag off) | P0 | IN PROGRESS | — | — | — | — | — |
| B-05 | Backend | Public beta-request route + admin list (flag off) | P0 | IN PROGRESS | — | — | — | — | — |
| B-06 | Backend | Live-demo session seam, fail-closed, no provider | P1 | IN PROGRESS | — | — | — | — | — |
| B-07 | Backend | Admin voice issues / usage / numbers routes | P0 | IN PROGRESS | — | — | — | — | — |
| B-08 | Backend | Migration packet (0007 voice + push-mode CRM) tested on a disposable DB | P0 | IN PROGRESS | — | — | — | — | — |
| B-09 | Backend | Migrations applied externally | P0 | BLOCKED — OWNER | — | — | — | execution authorisation | Owner |
| V-01 | Verification | Typecheck + canonical suite + contract suites green on the integrated branch | P0 | NOT STARTED | — | — | — | — | — |
| V-02 | Verification | Production builds + voice matrix + built-output scans (incl. web-agency allowlist) | P0 | NOT STARTED | — | — | — | — | — |
| V-03 | Verification | Five-width sweep, zero overflow, nested-scroll = 0, console clean (all surfaces) | P0 | NOT STARTED | — | — | — | — | — |
| V-04 | Verification | Keyboard/focus/Escape + scroll-to-top/anchor/back tests | P0 | NOT STARTED | — | — | — | — | — |
| V-05 | Verification | Reduced motion + accessibility (Lighthouse a11y 100 on public pages) | P1 | NOT STARTED | — | — | — | — | — |
| V-06 | Verification | Performance vs R1 baseline (entry JS, LCP, CLS) | P1 | NOT STARTED | — | — | — | — | — |
| V-07 | Verification | Secret scan + protected-file 0-diff + route-security contract | P0 | NOT STARTED | — | — | — | — | — |
| V-08 | Verification | Unified owner preview index with synthetic-data labels, all states, mobile | P0 | NOT STARTED | — | — | — | — | — |
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
