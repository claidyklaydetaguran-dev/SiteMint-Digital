# Receptionist / CRM workstream coordination

**Integration owner:** the receptionist session (this document's author). It is
the ONLY session that deploys to shared staging (`SiteMint-Voice-Staging`) or
runs database migrations, anywhere. **Shared base SHA:** the CRM workstream
branches from `b0a5f49` on `feature/ai-receptionist-private-beta-readiness`
(or later — record the actual SHA in the handoff note).

## File ownership

**Receptionist/integration session owns**
- `artifacts/api-server/src/routes/receptionist*.ts`, `routes/voice*.ts`,
  `routes/adminVoice*.ts`, `lib/voice*/**`, `lib/signupPipeline/**`,
  `lib/accountSecurity/**`, `lib/receptionistAuth.ts` (protected — additionally
  needs owner-named authorization per CLAUDE.md)
- `artifacts/helpdesk/**` (customer dashboard)
- `lib/db/src/schema/voice/**` and ALL migration execution (every domain)
- `artifacts/web-agency` receptionist marketing/auth surfaces
  (`AiReceptionistV5.tsx`, `LandingReceptionistSignup.tsx`, `receptionist-v5/`,
  `signup/`, `components/v4/publicNavV4.ts`, `SiteHeaderV4.tsx`)
- Staging deployment, `.replit`, server/runtime configuration, Secrets posture

**CRM session owns (isolated worktree/branch, never deploys, never migrates)**
- `artifacts/web-agency/src/pages/crm/**`, `src/components/crm/**` and other
  `/admin/crm` surfaces
- `artifacts/api-server/src/routes/crm*.ts` EXCEPT shared-schema changes
- CRM-side docs

**Shared — integration-owner merge only, propose via handoff note**
- `lib/db/src/schema/*.ts` (crm_*, intake_*, shared barrels) — schema changes
  land only through the integration owner; CRM tables stay push-mode, never
  touched by domain migrations
- `artifacts/api-server/src/app.ts`, `src/index.ts`, route registration
- `lib/db/drizzle/**` (all journals/meta — single-writer: integration owner)
- Root configs, CI, env contract (`lib/envContract.ts`)

## Contract already relied upon by the receptionist side

- `crm_leads` columns used by the signup pipeline: `name, company, phone,
  email, source, service_interest, status, priority, tags, notes`. The
  pipeline inserts `source='AI Receptionist Signup'`, tag `AI Receptionist`,
  dedupes by `lower(email)`. Do not rename these columns or repurpose
  `tags`/`source` semantics without a handoff note to the integration owner.
- Voice service and Operations CRM currently SHARE one database per
  environment. A staging-created lead exists only in the staging CRM — it must
  never be reported as visible in production.

## Process

- Exchange concise handoff notes at `docs/product-plan/handoffs/` (one file per
  handoff, dated). No cross-session state is assumed.
- CRM commits are merged into the integration branch by the integration owner
  after focused cross-workstream tests; only then are they deployed.
- Never run simultaneous deployments or migrations; if unsure, the integration
  owner has the lock by default.
