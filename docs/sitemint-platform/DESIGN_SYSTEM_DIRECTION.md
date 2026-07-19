# SiteMint Digital — Design System Direction

> Documentation only — Checkpoint P0. No CSS, token, or component file is
> modified by this document. All values here are **proposed**, to be implemented
> in `IMPLEMENTATION_ROADMAP.md` Phase 1.

## Current State (grounded in repo inspection)

Two independent Tailwind v4 token systems exist today, with no shared package:

| | `web-agency` (`src/index.css`) | `helpdesk` (`src/index.css`) |
|---|---|---|
| Primary | `218 90% 23%` — deep blue | `160 76% 22%` — deep evergreen |
| Accent | `218 45% 93%` — light blue | `160 64% 50%` (`#34D399`) — bright mint |
| Fonts | Plus Jakarta Sans + Playfair Display | Plus Jakarta Sans + Playfair Display (same families, different weight sets) |
| Dark mode | Not implemented | Implemented (Light/Dark/System) |
| Semantic tokens (success/warning/info) | Not present | Present |

Both apps already agree on typography family and Tailwind v4 architecture — that
convergence is the seed of the shared system below. The color identity is the
actual conflict to resolve.

## 1. Brand Personality

Modern, premium, intelligent, calm, technical without cold, confident without
loud. Matches the personality already defined and approved for the AI Receptionist
dashboard (`VOICE_PLATFORM_UI_UX.md` §1) — this document extends that personality
to the whole platform rather than inventing a new one.

## 2. Design Principles

1. One brand, product-specific accents — neutrals/typography/spacing/motion are
   shared; accent hue may vary per product (mint for AI Receptionist is already
   correct and stays).
2. Light-first for the public marketing site; dark-complete where an app already
   has it (helpdesk).
3. Restraint over decoration — every animated or glowing element earns its place.
4. Never fabricate data visually — honest empty/estimate states are a design
   requirement, not just a copy requirement (carried from `VOICE_PLATFORM_UI_UX.md`
   §15 "Honesty rule").
5. Accessible by default, not by retrofit.

## 3. Color Architecture

Recommend a **three-layer token model**, shared across all artifacts:
- **Core neutrals** (background, surface, foreground, border, muted) — identical
  values across every artifact.
- **Primary/semantic** (primary, success, warning, destructive, info) — identical
  across artifacts; primary = deep evergreen (adopting helpdesk's existing value,
  since it is already implemented, tested for contrast, and dark-mode complete —
  cheaper and lower-risk than migrating helpdesk to web-agency's blue).
- **Product accent** — one accent hue per product surface: mint (`#34D399`
  family) for AI Receptionist (existing, keep); SiteMint-corporate accent for
  `web-agency` itself is recommended to also become mint/evergreen family for
  brand consistency (see Owner Decision, Blueprint §24.6) rather than keep its
  current unrelated blue.

## 4. Light Theme

Warm-white canvas (`~150 22% 99%`), white/near-white cards, evergreen text ink,
mint reserved for accents/focus/data — this is the existing helpdesk light theme
(`index.css` §9 of `VOICE_PLATFORM_UI_UX.md`), recommended as the platform-wide
light theme rather than authoring a fourth palette.

## 5. Dark Theme

Deep green-charcoal (not pure black), one-step-lighter elevated cards, brighter
mint doing more visual work — existing helpdesk dark theme, recommended platform-
wide once `web-agency` adopts dark mode (post-MVP per PRD).

## 6. Neutral Colors

Shared `--background`, `--surface`, `--surface-muted`, `--foreground`,
`--muted-foreground`, `--border` — values as already defined in helpdesk's
`index.css` §9 table (not restated in full here; that table is the source of
truth and should be copied into the shared token package verbatim, not
reinvented).

## 7. Semantic Colors

`--success`, `--warning`, `--destructive`, `--info` — already defined in
helpdesk, missing in web-agency. Adopt helpdesk's existing values platform-wide.

## 8. Accessible Contrast Requirements

AA minimum (4.5:1 text, 3:1 large/UI) in both themes, mint never used as body text
on white, state never conveyed by color alone — identical requirement to
`VOICE_PLATFORM_UI_UX.md` §13, extended to `web-agency`.

## 9. Typography Direction

Plus Jakarta Sans for UI/body, Playfair Display for display headings only — both
already installed in both apps; this document formalizes matching weight sets and
usage rules platform-wide (helpdesk's convention: Playfair for page/section/hero
headings only, never body copy).

## 10. Type Scale

Adopt helpdesk's existing `--text-xs..7xl` scale as the shared scale (already
built, already tested) rather than defining a fifth scale for web-agency.

## 11. Spacing System

4px base unit, section padding 24–32px, content max-width 1200–1360px — existing
helpdesk convention, recommended platform-wide.

