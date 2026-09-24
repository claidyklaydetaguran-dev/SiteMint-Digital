# Asset Plan — Frontend V2

> **Owner decision 6 — binding.** No Magnific image and no video are authorised
> for Phase 1. No asset is generated, downloaded, or added merely to fill space.
> Magnific is not called.
>
> The first implementation must prove the **typography, hierarchy, responsive
> layout, real interface components, and HTML/CSS system visualization** without
> depending on generated imagery.

## 1. Strategy

Frontend V2 is built primarily from:

1. **Real UI rendered in HTML/CSS** — the hero system composition, workflow
   diagrams, dashboard previews.
2. **Real product screenshots** captured from verified running interfaces.
3. **Simple SVG icons** (`lucide-react`, already a dependency).
4. **Restrained abstract shapes** in CSS or inline SVG.

**AI-generated screenshots are prohibited** — their interface text is unreliable
and would put fabricated UI in front of customers.

## 2. Current asset debt

`artifacts/web-agency/public/` — **19.8 MB across 19 files, 14 over 300 KB**:

| File | Size | Disposition |
|---|---|---|
| `portfolio-shasta.png` | 2.38 MB | **Re-encode** — real work, keep, AVIF/WebP + srcset |
| `plant.png` | 2.37 MB | **Remove** — decorative, replaceable with CSS |
| `devices-hero.png` | 2.34 MB | **Remove** — fake-device hero is prohibited |
| `portfolio-herlinda.png` | 1.85 MB | **Re-encode** |
| `team-claidy.png` | 1.77 MB | **Re-encode** — real person, keep |
| `portfolio-claidy.png` | 1.64 MB | **Re-encode** |
| `hero-devices-remove-bg-io.png` | 1.46 MB | **Remove** — fake devices; also the file that 404'd under base path in Gate 3 |
| `portfolio-onefilam.png` | 1.29 MB | **Re-encode** |
| remaining 11 files | balance of 19.8 MB | Audit individually in Phase 2 |

Target after re-encode: **no image above 300 KB**, portfolio thumbnails ≤ 120 KB.

## 3. Asset classification

### Required

| # | Asset | Page / section | Purpose | Dimensions | Crop-safe | Subject | Colour | Format | Max size | Mobile | Loading | Magnific |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | System composition | Home / hero | Show Website→CRM→Automation→Receptionist | fluid, ~720×480 box | n/a | HTML/CSS/SVG nodes + edges | navy + mint accent | **inline SVG/CSS** | 0 KB network | simplified 2-column stack | eager, inline | **No** |
| R2 | Call workflow diagram | AI Receptionist / §3 | Answer→Qualify→Schedule/Escalate→Record | fluid, ~960×360 | n/a | inline SVG | navy on off-white | **inline SVG** | 0 KB | vertical stack | eager, inline | **No** |
| R3 | Dashboard screenshot | Home §7, AIR §7 | Show the real product | 1600×1000 @2x | 8% edge | **real captured UI** | as rendered | AVIF + WebP | **180 KB** | 800×500 crop | `lazy` | **No** |
| R4 | Selected-work thumbnails ×4 | Home §8, `/work` | Real projects | 1200×750 | 6% edge | real site captures | as rendered | AVIF + WebP | **120 KB each** | 600×375 | `lazy` | **No** |
| R5 | Team portraits | Home §10, `/about` | Real people | 800×800 | face-safe centre 60% | real photos | warm neutral | AVIF + WebP | **90 KB each** | 400×400 | `lazy` | **No** |
| R6 | Favicon / touch icons | global | Identity | 32/180/512 | n/a | existing mark | navy + mint | SVG + PNG | 15 KB | same | eager | **No** |
| R7 | OpenGraph image | global | Social preview | 1200×630 | 10% edge | wordmark + tagline on navy | navy + mint | PNG/WebP | **150 KB** | same | n/a | **No** |

### Optional

| # | Asset | Page / section | Purpose | Dimensions | Crop-safe | Subject | Colour | Format | Max size | Mobile | Loading | Magnific |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| O1 | Atmospheric brand still | Home §12 final CTA **only** | Warmth behind the closing CTA | 2400×1200 | 15% all edges (text overlays centre) | abstract depth/light, no subject | light warm-white/mint range | AVIF + WebP | **220 KB** | 1200×900 crop or omitted | `lazy` | **No — withdrawn for Phase 1 (owner decision 6)** |
| O2 | Solutions section illustrations ×3 | `/solutions/*` | Differentiate pages | ~640×400 | n/a | abstract CSS/SVG | navy/mint/slate | inline SVG | 0 KB | simplified | inline | **No** |

### Unnecessary — do not produce

Fake laptop/tablet/phone composites · AI-generated UI screenshots · stock office
photography · robot or headset-human imagery · neon circuitry · customer logo
wall · award badges · decorative blur orbs as image files (CSS if needed at all)
· `plant.png` · `devices-hero.png` · `hero-devices-remove-bg-io.png` · **any
generated (Magnific or otherwise) image in Phase 1** · **any video** · any image
added merely to fill space.

## 4. Video

**No video is authorised for Phase 1 or for the first V2 implementation** (owner
decision 6). No hero video, no background video, no autoplay media of any kind.

## 5. Magnific — not authorised

**Owner decision 6: no Magnific image is authorised for Phase 1.** O1 is
withdrawn from the Phase 1 plan. Magnific is not called, and no image is
generated, downloaded, or added to fill space.

Phase 1 must stand on its own without generated imagery — proving the
typography, hierarchy, responsive layout, real interface components, and the
HTML/CSS system visualization (R1, R2, O2), all of which cost **0 KB** of
network.

Should a later phase revisit an atmospheric still, it requires a **separate,
explicit owner instruction** and would remain subject to: no text · no UI · no
devices · no logo · no people · no robots · no neon · no transparent-glass
overload; abstract depth and light only, in the light warm-white/mint range;
AVIF + WebP ≤ 220 KB, lazy-loaded, with a mobile crop; decorative → `alt=""` and
`aria-hidden`, never carrying meaning.

## 6. Delivery rules

1. Vite-imported so hashing and base rewriting are automatic; `public/` only for
   path-stable files (favicon, OG image, `robots.txt`).
2. `<picture>` with AVIF → WebP → fallback.
3. Explicit `width`/`height` on every `<img>` (CLS).
4. `loading="lazy" decoding="async"` below the fold; the hero ships no raster.
5. Meaningful images get real `alt`; decorative get `alt=""` + `aria-hidden`.
6. No asset referenced by a hand-written absolute path — `withBase()` or import
   only (Gate 3's 404 was exactly this defect).
