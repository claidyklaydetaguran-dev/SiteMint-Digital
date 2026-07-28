# SiteMint Voice Platform — Vapi + Twilio Development Integration

> Referenced by DECISION_LOG.md (2026-07-17, "Vapi webhook authentication
> mechanism selected") as the place the confirmed header names/algorithm/
> payload format would be recorded. This is that document, plus the rest of
> the Milestone 2 (phone numbers + call ingestion) foundation added on top of
> Milestone 1's assistant CRUD/browser-test work.

## Architecture and call flow

Twilio owns the phone number. Once that number is imported into Vapi as a
BYO (bring-your-own) number, **Vapi owns the call** — Twilio never calls
this application directly for voice. Vapi is the sole party that calls back
to SiteMint, and the sole source of truth for call ids and lifecycle status.

```
Caller → Twilio number → Vapi assistant → Vapi Server Message webhook
       → SiteMint (signature-verified, firm-resolved, idempotent store)
       → dashboard (Call Logs, call detail, transcript, extracted info)
```

This matches Vapi's documented "Server URL" mechanism (docs.vapi.ai/server-url)
and the "import a Twilio number" BYO-number flow — there is no unsupported
Twilio→SiteMint voice bridge in this design; SiteMint never receives a raw
Twilio voice webhook.

## Environment variables (Development)

| Variable | Purpose |
|---|---|
| `VAPI_API_KEY` | Server-side Vapi API key. Never sent to the browser. Not required for webhook receipt/processing — only for assistant publish (existing Milestone 1 code). |
| `VAPI_WEBHOOK_SECRET` | Shared HMAC secret for the Custom Credential below. Required — the webhook route rejects every request when this is unset, in every environment, with no development bypass. |
| `VITE_VAPI_PUBLIC_KEY` | Browser-safe public key for the existing browser test-call feature (Milestone 1). Unrelated to webhook auth. |

## Vapi Custom Credential setup (owner action, in the Vapi dashboard)

1. Create an **HMAC** Custom Credential.
2. Secret Key: the same value as `VAPI_WEBHOOK_SECRET`.
3. Hash Algorithm: **SHA-256**.
4. Signature Header: `x-vapi-signature` (hex-encoded HMAC digest).
5. Timestamp Header: `x-vapi-timestamp` (Unix seconds) — enabled, for replay protection.
6. Signed payload: `${timestamp}.${raw request body}` (this application computes and expects exactly this construction — see `lib/voice/webhooks/vapiWebhookAuth.ts`).
7. Attach the credential to the assistant's (or phone number's) `server.credentialId`.
8. Server URL: `https://<domain>/api/voice/webhooks/vapi`.

Requests older or newer than 300 seconds relative to the server clock are
rejected (`timestamp_out_of_range`), independent of signature validity.

## Webhook endpoint

`POST /api/voice/webhooks/vapi` (`artifacts/api-server/src/routes/receptionistVoiceWebhook.ts`)

- Raw body captured in `app.ts` before `express.json()` runs (same pattern as
  the existing Stripe/Resend/receptionist-billing webhooks).
- Rejects (401/503) on any signature, timestamp, or configuration failure —
  never echoes the specific failure reason to the caller.
- Parses the Vapi Server Message envelope (`{ message: { type, call, ... } }`)
  defensively — unrecognized `type` values are rejected (400), never
  silently accepted as a fabricated event.
