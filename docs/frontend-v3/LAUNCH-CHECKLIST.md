# Frontend V3 — production launch checklist

> Items that must be closed by the owner before the V3 frontend serves real
> production traffic. The branch itself is design/QA-complete; these are
> launch blockers, not build defects. Updated: R1, 2026-09-01.

## Blocking

- [ ] **Privacy Policy and Terms require owner/legal approval before public
      production deployment.** `/privacy` and `/terms` are honest drafts
      grounded in the platform's actual data practices; they have NOT been
      reviewed by counsel and must not be described as legally approved.
- [ ] **Owner approval of the V3 visual system for merge** (PR opened only on
      explicit owner authorization).

## Deliberate launch posture (no action needed to launch)

- **Insights** is routed (`/insights`) for internal preview by direct URL but
  is absent from primary navigation, the mobile sheet, the footer, the
  homepage, and `sitemap.xml`. It returns to public navigation **after the
  first verified article is approved by the owner** — restore the nav entry in
  `components/v3/publicNavV3.ts`, the footer link, the homepage teaser
  (HomeV3 §13), and the sitemap entry in the same change.
- **/pricing and vertical landers** stay routed but out of the IA (owner
  decision 4, carried from V2).
- **Hero video**: the homepage theater uses the Magnific Signal Loop with the
  poster as fallback; the receptionist theater deliberately stays on
  poster + CSS signal for this release.

## Separate programs (not this branch)

- `app.` / `ops.` / `api.` hostname cutover — DESIGN-SPEC.md §9 handoff
  (CORS allowlist, helpdesk `BASE_PATH`, cookie scope, edge gating for ops).
- Voice-platform activation — AR-002 track; `VITE_VOICE_*` flags stay off.
