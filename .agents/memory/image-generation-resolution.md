---
name: Image generation resolution limits
description: generateImage tool caps output resolution well below "4K"; use ImageMagick to upscale/convert when a true 4K or WebP asset is required.
---

The `generateImage` tool produces images capped around 1408x768 for 16:9 regardless of prompt wording like "4K" or "8K" — it only accepts `.png` output and does not support WebP directly.

**Why:** A hero-background request asking for a 3840x2160 WebP asset returned a 1408x768 PNG from `generateImage`. Using it unscaled on a 4K hero would look soft/blurry.

**How to apply:** After generating the base PNG, upscale with ImageMagick (`magick input.png -filter Lanczos -resize 3840x2098 -unsharp 0x0.75+0.75+0.008 output.png`) then convert to WebP (`magick output.png -quality 82 output.webp`). `magick`/`convert` are available in the environment; `sharp`/`cwebp` are not installed by default. Always ship both WebP (primary, via `<picture><source type="image/webp">`) and PNG (fallback `<img>`) for hero/background images.
