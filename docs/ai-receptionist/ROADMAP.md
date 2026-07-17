# AI Receptionist / SiteMint Voice Platform — Roadmap

> Updated 2026-07-17. Phases 1A–2C of the original receptionist roadmap are COMPLETE
> and frozen (see SESSION_HANDOFF.md for per-phase scope and test evidence).
> The roadmap now continues as the approved voice-platform milestone plan
> (DECISION_LOG.md, 2026-07-17 entries).

---

## Completed phases (frozen)

| Phase | Scope | Status |
|---|---|---|
| 1A | Tenant isolation (firm-resolution hard-reject) + STOP/START/HELP + rate guard | ✅ Complete |
| 1B | Billing/signup redirect repair | ✅ Code complete — Stripe E2E tests (d)–(f) DEFERRED until owner ops (see below) |
| 1C | Auth hardening (rate limiting, failure logging) | ✅ Complete |
| 2A | Legacy `/app/*` retirement + dead-code deletion + opted_out inbox fix | ✅ Complete |
| 2B | Nav shell + Overview page | ✅ Complete |
| 2C | Dashboard UI/UX redesign + gap fixes | ✅ Complete |

## Voice Platform Milestones (approved 2026-07-17)

Each milestone ends with QA + freeze + owner approval before the next begins.
Feature flag `VOICE_PLATFORM_ENABLED` stays OFF in production until owner approval.

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Foundation + first working assistant** | Checkpoints A–G: docs reconciliation; dark/light design system + collapsible grouped shell + error boundary; versioned migrations for `voice_assistants`/`provider_webhook_events`/`voice_issues`; `VoiceProvider`/`VapiVoiceProvider`/`FakeVoiceProvider`; assistant CRUD + templates + publish + duplicate + guarded delete; browser test call; Vitest + Playwright | **IN PROGRESS** |
| M2 — Phone numbers + call ingestion | Voice-only number (never the intake SMS number), assignment, end-of-call ingestion → call logs, transcripts, recording proxy | Planned |
| M3 — Analysis + shared lead scoring + contacts | Call analysis persistence, tier scoring via `intakeScoring` adapter, Resend voice notifications, contacts, trial voice-minute enforcement | Planned |
| M4 — Tools + knowledge base + SMS unification | Tool CRUD, KB + docs, SMS agent surfaced as messaging assistant (pipeline untouched), inbox reply composer | Planned |
| M5 — Analytics + issues + integrations pages | | Planned |
| M6 — Billing expansion + team + settings | Voice plans, usage, `firm_members`; Stripe Phase 1B deferred tests closed | Planned |
| M7 — Hardening + launch | Full Playwright suite, webhook abuse pass, flag removed in production | Planned |

## Ops Tasks (Owner — Not Code Changes)

- Set `STRIPE_RECEPTIONIST_PRICE_ID` secret + connect Stripe (required before Phase 1B
  E2E tests (d)–(f) — these MUST run before onboarding any paying customer)
- Set `ADMIN_PASSWORD` secret (removes hardcoded `"sitemint2024"` fallback)
- Set `RESEND_FROM_EMAIL` to a Resend-verified sending address
- Set `INTAKE_TWILIO_ACCOUNT_SID` in production (required for outbound intake SMS —
  see corrected `.env.example`)
- Vapi (before M1 live testing): create account; set `VAPI_API_KEY`, `VAPI_PUBLIC_KEY`,
  `VAPI_WEBHOOK_SECRET`; create the Custom Credential (HMAC preferred) and register the
  server URL `https://<domain>/api/voice/webhooks/vapi`
- Twilio console: Advanced Opt-Out enabled + A2P 10DLC registration confirmed on the
  intake number
- **Never** import the intake SMS number into Vapi or enable Vapi SMS management on it
