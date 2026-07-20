# Portfolio Evidence Audit — Phase 2B.1

> Documentation-only checkpoint. No visuals were added, no copy was changed,
> no application code was modified. HEAD at time of audit:
> `e5608fb1258697f00cba62f2664972c442b50739` on
> `claude/sitemint-phase-2b1-audit-wtoai0` (repository fork of the approved
> `claude/sitemint-phase-2a-prototype-duvcsn` chain, ending at the same
> commit).

## 1. Pre-audit report

| # | Item | Finding |
|---|---|---|
| 1 | HEAD | `e5608fb1258697f00cba62f2664972c442b50739` — matches the approved Phase 2A.4 commit exactly |
| 2 | Branch | `claude/sitemint-phase-2b1-audit-wtoai0`, working tree clean at start |
| 3 | Current Selected Work implementation | `artifacts/web-agency/src/components/platform-preview/SelectedWorkSection.tsx` — 3 projects, browser-chrome frame, **text only, no images** |
| 4 | Current portfolio data source | Hardcoded `projects` array duplicated in two files (see §6 duplication note) |
| 5 | Existing local project images | 4 real screenshots exist in `artifacts/web-agency/public/` (see §3) — **not used by `SelectedWorkSection.tsx`**, already used by `Portfolio.tsx` |
| 6 | Existing browser/device mockup assets | `devices-hero.png`, `devices-ref.png` (generic device mockups, not project-specific) |
| 7 | Existing project URLs | shastagreene.com, onefilamcommunity.org, herlindavaldovinos.com, ClaidyTaguranPorfolio.replit.app (see §2 for reachability) |
| 8 | Existing project descriptions | Present in both `Portfolio.tsx` and `SelectedWorkSection.tsx`, consistent wording |
| 9 | Existing outcome claims | `Portfolio.tsx` uses qualitative "outcome tags" only (e.g. "Professional online presence") — no fabricated numeric metrics |
| 10 | Existing project-category labels | Real Estate, Nonprofit Organization, Professional Services, Developer Portfolio |
| 11 | Current image optimization approach | None — all four screenshots are full-size 1920×1080 PNG, 1.3–2.4 MB each, served uncompressed from `public/` |
| 12 | Current lazy-loading behavior | None — `<img>` tags in `Portfolio.tsx` have no `loading="lazy"` attribute |
| 13 | Current preview chunk size | ~65.33 kB JS / ~10.29 kB CSS (lazy, isolated) — per `IMPLEMENTATION_ROADMAP.md`, last verified Phase 2A.4 |
| 14 | Current ordinary entry-bundle size | ~2,016 kB JS / ~199 kB CSS — per `IMPLEMENTATION_ROADMAP.md`, last verified Phase 2A.4. Not independently re-measured this session (`node_modules` not installed; see §Performance) |
| 15 | Current feature-flag state | `VITE_SITEMINT_PLATFORM_PREVIEW_ENABLED` — defaults **false**, fail-closed (`platformPreviewFlag.ts`); not set in any repo `.env` file, only documented in `.env.example` |
| 16 | Proposed documentation files | This file + `ACTIVATION_READINESS_AUDIT.md` |
| 17 | Network access available | Not tested directly this session; prior session (`IMPLEMENTATION_ROADMAP.md`, Phase 2A.4) recorded outbound requests to all three live domains returning 403 from the environment proxy. No live reachability check was attempted here to avoid re-triggering that unresolved condition; treat all "live URL" status below as **last-verified, not re-confirmed today**. |
| 18 | Screenshot capture completed reliably | Not attempted this checkpoint (out of scope — Phase 2B.1 is evidence-inventory only). See §5 for the plan to do it in 2B.2. |

