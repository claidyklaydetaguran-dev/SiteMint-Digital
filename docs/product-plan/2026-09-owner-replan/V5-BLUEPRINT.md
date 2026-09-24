# SiteMint V5 — Brand and Product Program Blueprint

> Consolidated creative and engineering blueprint requested by the owner's amendment §19.
> Prepared 2026-09-04 by the primary session (Fable 5.1) from code on main `57ea6c8`
> (PR #30 merged), the recorded owner decisions, contrast measurements, the UI/UX Pro Max
> datasets, and read-only Magnific cost simulations. Nothing here is implemented yet.
> **Owner approval of this document starts the program.**

## 1a. SUPERSEDED 2026-09-05 — GLACIER MINT replaces System B

The owner rejected System B on visual review (too green across large surfaces). The applied
system is **Glacier Mint** (~60–65% blue influence, hues 185–200°), one coherent swap with
identical token names: mint-500 #32C5D2 · mint-400 #56D2CF · mint-600 #1FA9BC (decorative)
· mint-700 #0B7487 (links, 5.44:1 on white) · mint-100 #DFF7F7 · mist #EDF9FA · porcelain
#F8FCFC · text #173642 (12.8:1) · band/ops anchor #153E52 (blue-charcoal; mint on band
5.46:1, white on band 11.4:1) · slate #4A6472 (6.26:1) · hairline #CFE7EA · dark text
#E8F5F7 · dark muted #9FC2CC. Semantic amber/red/green unchanged. §1 below is kept as the
historical record of the rejected system.

## 1. Recommended mint palette (SUPERSEDED — historical)

Three candidate systems were built and measured (WCAG 2.1 contrast, `contrast.mjs`). All
three keep the hue between green and blue (mint ≈ 168°, aqua ≈ 176° on the colour wheel):

| System | Character | Contrast findings |
|---|---|---|
| A — owner starting tokens | `#2ED6B6` / `#45D8CF` / text `#0A3439` | body and deep text excellent (12–13:1), but the text-safe deep mint `#0F8F79` reaches only **4.02:1** on white, which fails AA for links and small labels; white text on the primary mint fails (1.84:1). |
| **B — mint-led, teal-anchored (recommended)** | `#25D0B0` / `#4FD9CF` / text `#0B3A3E` | every text role passes AA or AAA: deep text 12.4:1, slate 5.7:1, deep-mint links **4.92:1**, deep text on the mint button 6.35:1, mint on the dark section 6.35:1. Slightly lower saturation than A keeps "premium and calm" instead of "neon". |
| C — cooler aqua-forward | `#33D4C4` / `#5CDCDA` / text `#0B3540` | passes, but the extra cyan pulls the site back toward the blue/navy feel the owner rejected. |

**Decision: System B.** Reasons: it is the only candidate where the mint family can carry
links and small text on white without a fallback colour; its deep teal reads as SiteMint
rather than generic navy; it holds the "between green and blue" brief without drifting cyan;
it stays light-forward because surfaces are porcelain and mist, not tinted mint fields.

Rules that make it work: mint is never text on a light ground (decorative, fills, buttons
with deep text, rails, focus rings); deep mint is the link and label colour; ink is used only
for the homepage hero field, the Operations chrome, and a single dramatic band per long page;
no gradients beyond a 2-stop mint→aqua on the signal thread itself; amber stays reserved for
human-attention states; semantic red/green for status only.

## 2. Semantic design tokens (complete)

Implementation keeps the retheme-not-rewrite architecture: one new file
`artifacts/web-agency/src/styles/tokens-v5.css` (and the same file copied into helpdesk)
defines `--sm-*` semantic tokens, then remaps the existing primitive layers (`--v3-*` under
`.v4-shell`, `--v2-*` inside `.sd-app.sd-app`, the shadcn HSL variables inside
`.v2-dashboard-shell`) to them. Contract tests that pin literals in `v2-dashboard.css` and
`v3-*.css` stay true because those files are not edited.

