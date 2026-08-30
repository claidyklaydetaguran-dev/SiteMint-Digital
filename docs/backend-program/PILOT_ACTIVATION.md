# Pilot activation checklist

The ordered, owner-approved path from "all flags off" to one paying firm
taking real calls. Every step names its verification; stop at the first
failure. Steps marked **[OWNER]** are program hard stops that only the
owner executes or explicitly authorizes.

## Stage 0 — preconditions (no flags yet)

- [ ] Release checklist passed on the deployed SHA; `[env contract]` clean.
- [ ] Database: `preflight` exit 0, "nothing to do".
- [ ] Backup taken + restore drill PASS.
- [ ] **[OWNER]** the pilot firm exists (real signup → intake_firms row),
      email verified via the account flow once alerts are on (stage 4).

## Stage 1 — provider config, still no calls

- [ ] **[OWNER]** Vapi: production API key issued; webhook secret created.
- [ ] Set `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `VOICE_SERVER_URL`,
      `VOICE_ARTIFACT_POLICY=none`, `VOICE_RUNTIME_CATALOG_JSON`.
- [ ] Flip `VOICE_PUBLISH_ENABLED=true`, `VOICE_WEBHOOK_ATTACH_ENABLED=true`.
- [ ] **[OWNER]** publish the pilot assistant from the dashboard.
      Verify: assistant `published`, provider id stored, artifactPlan
      disabled recording (Vapi console), publish audit/log lines clean.
- [ ] Flip `VOICE_TOOLS_ATTACH_ENABLED=true`; **[OWNER]** re-sync.
      Verify: the four tools attached with server URLs (console).

## Stage 2 — webhook truth

- [ ] **[OWNER]** point the Vapi server URL at `/api/voice/webhooks/vapi`.
- [ ] **[OWNER]** browser test call (the approved boundary).
      Verify rows: provider_webhook_events for the call,
      voice_usage_ledger row (P7 metering), contact linked (P5),
      call visible in the dashboard, NO transcript/recording stored.

## Stage 3 — number and transfers

- [ ] **[OWNER]** acquire/import the voice-only number at the provider
      (NEVER the intake SMS number) and insert its inventory row
      (admin action; providerNumberId from the console).
- [ ] Assign it: `POST /receptionist/voice/numbers/:id/assign`.
- [ ] **[OWNER]** configure inbound routing to assistant-request.
      Verify: a scripted real call rings through; a paused number gets
      the spoken unavailable line (the P6 failure matrix, live).
- [ ] Owner-entered transfer destinations; verify in-hours transfer and
      after-hours message behavior.

## Stage 4 — operations on

- [ ] `VOICE_RECONCILIATION_ENABLED=true` (reconciliation + metering
      backfill + grace sweep). Verify the three boot lines.
- [ ] **[OWNER]** Resend key; `VOICE_ALERTS_ENABLED=true` + from/to;
      `VOICE_DIGEST_ENABLED=true`; `VOICE_METRICS_TOKEN` set.
      Verify: metricz 200; a test critical issue alerts; next-day digest.
- [ ] Account flows live: email verification round-trip for the pilot
      firm; password reset drill on a test account.

## Stage 5 — money

- [ ] Set `VOICE_PLAN_CATALOG_JSON` (+ default plan), cap policy
      (`VOICE_USAGE_INCLUDED_MINUTES` or plan minutes).
- [ ] **[OWNER]** Stripe: voice webhook endpoint + secret
      (`VOICE_BILLING_WEBHOOK_SECRET`); customer created through the
      existing checkout; admin sets the firm↔customer mapping
      (`PUT /api/admin/voice/firms/:id/subscription`).
- [ ] Verify with Stripe test clocks against staging first: fail a
      payment → `grace` with the right deadline; recover → `active`;
      let it expire → `suspended` + critical issue (and NOTHING pauses
      by itself).

## Stage 6 — SMS (optional for pilot; owner policy)

- [ ] **[OWNER]** separate voice Twilio credentials + number (anti-reuse
      loader refuses intake values); `VOICE_SMS_ENABLED=true`.
- [ ] Verify: booking confirmation only after in-call consent; STOP
      honored (recorded even while disabled); missed-call text-back stays
      `blocked_no_consent` unless the owner turns that policy on.

## Standing rules during pilot

Daily: open issues + digest read. Weekly: restore drill on the latest
backup. The moment anything reads Sev 1–2: `runbooks/INCIDENT.md`.
