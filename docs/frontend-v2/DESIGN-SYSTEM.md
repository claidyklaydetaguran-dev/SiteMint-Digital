# Design System — Frontend V2

## 1. Character

**The SiteMint public website is light-forward** (owner decision 5). Warm white
and soft off-white dominate. Dark surfaces are the exception, deliberately
placed.

Required character:

fresh · intelligent · premium · welcoming · modern · creative · calm but
impactful · professional without feeling corporate · technological without
feeling masculine.

**Avoid:** purple or indigo · blue-dominant presentation · neon · gaming
aesthetics · generic agency styling · excessive dark sections · repetitive
rounded cards · excessive dashboard visuals on marketing pages.

**Must not resemble:** a purple AI startup template, a crypto site, a gaming
interface, a generic Replit landing page, or a pile of disconnected SaaS cards.

The current build fails this on evidence: **670 inline `style={{ … }}` usages**
in web-agency mean presentation is hardcoded per component with no shared token
layer — which is exactly how the purple/indigo drift arose that Ports 3 and 4 had
to correct. V2's first structural rule is therefore: **tokens, not inline
styles.**

## 2. Colour

The public default is the **light-forward** palette below.

| Token | Value | Role |
|---|---|---|
| `--sm-warm-white` | `#FDFCFA` | **Dominant page background** — warm white |
| `--sm-offwhite` | `#F6FBFA` | **Dominant alternate** — soft off-white section background |
| `--sm-mint-mist` | `#F0F9F6` | Mint mist — restrained section differentiation |
| `--sm-mint-100` | `#E8F8F5` | Pale mint — restrained section differentiation, subtle highlight, selected row |
| `--sm-mint-500` | `#27E9B5` | Mint — **important actions and small accents only** |
| `--sm-navy-900` | `#051824` | Deep navy — typography on light; the one feature section; footer |
| `--sm-navy-700` | `#162936` | Navy surface — cards on navy, secondary fills |
| `--sm-slate-500` | `#3B5265` | Slate — secondary text, borders on light |
| `--sm-white` | `#FFFFFF` | White — cards, dashboard surface |

`--sm-navy-900` doubles as the "near-black green" high-contrast typography
colour; a near-black green may be substituted for it wholesale, but the two are
never mixed on the same page.

### Rules

- **Warm white and soft off-white are the dominant page backgrounds.** Pale mint
  and mint mist provide restrained section differentiation.
- **Mint is an accent, never a full-page background.** Budget: at most one mint
  CTA plus one mint highlight per viewport.
- **Deep navy (or near-black green) is for typography and *selected*
  high-contrast sections only.** Navy may be used for the footer, a focused
  product demonstration, **or** one intentional feature section.
  **Do not make most of the public website dark** — on the homepage navy appears
  exactly twice (one feature section + footer; `INFORMATION-ARCHITECTURE.md` §2).
- On navy, mint carries text at `#051824` (measured ≥ 7:1) — never white on mint.
- **Forbidden:** purple, indigo, **blue-dominant presentation**, bright cyan,
  neon (any neon), hot pink, rainbow gradients. Concretely banned tokens from the
  old build: `#6366f1`, `#062e71`, `#1249a8`, `#1a1a2e`, `#16213e`.
- Semantic colours (success/warning/danger) reuse the existing
  `lib/design-tokens` primitives, which are already test-covered.
- **The dashboard is unaffected by the light-forward public default** — it keeps
  its restrained neutral layering (§4).

## 3. Typography

**One family, no remote request.** The current build loads **three** render-
blocking Google families: Inter (via `<link>` in `artifacts/web-agency/
index.html`) plus Plus Jakarta Sans and Playfair Display (via `@import` at the
top of `artifacts/web-agency/src/index.css`); helpdesk loads the latter two the
same way.

Phase 1 removes the need for all three. The binding rule is **no new remote font
request**:

- Use **one approved variable font only if it is already safely available in the
  repository** (self-hosted, Latin subset, `woff2`, `font-display: swap`,
  preloaded once).
- **Otherwise Phase 1 ships a high-quality system font stack** — which requires
  no network request at all and is the expected Phase 1 outcome:

