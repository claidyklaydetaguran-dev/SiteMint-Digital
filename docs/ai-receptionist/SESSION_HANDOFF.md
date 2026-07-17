# AI Receptionist — Session Handoff

**Last updated**: 2026-07-17 (Phase 1A complete) | **SHA at handoff**: `6c4ff48e11bb746a704dbdfc793d281dec3f4c55` → see Phase 1A commit

## State at Handoff

- Phase 0 audit complete and accepted.
- Phase 0.5 documentation created (this file and its siblings).
- All workflows running: api-server (port 8080), helpdesk (port 21622), web-agency (port 22065).
- Database: development (`heliumdb`), 5 firms, 0 Stripe customers.
- Typecheck: PASS (last verified at SHA `06fff00`; no source files changed since).
- Helpdesk build: PASS (`dist/public/` present, built 2026-07-16 07:29 UTC).
- API server build: PASS (`dist/index.mjs` present, built by running workflow).

## Phase 1A — Complete (2026-07-17)

Files changed: `artifacts/api-server/src/routes/intakeAgent.ts` (firm-resolution fix, keyword handling, rate guard), `artifacts/api-server/src/lib/intakeOptOut.ts` (new). Typecheck: PASS. All acceptance criteria (a)–(i) verified.

## Known Trade-offs and Deferred Gaps

- **Trial cap counts opted-out conversations**: STOP or HELP from a brand-new number creates a conversation row (needed to store the message and set status). That row counts toward `trial_conversations_limit` even though it never engaged the LLM. Revisit cap computation in a later phase (consider excluding `opted_out` rows from the cap count).
- **Inbox renders `opted_out` as "Completed"**: The `Conversation` TypeScript interface in `Inbox.tsx` (line 25) only unions `"in_progress" | "completed"`. At runtime, `status: "opted_out"` from the DB passes through and renders with a misleading "Completed" badge. Opted-out conversations appear in "All" but not in either "Active" or "Completed" category views (sub-counts won't sum to total). Scheduled for Phase 1B/2: add `"opted_out"` to the union, add a distinct badge style, and add an "Opted Out" category filter.

## What the Next Session Must Do

**Next phase: 1B — Billing & Entry-Point Repair** (see ROADMAP.md for full scope).

Before starting:
- Read ARCHITECTURE.md, CURRENT_STATE.md, ROADMAP.md, and this file.
- Run `pnpm run typecheck` and confirm zero errors.
- Confirm git SHA matches `6c4ff48e` or explain any divergence.
- Do not touch locked files: `routes/phone.ts`, `lib/discEngine.ts`, `lib/leadScore.ts`, `lib/communicationIntelligence.ts`, `lib/workflowEngine.ts`.
- Do not push schema changes (ADR-05 is PROPOSED, not approved; schema is frozen).

## Open Blocking Issues (before next customer)

### Code bugs (Phase 1A + 1B)
1. **Firm-resolution fallback** (`intakeAgent.ts` lines 398–401): silent `SELECT … LIMIT 1` fallback assigns orphan SMS to first DB firm — remove entirely (Phase 1A).
2. **No STOP/opt-out handling**: conversation not marked `completed`, no acknowledgment (Phase 1A).
3. **Billing URLs wrong** (`receptionistBilling.ts`): `success_url`/`cancel_url` → `/app/settings` (legacy); should be `/ai-receptionist/dashboard/billing` (Phase 1B).
4. **Signup redirect wrong** (`LandingReceptionistSignup.tsx`): `navigate("/app")` → should be `navigate("/ai-receptionist/dashboard")` (Phase 1B).
5. **Signup "Sign in" link wrong**: `/app/login` → should be `/ai-receptionist/dashboard/login` (Phase 1B).

### Ops tasks (owner — anytime)
6. Set `STRIPE_RECEPTIONIST_PRICE_ID` secret (blocks Phase 1B E2E test).
7. Set `ADMIN_PASSWORD` secret (removes hardcoded `"sitemint2024"` fallback; required before Phase 1C).
8. Set `RESEND_FROM_EMAIL` to a Resend-verified sending address.
9. Fix `replit.md` API server port: 5000 → 8080 *(done in Phase 0.5)*.

### Twilio console checks (owner — open items)
10. **Advanced Opt-Out**: confirm it is enabled on the intake phone number in the Twilio console. This ensures STOP/HELP/CANCEL are handled at the carrier level even before Phase 1A ships application-level handling.
11. **A2P 10DLC registration**: confirm the intake number's registration status. Unregistered numbers on US carriers face filtering and may be blocked outright.

## Throwaway Records

Records inserted during Phase 0 verification (prior session):
- `receptionist_sessions`: rows for `alice@test-receptionist.com` (firm_id=2) and `captest@test.com` (firm_id=5).

Safe to clean up with:
```sql
DELETE FROM receptionist_sessions
WHERE email IN ('alice@test-receptionist.com', 'captest@test.com');
```

No other test records were created. No schema changes were made. No Stripe records exist.