## 12. Layout Grid

12-column responsive grid via Tailwind's grid utilities; no custom grid framework.

## 13. Breakpoints

375 / 768 / 1024 / 1280+ — matching helpdesk's tested responsive convention (PRD
§27), applied platform-wide for consistency.

## 14. Container Widths

Marketing pages: max-width ~1280px with generous side padding. Dashboard/CRM
density: up to 1360px (existing helpdesk convention) since data tables need more
room than marketing prose.

## 15. Border-Radius System

`--radius: 0.75rem` base (cards 12px, controls 8px, pills full) — existing
helpdesk token, adopted platform-wide.

## 16. Shadow and Elevation System

Green-charcoal-tinted, low-opacity layered shadows (`--shadow-xs..2xl`) plus a
signature `--shadow-mint-glow` for primary CTA emphasis — existing helpdesk
tokens (fixed from zero-alpha bugs in Phase 2C per SESSION_HANDOFF.md), adopted
platform-wide including for `web-agency`'s primary CTAs.

## 17. Border System

Hairline borders using the shared `--border` token; no heavy/skeuomorphic borders.

## 18. Icon Direction

`lucide-react` icons only (already the convention in helpdesk's nav, per
`VOICE_PLATFORM_UI_UX.md` §3 table) — adopt as the platform-wide icon library
rather than mixing icon sets between artifacts.

## 19. Illustration Direction

Minimal, geometric, mint-accented — no stock illustration packs, no cartoon
figures (violates "premium, not childish" brand guardrail). Diamond-mark motif
(existing SiteMint mark) extends into empty-state illustrations, per helpdesk's
`EmptyState` pattern.

## 20. Image Direction

Real project screenshots for Work/Portfolio (existing content, preserved).
Product marketing pages use real product UI screenshots, never mockup stock
photography, consistent with the "no gimmicky 3D effects" brand guardrail.

## 21. Device Mockup Direction

Simple, flat browser/phone frame outlines if used at all — no heavy 3D device
renders (matches "avoid gimmicky 3D effects" guardrail explicitly).

## 22. Card System

Shared `Card`/`CardHeader`/`CardContent` shadcn primitives (already the base in
both apps) with the shared shadow/radius tokens above — no new card component
library.

## 23. Button System

Evergreen primary buttons with mint-glow hover (existing helpdesk pattern),
adopted for `web-agency`'s primary CTAs (currently a different blue button style)
once Phase 1/2 re-theming lands.

## 24. Form System

Label-for-every-field, `aria-describedby` error linking, char-count patterns
where relevant (existing helpdesk `AgentConfig` pattern) — applied to Contact/
Discovery forms as they're re-themed, not rebuilt.

## 25. Navigation System

Two independent nav shells (public Navbar/Footer; authenticated AppShell sidebar)
sharing only the visual token layer — see Route doc §13.

## 26. Footer System

Shared visual treatment (tokens, mint accent line) but content stays specific to
each app's footer needs — `web-agency`'s marketing footer vs. helpdesk's
account-menu-style footer are different components solving different problems.

## 27. Dialog System

Radix Dialog primitives (already installed via shadcn in both apps) — no new
modal library.

## 28. Table System

`DataTable` wrapper over shadcn table (existing helpdesk component,
`VOICE_PLATFORM_UI_UX.md` §8) — reusable pattern for any future CRM table work,
not required for public marketing pages.

## 29. Status System

`StatusBadge`/`Tag` components (existing helpdesk pattern) — reusable pattern,
not required on marketing pages.

## 30. Empty States

Mint-accented illustration + Playfair title + one-line body + single CTA
(existing helpdesk `EmptyState` pattern, §15 of `VOICE_PLATFORM_UI_UX.md`) —
platform convention going forward for any authenticated or data-driven surface.

## 31. Loading States

Skeletons matching final layout, shimmer via `tw-animate-css` (existing helpdesk
pattern) — not generally needed on static marketing pages.

## 32. Error States

Three tiers (global boundary / section inline / field-level) — existing helpdesk
pattern (`VOICE_PLATFORM_UI_UX.md` §15), recommended for `web-agency` as it adopts
the shared system, especially around the Contact/Discovery forms.

## 33. Motion System

`framer-motion` is already installed platform-wide but only actually used in
`web-agency` today (15 files) — helpdesk, ai-toolkit, and mockup-sandbox have it
installed and unused. Recommendation: keep `framer-motion` as the one shared
motion library; helpdesk should adopt it for any future motion work rather than
introducing a second library, to avoid bundle duplication across artifacts long
term (each artifact still ships its own bundle, so this is a code-hygiene
recommendation, not a bundle-size fix).

## 34. Hover Behavior