```
font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

Adding a webfont **dependency** is out of scope for Phase 1. `Playfair Display`
display type is retired outright — the light-forward editorial character is
carried by scale, weight, and spacing, not by a serif display face.

| Role | Size (desktop) | Weight | Line height |
|---|---|---|---|
| Display | 56px / clamp to 36px | 600 | 1.05 |
| H1 | 40px → 30px | 600 | 1.15 |
| H2 | 30px → 24px | 600 | 1.2 |
| H3 | 22px → 19px | 600 | 1.3 |
| Body L | 18px | 400 | 1.6 |
| Body | 16px | 400 | 1.6 |
| Small | 14px | 400 | 1.5 |
| Micro/label | 12px | 600, `0.06em` tracking, uppercase | 1.4 |

Body line length is capped at **68ch**. No italic display type. Numerals are
tabular in tables and metrics.

## 4. Layout and surface rhythm

- **8-point spacing system.** Allowed steps: 4, 8, 12, 16, 24, 32, 48, 64, 96,
  128. Nothing else.
- Content max width **1200px**; text columns **68ch**; dashboard tables may reach
  1440px.
- Section padding: 96px desktop / 64px tablet / 48px mobile.
- **Public pages are light-forward.** Warm white and soft off-white dominate;
  pale mint and mint mist differentiate sections restrainedly. Deep navy is
  reserved for the footer plus **at most one** intentional feature or focused
  product-demonstration section per page. Homepage surface plan:
  `INFORMATION-ARCHITECTURE.md` §2.
- **Dashboard uses restrained neutral layering** — white surface on `#F6FBFA`
  page, separated by 1px `#3B5265` at 12% opacity. No navy panels, no mint fills
  behind data.

### Anti-pattern rules (binding)

- **Not everything is a rounded card.** Prefer a rule, spacing, and typographic
  hierarchy. Cards are for genuinely repeating, comparable objects.
  **Repetitive rounded cards are an explicit owner-flagged anti-pattern** — no
  page may present three or more consecutive card grids.
- **No excessive dashboard visuals on marketing pages.** Product UI appears on
  the public site at most once per page, as a focused demonstration — never as
  decorative chrome, and never as fabricated interface content.
- **No excessive dark sections** — see §2 and `INFORMATION-ARCHITECTURE.md` §2.
- Corner radius scale: 6px (controls), 10px (cards), 16px (modals). **Nothing
  larger.**
- **No glassmorphism** beyond a single sticky header treatment.
- **No glowing borders** around ordinary content.
- Reach for borders, spacing, typography, and composition **before** shadows.
- Shadow scale, soft and limited to interactive elevation:
  `--shadow-1: 0 1px 2px rgba(5,24,36,.06)` · `--shadow-2: 0 4px 12px
  rgba(5,24,36,.08)` · `--shadow-3: 0 12px 32px rgba(5,24,36,.10)` (modals only).

## 5. Components

Built on the existing shadcn/Radix primitives already in the repo — **no new UI
dependency**. The two duplicated kits (56 files in web-agency, 55 in helpdesk)
are consolidated into one shared workspace package in Phase 1.

| Component | Notes |
|---|---|
| Button | Variants: primary (mint), secondary (navy outline), ghost, destructive. Min target **44×44 px**. |
| Input / Select / Textarea | Label always visible — never placeholder-as-label. Error text beside the field, `aria-describedby`. |
| Card | Border-first; shadow only on interactive elevation. |
| Table | Sticky header, zebra off, row hover, real empty state. |
| Modal / Drawer | Radix Dialog, focus-trapped, `Esc` closes, returns focus. |
| Toast | Radix, polite live region, never the sole channel for errors. |
| Skeleton | Matches final geometry exactly to prevent CLS. |
| Badge / StatusPill | Semantic colour + text label — never colour alone. |
| SectionHeader | Eyebrow + H2 + optional lede; the standard editorial rhythm. |

## 6. Iconography

Existing `lucide-react` only, 20/24px, 1.5px stroke, `currentColor`. Icons are
never the sole meaning carrier. No emoji as UI iconography — the current landing
page uses 🏠⚖️🔧💆🍽️🛍️ as industry icons; V2 replaces these with real SVG icons.

## 7. Dark mode

**Out of scope for V2.** The public site's navy sections already provide dark
contrast. Revisit after launch.

## 8. Token delivery

Tokens live in CSS custom properties on `:root`, generated from the existing
`lib/design-tokens` package so its token tests keep passing. Tailwind reads the
same variables. **Components consume tokens; components do not hardcode hex
values.** A lint rule blocks raw hex in `artifacts/*/src` outside the token file.

The Phase 1 token layer must cover all of: **approved colours · typography ·
spacing · containers · borders · radii · shadows · focus states · motion
duration · motion easing · layering/z-index**, with the **light-forward palette
as the public default**.

Phase 1 scope boundary: establish the token layer and the migration path, and
convert **only the shared foundations Phase 1 requires**. The broad mechanical
replacement of all **670** inline `style={{ … }}` usages is explicitly **not**
Phase 1 work — it happens progressively as each surface is rebuilt in Phases
2–8.

`lib/design-tokens/src/primitives.css` currently defines `--sm-font-display:
'Playfair Display', …` and `--sm-font-body: 'Plus Jakarta Sans', …`, and is
consumed by helpdesk as well as web-agency. Retiring those families is an
additive, test-covered token change — sequence it so `lib/design-tokens`'
existing token tests keep passing.
