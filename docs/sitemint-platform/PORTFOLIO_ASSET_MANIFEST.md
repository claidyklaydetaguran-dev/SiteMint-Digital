# Portfolio Asset Manifest — Phase 2B.2 (corrected in 2B.2.1, updated in 2B.2.2, current captures validated in 2B.2.3, Claidy crop corrected in 2B.2.3.1)

> Originally prepared 2026-07-20 in Phase 2B.2, branch
> `claude/phase-2b2-portfolio-assets-8vh4q1`, based on
> `claude/sitemint-phase-2b1-audit-wtoai0` @
> `0ca3f4311d4a688aa0167797db54cd6cace4b450`. **Corrected 2026-07-20 in
> Phase 2B.2.1** following owner visual review of the Phase 2B.2 owner-review
> package — see §8 below. **Updated in Phase 2B.2.2** to record the owner's
> decision approving Claidy Taguran Portfolio as a future supporting project
> (placement only) — see §6 and §9. **Updated in Phase 2B.2.3** to validate
> and optimize ten owner-supplied current screenshots (five projects,
> desktop + mobile each, including a new candidate, Hand Homecare) — see §10,
> which is the current source of truth for per-project readiness. Does not
> modify `SelectedWorkSection.tsx`, the platform-preview homepage, routes, or
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

### ADDITIONAL SUPPORTING (future) — Claidy Taguran Portfolio

| Field | Value |
|---|---|
| Category | Developer Portfolio |
| Project-placement status | **Approved as a future supporting project** (owner decision, this checkpoint) |
| Desktop asset | Not optimized or added to `artifacts/web-agency/public/portfolio/` this checkpoint. The existing `artifacts/web-agency/public/portfolio-claidy.png` may be used **temporarily** as-is, pending owner review, marked **historical reference — current browser verification pending** |
| Mobile asset | Not available — a real browser attempt at the exact URL failed with a proxy-level tunnel error identical to the other three projects' known block; no mobile screenshot exists and none was fabricated |
| Fallback asset | `portfolio-claidy.png` (temporary use only, per owner decision) |
| Explicitly excluded | `attached_assets/screenshots/claidytaguranportfolio_replit_app.png` — this is the stale, correctly-spelled-URL capture showing Replit's "app isn't live yet" placeholder, and must never be used for anything public |
| Alt text (draft) | Do not draft public alt text implying a verified-current screenshot; if used temporarily, alt text should reflect the project only, not freshness claims |
| Public URL | `https://ClaidyTaguranPorfolio.replit.app` (misspelling intentional — matches the real deployment address) — reachability unconfirmed by anyone this session (see `PORTFOLIO_PERMISSION_MANIFEST.md`) |
| CTA label | Consider omitting or disabling the external "Visit Website" link until the deployment's live status is confirmed, per owner's practical fallback suggestion |
| Permission status | Placement approved; screenshot/publication permission not approved |
| Recommended crop | Not evaluated — existing asset unchanged this checkpoint |
| Light/dark-theme treatment | Not evaluated this checkpoint |
| Mobile treatment | Undefined until a real mobile capture exists |
| Lazy-loading | N/A until implemented |
| Fixed aspect ratio | N/A until implemented |
| May ship in 2B.3? | **Only as a clearly internally-marked temporary/historical-reference entry**, if the owner separately reviews and approves using the existing screenshot; not as a "verified current" entry |

## 7. What remains before Phase 2B.3 can wire real images into `SelectedWorkSection.tsx`

> **Reconciled in Phase 2B.2.3.1.** The items below originally read as if no
> captures existed yet for any project. As of Phase 2B.2.3, current captures
> exist for all five projects (four existing + Hand Homecare); several of
> the original "remains" items are now resolved, and this section is
> rewritten per-project below so completed capture work is no longer
> presented as unresolved. Nothing here erases the original findings —
> they remain in §8 and §10 with full detail; this is a status reconciliation
> only.