```
/* brand */
--sm-mint-500: #25D0B0;  --sm-mint-400: #4FD9CF;  --sm-mint-600: #16B597;
--sm-mint-700: #0E7F6B;  /* text-safe mint: links, labels, chips */
--sm-mint-100: #E6F9F3;  --sm-mist-100: #EEFAF8;  --sm-porcelain: #F7FBF9;  --sm-white: #FFFFFF;
--sm-teal-900: #0B3A3E;  /* primary text */   --sm-ink-950: #0A2A2E;  /* hero field, ops chrome */
--sm-slate-600: #526B70; /* secondary text */ --sm-slate-300: #B9CBCE; /* hairlines on dark */
--sm-line: #D7E7E3;      --sm-line-strong: #B5D2CB;
--sm-amber-600: #B45309; --sm-amber-100: #FFF4DE;   /* human attention only */
--sm-red-600: #B42318;   --sm-red-100: #FEE4E2;     /* errors */
--sm-green-700: #15803D; --sm-green-100: #DCFCE7;   /* success/status only, never brand */

/* semantic */
--sm-bg: var(--sm-porcelain); --sm-surface: var(--sm-white); --sm-surface-alt: var(--sm-mist-100);
--sm-surface-brand: var(--sm-mint-100); --sm-text: var(--sm-teal-900); --sm-text-muted: var(--sm-slate-600);
--sm-link: var(--sm-mint-700); --sm-accent: var(--sm-mint-500); --sm-accent-ink: var(--sm-teal-900);
--sm-focus: 0 0 0 3px color-mix(in oklab, var(--sm-mint-500) 45%, transparent);
--sm-dark-bg: var(--sm-ink-950); --sm-dark-text: #E9F7F3; --sm-dark-muted: #9FC3BC; --sm-dark-accent: var(--sm-mint-500);

/* shape, depth, type, motion */
--sm-radius-s: 6px; --sm-radius-m: 10px; --sm-radius-l: 16px; --sm-radius-pill: 999px;
--sm-shadow-1: 0 1px 2px rgb(11 58 62 / .06), 0 6px 20px rgb(11 58 62 / .06);
--sm-shadow-2: 0 2px 6px rgb(11 58 62 / .08), 0 16px 40px rgb(11 58 62 / .10);
--sm-font-display: "Space Grotesk"; --sm-font-body: "DM Sans"; --sm-font-mono: "JetBrains Mono"; --sm-font-editorial: "Newsreader";
--sm-scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 / 64 (px, 1.25 ratio above 18);
--sm-space: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128;
--sm-dur-fast: 160ms; --sm-dur-base: 240ms; --sm-dur-slow: 420ms; --sm-dur-scene: 700ms;
--sm-ease: cubic-bezier(.2,.7,.2,1); --sm-ease-out: cubic-bezier(.16,1,.3,1);
--sm-stagger: 60ms; --sm-rise: 16px; --sm-threshold: 0.35;
```

Typography stays the approved D5 system (Space Grotesk display, DM Sans body, JetBrains Mono
data, Newsreader italic for editorial pull lines) — already installed via @fontsource, so
no bundle change. Dark mode: the customer app keeps its three-way appearance control; the
public site is light-only with the two ink bands.

## 3. Brand hygiene

- Remove the visible kicker `SiteMint Digital · Signal` from `HomeV4.tsx:405`, any `<title>`/meta, and the receptionist page eyebrow; component and file names (`SignalJourneyV4`, `SignalGlyphsV4`, evidence directories) stay.
- Public brand line: "Capture. Organize. Connect. Resolve."
- "From first click to booked customer" survives only on lead-generation contexts (Discovery Systems, AI Receptionist spotlight).

## 4. Homepage wireframe (15 sections, one continuous signal)

