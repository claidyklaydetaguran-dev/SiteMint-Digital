# Accessibility Requirements — Frontend V2

**Target: WCAG 2.2 AA** across every public and dashboard surface. Accessibility
is a release gate, not a follow-up.

## 1. Defects found in the current build

| # | Finding | Evidence |
|---|---|---|
| A1 | **21 `onClick` handlers on non-interactive `div`/`span`** | not keyboard reachable, no role, no focus |
| A2 | Only **74** `aria-label`s across the whole web-agency app | icon-only controls likely unlabelled |
| A3 | **Hover-only nav feedback** — `onMouseEnter` background change with no focus equivalent | `ReceptionistNav` |
| A4 | **Emoji as industry iconography** (🏠⚖️🔧💆🍽️🛍️) | announced literally by screen readers |
| A5 | **No route-level error boundaries** | failures produce a blank screen with no announcement |
| A6 | Bare `Suspense` fallbacks | no loading announcement, layout jump |
| A7 | **670 inline styles** | focus/contrast states inconsistent and unauditable |
| A8 | Animated counters rendering `0%+`, `<0 sec`, `$0+` mid-animation | misleading to AT and to anyone with reduced motion |

## 2. Keyboard

- Every interactive element is a real `<button>`, `<a href>`, or a labelled
  control. **A1 is fixed by construction** — no click handler on a bare `div`.
- Visible `:focus-visible` on everything: 2px `#27E9B5` ring, 2px offset, never
  removed.
- Logical tab order following DOM order; no positive `tabindex`.
- "Skip to content" as the first focusable element (already present — keep).
- Modals/drawers: focus trapped, `Esc` closes, focus returns to the trigger.
- Menus: arrow-key navigation, `Home`/`End`, type-ahead where Radix provides it.
- Workflow diagrams: each step is a `<button>`, arrow keys move, `aria-current`
  marks the active step.

## 3. Screen readers

- One `<h1>` per page; heading levels never skip.
- Landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`, with `aria-label` where
  a landmark repeats.
- Icon-only buttons carry `aria-label`; decorative icons `aria-hidden="true"`.
- **Emoji removed from UI** (A4) — replaced with SVG icons plus real text labels.
- Route change announces the new page title via a polite live region.
- Loading, submitting, and error states announce politely; nothing important is
  conveyed by a toast alone.

## 4. Forms — including the two-step signup

- Every field has a **visible persistent label**. Placeholder is never the label.
- Errors: beside the field, `aria-describedby` links them, `aria-invalid="true"`
  set, and a summary is announced.
- **Focus moves to the first invalid field on failed submit.**
- Password requirements are **visible before submission** ("At least 8
  characters"), not revealed only on failure.
- Correct mobile input types: `type="email"`, `type="tel"`,
  `autocomplete="name | organization | email | tel | new-password"`.
- Step changes announce "Step 2 of 2 — Your business" politely; **moving
  backward never clears data**; **no request fires before final submission**.
- Submitting state is explicit and announced; the control is disabled to prevent
  double submission.
- Duplicate-email (409) and rate-limit (429) errors are rendered as
  understandable text with a next action, not a raw code.

## 5. Colour and contrast

- Body text ≥ **4.5:1**; large text and UI boundaries ≥ **3:1**.
- Verified pairs: `#051824` on `#F6FBFA`, `#FFFFFF` on `#051824`, `#051824` on
  `#27E9B5`. **White on mint is prohibited** — it fails.
- The light-forward palette adds `--sm-warm-white` `#FDFCFA` and
  `--sm-mint-mist` `#F0F9F6` as dominant/differentiating backgrounds. Both
  require a contrast pass against `#051824` body text and `#3B5265` secondary
  text **before first use**, per the token-governance rule in
  `DESIGN-SYSTEM.md` §8.
- `#3B5265` is for secondary text on light surfaces only, never small text on
  navy.
- **Colour is never the only signal** — status uses icon + text as well.

## 6. Motion

- `prefers-reduced-motion: reduce` collapses all entrance and workflow motion to
  an instant state change.
- **Content is readable with JavaScript disabled**; no intersection-triggered
  reveal may leave content hidden (Gate 3 measured 0 invisible sections — this
  becomes a permanent release check).
- No animation blocks navigation or form completion.
- **Counters never display a misleading intermediate value** (A8). Under owner
  decision 1 the statistics those counters animated are **removed entirely**, so
  the animated-counter pattern is retired rather than repaired.

## 7. Targets and responsive

- Interactive targets ≥ **44×44 CSS px**, with ≥ 8px separation.
- No horizontal overflow at **320, 390, 768, 1024, 1440** px.
- 200% zoom and 320px width remain usable without two-dimensional scrolling.
- Mobile never depends on hover (motion doc §3.6).
- Tables scroll within their own container, announced as scrollable.

## 8. Resilience as accessibility

- Every route has an error boundary rendering a **designed, announced** recovery
  panel with a Retry or safe-navigation control — **never a blank screen** (A5).
- **No technical stack trace is shown to ordinary users.** An error panel that
  dumps a trace is an accessibility and comprehension failure, not a diagnostic
  feature; diagnostics go to the console.
- Skeletons match final geometry, have **stable dimensions**, and are marked
  `aria-busy` on the region.
- **Loading UI never blocks content that is already available.**
- Every async surface has loading, empty, error, and populated states.

## 9. Verification

Per phase:

1. Full keyboard pass — every interactive element reachable and operable.
2. Automated axe scan — **zero criticals, zero serious**.
3. Screen-reader smoke test of the changed surfaces (NVDA or VoiceOver).
4. Contrast audit of new token pairs.
5. Reduced-motion pass.
6. Zoom/reflow at 320px and 200%.
7. JavaScript-disabled read-through of public pages.

A phase is not complete until all seven pass.
