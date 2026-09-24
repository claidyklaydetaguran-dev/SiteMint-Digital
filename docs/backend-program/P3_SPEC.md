# P3 — Tools and scheduling action loop

Objective: the assistant can ACT — check availability, book, reschedule,
cancel — through a constrained dispatcher wired to the existing
advisory-locked scheduling engine, while the provider still carries no tools
(attachment stays a disabled representation, exactly like P2's server URL).

## Scope

- **Parser/event key**: `tool-calls` server-message type; defensive
  extraction of `{id, name, arguments}` (nested OpenAI-style or flattened;
  arguments object or JSON string); batch event key = call id + sorted
  tool-call ids.
- **Closed catalog** (`toolCatalog.ts`): four tools; zod argument schemas
  (dispatcher side) + JSON-schema parameters and descriptions (provider
  side) from one source of truth. No tool accepts a URL, routing number,
  provider id, tenant id, or credential.
- **Dispatcher** (`toolDispatcher.ts`): firm id only from assistant linkage
  (route-level); per-call validation → safe spoken fallback + firm-scoped
  diagnostic issues (`tool_invalid_args`, `tool_execution_failed`); results
  are redacted (reference public id + plain language; never PII echoes).
  Booking calls the existing `submitAppointmentRequest` (advisory-locked,
  revalidating, source `ai_receptionist` — already in the schema CHECK);
  reschedule = verify old (firm-scoped) → book new preserving the old type
  and contact → cancel old, with compensation releasing the new hold if the
  old cancel fails. Availability is spoken in the business timezone with
  exact ISO slot values for the follow-up booking call.
- **Idempotent replay** (route + ledger): a tool-calls delivery is stored in
  `provider_webhook_events`; execution results are merged back onto the row
  (`siteMintToolResults`); a redelivered batch is answered from storage so a
  mutating tool never runs twice for one toolCallId. A stored-but-resultless
  row (crash between store and respond) executes normally on redelivery.
- **Tools attachment (disabled)** (`toolsConfig.ts` + provider plumb):
  `VOICE_TOOLS_ATTACH_ENABLED="true"` emits the closed catalog with per-tool
  `server{url,secret}`; requires the P2 server attachment, else
  `TOOLS_CONFIG_INVALID` pre-claim. The Vapi validator enforces: catalog
  names only, ≤8 tools, `server` present, https, no unknown keys.
- **Dependency note**: `zod` added to api-server via the existing workspace
  catalog entry (`catalog:` → ^3.25.76, the same version lib/db already
  uses through drizzle-zod); no new external dependency version enters the
  tree. Lockfile gains only the importer entry.

Explicitly NOT done: creating live Vapi tools; enabling any flag; contact
creation (P5); calendar writes (P4); SMS (P5).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Model-supplied tenant/routing/credential data | Closed catalog; strict zod; firm id from assistant linkage only; no tool argument can address a tenant or destination |
| Prompt-injected foreign tool names | Dispatcher refuses non-catalog names before any collaborator runs; provider-side validator refuses non-catalog names in payloads |
| Double execution on provider retry | Ledger-keyed replay of stored results; booking is additionally slot-serialized by the advisory lock |
| Double-booking race | Unchanged: `pg_advisory_xact_lock(firmId, slot)` + in-lock revalidation (the dispatcher adds no second booking path) |
| PII leakage via tool results | Results carry reference ids and plain language only; explicit no-echo assertions in tests |
| Lost appointment on reschedule failure | Create-new-first ordering + compensation cancel; worst case is a released hold, never a vanished booking |
| Oversized/malformed batches | Parser drops unidentified calls; validator bounds the catalog at 8; arguments size-bounded by zod string maxima |

## Tests

`toolDispatcher.test.ts` (18 cases): extraction shapes incl. JSON-string
arguments and malformed drops; batch key stability/distinctness; unknown
tool refusal with zero collaborator calls; invalid-args issue + safe answer;
timezone-correct availability with ISO slot values; booking pass-through +
PII no-echo; lost-race mapping; cancel found/missing; reschedule
type/contact preservation + old-cancel; compensation path; executor-throw →
safe line + error issue; attachment flag matrix; catalog emission shape;
validator acceptance into the request body; validator rejection matrix.

## Exit criteria

- CI green (both jobs); aggregate suite grows by this file only.
- No live capability enabled; provider payloads byte-identical unless both
  attachment flags are deliberately set.

## Rollback

Revert the PR. No schema change (`ai_receptionist` source and the ledger
already existed); stored `siteMintToolResults` keys are inert data.
