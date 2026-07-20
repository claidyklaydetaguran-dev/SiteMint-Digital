# Portfolio Permission Manifest — Phase 2B.2

> Prepared: 2026-07-20. Branch `claude/phase-2b2-portfolio-assets-8vh4q1`,
> based on `claude/sitemint-phase-2b1-audit-wtoai0` @
> `0ca3f4311d4a688aa0167797db54cd6cace4b450`.
>
> This manifest records **approval status only**. It does not grant approval.
> Nothing here should be read as "cleared for public use" unless the status
> column explicitly says so, and no project's status here says that yet.

## Status definitions (kept distinct on purpose)

| Status | Meaning |
|---|---|
| Asset prepared | An optimized image file exists in the repo |
| Visual approved | Owner/client has confirmed the specific screenshot is accurate and acceptable |
| Permission approved | Owner/organization/client has given explicit permission to display it publicly |
| Implementation approved | Someone has approved wiring it into `SelectedWorkSection.tsx` |
| Public publication approved | The change is live in production |

None of the four projects below have reached "permission approved" in this
checkpoint. All are, at most, "asset prepared."

## Per-project manifest

### Shasta Greene Real Estate

| Field | Value |
|---|---|
| Relationship | Owner's own business (Claidy/SiteMint-affiliated) |
| Screenshot owner | Site owner (self) |
| Website owner | Site owner (self) |
| Current approval state | **Final owner visual approval pending** |
| Who must approve | Owner (self-approval permitted, but not yet recorded as given) |
| Approval method | Not yet recorded |
| Approval date | — |
| Permitted uses | Not yet defined pending approval |
| Prohibited uses | Not yet defined pending approval |
| Expiration / re-review date | Recommend re-review at next live-site redesign |
| Public-link permission | Pending |
| Screenshot permission | Pending — asset prepared (widget-cropped, optimized) |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — no metrics are claimed by SiteMint about this project |
| Status | **Owner-controlled — recommended featured candidate — final visual approval pending** |

Verification performed this checkpoint (visual review of existing screenshot):
- No feedback widget in the optimized asset (cropped out; present in the
  unedited source `portfolio-shasta.png`, which was **not modified**)
- No private lead data visible
- No admin tools visible
- Screenshot could not be re-verified against the live site (network blocked
  this session — see CAPTURE_VALIDATION_REPORT.txt)
- Correct domain: shown in nav/logo as "Shasta Greene"; URL itself
  (shastagreene.com) not re-confirmed live this session
- Mobile capture: **not available** — requires owner-side capture (network
  blocked)

### OneFilAm Community

| Field | Value |
|---|---|
| Relationship | Recommended supporting project |
| Screenshot owner | OneFilAm organization |
| Website owner | OneFilAm organization |
| Current approval state | **Organizational approval pending** |
| Who must approve | Appropriate OneFilAm leadership |
| Approval method | Simple internal written approval (per owner direction) — not yet obtained |
| Approval date | — |
| Permitted uses | Not yet defined pending approval |
| Prohibited uses | Not yet defined pending approval |
| Expiration / re-review date | Recommend re-review annually or at next site redesign |
| Public-link permission | Pending |
| Screenshot permission | Pending — asset prepared |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — no metrics claimed |
| Status | **Organizational approval pending** |

Verification: no donor/member/volunteer PII visible, no admin screens, no
nonpublic event-management information visible in the existing screenshot.
Mobile capture not available this session.

### Herlinda Valdovinos

| Field | Value |
|---|---|
| Relationship | Recommended supporting project |
| Screenshot owner | Herlinda Valdovinos (client) |
| Website owner | Herlinda Valdovinos (client) |
| Current approval state | **Client approval pending** |
| Who must approve | Herlinda Valdovinos directly |
| Approval method | Explicit client permission required — not yet obtained |
| Approval date | — |
| Permitted uses | Not yet defined pending approval |
| Prohibited uses | Not yet defined pending approval |
| Expiration / re-review date | Recommend re-review at next site redesign |
| Public-link permission | Pending |
| Screenshot permission | **Pending client approval** — asset prepared but must remain marked "Pending client approval" until granted |
| Logo permission | Not evaluated this checkpoint |
| Case-study permission | Not evaluated this checkpoint |
| Metric permission | N/A — no metrics claimed |
| Status | **Pending client approval** |

Verification: no private contact submissions, admin areas, or unpublished
client-only material visible in the existing screenshot. Mobile capture not
available this session.

### Claidy Taguran Portfolio

| Field | Value |
|---|---|
| Relationship | Deferred — team member's personal portfolio; relationship to SiteMint (built-by vs. self-built) undocumented |
| Screenshot owner | Claidy Taguran |
| Website owner | Claidy Taguran |
| Current approval state | **Internal confirmation and URL verification pending** |
| Who must approve | Claidy (confirm URL, live status, and whether SiteMint may present it as company work) |
| Approval method | Not yet recorded |
| Approval date | — |
| Permitted uses | Not defined — deferred |
| Prohibited uses | Not defined — deferred |
| Expiration / re-review date | Re-review once URL/live-status confirmed |
| Public-link permission | Deferred |
| Screenshot permission | Deferred — **not** added to the optimized/approved asset set this checkpoint |
| Logo permission | Not evaluated |
| Case-study permission | Not evaluated |
| Metric permission | N/A |
| Status | **Deferred** |

Open questions carried forward from Phase 2B.1, still unresolved (network
access could not resolve them this session either):
1. Correct current URL — `ClaidyTaguranPorfolio.replit.app` (misspelled,
   live per existing screenshot) vs. the correctly-spelled variant (shows
   Replit's "not live yet" placeholder in the existing capture).
2. Whether SiteMint may present this as company work vs. Claidy's personal
   project.
3. Whether the existing screenshot represents the final live product.
4. Whether the misspelled URL will remain in use.

No optimized Claidy asset was produced this checkpoint, consistent with the
directive not to add it to the approved implementation set.

## Summary

| Project | Status |
|---|---|
| Shasta Greene Real Estate | Final owner visual approval pending |
| OneFilAm Community | Organizational approval pending |
| Herlinda Valdovinos | Client approval pending |
| Claidy Taguran Portfolio | Deferred — internal confirmation + URL verification pending |

No project in this manifest has permission approved, implementation
approved, or public publication approved status.
