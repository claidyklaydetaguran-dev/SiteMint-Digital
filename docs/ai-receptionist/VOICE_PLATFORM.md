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

### Bearer secret fallback (the mechanism the first genuine Development call used)

Vapi also supports a simpler assistant/phone-number-level `server.secret`
(the documented Bearer fallback): Vapi sends the raw secret value verbatim in
the `x-vapi-secret` header, with no timestamp/replay protection. The route
tries HMAC first and falls back to this Bearer check only when the HMAC
headers are entirely absent (`lib/voice/webhooks/vapiWebhookAuth.ts`,
`verifyVapiWebhookBearerSecret`) — both mechanisms read the same
`VAPI_WEBHOOK_SECRET` value, compared in constant time. Prefer the HMAC
Custom Credential for new setups; the Bearer fallback exists because it's
the simpler mechanism to configure directly on an assistant/number without
first creating a Custom Credential.

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

## Structured call outcomes (Milestone 2, structured-analysis pass)

### Provider mechanism

Verified against current Vapi docs (docs.vapi.ai/assistants/call-analysis,
2026-07): the assistant's `analysisPlan.structuredDataSchema` (a JSON Schema)
plus `analysisPlan.structuredDataPrompt` produce `call.analysis.structuredData`;
`analysisPlan.summaryPrompt` produces `call.analysis.summary`. Vapi's own docs
note analysis "is triggered in the background and typically completes within
a few seconds" — it is **not guaranteed to be present on the first
`end-of-call-report` delivery** and may arrive on a second, later delivery of
the same message type once analysis finishes. `eventKey.ts` keys
`end-of-call-report` on a content hash (not just call id + type) specifically
so that second, analysis-bearing delivery is stored as its own event instead
of being deduped away as a "duplicate" of the first — a byte-identical retry
still collapses to one row.

### Application-facing contract

`lib/voice/webhooks/structuredOutcome.ts` defines one centralized, versioned
(`schemaVersion: "1.0"`) shape every genuine call's analysis is normalized
into — deliberately independent of whatever Vapi's own `structuredDataSchema`
happens to be, so the provider-side schema can evolve without breaking this
contract:

```
{
  schemaVersion: "1.0",
  caller: { name, phoneAvailable, email, companyOrBusiness },
  inquiry: { reason, serviceInterest[], businessType, pricingQuestion, urgency },
  appointmentRequest: { requested, preferredDateText, preferredTimeText, timezone, status },
  followUp: { requested, phoneConsent, smsConsent, emailConsent, status },
  disposition: { outcome, summary },
}
```

`parseStructuredOutcome()` treats every field as untrusted: bounded string
lengths (200/1000 chars), a bounded array size (10 items) for
`serviceInterest`, enum validation with a null-safe fallback (an unrecognized
`urgency` or `disposition.outcome` value degrades to `null`/`"unresolved"`
rather than invalidating the whole record), and unknown fields are stripped
by construction (only known keys are ever read off the raw payload).

### Availability states

Every real-call record carries `analysisAvailability`:

- **`available`** — valid structured data was present and normalized.
- **`unavailable`** — no structured data was supplied at all. This is the
  state for every call made before `analysisPlan` was configured, and for any
  `end-of-call-report` that simply didn't include one.
- **`invalid`** (internal/diagnostic only) — structured data was present but
  failed validation (e.g. `structuredData` itself wasn't an object). The
  public API and every UI surface collapse this into `unavailable` — a reader
  never sees a difference between "never attempted" and "attempted but
  broken," per the requirement that missing/invalid analysis must never be
  displayed as a negative result ("No appointment requested").

Once a call's `analysisAvailability` reaches `available`, it is never
regressed back to `unavailable`/`invalid` by a later stale or duplicate
event — see `foldEventsIntoCallRecord` in `callStateModel.ts`.

### Requested vs. Pending review vs. Booked

Three distinct, never-conflated states:

- **Requested** — the caller expressed interest in an appointment
  (`appointmentRequest.requested: true`).
- **Pending review** (`appointmentRequest.status`) — SiteMint has captured
  the request; a person or later workflow must review it. This is the only
  non-`not_requested` status this contract can produce.
- **Booked** — a calendar provider has confirmed an actual calendar event.
  **No code path in this checkpoint can ever produce this state** — there is
  no calendar integration. The UI always pairs "Pending review" with an
  explicit "Not booked" badge so the two are never visually or semantically
  conflated.

### Consent is channel-specific and never inferred

`followUp.phoneConsent` / `smsConsent` / `emailConsent` are three independent
booleans. `safeBooleanDefaultFalse()` is the single choke point that enforces
this: only an explicit provider-supplied boolean `true` counts as consent —
a phone number being present, an appointment being requested, or an email
address being mentioned in the transcript are never treated as consent for
any channel. The UI's "Delivery state" always reads "No message sent" in
this checkpoint — no SMS, email, or calendar-invite send path exists yet.

### Historical calls

A call made before `analysisPlan` was configured (or whose analysis simply
never arrived) has no `analysis` field on any of its stored events at all.
`parseStructuredOutcome(undefined)` returns `unavailable` for exactly this
reason — the UI shows "Structured analysis unavailable for this call" rather
than fabricating a result or displaying a false negative. **No historical
call's stored events are ever rewritten** to backfill a structured outcome —
if Vapi's API offers a genuine read-only reprocessing/retrieval endpoint for
a completed call's analysis in the future, that would arrive as a new,
authentic webhook-shaped event through the normal path, never a manual
database edit.

### What still requires further integration

- Calendar: no booking integration exists; every appointment request stays
  "Pending review — Not booked" indefinitely under this contract.
- SMS / email: no send path exists; `followUp.status` and the UI both always
  read as unsent regardless of consent.
- Transfer: not implemented; `disposition.outcome` can record that a
  transfer was requested via free-text `summary`, but nothing acts on it.
- CRM handoff: not implemented — a "Pending review" appointment request is
  not currently surfaced to any CRM/contacts table.

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

## Provider-dependent limitations (as of the structured-outcomes pass)

- A first genuine inbound Development call was completed and verified
  end-to-end (Twilio → Vapi → this webhook, `x-vapi-secret` Bearer auth)
  from a session with access to the Replit Development runtime and secrets —
  that session's environment is not this one; see below.
- This checkpoint's code changes (the structured-outcome contract,
  validation, UI) were built and verified from a Claude Code Remote sandbox
  with **no** Vapi/Twilio Development credentials, no Replit runtime, and no
  public ingress — verified: every relevant env var name checked for
  presence only (all reported missing), no Replit-specific environment
  variables present, no inbound tunnel available. All verification here is
  therefore sanitized-fixture verification (signed synthetic webhook
  payloads against a local Postgres + a local api-server instance), not a
  genuine provider call — see the commit for this checkpoint for exactly
  which scenarios were exercised this way.
- The assistant's live `analysisPlan` (Vapi dashboard configuration) has not
  been confirmed read-back by this checkpoint — that requires the Vapi
  Development API key, which isn't available here. Until it is, real calls
  will keep landing as `analysisAvailability: "unavailable"` even though the
  application-side contract and UI are ready to display a populated result
  the moment the assistant is configured and a call supplies one.
- `developmentPhoneNumberVerified` is still hardcoded `false` — unchanged
  from Milestone 2 foundation, for the same reason (no code path calls the
  Vapi API to confirm a number import).
