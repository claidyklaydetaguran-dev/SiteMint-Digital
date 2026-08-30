# P2 — Webhook and call-lifecycle completion

Objective: everything between "Vapi sends an event" and "an operator can
trust the call record" is production-grade — while the provider still has no
server URL configured. Activation stays an owner-gated phase.

## Scope

- **Auth policy** (`webhookAuthPolicy.ts`): HMAC-only by default; the Bearer
  bridge only when `VAPI_WEBHOOK_ALLOW_BEARER="true"` AND the request carries
  no HMAC headers; rotation overlap via `VAPI_WEBHOOK_SECRET_PREVIOUS`
  (signature-mismatch retries only), with the matched mode surfaced to logs.
- **Parser**: opportunistic, validated extraction of provider-reported call
  boundaries (`startedAtIso`/`endedAtIso`/`durationSeconds`).
- **Fold**: `hasEndOfCallReport` and `providerDurationSec` on the call
  record; ordering rules unchanged (receipt-order, sticky terminal state).
- **Reconciliation** (`reconciliation.ts`): pure classifier
  (stale-in-progress ≥ 30 min quiet; missing report ≥ 10 min past terminal)
  plus a sweep that only writes deduplicated `voice_issues` rows. Interval
  wiring is inert unless `VOICE_RECONCILIATION_ENABLED="true"`.
- **voice_issues writers** (`voiceIssueService.ts`): first readers/writers
  for the dormant table — open (deduped on firm+code+dedupeKey over
  unresolved rows, occurrence-counted), resolve, list. Auth failures and
  unknown assistants remain log-only: issues are firm-scoped by schema.
- **Route hardening**: policy auth; store failures answer 500 (provider
  retries) and open a `webhook_store_failed` issue.
- **Server-URL representation** (`serverConfig.ts` + provider plumb):
  `VOICE_WEBHOOK_ATTACH_ENABLED="true"` + validated `VOICE_SERVER_URL`
  (https, no query/fragment/userinfo) + `VAPI_WEBHOOK_SECRET` (≥16 chars —
  the same secret the receiver verifies, so sender and receiver cannot
  drift). Loaded pre-claim in publish/sync exactly like catalog and policy;
  disabled ⇒ no `server` object is sent and payload hashes are unchanged.
  Enabling shifts the payload hash by design: the next sync PATCHes the
  attachment (that PATCH is the owner-gated activation step, not this phase).

Explicitly NOT done here: configuring anything at Vapi; enabling any flag
anywhere; tool-calls handling (P3); metering (P7).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Fabricated events via the no-freshness bearer path | Bearer disabled by default; enabling requires an explicit env flag documented as staging-only; HMAC binds a ±300 s timestamp |
| Replay of captured requests | HMAC timestamp bound + idempotent `(provider, eventKey)` ledger (a replay is a no-op insert) |
| Secret rotation downtime or a sender/receiver secret split | Overlap rotation (`_PREVIOUS`) on the receiver; the assistant payload uses the same `VAPI_WEBHOOK_SECRET`, so one env var rotates both sides together |
| Tenant confusion from attacker-supplied identifiers | Firm resolved only via `voice_assistants.provider_assistant_id`; unknown ⇒ acknowledged and dropped |
| Issue-table flooding | Dedupe on (firm, code, dedupeKey) over unresolved issues with occurrence counting |
| Sweep amplifying an outage | Non-overlapping interval, look-back bounded (48 h), writes only issues, `unref()`ed timer, disabled by default |
| Server-URL misconfiguration reaching the provider | Fail-closed pre-claim validation; https-only; no query/userinfo; never echoes values in errors |
| Secret leakage via logs/errors | Reasons/modes are enum labels; SERVER_CONFIG_INVALID messages name variables and rules, never values; hash is one-way |

## Tests

`webhookLifecycle.test.ts` (vitest): policy matrix incl. rotation and the
HMAC-attempt-is-judged-on-HMAC rule; parser boundary extraction (positive +
poisoned); event-key redelivery vs content-update; fold lifecycle,
missing-report and no-regression cases; reconciliation classifier branches;
sweep with injected fakes (scoping, counts, dedupe accounting); server-config
loader matrix (7 invalid shapes, value-echo redaction assertions); Vapi
validator + request-body emission; hash sensitivity. Existing suites
(mapper/publish/sync/capability) must pass unchanged — `server` is omitted
everywhere unless explicitly supplied.

## Exit criteria

- CI green (both jobs) on this branch; no existing test modified to pass.
- No live capability enabled; grep-provable: no code path reads the new env
  flags at import time.

## Rollback

Additive modules + threaded optional parameter; revert the PR. No schema
change, no data migration, no provider state.
