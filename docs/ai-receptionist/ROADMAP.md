# AI Receptionist — Roadmap

Phases are sequenced; each must be QA-verified and frozen before the next begins.
One PRD per phase; planning (Claude/Plan Mode) precedes each Build Mode session.

---

## Phase 1A — Tenant Isolation + SMS Opt-Out Compliance (NEXT)

- **Remove unsafe firm-resolution fallback**: replace the `SELECT … LIMIT 1` fallback for unmatched Twilio numbers with a hard rejection — log the unknown `To` number as an error and return an empty `<Response>` with no side effects.
- **Safe rejection of unmatched numbers**: ensure no conversation row is created, no message is stored, and no LLM call is made when the destination number matches no firm.
- **STOP/opt-out keyword handling**: detect `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` in the inbound `Body`; mark the corresponding conversation as `completed`; do not send an AI reply (Twilio handles the carrier-level acknowledgment).
- **Re-opt-in handling**: detect `START`, `YES`, `UNSTOP`; create or reopen the conversation as appropriate.
- **Per-caller message-rate guard**: prevent a single caller phone number from generating unbounded LLM calls within a short window (e.g., more than N messages per hour).
- **Cross-firm isolation tests**: verify that a caller on firm A's Twilio number cannot reach firm B's conversation data under any code path.

---

## Phase 1B — Billing & Entry-Point Repair

- **Fix billing redirect URLs**: change `success_url` and `cancel_url` in `receptionistBilling.ts` from `/app/settings` to `/ai-receptionist/dashboard/billing` (or the approved billing return path).
- **Fix signup redirect**: change `LandingReceptionistSignup.tsx` post-signup `navigate("/app")` to `navigate("/ai-receptionist/dashboard")`.
- **Fix signup "Sign in" link**: change `/app/login` to `/ai-receptionist/dashboard/login`.
- **Owner ops prerequisite**: `STRIPE_RECEPTIONIST_PRICE_ID` must be set before this phase is testable end-to-end.
- **Test-mode E2E**: verify full Stripe test-mode checkout → webhook → `plan_tier = "paid"` → dashboard upgrade indicator flow.

---

## Phase 1C — Auth Hardening

- **Rate limiting**: add per-IP rate limits to `POST /api/receptionist/auth/login` and `POST /api/receptionist/auth/signup` to prevent brute-force and enumeration attacks.
- **Generic error messages**: the `409 email already exists` response on signup currently leaks account existence — replace with a generic error or silent success pattern.
- **Session review**: audit session TTL (currently 30 days), add explicit session-count-per-firm cap if needed.
- **Failure logging**: ensure all auth failures are logged with enough context for security review without logging credential values.
- **Owner ops prerequisite**: `ADMIN_PASSWORD` env var must be set to remove the hardcoded `"sitemint2024"` fallback.

---

## Phase 2 — Legacy /app/* Retirement + Dead-Code Deletion + New Nav Shell

- **Retire legacy receptionist routes** in `web-agency/src/App.tsx`: remove `/app`, `/app/login`, `/app/agent-config`, `/app/settings`, `/app/conversations/:id` after confirming all entry points have been migrated to the new dashboard.
- **Delete legacy receptionist components**: `ReceptionistLogin.tsx`, `ReceptionistConversations.tsx`, `ReceptionistAgentConfig.tsx`, `ReceptionistSettings.tsx`, `ReceptionistAppShell.tsx` from web-agency.
- **Delete dead helpdesk files**: `Agents.tsx`, `NewTicket.tsx`, `CallDialer.tsx`.
- **New nav shell**: implement persistent navigation (sidebar or top bar) for the helpdesk dashboard with correct active-state indicators.

---

## Ops Tasks (Owner — Anytime, Not Code Changes)

- Set `STRIPE_RECEPTIONIST_PRICE_ID` secret (required before Phase 1B E2E)
- Set `ADMIN_PASSWORD` secret (required before Phase 1C)
- Set `RESEND_FROM_EMAIL` to a Resend-verified sending address
- Fix `replit.md` API server port documentation: 5000 → 8080 *(done in Phase 0.5)*
- Twilio console: enable Advanced Opt-Out on the intake phone number (ensures STOP/HELP/CANCEL are handled at the carrier level even before Phase 1A ships)
- Twilio console: confirm A2P 10DLC registration status for the intake number
