# AI Receptionist — Current State

**As of**: 2026-07-17 | **Git SHA**: `6c4ff48e11bb746a704dbdfc793d281dec3f4c55`

## What Works

- **Auth gate**: Login, logout, cookie session on the new helpdesk dashboard (`/ai-receptionist/dashboard`). 401 returned on all protected routes without a valid cookie.
- **Inbox**: Conversation list with `isOverCap` computation (computed at read time, not stored). Conversation detail with full message thread.
- **Agent config**: GET/PATCH for greeting message, business description, qualifying questions — persists to `intake_firms` row.
- **SMS intake pipeline**: Twilio webhook → LLM extraction → case scoring → Resend email notification. Trial cap enforcement suppresses AI replies beyond `trial_conversations_limit`.
- **Stripe webhook handler**: Signature verification functional (`STRIPE_WEBHOOK_SECRET` is SET); upgrades `plan_tier` to `paid` on `checkout.session.completed`.

## What Is Broken

- **Billing**: Broken on two independent counts:
  1. `STRIPE_RECEPTIONIST_PRICE_ID` not configured — route returns `500 "Billing is not configured yet"` immediately; checkout cannot be initiated at all.
  2. `success_url` and `cancel_url` are hardcoded to `/app/settings` (legacy web-agency frontend) — even if the price ID were set, a successful Stripe checkout would redirect the customer to the wrong product.
- **Signup flow**: `LandingReceptionistSignup.tsx` navigates to `/app` after account creation — new users land on the legacy frontend instead of `/ai-receptionist/dashboard`.
- **Signup "Sign in" link**: Points to `/app/login` (legacy) instead of `/ai-receptionist/dashboard/login`.
- **STOP/opt-out**: No application-level detection. Twilio handles carrier-level opt-out, but the conversation is never marked `completed` in the DB and no acknowledgment is sent.
- **Firm-resolution fallback**: If an inbound SMS arrives on an unknown Twilio number, the code silently assigns it to the first firm in the DB by insertion order (`SELECT … LIMIT 1`) — a data corruption risk.

## Stub / Coming Soon Pages

- **Contacts**: Full "Coming Soon" overlay — no data shown.
- **Deploy**: Channel status display — SMS shown as Active, Email and Web Chat shown as Coming Soon.

## Dead Code (not imported, not routed)

- `artifacts/helpdesk/src/pages/Agents.tsx` — stub body, unreferenced
- `artifacts/helpdesk/src/pages/NewTicket.tsx` — unreferenced
- `artifacts/helpdesk/src/components/layout/CallDialer.tsx` — unreferenced

Deletion deferred to Phase 2.

## Missing / Misconfigured Env Vars

| Variable | Status | Impact |
|---|---|---|
| `STRIPE_RECEPTIONIST_PRICE_ID` | MISSING | Billing checkout 500s |
| `RESEND_FROM_EMAIL` | MISSING | Notification email uses hardcoded fallback from-address |
| `ADMIN_PASSWORD` | MISSING | Admin routes use hardcoded default `"sitemint2024"` |
