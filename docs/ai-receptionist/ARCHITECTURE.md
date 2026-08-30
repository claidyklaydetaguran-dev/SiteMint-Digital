# AI Receptionist — Architecture

## Components

### Frontend (active)
- **Artifact**: `artifacts/helpdesk`
- **Base path**: `/ai-receptionist/dashboard`
- **Auth**: Cookie-based session (`receptionist_session`), validated via `GET /api/receptionist/auth/me`
- **Pages** (post-Phase 2C): Login, Overview (`/`), Conversations inbox (`/conversations`),
  AI Receptionist agent config (`/receptionist`), Billing (`/billing`),
  Settings (`/settings` — Members/Language stubs), Contacts (`/contacts` — stub).
  `/deploy` is an in-SPA redirect to `/receptionist` (the Deploy page was deleted in Phase 2B).

### Frontend (legacy — RETIRED in Phase 2A)
- The legacy receptionist pages under `artifacts/web-agency/src/pages/receptionist/`
  were deleted in Phase 2A. The `/app`, `/app/login`, `/app/agent-config`,
  `/app/settings`, `/app/conversations/:id` routes in web-agency are now
  `window.location.replace` redirects to `/ai-receptionist/dashboard/...`.
  Billing return URLs and the signup entry point were repointed at the new
  dashboard in Phase 1B.

### Backend
- **Artifact**: `artifacts/api-server`
- **Port**: 8080 (proxied at `/api` by the shared reverse proxy)
- **Auth lib**: `src/lib/receptionistAuth.ts` — cookie sessions, DB-backed (`receptionist_sessions`), 30-day TTL

### API Routes

| File | Prefix | Purpose |
|---|---|---|
| `receptionistAuth.ts` | `/api/receptionist/auth/` | signup, login, logout, me |
| `receptionistConversations.ts` | `/api/receptionist/` | conversations list, conversation detail + messages |
| `receptionistAgentConfig.ts` | `/api/receptionist/` | agent config GET/PATCH |
| `receptionistBilling.ts` | `/api/receptionist/billing/` | Stripe Checkout session create, webhook handler |
| `receptionistAdmin.ts` | `/api/admin/` | admin receptionist account list (CRM-side) |
| `intakeAgent.ts` | `/api/intake/` | inbound SMS webhook, admin case review list |

### SMS Intake Pipeline

```
Twilio inbound SMS
  → POST /api/intake/sms-webhook
  → validateIntakeTwilioSignature (lib/intakeTwilio.ts)
  → firm resolution (match To → intake_firms.twilio_number)
  → find-or-create intake_conversations row
  → trial cap check
  → LLM (GPT via AI_INTEGRATIONS_OPENAI_API_KEY) → JSON reply + extracted fields
  → upsert intake_cases (incidentType, injurySeverity, priorAttorney, …)
  → on conversationComplete: scoreIntakeCase (lib/intakeScoring.ts) → Resend email notification
  → SMS reply via INTAKE_TWILIO_AUTH_TOKEN credentials
```

### Database

- **Schema source of truth**: `lib/db/src/schema/intakeAgent.ts`
- **Tables**: `intake_firms`, `intake_conversations`, `intake_messages`, `intake_cases`, `receptionist_sessions`

#### Dead Schema Warning
`lib/db/src/schema/conversations.ts` and `lib/db/src/schema/messages.ts` define `conversations` and
`messages` tables that **do not exist in the database** and have never been pushed. These are dead
schema code. Do not run `drizzle-kit push` on them. Removal is deferred to the migration-transition
ADR (ADR-05 — see DATABASE_STRATEGY.md).

## Locked File Rule

**Receptionist phone/SMS features must NEVER touch
`artifacts/api-server/src/routes/phone.ts`.**

`phone.ts` belongs to the CRM product and uses the CRM Twilio credentials
(`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`). The AI Receptionist SMS pipeline uses
completely separate credentials (`INTAKE_TWILIO_AUTH_TOKEN`) via `lib/intakeTwilio.ts`.
These two Twilio integrations are isolated by design and must remain so.

## Auth Separation

Two auth systems coexist and must not collide:

| System | Mechanism | Storage | Tables |
|---|---|---|---|
| CRM / Admin | `Authorization: Bearer` token in `localStorage` | Client memory | — (stateless) |
| AI Receptionist | `httpOnly` cookie `receptionist_session` | `receptionist_sessions` table | `receptionist_sessions` |

## Known Gaps

The Phase 1A–1C gaps previously listed here (unsafe firm-resolution fallback, missing
STOP/opt-out handling, wrong billing/signup redirect URLs, missing auth rate limiting)
are all **fixed and frozen** — see SESSION_HANDOFF.md for per-phase test evidence.

Remaining known gaps:
- Stripe checkout initiation blocked by missing owner ops (`STRIPE_RECEPTIONIST_PRICE_ID`
  + Stripe connection); Phase 1B tests (d)–(f) still deferred — must run before onboarding
  any paying customer.
- Signup 409 email enumeration — accepted residual risk (see DECISION_LOG.md).
- In-memory rate-limit state resets on restart and is per-instance under autoscale.
- Inbox manual reply composer and AgentConfig "Test" tab are not implemented.
- Contacts and Settings (Members/Language) pages are stubs.

## Voice Platform (Milestone 1+, approved 2026-07-17)

The product is expanding into the SiteMint voice + messaging platform: assistants,
publish-to-Vapi via a server-side `VoiceProvider` abstraction, browser test calls, and
(in later milestones) phone numbers, call logs, transcripts, analysis, tools, knowledge
bases, contacts, and analytics. See `VOICE_PLATFORM.md` (created during Milestone 1) and
DECISION_LOG.md entries dated 2026-07-17. Voice tables use versioned Drizzle migrations
(ADR-05, scoped); the SMS pipeline and all tables above are unchanged.
