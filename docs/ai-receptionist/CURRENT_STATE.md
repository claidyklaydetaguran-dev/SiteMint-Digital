# AI Receptionist — Current State

**As of**: 2026-07-17 | **Phase 1B PARTIAL** | **Git SHA**: `404bd4e4a34fbb21c19366179b89a6d16281c3aa` + Phase 1B changes

## What Works

- **Auth gate**: Login, logout, cookie session on the new helpdesk dashboard (`/ai-receptionist/dashboard`). 401 returned on all protected routes without a valid cookie.
- **Inbox**: Conversation list with `isOverCap` computation (computed at read time, not stored). Conversation detail with full message thread.
- **Agent config**: GET/PATCH for greeting message, business description, qualifying questions — persists to `intake_firms` row.
- **SMS intake pipeline**: Twilio webhook → LLM extraction → case scoring → Resend email notification. Trial cap enforcement suppresses AI replies beyond `trial_conversations_limit`.
- **Stripe webhook handler**: Signature verification functional (`STRIPE_WEBHOOK_SECRET` is SET in process environment); upgrades `plan_tier` to `paid` on `checkout.session.completed`.
- **SMS opt-out / keyword handling** (Phase 1A): STOP → `opted_out` conversation, empty TwiML reply; START → re-opt-in; HELP → sent only when not opted out; rate guard (30 msg / 60 min).
- **Billing redirect URLs** (Phase 1B): `success_url` → `/ai-receptionist/dashboard/billing?upgraded=1`; `cancel_url` → `/ai-receptionist/dashboard/billing`.
- **Signup entry-point** (Phase 1B): Post-signup navigates to `/ai-receptionist/dashboard/` via `window.location.href` (full-page cross-SPA navigation); "Sign in" link → `/ai-receptionist/dashboard/login`.

## What Is Broken / Incomplete

- **Billing checkout cannot be initiated**: `STRIPE_RECEPTIONIST_PRICE_ID` not configured — route returns `500 "Billing is not configured yet"`. Redirect URLs are now correct; the route itself will work once the price ID and Stripe connection are set. Tests (d)–(f) deferred.
- **Stripe integration not connected**: 0 Stripe connector connections; `getUncachableStripeClient()` will throw on any checkout attempt. Owner must connect the Stripe Replit integration or set `STRIPE_SECRET_KEY`.

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
| `STRIPE_RECEPTIONIST_PRICE_ID` | **MISSING** | Billing checkout 500s; tests (d)–(f) blocked |
| `STRIPE_SECRET_KEY` / Stripe connector | **NOT CONNECTED** | `getUncachableStripeClient()` throws on checkout |
| `STRIPE_WEBHOOK_SECRET` | SET (process env) | Webhook signature verification live |
| `RESEND_FROM_EMAIL` | MISSING | Notification email uses hardcoded fallback from-address |
| `ADMIN_PASSWORD` | MISSING | Admin routes use hardcoded default `"sitemint2024"` |
