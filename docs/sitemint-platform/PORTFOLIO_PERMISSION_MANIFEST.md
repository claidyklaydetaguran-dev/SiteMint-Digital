# Portfolio Permission Manifest — Phase 2B.2 (corrected in Phase 2B.2.1)

> Originally prepared 2026-07-20 in Phase 2B.2 (`claude/phase-2b2-portfolio-assets-8vh4q1`
> @ `0ca3f4311d4a688aa0167797db54cd6cace4b450`). **Corrected 2026-07-20 in
> Phase 2B.2.1** following owner visual review of the Phase 2B.2 owner-review
> package. See `PORTFOLIO_ASSET_MANIFEST.md` §Phase 2B.2.1 corrections for the
> full rationale.
>
> This manifest records **approval status only**. It does not grant approval.
> Nothing here should be read as "cleared for public use" unless the status
> column explicitly says so, and no project's status here says that yet.

## Status definitions (kept distinct on purpose)

| Status | Meaning |
|---|---|
| Project-placement approved | Owner has decided this project's intended role (featured/supporting/deferred), independent of any specific screenshot |
| Asset prepared | An optimized image file exists in the repo |
| Asset visually approved | Owner/client has confirmed the specific screenshot's framing/content is accurate and acceptable |
| Current-site verified | The screenshot has been checked against the site as it exists today (not just checked for quality in isolation) |
| Permission approved | Owner/organization/client has given explicit permission to display it publicly |
| Implementation approved | Someone has approved wiring it into `SelectedWorkSection.tsx` |
| Public publication approved | The change is live in production |

These seven statuses are independent. A project can have project-placement
approved while its current asset has none of the other six statuses — that
is exactly the state Shasta Greene is in below.

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
| Status | **Visually approved candidate — client permission and URL verification required** |

**Owner review findings (Phase 2B.2.1):** this is the cleanest current
asset — strong visual identity, clear hero treatment, no overlay, no visible
private information, good optimization quality. It is visually approved as a
candidate, but must not be published until (a) Herlinda gives explicit
permission and (b) the public domain is reverified as current. This
screenshot has **not** been compared against the current live site — that
comparison has not happened, and this manifest must not imply that it has. A
current mobile capture also remains required.

### Claidy Taguran Portfolio

| Field | Value |
|---|---|
| Relationship | Deferred — team member's personal portfolio; relationship to SiteMint (built-by vs. self-built) undocumented |
| Screenshot owner | Claidy Taguran |
| Website owner | Claidy Taguran |
| Project-placement status | **Remains deferred** (owner decision, Phase 2B.2.1 — unchanged from Phase 2B.2) |
| Current approval state | **Internal confirmation and URL verification pending** |
| Who must approve | Claidy (confirm URL, live status, and whether SiteMint may present it as company work) |
| Approval method | Not yet recorded |
| Approval date | — |
| Permitted uses | Not defined — deferred |
| Prohibited uses | Do not optimize, implement, or approve any Claidy portfolio asset until deferred status is resolved |
| Expiration / re-review date | Re-review once URL/live-status confirmed |
| Public-link permission | Deferred |
| Screenshot permission | Deferred — **not** added to the optimized/approved asset set |
| Logo permission | Not evaluated |
| Case-study permission | Not evaluated |
| Metric permission | N/A |
| Status | **Deferred** |

Open questions carried forward from Phase 2B.1/2B.2, still unresolved:
1. Correct current URL — `ClaidyTaguranPorfolio.replit.app` (misspelled,
   live per existing screenshot) vs. the correctly-spelled variant (shows
   Replit's "not live yet" placeholder in the existing capture).
2. Whether SiteMint may present this as company work vs. Claidy's personal
   project.
3. Whether the existing screenshot represents the final live product.
4. Whether the misspelled URL will remain in use.

No Claidy asset was optimized, implemented, or approved this checkpoint,
consistent with the deferred directive.

## Summary (as of Phase 2B.2.1)

| Project | Project-placement | Current asset status |
|---|---|---|
| Shasta Greene Real Estate | Featured — approved | Prepared reference — recapture required; not implementation-approved |
| OneFilAm Community | Supporting — approved in principle | Historical/prepared reference only; current recapture + organizational approval required |
| Herlinda Valdovinos | Supporting — approved, contingent on client permission | Visually approved candidate; client permission + current-site verification + mobile capture required |
| Claidy Taguran Portfolio | Deferred | Not prepared; not evaluated |

No project has reached permission-approved, implementation-approved, or
public-publication-approved status. No current asset in this manifest is
ready for Phase 2B.3 without a fresh capture (Shasta, OneFilAm) or explicit
client permission plus a mobile capture (Herlinda).