| # | Section | Content (real, new information each time) | Signature / motion |
|---|---|---|---|
| 1 | Hero | H1 "Digital systems built to move your business forward." + supporting copy + brand line; CTAs "Build Your SiteMint System" / "Explore What We Build". Full-field particle canvas kept; bottom sequence Capture · Organize · Connect · Resolve kept | the existing five-phase field is re-scored to the six-step signal story (§6); ink-950 band with mint particles; video layer optional (§7) |
| 2 | What SiteMint builds | four service categories with one-line outcomes + "custom software engineering" and "AI-assisted development" as explicit capabilities | staggered headline reveal; no cards — a typographic ledger |
| 3 | Connected-system explanation | interactive diagram: website → capture → CRM record → automation → AI conversation/workflow → resolved outcome; hovering/tapping a stage explains it | scroll-linked inquiry dot travelling the thread |
| 4 | Websites & Web Apps | what a SiteMint site does after the click (forms, tracking, hand-off) | layered browser/device frames |
| 5 | CRM & internal systems | pipeline, tasks, records, what the owner sees | dense-but-controlled record mock (labelled "illustration") |
| 6 | AI Systems & Automation | evaluation, routing, follow-up, drafting; where AI is allowed to act | connected node sequence |
| 7 | AI Receptionist spotlight | product summary, "Private beta — invite only", link to `/ai-receptionist` | waveform ring (reused theater object) |
| 8 | Discovery & lead capture | the structured intake and what the client receives | progressive form illustration |
| 9 | Selected work / capability demonstrations | the three compositions with Available now / Private beta / In development labels | editorial composition |
| 10 | How SiteMint works | Discover · Design · Build · Validate · Launch & Improve with outputs | horizontal timeline |
| 11 | Pricing estimates | three tiers, disclaimer, "configure scope" link | structured comparison |
| 12 | Why SiteMint | connected systems, AI-assisted development, honesty about capability, small senior team | plain statements |
| 13 | Team | three names and roles, portraits only if approved | editorial |
| 14 | FAQ | scope, timelines, ownership, AI usage, receptionist beta | accordion |
| 15 | Final CTA | "Build Your SiteMint System" | quiet band |

## 5. Interaction signatures (per page)

| Page | Signature | Mechanism |
|---|---|---|
| Homepage | living mint signal, particles, connected-system story | existing canvas (`HomeV4`), re-scored |
| `/services` | interactive systems map | SVG map; click/keyboard selects a stage; anchors |
| `/websites-apps` | layered browser/device presentations | CSS 3D stack, scroll-parallaxed within one section |
| `/discovery-systems` | progressive intake and data-flow story | stepper that advances on scroll |
| `/ai-systems` | connected node/workflow sequence | node graph drawing in on view |
| `/work` | editorial project compositions | asymmetric grid, pull lines in Newsreader italic |
| `/process` | scroll-driven project timeline | pinned-free timeline (no scroll-jacking) |
| `/about` | human editorial/team storytelling | portrait + statement rhythm |
| `/pricing` | structured comparison + scope configurator | client-side configurator that composes a scope summary |
| `/ai-receptionist` | live waveform, call theater, appointment journey | canvas ring + simulated conversation + calendar journey |
| Customer dashboard | status, next action, operational control | attention-first Overview |
| Operations CRM | command-center visibility | dense tables with one primary action |

Each signature is one component per page, animates only on its own section, and has a
static final state for reduced motion.

## 6. Homepage visual-story storyboard (10 frames, 10 s loop)

Creative treatment: a single luminous mint signal moving through a calm, near-monochrome
teal-ink space; no people, no screens, no text — the objects are abstract but legible
(a form field, a record card, a routing junction, a waveform, a calendar slot).

