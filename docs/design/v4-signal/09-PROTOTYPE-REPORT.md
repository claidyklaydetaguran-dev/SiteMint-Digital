# V4 Signal Prototype — QA Report

Prototype: `prototypes/v4-signal/index.html` — one self-contained file, **~70KB, zero
dependencies** (no framework, no GSAP; fonts are the only external requests). Serve statically
(any static server) and open `#/`, `#/ai-receptionist`, `#/dashboard`, `#/ops`.

## Seven surfaces delivered

1. Global desktop + mobile navigation (sticky header, click-operated mega panel, full-screen
   mobile sheet with focus trap and accordion).
2. Full-viewport cinematic homepage hero — canvas signal field with the 4-state scroll narrative
   (scatter → organize → connect → resolve), pointer parallax ≤ ±12px, magnetic CTA ≤6px,
   journey node labels, scroll hint.
3. Homepage scroll-story section — `01 Attention` with the interactive Signal Map (thread draw +
   5 stage chips, `aria-pressed`, live description).
4. Service section — `02 What We Build` four-pillar editorial grid with staggered card assembly
   and next-step band.
5. AI Receptionist landing hero with the demo theater — full typed state machine (ready →
   mic-explain → permission → connecting → listening ⇄ speaking → ending → limit, plus
   blocked-mic error path), waveform, timer, End control, AI + simulation disclosures.
6. Customer dashboard shell — grouped sidebar with active states, status chip, Overview tiles,
   needs-attention, recent conversations, plus a preview-mode toggle proving **sample / empty /
   loading** state designs.
7. Operations CRM screen — dark ops skin, mono nav, Leads & Firms pipeline table with stage
   tags and scores, clearly marked internal.

## Measurements (headless-Chrome CDP harness, 2026-09-01)

| Run | Viewport | scrollW = innerW | Horizontal overflow | Console errors |
|---|---|---|---|---|
| Home | 1440×900 | 1440 | none | 0 |
| Home | 768×1024 | 768 | none | 0 |
| Home | 375×812 | 375 | none | 0 |
| Home (reduced motion) | 1440×900 | 1440 | none | 0 |
| AI Receptionist | 1440 / 768 / 375 | exact | none | 0 |
| Dashboard | 1440 / 375 | exact | none | 0 |
| Ops CRM | 1440 / 768 / 375 | exact | none | 0 |

Interaction passes (screenshot-verified, `screenshots/`): mega panel open → **Escape closes and
restores focus to the trigger** (focus ring visible in `desktop-mega-escape-focus.png`); mobile
sheet open + accordion; theater full conversation run to the limit state; dashboard
sample/empty/loading toggle.

Reduced-motion pass: page height collapses from 5399px to 3239px (hero scroll region becomes a
single static viewport with the resolved composition; reveals render final states; no
animations). Verified via emulated `prefers-reduced-motion: reduce`.

## Defects found & fixed during QA

- Header light/dark state stuck when the page loads in a hidden/zero-height pane — state now
  re-syncs on resize/visibilitychange/load, and the hero canvas self-heals its dimensions.
- `.wave{display:flex}` overrode the `hidden` attribute (waveform dots visible in ready state) —
  global `[hidden]{display:none!important}` added.
- Progress rail label collided with the CTA-band heading — rail now hides on the final chapter.
- Dashboard at 375px forced a 504px min-width (unwrappable top bar) — top bar now wraps; true
  375px with no overflow.
- Favicon 404 silenced with a data-URI icon.

## Known prototype limits (not production plans)

- Placeholder routes (Work, About, pillar details, intake) route to `#/` — their designs live in
  06-ROUTE-PLANS.md; only the seven gate surfaces are built.
- Hero atmosphere is the CSS/canvas signal field; the approved Magnific video (04-HERO-STORYBOARD)
  would layer beneath it in production.
- Dashboard/ops screens carry visible "Simulated preview data" badges; every name/metric shown is
  sample data, labeled as such in the UI itself.
- The theater is the simulated adapter by design (see 05-RECEPTIONIST-DEMO); no microphone is
  ever requested, no audio plays, and copy in the interface says so.
