# Frontend V3 — Magnific visual program status

## Generated and shipped (2 of the 3 allowed attempts used)

Both priority poster images were generated with the authorized Magnific
connector (75 credits each, 150 total) and are committed as Vite-hashed
assets, blended into the theaters as decorative layers under the real DOM:

| Asset | File | Used in |
|---|---|---|
| Corporate Signal Loop poster | `artifacts/web-agency/src/assets/v3/signal-loop-poster.jpg` | HomeV3 hero theater |
| Voice Loop poster | `artifacts/web-agency/src/assets/v3/voice-loop-poster.jpg` | AI Receptionist landing theater |

Both respect the program rules: no text, no logos, no interface, no people,
no robot, no purple, no ordinary green, generous negative space.

## Video loops — awaiting owner decision (not generated)

The 8–10s seamless loops were **not** generated. Reasons: video generation is
substantially more expensive per attempt, a seamless loop rarely lands on a
first attempt (and the program caps total attempts at three, one remaining),
and the shipped CSS/SVG signal animation + poster already deliver the
atmosphere at ~1% of the byte cost with full `prefers-reduced-motion`
compliance. Simulate cost before running; account is Premium+ but unlimited
mode is not active via this connector, so generations draw plan credits.

Exact prompts, ready to run:

**1. Corporate SiteMint Signal Loop (16:9, ~8–10s, seamless loop, no audio)**
> Abstract luminous signal stream flowing steadily left to right through deep
> ink-navy darkness: a thin braided ribbon of glowing turquoise and electric
> cyan light fibers passing four subtly brighter waypoint pulses, each pulse
> gently flaring as the stream passes, soft volumetric glow, fine particle
> wisps drifting, camera locked, loop-safe constant motion, generous dark
> negative space above and below, premium minimal cinematic atmosphere, no
> text, no people, no interface elements, no purple, no green.

**2. AI Receptionist Voice Loop (16:9, ~8–10s, seamless loop, no audio)**
> Abstract glowing voice waveform of fine luminous cyan threads oscillating
> smoothly on a deep dark blue-black background: symmetric amplitude peaks in
> the center breathing between speaking and listening intensity, fading to
> calm thin horizontal lines at the edges, mint turquoise and electric cyan
> glow, soft bloom, camera locked, loop-safe periodic motion, generous dark
> negative space, premium minimal product atmosphere, no text, no people, no
> robot, no interface elements, no purple, no green.

Integration is already prepared: drop the rendered MP4/WebM beside the poster
and swap the theater `<img>` for a `<video muted loop playsinline
poster={...}>`; reduced-motion users and mobile keep the static poster.