**Key finding:** real, high-quality desktop screenshots exist for **all four**
portfolio projects in the repository
(`artifacts/web-agency/public/portfolio-*.png`) and are already live-used on
`/portfolio`. Three (Shasta Greene, OneFilAm, Herlinda Valdovinos) are
recommended for immediate homepage consideration; the fourth (Claidy Taguran
Portfolio) has an equally real, high-quality asset but remains **deferred**
pending confirmation of its correct live URL and its relationship to SiteMint
(see §2 detail and Correction log below) — the asset is not missing, the
project's readiness for use is what's unresolved. The homepage-scale
`SelectedWorkSection.tsx` component was
built during Phase 2A.4 believing screenshot capture was blocked, and shipped
a text-only browser-chrome frame instead. That belief was correct for *new*
capture at the time, but the assets already existed elsewhere in the repo and
were not cross-checked. This audit surfaces that gap; no code was changed to
fix it (out of scope for 2B.1).

## 2. Portfolio Evidence Matrix

| Field | Shasta Greene Real Estate | OneFilAm Community | Herlinda Valdovinos | Claidy Taguran Portfolio |
|---|---|---|---|---|
| Organization/client | Shasta Greene (real estate advisor) | OneFilAm (Filipino-American community org) | Herlinda Valdovinos (real estate advisor) | Claidy Taguran (individual developer) |
| Public URL | https://shastagreene.com | https://onefilamcommunity.org | https://herlindavaldovinos.com | https://ClaidyTaguranPorfolio.replit.app |
| URL reachability | Last verified live (screenshot exists, dated this repo snapshot); **not re-checked today** | Last verified live (screenshot exists); **not re-checked today** | Last verified live (screenshot exists); **not re-checked today** | **Confirmed problematic** — see note below |
| Category | Real Estate | Nonprofit Organization | Professional Services | Developer Portfolio |
| Industry | Residential/luxury real estate | Community nonprofit | Real estate advisory | Software development |
| Work performed by SiteMint | Full marketing site: hero, listings nav, buy/sell/invest flows, partner branding | Full nonprofit site: culture/events/community sections, bilingual flag branding | Full marketing site: buyer/seller journeys, purchase programs | Developer's own portfolio site (relationship to SiteMint as builder vs. self-built is **not documented anywhere in the repo** — flagged for owner confirmation) |
| Repository evidence | `Portfolio.tsx` entry + screenshot | `Portfolio.tsx` entry + screenshot | `Portfolio.tsx` entry + screenshot | `Portfolio.tsx` entry + screenshot + duplicate capture attempt |
| Local visual assets available | Yes — `portfolio-shasta.png` (1920×1080, 2.43 MB) | Yes — `portfolio-onefilam.png` (1920×1080, 1.32 MB) | Yes — `portfolio-herlinda.png` (1920×1080, 1.89 MB) | Yes — `portfolio-claidy.png` (1920×1080, 1.68 MB) |
| Desktop screenshot available | Yes, real, high quality | Yes, real, high quality | Yes, real, high quality | Yes, real, high quality |
| Mobile screenshot available | **No** | **No** | **No** | **No** |
| Before/after evidence available | No | No | No | No |
| Verified outcome | Not verified — no client-supplied metric in repo | Not verified — no client-supplied metric in repo | Not verified — no client-supplied metric in repo | N/A (self-portfolio) |
| Numerical result evidence | None in repo; current copy correctly avoids fabricated numbers | None in repo; current copy correctly avoids fabricated numbers | None in repo; current copy correctly avoids fabricated numbers | Screenshot itself displays the *subject's own* self-reported stats ("10+ Projects Completed," "3+ Years Experience," "100% Client Satisfaction") — these are Claidy's claims about Claidy's work, not SiteMint's claims, and must not be attributed to SiteMint if reused |
| Privacy concerns | Minor — screenshot includes a third-party "Share your feedback / Sign in" widget overlay (looks like a site-builder trial banner), should be cropped before public reuse | None observed | None observed | None — public developer portfolio content only |
| Permission concerns | **Unconfirmed** — no written record in repo of client permission to display screenshot publicly on the SiteMint homepage | **Unconfirmed** | **Unconfirmed** | **Unconfirmed** (though self-portfolio, still recommend confirming) |
| Outdated-content risk | Medium — screenshot is a point-in-time capture; the live site can change independently | Medium | Medium | Medium-high — see reachability note |
| Recommended homepage use | Featured (largest project, richest visual) | Supporting | Supporting | Supporting or defer, pending reachability confirmation |
| Owner confirmation required | Yes — permission + currency of screenshot | Yes — permission + currency of screenshot | Yes — permission + currency of screenshot | Yes — permission + which of the two Replit URLs is correct/current |
| Recommended CTA | "Visit live site" (existing) | "Visit live site" (existing) | "Visit live site" (existing) | "Visit live site" pending reachability fix, or omit CTA if not live |
| Readiness status | **Needs permission confirmation** (asset itself is ready) | **Needs permission confirmation** | **Needs permission confirmation** | **Needs screenshot + URL correction** |

