# P5 — Contacts, conversations, and voice-side SMS

Objective: callers become firm-scoped identities, bookings can confirm by
text with real consent discipline, and missed-call recovery exists as
architecture — all inert by default, with the intake pipeline's number and
credentials structurally unreachable from voice code.

## Scope

- **Migration** (voice journal, `0003_thin_lifeguard` + rollback):
  `voice_contacts` (identity = firm + E.164, CHECKed shape; soft READ-ONLY
  association to an intake conversation by number — deliberately not built
  on `intake_cases`, which is SMS-thread-anchored and carries
  legal-vertical fields the neutral core must not require),
  `voice_call_links` (call→contact, insert-once), `voice_sms_consents`
  (granted/stopped per firm+number, source-tracked), `voice_sms_outbox`
  (dedupe-keyed rows as the only path to a send; queued→sending claim;
  delivery status by provider sid). Rollback refuses while any message is
  mid-flight.
- **Contact linker**: conservative E.164 normalization (reject over guess);
  conflict-driven upsert + insert-once link, fired best-effort on
  end-of-call-report events (inherently inert until webhook activation);
  intake association is a read-only annotation and never blocks identity.
- **SMS core**: fail-closed config with a STRUCTURAL anti-reuse guard (any
  voice credential equal to its intake counterpart, or the intake number as
  the from-number, refuses to load); Twilio signature verification
  (HMAC-SHA1, canonical params, constant-time); pinned-host transport;
  carrier keyword classification (whole-word STOP/START).
- **Outbox**: consent re-checked at send time (STOP always wins);
  `FOR UPDATE SKIP LOCKED` claim so overlapping workers never double-send;
  bounded retries; booking confirmations require in-call consent (no row
  otherwise) and record consent `booking_consent`; missed-call follow-ups
  are created `blocked_no_consent` absent explicit consent — turning that
  on is an owner policy decision at activation, with no default in code.
- **Webhooks** (`/api/voice/sms/inbound`, `/status`): voice-token signature
  required; 503 while unconfigured; STOP recorded even while sending is
  disabled (compliance first), START honored only when enabled; delivery
  status updates by sid; unknown sids ignored. Tenant mapping for inbound
  consent uses `VOICE_SMS_OWNER_FIRM_ID` until P6's number inventory maps
  To→firm (documented interim).
- **Dispatcher hook**: successful bookings enqueue a confirmation
  (consent-gated in the outbox; failures never undo a booking).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Voice code driving the intake number/credentials | Structural loader refusal + source-scan test (only smsCore's inequality guards may mention INTAKE_TWILIO) |
| Forged Twilio webhooks | Signature over canonical params with the voice token, constant-time compare; 503 when unconfigured |
| Texting without consent | No send path without an outbox row; consent re-checked at send; STOP ledger wins over any stored intent |
| Double-send | Dedupe-keyed rows + SKIP LOCKED claim + at-most-one send per row |
| Identity poisoning via caller id spoofing | Identity is only (firm, number); no authorization ever derives from a contact row |
| Wrong-tenant consent updates | Interim env-pinned owner firm (single-number architecture); replaced by the P6 number inventory |
| PII sprawl | Outbox stores only the destination and the message body it will send; contact rows carry number + stated name only |

## Tests

`voiceSmsContacts.test.ts` (12 cases): normalization matrix; linker
pass-through/decline/association-failure; config fail-closed + all three
anti-reuse refusals + distinct-values acceptance; signature self-verify /
wrong-token / missing / order-independence; keyword whole-word matrix;
transport pinned-host + auth + sid parse + retryable mapping (stubbed
fetch); source-level isolation guard. Migration proven by CI's journal
suite (fresh/reverse/legacy/no-replay) as with P4.

## Exit criteria

- CI green; inventory pins updated (16 domain tables / 43 app tables /
  7 migrations) alongside the reviewed migration.
- No SMS can be sent in any environment: flag off, no credentials exist,
  and the transport is unreachable without both.

## Rollback

Revert the PR; committed rollback drops the four tables (documented consent
-ledger loss note; refuses while a message is mid-flight).
