# SiteMint Platform — Shared Design Tokens Specification

> **Checkpoint**: Phase 1A (design-token audit and shared token specification).
> **Status**: documentation only — this is a **specification**, not an
> implementation. No CSS, Tailwind configuration, or component file is created
> or modified by this document. Values here are the proposed shared system;
> Phase 1B is where a pilot application first consumes them.
> **Companion document**: `DESIGN_TOKEN_AUDIT.md` (the evidence this spec is
> built on — every value below traces back to a finding in that audit).

---

## 1. Token Principles

1. **Semantic before primitive.** Components consume semantic or component
   tokens (`color-action-primary`, `button-primary-background`), never
   primitives (`mint-500`) directly.
2. **One canonical source, many consumers.** Every artifact reads the same
   token values; no artifact re-derives or re-guesses a SiteMint color.
3. **Foundation, not final.** Per Blueprint §24 Decision #6/#14, helpdesk's
   existing values are the starting point, corrected only where
   `DESIGN_TOKEN_AUDIT.md`'s Accessibility Review found a measured failure —
   not redesigned wholesale.
4. **Mint is the umbrella accent, not a universal fill.** Every surface being
   "on-brand" does not mean every surface is green.
5. **Marketing and dashboard are different compositions of the same tokens**,
   not different token sets (Design doc §41, carried forward here).
6. **Accessible by default.** A token that fails a measured contrast check does
   not ship as-is; it is corrected in this spec, with the failure documented in
   the audit, before any component may consume it.
7. **Restraint over decoration**, inherited from `DESIGN_SYSTEM_DIRECTION.md`
   §2 — every token this spec adds must earn its place against the audit's
   evidence, not against aesthetic preference alone.

## 2. Naming Convention

`{category}-{role}[-{variant}][-{state}]`, all lower-kebab-case, mirroring the
audit's already-observed `--color-*` CSS custom property convention:

- Primitive: `{hue}-{step}` — e.g. `mint-500`, `evergreen-900`, `neutral-100`.
- Semantic: `color-{category}-{role}[-{state}]` — e.g. `color-action-primary`,
  `color-action-primary-hover`, `color-text-muted`.
- Component: `{component}-{part}[-{variant}][-{state}]` — e.g.
  `button-primary-background`, `card-border-default`.
- Non-color categories keep the same shape without `color-`: `space-4`,
  `radius-lg`, `shadow-md`, `duration-fast`, `z-modal`.

## 3. Token Layers

```
Primitive token          Semantic token                 Component token
─────────────────        ──────────────────────         ──────────────────────
mint-500          ──▶     color-action-primary    ──▶    button-primary-background
evergreen-900      ─▶     color-text-primary       ─▶    card-title-color
neutral-0          ─▶     color-bg-canvas          ─▶    page-background
```

Components and pages must consume the **component** layer where one exists for
that surface, the **semantic** layer otherwise, and the **primitive** layer
never, directly, from application code. Primitives exist so semantic tokens
have something stable to point at, and so a future rebrand changes primitives
once instead of every semantic reference.

## 4. Primitive Tokens

Grounded in `helpdesk`'s existing HSL values (`DESIGN_TOKEN_AUDIT.md` §4, §25),
expressed as a numbered scale so future steps can be inserted without renaming:

| Primitive | HSL | Hex (approx.) |
|---|---|---|
| `evergreen-900` | `160 76% 22%` | `#0E5C3E` |
| `evergreen-700` | `160 55% 45%` | `#38B084` |
| `mint-500` | `160 64% 50%` | `#34D399` |
| `mint-300` | `160 60% 70%` | `#8FE8C4` |
| `neutral-0` | `0 0% 100%` | `#FFFFFF` |
| `neutral-50` | `150 22% 99%` | `#FBFDFC` |
| `neutral-100` | `152 38% 96%` | `#EFF7F3` |
| `neutral-200` | `152 16% 88%` | `#D9E5DF` |
| `neutral-600` | `155 10% 40%` | `#5C6B63` |
| `neutral-900` | `160 25% 10%` | `#14231C` |
| `charcoal-950` | `160 22% 7%` | `#0D1712` |
| `charcoal-900` | `158 18% 10%` | `#151F1A` |
| `charcoal-800` | `158 16% 13%` | `#1B2620` |
| `charcoal-700` | `158 14% 20%` | `#293A32` |
| `danger-500` | `356 72% 52%` | `#DE3651` |
| `success-500` | `152 60% 42%` | `#2BA36F` |
| `warning-500` | `38 92% 50%` | `#F5A623` |
| `info-500` | `199 80% 44%` | `#1690C7` |

