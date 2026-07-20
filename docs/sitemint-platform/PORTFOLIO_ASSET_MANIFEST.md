# Portfolio Asset Manifest — Phase 2B.2 (corrected in Phase 2B.2.1)

> Originally prepared 2026-07-20 in Phase 2B.2, branch
> `claude/phase-2b2-portfolio-assets-8vh4q1`, based on
> `claude/sitemint-phase-2b1-audit-wtoai0` @
> `0ca3f4311d4a688aa0167797db54cd6cace4b450`. **Corrected 2026-07-20 in
> Phase 2B.2.1** following owner visual review of the Phase 2B.2 owner-review
> package — see §8 below. Does not modify `SelectedWorkSection.tsx`, the
> platform-preview homepage, routes, or navigation.

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

| Project | Output file | Source dims/size | Output dims/size | Quality | Compression ratio | Output MD5 | Edits made | Status (Phase 2B.2.1) |
|---|---|---|---|---|---|---|---|---|
| Shasta Greene | `shasta-greene-desktop.webp` | 1920x1080, 2,429,598 B | **1600x733 (not 16:9 — see §8)** | WebP q82 | 25.0x | `1d43500b093752507c38b87d2ec8f445` | Cropped bottom 200px of the 1080px source (removed the feedback-widget region) before resizing; source PNG left unmodified | **Prepared reference — recapture required. Not implementation-approved.** Still shows the site's own "$250M+ / 500+ / #1" stats row; not reverified against the current live site. |
| OneFilAm Community | `onefilam-community-desktop.webp` | 1920x1080, 1,316,691 B | 1600x900, 62,506 B | WebP q82 | 21.1x | `a21fd50ab3e5ec84db1c0002bf6bc703` | None — straight resize + re-encode | **Historical/prepared reference only.** Owner independently confirmed the live site now shows active 2026 content; this capture's date is unknown, so it is not current-site-verified. |
| Herlinda Valdovinos | `herlinda-valdovinos-desktop.webp` | 1920x1080, 1,890,203 B | 1600x900, 102,046 B | WebP q82 | 18.5x | `71bafa61d7384c7992e90380dbd89142` | None — straight resize + re-encode | **Visually approved candidate.** Not current-site-verified, not permission-approved. Cleanest of the three per owner review. |

All three outputs verified: open correctly, non-zero dimensions, no visible
corruption, no distortion (Shasta's crop is intentional and documented
above, not a distortion of the retained region), text remains legible at
1600px width, no upscaling performed, no generated/inpainted content, no
watermark added. All are under the 300 KB desktop target.

**No mobile-optimized assets exist** (`*-mobile.webp` files were not
created for any project) because no mobile source screenshots exist yet.
**None of the three files above may be used in Phase 2B.3 as-is** — see §8
for the corrected readiness status of each.

## 6. Implementation manifest for Phase 2B.3

This section is a plan only — `SelectedWorkSection.tsx` was **not** modified
this checkpoint.

### FEATURED — Shasta Greene Real Estate

