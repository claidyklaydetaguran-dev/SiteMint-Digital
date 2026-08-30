# @workspace/design-tokens

Shared SiteMint Platform design-token runtime layer — CSS custom properties
only, no build step, no component code. Implements
`docs/sitemint-platform/SHARED_DESIGN_TOKENS_SPEC.md` (Phase 1B).

## What this is

Three layers of CSS custom properties, namespaced `--sm-*` to avoid colliding
with any consuming app's own token names:

- `src/primitives.css` — color/typography/radius/shadow-width/motion/z-index
  primitives (theme-independent).
- `src/semantic.css` — role-based tokens (`--sm-color-bg-canvas`,
  `--sm-color-text-primary`, `--sm-color-border-focus`, …) resolved per
  `:root` (light) and `.dark` (dark theme), plus the shadow ramp.
- `src/components.css` — component-level tokens (`--sm-button-primary-*`,
  `--sm-card-*`, `--sm-focus-ring`, …) that structurally prevent unsafe
  pairings (e.g. white text on bright mint).
- `src/index.css` — imports all three, in order.

## Usage

Add as a workspace dependency and import the combined entry point before your
app's own token declarations, so your app can alias its existing variable
names onto these:

```css
@import "@workspace/design-tokens/css";

:root {
  /* alias example — same resolved value, shared token as the source */
  --background: var(--sm-color-bg-canvas);
}
```

Individual layers are also exported (`@workspace/design-tokens/css/primitives`,
`.../semantic`, `.../components`) for a consumer that wants only part of the
system.

## Theming contract

- Root selector: `.dark` class on `<html>` (matches helpdesk's existing,
  working `next-themes` mechanism — this package does not invent a new one).
- No JavaScript, no theme provider, no persistence logic lives here — that
  stays app-owned (`next-themes` in helpdesk today).
- `prefers-reduced-motion: reduce` collapses every `--sm-duration-*` primitive
  to near-instant automatically.

## Governance

- Primitive tokens are additive-only (`SHARED_DESIGN_TOKENS_SPEC.md` §26) —
  changing an existing value requires a new accessibility/contrast pass.
- `--sm-color-border-focus` (light) and `--sm-color-status-success` (light)
  are intentionally corrected from helpdesk's raw historical values — see the
  header comment in `src/semantic.css` for the measured contrast rationale.

## Status

Phase 1B pilot consumer: `artifacts/helpdesk`. Not yet consumed by
`web-agency`, `ai-toolkit`, or `mockup-sandbox` — those are later, separately
scoped migration stages (`SHARED_DESIGN_TOKENS_SPEC.md` §Migration Strategy).