Primitives are additive-only; no existing step's value changes without a new
owner-approved audit, per §Token Governance.

## 5. Semantic Tokens

### Background
| Token | Light | Dark |
|---|---|---|
| `color-bg-canvas` | `neutral-50` (`150 22% 99%`) | `charcoal-950` (`160 22% 7%`) |
| `color-bg-subtle` | `neutral-100` (`152 38% 96%`) | `charcoal-800` (`158 16% 13%`) |
| `color-bg-elevated` | `neutral-0` | `charcoal-900` (`158 18% 10%`) |
| `color-bg-inverse` | `charcoal-950` | `neutral-50` |

### Surface
| Token | Light | Dark |
|---|---|---|
| `color-surface-default` | `neutral-0` (card) | `charcoal-900` |
| `color-surface-muted` | `neutral-100` | `charcoal-800` |
| `color-surface-raised` | `neutral-0` + `shadow-md` | `charcoal-800` + `shadow-md` |
| `color-surface-overlay` | `neutral-0` + `shadow-overlay` | `charcoal-900` + `shadow-overlay` |
| `color-surface-interactive` | `neutral-100` (hover fill) | `charcoal-800` (hover fill) |

### Text
| Token | Light | Dark |
|---|---|---|
| `color-text-primary` | `neutral-900` (`160 25% 10%`) | `150 20% 92%` |
| `color-text-secondary` | `155 10% 30%` | `150 12% 78%` |
| `color-text-muted` | `neutral-600` (`155 10% 40%`) | `150 8% 62%` |
| `color-text-inverse` | `neutral-50` | `charcoal-950` |
| `color-text-link` | `evergreen-900` (`160 76% 22%`), underline on hover | `evergreen-700` (`160 55% 45%`) |
| `color-text-disabled` | `155 8% 55%` | `150 6% 45%` |

`color-text-link` uses evergreen, not mint — mint (`--accent`/`mint-500`)
measures 1.96:1 on white (`DESIGN_TOKEN_AUDIT.md` Accessibility Review) and is
disqualified from any direct-text role in the light theme by measured data, not
preference.

### Border
| Token | Light | Dark |
|---|---|---|
| `color-border-default` | `neutral-200` (`152 16% 88%`) | `charcoal-700` (`158 14% 20%`) |
| `color-border-subtle` | `152 20% 93%` | `158 14% 16%` |
| `color-border-strong` | `152 10% 70%` | `158 10% 32%` |
| `color-border-focus` | **`160 76% 30%`** (darkened evergreen, corrected — see §Focus tokens) | `mint-500` (`160 64% 55%` dark-theme value) |

### Action
| Token | Light | Dark |
|---|---|---|
| `color-action-primary` | `evergreen-900` | `evergreen-700` |
| `color-action-primary-hover` | `160 76% 18%` (4pt darker) | `160 55% 50%` (5pt lighter) |
| `color-action-primary-active` | `160 76% 15%` | `160 55% 40%` |
| `color-action-secondary` | `neutral-100` fill, `evergreen-900` text | `charcoal-800` fill, `150 20% 92%` text |
| `color-action-danger` | `danger-500` | `356 65% 55%` |

### Status
| Token | Light | Dark |
|---|---|---|
| `color-status-success` | `152 50% 32%` (**corrected — darkened from `success-500`**; see §24 Accessibility Requirements) | `152 55% 48%` |
| `color-status-warning` | `warning-500`, **fill + dark text only, never as direct small text on light backgrounds** | `38 90% 55%` |
| `color-status-danger` | `danger-500` | `356 65% 55%` |
| `color-status-info` | `info-500`, **large text/icon/badge use only** in light theme (3.53:1) | `199 75% 55%` |
| `color-status-neutral` | `neutral-600` | `150 8% 62%` |

`color-status-success`'s light value is corrected from the raw `success-500`
primitive specifically because the audit measured white-text-on-`success-500`
at 2.92:1 — a documented failure, not a stylistic downgrade. The darkened
value keeps the success hue family while restoring a passing white-text fill;
components must use it as the fill color when white/light text sits on top of a
success badge or button.

