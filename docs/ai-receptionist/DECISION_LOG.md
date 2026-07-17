# AI Receptionist — Decision Log

Entries marked "Reconstructed rationale" were inferred from code and commit history;
exact decision dates and discussion context are not available.

---

## Reconstructed rationale (undated, inferred from code/commits)

### Dedicated helpdesk frontend instead of extending /app/*
- **Decision**: Build a dedicated `artifacts/helpdesk` SPA at `/ai-receptionist/dashboard` rather than extending the legacy `/app/*` receptionist pages inside web-agency.
- **Rationale**: Cleaner product separation — web-agency hosts CRM, marketing, and admin tooling; the AI Receptionist is a customer-facing product with its own auth, session model, and upgrade flow. Co-locating them in web-agency would entangle unrelated concerns.
- **Side effect**: Two complete frontends now coexist. Entry points (post-signup redirect, Stripe billing return) were not fully migrated in the initial build and remain as Phase 1B work.

### Cookie auth for receptionist (not Bearer token)
- **Decision**: Use an `httpOnly` cookie (`receptionist_session`) backed by the `receptionist_sessions` DB table, with a 30-day TTL.
- **Rationale**: The CRM admin system uses `Authorization: Bearer` tokens stored in `localStorage`. Using the same mechanism for receptionist customers would risk collision and confusion. Cookie-based auth is more appropriate for a customer-facing SPA where the token should not be accessible to JavaScript.
- **Constraint**: The two auth systems are explicitly isolated by design and must not be merged.

### Trial cap computed at read time, not stored
- **Decision**: `isOverCap` is computed dynamically in `GET /api/receptionist/conversations` by ranking conversations by creation order and comparing rank to `trial_conversations_limit` — not stored as a flag in the DB.
- **Rationale**: If a firm upgrades from trial to paid, all conversations immediately un-cap without requiring a migration or backfill. The flag is a derived view of plan state, not durable data.

### Separate Twilio credentials for intake vs. CRM
- **Decision**: The SMS intake pipeline uses `INTAKE_TWILIO_AUTH_TOKEN` and its own Twilio number per firm (`intake_firms.twilio_number`). It never touches `routes/phone.ts` or the CRM Twilio credentials (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`).
- **Rationale**: The CRM phone feature (call forwarding, CRM lead SMS) must be independently operable. A misconfiguration or outage in one pipeline must not affect the other. `routes/phone.ts` is a locked file.

---

## 2026-07-17 — Phase 0 audit accepted

- Audit completed at SHA `6c4ff48e11bb746a704dbdfc793d281dec3f4c55`.
- Database confirmed as development (Replit-managed `heliumdb`, 0 Stripe customers).
- Phase sequence approved: **0.5 docs → 1A tenant/SMS safety → 1B billing/entry-points → 1C auth hardening → 2 legacy retirement + nav shell**.
- All five locked files (`routes/phone.ts`, `lib/discEngine.ts`, `lib/leadScore.ts`, `lib/communicationIntelligence.ts`, `lib/workflowEngine.ts`) confirmed byte-for-byte unchanged across the full session range.

## 2026-07-17 — Phase 1B-E2E waiver (owner decision)

- Stripe checkout / cancel / downgrade E2E tests (d)/(e)/(f) deferred because no Stripe account exists yet.
- Phase 1B code is complete and verified; tests (a)–(c), (g)–(j) passed.
- **These tests MUST run before onboarding any paying customer.**
- Phase 1C proceeds on this basis; Phase 1B remains OPEN until (d)/(e)/(f) pass.

## 2026-07-17 — Phase 1C: login IP limiter tracks failed attempts only

- **Decision**: `loginIpLimiter.record()` is called only on failed login attempts (unknown account or wrong password), never on success.
- **Rationale**: The PRD specifies "30 attempts/IP/15min" but recording successful logins would penalise shared-IP offices (e.g. a law firm on a corporate NAT) — 30 normal logins from one building would lock everyone out. Tracking only failures achieves the anti-credential-stuffing goal without that side effect.
- **Deviation from PRD wording**: intentional and owner-approved; recorded here as the authoritative reference.

## 2026-07-17 — Process model established

- **Planning and PRDs**: Claude (external) in Plan Mode — inspection, audit, PRD authoring, reconciliation between phases.
- **Implementation**: Replit Agent in Build Mode — code changes, schema changes, verification.
- **Handoff protocol**: one PRD document per phase; Build Mode session begins only after PRD is reviewed and approved; QA verification + freeze after each phase before the next starts.