| Field | Value |
|---|---|
| Category | Real Estate |
| Project-placement status | **Approved as the intended featured project** (owner decision, Phase 2B.2.1) |
| Desktop asset | `/portfolio/shasta-greene-desktop.webp` — **rejected for public use, see §8**; do not reference this file from any implementation |
| Mobile asset | **Not available** — capture required |
| Fallback asset | `/portfolio-shasta.png` (existing, unoptimized, uncropped — also rejected, still shows both the feedback widget and the stats row) |
| Alt text (draft) | Do not draft until a current, approved capture exists |
| Public URL | https://shastagreene.com (not re-verified live this session; owner independently confirmed current 2026 content is indexed) |
| CTA label | "Visit Website" (existing pattern, for future use) |
| Permission status | Placement approved; current-asset use not approved |
| Recommended crop | See §8 aspect-ratio correction — 1600x733 is not an approved implementation ratio |
| Light-theme treatment | Not designed — blocked on a current, approved capture |
| Dark-theme treatment | Not designed — blocked on a current, approved capture |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` when implemented |
| Fixed aspect ratio | To be decided in §8 once a real 16:9 (or intentionally-supported alternate ratio) capture exists |
| May ship in 2B.3? | **No** — current asset rejected; requires a fresh current desktop + mobile capture |

### SUPPORTING — OneFilAm Community

| Field | Value |
|---|---|
| Category | Nonprofit Organization |
| Project-placement status | **Approved in principle as a supporting project** (owner decision, Phase 2B.2.1) |
| Desktop asset | `/portfolio/onefilam-community-desktop.webp` — **historical reference only**, not current-site-verified |
| Mobile asset | Not available |
| Fallback asset | `/portfolio-onefilam.png` (same historical-reference caveat) |
| Alt text (draft) | Do not draft until a current, verified capture exists |
| Public URL | https://onefilamcommunity.org (not re-verified live this session; owner independently confirmed the live site now shows active 2026 content) |
| CTA label | "Visit Website" (existing pattern, for future use) |
| Permission status | Organizational approval pending |
| Recommended crop | 16:9, top-anchored (already matches on the existing reference asset) |
| Light-theme treatment | Standard card, as existing pattern |
| Dark-theme treatment | Not yet designed |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` |
| Fixed aspect ratio | `aspect-[16/9]`, `object-cover` |
| May ship in 2B.3? | **No** — requires current desktop recapture, current mobile capture, and organizational approval |

### SUPPORTING — Herlinda Valdovinos (only after client approval)

| Field | Value |
|---|---|
| Category | Professional Services |
| Project-placement status | **Approved as a supporting candidate, contingent on client permission** (owner decision, Phase 2B.2.1) |
| Desktop asset | `/portfolio/herlinda-valdovinos-desktop.webp` — **visually approved candidate**, not current-site-verified |
| Mobile asset | Not available |
| Fallback asset | `/portfolio-herlinda.png` |
| Alt text (draft) | "Herlinda Valdovinos — Professional Services website, desktop view" (may be finalized once permission + verification are in) |
| Public URL | https://herlindavaldovinos.com (not re-verified live this session; requires final verification) |
| CTA label | "Visit Website" |
| Permission status | **Pending client approval** |
| Recommended crop | 16:9, top-anchored (already matches on the existing asset) |
| Light-theme treatment | Standard card, as existing pattern |
| Dark-theme treatment | Not yet designed |
| Mobile treatment | Undefined until mobile capture exists |
| Lazy-loading | Recommend `loading="lazy"` |
| Fixed aspect ratio | `aspect-[16/9]`, `object-cover` |
| May ship in 2B.3? | **No** — explicit client permission, current-site verification, and a mobile capture are all required first |

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

1. A **fresh current desktop and mobile capture** for Shasta Greene (the
   existing capture is rejected — see §8), and a documented owner permission
   record.
2. A **fresh current desktop and mobile capture** for OneFilAm Community
   (the existing capture is historical-reference-only — see §8), plus
   organizational permission.
3. A **current-site verification** and **mobile capture** for Herlinda
   Valdovinos, plus explicit client permission (the existing desktop
   screenshot is visually approved and may be reusable once verified current
   — see §8).
4. Claidy Taguran's URL and company-work-attribution questions resolved
   before any Claidy asset is prepared or featured.
5. A design decision for the dark-theme treatment of these (currently
   light/bright) screenshots inside `SelectedWorkSection.tsx`'s dark
   browser-chrome frame.
6. A resolved standard aspect ratio for the Shasta replacement asset (see §8
   — the current 1600x733 file is not 16:9 and must not be treated as one).

## 8. Phase 2B.2.1 corrections (owner review of the Phase 2B.2 package)

The owner reviewed the Phase 2B.2 owner-review ZIP and the three boards and
returned the following corrections. Nothing in §§1–7 above was rewritten to
erase the original Phase 2B.2 findings — inline status notes were added
instead so the history of what changed and why stays visible.

### 8.1 Shasta Greene — asset rejected, placement approved

