# Public Launch Checklist (reconciled 2026-09-04)

> [OWNER] items are hard stops only the owner executes or authorises.

## A. Done

- [x] Owner preview package, decisions and amendment recorded (OWNER-REVIEW-WORKBOOK.md)
- [x] PR #30 merged at the exact reviewed identity → main `57ea6c8` (2026-09-04); nothing deployed
- [x] Branch `feature/ai-receptionist-private-beta-readiness` created from `57ea6c8` (local; push on authorisation)
- [x] Staging deployment paused; App, DB, secrets, number, assistants intact

## B. Blueprint gate

- [ ] [OWNER] Approve V5-BLUEPRINT.md (palette, tokens, wireframes, storyboards, motion, pricing, demo architecture, agent map, PR boundaries)

## C. Required for the invite-only private beta

Program PRs (V5-BLUEPRINT §14): PR-1 tokens + motion + routing · PR-2 website integrity + homepage · PR-3 pricing + services · PR-4 AI Receptionist page + preview · PR-5 customer shell + onboarding + auth · PR-6 assistant setup · PR-7 scheduling · PR-8 calls/contacts/number/usage/issues · PR-9 Receptionist Ops + secure admin auth · PR-10 responsive Ops + cleanup.

- [ ] [OWNER] Approve the two additive migrations (onboarding state; admin sessions)
- [ ] [OWNER] Voice-sample source for the two presets
- [ ] [OWNER] Vapi production key + webhook credential; `VOICE_SERVER_URL`; `VOICE_ARTIFACT_POLICY=none`; runtime catalog
- [ ] [OWNER] Flip publish/webhook-attach/tools-attach; publish the pilot assistant; one browser test call
- [ ] [OWNER] Voice-only number (never the intake SMS number); inventory row; assign; scripted inbound call
- [ ] [OWNER] Google production OAuth client; calendar flags; pilot firm connects its calendar
- [ ] [OWNER] Invite mechanism live (`PUBLIC_REGISTRATION_ENABLED` stays off for the public); `PUBLIC_FORM_SUBMISSIONS_ENABLED` after the discovery journey passes testing
- [ ] [OWNER] Resend key; alerts, digest, metrics token, reconciliation flags
- [ ] Private-beta legal documents reviewed
- [ ] Release checklist + preflight + backup + restore drill on the deployed SHA

Verification gates on every PR: typecheck, full tests, contract suites, both builds, voice
matrix, protected-file 0-diff, secret scan, built-output boundary scan (extended to
web-agency if a Vapi public key ever enters that bundle), route sweep at five widths with
zero overflow / zero console errors, keyboard contract, reduced motion, scroll-to-top tests,
LCP budget on the realistic server.

## D. Required before public launch

- [ ] [OWNER/LEGAL] Privacy Policy and Terms approved; retention statement confirmed
- [ ] [OWNER] AI Receptionist pricing from measured costs; self-serve plans; Stripe voice webhook + test clocks
- [ ] "Try the AI" live demo advertised only after end-to-end browser-call certification and cost controls (V5-BLUEPRINT §10)
- [ ] Domain program (`app.` / `ops.` / `api.`), CORS, cookie scope, edge gating for ops [OWNER DNS]
- [ ] Hero videos (homepage, AI Receptionist) generated only after storyboard approval and credit authorisation [OWNER]
- [ ] Performance: mobile LCP ≤ 2.5 s on the deployed origin with poster-first media
- [ ] Google OAuth app verification if scopes require it [OWNER]

## E. Post-launch

SMS from the voice product (policy) · human transfer · team members · shared saved views ·
cross-firm usage/cost roll-up · case studies · Insights · Vapi tools/knowledge/analytics.

## F. Standing prohibitions

Never import the intake SMS number into Vapi; never edit protected files; never run push or
migrate against production; never merge, deploy, publish, resume staging, activate providers or
spend credits without explicit owner approval.