### Claidy Taguran Portfolio — reachability detail

Two capture files exist in `attached_assets/screenshots/`:

- `claidytaguranporfolio_replit_app.png` (note: "Porfolio," missing the
  second "t" — matches the URL actually used in `Portfolio.tsx` line 47,
  `https://ClaidyTaguranPorfolio.replit.app`). This file is byte-identical
  (same MD5) to the live-used `portfolio-claidy.png` and shows a real,
  fully-rendered portfolio site.
- `claidytaguranportfolio_replit_app.png` (correctly spelled "Portfolio")
  is a **different, smaller file (41 KB vs. 1.68 MB)** and shows Replit's
  "This app isn't live yet" placeholder page.

Interpretation: the URL currently live and in use
(`ClaidyTaguranPorfolio.replit.app`, misspelled) **is** the reachable one;
the correctly-spelled variant appears to be a stale or mistaken capture
attempt against a URL that was never deployed. This is confusing enough
(a live site living at a *misspelled* domain) that it should be
owner-confirmed before any homepage use — reusing a misspelled URL
without confirmation risks looking like a typo bug rather than a
deliberate handle.

## 3. Visual-Asset Audit

All paths relative to repo root. No deletions performed.

| Path | Dimensions | Format | Size | Project | Quality | Light/dark fit | Text readable | Private info visible | Optimization needed | Approved for public use |
|---|---|---|---|---|---|---|---|---|---|---|
| `artifacts/web-agency/public/portfolio-shasta.png` | 1920×1080 | PNG | 2.43 MB | Shasta Greene | High | Works on light card, needs dark-theme container treatment | Yes | No (minor: 3rd-party feedback widget overlay, croppable) | **Yes** — convert to WebP/AVIF + responsive sizes | Pending owner permission |
| `artifacts/web-agency/public/portfolio-onefilam.png` | 1920×1080 | PNG | 1.32 MB | OneFilAm | High | Works on light card | Yes | No | **Yes** | Pending owner permission |
| `artifacts/web-agency/public/portfolio-herlinda.png` | 1920×1080 | PNG | 1.89 MB | Herlinda Valdovinos | High | Works on light card | Yes | No | **Yes** | Pending owner permission |
| `artifacts/web-agency/public/portfolio-claidy.png` | 1920×1080 | PNG | 1.68 MB | Claidy Taguran | High | Already dark-themed, fits dark preview shell well | Yes | No (self-reported stats on subject's own site, not SiteMint's claim — must not be re-attributed) | **Yes** | Pending owner permission + URL confirmation |
| `attached_assets/screenshots/shastagreene_com.png` | 1920×1080 | PNG | 2.43 MB | Shasta Greene | Duplicate of `portfolio-shasta.png` (same content, different location) | — | — | — | — | Duplicate — candidate for removal once canonical location is confirmed |
| `attached_assets/screenshots/onefilamcommunity_org.png` | 1920×1080 | PNG | 1.32 MB | OneFilAm | Duplicate of `portfolio-onefilam.png` | — | — | — | — | Duplicate |
| `attached_assets/screenshots/herlindavaldovinos_com.png` | 1920×1080 | PNG | 1.89 MB | Herlinda Valdovinos | Duplicate of `portfolio-herlinda.png` | — | — | — | — | Duplicate |
| `attached_assets/screenshots/claidytaguranporfolio_replit_app.png` | 1920×1080 | PNG | 1.68 MB | Claidy Taguran | MD5-identical to `portfolio-claidy.png` | — | — | — | — | Duplicate |
| `attached_assets/screenshots/claidytaguranportfolio_replit_app.png` | 1920×1080 | PNG | 41 KB | Claidy Taguran (correctly-spelled URL) | Shows "app isn't live" placeholder, not real content | — | Yes (placeholder text) | No | N/A | **Do not publish** — not real project content; obsolete/stale capture, candidate for removal after owner confirms which URL is correct |
| `artifacts/web-agency/public/devices-hero.png` | — | PNG | 2.40 MB | Generic (hero background) | High | Used site-wide, unrelated to portfolio | N/A | No | Already in production use | Already approved (in use) |
| `artifacts/web-agency/public/devices-ref.png` | — | PNG | 1.24 MB | Generic (reference asset, unclear current usage) | — | — | N/A | No | Verify still referenced before Phase 2B.2 | Unclear — audit only |
| `artifacts/web-agency/public/team-claidy.png`, `team-shasta.jpg`, `team-saisa.jpg` | — | PNG/JPG | 1.81 MB / 225 KB / 86.6 KB | Team/About page, not portfolio | High | In use on About page | N/A | Team member photos — appropriate for existing use | N/A | Already approved (in use), out of scope for Selected Work |

