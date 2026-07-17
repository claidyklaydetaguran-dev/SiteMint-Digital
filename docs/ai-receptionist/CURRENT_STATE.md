# AI Receptionist — Current State

**As of**: 2026-07-17 | **Phase 2C + gap-fix pass complete** | **Pre-2C SHA**: `981be92` | **Post-2C base SHA**: `7e0cc4a` | Gap fixes on top of `7e0cc4a`

## What Works

- **Auth gate**: Login, logout, cookie session on the new helpdesk dashboard (`/ai-receptionist/dashboard`). 401 returned on all protected routes without a valid cookie.
- **Inbox**: Conversation list with `isOverCap` computation. `opted_out` status fully supported — dedicated badge, "Opted Out" category filter, DetailsPanel unsubscribe notice. Conversation detail with full message thread.
- **Agent config**: GET/PATCH for greeting message, business description, qualifying questions — persists to `intake_firms` row.
- **SMS intake pipeline**: Twilio webhook → LLM extraction → case scoring → Resend email notification. Trial cap enforcement suppresses AI replies beyond `trial_conversations_limit`.
- **Stripe webhook handler**: Signature verification functional (`STRIPE_WEBHOOK_SECRET` is SET in process environment); upgrades `plan_tier` to `paid` on `checkout.session.completed`.
- **SMS opt-out / keyword handling** (Phase 1A): STOP → `opted_out` conversation, empty TwiML reply; START → re-opt-in; HELP → sent only when not opted out; rate guard (30 msg / 60 min).
- **Billing redirect URLs** (Phase 1B): `success_url` → `/ai-receptionist/dashboard/billing?upgraded=1`; `cancel_url` → `/ai-receptionist/dashboard/billing`.
- **Signup entry-point** (Phase 1B): Post-signup navigates to `/ai-receptionist/dashboard/` via `window.location.href` (full-page cross-SPA navigation); "Sign in" link → `/ai-receptionist/dashboard/login`.
- **Auth rate limiting** (Phase 1C): Login (10/email/15 min; 30 IP failed/15 min), Signup (5 IP/hr). WARN log on every failure with masked email + IP + failCount. 429 on limit exceeded.
- **Legacy route retirement** (Phase 2A): `/app/login` → `/ai-receptionist/dashboard/login`; `/app`, `/app/agent-config`, `/app/settings`, `/app/conversations/:id` → `/ai-receptionist/dashboard/`. Uses `window.location.replace` (no history entry).

## What Is Broken / Incomplete

- **Billing checkout cannot be initiated**: `STRIPE_RECEPTIONIST_PRICE_ID` not configured — route returns `500 "Billing is not configured yet"`. Redirect URLs are correct; the route itself will work once the price ID and Stripe connection are set. Tests (d)–(f) deferred.
- **Stripe integration not connected**: 0 Stripe connector connections; `getUncachableStripeClient()` will throw on any checkout attempt. Owner must connect the Stripe Replit integration or set `STRIPE_SECRET_KEY`.

## Stub / Coming Soon Pages

- **Contacts** (`/contacts`): page header + honest empty state (icon card, copy, CTA to
  `/conversations`). `/contacts/:id` is a bare stub. No data shown.
- **Settings** (`/settings`): Members panel is "Coming Soon"; Language panel is
  non-functional decorative UI.
- **Deploy**: page deleted in Phase 2B — `/deploy` is an in-SPA redirect to `/receptionist`.
- **Inbox reply composer**: explicit "coming soon" notice; conversations are read-only
  from the dashboard.
- **AgentConfig "Test" tab**: disabled placeholder.

## Voice Platform (approved 2026-07-17)

Milestone 1 (foundation + first working assistant) is approved and in progress on branch
`claude/audit-receptionist-repo-268pla`: dark/light design system + new shell, versioned
migrations for `voice_assistants`/`provider_webhook_events`/`voice_issues`, the
`VoiceProvider` abstraction with Vapi + fake adapters, assistant CRUD/templates/publish,
and browser test calls — behind `VOICE_PLATFORM_ENABLED` (off in production). See
DECISION_LOG.md (2026-07-17 entries) and VOICE_PLATFORM.md.

## Dead Code — RETIRED (Phase 2A)

The following files were deleted in Phase 2A (verified zero external imports before deletion):

**web-agency** (5 files deleted):
- `artifacts/web-agency/src/pages/receptionist/ReceptionistLogin.tsx`
- `artifacts/web-agency/src/pages/receptionist/ReceptionistConversations.tsx`
- `artifacts/web-agency/src/pages/receptionist/ReceptionistAgentConfig.tsx`
- `artifacts/web-agency/src/pages/receptionist/ReceptionistSettings.tsx`
- `artifacts/web-agency/src/pages/receptionist/ReceptionistAppShell.tsx`

**helpdesk** (3 files deleted):
- `artifacts/helpdesk/src/pages/Agents.tsx`
- `artifacts/helpdesk/src/pages/NewTicket.tsx`
- `artifacts/helpdesk/src/components/layout/CallDialer.tsx`

## Missing / Misconfigured Env Vars

| Variable | Status | Impact |
|---|---|---|
| `STRIPE_RECEPTIONIST_PRICE_ID` | **MISSING** | Billing checkout 500s; tests (d)–(f) blocked |
| `STRIPE_SECRET_KEY` / Stripe connector | **NOT CONNECTED** | `getUncachableStripeClient()` throws on checkout |
| `STRIPE_WEBHOOK_SECRET` | SET (process env) | Webhook signature verification live |
| `RESEND_FROM_EMAIL` | MISSING | Notification email uses hardcoded fallback from-address |
| `ADMIN_PASSWORD` | MISSING | Admin routes use hardcoded default `"sitemint2024"` |
