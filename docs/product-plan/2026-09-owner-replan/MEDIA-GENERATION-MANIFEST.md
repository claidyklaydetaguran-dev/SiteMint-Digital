# Media Generation Manifest (2026-09-05)

> Owner directive §9: media containers, placeholders and storyboards are NOT media. This
> manifest lists every proposed generated asset with simulated Magnific costs (read-only
> `simulate_cost`, measured 2026-09-04/05) and ends with ONE consolidated budget
> recommendation. **Nothing here is generated yet; no credits have been spent.**
> Every simulated video cost is exact; image costs in auto mode are variable (~100).
> Commercial-use posture: outputs follow the Magnific/Freepik plan licence — confirm the
> plan tier in the account before generation (the MCP balance call errors:
> "unable to resolve wallet", so the tier could not be read from here).

Current media status, stated plainly: **0 generated · 11 placeholders/containers live ·
2 storyboards written (homepage 10-frame, receptionist 8-frame) · everything below is
waiting for budget · nothing is optional-complete.**

## A. Required for initial visual completion (stop sections looking empty)

| ID | Page · section | Purpose | Type | Size / AR | Use | Prompt direction | Model | Tries | Cost/try | Max ask | Perf target | Fallback | Licence | Blocks owner approval? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG-01 | Home · hero poster | The poster behind/instead of the hero video: Glacier-mint signal field, abstract, no text | image | 2560×1097 (21:9) + centre-crop 9:16 | desktop+mobile | "luminous blue-mint signal thread through deep blue-charcoal space (#153E52), scattered light points aligning, cinematic, abstract, no text, no people" | Seedream (auto) | 3 | ~100 | 300 | ≤200 KB webp | current CSS field stays | plan licence | Yes (A-06) |
| IMG-02 | Home · Websites & Web Apps | Layered device composition backdrop (browser frames stay CSS; this is the ambient surface) | image | 1600×1000 | desktop, hidden <768 | "minimal glass browser windows layered over cool porcelain, blue-mint accents, soft depth, no text" | Seedream (auto) | 2 | ~100 | 200 | ≤150 KB | CSS-only frames | plan licence | Yes |
| IMG-03 | Home · CRM & internal systems | Abstract record-card illustration (labelled "Illustration") | image | 1400×900 | desktop+mobile | "translucent record cards in an orderly grid, one highlighted in blue-mint, dark blue-charcoal field, no readable text" | Seedream (auto) | 2 | ~100 | 200 | ≤150 KB | current CSS mock | plan licence | Yes |
| IMG-04 | Home · AI Systems & Automation | Node/workflow visual | image | 1400×900 | both | "glowing junction of routed light paths, one branch brightening, blue-mint on blue-charcoal, abstract" | Seedream (auto) | 2 | ~100 | 200 | ≤150 KB | CSS node sequence | plan licence | Yes |
| IMG-05 | AI Receptionist · hero poster | Call-hero poster (ring + rules card + calendar slot metaphor) | image | 2560×1440 (16:9) + 9:16 crop | both | "concentric blue-mint rings pulsing beside a minimal availability grid, one slot lit, dark field, abstract, no text" | Seedream (auto) | 3 | ~100 | 300 | ≤200 KB | current inline SVG | plan licence | Yes |
| IMG-06 | Work · three compositions | One editorial visual per composition (clinic / trade / practice), abstract-systems style, clearly not client work | image ×3 | 1200×900 each | both | per-composition system diagrams in the Glacier palette, abstract, honest "representative composition" captions kept | Seedream (auto) | 4 | ~100 | 400 | ≤120 KB each | current typographic layout | plan licence | Yes |
| IMG-07 | Company · workspace texture | One restrained studio texture band (not stock people) | image | 2000×800 | desktop | "quiet workspace desk from above, cool light, blue-mint accent objects, shallow depth, no faces" | Seedream (auto) | 2 | ~100 | 200 | ≤150 KB | plain band | plan licence | No (defer OK) |

Subtotal A: max ask **1,900 credits** (image auto-mode is variable; treat as ceiling).

## B. Required before company-website publication (carry the brand story)

| ID | Page · section | Purpose | Type | Size / AR | Use | Prompt / storyboard | Model | Tries | Cost/try | Max ask | Perf target | Fallback | Licence | Blocks? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| VID-01 | Home · hero loop | The 10-frame connected-signal loop (V5-BLUEPRINT §6, re-graded to Glacier) | video 10 s loop | 21:9 1080p | desktop ≥768 only; poster on mobile | storyboard §6 with Glacier palette notes | **Kling 2.5** first (16:9, centre-safe framing) → Seedance Pro only if Kling fails twice | 2 drafts + 1 final | Kling 650 / Seedance Pro 7,000 | **1,950** (Kling ×3) — escalation to Pro only with a separate ask | ≤1.2 MB H.264+AV1, load after LCP | IMG-01 poster | plan licence | Publication-blocking, not preview-blocking |
| VID-02 | AI Receptionist · hero loop | 8-frame call-answer loop (§8 storyboard) | video 8 s loop | 16:9 1080p | desktop only | storyboard §8, Glacier grade, no call-centre stock | Kling 2.5 | 2 drafts + 1 final | 650 | **1,950** | ≤1 MB | IMG-05 poster | plan licence | Publication-blocking |

