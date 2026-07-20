# Portfolio Asset Manifest — Phase 2B.2

> Prepared: 2026-07-20. Branch `claude/phase-2b2-portfolio-assets-8vh4q1`,
> based on `claude/sitemint-phase-2b1-audit-wtoai0` @
> `0ca3f4311d4a688aa0167797db54cd6cace4b450`. Does not modify
> `SelectedWorkSection.tsx`, the platform-preview homepage, routes, or
> navigation.

## 1. Environment constraint (read first)

Outbound HTTPS to `shastagreene.com`, `onefilamcommunity.org`,
`herlindavaldovinos.com`, and `ClaidyTaguranPorfolio.replit.app` all returned
`403` at the CONNECT layer from this environment's egress proxy (policy
denial, confirmed via `/root/.ccr/__agentproxy/status`; matches the prior
Phase 2A.4/2B.1 finding of blocked outbound access to these same domains).
Per the checkpoint's own instructions this is **not retried** — it is
reported, existing verified assets are used instead, and no "current-site
verification" is claimed. Consequently:

- No project's live URL could be re-confirmed reachable this session.
- No new screenshots (desktop or mobile) could be captured this session.
- All work below uses the pre-existing repository screenshots inventoried
  in Phase 2B.1 (`PORTFOLIO_EVIDENCE_AUDIT.md`), re-verified by direct visual
  inspection and checksum in this checkpoint.

## 2. Canonical desktop asset inventory (source files, unmodified)

| Path | Dimensions | Format | Size | MD5 | Duplicate of |
|---|---|---|---|---|---|
| `artifacts/web-agency/public/portfolio-shasta.png` | 1920x1080 | PNG | 2,429,598 B | `b6c38eb6d1911136c53e6d57141e28ca` | — (canonical) |
| `artifacts/web-agency/public/portfolio-onefilam.png` | 1920x1080 | PNG | 1,316,691 B | `d061356ec5c29f82dc9d3e0e271ef4ef` | — (canonical) |
| `artifacts/web-agency/public/portfolio-herlinda.png` | 1920x1080 | PNG | 1,890,203 B | `58f21b1909aa2fe6b1195e91e069da8c` | — (canonical) |
| `artifacts/web-agency/public/portfolio-claidy.png` | 1920x1080 | PNG | 1,680,905 B | `92d18d205992af407ba7dd7d12f263fc` | — (canonical, deferred project) |
| `attached_assets/screenshots/shastagreene_com.png` | 1920x1080 | PNG | 2,429,598 B | `b6c38eb6d1911136c53e6d57141e28ca` | byte-identical duplicate of `portfolio-shasta.png` |
| `attached_assets/screenshots/onefilamcommunity_org.png` | 1920x1080 | PNG | 1,316,691 B | `d061356ec5c29f82dc9d3e0e271ef4ef` | byte-identical duplicate of `portfolio-onefilam.png` |
| `attached_assets/screenshots/herlindavaldovinos_com.png` | 1920x1080 | PNG | 1,890,203 B | `58f21b1909aa2fe6b1195e91e069da8c` | byte-identical duplicate of `portfolio-herlinda.png` |
| `attached_assets/screenshots/claidytaguranporfolio_replit_app.png` | 1920x1080 | PNG | 1,680,905 B | `92d18d205992af407ba7dd7d12f263fc` | byte-identical duplicate of `portfolio-claidy.png` |
| `attached_assets/screenshots/claidytaguranportfolio_replit_app.png` | 1920x1080 | PNG | 41,101 B | `a38bfe9efe7ed06f0636385216e0e68b` | **Stale** — shows Replit "app isn't live yet" placeholder, not real content. Do not use. |

No assets were deleted this checkpoint (duplicates remain in place; cleanup
of `attached_assets/screenshots/` remains a separate, future, low-risk
checkpoint as recommended in Phase 2B.1).

## 3. Visual/privacy review (this checkpoint, direct inspection)

| Project | Feedback/overlay found | Private info found | Broken/placeholder content | Text readable | Verdict |
|---|---|---|---|---|---|
| Shasta Greene | Yes — third-party "Share your feedback / Sign in" widget, bottom-right corner | No | No | Yes | Retain, crop overlay before use |
| OneFilAm Community | No | No | No | Yes | Retain as-is |
| Herlinda Valdovinos | No | No | No | Yes | Retain as-is |
| Claidy Taguran Portfolio | No | No (self-reported stats are the subject's own claims, not SiteMint's) | No | Yes | Retain, deferred — not optimized this checkpoint |

## 4. Mobile screenshot status

**No mobile screenshots exist for any project, and none could be captured
this checkpoint** (network access to all four domains is blocked). This
remains the primary gap identified in Phase 2B.1 and is still open. See
`CAPTURE_VALIDATION_REPORT.txt` in the owner-review package for capture
instructions the owner can run locally (recommended viewport 390x844,
project homepage, no browser chrome, no private data).

## 5. Optimization results (approved candidates only)

Produced under `artifacts/web-agency/public/portfolio/`. Claidy Taguran was
**not** optimized or added to this directory, per instructions not to include
it in the approved implementation set.

