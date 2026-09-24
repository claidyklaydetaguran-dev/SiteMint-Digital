# Owner Recommendations — interactivity, unique UI, and features (2026-09-05)

> Requested in the 2026-09-05 voice note ("give me suggestions and recommendations of what
> to add, fix, transitions, unique UI, and features"). Everything here is costed as build
> effort only — nothing requires paid media, new dependencies, providers, or deployment.
> Items marked **[doing now]** are already in the current pass (checklist A-12/A-13).
> Everything else awaits your pick. Honesty rules apply throughout: no fabricated numbers,
> no fake client results, simulated demos always labeled.

## 1. Transitions and motion

| # | Idea | Where | Effort | Note |
|---|---|---|---|---|
| T1 | **[doing now]** Staggered scroll reveals (heading → lede → cards), container hover lifts, button/link micro-interactions | every public page | — | reduced-motion safe |
| T2 | **Signal thread**: one thin animated line that travels down the homepage connecting every section — the particle hero's thread continues as a scroll-progress SVG path. A brand device nobody else has. | home | M | static line under reduced motion |
| T3 | **Journey lighting**: the Capture → Organize → Connect → Resolve labels light up in the hero HUD as the visitor scrolls past the matching sections | home | S | pairs with T2 |
| T4 | **View Transitions API** page morphs: brand mark and page title morph between routes in Chromium, instant fallback elsewhere. Zero dependencies. | site-wide | M | progressive enhancement |
| T5 | Pointer-follow tilt (≤4°) on pricing tiers and hero CTA, desktop only | pricing, home | S | off for reduced motion / touch |
| T6 | **Section seams**: overlapping rounded panels + gradient seams at every dark↔light band handoff, so sections hand off instead of butting | home, receptionist | S | partially in current pass |
| T7 | Sticky section-progress rail (dots) on the receptionist page — doubles as in-page nav so the header stays calm | receptionist | S | complements A-13 |

## 2. Unique UI

| # | Idea | Where | Effort | Note |
|---|---|---|---|---|
| U1 | **System map as the brand motif**: the interactive services node-map becomes the shared visual language — the same node/edge figure appears on home, services, and CRM sections with the relevant node lit. Makes "connected systems" tangible. | home, services | M | map already exists on /services |
| U2 | **Call theater upgrades**: scripted waveform + typed transcript with role tags in the simulated demo; the same container later flips to the live demo once certified — visitors see the exact surface that will go live | receptionist | M | keeps the "simulated" badge |
| U3 | **Scope brief hand-off**: pricing configurator gains "copy my scope brief" and pre-fills the discovery form via URL params — configurator → discovery in one click | pricing → discovery | M | real feature, no backend |
| U4 | Before/after **transformation slider** on Work compositions ("typical site" ⇄ "SiteMint system"), honestly captioned as representative | work | M | no client claims |
| U5 | **Cmd+K quick-nav** over pages and sections — a product-grade touch marketing sites never have; signals that SiteMint builds software, not brochures | site-wide | S | client-side list only |
| U6 | "Two rings" demonstrator: animation contrasting the receptionist's pickup vs. a ringing-out call, labeled as an illustration | receptionist | S | synthetic, labeled |

## 3. Features

| # | Idea | Effort | Note |
|---|---|---|---|
| F1 | **Missed-call ROI calculator**: visitor enters calls/week and value per job → recovered-revenue estimate, all math client-side and shown transparently | M | no invented benchmarks; formula displayed |
| F2 | Launch-notification email capture on every "not available yet" surface (mode-A beta form, live demo placeholder) — dead ends become a list | S | needs one tiny backend route later |
| F3 | Read-only **scheduling preview widget** on the receptionist page showing the real availability/booking UI with fixture data, labeled synthetic | M | reuses dashboard components |
| F4 | Public **trust page**: what's live, what's in beta, data-handling summary in plain language — honesty as a differentiator | S | content only |
| F5 | Case-study template wired for the first beta client (calls answered, appointments booked) — build the layout now, publish only with real data | S | stays unpublished until real |

## 4. Fixes found during this pass (state)

- Fixed: product-header wrap **[A-13 in flight]**, hero field height, duplicate hero captions, muted-text contrast (3.37:1 → 6.26:1), button text washed to teal by a link rule (2.6:1 → dark ink), dark-band eyebrow contrast, missing link underlines, logo accessible name.
- Open, recommended next: **prerender/SSG for the public pages** — the single biggest performance lever; mobile LCP ~2.8–3.0 s is SPA-bootstrap-bound, and static HTML for `/`, `/services`, `/ai-receptionist`, `/pricing` would cut it well under 2.5 s. Medium effort, separate workstream.
- Open: whitespace inside the discovery form shell (component is currently outside the visual workstream's file list).

## 5. Suggested picks

If you want the highest impact for the least budget: **T2 + T3 + U1** (one connected brand motif across home and services), **U3** (configurator→discovery hand-off — it converts), and **F1** (ROI calculator — it's the receptionist pitch in one interaction). T4 and U5 are cheap delighters that photograph well in a portfolio — relevant since the site sells websites.