| Frame | Time | What happens | Prompt direction (Magnific / Seedance) |
|---|---|---|---|
| 1 | 0.0 s | scattered amber-white points drifting (unanswered inquiries) | "soft particles suspended in deep teal haze, shallow depth of field, cinematic, no text" |
| 2 | 1.0 s | a thin mint thread appears from a glass-like input field | "a single glowing mint line emerging from a minimal glass panel" |
| 3 | 2.0 s | the thread captures points; they align along it | "points snapping onto a luminous line, orderly" |
| 4 | 3.2 s | aligned points fold into a translucent record card | "translucent card materialising from aligned light points" |
| 5 | 4.4 s | the card enters a junction; branches evaluate and one lights | "light routing through a three-way junction, one path brightening" |
| 6 | 5.6 s | a soft concentric waveform pulses (AI conversation) | "concentric mint rings pulsing, calm" |
| 7 | 6.8 s | the ring resolves into a calendar slot filling mint | "a rectangular slot filling with mint light" |
| 8 | 8.0 s | the slot dims to a completed mark; a new point appears far left | "resolved mark, then a faint new spark" |
| 9 | 9.0 s | camera drifts back to frame 1 composition | seamless loop |
| 10 | 10 s | loop point | — |

Crops: desktop 21:9 (2560×1097), mobile 9:16 cut from the centre third; poster = frame 7;
reduced motion = poster only; performance = poster first, video loaded after LCP and only
≥ 768 px, ≤ 1.2 MB (AV1/H.264 at 1080p, 24 fps), muted, `playsinline`, decode off-thread.

## 7. Video production facts (read-only, measured 2026-09-04)

Magnific's connected tool **does** generate video. Exact simulated costs for one 10-second
take: Seedance 2.0 Pro 21:9 1080p **7,000 credits**; Seedance 2.0 Mini 21:9 720p **1,400**;
Kling 2.5 16:9 1080p **650** (no 21:9; keyframe start/end supported). Image keyframes ≈ 100
credits each (auto mode, variable). Outputs are MP4; commercial-use posture follows the
Magnific/Freepik plan terms (to be confirmed in the account, the MCP balance call returned
"unable to resolve wallet"). Recommendation: storyboard first (this document), then
2–3 Kling 2.5 or Seedance Mini drafts (≤ 4,200 credits total) before any Pro master; no
spend without authorisation.

## 8. AI Receptionist landing-page wireframe (17 sections) and hero storyboard

Sections: cinematic AI-call hero → call theater (simulated, labelled) → Try the AI → what it
does → appointment and calendar journey → caller-experience examples → business-owner
dashboard → voice and prompt configuration → calls, contacts, outcomes → safe-failure
behaviour → privacy and retention → supported business use cases → setup process (six
steps) → private-beta posture → FAQ → Request Beta Access → Existing client sign-in.

Hero storyboard (8 s): (1) an incoming-call glyph pulses on a quiet mint field → (2) the ring
answers, waveform begins → (3) a business-rules card slides beside the ring (hours, services)
→ (4) availability grid appears; one slot highlights → (5) confirmation tick → (6) the outcome
card lands in a dashboard row → (7) a tasteful hand-and-phone still, out of focus, 0.6 s →
(8) loop. Product behaviour stays the subject; no call-centre stock.

## 9. Pricing presentation and honesty check

Three tiers on a rebuilt `/pricing` in the V5 system, plus a homepage estimate section:

| Tier | From | Inclusions (approved list) | Honesty check against the repository |
|---|---|---|---|
| Starter Site System | $2,995 | strategy & discovery; responsive website; core pages; lead/contact capture; foundational SEO; analytics setup; launch support | deliverable today. "Lead/contact capture" depends on the repaired Discovery/contact submission (PR-2); "analytics setup" = third-party analytics configuration (no SiteMint analytics product exists) — say so. |
| Growth Digital System | $5,995 | advanced website or web app; custom conversion journey; CRM or workflow connection; automation; expanded analytics; training + launch support | deliverable; "CRM connection" = SiteMint-built or client CRM, both real work. |
| Custom Connected System | $9,995 | custom web application; CRM/internal operations system; AI-assisted workflow; multiple integrations; advanced permissions/dashboards; implementation planning; testing + deployment support | deliverable as scoped engineering; **"AI-assisted workflow" must not imply the AI Receptionist is included** — link to its private-beta posture. |