No client-supplied source images, logos, or private/internal screenshots
were found. No CRM, dashboard, or authenticated-view screenshots exist in
the repository's public asset directories — nothing found that would risk
exposing private customer data.

**Duplication summary:** every portfolio project's screenshot exists in two
places (`artifacts/web-agency/public/portfolio-*.png` and
`attached_assets/screenshots/*.png`) with identical content, plus one
stale/incorrect capture (`claidytaguranportfolio_replit_app.png`, correctly
spelled, showing a placeholder). `attached_assets/` appears to be a staging
or upload-drop location, not a served asset path — the canonical, servable
copies are the ones in `artifacts/web-agency/public/`. No deletions were
made in this checkpoint per the "do not delete anything" instruction, but a
cleanup of `attached_assets/screenshots/` is a low-risk candidate for a
future checkpoint once explicitly approved.

## 4. Portfolio Story Structure (recommendation)

For each Selected Work item once approved:

1. Project name
2. Industry or project type
3. Business need (one sentence, inferred from category — needs owner
   confirmation per project, since none is documented today)
4. SiteMint contribution (one sentence — already present in existing copy)
5. System delivered (already present in existing "description" field)
6. Verified outcome or, where unverified, a description of the system
   delivered instead of a claimed result (existing "outcomes" qualitative
   tags already follow this rule correctly — keep the pattern)
7. Desktop/mobile visual pair (mobile does not yet exist — see §5)
8. Real project link (`Visit live site`)
9. Optional short case-study route — defer to a future checkpoint, not 2B

Recommended classification for the Phase 2B.2/2B.3 composition:

- **Featured:** Shasta Greene Real Estate — richest visual (aerial hero,
  luxury real estate branding), largest apparent scope (buy/sell/invest,
  partner branding), best fits a premium "featured project" treatment.
- **Supporting:** OneFilAm Community, Herlinda Valdovinos — both solid,
  real, presentable; no reason to feature one over the other.
- **Deferred:** Claidy Taguran Portfolio — until the URL-spelling
  discrepancy and the "is this a SiteMint-built site or a self-built
  developer portfolio" question are owner-confirmed. The self-reported
  stats visible in its own screenshot ("10+ Projects Completed" etc.) also
  need a clear caption/disclaimer if ever shown, since a viewer could
  misread them as SiteMint's claims.
- **Removed:** none — all four represent real, distinct work; no fabricated
  or placeholder entries exist to remove.

## 5. Screenshot-Capture Plan (for Phase 2B.2)

Desktop screenshots already exist for all four projects and are reusable
pending documented approval (see approval-status table below).
**Mobile screenshots do not exist for any project** and are the primary gap.

For each of the three recommended candidate projects, pending documented
owner, organizational, or client approval (Shasta Greene, OneFilAm,
Herlinda Valdovinos — Claidy Taguran deferred, see §4):

### Recommended approval status by project

- **Shasta Greene Real Estate** — owner-controlled project; recommended for
  featured use; final owner approval must still be explicitly documented
  before publication.
