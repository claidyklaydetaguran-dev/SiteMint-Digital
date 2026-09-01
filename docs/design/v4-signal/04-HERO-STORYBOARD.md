# V4 Homepage Hero — Cinematic Storyboard & Production Plan

**Status: storyboard for owner approval. No Magnific credits spent in this phase.**
The existing Corporate Signal Loop remains the temporary fallback until the owner approves this
board and the final video is generated.

## Concept

One continuous shot inside a deep atmospheric field (midnight ink, faint navy volumetric haze).
Scattered light fragments — missed calls, unread inquiries, half-finished forms — drift without
direction. As the camera pushes in, a single cyan signal catches one fragment and begins to
thread the rest together, shifting cyan → turquoise → mint as it organizes chaos into a composed
system. The video covers the **entire hero viewport** (full-bleed background); copy and CTA are
HTML overlaid, readable with or without the video.

## Scene-by-scene storyboard (scroll maps to narrative state)

| Scene | Scroll ≈ | Visual | Overlay copy state |
|---|---|---|---|
| 1. Scatter | 0–25% | Dozens of dim amber/white fragments drift in dark field; occasional amber pulse (a missed call) flares and dies. Camera slow push-in. | H1 + subhead + CTA fully visible from first paint |
| 2. Organize | 25–55% | A cyan thread ignites at frame left, sweeps through the field; fragments snap onto the thread in sequence, amber cooling to cyan as they join. | Supporting line highlights "websites · apps · CRM · AI reception" |
| 3. Connect | 55–85% | Thread weaves through five faint node-glyphs (site, chat bubble, CRM grid, gear, calendar check), each glowing turquoise as passed. | Mini-labels fade in beside nodes |
| 4. Resolve | 85–100% | Thread settles into a calm horizontal signal line ending in a mint terminus pulse; field is ordered, breathing slowly. | Final composition: H1, one-line proof of promise, primary CTA prominent |

Keyframes to pre-generate for approval (stills, ~100 credits each, variable): K1 scatter-field
wide, K2 mid-weave with thread at half-journey, K3 resolved system with mint terminus. K3 doubles
as the **poster frame**.

## Copy direction (readable without video)

- H1: **Digital systems that turn attention into customers.**
- Support: SiteMint builds websites, web apps, CRM workflows, and AI reception systems that work
  as one connected system — so no inquiry gets lost.
- CTA: **Start a Project** (primary) · **See how it works** (secondary, scrolls to chapter 01).

## Production prompt (Seedance 2.0 Pro — `bytedance-seedance-pro-2.0`, SOTA rank 1)

> Abstract cinematic motion design, premium tech-brand title sequence. A deep midnight-navy void
> (#071324) with soft volumetric haze and extremely subtle film grain. Dozens of small dim
> light-fragments — thin glowing shards and dots in pale amber (#F5A524 at low intensity) and
> faint white — drift slowly and aimlessly in 3D space, occasionally flickering. A single
> luminous cyan light-thread (#22D3EE) ignites at the left edge and sweeps gracefully through the
> field like a plotted route; every fragment it touches is pulled onto the thread, aligning into
> an elegant flowing line, its color cooling from amber to cyan as it joins. As the thread
> progresses it shifts hue smoothly from cyan through turquoise (#2DD4BF) to soft electric mint
> (#4AF2C8) at its head. The thread weaves smooth S-curves past five faint geometric node glyphs
> that glow softly as it passes. Final state: the field is calm and ordered, one continuous
> horizontal signal line breathing gently with a mint pulse at its end. Slow confident camera
> push-in for the first two thirds, then settle to static for the resolved ending. Shallow depth
> of field, high dynamic range, glossy light bloom kept restrained, no lens dirt. Dark
> negative-space composition with the lower-left third kept clear for interface text overlay.
> Loop-friendly ending (final 20 frames nearly static).

- **Negative prompt / avoid:** no text, no letters, no logos, no UI screenshots, no human faces
  or hands, no purple, no magenta, no neon-cyberpunk grid, no glitch effects, no lens flares
  across center, no rapid strobing or flicker above gentle pulse (photosensitivity), no
  camera shake, no watermarks.
- **Camera directive:** `pushIn` (scenes 1–3) → `static` (scene 4); single continuous shot, no
  cuts (or Seedance multishot with 3 shots of 4s if the single take muddies the transition).
- **Duration / AR / resolution:** desktop master **12s, 21:9, 1080p**; mobile alternative
  **8s, 9:16, 720p** (or center-crop of master if composition survives).
- **Poster-frame plan:** extract scene-4 resolved frame (≈ t=11s) as AVIF/WebP+JPEG poster,
  ≤60KB at 1920w; this is also the reduced-motion and data-saver composition and the LCP image.

## Delivery & compression plan

- Desktop: AV1 WebM (~1.2–1.8MB target for 12s 1080p at this low-complexity content) + H.264 MP4
  fallback (~2.5MB, CRF 26, no audio track). `preload="none"`, poster first, video lazy-attached
  after LCP + `requestIdleCallback`, autoplay muted loop **only when** `prefers-reduced-motion`
  is off and Save-Data/effective connection allows; otherwise poster only.
- Mobile: poster by default; 9:16 720p clip (~600–900KB) only on fast connections; scroll
  narrative falls back from video-scrub to the CSS/SVG signal overlay (the prototype's field),
  which layers above the poster.
- The HTML/SVG overlay signal (prototype implementation) remains in production as the interactive
  layer; the video is atmosphere, so the page stays fully legible if video never loads.

## Estimated Magnific credit cost (simulated 2026-09-01, `simulate_cost`, exact unless noted)

| Item | Credits |
|---|---|
| Desktop master 12s 21:9 1080p (Seedance 2.0 Pro) | 8,400 (exact) |
| Expected 1 retake of master | 8,400 |
| Mobile 8s 9:16 720p | 2,240 (exact) |
| 3–5 keyframe stills for approval | ~300–500 (variable) |
| **Planned budget** | **~19,500 credits** (min ~11,000 if first take lands and mobile is a crop) |

Account at simulation time: 224,547 credits available (Premium+; unlimited mode not active for
this session, so generation would draw from credits). Budget ≈ 8.7% of available.

**Gate:** owner approves this storyboard → generate K1–K3 stills → owner approves stills →
generate master → QA → mobile variant. No step starts without the prior approval.