## 6. Component Tokens

Component tokens exist so an unsafe primitive/semantic pairing (e.g.
white text directly on `mint-500`) is structurally impossible to reach through
the sanctioned component API, per §5's finding.

| Component token | Resolves to |
|---|---|
| `button-primary-background` | `color-action-primary` |
| `button-primary-text` | `color-text-inverse` |
| `button-primary-background-hover` | `color-action-primary-hover` |
| `button-secondary-background` | `color-action-secondary` |
| `button-outline-border` | `color-border-strong` |
| `button-outline-text` | `color-text-primary` |
| `button-accent-background` | `mint-500` (light) / `mint-500` at dark-theme value — **`button-accent-text` is always `color-text-inverse`'s dark counterpart (`160 30% 12%`), never white** |
| `card-background` | `color-surface-default` |
| `card-border` | `color-border-default` |
| `input-border` | `color-border-default` |
| `input-border-focus` | `color-border-focus` |
| `badge-success-background` / `-text` | `color-status-success` / `color-text-inverse` |
| `badge-warning-background` / `-text` | `color-status-warning` / dark text token (`32 40% 12%`), never inverse-white |
| `nav-link-text` | `color-text-secondary`, active state `color-action-primary` |
| `focus-ring` | `color-border-focus` — see §Focus tokens for the light-theme correction rationale |

`button-accent-background` is the one component token permitted to use raw
`mint-500` as a **fill**, because helpdesk's existing `accent-foreground`
(dark ink) on `accent` pairing measures 7.90:1 (audit §Accessibility Review) —
safe. What is disallowed structurally is ever pairing `mint-500` with white
text or using `mint-500` as a `color-text-*` value; the component-token layer
enforces this by never exposing that combination as an option.

## 7. Light-Theme Values

Canvas `150 22% 99%` warm white, surface `0 0% 100%`, text `160 25% 10%`
charcoal-evergreen, primary action deep evergreen `160 76% 22%`, mint reserved
for accents/focus-safe fills/data — this is `helpdesk`'s existing light theme,
adopted verbatim except for the two corrected tokens (`color-status-success`,
`color-border-focus`) called out above.

## 8. Dark-Theme Values

Canvas `160 22% 7%` deep green-charcoal (never pure black), surface one step
lighter (`158 18% 10%`), text `150 20% 92%`, mint doing more visual work at
`160 64% 55%` — `helpdesk`'s existing dark theme, adopted verbatim. The dark
focus ring already measures 9.96:1 (audit finding) and needs no correction.

## 9. Typography Tokens

| Token | Value |
|---|---|
| `font-display` | `'Playfair Display', 'Plus Jakarta Sans', serif` — headings only, never body copy |
| `font-body` | `'Plus Jakarta Sans', system-ui, sans-serif` |
| `font-mono` | `Menlo, monospace` |
| `text-xs` … `text-9xl` | Adopted verbatim from the identical scale already shared across all four artifacts (audit §6) |
| `weight-regular` / `-medium` / `-semibold` / `-bold` / `-extrabold` | `400` / `500` / `600` / `700` / `800` (helpdesk's fuller weight range, since it is a superset of web-agency's) |
| `leading-tight` / `-normal` / `-relaxed` | `1.1` / per-step computed line-height (already in the scale) / `1.6` (new — for long-form marketing copy, not previously tokenized) |
| `tracking-normal` | `0em` (existing) |

Display sizes use `text-4xl`–`text-7xl` for hero/section headings; body uses
`text-base`–`text-lg`; captions use `text-xs`–`text-sm`. Responsive behavior:
one step down from desktop at `<768px` for any heading `text-4xl` or larger
(e.g. a `text-6xl` hero drops to `text-4xl`/`text-5xl` on mobile) — this
formalizes what marketing pages already do informally.

## 10. Spacing Tokens

Base unit unchanged: `--spacing: 0.25rem` (4px), Tailwind's default scale,
already consistent across all four artifacts (audit §7). No new numeric steps
are introduced. What this spec adds is **named density presets** built from
the existing scale:

| Token | Value | Use |
|---|---|---|
| `space-compact` | `space-2` (8px) | Dense dashboard rows, table cells |
| `space-standard` | `space-4` (16px) | Default component internal spacing |
| `space-section-marketing` | `space-16`–`space-24` (64–96px) | Marketing section vertical rhythm |
| `space-section-dashboard` | `space-6`–`space-8` (24–32px) | Dashboard/CRM section spacing |
| `space-card-padding` | `space-6` (24px) | Card interior padding, both densities |
| `space-form-field-gap` | `space-4` (16px) | Vertical gap between form fields |
| `space-gutter-mobile` | `space-4` (16px) | Mobile page-edge padding |
| `space-gutter-desktop` | `space-8` (32px) | Desktop page-edge padding |

## 11. Layout Tokens

| Token | Value |
|---|---|
| `container-max-marketing` | `1280px` (matches web-agency's dominant `max-w-5xl`≈`64rem`≈`1024px` step up to a `1280px` ceiling per Design doc §14) |
| `container-max-dashboard` | `1360px` (helpdesk's existing convention, Design doc §14) |
| `content-max-prose` | `65ch` (new — not previously tokenized; for long-form marketing/legal copy readability) |
| `grid-columns` | `12`, via Tailwind's native grid utilities — no custom grid framework (Design doc §12) |

## 12. Breakpoint Tokens

Tailwind's stock breakpoints, unchanged, since no artifact has ever actually
overridden them (audit §13 correction of Design doc §13's aspirational
framing): `sm 640px` / `md 768px` / `lg 1024px` / `xl 1280px` / `2xl 1536px`.
This spec does **not** introduce a custom `375px` breakpoint — it does not
exist in Tailwind's config today, and inventing one would be a config change,
out of scope for Phase 1A.

## 13. Radius Tokens

| Token | Value |
|---|---|
| `radius-sm` | `radius-md - 4px` |
| `radius-md` | `radius-lg - 2px` |
| `radius-lg` | **base** — recommended default `0.75rem` (helpdesk's value), see Owner Decisions for the `web-agency` `0rem` conflict this must resolve |
| `radius-xl` | `radius-lg + 4px` |
| `radius-pill` | `9999px` |

This is the one token family this spec cannot fully resolve without an owner
ruling — see the final report's Owner Decisions section. The recommended
default carries `helpdesk`'s value forward per the "foundation" approval, but
`web-agency`'s `0rem` is a real, currently-shipping brand choice, not a bug.

## 14. Border Tokens

| Token | Value |
|---|---|
| `border-width-hairline` | `1px` |
| `border-width-emphasis` | `2px` (used for `color-border-focus` and `.crm-insight-card`-style markers) |
| `border-style` | `solid` only — no dashed/dotted borders identified anywhere in the audit, none proposed |

## 15. Shadow/Elevation Tokens

| Token | Light | Dark |
|---|---|---|
| `shadow-none` | none | none |
| `shadow-sm` | `0 1px 2px 0 rgb(14 40 30 / 0.06)` | `0 1px 2px 0 rgb(0 0 0 / 0.3)` |
| `shadow-md` | `0 4px 8px -1px rgb(14 40 30 / 0.08), 0 2px 4px -2px rgb(14 40 30 / 0.05)` | `0 4px 8px -1px rgb(0 0 0 / 0.35), 0 2px 4px -2px rgb(0 0 0 / 0.25)` |
| `shadow-lg` | `0 10px 15px -3px rgb(14 40 30 / 0.07), 0 4px 6px -4px rgb(14 40 30 / 0.05)` | `0 10px 15px -3px rgb(0 0 0 / 0.35), 0 4px 6px -4px rgb(0 0 0 / 0.25)` |
| `shadow-overlay` | `0 25px 50px -12px rgb(14 40 30 / 0.14)` | `0 25px 50px -12px rgb(0 0 0 / 0.5)` |
| `shadow-glow-subtle` | `0 0 0 1px rgb(52 211 153 / 0.35), 0 8px 24px -6px rgb(52 211 153 / 0.35)` | `0 0 0 1px rgb(52 211 153 / 0.4), 0 8px 28px -4px rgb(52 211 153 / 0.4)` |

Adopted verbatim from helpdesk's authored ramp (audit §9, §25) rather than the
near-flat shadcn defaults `web-agency`/`ai-toolkit`/`mockup-sandbox` currently
carry unmodified. `shadow-glow-subtle` is reserved for the single primary-CTA
emphasis use case per Design doc §16/§Motion Direction — not for general card
hover. **Not every card gets a shadow**: `shadow-none`/`shadow-sm` is the
default for dashboard-density list rows and table cells; `shadow-md`+ is
reserved for genuinely raised surfaces (modals, popovers, the one primary CTA).

## 16. Focus Tokens

`focus-ring-color` = `color-border-focus`; `focus-ring-width` = `2px`;
`focus-ring-offset` = `2px` (matches helpdesk's existing `:focus-visible`
rule). **Correction from raw helpdesk data**: the raw `--ring` value
(`mint-500`, `160 64% 50%`) measures only **1.96:1** against white/near-white
surfaces — a measured failure of the 3:1 non-text minimum (audit
Accessibility Review). This spec sets `color-border-focus` to a darkened
evergreen (`160 76% 30%`) in the light theme specifically to fix that,
while keeping the existing `mint-500`-based dark-theme ring, which already
measures 9.96:1 and needs no change. Focus indicators must never depend on
color alone in addition to the ring itself (already the case — `:focus-visible`
uses an outline, not a color-only background shift).

## 17. Motion Tokens

| Token | Value |
|---|---|
| `duration-instant` | `80ms` (new — for micro-feedback, e.g. checkbox toggle) |
| `duration-fast` | `120ms` (existing `--dur-fast`) |
| `duration-normal` | `200ms` (existing `--dur`, also the most common raw value across all four artifacts per the audit) |
| `duration-slow` | `320ms` (existing `--dur-slow`) |
| `easing-standard` | `cubic-bezier(.2, .8, .2, 1)` (existing `--ease-standard`) |
| `easing-enter` | `cubic-bezier(.2, .9, .1, 1)` (existing `--ease-emphasized`) |
| `easing-exit` | `cubic-bezier(.4, 0, 1, 1)` (new — faster exit than enter, standard motion-design practice, not previously tokenized) |

**Motion budget** (carried from Design doc's "Motion Direction" section,
restated as a binding numeric ceiling): per page, maximum **one**
scroll-triggered reveal sequence, **one** hover-glow CTA treatment
(`shadow-glow-subtle`), standard `duration-fast` card-hover elevate on lists,
count-up animation only for real non-fabricated numeric data, and the
homepage's connected-ecosystem visual is the only platform-wide instance of
interactive storytelling. **Continuously running** animation (looping,
ambient) is not permitted anywhere in MVP — every animation must be
state-triggered (hover, focus, scroll-into-view, route change) and settle.
Cursor-responsive lighting and mesh-gradient movement remain evaluated-but-not-
approved (Design doc, unchanged by this spec). All motion gates on
`prefers-reduced-motion: reduce` → fades only, no transforms, no count-up
(existing rule, now binding platform-wide, not just in helpdesk).

## 18. Z-Index Tokens

Derived from the actual values already in use (audit §13):

| Token | Value | Use |
|---|---|---|
| `z-base` | `0` | Default stacking context |
| `z-raised` | `10` | Sticky headers, elevated cards |
| `z-dropdown` | `20` | Dropdown menus, popovers |
| `z-overlay` | `40` | Backdrop scrims |
| `z-modal` | `50` | Dialogs (matches the existing dominant `z-50` convention) |
| `z-toast` | `100` | Toast notifications (matches existing `z-[100]`) |
| `z-tooltip` | `200` | Tooltips, top of stack (matches existing `z-[200]`) |

## 19. Icon Sizing

`lucide-react` only, platform-wide (audit confirms it is already the only icon
library with real usage; `react-icons` is dead weight in three artifacts).
Sizes: `icon-xs` `14px`, `icon-sm` `16px`, `icon-md` `20px` (default),
`icon-lg` `24px`, `icon-xl` `32px` — stroke width fixed at `1.75` (lucide
default) platform-wide for visual consistency.

## 20. Marketing-Density Rules

Generous whitespace: `space-section-marketing` between sections, `text-4xl`+
hero headings, `container-max-marketing` (1280px), fewer elements per
viewport, `shadow-md`+ used sparingly (hero cards, pricing highlight only).
Motion budget applies at full allowance (marketing is where the one
scroll-reveal and one glow-CTA per page are spent).

## 21. Dashboard-Density Rules

Compact: `space-section-dashboard` between sections, `space-compact` within
table rows, `container-max-dashboard` (1360px), more elements per viewport,
`shadow-none`/`shadow-sm` default (elevation reserved for modals/popovers,
never ambient card floating). Motion budget is deliberately smaller than
marketing's — no scroll-reveal sequences in dashboards; only
`duration-fast` hover/focus feedback and state transitions.

## 22. Product Accent Rules

Mint (`mint-500`) remains the SiteMint umbrella accent and AI Receptionist's
product accent (unchanged — Design doc §40, Blueprint §20). Per Design doc
§40's existing rule (a future product should choose an adjacent-but-distinct
hue, never mint itself):

| Product | Accent status |
|---|---|
| AI Receptionist | Mint (`mint-500`) — existing, canonical, unchanged |
| Web & App Services | No distinct accent — services pages use the core evergreen/mint system directly, since services are SiteMint-delivered work on the customer's own asset, not a separate product identity |
| SiteMint CRM/Admin | No distinct accent — CRM is internal tooling for the whole company, not a product with its own identity; it inherits the shared system plus its existing fixed-dark chrome tokens (`crm-sidebar`/`crm-header`/`crm-content`), which this spec preserves as-is (audit §4) |
| AI Toolkit | Candidate for a controlled secondary accent — see Owner Decisions in the final report; this spec does not assign one unilaterally |

Accents are permitted in: illustrations, charts, small status details,
product-specific diagrams, selected hero treatments. Accents are **not**
permitted in: global navigation identity, the primary company CTA, ordinary
body text, security/status meaning (status tokens are semantic, not
accent-driven), or accessibility focus indicators (`color-border-focus` is
fixed platform-wide, never swapped per product).

## 23. Chart-Color Rules

Adopt helpdesk's existing 6-step chart palette (`chart-1`…`chart-6`,
audit §4) as the shared chart token set: `chart-1` mint, `chart-2` evergreen,
`chart-3` teal, `chart-4` amber, `chart-5` coral, `chart-6` slate — already
designed as a distinguishable categorical sequence anchored to the brand
rather than a generic rainbow. Charts never use `color-status-*` tokens
directly (a chart series is not a status), and status colors never get
reused as arbitrary chart series to avoid implying false meaning (e.g. a
chart series rendered in `color-status-danger` would visually claim "this is
an error," which is rarely the intent of a data series).

## 24. Accessibility Requirements

- Every semantic color pairing shipped in a component must have a measured
  contrast ratio on record before use (per `DESIGN_TOKEN_AUDIT.md`'s
  Accessibility Review) — no new pairing ships un-measured.
- Minimum AA: 4.5:1 for body text, 3:1 for large text (≥24px/19px bold) and
  non-text UI indicators (focus rings, icon-only buttons).
- `mint-500` is disqualified from any direct-text role and from white-text
  fill use in the light theme, platform-wide, based on the audit's measured
  1.96:1 result — this is not a style preference, it is a numeric floor.
- `color-status-success`'s light value is the corrected (darkened) variant,
  not the raw primitive, specifically to keep a white-text success fill legal.
- State is never conveyed by color alone (existing rule, Design doc §8,
  restated as binding here for every new component token).
- Disabled controls must pair a passing-contrast muted style with a
  non-visual signal (`aria-disabled`/`disabled`), since color alone is
  measured adequate (4.78:1–5.28:1) but insufficient as the sole cue.

## 25. Reduced-Motion Requirements

`prefers-reduced-motion: reduce` must disable all transform-based and
scroll-triggered motion platform-wide (currently implemented in `helpdesk` and
`web-agency` only — the audit flags `ai-toolkit` and `mockup-sandbox` as
missing this media query; closing that gap is Phase 1 implementation work, not
this checkpoint). Under reduced motion: opacity-only fades survive, all
transform/scale/translate animation is removed, count-up numeric animation is
replaced with the final value shown immediately.

## 26. Token Governance

- Primitive tokens are additive-only; changing an existing primitive's value
  requires a new accessibility/contrast pass equivalent to this audit, not a
  quick edit.
- Semantic tokens may be remapped to different primitives (e.g. a future
  rebrand) without touching component code, provided the new pairing is
  re-measured for contrast first.
- Component tokens are the only layer application code should reference for
  anything with a safety-relevant pairing (text-on-fill); new component
  tokens require sign-off from whoever owns accessibility review for the
  platform (role, not a name, since this is a documentation-only checkpoint).
- Any new token proposal must state: which layer it belongs to, what it
  resolves to, and its measured contrast ratio if it is a color used with
  text or as a non-text UI indicator.

## 27. Deprecation Rules

- A raw/legacy value (e.g. `web-agency`'s undocumented blues) is marked
  deprecated in code comments at first migration touch, not deleted
  pre-emptively.
- A deprecated value is only removed once its usage count reaches zero,
  verified by the same kind of grep-based inventory this audit used — never
  by a global search-and-replace (binding rule, task brief + Blueprint §22).
- `react-icons` and unused `framer-motion` installs are flagged deprecated by
  this spec but their removal is explicitly deferred to a future cleanup
  phase, not Phase 1A/1B.

## 28. Migration Rules

Never a global find-and-replace. Every migration stage (see §Migration
Strategy below) touches one bounded surface, ships one reviewable commit, and
is visually/accessibility verified before the next stage starts — this
mirrors the Cross-Phase Rules already binding in `IMPLEMENTATION_ROADMAP.md`.

## 29. Future Component-Package Direction

Not built in Phase 1A or 1B. Recommended eventual shape (Design doc §45,
carried forward): a `lib/design-tokens` package exporting the CSS custom
properties plus a Tailwind v4 `@theme` fragment every artifact imports, and a
later `lib/ui` package for the first genuinely shared components
(`SiteMintLogo`, `Button`, `Card`, `Badge`, `EmptyState`, `ErrorBoundary`) once
the token layer has proven itself in the Phase 1B pilot. Page-specific layout
and nav content remain per-artifact indefinitely — this spec does not propose
a single shared frontend (Blueprint §4, §11 — federated model preserved).

## 30. Acceptance Criteria for Phase 1B

1. A shared token source exists (location TBD in Phase 1B's own scoping, per
   `IMPLEMENTATION_ROADMAP.md` Phase 1A entry) containing every primitive,
   semantic, and component token in this spec, both themes.
2. The pilot application (recommended: `helpdesk` — see below) consumes the
   shared source with **zero visual regression**: every current helpdesk
   screen renders identically pixel-for-pixel where this spec did not
   intentionally change a value (i.e., everywhere except the two corrected
   tokens, `color-status-success` and `color-border-focus`).
3. Both corrected tokens are verified in the browser, light and dark, with a
   contrast-checker tool, not just computed offline.
4. No console errors on any pilot route, light and dark.
5. `pnpm run typecheck` and the pilot artifact's build both pass.
6. `git diff` on every `CLAUDE.md`-protected file is zero lines.
7. Rollback plan documented and tested (revert the single Phase 1B commit).

---

## Color Direction — Confirmed

Per the already-approved starting foundation (Blueprint §24 Decision #6/#14)
and this spec's corrections above: deep evergreen primary, warm-neutral light
surfaces, charcoal text, mint reserved for accents/safe fills/focus-adjacent
(not the focus ring itself, per §16)/data visualization — refined, not a
neon/cyan/purple-blue-SaaS-gradient system, and never a body-text or ambient
green wash. `web-agency`'s blue is retired gradually per the existing Migration
Strategy (§below), never in one step.

## Theme Strategy

- **Root theme selector**: `.dark` class on `<html>`, matching helpdesk's
  existing, working mechanism — no new mechanism invented.
- **System theme behavior**: default to OS preference (`prefers-color-scheme`)
  on first visit, exactly as `next-themes`' `system` mode already does in
  helpdesk.
- **Manual override**: user-selectable Light/Dark/System, persisted via
  `next-themes`' existing `localStorage` mechanism.
- **No-flash**: `next-themes`' existing inline-script-before-hydration
  approach, already proven in helpdesk — adopt verbatim, do not re-invent.
- **Server-rendering considerations**: not applicable today — every artifact
  is a client-rendered Vite SPA, no SSR exists in this repo to reconcile
  against.
- **Shared tokens across products**: identical token values; **product-specific
  overrides** are limited to the CRM's fixed-dark chrome (`crm-sidebar`/
  `crm-header`/`crm-content`, which intentionally ignores the light/dark
  toggle, per existing code comment and audit §4) and to `ai-toolkit`'s
  forced-dark-only mode, both preserved as deliberate exceptions, not
  errors, per §Owner Decisions in the final report (CRM theme default).
- **Accessibility**: both themes must independently pass the same contrast
  bar (§24 above) — a theme is not exempt from review just because it is the
  "off" default.

**Not changed by this document**: no application currently wires a live theme
toggle onto `web-agency` or `ai-toolkit`; this spec documents how one *would*
work if built, it does not build it.

## Migration Strategy

Phased, narrow-scope, one reviewable commit per stage, matching
`IMPLEMENTATION_ROADMAP.md`'s Cross-Phase Rules:

| Stage | Scope | Risk | Visual regression test | Accessibility test | Rollback |
|---|---|---|---|---|---|
| 1. Introduce shared primitive + semantic tokens | New shared source only, no consumer wired yet | None — nothing consumes it yet | N/A | N/A | Delete the new source |
| 2. Map existing helpdesk values | helpdesk's `index.css` re-points at the shared source, same resolved values except the 2 corrected tokens | Low | Full helpdesk route walkthrough, light + dark | Re-measure the 2 corrected pairs live | Revert the single commit |
| 3. Migrate shared controls | Any genuinely shared primitive component extracted in Phase 1B+ | Low–Medium | Component-level visual diff | Contrast spot-check on migrated components | Revert; helpdesk-local copy still exists until this stage is verified |
| 4. Migrate public global shell | web-agency Navbar/Footer only | Medium | Full-page diff on every public route | Nav text, link, CTA contrast | Revert; old Navbar/Footer file kept until verified |
| 5. Migrate marketing pages | web-agency `/`, `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`, `/discovery` | Medium–High (567 raw literals to reconcile) | Full visual diff, page-by-page, no batch replace | Full contrast pass on new blue→evergreen mappings | Revert per-page; never a single all-pages commit |
| 6. Migrate AI Receptionist | helpdesk dashboard, already closest to target — mostly verification, not conversion | Low | Route walkthrough, light + dark | Confirm no regression from stage 2 | Revert |
| 7. Migrate AI Toolkit | ai-toolkit's forced-dark palette re-pointed at shared dark tokens | Low–Medium | Full-page diff (3 routes only) | Contrast pass on forced-dark surfaces | Revert |
| 8. Migrate CRM/admin | web-agency `/admin/*`, preserving fixed-dark chrome tokens | Medium (CRM is the largest surface by route count) | Section-by-section diff (leads, deals, pipeline, etc.), not all at once | Table/badge/status contrast pass | Revert per-section |
| 9. Remove deprecated raw values | Only after grep-verified zero remaining usage | Low, if stages above were done correctly | Full build + typecheck | N/A (no rendering change expected) | Revert; old values still in git history |

No stage performs a global search-and-replace of colors, per explicit task
instruction and Blueprint §22's binding preservation rule.

## Phase 1B Definition

**Recommended pilot: `helpdesk` (AI Receptionist dashboard).** The audit
confirms the expected candidate is correct: helpdesk already holds the most
complete, already-tested value set (full semantic + status tokens, working
dark mode, disciplined raw-color usage — 18 literals total, nearly all
non-token shadow/glow values). Piloting there means Phase 1B is primarily
**extraction and verification** (move existing good values into a shared
source, confirm zero regression) rather than **new design work** — the
lowest-risk possible pilot, consistent with the migration strategy's
risk-ascending order above (helpdesk is stage 2 and 6, both low-risk; the
blue-heavy `web-agency` marketing pages are correctly sequenced later, at
stage 5).

Phase 1B, narrowly scoped (not started in this checkpoint):
1. Create the shared token source (exact package location is Phase 1B's own
   decision, per `IMPLEMENTATION_ROADMAP.md`'s Phase 1A entry).
2. Re-point helpdesk's `index.css` at it (Migration Strategy stage 2).
3. Prove light/dark behavior unchanged except the two corrected tokens.
4. Prove accessibility: live-measure the corrected pairs in a real browser,
   not just computed offline as this document does.
5. Prove zero functional regression: `pnpm run typecheck`, helpdesk build,
   full route walkthrough, zero console errors, zero-line diff on every
   `CLAUDE.md`-protected file.

Do not implement Phase 1B in this checkpoint.
