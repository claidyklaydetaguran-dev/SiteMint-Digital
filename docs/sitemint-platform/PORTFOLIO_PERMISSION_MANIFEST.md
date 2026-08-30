# Portfolio Permission Manifest — Phase 2B.2 (corrected in 2B.2.1, updated in 2B.2.2 and 2B.2.3, Claidy crop reconciled in 2B.2.3.1, publication approvals recorded in 2B.2.4)

> Originally prepared 2026-07-20 in Phase 2B.2 (`claude/phase-2b2-portfolio-assets-8vh4q1`
> @ `0ca3f4311d4a688aa0167797db54cd6cace4b450`). **Corrected 2026-07-20 in
> Phase 2B.2.1** following owner visual review of the Phase 2B.2 owner-review
> package. **Updated in Phase 2B.2.2** to record Claidy's future-supporting
> placement decision. **Updated in Phase 2B.2.3** with owner-supplied current
> screenshots for all four existing projects plus a new candidate, **Hand
> Homecare** — see the per-project "Phase 2B.2.3" notes below and
> `PORTFOLIO_ASSET_MANIFEST.md` §10 for the full validation/optimization
> record. **Updated in Phase 2B.2.3.1** to reconcile Claidy's mobile asset
> after its crop was corrected — a clean image is not a permission grant;
> see the Claidy section's "Phase 2B.2.3.1 correction" note below. **Updated
> in Phase 2B.2.4** to record the owner's July 20, 2026 project-placement,
> SiteMint-attribution, and public-portfolio-publication approvals for
> OneFilAm, Hand Homecare, Herlinda (desktop only), and Claidy (mobile
> only) — see each project's "Phase 2B.2.4 approval" note below and §12 for
> the approved Phase 2B.3 lineup. Shasta Greene's project and publication
> intent were approved, but **no current visual asset was approved** —
> see its Phase 2B.2.4 note.
>
> This manifest records **approval status only**. It does not grant approval.
> Nothing here should be read as "cleared for public use" unless the status
> column explicitly says so.

## Status definitions (kept distinct on purpose)

