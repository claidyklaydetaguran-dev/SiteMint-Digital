# Motion and Interaction — Frontend V2

Motion communicates **state, hierarchy, and cause-and-effect**. Nothing moves
for decoration.

## 1. Approved durations

| Interaction | Duration | Easing |
|---|---|---|
| Button / control feedback | 120–180 ms | `cubic-bezier(.2,0,0,1)` |
| Menu, drawer, tooltip | 160–220 ms | `cubic-bezier(.2,0,0,1)` |
| Page entrance | 350–500 ms | `cubic-bezier(.16,1,.3,1)` |
| Hero sequence (**once**) | 500–700 ms | `cubic-bezier(.16,1,.3,1)` |
| System-workflow transition | 250–400 ms | `cubic-bezier(.2,0,0,1)` |
| Skeleton → content | 150 ms, **opacity only** | linear |

Only `transform` and `opacity` animate. No `width`, `height`, `top`, `left`,
`filter`, or `box-shadow` animation.

## 2. Prohibited

Continuous floating · infinite bouncing · large parallax · scroll-jacking ·
cursor followers · per-letter headline animation · every section animating on
scroll · animated gradient backgrounds · auto-rotating carousels · heavy blur
animation · **video of any kind, looping or otherwise** · loading animations that
block content already available · **animated statistic counters** (there are no
approved statistics left to count toward, and they render misleading
intermediate values — `ACCESSIBILITY-REQUIREMENTS.md` A8).

**Current-build violations to remove:** 3 infinite/repeating animations, and
`framer-motion` imported across **15** web-agency files.

## 3. Binding rules

1. **Content is visible without JavaScript-driven intersection animation.**
   Entrance uses CSS with the final state as the default; JS only *adds* an
   entrance when it is safe. If JS never runs, the page is fully readable.
2. **Scrolling never leaves a section invisible.** This is the concrete failure
   Gate 3 measured for (`0 invisible sections` at 390px and 1440px) and it stays
   a release gate.
3. **`prefers-reduced-motion: reduce` is honoured**: all entrance and workflow
   motion collapses to an instant state change; only opacity ≤ 100 ms remains.
4. **No motion delays navigation or form completion.** Route changes render
   immediately; entrance animation never gates interactivity.
5. **Every hover behaviour has a matching focus behaviour.** The current
   `ReceptionistNav` changes background on `onMouseEnter` with no focus
   equivalent — V2 uses `:hover, :focus-visible` together.
6. **Mobile interactions never depend on hover.** Anything hover-revealed is
   reachable by tap or is always visible below 768px.
7. Focus is never suppressed. `:focus-visible` is a 2px mint ring at 2px offset
   on every interactive element.

## 4. The connected-system visual

The homepage workflow and the AI Receptionist call workflow may animate **only**:

- once, as part of the initial hero entrance, **or**
- on deliberate user interaction (click/tap/keyboard on a step control).

After that they are **static**. No idle loop, no autoplay progression, no
attention-seeking pulse. Keyboard operable: arrow keys move between steps, each
step is a real button, current step announced via `aria-current`.

## 5. Page and route transitions

- Route change: 350–500 ms opacity + 8px translate-Y on the main region only.
  Header and nav do not animate between routes.
- Lazy chunks show a **stable skeleton matching final geometry** — never a
  spinner that collapses layout. This prevents the CLS the current bare
  `Suspense fallback={null}` usages risk.
- Slow chunk (> 400 ms) keeps the skeleton; it never flashes then re-flashes.
- **Loading UI never blocks content that is already available** — a route
  transition must not blank or overlay a rendered shell.
- **Route error recovery never shows a technical stack trace.** The panel is
  plain language with a retry or safe-navigation action; diagnostics go to the
  console.
- Every loading and recovery state honours `prefers-reduced-motion: reduce`.

## 6. Form interaction

- Validation on blur and on submit; **never** on every keystroke.
- Errors appear beside the field, referenced by `aria-describedby`, with
  `aria-invalid` set.
- On a failed submit, focus moves to the **first invalid field**.
- Submitting state is explicit: the button label changes, the button disables,
  and an `aria-live="polite"` region announces it.
- Multi-step signup: moving backward never clears entered data; no network
  request until final submission.

## 7. Loading and feedback hierarchy

| Situation | Treatment |
|---|---|
| < 200 ms | No indicator at all |
| 200 ms – 1 s | Inline skeleton |
| > 1 s | Skeleton + polite "Still loading…" after 2 s |
| Background refresh | Subtle inline indicator; existing content stays visible and readable |
| Destructive action | Explicit confirm; never an undo-only pattern |

## 8. Motion implementation

Prefer CSS transitions and `@keyframes` for everything in §1. `framer-motion`
usage is reduced from 15 files to **at most 2**: the workflow diagram and the
route transition wrapper. This removes the animation library from most public
route chunks.
