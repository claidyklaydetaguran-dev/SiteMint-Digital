# CLAUDE.md — SiteMint-Digital Monorepo Guide

> Read this before any development session. Last updated: 2026-07-17.

## What lives in this repo

Two products plus internal tooling share one pnpm monorepo and one Express backend:

1. **SiteMint AI Receptionist / Voice Platform** (customer-facing SaaS)
   - Dashboard SPA: `artifacts/helpdesk` → served at `/ai-receptionist/dashboard`
   - Backend routes: `artifacts/api-server/src/routes/receptionist*.ts`,
     `routes/intakeAgent.ts`, `routes/voice/*` (voice platform, Milestone 1+)
   - Docs: `docs/ai-receptionist/` (ARCHITECTURE, CURRENT_STATE, ROADMAP,
     DATABASE_STRATEGY, DECISION_LOG, SESSION_HANDOFF, VOICE_PLATFORM)
2. **SiteMint Digital internal CRM + marketing site** (internal tool)
   - `artifacts/web-agency` → marketing site at `/`, CRM at `/admin/crm/*`
   - Docs: root `ARCHITECTURE.md` + `DEVELOPMENT_RULES.md` (CRM-scoped)
3. Unrelated: `artifacts/ai-toolkit` (standalone product), `artifacts/mockup-sandbox`
   (internal tooling), `routes/helpdesk.ts` (legacy ticket routes, CRM-auth only).

## Repository layout

```
artifacts/
  api-server/      Express 5 backend, port 8080, serves ONLY /api (all products)
  helpdesk/        AI Receptionist dashboard SPA (/ai-receptionist/dashboard)
  web-agency/      Marketing site + internal CRM (/)
  ai-toolkit/      Unrelated product microsite
  mockup-sandbox/  Unrelated internal tooling
lib/
  db/              Drizzle schema + client. intake_* = receptionist; crm_* = CRM.
                   voice_* tables use versioned migrations (lib/db/MIGRATIONS.md);
                   crm_* tables use push mode. See ADR-05 in
                   docs/ai-receptionist/DATABASE_STRATEGY.md.
  api-spec/ api-zod/ api-client-react/   Orval codegen chain
  integrations-openai-ai-server/         OpenAI client (used by intakeAgent)
  integrations-openai-ai-react/          Browser audio hooks (currently unused)
scripts/           Utility scripts (Stripe seeding, billing/webhook harnesses)
docs/ai-receptionist/   Receptionist + voice platform documentation
```

## Protected files — never modify without an explicit owner request naming them

SMS / receptionist backend (the working product):
- `artifacts/api-server/src/routes/intakeAgent.ts`
- `artifacts/api-server/src/routes/phone.ts` (CRM Twilio — registered webhooks)
- `artifacts/api-server/src/lib/intakeOptOut.ts`
- `artifacts/api-server/src/lib/intakeTwilio.ts`
- `artifacts/api-server/src/lib/intakeScoring.ts` (import it; never edit it)
- `artifacts/api-server/src/lib/authRateLimit.ts`
- `artifacts/api-server/src/lib/receptionistAuth.ts`
- `artifacts/api-server/src/routes/receptionistAuth.ts`
- `artifacts/api-server/src/routes/receptionistConversations.ts`
- `artifacts/api-server/src/routes/receptionistAgentConfig.ts`
- `artifacts/api-server/src/routes/receptionistBilling.ts`
- `lib/db/src/schema/intakeAgent.ts` (columns frozen; additive columns only via
  reviewed migration)

CRM locked engines (see root ARCHITECTURE.md):
- `artifacts/web-agency/src/lib/{discEngine,leadScore,communicationIntelligence,workflowEngine}.ts`

Historical note: prior sessions also "froze" helpdesk UI files (see
SESSION_HANDOFF.md). Those **UI** freezes were superseded on 2026-07-17 by the
approved voice-platform redesign (DECISION_LOG.md). Backend/SMS locks above
remain absolute.

## Twilio / SMS safety rule (binding)

The intake SMS pipeline uses separate credentials (`INTAKE_TWILIO_ACCOUNT_SID`,
`INTAKE_TWILIO_AUTH_TOKEN`) from the CRM (`TWILIO_*`). Never mix them.
**Never import the SiteMint intake SMS number into Vapi, and never enable Vapi
SMS management on it.** Voice testing uses browser calls or a separate
voice-only number (or a Twilio import with Vapi SMS explicitly disabled).
Nothing may replace the Twilio Messaging webhook on the intake number.

## Voice platform (Milestone 1+)

- All provider communication goes through the `VoiceProvider` abstraction
  (`artifacts/api-server/src/lib/voice/`). No Vapi type, URL, SDK import, or
  credential may appear outside `VapiVoiceProvider.ts` and the provider factory.
- `VAPI_API_KEY` is server-only. The browser receives only `VAPI_PUBLIC_KEY`
  via the authenticated, tenant-scoped web-session endpoint.
- Feature flag `VOICE_PLATFORM_ENABLED`: on in dev/staging, OFF in production
  until owner approval. SMS routes are never behind the flag.
- Every customer-owned voice table row: `firm_id` NOT NULL + FK to
  `intake_firms.id` + index + `created_at`/`updated_at`. All queries firm-scoped;
  cross-firm access returns 404.
- `VOICE_PROVIDER=fake` (FakeVoiceProvider) for automated tests and for dev
  without credentials.

## Database rules

- `intake_*`, `crm_*`, discovery/billing tables: never change, rename, delete,
  or migrate existing columns without explicit owner approval.
- New voice tables: versioned Drizzle migrations only (`lib/db/MIGRATIONS.md`),
  additive-only, with committed rollback SQL. Never run push or migrate against
  production. Identify the active database environment before any migration
  (do not print `DATABASE_URL`).
- CRM tables continue push mode: `pnpm --filter @workspace/db run push`.

## Auth systems (two — never merge)

| System | Mechanism | Notes |
|---|---|---|
| CRM/Admin | `Authorization: Bearer` in localStorage, in-memory token | resets on server restart |
| Receptionist | httpOnly cookie `receptionist_session`, `receptionist_sessions` table | 30-day TTL |

## Run commands

```bash
pnpm run typecheck                 # whole workspace
pnpm --filter @workspace/api-server run dev     # backend :8080
pnpm --filter @workspace/helpdesk run dev       # dashboard :21622
pnpm --filter @workspace/web-agency run dev     # site+CRM :22065
pnpm --filter @workspace/db run push            # CRM schema push (CRM only)
pnpm run build                     # typecheck + build all
```

Helpdesk build needs env: `PORT=21622 BASE_PATH=/ai-receptionist/dashboard`.

## Verification gates for any receptionist/voice change

1. `pnpm run typecheck` clean; helpdesk + api-server builds pass.
2. `git diff` on every protected file above = 0 lines.
3. SMS regression: STOP webhook curl → `<Response></Response>` + conversation
   `opted_out`; login rate limit 10×401 → 429.
4. No browser console errors on any dashboard route.

## Secrets

Never commit secrets, API keys, credentials, `.env` files, generated tokens,
customer data, or database exports. `.env.example` documents required vars.