Conflicts found: the repository carries two Starter page counts ("~5" vs "Up to 15") — publish
no page count; the V2 tier named "Premium" becomes "Custom Connected System"; the V2 "Custom /
scoped after discovery" tier folds into the configurator ("Need something else? Configure
your scope"). Mandatory line: "Starting estimates. Final pricing depends on scope, integrations,
content, timeline, and ongoing support requirements." AI Receptionist pricing is not shown.

## 10. "Try the AI" architecture and cost boundaries

**Mode 1 — Interactive Preview (default, zero marginal cost).** Client-only: curated branches
about SiteMint, services, the receptionist, setup, use cases, beta access; waveform ring; text
+ optional local TTS-free display; label "Interactive Preview — simulated. No live call."

**Mode 2 — Controlled live demo (after certification).** New backend route
`POST /api/public/demo/session` (rate-limited by IP + signed visitor cookie, one session per
24 h, concurrency cap 3, daily cap in dollars from env, kill switch flag
`PUBLIC_DEMO_ENABLED`), returning a short-lived Vapi web-call token for a **SiteMint-owned demo
assistant** (no customer data, `artifactPlan` disabled, tools = none, system prompt limited to
public facts, refuses sensitive data, self-identifies as AI). Browser uses the Vapi web SDK
with `VITE_VAPI_PUBLIC_KEY` **in the web-agency bundle for the first time** — the built-output
boundary scan must be extended to web-agency with an allowlist for exactly that key. 60–90 s
hard stop with visible countdown; metadata-only logging (session id, duration, outcome
class); honest "demo unavailable" fallback.

Preliminary cost boundary (to be replaced by measured rates before activation): public
list prices for a Vapi web call are roughly $0.05/min platform plus model, speech-to-text and
voice provider charges, commonly landing between $0.10 and $0.20 per minute all-in. At a
90-second cap that is ≤ $0.30 per session; a $10 daily cap therefore allows ~30–35 sessions.
Not advertised until the browser call is certified end to end.

## 11. Global motion specification

Tokens in §2. Rules: (1) animate opacity and transform only; (2) headline reveal = word-group
clip-rise 420 ms, stagger 60 ms; (3) supporting copy = one group, 240 ms, 16 px rise; (4) at
most two animated groups per viewport; (5) IntersectionObserver threshold 0.35, once; (6)
diagrams may scroll-link progress but never scroll-jack; (7) no animation on the LCP element;
(8) `prefers-reduced-motion: reduce` renders the final state immediately (existing pattern);
(9) budget: CLS 0.000 (already enforced), main-thread animation work < 4 ms/frame, no
animation library beyond the installed framer-motion (D7 holds). Implementation: a single
`useRevealV5()` hook + `<Reveal>` wrapper in `components/v5/`.

## 12. Scroll-to-top routing specification

wouter has no scroll restoration. Add `RouteScrollManager` in `PublicShell`, `AuthShell`,
`DashboardShell` (web-agency) and `AppShell` (helpdesk): on `location` change, if the URL has
no hash → `window.scrollTo({top:0, behavior:"auto"})` before paint (`useLayoutEffect`), and
move focus to `#main-content`; if a hash is present → defer to the existing `useHashScrollV4`
anchor logic; on browser back/forward use `history.state.scrollY` saved on scroll (restore
only for POP navigations). Tests (CDP): route change from a scrolled page lands at 0; anchor
click lands on the section; back restores; mobile sheet link lands at 0; keyboard Enter on a
nav link lands at 0; reduced motion unaffected; refresh keeps the browser's own position.

## 13. Claude skills and MCP inventory (as seen by this session)