**Shasta Greene Real Estate** — *open*
- Current desktop and mobile captures were supplied (Phase 2B.2.3).
- Both were rejected (stats row + feedback widget both still visible).
- **Fresh recapture still required** — this remains fully open.
- Owner permission record and a resolved standard aspect ratio for the
  eventual replacement asset (see §8.2/§10.1) also remain open.

**OneFilAm Community** — *partially resolved — remaining item listed*
- Current desktop and mobile captures were supplied (Phase 2B.2.3).
- Both were visually approved and optimized.
- **Capture task: resolved by Phase 2B.2.3.**
- **Organizational approval remains open.**

**Herlinda Valdovinos** — *partially resolved — remaining item listed*
- Current desktop was supplied and visually approved (Phase 2B.2.3).
- **Desktop capture task: resolved by Phase 2B.2.3.**
- Mobile was supplied but **rejected** because the navigation does not
  collapse into a mobile menu (a live responsive-design gap).
- **Mobile responsive improvement and recapture remain open.**
- **Client permission remains open.**
- Current URL updated by the owner to
  `https://sunshine-herlinda-site.replit.app/` (Phase 2B.2.3); not
  independently browser-verified.

**Claidy Taguran Portfolio** — *partially resolved — remaining item listed*
- Current desktop was supplied but **rejected** due to the missing animated
  word "Solutions" in the headline.
- **Desktop recapture remains open.**
- Current mobile was supplied; a corrected hero crop excluding the
  statistics row was prepared in **this checkpoint (Phase 2B.2.3.1)** after
  the Phase 2B.2.3 output was found to still contain the statistics (see
  §10.3/§10.4 correction notes).
- **Mobile capture task: resolved by Phase 2B.2.3.1.**
- **Permission remains open** (placement approved; screenshot/publication
  permission is not).

**Hand Homecare** *(new, Phase 2B.2.3)* — *partially resolved — remaining item listed*
- Current desktop and mobile were supplied and visually approved.
- **Capture task: resolved by Phase 2B.2.3.**
- **SiteMint attribution confirmation remains open.**
- **Publication permission remains open.**

**Cross-cutting items still open:**
1. A design decision for the dark-theme treatment of these (currently
   light/bright) screenshots inside `SelectedWorkSection.tsx`'s dark
   browser-chrome frame.
2. A resolved standard aspect ratio for the Shasta replacement asset — see
   §8.2/§10.1.
3. Adoption of a data-driven portfolio model — direction refined in §10.7
   (supersedes §9) with fields for per-project image fit/position and
   owner-verification status.

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
| Claidy Taguran | Future supporting project (placement approved) — real browser verification of `https://ClaidyTaguranPorfolio.replit.app` still pending; desktop/mobile capture optional, not requested this checkpoint |

See `/tmp/sitemint-2b2-owner-capture-intake/OWNER_CAPTURE_INSTRUCTIONS.md`
for the exact capture parameters provided to the owner to produce these six
files from an unrestricted browser.

## 9. Future data-driven portfolio model (documented only — not implemented)

Per owner direction, Phase 2B.3 should replace the current hardcoded
`projects` arrays in `Portfolio.tsx` and `SelectedWorkSection.tsx` with a
single shared, data-driven model. No code was changed this checkpoint; this
is a recorded direction for that future implementation.

```ts
type PortfolioProject = {
  id: string;
  projectName: string;
  category: string;
  description: string;
  contribution: string;
  publicUrl: string;
  desktopAsset: string;
  mobileAsset?: string;
  fallbackAsset?: string;
  captureDate?: string;
  currentSiteVerified: boolean;
  permissionStatus: string;
  publicationStatus: string;
  featured: boolean;
  sortOrder: number;
  altText: string;
  statusLabel?: string;
};
```

This structure is intended to let SiteMint:

- add new projects later without touching component markup
- replace screenshots (e.g. Claidy's temporary asset) without a redesign
- change a Replit link to a custom domain by editing one field
- reorder or re-feature projects via `sortOrder`/`featured`
- hide an outdated project without deleting its record
- use a desktop-only fallback temporarily via `fallbackAsset` when
  `mobileAsset` is absent
- keep `currentSiteVerified` and `permissionStatus` — internal verification
  state — visibly separate from public marketing copy, so a project can
  never accidentally present as "verified current" just because it renders
  on the page

Adopting this model is a Phase 2B.3 implementation decision, not something
performed in this documentation-only checkpoint.

## 10. Phase 2B.2.3 — Owner-Supplied Current Captures (validation and optimization)

The owner supplied ten current screenshots (desktop + mobile for five
projects — Shasta Greene, OneFilAm Community, Herlinda Valdovinos, Claidy
Taguran, and a new candidate, **Hand Homecare**) in
`SiteMint-Portfolio-Current-Captures-Reviewed.zip`, along with the owner's
own `CAPTURE_MANIFEST.tsv` (checksums/dimensions) and
`PORTFOLIO_VISUAL_REVIEW.md` (visual decisions). This checkpoint treats
these as **owner-supplied** captures — no URL was independently reached or
verified by this environment for any of the five projects. All checksums
and dimensions below were independently re-derived from the actual image
bytes and matched the owner-supplied manifest exactly.

### 10.1 Source-capture inventory (owner-supplied, unmodified)

| Filename | Dimensions | Size | SHA-256 |
|---|---|---|---|
| `claidy-taguran-desktop-current.png` | 1222×842 | 1,518,599 B | `0ee4279e410dceaf344488a3163ad4b5260dc8530dfa7501b2a145cfdbd9a0a6` |
| `claidy-taguran-mobile-current.png` | 388×836 | 464,383 B | `83badfbf90c6ba5131dec4b3bcfc8317bc27b6ca46c48ddfa4da86e4e112a2c3` |
| `shasta-greene-desktop-current.png` | 1221×846 | 2,139,827 B | `2ebb2eb5fdfe1b6e1f6a0a1a3e339cae727554c639b42491022b00c6343f03f8` |
| `shasta-greene-mobile-current.png` | 390×844 | 535,027 B | `5e20f35d017de293ace0dcb86bcc62c3f38320bd9efbcab0a974d8e66935cfcd` |
| `onefilam-community-desktop-current.png` | 1221×844 | 895,561 B | `cd15ee53a3f5008506befe7c213b044b8dcec04b60f9004b491f1d035a74b9e1` |
| `onefilam-community-mobile-current.png` | 388×840 | 202,414 B | `7cb510c927700fe4012c99dbb1437a9d6cf96991958cd00a16ec4a1bc9ec2e1b` |
| `hand-homecare-desktop-current.png` | 1221×850 | 1,606,686 B | `196ca01ac34fefcc742aeef86daa074ba81918ac90f491368a0f5c38a8286a0f` |
| `hand-homecare-mobile-current.png` | 388×838 | 388,897 B | `e7aaedd2abed34b36592be9b0b8741b1b997055ec13588b583f15c68fdb7658c` |
| `herlinda-valdovinos-desktop-current.png` | 1218×804 | 1,695,624 B | `051a60af3a4a6e8aeb04ed47906f7265efbb908f1581e5646e8398cd48f0aa25` |
| `herlinda-valdovinos-mobile-current.png` | 388×840 | 448,791 B | `3acea560fdc7a7c4c48b7e8d29c53e0092a749598119ff130e0877df4b1cf607` |

These source PNGs are staged only in the temporary owner-review package
(`/tmp/sitemint-2b23-owner-review/source/`), not committed to the
repository, per the checkpoint's allowed-files list.

### 10.2 Direct visual review findings (this checkpoint)

| Project | Desktop finding | Mobile finding |
|---|---|---|
| Claidy Taguran | Headline reads "Building Digital" / "That Drive Results" — the animated middle word "Solutions" is absent at capture time, leaving the phrase incomplete. Confirmed by direct inspection. | Full headline present ("Building Digital / Solutions / That Drive Results") after a tighter hero crop. Visible stats (10+, 3+, 100%) are Claidy's own claims. |
| Shasta Greene | "$250M+ Annual Team Volume," "500+ Families Helped," "#1 OC Market Specialist" all still visible, plus a small circular feedback/chat widget icon bottom-right. Confirmed by direct inspection. | Same stats row visible, same widget icon present in the bottom-right corner. Confirmed by direct inspection. |
| OneFilAm Community | Clean — flag hero, no overlay, no private data. | Clean — matches desktop content, no overlay. |
| Hand Homecare | Clean, commercially credible hero ("Caring for the Elderly is where Our Passion Lies"), public business phone number (818-914-4990) and "Licensed in California" badge visible — this is the site's own public contact info, not private/customer data. | Clean, same content as desktop, phone number visible in the same public capacity. |
| Herlinda Valdovinos | Clean hero (sunflower field + house), full nav bar in a single row, no overlay. | Confirmed: the desktop nav items (BUYER JOURNEY / SELLER ROADMAP / PURCHASE PROGRAMS / SEARCH HOMES / SAY HELLO) remain expanded and wrap across two lines above the hero, rather than collapsing into a mobile menu — this is a real responsive-design gap, not a capture artifact. |

No private customer/lead/donor data, admin screens, broken-page notices, or
placeholder content were found in any of the ten captures. Hand Homecare's
visible phone number is the business's own public contact number displayed
on its own homepage — not customer data — but per owner instruction it must
not be copied into SiteMint's own marketing copy.

### 10.3 Owner decisions (recorded verbatim, this checkpoint)

**Claidy Taguran Portfolio**
- Placement: future supporting project (unchanged from Phase 2B.2.2).
- Desktop: **reference only — recapture required** (missing "Solutions").
  Not optimized as an implementation asset.
- Mobile: **visually approved candidate** after the intentional hero crop.
  Optimized this checkpoint.
- Visible 10+/3+/100% values remain Claidy's own claims — must not be used
  as SiteMint outcome claims.
- URL unchanged: `https://ClaidyTaguranPorfolio.replit.app`, misspelling
  retained exactly as supplied.

> **Correction (Phase 2B.2.3.1):** the file actually produced in Phase
> 2B.2.3 (`claidy-taguran-mobile.webp`, MD5 `886660a3230c0a61a9d0c48928141eb4`)
> was a straight resize of the full 388×836 source, not a crop — it still
> visibly contained the "10+ Projects Completed / 3+ Years Experience /
> 100% Client Satisfaction" statistics row, contradicting the "after the
> intentional hero crop" language above. That was a mismatch between the
> stated decision and the actual asset, not an intentional inclusion. This
> checkpoint replaces that file with a real top-anchored crop
> (0, 0, 388, 528) of the same source that excludes the entire statistics
> region while preserving the full headline, supporting text, and both
> CTAs. See §10.4/§10.5 below for the corrected output details.

**Shasta Greene Real Estate**
- Project strategy: reserved future featured project (placement intent
  unchanged from Phase 2B.2.1).
- Both submitted captures: **rejected for public implementation** — the
  stats row ($250M+ / 500+ / #1) and the feedback/chat widget both remain
  visible, conflicting with current approved brand positioning. Neither
  file was optimized into the implementation directory, and neither was
  cropped further to force an approval.
- Both are retained only as rejected references in the temporary
  owner-review package.

**OneFilAm Community**
- Placement: supporting candidate (unchanged).
- Desktop and mobile: both **visually approved candidates**. Both
  optimized this checkpoint.
- Permission: organizational approval still pending — not marked
  permission-, implementation-, or publication-approved.

**Hand Homecare** *(new candidate this checkpoint)*
- Placement: **recommended temporary featured candidate** — a strong,
  commercially credible visual while Shasta Greene awaits recapture. This
  is a placement recommendation only, not an implementation approval.
- Desktop and mobile: both **visually approved candidates**. Both
  optimized this checkpoint.
- Status: **new portfolio candidate — SiteMint attribution and publication
  permission confirmation pending.** Not marked publicly approved merely
  because screenshots exist. Recorded in `PORTFOLIO_PERMISSION_MANIFEST.md`
  with that exact status.
- The visible public phone number (818-914-4990) must not be copied into
  SiteMint's own marketing copy.

**Herlinda Valdovinos**
- Current URL supplied by owner (**changed from the prior manifest**):
  `https://sunshine-herlinda-site.replit.app/` (previously recorded as
  `herlindavaldovinos.com` — not independently re-verified by this
  environment; recorded here as owner-supplied).
- Desktop: **visually approved candidate**. Optimized this checkpoint.
- Mobile: **not approved for portfolio implementation** — the navigation
  remains expanded and wraps across the mobile hero instead of using a
  collapsed mobile-menu treatment. Recorded as **mobile responsive
  improvement and recapture required**. Not optimized as an implementation
  asset.
- Client permission remains pending.

### 10.4 Optimization results (approved candidates only)

Produced under `artifacts/web-agency/public/portfolio/current/`. Native
capture dimensions were preserved in every case — **no source was
upscaled**. Shasta's two captures and Claidy's desktop capture were **not**
optimized or placed in this directory, per the rejections above.

| Source | Output file | Dimensions | Source size | Output size | Quality | Ratio | Output MD5 |
|---|---|---|---|---|---|---|---|
| `claidy-taguran-mobile-current.png` | `claidy-taguran-mobile.webp` | ~~388×836~~ **388×528 (cropped, Phase 2B.2.3.1 — see below)** | 464,383 B | ~~49,574 B~~ **34,842 B** | WebP q85 | 13.3x | ~~`886660a3230c0a61a9d0c48928141eb4`~~ **`c1b314d945ad4e09c8c6c2751aea9a78`** |
| `onefilam-community-desktop-current.png` | `onefilam-community-desktop.webp` | 1221×844 | 895,561 B | 61,584 B | WebP q85 | 14.5x | `e103f6b8172b20afcf2f9e78269c8898` |
| `onefilam-community-mobile-current.png` | `onefilam-community-mobile.webp` | 388×840 | 202,414 B | 33,648 B | WebP q85 | 6.0x | `ee647a093d959b12874cacbdd2a09933` |
| `hand-homecare-desktop-current.png` | `hand-homecare-desktop.webp` | 1221×850 | 1,606,686 B | 100,604 B | WebP q85 | 16.0x | `5c25f0e1e6e9dbce7305231152cf8a19` |
| `hand-homecare-mobile-current.png` | `hand-homecare-mobile.webp` | 388×838 | 388,897 B | 43,998 B | WebP q85 | 8.8x | `82f911811846140982e70a90d46f4446` |
| `herlinda-valdovinos-desktop-current.png` | `herlinda-valdovinos-desktop.webp` | 1218×804 | 1,695,624 B | 103,820 B | WebP q85 | 16.3x | `50a7eb4357c6be991e4c47a0d640091e` |

**Phase 2B.2.3.1 correction — Claidy mobile crop:** the Phase 2B.2.3 output
above was a straight resize of the full source (statistics visible),
mismatched against the stated "after crop" decision. It has been replaced
in-place (same filename, same directory — this is the exact asset the
correction targets) with a genuine top-anchored crop:

| Field | Value |
|---|---|
| Source | `claidy-taguran-mobile-current.png`, 388×836, 464,383 B, SHA-256 `83badfbf90c6ba5131dec4b3bcfc8317bc27b6ca46c48ddfa4da86e4e112a2c3` |
| Crop rectangle | `(0, 0, 388, 528)` — top-anchored, full width preserved, height reduced from 836 to 528 |
| Excluded content | The entire statistics row ("10+ Projects Completed," "3+ Years Experience," "100% Client Satisfaction") and the "SCROLL" indicator below it |
| Preserved content | Claidy logo/wordmark, mobile menu icon, "Available for Projects · Bohol, Philippines" label, full headline ("Building Digital / Solutions / That Drive Results"), supporting description, "View My Work" CTA, "Let's Talk" secondary action |
| Output | `artifacts/web-agency/public/portfolio/current/claidy-taguran-mobile.webp`, 388×528, 34,842 B, WebP q85, MD5 `c1b314d945ad4e09c8c6c2751aea9a78` |
| Upscaling | None — output width equals source width; only height was reduced by cropping |
| Generated/reconstructed content | None — pure crop of real captured pixels, no fill, no extension |
| Visual verification | Confirmed by direct inspection: complete headline including "Solutions," supporting text fully readable, both CTAs visible, no statistics or numerical claims visible, no distortion, no blank/generated area |

All six outputs verified: open correctly, non-zero dimensions, no visible
corruption, text fully legible, no upscaling, no generated/inpainted
content, no watermark. All desktop outputs are well under the 300 KB target
(61–104 KB); both mobile outputs are well under the 180 KB target (34–50
KB). No forced 16:9 crop was applied to any file — each was re-encoded at
its native captured aspect ratio (desktop ≈ 1221×844–850, a slightly taller
ratio than 16:9; mobile ≈ 388×836–840, a tall mobile composition), since a
forced 16:9 crop would have cut into real content on several of these
captures.

### 10.5 Crop and presentation manifest (per-project fields)

Distinct fields are recorded per project rather than assuming one crop or
aspect ratio fits every card — the source captures are not uniform
dimensions (each is a real, unscaled capture at whatever height the page
and viewport produced).

**Shasta Greene Real Estate**
| Field | Value |
|---|---|
| sourceWidth / sourceHeight | 1221 / 846 (desktop), 390 / 844 (mobile) |
| outputWidth / outputHeight | N/A — rejected, not optimized |
| aspectRatio | N/A |
| objectFit | N/A |
| objectPosition | N/A |
| recommendedCrop | None — a genuine recapture is required, not a crop |
| desktopAsset | none (rejected) |
| mobileAsset | none (rejected) |
| fallbackAsset | none recommended — do not fall back to the Phase 2B.2.1 asset either (also rejected) |
| captureSource | Owner-supplied |
| captureDate | Not supplied |
| currentSiteVerifiedByOwner | Owner-supplied capture; not independently browser-verified by this environment |
| visuallyApproved | No — rejected (stats row + widget) |
| permissionStatus | Not evaluated (asset rejected before permission review) |
| implementationStatus | Not implementation-ready |
| publicationStatus | Not publication-ready |

**OneFilAm Community**
| Field | Value |
|---|---|
| sourceWidth / sourceHeight | 1221 / 844 (desktop), 388 / 840 (mobile) |
| outputWidth / outputHeight | 1221 / 844 (desktop), 388 / 840 (mobile) — unscaled |
| aspectRatio | ≈1.45:1 (desktop), ≈0.46:1 (mobile) — native, not forced 16:9 |
| objectFit | `cover` |
| objectPosition | `top center` |
| recommendedCrop | None needed — hero flag graphic reads cleanly at native ratio |
| desktopAsset | `/portfolio/current/onefilam-community-desktop.webp` |
| mobileAsset | `/portfolio/current/onefilam-community-mobile.webp` |
| fallbackAsset | `/portfolio/onefilam-community-desktop.webp` (Phase 2B.2.1 historical reference) |
| captureSource | Owner-supplied |
| captureDate | Not supplied |
| currentSiteVerifiedByOwner | Owner-supplied capture; not independently browser-verified by this environment |
| visuallyApproved | Yes (desktop and mobile) |
| permissionStatus | Organizational approval pending |
| implementationStatus | Not implementation-approved |
| publicationStatus | Not publication-approved |

**Hand Homecare** *(new)*
| Field | Value |
|---|---|
| sourceWidth / sourceHeight | 1221 / 850 (desktop), 388 / 838 (mobile) |
| outputWidth / outputHeight | 1221 / 850 (desktop), 388 / 838 (mobile) — unscaled |
| aspectRatio | ≈1.44:1 (desktop), ≈0.46:1 (mobile) — native |
| objectFit | `cover` |
| objectPosition | `center` (portrait subject is right-of-center; centered crop keeps both subject and headline legible) |
| recommendedCrop | None needed |
| desktopAsset | `/portfolio/current/hand-homecare-desktop.webp` |
| mobileAsset | `/portfolio/current/hand-homecare-mobile.webp` |
| fallbackAsset | None — no prior historical asset exists for this new project |
| captureSource | Owner-supplied |
| captureDate | Not supplied |
| currentSiteVerifiedByOwner | Owner-supplied capture; not independently browser-verified by this environment |
| visuallyApproved | Yes (desktop and mobile) |
| permissionStatus | **New candidate — SiteMint attribution and publication permission confirmation pending** |
| implementationStatus | Not implementation-approved |
| publicationStatus | Not publication-approved |

**Herlinda Valdovinos**
| Field | Value |
|---|---|
| sourceWidth / sourceHeight | 1218 / 804 (desktop), 388 / 840 (mobile) |
| outputWidth / outputHeight | 1218 / 804 (desktop, unscaled); mobile not optimized |
| aspectRatio | ≈1.51:1 (desktop) — native |
| objectFit | `cover` |
| objectPosition | `center` |
| recommendedCrop | Desktop: none needed. Mobile: no crop can fix this — the issue is an un-collapsed navigation, a responsive-design defect, not a framing problem |
| desktopAsset | `/portfolio/current/herlinda-valdovinos-desktop.webp` |
| mobileAsset | none (rejected — see §10.3) |
| fallbackAsset | `/portfolio/herlinda-valdovinos-desktop.webp` (Phase 2B.2.1 historical reference, desktop only) |
| captureSource | Owner-supplied |
| captureDate | Not supplied |
| currentSiteVerifiedByOwner | Owner-supplied capture; not independently browser-verified by this environment |
| visuallyApproved | Desktop: yes. Mobile: no |
| permissionStatus | Pending client approval |
| implementationStatus | Not implementation-approved |
| publicationStatus | Not publication-approved |

**Claidy Taguran Portfolio** *(corrected in Phase 2B.2.3.1 — see the §10.4 correction note above)*
| Field | Value |
|---|---|
| sourceWidth / sourceHeight | 1222 / 842 (desktop, rejected), 388 / 836 (mobile) |
| outputWidth / outputHeight | Desktop: N/A (rejected). Mobile: **388 / 528** — cropped (0, 0, 388, 528), not upscaled |
| aspectRatio | Mobile ≈0.735:1 (post-crop) — not the source's native 0.46:1, intentionally, to exclude the statistics region |
| objectFit | `cover` (mobile) |
| objectPosition | `top center` (mobile) |
| recommendedCrop | Desktop: none — a recapture with the full animated headline is required, not a crop. Mobile: **(0, 0, 388, 528)**, applied this checkpoint — top-anchored, excludes the entire statistics row and the scroll indicator, preserves logo/menu/availability-label/full headline/description/both CTAs |
| desktopAsset | none (reference only — recapture required) |
| mobileAsset | `/portfolio/current/claidy-taguran-mobile.webp` (corrected file, MD5 `c1b314d945ad4e09c8c6c2751aea9a78`) |
| fallbackAsset | `/portfolio-claidy.png` (Phase 2B.2/2B.2.2 historical reference, desktop only) |
| captureSource | Owner-supplied |
| captureDate | Not supplied |
| currentSiteVerifiedByOwner | Owner-supplied capture; not independently browser-verified by this environment |
| visuallyApproved | Desktop: no (incomplete headline). Mobile: **yes — the corrected crop**, confirmed statistics-free |
| permissionStatus | Placement approved (future supporting); screenshot/publication permission **not** approved by the visual crop correction — a clean crop is not a permission grant |
| implementationStatus | Not implementation-approved |
| publicationStatus | Not publication-approved |
| metricPermission | N/A — no metric was ever visible or claimed in the corrected crop; the crop correction grants no metric permission of any kind |

### 10.6 Recommended Phase 2B.3 project lineup (recommendation only — not implemented)

| Slot | Project | Basis |
|---|---|---|
| Temporary featured | **Hand Homecare** | Strong, commercially credible desktop + mobile visuals, both visually approved; attribution/permission confirmation still required before real implementation |
| Reserved featured (pending recapture) | Shasta Greene Real Estate | Placement intent unchanged; both current captures rejected, genuine recapture needed |
| Supporting | OneFilAm Community | Desktop + mobile both visually approved; organizational approval pending |
| Supporting (desktop only, pending) | Herlinda Valdovinos | Desktop visually approved; mobile blocked on a real responsive-nav fix; client permission pending |
| Future supporting (partial) | Claidy Taguran Portfolio | Mobile visually approved; desktop needs recapture (missing "Solutions"); permission/publication not approved |

This is a recommendation for Phase 2B.3 to evaluate — no project has
permission-approved, implementation-approved, or publication-approved
status as of this checkpoint, and `SelectedWorkSection.tsx` was not
modified.

### 10.7 Data-driven portfolio model — refined (documented only, supersedes §9's shape)

Per the owner's Phase 2B.2.3 direction, the model gains explicit
`visualApprovalStatus`, `imageFit`/`imagePosition`, and
`currentSiteVerifiedByOwner` fields, distinguishing *owner*-attested
verification (which is what this checkpoint actually has, for all five
projects) from independent browser verification (which this environment
still cannot perform for any of them):

```ts
type PortfolioProject = {
  id: string;
  projectName: string;
  category: string;
  description: string;
  contribution: string;
  publicUrl: string;
  desktopAsset?: string;
  mobileAsset?: string;
  fallbackAsset?: string;
  captureDate?: string;
  currentSiteVerifiedByOwner: boolean;
  permissionStatus: string;
  visualApprovalStatus: string;
  implementationStatus: string;
  publicationStatus: string;
  featured: boolean;
  sortOrder: number;
  altText: string;
  imageFit?: "cover" | "contain";
  imagePosition?: string;
  statusLabel?: string;
};
```

This model supports everything §9 listed, plus: per-project image fit and
position (since these captures are not uniform aspect ratios — see §10.5),
desktop-only temporary projects (Herlinda pending a mobile recapture,
Claidy pending a desktop recapture), and a `visualApprovalStatus` distinct
from `permissionStatus` so a visually-clean image never implies permission
that hasn't been granted. Adopting this model remains a Phase 2B.3
implementation decision — no code was changed this checkpoint.

## 11. Phase 2B.2.3.1 — Claidy Mobile Crop Correction

**What was wrong:** the Claidy mobile asset produced in Phase 2B.2.3
(`claidy-taguran-mobile.webp`) was a straight resize of the full
388×836 source at unchanged aspect ratio. It still visibly contained the
"10+ Projects Completed / 3+ Years Experience / 100% Client Satisfaction"
statistics row — the exact content the Phase 2B.2.3 visual decision said
would be excluded "after the intentional hero crop." The crop had been
described but not actually performed.

**What was corrected:** the same file was replaced (same filename, same
directory — this is precisely the asset the correction targets) with a
genuine top-anchored crop of the original owner-supplied source,
`(0, 0, 388, 528)`, re-verified against the original SHA-256
(`83badfbf90c6ba5131dec4b3bcfc8317bc27b6ca46c48ddfa4da86e4e112a2c3`) before
cropping. The new output is 388×528, 34,842 B, WebP quality 85, MD5
`c1b314d945ad4e09c8c6c2751aea9a78`.

**What the crop preserves:** the Claidy logo/wordmark, the mobile menu
icon, the "Available for Projects · Bohol, Philippines" label, the
complete headline ("Building Digital / **Solutions** / That Drive
Results"), the supporting description, the "View My Work" CTA, and the
"Let's Talk" secondary action.

**What the crop excludes:** the entire statistics row (10+/3+/100% and
their labels) and the "SCROLL" indicator below it.

**What this correction does not do:** it does not upscale, stretch,
regenerate, or extend any part of the source image — only a rectangular
crop was applied, at native resolution. It does not change Claidy's
permission, implementation, or publication status, and it does not
constitute metric permission of any kind (see §10.5's updated Claidy block
and `PORTFOLIO_PERMISSION_MANIFEST.md`). No other project's asset, status,
or permission was touched by this correction.
