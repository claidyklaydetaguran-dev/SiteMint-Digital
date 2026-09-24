# P6 — Numbers, inbound routing, transfers, and call policy

Objective: a phone number becomes a first-class, firm-scoped asset with a
strict lifecycle; inbound calls resolve to the right assistant from OUR
inventory (never from anything a provider or client asserts); in-call
escalation transfers only to pre-approved stored destinations under a
business-hours guard; call behavior is a server-owned policy; emergency
language in a transcript is flagged for a human. All inert by default: no
acquisition path exists (the provider seam is owner-gated and throws), and
every new webhook behavior only fires once the provider is wired to a
number — a later, owner-approved activation.

## Scope

- **Migration** (voice journal, `0004_lying_jamie_braddock` + rollback):
  `voice_numbers` — lifecycle inventory → assigned → paused ⇄ assigned →
  released, all CHECK-enforced: state enum;
  `(state='inventory') = (firm_id IS NULL)` (the one deliberate divergence
  from the blanket firm_id NOT NULL rule — inventory is platform stock,
  and the biconditional means a row can never be simultaneously unowned
  and live); `assigned ⇒ assistant`; E.164 shape; globally unique phone
  and provider-number ids; partial unique one-assigned-per-firm.
  `voice_transfer_destinations` — label, E.164, priority, active,
  business_hours_only; unique firm+number; MAX enforced at the route.
  Rollback refuses while any number is assigned or paused (dropping the
  inventory under live routing would break callers silently).
- **numberService**: the complete legal transition table (`canTransition`
  — anything absent refused); the owner-gated `PhoneNumberProvider` seam
  (production factory always throws "owner-gated" — purchasing, importing,
  or releasing at Twilio/Vapi is a program hard stop; a deterministic fake
  for tests and future staging drills); `resolveAssistantForNumber` — the
  assistant-request answer, routing only an `assigned` number with a
  provider-linked assistant and refusing unknown/paused/unassigned/
  unlinked with distinct reasons; `resolveTransferDestination` —
  lowest-priority active destination whose hours policy admits now, hours
  computed from the firm's own scheduling timezone/config;
  `resolveFirmIdForInboundSmsNumber` — the P5-documented replacement for
  the interim `VOICE_SMS_OWNER_FIRM_ID` inbound-SMS tenant mapping (env
  pin demoted to documented pre-inventory fallback);
  `scanEmergencyLanguage` — a conservative regex flag, never handling
  logic.
- **Call policy** (`VOICE_CALL_POLICY_JSON`): same contract family as
  artifact policy / server / tools — one env value, fail-closed, closed
  key set, bounded ranges (silence 10–600 s, max duration 60–7200 s,
  spoken lines ≤300 chars, ≥1 field when present), null when absent so
  payloads stay byte-identical to today. Threaded through publish + sync
  step-1 config loading (any load failure → `*_disabled` before the
  assistant row is claimed) and mapped by the Vapi mapper into the four
  first-class request fields (`silenceTimeoutSeconds`,
  `maxDurationSeconds`, `endCallMessage`, `voicemailMessage`) — never a
  nested object on the wire.
- **Webhook branches**: `assistant-request` answered BEFORE assistant
  attribution (the whole point is naming the assistant): tenant identity
  comes solely from our `voice_numbers` row for the provider
  `phoneNumberId`; the provider assistant id is returned to the PROVIDER
  only; every unroutable case is a spoken outcome (`paused` →
  "temporarily unavailable", otherwise "not in service").
  `transfer-destination-request` answered from the approved-destination
  list with the hours guard; after-hours / no-destination / errors are
  spoken take-a-message outcomes, never dropped calls. End-of-call
  transcripts get the emergency scan → dedupe-keyed critical voice_issue.
- **Routes** (`receptionistNumbers.ts`): firm-scoped number list (DTO
  deliberately omits `providerNumberId` — provider identifiers never
  reach a client), assign (requires the firm's assistant to be published
  AND provider-linked), pause/unpause (unpause requires the assistant
  link), all transitions guarded by `canTransition` plus an optimistic
  `WHERE old-state` update; transfer-destination CRUD (≤10 rows,
  validated E.164, 1–80-char labels, conflict → 409).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Cross-tenant routing via forged/unknown `phoneNumberId` | Resolution ONLY against our inventory; unknown ids get a spoken not-in-service; firm attribution derives from the matched row, never the payload |
| Model- or config-driven transfer to arbitrary numbers | Destinations only from the stored approved list (tools/policy never carry a number); closed callPolicy key set |
| Half-configured numbers answering calls | Only `assigned` + provider-linked routes; paused/inventory refuse with distinct spoken outcomes; DB CHECKs make the states real |
| Code acquiring/releasing real numbers | Production `PhoneNumberProvider` throws until an owner-gated activation replaces it; the fake is injection-only |
| Provider id leakage to browsers | `numberDto` omits provider ids; the assistant-request answer goes to the provider, not a client |
| State corruption under concurrent operators | `canTransition` + optimistic `WHERE old-state` update + CHECK constraints + partial unique one-assigned-per-firm |
| Consent updates through a number a firm no longer operates | Inbound-SMS mapping only matches assigned/paused rows; released/inventory map to nobody; env pin is an explicit fallback |
| Emergency calls going unnoticed | Transcript scan opens a dedupe-keyed critical issue for operator attention (the assistant prompt owns the in-call 911 instruction) |

## Tests

`numberService.test.ts` (11 cases): exhaustive 4×4 transition matrix;
owner-gated seam refusal + fake recording; routing matrix
(ok / unknown / paused / not-assigned / unlinked); transfer matrix
(priority pick, after-hours skip with always-on winner, after_hours,
no_destinations); call-policy loader fail-closed matrix, the valid-policy
flow through the Vapi validator into first-class body fields (and the
assertion that no nested `callPolicy` survives on the wire), unknown-key
refusal at the validator; inbound-SMS tenant mapping; emergency-scan
positives and lookalike negatives; parse + event-key for the two new
message types; and a deterministic failure matrix binding each resolution
failure to the exact spoken outcome the webhook returns.

## Exit criteria

- Workspace typecheck clean; secret scan 0 findings; `git diff --check`
  clean; CI (gates + voice-matrix) green on the PR.
- Journal contract tests updated for the new migration (eight recorded
  migrations, eighteen domain tables, 45 public tables) with derived
  proofs where the repo pattern allows.
- No provider SDK/URL/credential surface touched; every new capability
  inert without owner-gated activation; protected intake/SMS files
  untouched.

## Rollback

`voice-rollback/0004_lying_jamie_braddock_rollback.sql`: refuses while any
`voice_numbers` row is assigned or paused, then drops the two tables and
their indexes. Additive-only relative to every earlier migration.

## Deliberately out of scope

- Live number acquisition, import, porting, or release — owner-gated hard
  stop; the seam is the entire prepared surface.
- Wiring the provider's number webhooks — activation work, not code.
