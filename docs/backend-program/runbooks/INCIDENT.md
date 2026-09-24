# Runbook — incident response

## Severity

| Sev | Definition | Examples |
| --- | --- | --- |
| 1 | Callers harmed or SMS compliance at risk | emergency flag unreviewed; STOP not honored; intake number misrouted |
| 2 | Calls not answered / not recorded | assistant-request failing; webhook 500 loop; readyz down |
| 3 | Degraded internals, callers fine | sweeps failing; digest down; calendar revoked |
| 4 | Cosmetic / single-firm config | one firm's transfer list empty after hours |

## First five minutes

1. `GET /api/healthz`, `GET /api/readyz`, `GET /api/metricz` (bearer) —
   is it the process, the database, or a feature?
2. Boot logs: any `[env contract]` error lines? A recent deploy with a
   mis-set flag looks exactly like a feature outage.
3. `GET /api/admin/voice/firms/:id/diagnostics` for the affected firm.
4. Open issues are the system's own account of what went wrong:
   `GET /api/receptionist/voice/issues` (firm session).

## Critical-issue codes → first response

| Code | First response |
| --- | --- |
| `emergency_language_detected` | Sev 1. A human reads the flagged call NOW (call id in the issue context) and follows up with the caller/firm. Resolve only after human review. |
| `usage_pause_requested` | Decide pause-or-clear (see NUMBER_PAUSE.md). Not urgent to callers. |
| `billing_suspended` | Same decision, billing flavored; check the subscription row and Stripe (owner) before pausing anyone. |
| `webhook_store_failed` | The provider is retrying (500 path). Check `readyz`/db. Events are idempotent — recovery is automatic once storage returns. |
| `call_stale_in_progress` / `call_missing_report` | Reconciliation found holes; usually provider-side delivery. Compare with the provider dashboard (owner). |
| `calendar_revoked` | The firm reconnects via the calendar connect flow; availability falls back to workspace defaults meanwhile. |
| `tool_invalid_args` / `tool_execution_failed` | Recurring = prompt/schema drift; single = transient. Occurrences count is on the issue. |

## Containment principles

- Prefer the smallest reversible action: pause ONE number (layer 1)
  before touching flags; turn ONE flag off before stopping the process.
- Turning a `VOICE_*_ENABLED` flag off is always safe: every consumer
  fails closed to its disabled behavior.
- Never "fix" by editing applied migrations, provider config without the
  owner, or the intake SMS pipeline (protected, Sev 1 if touched).

## Afterwards

Resolve the issues you acted on (occurrence counts reset by design when
a resolved condition recurs — recurrence is signal). Write the audit
trail: admin actions through the admin APIs land in `voice_audit_log`
automatically; note anything manual in the incident record.
