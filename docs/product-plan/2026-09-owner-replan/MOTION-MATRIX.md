# Motion Matrix — route-by-route coverage (2026-09-05)

> Owner directive §4: "a motion component existing in source does not prove that visitors
> can see it." Every row below is backed by a measured run of `qa-motion.mjs` against the
> real built preview (127.0.0.1:4175, 1440×900): **armed** = elements measured in their
> hidden pre-reveal state below the fold on load; after a scripted full-page scroll the
> harness re-checks that nothing stayed invisible (**stuck = 0** everywhere); a second
> pass emulates `prefers-reduced-motion: reduce` and asserts zero armed elements and zero
> hidden content (**rm = 0/0** everywhere). Hero entrances were separately verified
> mid-flight (elements at opacity 0 at ~650 ms after navigation, fully revealed by ~2.1 s).
>
> Root-cause note: before this pass, `useReveal()` had an arming race (ref callback ran
> before its IntersectionObserver existed), so **every scroll reveal on the site had been
> silently inert since V3** — matching the owner's report of seeing exactly one transition
> (the home HUD, which uses its own observer). Fixed in `useReveal.ts`; the measured
> numbers below are from the fixed build.

| Route | Hero sequence | Section titles | Supporting copy | Primary visual | CTAs | Armed (measured) | Stuck | Reduced motion | Mobile |
|---|---|---|---|---|---|---|---|---|---|
| `/` | HUD particle hero (own observer) + journey lighting | clip + fade-up ladder | fade-up, splits `reveal-h-left/right` | AI-systems node path stroke-draws; ledger/work/pricing cards scale-settle | fade-up | **74** | 0 | static ✓ | simplified ✓ |
| `/services` | eyebrow→lede→actions→map (verified mid-flight) | fade-up/clip | fade-up | systems-map connector stroke-draws; pillar cards scale-settle | canonical CTAs, fade-up | **11** | 0 | static ✓ | simplified ✓ |
| `/websites-apps` | shared ServicePage choreography (eyebrow→lede→actions) | v3 reveal groups (now live) | fade-up | split panes | Build Your SiteMint System | **8** | 0 | static ✓ | simplified ✓ |
| `/discovery-systems` | same shared choreography | v3 reveal groups | fade-up | split panes | canonical | **7** | 0 | static ✓ | simplified ✓ |
| `/ai-systems` | same shared choreography | clip/fade-up | fade-up + `reveal-h-left` | workflow-strip arrows stroke-draw in sequence; CRM demo card settles | canonical | **16** | 0 | static ✓ | simplified ✓ |
| `/ai-receptionist` | cinematic: eyebrow→beta badge→masked headline (LCP-safe clip)→support→CTAs→sign-in→visual settle | own armed-reveal system | progressive transcript lines | ring pulse, waveform, availability slot, confirm-check draw, dashboard populate | Explore the Interactive Preview / Request Beta Access | **22** | 0 | static ✓ | simplified, ambient paused offscreen/hidden-tab ✓ |
| `/pricing` | eyebrow→lede→actions (Configure Your Scope) | clip/fade-up | fade-up | tier cards + configurator scale-settle | canonical | **15** | 0 | static ✓ | simplified ✓ |
| `/work` | eyebrow→lede→actions | fade-up | fade-up | composition cards scale-settle | canonical | **10** | 0 | static ✓ | simplified ✓ |
| `/process` | eyebrow→note→lede→actions | fade-up | checklist stagger, split `reveal-h-left` | phase timeline + rail | canonical + secondary | **12** | 0 | static ✓ | simplified ✓ |
| `/about` | eyebrow→lede | fade-up | split `reveal-h-left` | pillars/team/receipt settle | canonical | **16** | 0 | static ✓ | simplified ✓ |
| `/start` | eyebrow→lede→actions | fade-up | splits + list stagger | discovery panel settle | Start the Discovery brief | **7** | 0 | static ✓ | simplified ✓ |
| `/discovery` | intentionally calm (form surface) | step-panel transition 200 ms on every step change; progress-bar movement; selected-state feedback; validation fade-in | — | — | Continue / Submit Discovery Brief | step transitions (verified by the 8-step real-mouse walker, 7/7) | 0 | static ✓ (token-driven) | sticky action bar, compact progress ✓ |
| 404 | mark settle → kicker → lede → staggered exits | — | fade-up | disconnected-path SVG | canonical exits | (spot) | 0 | static ✓ | simplified ✓ |

## Product surfaces (intensity tiers per directive §3)

| Surface | Motion | State |
|---|---|---|
| Customer dashboard (helpdesk) | Restrained: existing page entrances, drawer/tab transitions, status changes; no operational data animated | unchanged this pass (G-04 baseline held) |
| Operations CRM | Most restrained: quick transitions, loading states only | unchanged this pass (G-05 baseline held) |

## Engineering invariants (all verified in the measured runs)

- transform/opacity/clip-path/stroke-dashoffset only; zero CLS (sweep overflow probe clean).
- One pooled IntersectionObserver per page via `useReveal`; reveal-once (unobserve on fire).
- Default-visible without JS: hidden state only applies after `data-reveal-ready` is set by the hook — measured `stuck = 0` on every route even mid-scroll.
- No animation on LCP elements (hero h1s render static or clip-reveal, never opacity-0).
- Reduced motion: `armedBelowFold = 0`, `stuckOnLoad = 0` on all 12 routes.
- Ambient loops on the receptionist page pause when the tab is hidden or the hero offscreen.