- **Project-placement decision:** approved as the intended featured project.
- **Current optimized screenshot decision:** rejected for public
  implementation. It still visibly shows "$250M+ Annual Team Volume," "500+
  Families Helped," and "#1 OC Market Specialist" — claims the owner
  identifies as older or potentially unsupported and inconsistent with
  current, more grounded positioning. The screenshot was never reverified
  against the current live homepage; the owner independently confirmed
  (from an unrestricted browser) that the current Shasta Greene site is
  indexed and serving current 2026 content, meaning a fresh capture should
  be achievable outside this environment's blocked network.
- Cropping only the feedback widget (the Phase 2B.2 edit) was **insufficient**
  — the whole statistics row needs to be either absent from a fresh capture
  or cropped above entirely. Per the owner's explicit instruction, the
  existing file was **not** cropped further to force an approval — that
  would risk misrepresenting old evidence as if it were resolved. A genuine
  recapture is required instead.
- Relationship wording corrected in `PORTFOLIO_PERMISSION_MANIFEST.md` from
  "Owner's own business (Claidy/SiteMint-affiliated)" to "Shasta Greene's
  owner-controlled real estate business; SiteMint project attribution
  subject to the approved portfolio description."

### 8.2 Shasta Greene — aspect-ratio correction

The Phase 2B.2 implementation manifest recommended `aspect-[16/9]` for the
Shasta card, but the optimized file produced that checkpoint is **1600x733**
— a true 16:9 image at 1600px wide would be **1600x900**. Using the
1600x733 file inside a 16:9 CSS container would introduce unintended
`object-cover` cropping or letterboxing that was never explicitly reviewed.
This manifest does not resolve that mismatch by stretching or further
cropping the existing file. Instead, the standard for the **replacement**
capture is recorded here:

| Asset | Standard |
|---|---|
| Desktop | 1600x900, 16:9 |
| Mobile | 780x1688 source capture, or an optimized proportional equivalent based on a 390x844 viewport |

No stretching of the existing 1600x733 file is permitted, and it must not be
placed inside a 16:9 implementation container without an explicitly
approved crop decision — which has not been made, because the file itself
is rejected pending recapture.

### 8.3 OneFilAm Community — historical reference only

Project placement approved in principle as a supporting project. The
existing optimized screenshot is visually clean but of unknown capture date;
the owner independently confirmed the live OneFilAm site now shows active
2026 community/event content, meaning it has continued to evolve since this
repository's capture. The image is retained in the repo as a **historical
reference only** and must not be described as current or implementation-
ready. A current desktop recapture and current mobile capture are both
required, alongside organizational permission.

### 8.4 Herlinda Valdovinos — visually approved, not publication-ready

The owner assessed this as the cleanest current asset — strong visual
identity, clear hero treatment, no overlay, no visible private information,
good optimization quality — and marked it a **visually approved candidate**.
This is explicitly *not* the same as current-site-verified or
permission-approved: the screenshot has not been compared against the
current live site, and that comparison must not be implied anywhere in this
documentation. Client permission and a mobile capture remain required before
any public use.

### 8.5 Mobile assets — genuinely missing, not a documentation gap

The Phase 2B.2 mobile board was a status board only; it contained zero
project screenshots and none were fabricated. That remains true after this
correction. Desktop-only implementation is **not approved** for Phase
2B.3 — using desktop screenshots everywhere on mobile would look like an
afterthought, which is the exact impression this program is trying to
avoid. A mobile capture is a hard requirement for all three candidate
projects, not an optional enhancement.

### 8.6 Required capture set before Phase 2B.3 implementation

| Project | Required before implementation |
|---|---|
| Shasta Greene | Current desktop capture (no outdated stats row), current mobile capture |
| OneFilAm Community | Current desktop capture, current mobile capture, organizational approval |
| Herlinda Valdovinos | Current desktop verification or recapture, current mobile capture, client permission |
| Claidy Taguran | Remains deferred — no capture requested |

See `/tmp/sitemint-2b2-owner-capture-intake/OWNER_CAPTURE_INSTRUCTIONS.md`
for the exact capture parameters provided to the owner to produce these six
files from an unrestricted browser.
