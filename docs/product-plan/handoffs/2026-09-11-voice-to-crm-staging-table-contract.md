# Handoff — voice/integration owner → CRM workstream

**Date:** 2026-09-11
**From:** integration owner (receptionist / voice)
**Re:** the two outstanding shared table-count contracts, verified against the
live deployment database

## 1. Staging deployment database inventory (verified, not estimated)

Read directly from the database the **deployed** SiteMint-Voice-Staging
Autoscale service is using — `neondb` (the Replit *Production* database of that
App), not the workspace *Development* database:

| Measure | Value |
|---|---|
| `public` base tables | **57** |
| `voice_*` tables | **20** |
| `crm_staff*` tables | **0** |
| voice migration journal (`drizzle.__drizzle_migrations_voice`) | **9 rows** (through `0008`) |

The 20 `voice_*` tables are: `voice_account_states`, `voice_account_tokens`,
`voice_assistants`, `voice_audit_log`, `voice_beta_requests`,
`voice_call_links`, `voice_call_reviews`, `voice_contacts`,
`voice_firm_members`, `voice_invites`, `voice_issues`, `voice_numbers`,
`voice_onboarding_states`, `voice_signup_jobs`, `voice_sms_consents`,
`voice_sms_outbox`, `voice_subscriptions`, `voice_transfer_destinations`,
`voice_usage_cap_states`, `voice_usage_ledger`.

`voice_signup_jobs` is the only table added since the last contract; it arrived
with versioned migration `0008` applied through the guarded runner on
2026-09-11.

## 2. The single-writer boundary held

**Zero `crm_staff*` tables exist in the staging deployment database.** The CRM
Milestone 1 push-mode schema (`crm_staff`, `crm_staff_sessions`,
`crm_staff_tokens`, `crm_staff_login_attempts`) has not reached it. That is the
correct state: CRM push-mode work stays on the CRM workstream's own database
until the integration owner deploys it.

When those tables are ready to reach a shared environment, send a handoff note
— do not run the push against a deployment database. The integration owner
holds the deployment and migration lock.

## 3. Two notes that affect CRM work

- **`ADMIN_PASSWORD` is unset on SiteMint-Voice-Staging.** CRM staff bootstrap
  (`POST /crm/staff/bootstrap`) and break-glass recovery
  (`POST /crm/staff/recovery`) both depend on it, so neither can run in that
  environment until the owner sets it. Admin login is `503` there today, which
  is the documented fail-closed behaviour, not a defect.
- **Account email is not configured in staging** (`VOICE_ALERTS_ENABLED` and
  the three Resend variables are all absent). This confirms rather than
  contradicts the CRM M1 decision to label invite/reset links "not emailed":
  there is no working mail path in that environment to rely on yet.

## 4. `crm_leads` contract — unchanged and now exercised in a deployment

The signup pipeline's live write has been verified end to end on the staging
deployment: `voice_signup_jobs` id 1 (`kind=crm_link`, `firm_id=1`) completed
with `result = {"crmLeadId": 1, "crmOutcome": "created"}`, producing
`crm_leads` id 1 with `source = "AI Receptionist Signup"`,
`service_interest = "AI Receptionist"`, `tags = ["AI Receptionist"]`, and
`notes = "AI Receptionist account created 2026-09-11 (firm 1)."`.

The column list in `INTEGRATION_OWNERSHIP.md` is therefore load-bearing in a
deployed environment now, not just in tests. Renaming any of `name`, `company`,
`phone`, `email`, `source`, `service_interest`, `status`, `priority`, `tags`,
`notes` — or repurposing the `source` / `tags` semantics — needs a handoff note
first.
