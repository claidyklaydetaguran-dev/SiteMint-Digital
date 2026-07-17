# AI Receptionist — Architecture

## Components

### Frontend (active)
- **Artifact**: `artifacts/helpdesk`
- **Base path**: `/ai-receptionist/dashboard`
- **Auth**: Cookie-based session (`receptionist_session`), validated via `GET /api/receptionist/auth/me`
- **Pages**: Login, Inbox (conversations), Billing, Settings (agent config), Contacts (stub), Deploy (stub)

### Frontend (legacy — to be retired in Phase 2)
- **Location**: `artifacts/web-agency/src/pages/receptionist/`
- **Routes**: `/app`, `/app/login`, `/app/agent-config`, `/app/settings`, `/app/conversations/:id`
- **Status**: Live but partially disconnected; billing redirects land here (bug); signup navigates here (bug). Retirement deferred to Phase 2.

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

## Known Gaps (see ROADMAP.md for remediation phases)

- STOP/opt-out not handled at application level (Phase 1A)
- Firm-resolution fallback to first DB row is unsafe (Phase 1A)
- Billing success/cancel URLs point to legacy `/app/settings` (Phase 1B)
- Signup redirects to legacy `/app` frontend (Phase 1B)
- Auth endpoints lack rate limiting and generic error messages (Phase 1C)
