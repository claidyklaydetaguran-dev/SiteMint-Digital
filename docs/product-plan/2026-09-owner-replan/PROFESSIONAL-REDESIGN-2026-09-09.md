# SiteMint — Client-Approved Professional Redesign (2026-09-09)

Status: **design preview — awaiting owner approval. Nothing deployed.**
Branch: `feature/ai-receptionist-private-beta-readiness` · starts from `7d0eefd`.

## 1 · What this is

The client reviewed the business-owner communication pass and approved a
professional rendering (sitemint-professional-render.shastagreene.chatgpt.site)
as the visual direction: more professional, easier to understand, less
technical, more spacious, more focused. The shared client conversation also
explicitly rejected the tilted-diamond logo and any boxed "SM" monogram
("it still looks like a generated tech logo") and approved a typography-only
wordmark.

This pass rebuilds the reference's **principles** — typography, spacing,
hierarchy, restrained mint, dark blue-charcoal fields, polished white cards —
inside the existing SiteMint system. No reference markup or source was
copied; SiteMint's approved functionality, real work, media, team, motion
system, and responsive repairs are all preserved.

## 2 · The measured reference system → SiteMint tokens

Measured on the approved rendering (1348px viewport, computed styles):

| Reference fact | SiteMint token (tokens-v5.css) |
|---|---|
| Manrope 700/800 headings, −0.04em, lh 1.08 | `--sm-font-display` → Manrope; `--sm-track-display`; `--sm-lh-display` |
| DM Sans body 16px / 1.55; lead 18px | already the body voice; `--sm-lead`, `--sm-lh-body` |
| Hero H1 68px | `--sm-display-1: clamp(2.35rem, …, 4.25rem)` |
| Section H2 ~54px | `--sm-display-2: clamp(1.9rem, …, 3.4rem)` |
| Content column ~1180px | `--sm-container: 1180px` |
| Cards r22 / p34, quiet #D7E4E8-class borders | `--sm-radius-card: 22px`, `--sm-card-pad` |
| CTAs 48px tall, r10, weight 700 | `--sm-cta-h`, `--sm-radius-cta` |
| Section rhythm 110px | `--sm-section-y: clamp(4.25rem, …, 6.875rem)` |
| Hero/dark bands #061C29–#071C29 | `--sm-ink-hero: #071C29` (`--sm-dark-bg` now reads it) |
| Porcelain band #F1F8F8 | `--sm-band` |
| Eyebrows: Manrope 700 caps, 0.16em, light mint on dark (#91F2DF) | `.v4-kicker` restated in v5-pro.css |

Mint stays the **approved pastel-signature family** (#99F5D0 fills with deep
ink text, #0B6B57 text-safe mint on light) — the reference's mint plays the
same role; no new accent color was imported.

Mechanism: `src/styles/v5-pro.css` (override-only, loaded after v5-remap.css;
rollback = remove one import) + edits to the page-owned sheets
(v5-home.css, v5-pages.css, discovery-v5.css). No pinned V3/V4 file was
edited. `tokens-v5.css` changed in both mirrored copies (web-agency +
helpdesk, byte-identical per the foundation contract).

Fonts: `@fontsource/manrope` added to web-agency + helpdesk (the directive
names Manrope explicitly). 700/800 latin subsets are self-hosted critical
faces in `public/fonts` + inline `@font-face` (font-display: optional, the
release LCP pattern); 600 loads like every other face. A metric-matched
"Manrope Fallback" keeps any swap CLS-free. Space Grotesk remains only in
the internal ops/auth stacks.

## 3 · The wordmark (logo)

`src/components/v5/BrandWordmark.tsx` — typography-only:

- **SiteMint.** — Manrope 800, −0.055em; "Site" ink/white by surface,
  "Mint" 600 + "." in the pastel-mint family (signature on dark, mint-ink
  on light);
- **DIGITAL** beneath — small caps, 0.34em tracking (authored as "Digital"
  + text-transform so screen readers say a word);
- no separate icon, ever. Used in the public header, mobile sheet, footer,
  and Discovery. Accessible labels stay "SiteMint Digital".
- The favicon is **unchanged** pending owner approval of any symbol.
- `SignalMarkV4` (the diamond) no longer renders on any public surface.

## 4 · Surface-by-surface

- **Header** — 82px desktop bar, quiet links, ONE filled CTA
  ("Start a Project"); the AI Receptionist pill/pulse demoted to a quiet
  link with a small static mint dot; deep-ink transparent bar over ink
  heroes; light bar after scroll (wordmark re-inks correctly on both).
- **Homepage** — hero architecture (particles, film, rail, HUD) preserved;
  copy recomposed: eyebrow "Websites · Systems · Automation", H1
  "Websites and business systems built to help you grow." (68px ceiling),
  supporting line, CTAs **Plan My Project** / **See Our Work**; the extra
  brand line was retired (fewer labels above the fold); node labels/HUD
  dimmed to texture. Four owner-goal capability groups now wear the
  reference card language (r22, fluid padding, hover lift). Final CTA
  band uses the one conversion phrase ("Plan My Project" — also unified
  across Services/Process/About/Pricing/Work/404).
- **Journey, FAQ, process, media band** — deep blue-charcoal fields via the
  ink-hero token; Manrope headings; Manrope-caps eyebrows.
- **Team** — full-width 4:3 editorial portraits (real photographs), name,
  role, one plain-language responsibility sentence, tags, dialog behavior
  unchanged.
- **Portfolio** — approved hierarchy untouched (Simply Save Solar primary,
  OneFilAm strong secondary, Hand Home Care supporting); cards adopt the
  22px editorial card language; detail overlays unchanged.
- **AI Receptionist** — keeps its own product theater (cinematic hero,
  simulated call, beta disclosure) with the shared wordmark/typography/
  buttons; compact one-line wordmark below 1480px protects the product
  nav + CTA from clipping.
- **Discovery** — porcelain page ground, white 22px form surface, Manrope
  headings, Manrope-caps rail eyebrow, 48px/10px mint primary; the guided
  questionnaire, branching, drafts, and plain-language step names are
  untouched.
- **Operations CRM** — not part of this pass (staff-only; mint
  normalization already certified). The ops chrome keeps `--sm-ink-950`.

## 4a · Owner corrections (same day, applied before the preview checkpoint)

1. **Team portraits** — per-person focal points (`teamV5.portraitPosition`):
   Claidy's and Saisa's 3:4 sources were center-cropped by the shared 4:3
   viewport, cutting their heads; their crop windows now hold the top of
   frame (full head + headroom + shoulders). Shasta's 4:3 source fills the
   frame exactly and is untouched. No photograph was edited, stretched, or
   regenerated. Documented visual check: team-section captures at 1348 /
   820 / 390 in the owner pack.
2. **Main navigation** — AI Receptionist left the top level; the Services
   dropdown carries the six recommended categories (Websites & Web
   Applications · CRM & Business Systems · AI & Automation · AI
   Receptionist · SEO, Advertising & Growth · Ongoing Support) on desktop
   (3×2) and in the mobile Services accordion. Route and landing page
   unchanged; homepage featured section, cross-links, and footer still
   link it.
3. **AI Receptionist product nav** — simplified to Overview / Try the Demo
   / How It Helps / FAQ (+ Sign in + one beta CTA). All page sections
   remain in order; single row fits from 1024px (CTA-edge probed),
   scrollable rail below. The `:has()` header-height selector was replaced
   by a PublicShell-stamped `data-header-mode` (the `:has()` measured
   ~3.2s of Style & Layout on this page under Lighthouse).
4. **AI & Automation homepage section** — "Let routine work move forward
   automatically." + `AutomationDemo`: three readable stages (Inquiry
   received / Information organized / Follow-up ready), auto-advancing,
   clickable, filling signal line, HTML-text sample cards, reduced-motion
   static state, illustration disclosure. CTA "See How Automation Can
   Help".
5. **AI Receptionist homepage signal** — the faint rings became a
   call-signal card: one controlled pulse, defined waveform, "Incoming
   call — answered", three outcome rows (Call answered / Details captured
   / Next step ready), a visible thread into the dashboard preview, and
   the simulated/private-beta note.