| Project | Output file | Source dims/size | Output dims/size | Quality | Compression ratio | Output MD5 | Edits made |
|---|---|---|---|---|---|---|---|
| Shasta Greene | `shasta-greene-desktop.webp` | 1920x1080, 2,429,598 B | 1600x733, 97,098 B | WebP q82 | 25.0x | `1d43500b093752507c38b87d2ec8f445` | Cropped bottom 200px of the 1080px source (removed the feedback-widget region) before resizing; source PNG left unmodified |
| OneFilAm Community | `onefilam-community-desktop.webp` | 1920x1080, 1,316,691 B | 1600x900, 62,506 B | WebP q82 | 21.1x | `a21fd50ab3e5ec84db1c0002bf6bc703` | None — straight resize + re-encode |
| Herlinda Valdovinos | `herlinda-valdovinos-desktop.webp` | 1920x1080, 1,890,203 B | 1600x900, 102,046 B | WebP q82 | 18.5x | `71bafa61d7384c7992e90380dbd89142` | None — straight resize + re-encode |

All three outputs verified: open correctly, non-zero dimensions, no visible
corruption, no distortion, aspect ratio preserved (Shasta's crop is
intentional and documented above, not a distortion), text remains legible at
1600px width, no upscaling performed, no generated/inpainted content, no
watermark added. All are under the 300 KB desktop target.

**No mobile-optimized assets exist** (`*-mobile.webp` files were not
created for any project) because no mobile source screenshots exist yet.

## 6. Implementation manifest for Phase 2B.3

This section is a plan only — `SelectedWorkSection.tsx` was **not** modified
this checkpoint.

### FEATURED — Shasta Greene Real Estate

| Field | Value |
|---|---|
| Category | Real Estate |
| Desktop asset | `/portfolio/shasta-greene-desktop.webp` |
| Mobile asset | **Not available** — capture required before mobile card can ship |
| Fallback asset | `/portfolio-shasta.png` (existing, unoptimized, uncropped — not recommended as final fallback since it still shows the feedback widget) |
| Alt text (draft) | "Shasta Greene Real Estate — Real Estate website, desktop view" |
| Public URL | https://shastagreene.com (not re-verified live this session) |
| CTA label | "Visit Website" (existing pattern) |
| Permission status | Final owner visual approval pending |
| Recommended crop | 16:9, top-anchored (hero + headline), matches the widget-cropped optimized asset |
| Light-theme treatment | Card on `bg-card`/`border-border`, as in existing `Portfolio.tsx` pattern |
| Dark-theme treatment | Needs a dark-shell container treatment (image itself is light/bright) — not yet designed |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` (currently absent from `Portfolio.tsx` images too) |
| Fixed aspect ratio | `aspect-[16/9]`, `object-cover` (matches existing `ProjectCard` pattern) |
| May ship in 2B.3? | **No** — permission not yet granted, mobile asset missing |

### SUPPORTING — OneFilAm Community

| Field | Value |
|---|---|
| Category | Nonprofit Organization |
| Desktop asset | `/portfolio/onefilam-community-desktop.webp` |
| Mobile asset | Not available |
| Fallback asset | `/portfolio-onefilam.png` |
| Alt text (draft) | "OneFilAm Community — Nonprofit Organization website, desktop view" |
| Public URL | https://onefilamcommunity.org (not re-verified live this session) |
| CTA label | "Visit Website" |
| Permission status | Organizational approval pending |
| Recommended crop | 16:9, top-anchored |
| Light-theme treatment | Standard card, as existing pattern |
| Dark-theme treatment | Not yet designed |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` |
| Fixed aspect ratio | `aspect-[16/9]`, `object-cover` |
| May ship in 2B.3? | **No** — permission not yet granted, mobile asset missing |

### SUPPORTING — Herlinda Valdovinos (only after client approval)

| Field | Value |
|---|---|
| Category | Professional Services |
| Desktop asset | `/portfolio/herlinda-valdovinos-desktop.webp` |
| Mobile asset | Not available |
| Fallback asset | `/portfolio-herlinda.png` |
| Alt text (draft) | "Herlinda Valdovinos — Professional Services website, desktop view" |
| Public URL | https://herlindavaldovinos.com (not re-verified live this session) |
| CTA label | "Visit Website" |
| Permission status | **Pending client approval** |
| Recommended crop | 16:9, top-anchored |
| Light-theme treatment | Standard card, as existing pattern |
| Dark-theme treatment | Not yet designed |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` |
| Fixed aspect ratio | `aspect-[16/9]`, `object-cover` |
| May ship in 2B.3? | **No** — explicit client permission required first |

### DEFERRED — Claidy Taguran Portfolio

| Field | Value |
|---|---|
| Category | Developer Portfolio |
| Desktop asset | Not prepared this checkpoint (deferred) |
| Mobile asset | Not available |
| Fallback asset | N/A |
| Alt text (draft) | N/A — do not draft until deferred status is resolved |
| Public URL | Unresolved — two conflicting Replit URL spellings, see `PORTFOLIO_PERMISSION_MANIFEST.md` |
| CTA label | N/A |
| Permission status | Deferred |
| Recommended crop | N/A |
| Light/dark-theme treatment | N/A |
| Mobile treatment | N/A |
| Lazy-loading | N/A |
| Fixed aspect ratio | N/A |
| May ship in 2B.3? | **No** |

## 7. What remains before Phase 2B.3 can wire real images into `SelectedWorkSection.tsx`

1. Owner grants explicit, documented permission for Shasta Greene (final
   visual approval), OneFilAm (organizational approval), and/or Herlinda
   Valdovinos (client approval) — independently; 2B.3 can proceed with
   whichever subset is approved.
2. Mobile screenshots captured for each approved project — requires network
   access this environment does not currently have, or an owner-run capture
   using the instructions in the owner-review package.
3. Claidy Taguran's URL and company-work-attribution questions resolved
   before any Claidy asset is prepared or featured.
4. A design decision for the dark-theme treatment of these (currently
   light/bright) screenshots inside `SelectedWorkSection.tsx`'s dark
   browser-chrome frame.