- **OneFilAm Community** — recommended supporting project; organizational
  permission should be recorded before public use.
- **Herlinda Valdovinos** — recommended supporting project; explicit client
  permission is required before publication.
- **Claidy Taguran Portfolio** — deferred; internal permission, the
  SiteMint/Claidy relationship, and the correct live URL all require
  confirmation.

None of the above should be read as permission already granted — every
project's status is "recommended candidate, pending documented approval,"
not "cleared."

| Parameter | Recommendation |
|---|---|
| Viewport | 390×844 (iPhone 12/13/14 class) for mobile; existing 1920×1080 desktop captures are reusable if still current |
| Route | Project's public homepage (`/`) — no deep internal routes needed for a homepage-scale card |
| Theme | Each project's own live theme (not SiteMint's dark/light toggle — these are external sites, captured as-is) |
| Scroll position | Top of page (matches existing desktop captures) |
| Cookie/banner handling | Dismiss cookie/consent banners before capture if present; the existing Shasta Greene desktop capture shows a "Share your feedback" widget that should be dismissed or cropped in any recapture |
| Animation stabilization | Wait for hero animations/parallax to settle (~1–2s) before capture |
| Data redaction | None expected — these are public marketing sites with no visible customer PII; re-verify per project at capture time |
| Cropping rules | Full viewport, no browser chrome (the in-app card already adds its own browser-chrome frame) |
| Output dimensions | Desktop: keep 1920×1080 source, downscale via `srcset`; Mobile: 390×844 or 750×1624 @2x |
| Output format | WebP primary with PNG/JPEG fallback (see Performance section — current PNGs are unoptimized) |
| Compression target | Under ~200 KB per desktop image, ~80 KB per mobile image after optimization |
| File naming | Keep existing `portfolio-{project}.png` desktop convention; add `portfolio-{project}-mobile.webp` |
| Alt-text direction | `"{Project name} — {category} website, desktop view"` / `"...— mobile view"`, matching existing `alt` pattern in `Portfolio.tsx` line 73 |
| Owner review required | Yes, before any capture is committed or displayed — both for permission and for confirming the live site hasn't materially changed since the existing desktop captures were taken |

No login-only, CRM, or private dashboard views are in scope — all four
projects are public marketing/portfolio sites; nothing in this audit found
a need to capture authenticated screens.

## 6. Code-level observations (informational — no changes made)

- `SelectedWorkSection.tsx` and `Portfolio.tsx` maintain two independently
  hardcoded copies of the same project data (name, url, domain, category,
  description). `Portfolio.tsx`'s copy additionally has `image` and
  `outcomes` fields; `SelectedWorkSection.tsx`'s copy does not. If Phase
  2B.3 adds images to `SelectedWorkSection.tsx`, consider whether a single
  shared data source is warranted then — not a 2B.1 concern.
- `SelectedWorkSection.tsx`'s current code comment (lines 4–21) documents
  a real, dated investigation (outbound 403 to all three domains) that is
  now superseded by the discovery in this audit that reusable screenshots
  already exist elsewhere in the repo. That comment will need updating
  once Phase 2B.3 actually changes the component — not done here, since
  this checkpoint does not modify application code.

## 7. Summary: what remains before Selected Work can show real visuals

1. Owner confirms permission to publicly display each of the three
   recommended candidate projects' screenshots on the SiteMint homepage
   (Shasta Greene, OneFilAm, Herlinda Valdovinos); Claidy Taguran remains
   deferred pending item 2 below regardless of permission.
2. Owner confirms the Claidy Taguran Portfolio project's correct URL and
   its relationship to SiteMint (built-by vs. self-built).
3. Mobile screenshots captured for each approved project (none exist today).
4. Existing desktop PNGs re-optimized (WebP/AVIF, compressed, responsive
   `srcset`) before being added to a homepage-critical section — current
   files are 1.3–2.4 MB each, unsuitable for direct use as-is (see
   `ACTIVATION_READINESS_AUDIT.md` §Performance).
5. Decide canonical asset location and remove duplicate
   `attached_assets/screenshots/` copies (separate, low-risk future
   checkpoint, not performed here).
