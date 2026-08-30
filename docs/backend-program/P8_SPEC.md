# P8 — Billing, entitlements, and accounts

Objective: firms have real account machinery — plan entitlements from
config, a Stripe-driven subscription lifecycle with a dunning window,
email verification, password reset, a membership roster with
invitations, an append-only audit trail, and internal diagnostics. The
protected auth/billing files are imported from, never modified; every
delivery path and billing action stays inert by default.

## Scope

- **Migration** (voice journal, `0006_dizzy_komodo` + rollback), five
  tables riding alongside the frozen intake_firms identity:
  `voice_subscriptions` (unique per firm; state CHECK active/grace/
  suspended/canceled; `grace ⇒ grace_until`; unique stripe_customer_id),
  `voice_account_tokens` (hash-only, sha256-hex CHECK; purpose CHECK;
  TTL + consumed_at), `voice_account_states` (email_verified_at),
  `voice_firm_members` (lowercase-CHECKed email; role owner/staff;
  status invited/active/revoked; unique firm+email), `voice_audit_log`
  (append-only; actor CHECK owner/system/admin; action-shape CHECK).
  Rollback refuses while any subscription is live or the audit log holds
  rows.
- **Entitlements** (`VOICE_PLAN_CATALOG_JSON` + `VOICE_DEFAULT_PLAN_CODE`):
  closed-key, bounded plan catalog (≤20 plans, unique codes), fail-closed;
  per-firm resolution subscription-plan → default-plan → none;
  `resolveIncludedMinutesForFirm` bridges to the P7 cap contract (plan
  minutes, else `VOICE_USAGE_INCLUDED_MINUTES`, else null).
- **Subscription machine** (`subscriptionState.ts`): pure transition
  table (active → grace on payment_failed with `now + VOICE_BILLING_GRACE_DAYS`
  [default 7, bounded 1–60, fail-closed]; grace → active on recovery;
  grace → suspended only past the deadline, with a critical
  `billing_suspended` issue + audit row — suspension is RECORDED, never
  enforced automatically; cancel from anywhere; reactivate only from
  canceled; everything else no_op/not_applicable). Persistence wrapper
  with guarded state updates (concurrent transitions lose cleanly),
  idempotency through the provider_webhook_events ledger
  (provider `stripe_voice`, eventKey = Stripe event id), best-effort
  effects that never undo an applied change, and an hourly grace-expiry
  sweep on the reconciliation flag.
- **Stripe webhook** (`/api/voice/billing/webhook` — separate from the
  protected checkout webhook, own `VOICE_BILLING_WEBHOOK_SECRET`, 503
  while unset): pure signature verification (t/v1 HMAC-SHA256 over
  `${t}.${rawBody}`, ±300 s, constant-time, rotation-tolerant multiple
  v1), closed event-type set, and firm resolution ONLY through the
  stored stripe_customer_id mapping — an attacker holding the secret
  still cannot attach events to arbitrary firms.
- **Account security** (`accountTokens.ts`): 32-byte tokens stored as
  sha256 only, single-use via guarded UPDATE, per-purpose TTLs (reset
  30 m, verification 24 h, invitation 7 d), one indistinguishable failure
  reason. Password reset: enumeration-proof request, delivery through
  the P7 transport (per-message `to`; disabled delivery → 503, never a
  silent lockout), completion re-hashes with bcrypt cost 12 (the
  protected signup's own cost) and revokes every session. Email
  verification marks `voice_account_states`.
- **Membership** (`membership.ts`): roster ≤10; invite → token email
  (failed delivery compensates the roster row away); acceptance derives
  the firm from the token and requires the invited email; revocation;
  all audited. Login remains single-identity — multi-user session
  issuance is a future owner-approved auth change this model plugs into.
- **Audit** (`auditLog.ts`): one shape-checked append-only writer used by
  billing transitions, resets, verification, and membership.
- **Routes**: `receptionistAccount.ts` (reset request/complete,
  verification request/confirm, members CRUD + accept, subscription
  visibility; unauthenticated endpoints behind a fixed-window per-IP
  limiter — 10/hour); `adminVoiceDiagnostics.ts` (validateToken bearer:
  per-firm diagnostics snapshot; PUT subscription mapping — the ONE way
  a firm↔Stripe link comes to exist, catalog-validated, audited, `grace`
  not settable by hand).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Forged billing events | HMAC over exact bytes, bounded freshness, constant-time compare; 503 while unconfigured |
| Event replay / Stripe retries double-transitioning | Ledger idempotency on event id + transition table no_ops + guarded concurrent updates |
| Firm takeover via webhook body identifiers | Firm resolves only through the admin-set stored mapping; unknown customers are acknowledged and dropped |
| Account enumeration | Reset requests answer identically for known/unknown; token failures share one reason |
| Token theft from the database | Hash-only storage; single-use; short TTLs |
| Reset-race / stale sessions after takeover recovery | Guarded single consume; all sessions revoked on completion |
| Invitation abuse | Token proves the firm; acceptance additionally requires the invited (lowercased) email; roster bounded; failed delivery compensated |
| Unauthenticated endpoint abuse | Fixed-window per-IP limiter on every token-consuming endpoint |
| Silent billing misconfiguration | Catalog/grace-days/default-plan loaders throw on malformed values |
| Automatic service cutoff | Suspension is a recorded state + critical issue; enforcement is an owner action |

## Tests

`voiceAccountsBilling.test.ts` (12 cases): catalog fail-closed matrix +
entitlement precedence + P7 cap bridge; grace-days config; the complete
transition table under an injected clock (dunning math, deadline
exactness, recovery, cancel/reactivate, no-ops); apply-path matrix
(unknown mapping, duplicate event, concurrency loss, effects fire,
throwing effect never undoes state); grace sweep + gated starter; Stripe
signature accept/rotation/missing/malformed/stale/mismatch/tamper;
closed event mapping + customer extraction; token single-use/purpose/
TTL/shape matrix; reset flow end-to-end (enumeration-proof, session
revocation, token death, delivery-down surfacing); verification
round-trip; membership matrix (validation, limit, duplicate,
compensated delivery, accept by token+email, wrong-email refusal);
audit shape check; limiter window behavior.

## Exit criteria

- Workspace typecheck clean; secret scan 0 findings; `git diff --check`
  clean; CI (gates + voice-matrix) green on the PR.
- Journal contracts updated (ten migrations, 26 domain tables, 53 public
  tables); disposable-DB proofs exercise 0006 + rollback guards.
- Protected files: 0-line diff vs main. Every new capability inert.

## Rollback

`voice-rollback/0006_dizzy_komodo_rollback.sql`: guards above, then
drops the five tables. Additive-only relative to every earlier
migration.

## Deliberately out of scope / residual

- Any live Stripe change (webhook creation, checkout edits, prices) —
  the secret does not exist anywhere; mapping rows are admin-set.
- Multi-user login sessions (owner-approved auth change; the roster and
  invitation lifecycle are ready for it).
- Entitlement ENFORCEMENT (routing/publish checks against plan or
  subscription state) — an activation decision; resolution APIs are
  ready.
- The in-route rate limiter is per-process memory (resets on restart) —
  defense-in-depth on top of token unguessability, documented.