## 5 · Discovery production repair — status: PENDING, NOT APPLIED

Carried unchanged from the prior checkpoint, isolated in commit `8e4e78e`
(frontend legacy bridge) and
`docs/sitemint-platform/PRODUCTION-DISCOVERY-REPAIR.sql` (15 idempotent
additive `ADD COLUMN IF NOT EXISTS` statements).

Findings to date (diagnosed against the deployed bundle and observed
responses; to be re-verified against the exact deployed commit + schema at
apply time): production `POST /api/v1/discovery-submissions` fail-closes
(503, unprovisioned key + unbuilt delivery worker on the deployed
snapshot); the deployed legacy `POST /api/discovery/submit` pipeline is
complete but its insert 500s on the missing v1 columns; the bridge posts
through the legacy route losslessly.

Per the owner-approved order: **no SQL applied, no synthetic submission
sent, nothing published during this design phase.** After design approval:
apply the reviewed SQL → verify schema → labeled synthetic submission →
verify CRM record/reference/idempotency/emails → rebuild → publish →
verify sitemintdigital.com → retain rollback.

## 6 · Verification

Design-phase battery (see the owner review package message for the run
results): typecheck, home + ops contract suites, production build,
prerender gate, plain-language guard, clip/overflow matrix, access,
project overlays, nav, routing, interactions, forms, motion, error audit,
Firefox + WebKit suites, accessibility + performance medians.
