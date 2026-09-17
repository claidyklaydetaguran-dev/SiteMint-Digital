---
name: sitemint-receptionist-ux
description: Simplify SiteMint receptionist onboarding and build responsive dashboards with accurate, interactive customer activity and readiness states.
---

Optimize the path from new account to a working receptionist test.
Use progressive disclosure, saved progress and requirements conditional on enabled
features. Keep infrastructure and provider choices out of ordinary customer setup.
Use one server-owned readiness contract across setup, overview and activation.
Keep test readiness, published configuration, phone routing and live-call proof distinct.
Drive metrics, statuses and motion from real authorized data and media events.
Provide useful zero-data, loading, stale, disconnected and failed states.
Every metric drilldown must preserve the same date, timezone and channel filters.
Use SiteMint teal/cyan styling, accessible controls and restrained reduced-motion-aware
animation. Validate desktop and mobile interactions against the running application.

Repository anchors: dashboard SPA `artifacts/helpdesk` (base path
`/ai-receptionist/dashboard`, local dev via the `receptionist-dashboard` entry in
`.claude/launch.json`), signup page `artifacts/web-agency/src/pages/LandingReceptionistSignup.tsx`.
Each page keeps its copy and rules in a pure `*Contract.ts` with a tsx contract test
registered in `scripts/package.json`; update both together.