- Resolves the owning firm **only** from this application's own
  `voice_assistants` row (`provider = 'vapi'`, matching `providerAssistantId`)
  — an event for an assistant this application doesn't know about is
  acknowledged (200, so Vapi doesn't retry indefinitely) but never stored.
- Stores every event as its own row in the existing `provider_webhook_events`
  ledger, keyed by `(provider, eventKey)` with `onConflictDoNothing` — a
  redelivered event is a silent no-op, never a duplicate call record.

No new table and no migration were added. The event ledger
(`provider_webhook_events`, already migrated in Milestone 1 Checkpoint C) is
the single source of raw event data; a call's current state, transcript, and
extracted information are derived at **read time** by folding that firm's
events for one call id (`lib/voice/webhooks/callStateModel.ts`).

## Read endpoints (authenticated, firm-scoped)

- `GET /api/receptionist/voice/calls` — list, most recently active first.
- `GET /api/receptionist/voice/calls/:callId` — detail (transcript, summary,
  extracted analysis, appointment/follow-up wording).
- `GET /api/receptionist/voice/provider-status` — `{ vapiApiKeyConfigured,
  vapiWebhookSecretConfigured, vapiPublicKeyConfigured,
  developmentPhoneNumberVerified }` — presence-only booleans, never a value,
  length, prefix, or suffix of any credential.

`firmId` always comes from the authenticated session (`req.firmId`) — never
from a route parameter, query string, or request body.

## Call state model

Internal states: `queued`, `ringing`, `connecting`, `in_progress`,
`completed`, `failed`, `no_answer`, `busy`, `canceled`, `provider_error`.
`status: "ended"` alone is never enough to say "completed" — the mapping
reads Vapi's `endedReason` to distinguish a normal hangup from no-answer,
busy, a cancellation, or a provider-side failure. Once a call reaches a
terminal state, a later out-of-order non-terminal `status-update` cannot
regress it (real Vapi retries/reordering are handled this way, verified in
`lib/voice/webhooks/callStateModel.test.ts`).

Every real-call record carries `source: "vapi_twilio"` — this field cannot
be set to anything else by any code path, so a real call can never render as
Demo Mode and vice versa. Demo Mode's fixture data
(`artifacts/helpdesk/src/lib/demoCallLog.ts`) is a frontend-only constant
array; it never touches this backend, the database, or these endpoints.

## Demo Mode

Unchanged and fully isolated: `artifacts/helpdesk/src/pages/CallLogs.tsx` and
`CallLogDetail.tsx` render a "Demo Mode" section from the static fixture
data alongside (never merged into) a "Real calls — Vapi + Twilio" section
sourced from the endpoints above. Demo ids (`demo-1`, etc.) are checked
first and never collide with a real Vapi call id.

## Local Development testing (no live provider required)

Every pure-logic piece (signature verification, message parsing, event-key
derivation, state folding) has automated Vitest unit tests requiring no
database or network access — see `artifacts/api-server/src/lib/voice/webhooks/*.test.ts`.

To exercise the full route against a local Development database:

1. `pnpm --filter @workspace/db run migrate:voice` against a local Postgres
   (never Production) — creates `voice_assistants` / `provider_webhook_events`
   / `voice_issues` if not already present.
2. Insert one `voice_assistants` row with `provider = 'vapi'` and a
   `provider_assistant_id` of your choosing, tied to a firm you control.
3. Run the api-server locally with `VAPI_WEBHOOK_SECRET` set to any local
   test value (never a real Vapi secret).
4. POST a JSON body shaped like `{ "message": { "type": "status-update", ... } }`
   to `/api/voice/webhooks/vapi` with `x-vapi-signature` /
   `x-vapi-timestamp` headers computed exactly as in step 6 of the Custom
   Credential setup above.
5. `GET /api/receptionist/voice/calls` (with a valid receptionist session
   cookie) to confirm the event was folded into a call record.

This is exactly how this checkpoint was verified locally — no real Vapi or
Twilio credentials exist in this environment.

## Real Development call verification checklist (owner-gated)

A real inbound Development call additionally requires, in this order:

1. A Vapi Development account with `VAPI_API_KEY` set.
2. `VAPI_WEBHOOK_SECRET` set and the Custom Credential configured as above.
3. A Twilio Development phone number, imported into Vapi as a BYO number —
   **do not purchase or import a number without explicit owner approval**;
   Twilio numbers are a billed resource.
4. A publicly reachable Development callback URL for the webhook route (a
   tunnel such as ngrok/Cloudflare Tunnel, or a deployed Development
   environment) — Vapi cannot reach `localhost`.
5. A published (not draft) voice assistant, connected to that number.

Until all five are true and a real inbound call has actually been completed
and its events observed in Call Logs, the dashboard must say **"Real voice
integration configured but not yet verified"** — never "Live" or
"Connected."

## Troubleshooting

- **401 on every webhook delivery**: `VAPI_WEBHOOK_SECRET` mismatch, or the
  Custom Credential's payload format doesn't match `${timestamp}.${body}`.
- **503 on every webhook delivery**: `VAPI_WEBHOOK_SECRET` is unset in this
  environment.
- **200 but the call never appears in Call Logs**: the event's
  `call.assistantId` doesn't match any `voice_assistants.provider_assistant_id`
  for `provider = 'vapi'` — check `req.log` output (`event for an assistant
  not known to this application`), never the raw payload in a shared log
  sink.
- **A call is stuck at a non-terminal state**: Vapi has not yet sent an
  `end-of-call-report` or a terminal `status-update` — this is expected
  while a call is genuinely still in progress.

## Provider-dependent limitations (this checkpoint)

- No real inbound Development call has been completed in this environment —
  no Vapi or Twilio Development credentials exist here (verified: env var
  names checked for presence only, values never printed).
- `developmentPhoneNumberVerified` is hardcoded `false` — no code path
  today calls the Vapi API to confirm a number is actually imported and
  routed; that would need to be added once real credentials exist, and
  always reported honestly rather than inferred.
