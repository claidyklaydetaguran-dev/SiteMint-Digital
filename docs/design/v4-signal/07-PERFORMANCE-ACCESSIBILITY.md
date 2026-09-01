# V4 Performance & Accessibility Budgets

## Budgets (binding for the production rebuild)

| Metric | Budget | How V4 meets it |
|---|---|---|
| LCP | ≤2.5s (4G mid-tier) | LCP element is the hero H1 or ≤60KB poster image (preloaded, AVIF/WebP); video never participates (`preload="none"`, attached post-LCP) |
| CLS | ≤0.1 | All media has intrinsic dimensions; skeletons reserve space; fonts use `font-display: swap` + metric-compatible fallback stacks; sticky header height fixed |
| INP | ≤200ms | Scroll handlers rAF-throttled + passive; observers disconnect offscreen; no synchronous layout reads in animation paths; transform/opacity only |
| JS added | hero narrative uses existing framer-motion; GSAP only via owner decision D7 with measured before/after | — |
| Video weight | desktop ≤1.8MB AV1 (+MP4 fallback ≤2.5MB), mobile ≤900KB or poster-only | compression plan in 04-HERO-STORYBOARD |

Text-first rendering: hero copy, nav, and CTA are HTML rendered before any media resolves; the
page is fully usable with video/animation blocked.

## Accessibility commitments (WCAG 2.2 AA)

- Contrast: every text token pair verified ≥4.5:1 (table in 01-DESIGN-SYSTEM); UI component
  boundaries ≥3:1 via `--sm-line-strong`; decorative hairlines exempt.
- Keyboard: complete keyboard paths for mega panel (Escape/outside-click/focus restore), mobile
  sheet (trap + restore), demo theater (Start/End/Escape), dashboards (logical tab order); visible
  focus (2px ring, offset) everywhere; skip link first.
- Touch: ≥44×44 targets, ≥8px spacing.
- Motion: `prefers-reduced-motion` renders final states instantly (hero shows resolved
  composition + full copy); no comprehension depends on motion (all states have text labels);
  no strobing; pin/scrub limited to hero; no scroll hijack.
- Screen readers: landmarks (`header/nav/main/footer`), sequential headings, `aria-current`
  navigation, `aria-expanded/controls` on disclosure, live regions polite for theater state and
  dashboard status, icon-only buttons labeled, waveform `aria-hidden` with text state.
- Forms: visible labels, inline errors adjacent to fields + summary, `autocomplete` attributes,
  paste never blocked (accessible authentication).
- No horizontal page overflow at 360/375/768/1024/1440; wide tables scroll inside their own
  container; no nested page scrollbars.

## Prototype measurements (static prototype, this phase)

Recorded after build in 09-PROTOTYPE-REPORT (file weight, console cleanliness, viewport sweeps at
375/768/1440, reduced-motion pass). The prototype is dependency-free (no GSAP, no framework), so
its numbers are a floor, not a forecast, for the production build.
