# Runbook — secret rotation

Per-secret procedures. General rules: rotate one secret at a time;
verify after each; secrets never appear on command lines or in logs
(the tooling decomposes URLs into PG* env vars for exactly this reason).

## VAPI_WEBHOOK_SECRET (zero-miss rotation — built for this)

1. Set `VAPI_WEBHOOK_SECRET_PREVIOUS` = current secret.
2. Set `VAPI_WEBHOOK_SECRET` = new secret. Deploy/restart.
3. Update the secret on the Vapi side (owner action — provider config
   changes are owner-gated).
4. Both secrets verify during the overlap (the previous secret is tried
   only on signature mismatch). Watch webhook logs for `authMode:
   hmac_previous` disappearing.
5. Remove `VAPI_WEBHOOK_SECRET_PREVIOUS`. Done.

## VOICE_BILLING_WEBHOOK_SECRET (Stripe)

Stripe sends multiple `v1=` entries while two signing secrets coexist,
and the verifier accepts any of them. Create the new endpoint secret at
Stripe (owner action), set the env var, restart, confirm events verify,
then expire the old secret at Stripe.

## VOICE_METRICS_TOKEN

Set the new value and restart; update the monitoring poller. Unset
means `/api/metricz` returns 404 (that is the fail-closed default, not
an outage).

## RESEND_API_KEY

Create the new key at Resend (owner action), set, restart. Alerts are
fire-and-forget: a bad key surfaces as `provider_status_401` reasons in
digest logs — the boot env-contract check does NOT call the provider.

## VOICE_TWILIO_AUTH_TOKEN

Rotate at Twilio (owner action; secondary-token overlap if available),
set, restart. The loader re-verifies the structural anti-reuse rule
(any value equal to its `INTAKE_TWILIO_*` counterpart refuses to load).
Inbound webhook signatures verify against the CURRENT token — rotate
during a quiet window.

## CALENDAR_TOKEN_KEY — **not silently rotatable**

Stored calendar tokens are AES-256-GCM envelopes under THIS key. A new
key makes every stored refresh token undecryptable; per-firm calendar
providers will mark connections `revoked` and open `calendar_revoked`
issues, and every firm must reconnect via the OAuth flow. Rotate only
with that consequence scheduled and announced. (A re-encryption
migration tool is future work; do not improvise one during an
incident.)

## ADMIN_PASSWORD

Set new value, restart (in-memory admin tokens die with the process —
that is the design). No fallback value exists in any environment.

## DATABASE_URL (credential rotation)

Provision the new credential, verify with
`pnpm --filter @workspace/db run preflight` (read-only) under the new
URL, then switch the env var and restart. Old sessions drain on the
provider side.
