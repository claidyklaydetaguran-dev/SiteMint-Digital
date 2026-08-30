# SiteMint Platform — Design Token Audit

> **Checkpoint**: Phase 1A (design-token audit and shared token specification).
> **Status**: documentation only. No CSS, Tailwind configuration, component, or
> application file is modified by this document. All findings below are grounded
> in direct inspection of the repository at commit
> `8a8fcd2835ed30f8d9a1ab4fb4847dfd69d834e0` (branch
> `claude/sitemint-design-token-audit-r4r2af`, child of
> `claude/sitemint-platform-blueprint-j6snjs`).
> **Companion document**: `SHARED_DESIGN_TOKENS_SPEC.md` (the proposed token
> architecture this audit justifies).
> **Addendum (Phase 1A.1)**: every owner decision this audit left open
> (radius personality, theme defaults per product, AI Toolkit accent, mint
> usage tiers, typography roles, motion intensity, icon/package handling,
> visual personality, helpdesk-foundation status, Phase 1B pilot scope) is
> now **resolved** — see `SHARED_DESIGN_TOKENS_SPEC.md`'s "Owner Decisions —
> Resolved (Phase 1A.1)" section, the single source of truth for those
> answers. This audit document is left as the factual record of the
> repository's state at Phase 1A and is not rewritten to describe a future
> state — no code changed between Phase 1A and Phase 1A.1.

---

## 1. Executive Summary

SiteMint Digital currently ships **four independent Tailwind v4 CSS-variable token
systems** — one per Vite artifact (`web-agency`, `helpdesk`, `ai-toolkit`,
`mockup-sandbox`) — with no shared package and no single source of truth. They
share a structural shape (the same shadcn/Tailwind v4 `@theme inline` pattern,
the same type-scale variable names, the same elevation-utility CSS) but disagree
on nearly every actual value: primary hue, background warmth, radius personality,
shadow tinting, and whether dark mode exists at all.

`helpdesk` is the most mature system: it is the only artifact with a real,
wired-up light/dark theme switch (`next-themes` + `ThemeProvider` + `ThemeToggle`),
the only one with semantic status tokens (`success`/`warning`/`info`) beyond
`destructive`, and the only one where color usage in components is disciplined —
18 raw hex literals in its entire `src/` tree, almost all in non-token contexts
(shadows, chart placeholders). `web-agency` is the least disciplined: **567 raw
hex color literals and 232 inline `rgba()`/`hsl()` calls** across its `src/`
tree, a second, entirely different blue-based color identity in its own
`index.css`, and 30 arbitrary-value Tailwind color utilities (`bg-[#...]`,
`text-[#...]`) bypassing the token layer it does define. `ai-toolkit` reuses
`helpdesk`'s mint as its `--primary` but is otherwise a stripped-down, dark-only
palette. `mockup-sandbox` still ships the unmodified shadcn/Tailwind starter
palette (`--primary: 240 5.9% 10%`, near-black/near-white) plus its own
component-local mockup palette (89 arbitrary bracket colors) — it is dev-only
tooling, not a product surface, and is excluded from migration scope.

The blueprint's Checkpoint P0.1 decision (Decision #14) already approved
`helpdesk`'s evergreen/mint token system as the **starting foundation** for a
shared platform system, pending exactly this accessibility/contrast/quality
review. That review is now complete (§Accessibility Review below). The system is
sound as a foundation with two concrete defects that the shared spec must fix
rather than inherit: (1) the bright-mint `--accent` token fails contrast as a
text or solid-fill-with-white-text color (1.96:1) and must remain restricted to
non-text/large-scale use exactly as `DESIGN_SYSTEM_DIRECTION.md` §8 already
prescribes; (2) the mint focus ring fails the 3:1 non-text contrast minimum
against white/near-white surfaces (1.96:1) and needs a darker or dual-tone focus
treatment in the light theme.

## 2. Audit Scope

In scope: every Tailwind/CSS token file, every raw color/spacing/radius/shadow
value reachable from a rendered SiteMint or AI Receptionist or AI Toolkit surface,
and `mockup-sandbox` as internal-tooling context (not as a migration target).
Out of scope (per task instructions and `CLAUDE.md` protected-file list): any
code change, any CSS change, any Tailwind config change, `lib/db`, auth, routes,
deployment. This document does not touch or read `.env` files; none were
inspected beyond confirming `.env.example` files exist and no live secret file
is present (see §Verification in the final report).

## 3. Application-by-Application Inventory

