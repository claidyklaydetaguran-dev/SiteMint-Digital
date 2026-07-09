---
name: Stripe connector settings field name
description: Correct field name for the Stripe secret key in the Replit stripe connector settings object, used when building a custom Stripe client instead of relying only on stripe-replit-sync.
---

The Replit `stripe` connector's settings object exposes the secret key under `secret`, not `secret_key`. There is no separate `webhook_secret` key in connector settings — code that reads `settings.webhook_secret` silently falls back to `''`.

**Why:** The `stripe` skill's example/template code for building a raw `stripe` SDK client (e.g. for custom checkout sessions beyond what `stripe-replit-sync` handles) referenced `secret_key`, which does not exist on the connector settings and produced a broken client with no visible error until API calls failed.

**How to apply:** When writing a custom Stripe client wrapper (e.g. `getUncachableStripeClient()`) that reads connector settings directly instead of only using `stripe-replit-sync`, use `settings.secret` for the API key. Verify by grepping the actual connector settings shape (`listConnections('stripe')` in the code execution sandbox) rather than trusting skill sample code verbatim.