Installed skills: `ui-ux-pro-max` plugin (ui-ux-pro-max, design, design-system, ui-styling,
banner-design, brand, slides), `frontend-design`, `artifact-design`, `artifact-diagramming`,
`dataviz`, `design` canvas, `webapp-testing` (Playwright), `code-review`, `simplify`,
`security-review`, doc/pptx/xlsx/pdf skills, plus the product-management, engineering and
design skill packs. **UI/UX Pro Max is callable** (its `search.py` runs through WSL python3;
palette, style, ux and typography datasets answered this session). **Magnific is callable**
and exposes: image generation/variations/upscale/relight/expand/retouch/SVG, video generate
/ upscale / HDR / speak / dubbing / concatenate, TTS/music/SFX, 3D, folders, cost simulation.
Video generation: yes (Seedance 2.0 Pro/Fast/Mini, Kling 2.5). Not needed: no new skill for
React, tokens, CSS/animation, accessibility, routing, Playwright or planning. Would need a
connection later: voice-sample assets (owner-supplied or TTS with a licence check), and a
CDN/hosting for the hero videos. Separate charges: Magnific credits, Vapi/speech/voice
minutes for the live demo, Replit compute when staging resumes. MCP servers requiring
authorisation (Notion, GitHub plugin, Canva, etc.) are not required for this program.

## 14. Implementation PR boundaries and sequence

| PR | Workstream | Files (owners) | Depends on |
|---|---|---|---|
| PR-1 tokens, motion, routing | A | `styles/tokens-v5.css` (both apps), primitive remaps, `components/v5/Reveal`, `RouteScrollManager` in all shells, contract test `v5FoundationContract` | — |
| PR-2 website integrity + homepage | A | `HomeV4`→`HomeV5` sections, kicker removal, copy fixes (`WorkV3`, `AboutV3` + team), Discovery submission (`DiscoveryPage`, `signup`-style contract), `/contact` + vertical redirects, 404, nav (panel, mobile group), `/automation`→`/ai-systems` | PR-1 |
| PR-3 pricing + services | A | `PricingV5`, configurator, `ServicesV3` anchors/systems map, active-nav fix | PR-1 |
| PR-4 AI Receptionist page + preview | B | `AiReceptionistV5`, route-aware header actions, Interactive Preview branches, use-cases section, beta request form (backend route `POST /api/public/beta-requests`, flag-gated, in routeSecurity manifest) | PR-1 |
| PR-5 customer shell, auth, onboarding | B/C | helpdesk nav (`nav.ts`, `routes.ts`), breadcrumbs, rail scroll, Overview, invite signup, password reset UI, onboarding hub + **migration `voice_onboarding_states` (owner approval)** | PR-1 |
| PR-6 assistant setup | B | one-assistant card, structured prompt + previews, voice samples, Test/Publish controls | PR-5 |
| PR-7 scheduling | B | unbundle availability, Calendar screen, appointment lifecycle + drawer, Test Booking | PR-5 |
| PR-8 calls, contacts, number, usage, issues | B | Calls, Contacts (route `GET /receptionist/contacts` + page), Phone Number page + guarded inventory insert, Usage, Issues | PR-5 |
| PR-9 Receptionist Ops + secure admin auth | C | `adminFetch`, route guard, breadcrumbs, single scroll, Receptionist Ops screens, admin issues route, **migration `crm_admin_sessions` (owner approval)**, canonical statuses | — (parallel) |
| PR-10 responsive Ops + cleanup | C | essential mobile views, dead-code removal, nav cleanup | PR-9 |

Preview checkpoints: after PR-1 (tokens on the current site), after PR-2/3 (website), after
PR-4 (product page), after PR-5–8 (dashboard mode B), after PR-9/10 (CRM mode B). Each PR
runs the full gate set; each is reviewed by the primary session before merge authorisation.

## 15. Parallel-agent ownership map