| Artifact | Route(s) served | Token file | Dark mode | Status token set | Raw hex count in `src/` | Arbitrary bracket color utilities |
|---|---|---|---|---|---|---|
| `web-agency` (marketing) | `/`, `/services`, `/pricing`, `/portfolio`, `/about`, `/contact`, `/discovery`, `/ai-receptionist*` | `artifacts/web-agency/src/index.css` | Token exists (`.dark` block) but **not wired** — no `ThemeProvider`/toggle in the app; `next-themes` import is only in unused shadcn `sonner.tsx` boilerplate | `destructive` only | 567 | 30 |
| `web-agency` (CRM/admin) | `/admin/*`, `/admin/crm/*` | same file, plus dedicated `--crm-sidebar` / `--crm-header` / `--crm-content` fixed-dark-chrome tokens | CRM shell is intentionally fixed-dark regardless of light/dark mode (explicit code comment: "does not follow light/dark mode") | `destructive` only | (counted above, shared file/tree) | (counted above) |
| `helpdesk` (AI Receptionist dashboard) | `/ai-receptionist/dashboard/*` | `artifacts/helpdesk/src/index.css` | Fully implemented: `ThemeProvider.tsx`, `ThemeToggle.tsx`, wired in `App.tsx`, Light/Dark/System | `success`, `warning`, `info`, `destructive` | 18 | 3 |
| `ai-toolkit` | `/`, `/thank-you`, `/cancel` (standalone SPA, unlinked from main nav) | `artifacts/ai-toolkit/src/index.css` | **Forced dark-only** — `:root` hardcodes the dark palette, `.dark {}` block is empty with a comment confirming this is intentional | `destructive` only | 10 | 0 |
| `mockup-sandbox` | internal dev tool only, not deployed as a product surface | `artifacts/mockup-sandbox/src/index.css` | Unmodified shadcn starter light/dark (`240 5.9% 10%` primary — generic near-black, not SiteMint brand) | `destructive` only | 100 | 89 |
| Shared components | none — no shared UI package exists today; each artifact vendors its own copy of shadcn primitives | n/a | n/a | n/a | n/a | n/a |

No `tailwind.config.{js,ts}` file exists in any artifact — all four use Tailwind
v4's CSS-first `@import "tailwindcss"` + `@theme inline` configuration model
directly inside `index.css`. This is consistent across all four and is itself a
convergence point worth preserving (see §28).

## 4. Existing Token Systems

All four `index.css` files share the same **structural** pattern: an `@theme
inline` block mapping `--color-*`/`--text-*`/`--radius-*` Tailwind theme keys to
raw `hsl(var(--x))` CSS custom properties defined in `:root` and `.dark`. This
is the shadcn/Tailwind v4 convention, not a SiteMint-specific design, and it is
implemented independently four times rather than shared. `helpdesk` and
`web-agency` both extend the base shadcn set with `--surface`/`--surface-muted`
(helpdesk only), `--card-border`/`--popover-border`/`--sidebar-*-border`
(all four, via an `hsl(from ...)` relative-color border-darkening trick — a
genuinely reusable, implemented-and-working pattern), and status colors
(`--success`/`--warning`/`--info`, helpdesk only). `web-agency` uniquely adds
`--crm-sidebar`/`--crm-header`/`--crm-content` for the fixed-dark CRM chrome —
a legitimate product-specific token set with no equivalent need in the other
three artifacts.

## 5. Existing Raw Color Usage

| Artifact | Hex literals (`src/`) | Inline `rgb()`/`rgba()`/`hsl()` (`.tsx`/`.ts`) | Arbitrary bracket color utilities |
|---|---|---|---|
| `web-agency` | 567 | 232 | 30 |
| `helpdesk` | 18 | 0 | 3 |
| `ai-toolkit` | 10 | 3 | 0 |
| `mockup-sandbox` | 100 | 0 | 89 |

`web-agency`'s raw-color volume is the single largest audit finding. Its most
frequent literals (`#062e71`, `#0a3d91`, `#1249a8` — variants of a deep blue not
present in its own token file at all; `#6366f1` indigo; `#f2f6fd`/`#e4ecfb`/
`#dce8f9` light-blue tints; `#1e293b`/`#0f1729` slate darks) indicate a second,
undocumented blue-based visual identity layered on top of the tokenized one,
most likely concentrated in hero/marketing sections built with bespoke inline
gradients rather than token-driven `bg-primary`/`bg-accent` utilities. `#34d399`
and `#10b981` (mint/emerald) also appear 19 and 24 times respectively — evidence
that some `web-agency` surfaces already reach for mint informally, ahead of any
approved token migration. `helpdesk`'s 18 hex literals are overwhelmingly
shadow/glow color literals already visible in `index.css` itself (`rgb(52 211
153 / …)` for `--shadow-mint-glow`) plus a handful of one-off chart/status swatch
placeholders (`#f59e0b`, `#ef4444`, `#ec4899`, `#8b5cf6`) — low-volume, low-risk.
`mockup-sandbox`'s 100 hex literals are its own mockup-specific palette
(`#2563EB`, `#B8860B`, `#FAF7F2`) used to preview *other* possible SiteMint
directions — internal tooling only, not a production regression risk, and out of
migration scope.

## 6. Existing Typography Systems

| Artifact | Body/UI family | Display family | Loaded weights |
|---|---|---|---|
| `web-agency` | Plus Jakarta Sans | Playfair Display | 300–700 (sans), 400–700 + italic 400 (serif) |
| `helpdesk` | Plus Jakarta Sans | Playfair Display | 400–800 (sans), 500–700 (serif) |
| `ai-toolkit` | Plus Jakarta Sans | Playfair Display | 300–700 / 400–700+italic (identical `@import` to web-agency) |
| `mockup-sandbox` | Inter (shadcn default, never overridden) | Georgia (shadcn default) | n/a |

