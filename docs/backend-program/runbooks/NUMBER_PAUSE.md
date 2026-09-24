# Runbook — pausing a firm's voice number

The controlled way to stop a firm's calls being answered, and what each
layer actually does. Pausing is ALWAYS a human action — the system only
ever records a request (`voice_usage_cap_states.pause_requested`,
subscription `suspended`, or a critical issue).

## Layer 1 — application pause (reversible, seconds)

```
POST /api/receptionist/voice/numbers/:id/pause   { "reason": "..." }
```

(firm session, or walk the owner through the dashboard once UI exists).
Effect: the number's state becomes `paused`; the `assistant-request`
webhook answers every inbound call on it with the spoken
"temporarily unavailable" line and routes to no assistant. The DB CHECK
keeps the assistant link intact for unpausing:

```
POST /api/receptionist/voice/numbers/:id/unpause
```

Verify: `GET /api/receptionist/voice/numbers` shows `paused`, and (admin)
`GET /api/admin/voice/firms/:id/diagnostics` reflects it.

## Layer 2 — provider-side detach (owner action at Vapi)

If the application layer cannot be trusted during an incident (e.g. the
webhook is the thing misbehaving), the owner detaches the number from
the assistant in the Vapi console. Owner-gated; record it in an audit
row via the admin API afterwards.

## Layer 3 — carrier (owner action at Twilio)

Last resort for a BYO number: suspend at Twilio. NEVER touch the intake
SMS number or its Messaging webhook (binding rule — the intake number
must never be imported into Vapi or have Vapi SMS management enabled).

## When a pause_requested state exists

`voice_usage_cap_states.state = 'pause_requested'` (cap breach) or a
subscription in `suspended` (dunning expiry) is a REQUEST sitting in
front of you, with a critical issue attached. Decide:

- pause (layer 1) and tell the customer, or
- clear the state (operator judgment — e.g. payment recovered out of
  band) and resolve the issue via
  `POST /api/receptionist/voice/issues/:id/resolve`.

Suppression note: one cap state exists per (firm, period) — clearing it
means no re-alert this period. That is deliberate (an operator decided).