| Status | Meaning |
|---|---|
| Project-placement approved | Owner has decided this project's intended role (featured/supporting/deferred), independent of any specific screenshot |
| SiteMint attribution confirmed | Owner has confirmed SiteMint actually built/owns credit for this project (distinct from placement — a project can be placed without SiteMint having built it, e.g. Claidy's own portfolio) |
| Asset prepared | An optimized image file exists in the repo |
| Asset visually approved | Owner/client has confirmed the specific screenshot's framing/content is accurate and acceptable |
| Current-site verified | The screenshot has been checked against the site as it exists today (not just checked for quality in isolation) — distinct from owner-supplied; still not independently browser-verified by this environment for any project |
| Permission approved | Owner/organization/client has given explicit permission to display it publicly (this checkpoint records the **owner's own** permission grant for private preview and public portfolio publication; organizational/client permission from OneFilAm/Herlinda/Hand Homecare themselves remains separately tracked where applicable) |
| Metric permission | Whether any specific number (dollar volume, client count, satisfaction percentage, etc.) may be presented as a SiteMint-attributable claim — kept separate because a project or image can be fully approved for placement while still carrying zero metric permission |
| Implementation approved | Someone has approved wiring it into `SelectedWorkSection.tsx` |
| Public publication approved | The change is live in production |

These eight statuses are independent. A project can have project-placement
and public-publication-intent approved while its current visual asset has
none of the other statuses — that is exactly the state Shasta Greene is in
below: the project and the *intent* to publish it publicly are approved,
but no specific screenshot has cleared visual approval, so there is nothing
yet eligible for implementation.

## Per-project manifest

### Shasta Greene Real Estate

| Field | Value |
|---|---|
| Relationship | Shasta Greene's owner-controlled real estate business; SiteMint project attribution subject to the approved portfolio description. |
| Screenshot owner | Site owner (self) |
| Website owner | Site owner (self) |
| Project-placement status | **Approved as the intended featured project** (owner decision, Phase 2B.2.1) |
| Current optimized screenshot (`shasta-greene-desktop.webp`) status | **Prepared reference — recapture required. Not implementation-approved. Not public-use-ready.** |
| Who must approve | Owner (self-approval permitted for permission; recapture required regardless before any use) |
| Approval method | Not yet recorded |
| Approval date | — |
| Permitted uses | Not yet defined pending recapture and approval |
| Prohibited uses | The current screenshot must **not** be used in Phase 2B.3 or any public implementation |
| Expiration / re-review date | Superseded once a current recapture exists |
| Public-link permission | Pending |
| Screenshot permission | **Rejected for public use** — see reasons below |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — the visible metrics ($250M+ Annual Team Volume, 500+ Families Helped, #1 OC Market Specialist) are the *site's own* claims, not SiteMint's, but are flagged as potentially outdated/unsupported and must not carry into any recapture without owner confirmation |
| Status | **Featured project approved in principle; current asset rejected — must be recaptured** |

**Owner review findings (Phase 2B.2.1), superseding the Phase 2B.2 visual
review:**
- The optimized screenshot still visibly shows "$250M+ Annual Team Volume,"
  "500+ Families Helped," and "#1 OC Market Specialist" — older or
  potentially unsupported claims that conflict with current, more grounded
  positioning.
- The screenshot was never reverified against the current live homepage
  (this environment's network access remains blocked; the owner
  independently confirmed the current Shasta Greene pages are indexed and
  serving current 2026 content from an unrestricted browser).
- Cropping only the feedback widget (done in Phase 2B.2) is **insufficient**
  — the entire statistics row must either be absent from a fresh capture or
  cropped above entirely, not merely the widget corner.
- **Do not** crop the existing Phase 2B.2 file further merely to force an
  approval — a fresh, current capture is required instead of further editing
  the old one.
- A fresh current desktop **and** mobile capture are both required before
  this project can move past "prepared reference."

**Phase 2B.2.3 update:** the owner supplied a fresh current desktop and
mobile capture (`shasta-greene-desktop-current.png`,
`shasta-greene-mobile-current.png`). **Both are rejected** — the same
stats row ($250M+ / 500+ / #1) remains visible in both, and both also show
a small feedback/chat widget icon in the bottom-right corner. Neither file
was optimized or added to the implementation directory, and neither was
cropped to force an approval. Status remains **prepared reference —
recapture required**; the featured-project placement intent is unchanged.

**Phase 2B.2.4 approval (owner-provided decision, July 20, 2026):**
- Private preview: **approved.**
- Public portfolio publication: **approved** (of the project and the
  intent to feature it — not of any current screenshot).
- Project placement: **approved as a future featured project.**
- **No current visual asset is approved.** Both the desktop and mobile
  screenshots remain rejected for the reasons already recorded above
  (stats row + feedback widget still visible).
- **Not eligible for Phase 2B.3 visual implementation.** A clean desktop
  and mobile recapture both remain required before any Shasta asset can
  be used.
- The rejected screenshots must **not** be cropped to force
  implementation — the same instruction given in Phase 2B.2.1/2B.2.3
  still applies.
- Metric permission: **still not granted.** No old numerical claim
  ($250M+, 500+, #1) may be repeated as a SiteMint marketing claim, in
  any recapture, without separate evidence and separate approval.

### OneFilAm Community

| Field | Value |
|---|---|
| Relationship | Recommended supporting project |
| Screenshot owner | OneFilAm organization |
| Website owner | OneFilAm organization |
| Project-placement status | **Approved in principle as a supporting project** (owner decision, Phase 2B.2.1) |
| Current optimized screenshot (`onefilam-community-desktop.webp`) status | **Historical/prepared reference only. Not current-site-verified. Not implementation-approved.** |
| Who must approve | Appropriate OneFilAm leadership (organizational permission) |
| Approval method | Simple internal written approval (per owner direction) — not yet obtained |
| Approval date | — |
| Permitted uses | Not yet defined pending recapture and approval |
| Prohibited uses | Do not present the current image as a current-site capture |
| Expiration / re-review date | Superseded once a current recapture exists |
| Public-link permission | Pending |
| Screenshot permission | Pending — image may be retained as a historical reference only |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — no metrics claimed |
| Status | **Supporting project approved in principle; current capture and organizational approval required** |

**Owner review findings (Phase 2B.2.1):** the existing screenshot is visually
clean, but its capture date is unknown, and the owner independently confirmed
the live OneFilAm site is publicly indexed and now shows active 2026
community/event content — meaning the site has continued to evolve since
whenever this repository capture was taken. The prepared image may remain in
the repo as a historical source reference, but must not be treated as the
final homepage asset. A current desktop recapture and a current mobile
capture are both required.

**Phase 2B.2.3 update:** the owner supplied a fresh current desktop and
mobile capture (`onefilam-community-desktop-current.png`,
`onefilam-community-mobile-current.png`). Both are **visually approved
candidates** and have been optimized into
`artifacts/web-agency/public/portfolio/current/`. This satisfies the
"current recapture" requirement above — **organizational approval is now
the only remaining blocker** before this project can move past
visually-approved to permission-approved.

**Phase 2B.2.4 approval (owner-provided decision, July 20, 2026):**
- Private preview: **approved.**
- Public portfolio publication: **approved.**
- SiteMint portfolio placement: **approved as a supporting project.**
- Approved visual assets: `onefilam-community-desktop.webp` and
  `onefilam-community-mobile.webp` — **both desktop and mobile visually
  approved.**
- **Implementation eligible for Phase 2B.3.**
- Public publication: **approved.**
- Metric permission: **no numerical performance claim is approved** unless
  separately evidenced — nothing currently exists to evidence one, and
  none should be added without that evidence and a separate approval.
- This owner-provided decision satisfies the organizational-approval
  requirement recorded earlier in this section.

### Herlinda Valdovinos

| Field | Value |
|---|---|
| Relationship | Recommended supporting project |
| Screenshot owner | Herlinda Valdovinos (client) |
| Website owner | Herlinda Valdovinos (client) |
| Project-placement status | **Approved as a supporting candidate, contingent on client permission** (owner decision, Phase 2B.2.1) |
| Current optimized screenshot (`herlinda-valdovinos-desktop.webp`) status | **Visually approved candidate.** Not current-site-verified. Not permission-approved. Not implementation-approved. |
| Who must approve | Herlinda Valdovinos directly (client permission) |
| Approval method | Explicit client permission required — not yet obtained |
| Approval date | — |
| Permitted uses | Not yet defined pending client permission |
| Prohibited uses | No public implementation until client permission is recorded |
| Expiration / re-review date | Recommend re-review once client permission is granted and the live URL is reverified |
| Public-link permission | Pending — live URL requires final verification |
| Screenshot permission | **Pending client approval** |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — no metrics claimed |
| Status | **Visually approved candidate (desktop) — client permission and URL verification required** |

**Owner review findings (Phase 2B.2.1):** this is the cleanest current
asset — strong visual identity, clear hero treatment, no overlay, no visible
private information, good optimization quality. It is visually approved as a
candidate, but must not be published until (a) Herlinda gives explicit
permission and (b) the public domain is reverified as current. This
screenshot has **not** been compared against the current live site — that
comparison has not happened, and this manifest must not imply that it has. A
current mobile capture also remains required.

**Phase 2B.2.3 update — URL changed by owner:** the current URL supplied by
the owner is now `https://sunshine-herlinda-site.replit.app/`, superseding
the previously recorded `herlindavaldovinos.com`. This has not been
independently browser-verified by this environment; it is recorded as
owner-supplied.

**Phase 2B.2.3 update — fresh captures:** the owner supplied a fresh current
desktop and mobile capture. **Desktop is a visually approved candidate**
and has been optimized into
`artifacts/web-agency/public/portfolio/current/herlinda-valdovinos-desktop.webp`.
**Mobile is rejected** — the navigation remains expanded and wraps across
the mobile hero instead of collapsing into a mobile menu, which is a real
responsive-design gap on the live site, not a capture artifact. Recorded
status: **mobile responsive improvement and recapture required**. The
mobile file was not optimized or added to the implementation directory.
Client permission remains pending regardless of the desktop asset's visual
approval.

**Phase 2B.2.4 approval (owner-provided decision, July 20, 2026):**
- Private preview: **approved.**
- Public portfolio publication: **approved.**
- Portfolio placement: **approved as a supporting project.**
- Approved visual asset: `herlinda-valdovinos-desktop.webp` — **desktop
  visually approved.**
- Mobile asset: **not approved for implementation** — the navigation is
  not intentionally collapsed on the submitted mobile capture; this is
  the same responsive-design defect already recorded above, not a new
  finding.
- **Desktop-only implementation eligible for Phase 2B.3.** Mobile
  implementation remains deferred.
- Current approved URL: `https://sunshine-herlinda-site.replit.app/`.
- Metric permission: **no numerical result or performance claim is
  approved** unless separately evidenced.
- This owner-provided decision on July 20, 2026 resolves the "client
  permission and URL verification required" status recorded earlier in
  this section — public portfolio publication of the approved desktop
  asset is now approved.

### Claidy Taguran Portfolio

| Field | Value |
|---|---|
| Relationship | Team member's personal portfolio; relationship to SiteMint (built-by vs. self-built) still undocumented |
| Screenshot owner | Claidy Taguran |
| Website owner | Claidy Taguran |
| Project-placement status | **Approved as a future supporting project** (owner decision, this checkpoint — supersedes the "deferred" placement from Phase 2B.2/2B.2.1) |
| Current URL | `https://ClaidyTaguranPorfolio.replit.app` — kept as-is, misspelling included, because it is the actual deployment address; a custom domain is not required for a public Replit deployment to be linkable |
| Current approval state | **Historical reference — current browser verification pending** |
| Who must approve | Claidy (confirm live status and whether SiteMint may present it as company work); owner has already approved the *placement* decision below |
| Approval method | Owner decision recorded this checkpoint for placement; permission/publication approval not yet recorded |
| Approval date | — (placement decision only, this checkpoint) |
| Permitted uses | The existing real portfolio screenshot (`portfolio-claidy.png`) may be used **temporarily** as a supporting visual, pending owner review, with its status clearly marked internally |
| Prohibited uses | Do not describe the project or its screenshot as newly launched, recently verified, or currently updated; do not use `attached_assets/screenshots/claidytaguranportfolio_replit_app.png` (the stale "app isn't live yet" placeholder) for anything |
| Expiration / re-review date | Replace the screenshot and/or URL whenever Claidy publishes a custom domain or supplies a newer capture |
| Public-link permission | Not yet approved — link may remain disabled/omitted in the UI until the deployment's live status is confirmed |
| Screenshot permission | Not approved for public use; may be prepared as a temporary internal asset only |
| Logo permission | Not evaluated |
| Case-study permission | Not evaluated |
| Metric permission | N/A — the screenshot's visible stats (10+ Projects, 3+ Years, 100% Satisfaction) are Claidy's own claims about Claidy's work and must never be attributed to SiteMint |
| Status | **Future supporting project — placement approved; permission, implementation, and public-publication all remain unapproved** |

**Verification attempted this checkpoint:** a real Chromium/Playwright
browser was pointed directly at `https://ClaidyTaguranPorfolio.replit.app`
(not curl/DNS/search-index metadata) and failed identically on three
attempts with `net::ERR_TUNNEL_CONNECTION_FAILED`, matching the same 403
proxy-policy denial already recorded for the other three project domains.
This is an environment-side block, not evidence that the site is private,
broken, or unpublished — see `CLAIDY_CAPTURE_VALIDATION.txt` (delivered
directly to the owner, not committed to the repo) for the full attempt log.
The owner independently attempted the same URL from their own web
environment and also could not confirm reachability from there, so **the
site's actual live/public status remains unconfirmed by anyone this
session** — it is not confirmed broken, and it is not confirmed live.

Open questions carried forward, still unresolved:
1. Whether the Replit deployment is actually reachable by the public (only
   a direct browser test from an unrestricted network can confirm this).
2. Whether SiteMint may present this as company work vs. Claidy's personal
   project.
3. Whether the existing screenshot represents the current live product.
4. Whether the misspelled URL will remain in use long-term (owner has
   confirmed it should remain in use *for now*, since changing the text
   would break the actual address).

No Claidy asset was optimized, implemented, or marked permission-approved
in Phase 2B.2.2. Only the project-placement status changed there, per
explicit owner decision.

**Phase 2B.2.3 update:** the owner supplied a fresh current desktop and
mobile capture. **Desktop is rejected — reference only, recapture
required**: the headline reads "Building Digital" / "That Drive Results"
with the animated middle word "Solutions" absent at capture time, leaving
the phrase incomplete (confirmed by direct visual inspection). **Mobile is
a visually approved candidate** after an intentional hero crop, and has
been optimized into
`artifacts/web-agency/public/portfolio/current/claidy-taguran-mobile.webp`.
The visible 10+/3+/100% stats remain Claidy's own claims and must not be
used as SiteMint outcome claims. The URL is unchanged
(`https://ClaidyTaguranPorfolio.replit.app`, misspelling retained exactly
as supplied) and remains unverified by any independent browser this
session.

**Phase 2B.2.3.1 correction:** the mobile file actually produced in Phase
2B.2.3 was found to still contain the full statistics row — it had been
resized, not cropped, contradicting the "after an intentional hero crop"
language above. This checkpoint replaces that file with a real crop
`(0, 0, 388, 528)` of the same owner-supplied source that excludes the
entire statistics region while keeping the logo, menu icon, availability
label, full headline, description, and both CTAs intact. **This crop
correction changes nothing about permission status.** To be explicit,
since a clean image can be mistaken for a permission signal:
- **Screenshot permission:** still not granted — remains "not approved for
  public use; may be prepared as a temporary internal asset only."
- **Implementation approval:** still not granted.
- **Public publication approval:** still not granted.
- **Metric permission:** still N/A / not granted — the corrected crop
  contains no visible metric at all now, and even if it did, Claidy's own
  self-reported numbers could never become a SiteMint metric claim.
- No other project's permission, implementation, or publication status was
  elevated by this correction.

**Phase 2B.2.4 approval (owner-provided decision, July 20, 2026):**
- Private preview: **approved.**
- Public portfolio publication: **approved.**
- Portfolio placement: **approved as a supporting project.**
- Approved visual asset: `claidy-taguran-mobile.webp` — **cropped mobile
  visually approved.**
- Desktop asset: **not approved** — the submitted desktop capture omitted
  the animated word "Solutions," as already recorded above.
- **Mobile-only implementation eligible for Phase 2B.3.** Desktop
  implementation remains deferred.
- Current URL: `https://ClaidyTaguranPorfolio.replit.app` — the spelling
  "Porfolio" is kept exactly as supplied because it is part of the current
  URL; replace later only when a custom domain or corrected deployment URL
  is separately approved.
- The 10+, 3+, and 100% values were **intentionally excluded** from the
  approved crop (Phase 2B.2.3.1).
- Metric permission: **no numerical metric permission is granted through
  this approval** — even though the crop is clean, this approval covers
  placement and publication of the image only, not any metric claim.

### Hand Homecare *(new candidate, Phase 2B.2.3)*

| Field | Value |
|---|---|
| Relationship | New portfolio candidate — attribution and permission confirmation pending |
| Screenshot owner | Hand Homecare (business) |
| Website owner | Hand Homecare (business) |
| Project-placement status | **Recommended temporary featured candidate** — a placement recommendation only, not an implementation approval, offered while Shasta Greene awaits recapture |
| Current optimized screenshots (`hand-homecare-desktop.webp`, `hand-homecare-mobile.webp`) status | **Visually approved candidates** (both desktop and mobile) |
| Who must approve | Owner must confirm SiteMint's relationship/attribution to this project, and Hand Homecare must grant publication permission |
| Approval method | Not yet recorded |
| Approval date | — |
| Permitted uses | Not yet defined pending attribution and permission confirmation |
| Prohibited uses | Do not mark this project publicly approved merely because visually-approved screenshots exist; do not copy the visible business phone number (818-914-4990) into SiteMint's own marketing copy |
| Expiration / re-review date | Re-review once attribution and permission are confirmed |
| Public-link permission | Not yet approved |
| Screenshot permission | **New portfolio candidate — attribution and publication permission confirmation pending** |
| Logo permission | Not evaluated |
| Case-study permission | Not evaluated |
| Metric permission | N/A — no metrics claimed; the visible phone number and "Licensed in California" badge are the business's own public information |
| Status | **New candidate — visually approved; attribution and publication permission confirmation pending** |

**Verification performed this checkpoint:** direct visual inspection of both
owner-supplied captures found a clean, commercially credible hero (elderly
care imagery, clear value proposition), a public business phone number, and
a "Licensed in California" badge — all public information on the business's
own site, no private customer/patient data. No feedback overlay, no admin
tools, no broken content. This project was **not** independently
browser-verified by this environment — its inclusion is entirely
owner-supplied, and it must not be described as SiteMint-verified.

**Phase 2B.2.4 approval (owner-provided decision, July 20, 2026):**
- **SiteMint attribution: confirmed by the owner — SiteMint built this
  project.** This resolves the "attribution and permission confirmation
  pending" status recorded above, for the attribution half of that
  question.
- Private preview: **approved.**
- Public portfolio publication: **approved.**
- Portfolio placement: **approved as the initial featured project**
  (supersedes the earlier "recommended temporary featured candidate"
  language — this is now the owner's actual placement decision, not a
  recommendation).
- Approved visual assets: `hand-homecare-desktop.webp` and
  `hand-homecare-mobile.webp` — **both desktop and mobile visually
  approved.**
- **Implementation eligible for Phase 2B.3.**
- Public publication: **approved.**
- Do not copy the visible phone number (818-914-4990) into SiteMint's own
  marketing copy — same instruction as before, still binding.
- Metric permission: **no performance or conversion metric is approved**
  unless separately evidenced.

## Summary (as of Phase 2B.2.4)

| Project | Project-placement | Public publication | Desktop asset status | Mobile asset status | Metric permission |
|---|---|---|---|---|---|
| Shasta Greene Real Estate | Featured — approved | Approved (project/intent only) | **Rejected** — stats row + widget still visible; recapture required | **Rejected** — same reasons; recapture required | Not granted |
| OneFilAm Community | Supporting — approved | **Approved** | **Approved — implementation eligible** | **Approved — implementation eligible** | Not granted unless separately evidenced |
| Herlinda Valdovinos | Supporting — approved | **Approved (desktop only)** | **Approved — implementation eligible** | **Not approved** — nav not collapsed; deferred | Not granted unless separately evidenced |
| Claidy Taguran Portfolio | Supporting — approved | **Approved (mobile only)** | **Not approved** — missing "Solutions"; deferred | **Approved — implementation eligible** (cropped) | Not granted |
| Hand Homecare | **Featured (initial) — approved** | **Approved** | **Approved — implementation eligible** | **Approved — implementation eligible** | Not granted unless separately evidenced |

**Implementation-eligible for Phase 2B.3** (owner-approved, July 20, 2026):
`hand-homecare-desktop.webp`, `hand-homecare-mobile.webp`,
`onefilam-community-desktop.webp`, `onefilam-community-mobile.webp`,
`herlinda-valdovinos-desktop.webp`, `claidy-taguran-mobile.webp`.

**Not implementation-eligible** (rejected or deferred — do not wire into
`SelectedWorkSection.tsx`): all submitted Shasta Greene screenshots
(desktop and mobile), Claidy's desktop capture, Herlinda's mobile capture.

No metric/numerical performance claim is approved for any project unless
separately evidenced and separately approved — visual/publication approval
never implies metric approval.

## 12. Approved Phase 2B.3 implementation lineup (owner decision, July 20, 2026)

This is the approved *lineup* — an implementation authorization for which
assets may be wired in and in what role. It does not itself perform any
implementation; `SelectedWorkSection.tsx` was not modified in this
checkpoint.

**FEATURED**
- Hand Homecare (`hand-homecare-desktop.webp`, `hand-homecare-mobile.webp`)

**SUPPORTING**
- OneFilAm Community (`onefilam-community-desktop.webp`,
  `onefilam-community-mobile.webp`)
- Herlinda Valdovinos — **desktop visual only**
  (`herlinda-valdovinos-desktop.webp`)
- Claidy Taguran Portfolio — **cropped mobile visual only**
  (`claidy-taguran-mobile.webp`)

**RESERVED / NOT YET IMPLEMENTABLE**
- Shasta Greene Real Estate — project and public-publication intent
  approved; no visual asset approved; a clean desktop and mobile recapture
  remain required before this project has anything eligible to implement.

Per owner direction, Phase 2B.3's data model must support featured/
supporting placement, desktop-only projects, mobile-only projects,
desktop+mobile pairs, fallback assets, custom image fit/position,
permission status, visual-approval status, publication status,
current-site verification, hiding/reordering, and later URL/screenshot
replacement — and the public UI must never expose internal permission or
audit language. See `PORTFOLIO_ASSET_MANIFEST.md` §10.7 and §12 for the
model definition and the full approval record; adopting the model remains
a Phase 2B.3 implementation decision, not performed in this checkpoint.
