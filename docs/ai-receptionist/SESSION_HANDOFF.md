# AI Receptionist — Session Handoff

**Last updated**: 2026-07-17 (Phase 1B PARTIAL) | **SHA at handoff**: `404bd4e4a34fbb21c19366179b89a6d16281c3aa` + Phase 1B changes

## State at Handoff

- Phase 0 audit complete and accepted.
- Phase 0.5 documentation created (this file and its siblings).
- Phase 1A complete and frozen.
- Phase 1B code complete; tests (a)–(c), (g)–(j) passed; tests (d)–(f) deferred pending Stripe ops.
- All workflows running: api-server (port 8080), helpdesk (port 21622), web-agency (port 22065).
- Database: development (`heliumdb`), 5 firms (6th created and deleted during Phase 1B testing), 0 Stripe customers.
- Typecheck: PASS (api-server and web-agency, verified Phase 1B).

## Phase 1A — Complete (2026-07-17)

Files changed: `artifacts/api-server/src/routes/intakeAgent.ts` (firm-resolution fix, keyword handling, rate guard), `artifacts/api-server/src/lib/intakeOptOut.ts` (new). Typecheck: PASS. All acceptance criteria (a)–(i) verified and frozen.

## Phase 1B — PARTIAL / OPEN (2026-07-17)

**Status**: Code complete. Phase stays OPEN until tests (d), (e), (f) pass.

