# V4 "SiteMint Signal" — Design System

Status: proposed, awaiting owner approval. Phase: design/prototype only (no rebuild, no deploy).
Date: 2026-09-01. Branch: `design/sitemint-v4-signal-experience`.

---

## 1. Research evidence (UI/UX Pro Max)

Tool: `ui-ux-pro-max` plugin v2.13.0, installed at
`~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.13.0/`, queried via its documented
`scripts/search.py` (Python 3.12 under WSL; no Python on the Windows host). Raw outputs were kept
in the session scratchpad and deliberately **not** committed (third-party catalog data).

Design-system searches run (dials: marketing `--variance 8 --motion 7 --density 4`,
dashboard `--density 7`):

| # | Query | Pattern returned | Style returned | Type returned |
|---|-------|------------------|----------------|---------------|
| 1 | premium AI automation digital product studio | Product Demo + Features | Brutalism* | Inter/Inter |
| 2 | approachable high-end B2B technology SaaS | Hero + Features + CTA | Brutalism* | Plus Jakarta Sans |
| 3 | cinematic editorial SaaS marketing | Hero + Features + CTA | Brutalism* | Calistoga + Inter |
| 4 | asymmetric modern agency layout portfolio | **Scroll-Triggered Storytelling** | Brutalism* | Inter + Playfair |
| 5 | cyan turquoise digital signal tech identity | **Immersive/Interactive Experience** | Brutalism* | Exo + Roboto Mono |
| 6 | operational dashboard monitoring voice platform | Real-Time / Operations Landing | Glassmorphism | Fira Code/Sans |
| 7 | voice AI assistant conversation interface | **Product Demo + Features** | Flat Design | **Space Grotesk + DM Sans** |
| 8 | high conversion service landing page | Hero + Testimonials + CTA | Brutalism* | Russo One (rejected) |
| 9 | accessible navigation wayfinding orientation | FAQ/Documentation Landing | **Minimalism & Swiss** | Atkinson Hyperlegible |
| 10 | restrained scroll storytelling narrative | Hero + Features + CTA | Minimalism & Swiss | Outfit + Work Sans |

