# P7 — Outcomes, metering, and alerts

Objective: the platform can account for itself — every call is metered
into an immutable ledger, staff have a review lifecycle over calls, cap
breaches become recorded pause REQUESTS (never automatic action),
critical issues can notify an operator, a daily digest summarizes each
firm, and the process exposes readiness and token-gated metrics. All
delivery paths inert by default.

## Scope

- **Migration** (voice journal, `0005_shiny_supernaut` + rollback):
  `voice_call_reviews` (one row per (firm, provider, call); no row =
  pending; state CHECK reviewed/flagged; note ≤500),
  `voice_usage_ledger` (IMMUTABLE: one row per (provider, call_id) via
  unique index; duration CHECK 0–86400; source CHECK end_of_call_report/
  reconciliation; period shape CHECK; updated_at exists to satisfy the
  blanket voice-table rule and is never touched),
  `voice_usage_cap_states` (unique (firm, period); state CHECK
  pause_requested/cleared). Rollback refuses while the ledger is
  non-empty (billing evidence) or any cap state is undecided.
- **usageService**: `computePeriodYm` (UTC), `loadUsageCapMinutesFromEnv`
  (`VOICE_USAGE_INCLUDED_MINUTES` — null when unset = metering-only;
  throws on malformed: a cap the operator believes exists must never
  silently not exist), idempotent `recordCallUsage` (impossible durations
  refused before any write; duplicates collapse), `aggregateUsageForPeriod`,
  `checkAndRecordUsageCap` (first breach per (firm, period) inserts
  pause_requested + opens critical issue `usage_pause_requested`; an
  existing row — requested or operator-cleared — suppresses re-detection;
  NOTHING pauses anything: owner-gated hard stop), `runUsageBackfillOnce`
  + `startUsageBackfillSweep` (metering backfill rides
  `VOICE_RECONCILIATION_ENABLED` — backfill IS reconciliation).
- **Webhook hook**: end-of-call-report with a provider duration meters the
  call (arrival-time period; idempotent so redelivery is a no-op) and
  evaluates the cap — best-effort, never turning a stored event into a
  provider retry loop.
- **Alerts** (`alertTransport.ts`): `VOICE_ALERTS_ENABLED` ("true" exact,
  default off) + `RESEND_API_KEY`/`VOICE_ALERTS_FROM`/`VOICE_ALERTS_TO`;
  enabled-but-malformed throws. Pinned `https://api.resend.com/emails`
  (no SDK — one POST; a dependency would widen the supply chain for
  nothing). Disabled transport refuses locally with zero network surface.
  Failures map to status-only reasons; response bodies never propagate.
  `openVoiceIssue` fire-and-forgets `notifyCriticalIssue` for critical
  issues (`void import(...)` — provider latency can never block a webhook
  response). Alert text carries firm id + code + our own message; never
  transcripts, caller numbers, or provider payloads.
- **Daily digest** (`dailyDigest.ts`): per-firm counts for yesterday's UTC
  day (calls metered, minutes, issues opened/unresolved, calls awaiting
  review) rendered as counts-only text; `VOICE_DIGEST_ENABLED` gates the
  run and the 24h scheduler; sending additionally requires the alert
  transport to be enabled (two independent gates).
- **Reviews** (`reviewService.ts`): set/clear/list dispositions over the
  firm's own calls; refuses calls the firm never had (anti-probing);
  notes bounded and trimmed; clearing returns a call to pending.
- **Routes**: `receptionistMonitoring.ts` (firm-scoped issues list/resolve,
  call-review set/clear/list, usage-by-period incl. configured included
  minutes); `monitoring.ts` (`/api/readyz` db-ping readiness, public-safe
  status only; `/api/metricz` — aggregate whole-platform counters only,
  behind `VOICE_METRICS_TOKEN` with constant-time compare; unconfigured
  token = 404, never an open metrics surface).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Double-billing from webhook redelivery/backfill overlap | Unique (provider, call_id) + onConflictDoNothing — one row ever; both sources idempotent |
| Ledger tampering | No update path exists in code; rollback refuses on non-empty ledger |
| Automatic customer-affecting pause | Cap breach records a state + critical issue ONLY; pausing stays an owner-gated route action |
| Alert spam / repeated cap alarms | One cap state per (firm, period); issue dedupe on (firm, code, dedupeKey); digest failures logged not retried |
| PII in email | Renderers emit counts, codes, firm ids; no transcript/number/name fields exist in their inputs |
| Alert exfiltration to attacker-chosen hosts | Provider URL is a pinned constant, never config |
| Webhook latency amplification | Alert delivery is fire-and-forget; metering wrapped best-effort |
| Open metrics endpoint | Fail-closed: no/short token → 404; constant-time bearer compare; aggregate counters only |
| Cross-firm review probing | setCallReview refuses calls without a stored event for that firm |
| Silently-off safety config | Malformed cap/alert config throws instead of disabling |

## Tests

`voiceMonitoring.test.ts` (14 cases): period math incl. year boundary;
cap-config matrix; ledger idempotency across sources + rounding +
impossible durations + per-firm/period aggregation; cap state machine
(no-cap / at-cap / first-breach one-issue / existing-row suppression);
backfill metering + invalid-duration logging + gated sweep; alert config
matrix, disabled-transport local refusal, pinned-URL + auth-header
assertion, status-mapped failures, PII-free critical render, non-throwing
notifier; digest gating, yesterday-UTC window, counts-only render, send-
failure logging; review validation matrix + unknown-call refusal + note
trimming + clear; metrics token shape + fail-closed admission matrix.

## Exit criteria

- Workspace typecheck clean; secret scan 0 findings; `git diff --check`
  clean; CI (gates + voice-matrix) green on the PR.
- Journal contracts updated (nine migrations, 21 domain tables, 48 public
  tables); disposable-DB proofs exercise 0005 + rollback guards.
- Protected files untouched; every new capability inert by default.

## Rollback

`voice-rollback/0005_shiny_supernaut_rollback.sql`: guards above, then
drops the three tables. Additive-only relative to every earlier
migration.

## Deliberately out of scope / residual

- Sending any real alert or digest (both gates default off; no key
  exists anywhere).
- Acting on `pause_requested` (owner decision via the P6 pause route).
- Metering uses report arrival time for the period boundary (a call
  ending 23:59 metered 00:01 lands in the next period) — documented,
  acceptable at pilot scale.
- Digest sends are not idempotent across manual re-runs of the same day
  (scheduler ticks are overlap-guarded); acceptable while gated off.