Three of four artifacts already agree on the same two Google Fonts family
choices; only weight ranges differ (helpdesk goes up to 800, others stop at 700).
`mockup-sandbox` never adopted the SiteMint font pair — it is still running the
unmodified shadcn scaffold default, consistent with it being pre-brand internal
tooling. All four artifacts define an **identical** `--text-xs` through
`--text-9xl` type scale (verbatim, including the same computed line-heights) —
this is the strongest existing convergence point in the entire audit and should
be adopted as-is rather than redesigned (see §28).

## 7. Existing Spacing Systems

All four artifacts set `--spacing: 0.25rem` (Tailwind's default 4px base unit)
and use standard Tailwind spacing utilities (`p-4`, `gap-6`, etc.) — no
artifact defines a custom spacing scale or overrides Tailwind's default steps.
No dedicated section-padding or container-gutter token exists anywhere; those
values are expressed ad hoc per component via `py-24`, `px-6 md:px-8`, etc.
Container widths are likewise expressed inline rather than tokenized: `max-w-5xl`
is web-agency's most common ceiling (20 occurrences), `max-w-2xl` is helpdesk's
(10 occurrences) — consistent with marketing pages using wider hero/section
containers than dashboard content panels, but nowhere written down as an
intentional rule before `DESIGN_SYSTEM_DIRECTION.md` §41.

## 8. Existing Radius Systems

| Artifact | `--radius` base | Effective card / control / pill |
|---|---|---|
| `web-agency` | `0rem` | Sharp/square corners everywhere (`--radius-sm` computes to a **negative** value, `calc(0rem - 4px)`, which Tailwind clamps to `0`) |
| `helpdesk` | `.75rem` (12px) | Cards ~12px, controls ~8px (`--radius-md`), pills full |
| `ai-toolkit` | `0.5rem` (8px) | Cards ~8px |
| `mockup-sandbox` | `.5rem` (8px, shadcn default) | Cards ~8px |

This is a real, visible brand-personality conflict, not just a numeric
inconsistency: `web-agency`'s `0rem` base means every `web-agency` surface today
renders with hard, squared corners (an intentional-looking but undocumented
"sharp/architectural" choice), while `helpdesk` renders with soft 12px corners
("premium/rounded" choice). These read as two different products because,
today, they are.

## 9. Existing Shadows and Elevation

`helpdesk` defines a full green-tinted `--shadow-2xs` through `--shadow-2xl`
ramp (`rgb(14 40 30 / …)`) plus a signature `--shadow-mint-glow` used for
primary-CTA emphasis, distinct light/dark values, and a working `hover-elevate`/
`active-elevate` utility layer (`::before`/`::after` overlay technique, shared
verbatim — byte-for-byte identical CSS — across all four artifacts' `index.css`
files, indicating it was copy-pasted from a common scaffold rather than
independently authored). `web-agency`, `ai-toolkit`, and `mockup-sandbox` all
carry near-flat, near-invisible shadows (opacity 0.02–0.1, offsets like `0px 2px
0px 0px`) inherited unmodified from the shadcn starter — these read as
essentially flat/no-elevation in practice, which is a legitimate "restrained"
choice for a marketing site but was never a deliberate design decision; it is
the *absence* of one.

## 10. Existing Borders and Dividers

All four use a single hairline `--border` token consumed via Tailwind's
`@apply border-border` global rule (`* { @apply border-border; }` in every
`@layer base`) — this is consistent and low-risk. Contrast of that hairline
border against card background is intentionally low (light theme: 1.28:1,
computed in §Accessibility Review) because borders are decorative dividers, not
text — this is expected and not an accessibility defect on its own, but it does
mean borders alone are not a reliable focus/selection indicator (relevant to
§Focus tokens in the companion spec).

## 11. Existing Theme Behavior

Only `helpdesk` has a real, user-facing theme switch. `web-agency` defines a
complete `.dark` block that is **entirely dead code today** — no component ever
adds the `.dark` class, and the app's only `next-themes` import is inert
boilerplate inside a vendored `sonner.tsx` toast component. `ai-toolkit`
deliberately forces its dark palette in `:root` itself and ships an empty `.dark
{}` block with a code comment confirming the choice is intentional (a dark-only
checkout experience). `mockup-sandbox` has a working generic shadcn dark toggle
but it previews the unbranded default palette, not a SiteMint one.

## 12. Existing Motion Behavior

`framer-motion` is installed as a dependency in **all four** artifacts but only
actually imported in `web-agency` (15 files) — `helpdesk`, `ai-toolkit`, and
`mockup-sandbox` ship the dependency unused, inflating each artifact's install
footprint for no runtime benefit. No artifact uses a second motion library.
Transition durations are expressed as raw Tailwind utility classes
(`duration-200`, `duration-300`, `duration-500`, occasionally `duration-1000`)
with no shared duration token — `duration-200` is the most common value in
every artifact (a real, if informal, convergence point). `prefers-reduced-motion:
reduce` is handled today only in `helpdesk`'s and `web-agency`'s `index.css`
(`ai-toolkit` and `mockup-sandbox` do not define the media query at all — a gap,
though low-risk since neither ships heavy scroll-triggered motion).

## 13. Existing Breakpoints and Containers

No artifact defines custom Tailwind breakpoints — all four use Tailwind's stock
`sm`/`md`/`lg`/`xl`/`2xl` breakpoints (`640/768/1024/1280/1536px`), used
extensively (`web-agency`: 248 responsive-prefix occurrences; `helpdesk`: 115;
`ai-toolkit`: 69; `mockup-sandbox`: 54). `DESIGN_SYSTEM_DIRECTION.md` §13's
claim of a tested `375/768/1024/1280+` convention describes the *design intent*
tested during helpdesk build-out, not a literal custom Tailwind config — no code
enforces those exact numbers today, Tailwind's stock scale is what is actually
shipping.

## 14. Existing Component Patterns

Every artifact vendors its own local copy of the same shadcn/Radix primitive
set (`Button`, `Card`, `Dialog`, `Badge`, `Table`, `Popover`, `Sonner` toast,
etc.) — there is no shared component package, so any primitive-level fix (e.g. a
button focus-ring correction) must currently be applied four times by hand.
`helpdesk` additionally has product-specific composite patterns with no
equivalent elsewhere: `DataTable`, `StatusBadge`/`Tag`, `EmptyState` (diamond-mark
illustration + Playfair title + CTA), and a three-tier error-state system
(global boundary / section inline / field-level). `web-agency`'s CRM adds one
component pattern with no `helpdesk` equivalent: `.crm-insight-card` /
`.crm-insight-dot`, a left-border-accent marker (`hsl(var(--chart-2))`) used to
flag AI-computed insight cards (DISC, Lead Health Score, etc.) versus plain CRUD
cards — a reusable semantic pattern (computed-vs-manual data marking) worth
preserving as a named token/utility in the shared spec rather than a
component-local hack.

## 15. Existing Dashboard-Density Patterns

`helpdesk` and the CRM (`web-agency` `/admin/*`) are the two dashboard-density
surfaces in the repo. Both lean on `max-w-2xl`-scale content containers (versus
marketing's `max-w-5xl`) and denser card/table layouts, but neither has a
written density rule — the difference exists today as an artifact of who built
each screen, not as an enforced convention. `DESIGN_SYSTEM_DIRECTION.md` §41
already proposes making this explicit; this audit confirms the underlying data
supports that proposal.

## 16. Existing Marketing-Page Patterns

`web-agency`'s public pages and `ai-toolkit`'s landing page are the two
marketing-density surfaces. Both use generous `py-16`–`py-24`-class section
padding and wide hero containers, consistent with the "generous whitespace,
larger type" principle already stated in the design direction doc. `ai-toolkit`
uses this pattern on a forced-dark background, which is a legitimate but
untested product-specific variant (dark-first marketing) not present anywhere
else in the platform.

## 17. Duplicated Values

- The entire `hover-elevate`/`active-elevate`/`toggle-elevate` CSS utility block
  (~70 lines) is duplicated byte-for-byte across all four `index.css` files.
- The full `--text-xs` … `--text-9xl` type-scale block (with identical computed
  line-heights) is duplicated across all four files.
- The `--*-border` relative-color darkening trick (`hsl(from hsl(var(--x)) h s
  calc(l + var(--opaque-button-border-intensity)) / alpha)`) is duplicated
  across all four files for `sidebar-primary`, `sidebar-accent`, `primary`,
  `secondary`, `muted`, `accent`, `destructive`.
- `#34d399`/`#34D399` (mint) appears as a raw literal in three of four artifacts
  (`web-agency`, `helpdesk`, `ai-toolkit`) even though it is already a proper
  token (`--accent: 160 64% 50%`) in three of those same files — evidence of
  token bypass, not token absence.
- `duration-200` is the single most common transition duration in all four
  artifacts independently, without ever being named as a shared token.

## 18. Conflicting Values

| Token role | `web-agency` | `helpdesk` | `ai-toolkit` | `mockup-sandbox` |
|---|---|---|---|---|
| `--primary` (light) | `218 90% 23%` (deep blue) | `160 76% 22%` (deep evergreen) | `160 64% 50%` (mint, forced-dark only) | `240 5.9% 10%` (near-black, unbranded) |
| `--radius` | `0rem` | `.75rem` | `.5rem` | `.5rem` |
| Dark mode | dead code | fully wired | forced-on | generic shadcn toggle |
| Status tokens | `destructive` only | `success`/`warning`/`info`/`destructive` | `destructive` only | `destructive` only |

This table is the concrete evidence behind Blueprint §22's "two different
SiteMint color identities exist in the wild" risk statement.

## 19. Accessibility Risks

See the full contrast table in §Accessibility Review below. Headline risks:
mint (`--accent`) as body text or as a white-text button fill both fail AA;
the light-theme focus ring fails the 3:1 non-text minimum; `--warning` fails
badly as direct text-on-white (2.14:1) though it currently is only used as a
background fill with dark text, which passes.

## 20. Contrast Risks

Concentrated in three roles: mint/accent used outside its approved "accent
only, never body text, never white-on-mint" lane; the semantic `success` token
used as a white-text fill (2.92:1, below AA even for large text in the light
theme); the light-theme focus ring. None of these are currently shipping as
end-user-facing defects in `helpdesk` (its component code already avoids the
unsafe combinations per `DESIGN_SYSTEM_DIRECTION.md` §8's existing rule) — the
risk is that a shared token package, once available, gets consumed carelessly
by a *new* surface (e.g. `web-agency` re-theming) without the same discipline.

## 21. Performance Risks

`framer-motion` shipped-but-unused in three of four artifact bundles is the
concrete, measurable performance risk found (each artifact bundles its own
copy regardless of use, since there is no shared runtime — see Blueprint §11).
`react-icons` is installed in `web-agency`, `helpdesk`, and `ai-toolkit`
`package.json` files but has **zero import sites** in any of the three — pure
dead weight, safe to remove in a future cleanup pass (out of scope for this
documentation-only checkpoint). Google Fonts are loaded via `@import url(...)`
inside CSS in every artifact, which is render-blocking versus a `<link
rel="preload">`/`rel="stylesheet">` pattern — a real, currently-unmeasured
performance cost repeated four times with no shared font-loading strategy.

## 22. Dark-Theme Risks

`web-agency`'s complete-but-dead `.dark` block is the primary risk: if a future
phase enables dark mode on `web-agency` by simply adding the class toggle
without re-auditing, its dark palette has never been contrast-tested or visually
reviewed (unlike helpdesk's, which was). `ai-toolkit`'s forced-dark approach
means it has no light-theme fallback at all — acceptable as a deliberate
product choice today, but it means any shared light-theme token work does not
automatically benefit `ai-toolkit`'s customer-facing experience.

## 23. Mobile-Layout Risks

No artifact defines custom breakpoints, so mobile behavior is governed entirely
by Tailwind's stock `sm` (640px) cutoff plus component-level responsive
utilities. No systemic mobile-layout defect was identified in this
documentation-only audit (verifying actual rendered mobile layouts is out of
scope for Phase 1A — this is a token/value audit, not a rendered-UI QA pass);
the risk flagged here is structural: with zero shared breakpoint tokens,
"mobile gutter" and "mobile section spacing" values are chosen independently in
each artifact today (§7), which is the same duplication risk as colors, just
lower-visibility.

## 24. Branding Inconsistencies

The clearest brand-identity conflict in the repository: `web-agency`'s own
token file still defines and (partially) uses a deep-blue primary
(`218 90% 23%`) while its component code additionally leans on raw indigo
(`#6366f1`) and additional undocumented blues (`#062e71`, `#0a3d91`,
`#1249a8`) that exist in **no token file at all**. Meanwhile `helpdesk` and
`ai-toolkit` already both center on evergreen/mint. A visitor moving from
`sitemintdigital.com` to the AI Receptionist dashboard today sees two
unrelated color identities in the same session — precisely the "public
confusion risk" the blueprint calls out (Blueprint §22).

## 25. Existing Elements Worth Preserving

- `helpdesk`'s full neutral/semantic/accent token set, contrast-checked and
  dark-mode complete (adopt as the primitive/semantic layer's starting values).
- The identical type scale (`--text-xs`…`--text-9xl`) already shared verbatim
  across all four artifacts.
- The `hover-elevate`/`active-elevate` utility system — functional, shared in
  spirit already (copy-pasted identically), a strong candidate for the first
  real shared CSS the platform ships.
- The `--*-border` relative-color darkening trick — a genuinely elegant,
  working pattern for deriving a readable border shade from any fill color
  without hand-picking a second value.
- Plus Jakarta Sans + Playfair Display as the two-family type system — already
  the convergent choice in three of four artifacts.
- `next-themes`-driven, no-flash theme switching — proven in `helpdesk`.
- The `.crm-insight-card` computed-vs-manual data marker pattern.
- `lucide-react` as the de facto icon library (used in all four; `react-icons`
  is dead weight everywhere it's installed).

## 26. Existing Elements Requiring Refinement

- Mint/`--accent` contrast boundaries need to be written down as enforceable
  rules, not just convention (§19–20).
- The light-theme focus ring needs a contrast fix before platform-wide reuse.
- `--success` as a white-text solid fill needs either a darker success hue or a
  documented "large-text/icon only, never small white-on-success text" rule.
- Shadow/elevation values in `web-agency`, `ai-toolkit`, and `mockup-sandbox`
  are inherited shadcn defaults, never deliberately authored — they need a
  conscious decision (adopt helpdesk's green-tinted ramp, or define a
  neutral-tinted marketing-appropriate ramp) rather than staying accidental.
- Google Fonts loading strategy (`@import` in CSS) should move to a shared,
  performance-conscious loading pattern.

## 27. Existing Elements to Deprecate Gradually

- `web-agency`'s deep-blue primary and its undocumented raw-hex blue family
  (`#062e71`, `#0a3d91`, `#1249a8`, `#6366f1`, and related tints) — retire per
  the already-approved gradual migration (Blueprint §24 Decision #6/#14),
  never via a single global find-and-replace.
- `web-agency`'s `0rem` sharp-radius system — **resolved (Phase 1A.1)**: a
  softened, tiered radius personality (`~8px` compact, `~12px` standard,
  `~16px` marketing cards, `~20–24px` hero/feature panels, pill for
  badges/filters) is the approved future direction; `web-agency`'s `0rem` is
  not retained. See `SHARED_DESIGN_TOKENS_SPEC.md` §13.
- `react-icons` dependency (dead in all three artifacts that install it).
- `framer-motion` installed-but-unused in `helpdesk`, `ai-toolkit`,
  `mockup-sandbox` — either adopt it deliberately (per
  `DESIGN_SYSTEM_DIRECTION.md` §33's recommendation) or remove it from those
  three `package.json` files in a future cleanup phase.
- `web-agency`'s dead `.dark` CSS block — either wire it up deliberately after
  a real dark-theme review, or remove it to stop it from silently drifting out
  of sync with the light theme.

## 28. Recommended Canonical Source System

`helpdesk`'s token file is the strongest existing candidate for the canonical
source: it is the only system that is complete (full neutral + semantic +
accent set), contrast-considered by convention (§8 of
`DESIGN_SYSTEM_DIRECTION.md` already documents a "mint never as body text on
white" rule that the raw data in this audit confirms is *necessary*, not just
cautious), and dark-mode complete. The Tailwind v4 CSS-first `@theme inline`
architecture (no `tailwind.config.js` in any artifact) is itself worth keeping
as the shared mechanism — see §Implementation Architecture Recommendation in the
companion spec for exactly how a shared token layer should plug into this
existing per-artifact pattern.

## 29. Migration Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `web-agency` blue removal breaks an unaudited component that hardcodes a blue hex outside any token | Medium (567 raw literals, unaudited component-by-component) | Medium — visual regression, not functional | Migrate component-by-component with visual diff review per component family, never a global search-and-replace (already a binding rule from the task brief and Blueprint §22) |
| Wiring `web-agency`'s dead `.dark` block live surfaces an untested dark palette | Low today (nothing currently triggers it) | Medium if triggered accidentally during unrelated refactor | Treat `web-agency` dark-mode enablement as its own reviewed phase, not a byproduct of token migration |
| Radius change from `0rem` to a shared value visibly changes `web-agency`'s brand character | High (it is the single most visible per-page difference today) | Medium–High, this is a genuine brand decision, not a bug fix | **Resolved (Phase 1A.1)**: tiered softened-radius personality approved (`SHARED_DESIGN_TOKENS_SPEC.md` §13); `web-agency`'s eventual migration to it is still a dedicated, reviewed migration stage (§Migration Strategy stage 5), not a silent default |
| Mint token reused unsafely (white-on-mint, mint-as-body-text) once shared package exists | Medium — the *ability* to misuse increases once tokens are easy to grab | High if shipped — real contrast failures (1.96:1) | Component-token layer (button/text primitives) enforces safe combinations so page authors cannot accidentally pick an unsafe pairing (see companion spec §Component tokens) |
| Removing `react-icons`/unused `framer-motion` breaks something at build time | Low (zero import sites confirmed for react-icons; framer-motion only unused, not misconfigured) | Low | Verify via `pnpm run build` per artifact before removal, in whatever future cleanup phase performs it (not this checkpoint) |

## 30. Phase 1B Implementation Prerequisites

1. Owner decisions resolved for: mint intensity, typography personality,
   light/dark warmth, radius personality, animation intensity, AI Toolkit
   secondary accent, CRM theme default — **done as of Phase 1A.1**, see
   `SHARED_DESIGN_TOKENS_SPEC.md`'s "Owner Decisions — Resolved (Phase 1A.1)"
   section.
2. `SHARED_DESIGN_TOKENS_SPEC.md` reviewed and approved with the Phase 1A.1
   resolutions incorporated.
3. Pilot application confirmed (this audit's recommendation: `helpdesk`/AI
   Receptionist — see companion spec §Phase 1B Definition).
4. No apparent blocker: `helpdesk` already contains every primitive value
   Phase 1B needs to extract into a shared source; no new design work is
   required before Phase 1B can begin, only extraction and packaging.

---

## Accessibility Review

Contrast ratios computed programmatically (WCAG relative-luminance formula) from
the exact HSL values in each artifact's `index.css`. All ratios below are
**measured, not assumed** — no pair is described as compliant without a
computed number.

| Pair | Ratio | AA text (4.5:1) | AA large text / UI (3:1) | Note |
|---|---|---|---|---|
| Light: `--foreground` on `--background` (primary text on light bg) | **16.48:1** | Pass | Pass | |
| Light: `--muted-foreground` on `--background` (muted text on light bg) | **5.18:1** | Pass | Pass | |
| Light: `--foreground` on `--card` (primary text on white card) | **16.81:1** | Pass | Pass | |
| Light: `--muted-foreground` on `--card` | **5.28:1** | Pass | Pass | |
| Dark: `--foreground` on `--background` (primary text on dark bg) | **15.67:1** | Pass | Pass | |
| Dark: `--muted-foreground` on `--background` (muted text on dark bg) | **7.22:1** | Pass | Pass | |
| Light: `--primary-foreground` on `--primary` (evergreen button, filled) | **7.02:1** | Pass | Pass | Standard filled button — safe |
| Light: `--accent-foreground` on `--accent` (mint button, dark text on mint) | **7.90:1** | Pass | Pass | Safe combination already used by helpdesk |
| Light: white text on `--accent`/mint (naive white-on-mint button) | **1.96:1** | **Fail** | **Fail** | Confirms the existing "mint never gets white text" rule is load-bearing, not decorative |
| Light: `--accent` (mint) as body text color on white | **1.96:1** | **Fail** | **Fail** | Confirms "mint never used as body text on white" (Design doc §8) is a hard requirement |
| Dark: `--primary-foreground` on `--primary` (brighter evergreen button) | **6.64:1** | Pass | Pass | |
| Light: `--destructive-foreground` (white) on `--destructive` (error button) | **4.68:1** | Pass (marginal) | Pass | |
| Light: error text (`--destructive` color) directly on white | **4.68:1** | Pass (marginal) | Pass | Same value, reversed roles — coincidentally also passes |
| Light: `--success-foreground` (white) on `--success` fill | **2.92:1** | **Fail** | **Fail** | Risk: do not use white text on a solid `--success` fill at any size in the current light-theme value; needs a darker success hue or dark-text pairing |
| Light: success-colored text directly on white | **2.92:1** | **Fail** | **Fail** | Same defect, reversed — current `--success` hue is too light-value for direct text/fill-with-white use |
| Light: `--warning-foreground` (dark) on `--warning` fill | **7.49:1** | Pass | Pass | Safe — warning already uses dark text on its fill |
| Light: warning-colored text directly on white | **2.14:1** | **Fail** | **Fail** | Never use `--warning` as a direct text color on white; only as a fill with dark text, or as an icon at sufficient size with a border/background |
| Light: `--info-foreground` (white) on `--info` fill | **3.53:1** | **Fail** (text) | Pass (large/UI) | Usable for large text/icons/badges, not for small body-weight text |
| Light: focus ring (`--ring`/accent, mint) vs. white card (non-text, 3:1 required) | **1.96:1** | n/a | **Fail** | Real defect: the light-theme focus ring as currently valued does not meet the 3:1 non-text minimum against white/near-white surfaces — flagged for the shared spec to fix, not carried forward as-is |
| Light: hairline `--border` vs. `--card` (divider, not text) | **1.28:1** | n/a | n/a (decorative) | Expected/acceptable — dividers are not required to meet a contrast minimum, only to be visually distinguishable in context |
| Light: `--muted-foreground` (disabled-style text) on `--muted` background | **4.78:1** | Pass | Pass | Adequate if reused for a "disabled" role, though a true disabled control should also communicate state non-visually (`aria-disabled`) |
| Light: `--foreground` on `--sidebar`/nav background (nav text) | **16.81:1** | Pass | Pass | |
| Dark: focus ring (`--ring`, mint) vs. dark background | **9.96:1** | n/a | Pass | Dark-theme focus ring is safe; only the light-theme value needs correction |
| Dark: `--destructive-foreground` (white) on dark-theme `--destructive` | **4.41:1** | Fail (marginal, text) | Pass | Borderline; acceptable for buttons/large text, flag for review if ever used as small body text |
| Dark: `--warning-foreground` on dark-theme `--warning` | **8.49:1** | Pass | Pass | |
| Light: `web-agency`'s own `--primary` (deep blue) foreground (white) on `--primary` | **13.06:1** | Pass | Pass | web-agency's *existing* primary button contrast is actually fine on its own terms — the issue is brand fragmentation, not accessibility, for this specific pair |
| Light: `web-agency`'s `--muted-foreground` on its `--background` | **5.93:1** | Pass | Pass | |

**Placeholder-form labels, placeholder text, and disabled controls**: no
dedicated `--placeholder` or `--disabled` token exists in any artifact today —
placeholder text renders at the browser/UA default or via the shared
`muted-foreground` color (see `[contenteditable]` placeholder rule present in
all four `index.css` files, which explicitly uses `hsl(var(--muted-foreground))`
— that specific pairing was measured above at 4.78:1–5.28:1 depending on surface,
which passes). No pair here is asserted compliant without the corresponding row
above; any role not listed in this table (e.g. link-color-on-accent-background
combinations not yet defined) has not been measured and must not be assumed
compliant until it is.

---

## Application Comparison Table

| | `web-agency` marketing | `web-agency` CRM/admin | `helpdesk` (AI Receptionist) | AI Toolkit | Shared components |
|---|---|---|---|---|---|
| Primary color | `218 90% 23%` deep blue | same file, `--sidebar-primary` `218 90% 23%` | `160 76% 22%` deep evergreen | `160 64% 50%` mint (forced-dark) | none exist yet |
| Background | `218 45% 98%` cool light | `--crm-content: 210 17% 95%` fixed | `150 22% 99%` warm white | `220 10% 10%` forced dark | — |
| Surface | `--card: 0 0% 100%` | `--crm-sidebar`/`--crm-header` fixed dark chrome | `--surface`/`--surface-muted` dedicated tokens | `--card: 220 10% 12%` | — |
| Text | `222 45% 12%` cool dark | same | `160 25% 10%` warm dark | `40 20% 98%` near-white | — |
| Muted text | `220 15% 40%` | same | `155 10% 40%` | `40 10% 70%` | — |
| Border | `218 25% 88%` | same | `152 16% 88%` | `220 10% 20%` | — |
| Accent | `218 45% 93%` light blue | n/a | `160 64% 50%` bright mint | `222 47% 25%` navy (labelled "Navy" in code comment) | — |
| Danger | `0 84% 60%` | same | `356 72% 52%` | `0 62% 30%` | — |
| Success | not defined | not defined | `152 60% 42%` | not defined | — |
| Warning | not defined | not defined | `38 92% 50%` | not defined | — |
| Font family | Plus Jakarta Sans / Playfair | same | Plus Jakarta Sans / Playfair | Plus Jakarta Sans / Playfair | — |
| Type scale | identical `--text-xs`…`9xl` | same | identical | identical | — |
| Radius | `0rem` (sharp) | same | `.75rem` (soft) | `.5rem` | — |
| Shadow | near-flat shadcn default | same | green-tinted authored ramp + mint-glow | near-flat shadcn default | — |
| Spacing density | marketing (`max-w-5xl`-class) | dashboard (`max-w-2xl`-class, denser) | dashboard-dense | marketing-loose | — |
| Dark mode | dead code, unwired | fixed-dark chrome always, independent of mode | fully wired, tested | forced-on, no light fallback | — |
| Motion | `framer-motion` actively used (15 files) | same codebase | installed, unused | installed, unused | — |
| Component style | shadcn/Radix, sharp corners, blue-leaning + undocumented raw blues | shadcn/Radix, fixed dark shell | shadcn/Radix, soft corners, evergreen/mint-disciplined | shadcn/Radix, forced-dark, minimal | none — every artifact vendors its own copy |

---

## Raw Value Inventory (UI-affecting only)

| Value | Where it appears | Current role | Consistent? | Proposed semantic replacement | Migration priority |
|---|---|---|---|---|---|
| `#062e71`, `#0a3d91`, `#1249a8` (deep blues) | `web-agency` components, not in any token file | Ad hoc hero/section blue accents | No — three near-identical, undocumented blues doing the same job | `color-action-primary` (evergreen) once web-agency migrates, or retire entirely | High (brand-identity conflict) |
| `#6366f1` (indigo) | `web-agency` components | Secondary accent/highlight in places | No — not tokenized anywhere | `color-status-info` or a scoped illustration accent, case-by-case | Medium |
| `#34d399` / `#34D399` (mint) | `web-agency`, `helpdesk`, `ai-toolkit` raw literals, despite existing as `--accent` token in all three | Ad hoc mint highlight, bypassing the token | Consistent *intent*, inconsistent *mechanism* | `color-action-primary` / `color-brand-accent` semantic token, referenced not re-typed | High (easiest, lowest-risk fix — literal token substitution) |
| `0rem` radius base (`web-agency`) vs `.75rem` (`helpdesk`) | both `index.css` `--radius` | Global corner personality | No — direct conflict | **Resolved (Phase 1A.1)**: tiered softened-radius scale — `radius-sm`≈8px, `radius-md`≈12px, `radius-lg`≈16px, `radius-xl`≈20–24px, `radius-pill` for badges/filters/tags only (`SHARED_DESIGN_TOKENS_SPEC.md` §13) | High (visible on every card/button/input) |
| `duration-200`/`300`/`500` (raw Tailwind classes) | all four artifacts, scattered | Ad hoc transition timing | Loosely consistent by convention, not by shared token | `duration-fast` / `duration-normal` / `duration-slow` | Low (values already converge; this is a naming/token exercise, not a value fix) |
| `z-50` / `z-10` / `z-[100]` / `z-[200]` | all four artifacts, overlays/menus/dialogs | Stacking order for menus, dialogs, toasts | Roughly consistent (same rough tiers) but ungoverned — no documented z-index scale | `z-dropdown` / `z-overlay` / `z-modal` / `z-toast` | Medium (risk grows as more overlay surfaces are added across products) |
| Near-flat shadow ramp (`0px 2px 0px 0px hsl(0 0% 0% / 0.02)` etc., shadcn defaults) | `web-agency`, `ai-toolkit`, `mockup-sandbox` | Elevation, currently near-invisible | Consistent across the three, but never a deliberate choice | `shadow-sm`/`shadow-md` from the shared spec — helpdesk's tinted ramp adopted as the foundation (`SHARED_DESIGN_TOKENS_SPEC.md` §15) | Medium |
| `react-icons` (installed, unused) | `web-agency`, `helpdesk`, `ai-toolkit` `package.json` | Dead dependency | Consistent (consistently unused) | Remove | Low (cleanup, not a token issue; out of this checkpoint's scope) |

(Lockfile-only occurrences and non-rendering values are intentionally excluded
per task instructions.)