\* The style column at `--variance 8` is a documented dial bias ("biases toward Brutalism, Bento
Grids"), not a data-driven fit — treated as a signal to be *bold and asymmetric*, not to adopt
brutalism literally.

Supplementary domain searches: `product` (AI/Chatbot Platform → AI-Native UI + Minimalism & Swiss,
Interactive Product Demo landing), `style` (parallax-storytelling, editorial-grid-magazine,
aurora-ui — cyberpunk explicitly rejected), `color` (Healthcare cyan #0891B2/#22D3EE, Space-Tech
near-black #0B0B10, dashboard navy + status colors), `typography` (8 editorial pairings incl.
Newsreader), `landing` (hero-testimonials-cta, trust-authority-conversion, product-demo-features),
`ux` (active-state, breadcrumbs, sticky-nav padding, skip links, keyboard nav, reduced motion,
transform-only animation, autoplay-video guidance), `gsap` (scroll-scrub pin preset: pin max 1–2
sections, scrub 0.5–1.5, `ScrollTrigger.refresh()` after fonts), `react` stack (memo discipline,
stable keys).

Zero-result searches (per the skill's query contract, retried once then declared): `icons` domain
returned 0 for both "line icon system stroke consistent" and "icon set navigation arrow" — **no
verified icon-database match**; icon guidance below therefore falls back to the skill's built-in
pre-delivery rule ("SVG: Heroicons/Lucide"), stated as a fallback, not a database result.

Reference study: `rekreatedigital.com` — adopted *principles only*: numbered chapter sections,
proof sequencing (logos → process → people → quotes → case studies), minimal top-level nav,
text-led hero impact, single-accent color restraint, motion as waypoint not decoration. No layout,
wording, typography, branding, or animation copied.

---

## 2. Compared ingredients and tradeoffs

**Layout/pattern.** Candidates: plain Hero+Features+CTA (safe — this is exactly what V3 was and
why it failed review), Scroll-Triggered Storytelling (search #4: chaptered narrative, progress
indicator, per-chapter color, mini-CTA per chapter), Immersive/Interactive (search #5: strongest
identity, highest perf/a11y risk, demands skip paths), Product Demo + Features (search #7: right
for the AI Receptionist page specifically). **Chosen:** Scroll-Triggered Storytelling as the
homepage spine + Product Demo pattern on the AI Receptionist page + Trust & Authority sequencing
for proof. Tradeoff accepted: storytelling costs more motion engineering and needs a complete
reduced-motion static state; we take that cost because "safe, static, forgettable" is the stated
V3 failure.

**Style.** Candidates: Brutalism (dial artifact — raw/anti-design contradicts "premium
approachable"), Glassmorphism (owner brief bans excess; conditional a11y risk), Aurora UI
(luminous atmospheric gradients — good for the dark hero field, but as a whole-site style reads
generic-SaaS), Editorial Grid/Magazine (asymmetric grid, pull quotes, print-inspired hierarchy,
low perf cost, low a11y risk), Minimalism & Swiss (dashboard-appropriate). **Chosen:** Editorial
Grid/Magazine as the marketing skeleton, with a restrained Aurora-derived luminous signal field
*only* inside dark cinematic sections, and Minimalism & Swiss inside the two applications.
Tradeoff: editorial asymmetry is harder to keep responsive than centered columns; accepted for
distinctiveness, with mobile reflow rules per section.

**Palette.** Candidates: AI purple (#6366F1/#7C3AED — returned twice; rejected: "generic purple
SaaS" is on the owner's ban list), trust-blue + orange CTA (#2563EB/#EA580C — safe B2B, zero
identity), Healthcare cyan (light, calm — right hues, wrong energy), Space-Tech near-black
(#0B0B10 — right depth, no color identity), Quantum neon cyan/magenta (cyberpunk — banned).
**Chosen:** a synthesized SiteMint palette (§3): midnight-ink/deep-navy foundations from the
Space-Tech/dashboard profiles + luminous cyan/turquoise from the Healthcare profile pushed to
signal-grade luminosity on dark + one warm amber reserved for human-attention moments. Not
adopted from any single row — every pair re-verified for WCAG AA (§3 table).

**Typography.** Candidates compared: Inter-everywhere (search #1 — explicitly rejected by brief
unless evidence proves it best; evidence here shows better-fitting pairs exist), Plus Jakarta Sans
(friendly but near-generic), Calistoga+Inter (editorial warmth, but Calistoga's rounded display
reads consumer/food more than systems engineering), Exo+Roboto Mono (sci-fi, too cold),
Russo One+Chakra Petch (gaming — reject), Playfair/Newsreader serif pairs (editorial, but a serif
lead misstates what SiteMint builds), Space Grotesk + DM Sans (search #7's match for **voice AI /
AI products**: "tech, startup, modern, innovative"). **Chosen:** Space Grotesk display + DM Sans
body + JetBrains Mono labels (mono appears across three verified pairings as the tag/label voice)
+ Newsreader italic as a scarce editorial accent for pull-quotes (from the verified News Editorial
pairing). Tradeoff: Space Grotesk is popular in AI startups (not unique), but its geometric
terminals match the signal identity and it stays legible at dashboard sizes; distinctiveness comes
from the *four-voice system* and the mono-numbered editorial structure, not from an exotic face.

---

## 3. The SiteMint Signal system

**Identity idea.** One luminous signal — an inquiry — travels: attention → conversation →
organization → action → customer. The signal is drawn as a thread whose color shifts along the
journey (cyan → turquoise → mint). It appears as route/thread, section connector, waveform, status
pulse, loader, and the diamond/mint mark. The palette exists to make that one luminous element
read; everything else stays quiet ink, navy, and cloud.

### 3.1 Color tokens (roles + verified contrast)

Marketing pages are **light-first** with dark cinematic chapters (hero, receptionist theater,
process). Applications are light by default. Never all-dark (owner ban + search #2 anti-pattern).

| Token | Hex | Role | Key contrast (WCAG) |
|---|---|---|---|
| `--sm-ink` | `#071324` | midnight ink — hero/cinematic bg, footer | fg `#F4F8FB` = 17.44:1 |
| `--sm-navy` | `#0D2440` | elevated dark surface, cards on ink | fg = 14.64:1 |
| `--sm-navy-line` | `#1B3A5E` | decorative hairlines on dark | decorative only |
| `--sm-cloud` | `#F4F8FB` | light page bg; text on dark | ink text = 16.12:1 |
| `--sm-paper` | `#FFFFFF` | cards on light | ink text = 17.22:1 |
| `--sm-mist` | `#C9D9E6` | decorative hairlines on light | decorative only |
| `--sm-line-strong` | `#5A7186` | input/control boundaries on light | ≥3:1 vs paper |
| `--sm-text` | `#0B1C2E` | primary text on light | 17.22:1 on paper |
| `--sm-text-mute` | `#46617A` | secondary text on light | 6.46:1 paper / 6.05:1 cloud |
| `--sm-text-mute-dark` | `#93AEC4` | secondary text on dark | 8.06:1 ink / 6.77:1 navy |
| `--sm-cyan` | `#22D3EE` | luminous cyan — signal core (dark surfaces) | 10.30:1 on ink; ink-on-cyan 9.53:1 |
| `--sm-cyan-deep` | `#0E7490` | links/actions on light; light-mode signal | 5.36:1 paper; white-on-it 5.36:1 |
| `--sm-turquoise` | `#2DD4BF` | signal mid-journey; success states | 10.00:1 on ink |
| `--sm-mint` | `#4AF2C8` | electric mint — signal terminus, sparing | 13.15:1 on ink; ink-on-mint 12.15:1 |
| `--sm-amber` | `#F5A524` | warm human-attention accent (dark) | 9.13:1 on ink; ink-on-amber 8.44:1 |
| `--sm-amber-deep` | `#B45309` | warm accent as text on light | 5.02:1 on paper |
| `--sm-red` | `#FF6369` / `#C62A33` | destructive (dark / light text) | 6.42:1 ink / 5.56:1 paper |

Rules: mint appears only where the journey *completes* (booked outcome, success). Amber is the
only warm color and marks human attention (missed-call chaos in the story, alerts, "action
needed") — never decoration. Signal gradient `cyan → turquoise → mint` is reserved for the thread
itself and journey-progress UI, never for buttons or headings. Focus ring: `--sm-cyan-deep` on
light, `--sm-cyan` on dark, 2px offset 2px.

### 3.2 Typography

| Voice | Face | Usage |
|---|---|---|
| Display | **Space Grotesk** 500/700 | Marketing H1–H3, chapter numbers pair with mono; dashboard page titles at restrained sizes |
| Body | **DM Sans** 400/500/700 | All body, UI controls, dashboard data labels |
| Signal mono | **JetBrains Mono** 400/500 | Section numbers (`01 — Attention`), tags, timers, waveform readouts, table numerics |
| Editorial accent | **Newsreader** italic 400 | Pull-quotes and one-line human asides only; never headings, never UI |

Scale (marketing): 16px base, body 1.0625rem/1.6; H1 clamp(2.6rem, 6vw, 4.75rem)/1.02 tracking
−0.02em; H2 clamp(2rem, 4vw, 3.25rem); H3 1.5rem. Scale (apps): 16px base, body 0.9375rem/1.5,
page title 1.375rem, dense table text 0.875rem (≥12px minimums everywhere). Mono labels 0.75rem
uppercase +0.14em tracking.

### 3.3 Shape, space, depth

- Radius: 4px controls, 10px cards, 999px pills/waveform chips. Sharp (0) only on the editorial
  image frames — the one brutalist trace kept.
- Space scale (marketing, density 4): 24/32/48/64/96/128. Apps (density 7): 8/12/16/24/32/48.
- Depth: hairline borders first; shadows only for overlay layers (mega panel, dialogs,
  `0 24px 64px -32px rgb(7 19 36 / 0.4)`). No glassmorphism blur except one 12px backdrop blur on
  the sticky nav over dark hero — measured, single element.
- Grid: 12-col, max 1200px apps / 1280px marketing; editorial sections may break the column with
  asymmetric 5/7 and 4/8 splits and bleed images; mobile reflows to single column, media first.

### 3.4 Iconography

No verified `icons`-domain match (two retried queries returned 0 — stated per skill contract).
Fallback (skill built-in rule): **Lucide** stroke icons, 1.5px stroke, 20px UI / 24px marketing,
`aria-hidden` when decorative, `aria-label` on icon-only buttons. The signal thread, waveform, and
diamond mark are custom SVG, not icon-font glyphs.

### 3.5 Voice & content rules

Honest engineering voice: verifiable claims only, no invented clients/metrics/testimonials.
Proof Architecture sections ship with explicit "case studies in progress" empty states until real
evidence exists. Numbered chapters use mono labels (`01 — Attention`) to give every page a place
in a sequence.