Card hover elevate + 1px border shift (~120ms), CTA mint-glow on hover/focus
(~200ms) — existing helpdesk convention, adopted platform-wide.

## 35. Scroll Behavior

Scroll-triggered reveals used sparingly on marketing pages only (never inside the
dashboard) — restrained per the explicit "avoid constant movement" brand
guardrail.

## 36. Page Transitions

120–160ms content fade/slide-up on route change — existing helpdesk convention,
recommended for `web-agency` once it's on the shared motion system.

## 37. Reduced-Motion Behavior

All motion gated on `prefers-reduced-motion: reduce` → fades only, no transforms,
no count-up — existing helpdesk rule, mandatory platform-wide.

## 38. Interactive Storytelling

Reserved for the homepage's ecosystem visual (see Blueprint's Connected Ecosystem
Visual concept) — one interactive moment per page maximum, not scattered across
every section (explicit anti-clutter guardrail from the brand direction).

## 39. Light/Dark Switching

`next-themes`-driven, persisted, no-flash — existing helpdesk mechanism
(`VOICE_PLATFORM_UI_UX.md` §9), recommended for `web-agency` if/when it adopts
dark mode post-MVP.

## 40. Product Accent Rules

Each product may use one accent hue distinct from but harmonious with the shared
evergreen/mint core (mint itself is AI Receptionist's accent; a future product
should choose an adjacent hue, not mint itself, to stay visually distinguishable
product-to-product while remaining "on-brand").

## 41. Marketing vs. Dashboard Density

Marketing pages: generous whitespace, larger type, fewer elements per viewport.
Dashboard/CRM: higher information density, smaller type scale steps, more
elements per viewport — this distinction already exists implicitly between
`web-agency`'s public pages and `helpdesk`'s dashboard; this document makes it an
explicit, intentional rule rather than an accident of two different builders.

## 42. Accessibility

See §8 above; restated here per the requested outline — no additional content.

## 43. Performance Budget

No new render-blocking fonts/scripts; motion restricted to `transform`/`opacity`;
analytics script (once chosen) loads async. No numeric Lighthouse target is set in
this document — would be aspirational without a current baseline measurement,
which does not exist yet (see PRD §26, no explicit performance budget captured
today).

## 44. Design Anti-Patterns

Explicitly avoid (per task brief brand guardrails, restated as binding rules):
childish bright green, generic startup gradients, cluttered SaaS dashboards,
excessive/constant animation, illegible glass effects, copying Vapi/Solvea
branding or layouts, gimmicky 3D effects, low-contrast mint text, every section
looking like a different product.

## 45. Initial Reusable Component Inventory

Recommended shared-package candidates (not built in this checkpoint): brand mark
(`SiteMintLogo`, already exists in both `web-agency` and ported into `helpdesk`
per `VOICE_PLATFORM_UI_UX.md` §8 — a clear first candidate for real code-sharing
via a `lib/` package rather than copy-paste), `Button`, `Card`, `Badge`,
`EmptyState`, `ErrorBoundary`. Everything else (page-specific layout, nav
content) stays per-artifact.

---

## Proposed Color Direction — Assessment of Task-Brief Palette

The brief proposes: Deep background `#071712`, dark mint surface `#0D241C`,
primary mint `#32D39A`, soft mint `#BDF4DF`, pale mint background `#EFFBF6`, warm
white `#F8FAF8`, charcoal text `#14211C`, muted gray `#738078`, border mint
`#CDE8DC`.

**Assessment**: this palette is extremely close in character to the *already
implemented and contrast-tested* helpdesk palette (evergreen `160 76% 22%` /
mint `#34D399` / warm-white `150 22% 99%` background). Recommendation: **do not
introduce a fourth, slightly-different mint palette** — instead adopt the
existing, already-verified helpdesk token values as the platform standard, and
retire the brief's specific hex proposal in favor of them. This satisfies every
brand-direction requirement in the brief (premium, technical-without-cold,
light/dark capable) while avoiding a second near-identical palette to maintain.
Final adoption is an owner decision (Blueprint §24.6) since it means migrating
`web-agency` off its current blue identity, not a small tweak.

## Motion Direction — Explicit Motion Budget

Per-page ceiling: **one** scroll-triggered reveal sequence, **one** hover-glow
CTA treatment, standard card-hover elevate on lists, count-up only for real
(non-fabricated) numeric data, and the connected-ecosystem visual (homepage only,
one instance platform-wide). Cursor-responsive lighting and mesh-gradient
movement are **evaluated but not approved for MVP** — they carry real performance
and "constant movement" risk and are explicitly called out in the brand
guardrails to avoid; revisit post-MVP only with a measured performance budget in
hand. All motion gates on `prefers-reduced-motion`. This budget is deliberately
tighter than the task brief's exploratory list — restraint is the brand
requirement, not a menu to fully implement.