### Files changed (2 code + 2 docs)

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/receptionistBilling.ts` | `success_url` → `.../dashboard/billing?upgraded=1`; `cancel_url` → `.../dashboard/billing`; localhost fallback port 5000 → 8080 |
| `artifacts/web-agency/src/pages/LandingReceptionistSignup.tsx` | Post-signup `navigate("/app")` → `window.location.href = "/ai-receptionist/dashboard/"` (full-page, separate SPA); "Sign in" link → `/ai-receptionist/dashboard/login` |
| `docs/ai-receptionist/CURRENT_STATE.md` | Billing status updated, env var table updated |
| `docs/ai-receptionist/SESSION_HANDOFF.md` | This update |

### Tests run in Phase 1B

| Test | Description | Result |
|---|---|---|
| (a) | Exact URL strings in both changed files | PASS |
| (b) | Signup → HTTP 201, session cookie set, `/me` returns authenticated firm, redirect target is `window.location.href = "/ai-receptionist/dashboard/"` | PASS |
| (c) | "Sign in" link → `/ai-receptionist/dashboard/login` | PASS |
| (d) | Test-mode checkout → `?upgraded=1` → DB planTier=paid | **DEFERRED** |
| (e) | Cancelled checkout → returns to `/billing`, still trial | **DEFERRED** |
| (f) | Subscription deletion event → firm back to trial | **DEFERRED** |
| (g) | Bogus-signature webhook → 400; missing header → 400 | PASS |
| (h) | `git diff` confirms CRM Stripe stack + Phase 1A files untouched (0 lines changed) | PASS |
| (i) | `pnpm run typecheck` for api-server and web-agency | PASS |
| (j) | 1A regression: unmatched To → 0 rows; STOP → `opted_out`, empty TwiML, post-STOP message stored silently | PASS |

### STRIPE_WEBHOOK_SECRET Discrepancy Finding

Phase 0 audit reported `STRIPE_WEBHOOK_SECRET` as SET. Plan mode check using `viewEnvVars()` in the code-execution sandbox reported it as NOT SET. **Phase 0 was correct.**

Root cause: `viewEnvVars()` in the code-execution JS sandbox does not see all secrets that are injected into the Node.js server process environment. A direct `bash` check of `process.env` keys confirmed `STRIPE_WEBHOOK_SECRET` IS present in the running server process. The webhook handler's signature verification is live; only `STRIPE_RECEPTIONIST_PRICE_ID` is missing (blocks checkout initiation).

### Deferred Tests — Owner Ops Prerequisites

The following four items must be completed by the owner before tests (d)–(f) can run:

1. **Set `STRIPE_RECEPTIONIST_PRICE_ID` secret** — a test-mode price ID (`price_...`). Without it, `POST /api/receptionist/billing/create-checkout-session` returns `500 "Billing is not configured yet"`.
2. **Connect the Stripe Replit integration** (or set `STRIPE_SECRET_KEY` as a manual secret) — `getUncachableStripeClient()` reads from the Stripe connector; with 0 connections it throws on any checkout attempt.
3. **Register the webhook endpoint in Stripe dashboard** — Developers → Webhooks → Add endpoint: `https://<domain>/api/receptionist/billing/webhook`. Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.deleted`.
4. **Copy the webhook signing secret** from the Stripe dashboard into the `STRIPE_WEBHOOK_SECRET` secret (currently set in process.env from a prior value — confirm it matches the newly registered endpoint's signing secret).

How to trigger test (f) once credentials are set: `stripe trigger customer.subscription.deleted` via Stripe CLI with `stripe listen --forward-to https://<domain>/api/receptionist/billing/webhook`, or manually cancel the test subscription in the Stripe dashboard.

Throwaway firm for tests (b)–(d): create via signup form, email `phase1b-qa@sitemint-qa.invalid`. Cleanup SQL:
```sql
DELETE FROM receptionist_sessions WHERE firm_id=(SELECT id FROM intake_firms WHERE email='phase1b-qa@sitemint-qa.invalid');
DELETE FROM intake_firms WHERE email='phase1b-qa@sitemint-qa.invalid';
```

## Known Trade-offs and Deferred Gaps

- **Trial cap counts opted-out conversations**: STOP or HELP from a brand-new number creates a conversation row (needed to store the message and set status). That row counts toward `trial_conversations_limit` even though it never engaged the LLM. Revisit cap computation in a later phase (consider excluding `opted_out` rows from the cap count).
- **Inbox renders `opted_out` as "Completed"**: The `Conversation` TypeScript interface in `Inbox.tsx` (line 25) only unions `"in_progress" | "completed"`. At runtime, `status: "opted_out"` from the DB passes through and renders with a misleading "Completed" badge. Opted-out conversations appear in "All" but not in either "Active" or "Completed" category views (sub-counts won't sum to total). Scheduled for Phase 1B/2: add `"opted_out"` to the union, add a distinct badge style, and add an "Opted Out" category filter.
- **SPA boundary**: web-agency (`/`) and helpdesk (`/ai-receptionist/dashboard`) are served as separate Vite SPAs. wouter `navigate()` cannot cross this boundary; cross-SPA navigation requires `window.location.href` (applied in Phase 1B).

## What the Next Session Must Do

**Next phase: 1C — Auth Hardening** (or Phase 1B completion once Stripe ops items are done).

Before starting:
- Read ARCHITECTURE.md, CURRENT_STATE.md, ROADMAP.md, and this file.
- Run `pnpm run typecheck` and confirm zero errors.
- Check Phase 1B status: if owner has set Stripe credentials, run deferred tests (d)–(f) first and mark Phase 1B complete before moving to 1C.
- Do not touch locked files: `routes/intakeAgent.ts`, `lib/intakeOptOut.ts`, `routes/phone.ts`, `lib/discEngine.ts`, `lib/leadScore.ts`, `lib/communicationIntelligence.ts`, `lib/workflowEngine.ts`.
- Do not push schema changes (ADR-05 is PROPOSED, not approved; schema is frozen).

## Open Blocking Issues (before next customer)

### Code bugs — Phase 1A ✅ Phase 1B (code) ✅
1. ~~Firm-resolution fallback~~ — fixed Phase 1A.
2. ~~No STOP/opt-out handling~~ — fixed Phase 1A.
3. ~~Billing URLs wrong~~ — fixed Phase 1B.
4. ~~Signup redirect wrong~~ — fixed Phase 1B.
5. ~~Signup "Sign in" link wrong~~ — fixed Phase 1B.

### Ops tasks (owner)
6. **Set `STRIPE_RECEPTIONIST_PRICE_ID` secret** — blocks Phase 1B tests (d)–(f).
7. **Connect Stripe integration / set `STRIPE_SECRET_KEY`** — blocks Phase 1B tests (d)–(f).
8. **Register Stripe webhook endpoint** and update `STRIPE_WEBHOOK_SECRET` — blocks Phase 1B tests (d)–(f).
9. **Set `ADMIN_PASSWORD` secret** — removes hardcoded `"sitemint2024"` fallback; required before Phase 1C.
10. **Set `RESEND_FROM_EMAIL`** to a Resend-verified sending address.

### Twilio console checks (owner)
11. **Advanced Opt-Out**: confirm enabled on intake phone number in Twilio console.
12. **A2P 10DLC registration**: confirm intake number's registration status.

## Throwaway Records

Records inserted during Phase 0 verification (prior session):
- `receptionist_sessions`: rows for `alice@test-receptionist.com` (firm_id=2) and `captest@test.com` (firm_id=5).

Safe to clean up with:
```sql
DELETE FROM receptionist_sessions
WHERE email IN ('alice@test-receptionist.com', 'captest@test.com');
```

Phase 1B test firm (id=7, `phase1b-test-...@sitemint-qa.invalid`) was created and deleted during testing. No residual records.