| Agent | Owns | Never touches |
|---|---|---|
| Brand & Design-System Lead | tokens-v5, primitive remaps, Reveal, focus/radius/shadow audit | page copy, backend |
| Homepage & Motion Lead | HomeV5 sections, storyboards, scroll manager tests | tokens, dashboard |
| AI Receptionist Product Lead | AiReceptionistV5, preview branches, beta-request route, demo architecture | dashboard shell, CRM |
| Customer Dashboard Lead | helpdesk nav/shell/pages, onboarding, scheduling UI, calls/contacts/usage | web-agency, CRM |
| Operations CRM Lead | CRM shell, Receptionist Ops, admin auth, statuses | helpdesk, public pages |
| Backend Contract & Security Reviewer | new routes, migrations, routeSecurity manifest, flags, scans | UI |
| Accessibility, Performance & Test Lead | sweeps, keyboard, reduced motion, LCP, contract suites | product code |
| Documentation & Release Reconciler | ledger, workbook, checklists, PR descriptions | product code |

Shared files with a single owner: `routes.ts`/`nav.ts` (Dashboard Lead), `App.tsx` of each
app (Brand Lead for shells, page leads for routes via reviewed patches), `routeSecurity.manifest.ts`
(Backend Reviewer). All agents work in isolated worktrees; nothing deploys, activates, spends
or writes production data; every change returns through the primary session; this file and
the workbook are the master decision ledger.

## 16. File and route impact map (summary)

Public: `HomeV4.tsx` (superseded by `HomeV5.tsx`), `SiteHeaderV4/SiteFooterV4/publicNavV4`,
`ServicesV3`, `AutomationV3`→`AiSystemsV5`, `WorkV3`, `AboutV3`, `ProcessV3`, `StartV3` (+contact
section), `DiscoveryPage` + `PlatformDiscoveryShell` (submission), new `PricingV5`,
`AiReceptionistV5`, `NotFoundV5`; removed from the graph: V2 preview pages, `LandingLawyers`,
`LandingRealtors`, nine dead lazy imports. Helpdesk: `nav.ts`, `routes.ts`, `AppShell`,
`Overview`, new `Setup`, `Calendar`, `Calls`, `Contacts`, `PhoneNumber`, `Usage`, `Issues`,
builder tabs, appointments drawer, contracts updated in step. API (additive only):
`publicBetaRequests`, `publicDemo` (later), `receptionistContacts`, `receptionistOnboarding`,
`adminVoiceIssues`, `adminSessions`; two migrations; manifest entries. Protected files: none.

## 17. Performance strategy

Poster-first media; video only ≥ 768 px after LCP; fonts already metric-matched; Reveal uses
transform/opacity; homepage sections lazy-mount below the fold; keep entry JS growth ≤ 5 %
per app (measured against the R1 baseline); realistic-server Lighthouse 3-run medians on every
checkpoint; target mobile LCP ≤ 2.5 s (prerender remains a hosting-config decision).

## 18. Genuine technical conflicts with the decisions (code evidence)

1. **Pricing:** W-13 (remove) vs amendment §10 (restore) — resolved in favour of the amendment; the page is rebuilt, not the V2 one.
2. **AI Receptionist page without "Start a Project":** the shared V4 header always renders the company CTA. Needs a route-aware header (PR-4), not a per-page hack.
3. **Live demo needs a Vapi public key in the marketing bundle** and a new public route; today the key only reaches the helpdesk build and the built-output scan only covers helpdesk. Both must be extended deliberately (PR-4/backend reviewer).
4. **Persistent onboarding and secure admin sessions need schema changes** — additive, but CLAUDE.md requires owner approval for any migration; flagged in the checklist.
5. **Invite-only signup:** `voice_account_tokens` has purpose and shape CHECK constraints; an `invite` purpose may require a migration or reuse of the membership-invitation path — to be decided in PR-5 design.
6. **Scroll-to-top** does not exist in wouter; it is new shell code in both apps (§12).
7. **Voice samples** require audio assets; none exist in the repository and generating them has a cost/licence question — owner to supply or approve TTS.
8. **Hero video** conflicts with the mobile LCP target unless poster-first and desktop-only; §17 makes that a hard rule.
9. **"Try the AI" live mode** cannot ship before the browser-call certification that AR-002C could not complete; the simulated preview is the only launchable mode until then.
