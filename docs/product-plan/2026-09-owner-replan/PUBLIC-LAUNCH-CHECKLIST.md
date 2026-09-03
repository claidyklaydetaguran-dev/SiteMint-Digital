# Public Launch Checklist

> Owner-facing. Every line names who closes it. Items marked [OWNER] are hard stops that
> only the owner executes or authorises. Supersedes nothing: docs/frontend-v3/LAUNCH-CHECKLIST.md
> and docs/backend-program/PILOT_ACTIVATION.md remain the detailed sources.

## A. Required for owner preview (this package) — DONE 2026-09-03

- [x] Source identities verified (main `7d84bcb`, PR #30 `17a7056`, checks green, build hash-equivalent to R1)
- [x] Staging cost contained (deployment paused; App, DB, secrets, number, assistants intact)
- [x] Mode A (current product) and mode B (certified-capability, synthetic) preview servers
- [x] Route inventory, current-state ledger, dependency map, defects, deferred list
- [x] Screenshots at 360 / 768 / 1024 / 1440 / 1920
- [x] Owner decision sheet (OWNER-REVIEW-WORKBOOK.md)

## B. Required for invite-only private beta

Frontend (each a contract-aware PR on top of PR #30):
- [ ] Merge PR #30 after owner review [OWNER authorises]
- [ ] Unbundle availability / types / calendar status from the voice build flag
- [ ] Calendar connection screen; Settings honours `?calendar=`
- [ ] Appointments: approve / reschedule / cancel booked (calendar router)
- [ ] Onboarding hub + Overview status header
- [ ] Usage (voice minutes) + Issues page
- [ ] Contacts minimal route + page
- [ ] Phone number page + guarded inventory insert
- [ ] Nav regroup, breadcrumbs, capability states, 404s (both apps)
- [ ] Receptionist Ops → Firms / Firm detail in the CRM
- [ ] Website honesty copy: `/about`, `/work` (discovery + "answers real calls" claims); `/discovery` wired to submit

Backend activation (PILOT_ACTIVATION Stages 0–4, staging first then production):
- [ ] [OWNER] Vapi production key + webhook credential; `VOICE_SERVER_URL`; `VOICE_ARTIFACT_POLICY=none`; runtime catalog
- [ ] [OWNER] `VOICE_PUBLISH_ENABLED`, `VOICE_WEBHOOK_ATTACH_ENABLED`, `VOICE_TOOLS_ATTACH_ENABLED` → publish pilot assistant
- [ ] [OWNER] One browser test call (SiteMint path) — certify rows, no transcript
- [ ] [OWNER] Voice-only number acquired (never the intake SMS number); inventory row; assign; scripted real inbound call
- [ ] [OWNER] Google OAuth client for production; `CALENDAR_CONNECT_ENABLED`, `CALENDAR_WRITE_ENABLED`; pilot firm connects its own calendar
- [ ] [OWNER] `PUBLIC_REGISTRATION_ENABLED` (or invite tokens); `PUBLIC_FORM_SUBMISSIONS_ENABLED` for the website forms
- [ ] [OWNER] Resend key; `VOICE_ALERTS_ENABLED`, `VOICE_DIGEST_ENABLED`, `VOICE_METRICS_TOKEN`; `VOICE_RECONCILIATION_ENABLED`
- [ ] Release checklist + preflight + backup + restore drill on the deployed SHA

Verification gates (every PR): typecheck, full tests, contract suites, both builds,
voice matrix, protected-file 0-diff, secret scan, built-output boundary scan, route sweep
at five widths with zero overflow / zero console errors, keyboard contract, reduced motion.

## C. Required before public launch

- [ ] [OWNER/LEGAL] Privacy Policy and Terms approved by counsel
- [ ] [OWNER] Recording/transcript retention decision documented (default stays `none`)
- [ ] Password reset UI (`PASSWORD_RESET_REQUESTS_ENABLED`)
- [ ] Billing: plan catalog + pricing [OWNER]; `VOICE_PLAN_CATALOG_JSON`; Stripe voice webhook; test-clock run for grace → suspended
- [ ] Integrations page (calendar card)
- [ ] Pricing posture on `/ai-receptionist`; `/pricing` V2 page retired or rebuilt
- [ ] `/contact` on V4 chrome; legacy vertical landers retired or sourced
- [ ] Domain program: `app.` / `ops.` / `api.` hosts, `BASE_PATH`, cookie scope, CORS allowlist, edge gating for ops [OWNER DNS]
- [ ] Performance: mobile LCP ≤ 2.5 s on the deployed origin (prerender needs hosting rewrite config)
- [ ] Google OAuth app verification (consent screen) if scopes require it [OWNER]
- [ ] Support runbooks read by whoever answers customers (INCIDENT, NUMBER_PAUSE, ROLLBACK)

## D. Post-launch

- SMS from the voice product (Stage 6, consent policy) · human transfer UI + live certification ·
  team members · saved views · cross-firm usage/cost roll-up · hero film · case studies ·
  Insights · Vapi tools/knowledge/analytics surfaces · entitlement enforcement semantics.

## E. Standing prohibitions (unchanged)

Never import the intake SMS number into Vapi; never enable Vapi SMS on it; never edit
protected files; never run push/migrate against production; never merge, deploy, publish or
change production data without explicit owner approval.
