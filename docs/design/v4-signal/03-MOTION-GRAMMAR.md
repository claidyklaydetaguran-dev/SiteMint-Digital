# V4 Motion Grammar

Motion explains **hierarchy, causality, or state** — never decoration. Max 1–2 animated elements
per view (verified UX rule: "Excessive Motion", severity High). All motion is transform/opacity
only (verified rule: "Transform Performance"). Every entry below has a reduced-motion behavior;
under `prefers-reduced-motion: reduce` the page renders each element in its final readable state
immediately (verified rule + scroll-storytelling pattern requirement).

## Tokens

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 160ms ease-out | hovers, presses, nav state |
| `--motion-base` | 320ms cubic-bezier(.22,.9,.28,1) | entrances, panel open |
| `--motion-slow` | 600ms same curve | chapter reveals, route transitions |
| `--motion-drift` | 12–16s linear loop | ambient signal field (dark sections only) |
| stagger | 60ms/item, cap 6 items | card grids |

## Grammar (what animates, and why)

1. **Signal thread draw** — SVG `stroke-dashoffset` draws the thread between connected sections as
   they enter the viewport (IntersectionObserver). Meaning: causality — this service feeds the
   next. Reduced motion: thread rendered fully drawn.
2. **Chapter transitions** — mono section number + rule line slide in (320ms, 16px rise), then
   heading masks up via clip-path inset reveal (600ms). Meaning: hierarchy — you entered a new
   chapter. One reveal per chapter; paragraphs do not individually animate.
3. **Progress rail** — fixed left rail (desktop) listing chapters 01–05; fill and active dot track
   scroll position. Meaning: orientation. Clickable; `scroll-margin-top` respected.
4. **Hero scroll narrative** — scroll position drives the hero's 4 storyboard states (scattered →
   organizing → connected → resolved) via a scrub value; no pinning beyond the hero itself, no
   scroll hijacking, native wheel/touch untouched. Reduced motion / mobile data-saver: static
   resolved-state poster with full copy.
5. **Cards assemble** — feature/service cards translate from 24px offsets into their grid (320ms,
   60ms stagger, from:start). Meaning: parts form a system. Never on data tables.
6. **Magnetic CTA (restrained)** — primary CTA translates ≤6px toward pointer within a 80px
   radius and shows a light-follow gradient; hit target never moves more than 6px (clickability
   preserved); disabled under reduced motion and on touch.
7. **Nav state changes** — active underline slides between items (160ms). Mega panel 180ms
   fade+rise. Meaning: state.
8. **Route transitions** — outgoing content fades 120ms, incoming rises 8px/240ms; header and rail
   persist so orientation is preserved. No full-screen wipes.
9. **Waveform / voice states** — demo theater bars animate only while "listening/speaking";
   amplitude maps to state, color maps to speaker (cyan = caller, turquoise = assistant). Reduced
   motion: static bars + text state label (state is never conveyed by motion alone).
10. **Dashboard counters/status** — animate only on meaningful change (new conversation, publish
    state); a status pulse ring runs once, not looped. Tables never stagger.

## Scroll rules

- No scroll hijacking, no mandatory smooth-scroll library. `html { scroll-behavior: smooth }` for
  anchors only.
- Pinned storytelling allowed on **at most the hero** (GSAP preset rule: 1–2 pinned sections max;
  we use 1).
- Ambient parallax capped at ±20px background drift; disabled under reduced motion.
- All observers disconnect when offscreen; `will-change` applied only during animation.

## Implementation stack decision

The repo already ships **framer-motion** (web-agency + helpdesk). Verdict for production:

- Entrances, stagger, layout/route transitions, mega panel, magnetic CTA → framer-motion
  (`whileInView`, `useScroll`, `useTransform`, `useReducedMotion`) — fully capable.
- Hero scroll-scrub narrative → framer-motion `useScroll`+`useTransform` is sufficient for the
  4-state scrub (opacity/transform blends + video `currentTime` seek on the poster/video layer).
- **GSAP is NOT added in this phase.** Add GSAP+ScrollTrigger (~28KB min+gzip combined) only if
  production hero requires frame-accurate video scrubbing with pinning that framer-motion cannot
  hold at 60fps on mid-tier mobile; measure bundle before/after and record in the PR if ever
  added. (Owner decision D7.)

The static prototype implements the same grammar with IntersectionObserver + CSS transforms +
rAF-throttled scroll handlers, proving the grammar needs no heavyweight dependency.