Subtotal B: max ask **3,900 credits** (Kling path). Seedance-Pro escalation would be +7,000 per take and is NOT requested now.

## C. Optional post-launch enhancement

| ID | Purpose | Type | Model | Max ask | Blocks? |
|---|---|---|---|---|---|
| OPT-01 | Process page — five phase vignettes | image ×5 | Seedream auto | 500 | No |
| OPT-02 | Pricing — three tier emblems | image ×3 | Seedream auto | 300 | No |
| OPT-03 | 404 — broken-thread illustration | image | Seedream auto | 100 | No |
| OPT-04 | Receptionist use-cases — six small industry vignettes | image ×6 | Seedream auto | 600 | No |
| OPT-05 | Seedance Mini 720p variant of VID-01 for tablet | video | Seedance Mini | 1,400 | No |

## A2. People, context, and interface imagery (added per 2026-09-05 directive §12)

> The owner asked for “people actively doing the work”, product/interface imagery,
> contextual backgrounds, and team imagery. Honesty constraints: generated people are
> **illustrative workplace scenes**, never captioned as SiteMint staff or clients; real
> team imagery must be actual photographs supplied by the owner — we will not generate
> fake “team” photos. Interface imagery costs zero credits: we capture the real product.

| ID | Purpose | Type | Size / AR | Use | Prompt direction | Model | Tries | Max ask | Fallback | Blocks? |
|---|---|---|---|---|---|---|---|---|---|---|
| IMG-08 | Work-in-motion editorial set — 3 scenes (front-desk answering a call, owner reviewing a project brief on screen, tradesperson confirming an appointment on mobile) | image ×3 | 1600×1067 | Home, Services, Work | “candid over-shoulder workplace scene, cool natural light, blue-mint accent tones, shallow depth, faces soft/averted, no readable text” | Seedream (auto) | 5 | 500 | current CSS compositions | Publication-nice, not preview-blocking |
| IMG-09 | Contextual background set — 4 quiet ambient surfaces (desk texture, glass reflection, soft architecture, cool gradient atmosphere) | image ×4 | 2400×1200 | section backdrops site-wide | “minimal ambient background, porcelain-to-mint gradient light, out-of-focus, no subjects, no text” | Seedream (auto) | 5 | 500 | flat token backgrounds | No |
| IMG-10 | Product/interface imagery — real dashboard, scheduling, calls and ops screens framed in device/browser chrome | capture ×6+ | native | Home, Receptionist, Services | **0 credits** — captured from the owner preview (synthetic data labeled), composed in CSS device frames | — | — | 0 | already partly live | No |
| IMG-11 | Team imagery | photo | — | Company | **not generated** — requires real photographs from the owner; page ships with the workspace texture (IMG-07) until supplied | — | — | 0 | IMG-07 band | Company-page polish only |

Subtotal A2: max ask **1,000 credits** (all images; interface + team cost nothing).

## Consolidated recommendation (one option)

**Approve 6,800 credits total, spent in three gated tranches:**

1. **Tranche 1 — 1,900 credits (section A images)**: the seven core visuals that stop sections looking empty. Generate first, install, verify in the preview.
2. **Tranche 1b — 1,000 credits (section A2 people + backgrounds)**: the work-in-motion set and ambient backdrops. Approve together with Tranche 1 or after seeing it — they share the same look decision. Interface captures (IMG-10) and team imagery (IMG-11) cost nothing and are handled in-build.
3. **Tranche 2 — 3,900 credits (both hero loops on Kling 2.5)**: the homepage connected-system loop (VID-01) and the receptionist call-journey loop (VID-02), 2 drafts + 1 final each. Only after you approve the Tranche-1 look; Seedance-Pro escalation (+7,000/take) stays a separate explicit ask.

Why this is the best value: images run ~100 credits/try with retries priced in; Kling 2.5 at 650/take is 10.8× cheaper than Seedance Pro and both loops sit behind poster-first loading, so Kling quality is sufficient at render size. Everything ships with fallbacks today — deferring any tranche breaks nothing. Licensing: Magnific/Freepik plan licence (verify plan tier in the account UI; the API balance call cannot read it). Performance treatment: webp ≤200KB posters, H.264+AV1 ≤1.2MB loops, loaded after LCP, poster-first on mobile, `prefers-reduced-motion` shows posters only.

**Media is complete only when generated assets are installed in the real pages and verified in the preview (G-15), not when files exist.**
