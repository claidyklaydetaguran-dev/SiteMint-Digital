# Backend execution ledger

One entry per merged phase of the backend execution program. The Backend
Master Audit (2026-08-30) is the source roadmap; each entry records what
actually landed, with SHAs, so the program can be resumed or audited from
this file alone.

## P1 — Foundation integration, CI, and governance (2026-08-30)

| Item | Value |
| --- | --- |
| PR #3 (foundation → feature branch) | merge commit `a287945761e22e425c812913c22aee25e0d9dff4` |
| PR #4 (consolidation → main) | merge commit `4927b5a80e5326bfaddee726de4494d51f8f861e` (120 commits) |
| PR #5 (CI workflow) | merge commit `3a04c176108434b92903460e5a069cbd4c3b35bd` |
| Files added | `.github/workflows/ci.yml`, `scripts/src/ci-secret-scan.mjs`, `scripts/src/ci-built-output-scan.mjs`, `docs/backend-program/P1_SPEC.md` |
| Schema changes | none |
| CI evidence (run 33307401897) | gates + voice-matrix green: aggregate suite incl. 21-file/590-test vitest, contract suites, 9/9 legacy files; journal proofs "All journalIntegration tests passed" on a throwaway Postgres service; built-output scan "31 files, 9 probes, 0 leaks"; matrix "20/20 variants, 667 built-output assertions, 0 skips" |
| Branch protection | `main`: required checks `gates`,`voice-matrix` (strict), `enforce_admins=true`, force-push/deletion blocked. Deliberately no required-reviewer count: a solo maintainer cannot approve their own PR; required checks + enforce_admins still force the PR path mechanically. |
| Deferred live gate | none in this phase |
| Residual risks / notes | (a) The secret scan's first real run caught the workflow's own throwaway service URL — allowlisted with justification rather than weakening the rule. (b) A raw NUL byte initially shipped inside the scanner made git treat it as binary; replaced with the `\u0000` escape in `28dcd54`. (c) `.env.example` is deny-listed by local tooling permissions, so the voice variable names are documented here instead: `VOICE_SYNC_ENABLED`, `VOICE_BROWSER_TEST_ENABLED`, `VOICE_ARTIFACT_POLICY` (none/transcript_only/full, no default), `VAPI_WEBHOOK_SECRET` — authoritative operator profile remains `docs/ai-receptionist/LAUNCH_CHECKLIST.md` §2/§2a. (d) GitHub Actions masked the service DATABASE_URL in logs. |

Doc drift corrected this phase: ROADMAP M1 status line (staging config,
migration, browser-call UAT, and one controlled provider sync are done);
stale `ADMIN_PASSWORD` fallback note (no fallback exists in code).

P1 addendum: the docs/ledger PR (#6) merged as
`33809b9b7e287c324a2e57d3851cfa686838dc22` — the first PR proven gated by the
new protection.

## P2 — Webhook and call-lifecycle completion (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p2-webhook-lifecycle (SHAs recorded on merge in the P3 entry's addendum or below) |
| New files | `lib/voice/webhooks/webhookAuthPolicy.ts`, `lib/voice/webhooks/reconciliation.ts`, `lib/voiceIssues/voiceIssueService.ts`, `lib/voicePublishing/serverConfig.ts`, `lib/voice/webhooks/webhookLifecycle.test.ts`, `docs/backend-program/P2_SPEC.md` |
| Modified | webhook route (policy auth, store-failure 500 + issue), `vapiServerMessage` (boundary extraction), `callStateModel` (`hasEndOfCallReport`, `providerDurationSec`), vapi `types`/`mapper` (`server` block), `publishService`/`syncService` (pre-claim server-config load, optional dep), `errors.ts` (+`SERVER_CONFIG_INVALID`), `index.ts` (gated sweep starter) |
| Schema changes | none (voice_issues and provider_webhook_events already existed) |
| New env contract (all inert by default) | `VAPI_WEBHOOK_SECRET_PREVIOUS` (rotation overlap), `VAPI_WEBHOOK_ALLOW_BEARER` ("true" = staging bridge; production is HMAC-only), `VOICE_RECONCILIATION_ENABLED`, `VOICE_WEBHOOK_ATTACH_ENABLED` + `VOICE_SERVER_URL` |
| Deferred live gate | Configuring the Vapi server URL/credential and flipping `VOICE_WEBHOOK_ATTACH_ENABLED` — owner-gated activation (hard-stop boundary) |
| Residual risks | Bearer bridge exists in code (flag-gated); reconciliation thresholds are constants pending real traffic; issue writers cover webhook/reconciliation only until P7 broadens them |

P2 addendum: PR #7 merged as `c973aa58406c2ad271f784d83cc1b48e68eded1c`;
CI evidence run 33308414394 — vitest 22 files / 616 tests, both jobs green.
In-phase fix `4156e38`: hoisted `vi.mock("@workspace/db")` (the db package
throws at import without DATABASE_URL) + lazy sweep collaborators.

## P3 — Tools and scheduling action loop (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p3-tools-scheduling (merge SHA recorded in the P4 addendum) |
| New files | `lib/voice/tools/toolCatalog.ts`, `lib/voice/tools/toolDispatcher.ts`, `lib/voice/tools/toolDispatcher.test.ts`, `lib/voicePublishing/toolsConfig.ts`, `docs/backend-program/P3_SPEC.md` |
| Modified | parser + eventKey (`tool-calls`), webhook route (tool branch w/ ledger replay), `realCallsRepository` (stored-results read/write), vapi `types`/`mapper` (validated `tools` emission), publish/sync (pre-claim tools load), errors (+`TOOLS_CONFIG_INVALID`), issue codes (+2), api-server `package.json` (+`zod: catalog:` — same ^3.25.76 the workspace already resolves; lockfile +3 lines importer entry) |
| Schema changes | none (`source='ai_receptionist'` was already in the scheduling CHECK) |
| New env contract (inert) | `VOICE_TOOLS_ATTACH_ENABLED` (requires the P2 server attachment when true) |
| Deferred live gate | Creating/attaching live Vapi tools (owner-gated activation) |
| Residual risks | Reschedule uses list-then-find for the old request (bounded at 200 rows) pending a direct lookup; tool result replay stores results inside the event payload (documented key `siteMintToolResults`) |

P3 addendum: PR #8 merged as `16ed1ac2f5d1fdb0d369fb22e9518d1a7ac19924`.
In-phase fix `2ee3017`: the test fixture's missing `...overrides` spread —
caught by CI against real dispatcher output.

## P4 — Per-firm calendar truth (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p4-calendar (merge SHA recorded in the P5 addendum) |
| Migration | scheduling `0001_black_reavers` — `scheduling_calendar_connections` + `scheduling_calendar_oauth_states`; rollback at `drizzle/scheduling-rollback/0001_black_reavers_rollback.sql`. Design correction mid-phase: an initially added `calendar_event_id` column duplicated the existing `providerEventId`/`providerCalendarId` + booked-CHECK invariant and was reverted before commit — the sync layer builds on the schema's own invariant instead. |
| New files | `lib/calendar/{tokenCrypto,googleOAuth,calendarConnectionsRepository,PerFirmGoogleFreeBusyProvider,eventWriter,calendarEventSync,calendarIntegration.test}.ts`, `routes/receptionistCalendar.ts`, `docs/backend-program/P4_SPEC.md` |
| Modified | calendar factory (per-firm wrapper over the workspace-level selection — inert fall-through), routes/index.ts, voiceIssueService (+`calendar_revoked`, `calendar_sync_failed`), drizzle.scheduling.config.ts (`path.sep` normalization so generate works on Windows; POSIX no-op) |
| New env contract (all inert) | `CALENDAR_CONNECT_ENABLED`, `CALENDAR_WRITE_ENABLED`, `CALENDAR_TOKEN_KEY` (32-byte base64), `GOOGLE_OAUTH_CLIENT_ID`/`_CLIENT_SECRET`/`_REDIRECT_URI` |
| Deferred live gate | Creating Google OAuth credentials, any consent, any real token/freebusy/event request; flipping either calendar flag (owner-gated) |
| Residual risks | Approve→booked is exposed as a service primitive only (no route yet — P8 admin/approve flow); reconcile sweep is invocable but not yet on an interval; access-token refresh in the event writer reads env config directly (documented) |

P4 addendum: PR #9 merged as `c9f290d8b8b9514402ddb19354b2f7e534f48176`.
In-phase CI catches: three inventory-pin updates (domain 10→12, app 37→39,
migrations 5→6 — the journal proof's legacy-row count is now DERIVED from
the committed folders), plus the same missing-fixture-spread defect class
as P3 (fixed in `99b594e`).

## P5 — Contacts, conversations, and voice-side SMS (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p5-contacts-sms (merge SHA recorded in the P6 addendum) |
| Migration | voice `0003_thin_lifeguard` — voice_contacts, voice_call_links, voice_sms_consents, voice_sms_outbox; rollback refuses mid-flight sends. Vertical-neutrality decision: NOT built on intake_cases (SMS-thread-anchored, legal-flavored); intake association is a read-only annotation by number. |
| New files | `lib/voiceContacts/contactLinker.ts`, `lib/voiceSms/{smsCore,outboxService,voiceSmsContacts.test}.ts`, `routes/voiceSmsWebhook.ts`, migration + rollback, `docs/backend-program/P5_SPEC.md` |
| Modified | app.ts (urlencoded for /api/voice/sms), routes/index.ts, webhook route (end-of-call → best-effort contact link), toolDispatcher (consent-gated confirmation enqueue), voice barrel, drizzle.voice.config.ts (path.sep fix), inventory pins (16 domain / 43 app / 7 migrations) |
| New env contract (all inert) | `VOICE_SMS_ENABLED`, `VOICE_TWILIO_ACCOUNT_SID`/`_AUTH_TOKEN`/`_FROM_NUMBER` (loader structurally refuses any value equal to its INTAKE_TWILIO_* counterpart), `VOICE_SMS_OWNER_FIRM_ID` (interim single-number tenant mapping until P6) |
| Deferred live gate | Creating any Twilio resource, sending any SMS, and the missed-call text-back policy (rows default `blocked_no_consent` — enabling is an owner policy decision) |
| Residual risks | Inbound consent tenant-mapping is env-pinned until P6's number inventory; outbox send-loop logic is DB-bound and exercised at unit level via transport/consent fakes only until an integration harness (P9) |

P5 addendum: PR #10 merged as `875ffd46fa54007f971e4078b3cf91351314951a`.
In-phase CI catch with a durable lesson: voice `0002` was hand-authored
without a meta snapshot, so `drizzle-kit generate` re-emitted its objects
into 0003 (duplicate-object failures in the journal proofs). Fixed by
stripping the re-emitted statements from 0003 BEFORE it was recorded
anywhere (hash immutability only binds once applied/committed); 0003's
snapshot heals the chain. Two more proofs converted from pins to DERIVED
(journal legacy-row count; sequence-proof base timestamp).

## P6 — Numbers, transfers, and call policy (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p6-numbers-transfers (merge SHA recorded in the P7 addendum) |
| Migration | voice `0004_lying_jamie_braddock` — voice_numbers (lifecycle CHECKs incl. `(state='inventory') = (firm_id IS NULL)`, assigned⇒assistant, partial unique one-assigned-per-firm, globally unique phone/provider ids) + voice_transfer_destinations; rollback refuses while any number is assigned/paused. Generated CLEAN against 0003's snapshot — the 0002 snapshot gap is healed. |
| New files | `lib/voiceNumbers/{numberService,numberService.test}.ts`, `lib/voicePublishing/callPolicyConfig.ts`, `routes/receptionistNumbers.ts`, migration + rollback, `docs/backend-program/P6_SPEC.md` |
| Modified | parser + eventKey (+`transfer-destination-request`, `transfer-update`), webhook route (assistant-request answered from inventory BEFORE assistant attribution; transfer branch; emergency scan), vapi `types`/`mapper` (callPolicy → four first-class fields), publish/sync (pre-claim callPolicy load), voiceIssueService (+`emergency_language_detected`), voiceSmsWebhook (inventory To→firm mapping, env pin demoted to fallback), voice barrel, inventory pins (18 domain / 45 app / 8 migrations) |
| New env contract (inert) | `VOICE_CALL_POLICY_JSON` (fail-closed, closed keys, bounded; null default keeps payloads byte-identical) |
| Deferred live gate | Number acquisition/import/porting/release (production `PhoneNumberProvider` throws — hard stop), wiring provider number webhooks, any transfer of a real call |
| Residual risks | Transfer picks the single best destination (no cascade retry until real telephony evidence); business-hours guard reuses the scheduling weekly config (single range per day); emergency scan is a conservative keyword flag, deliberately not NLP |

P6 addendum: PR #11 merged as `1cfc4b4084b942b9fcf2cfdc95eac573abb7aa13`.
In-phase CI catch: the routing test passed `undefined` through a helper
whose default parameter re-supplied a provider id (the JS explicit-
undefined-still-defaults trap) — fixed by building that case's deps
inline (`e010892`). Third member of the test-fixture defect family
(P3/P4 spreads, P6 default params): fixtures with defaults need the
failing case constructed explicitly.

## P7 — Outcomes, metering, and alerts (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p7-outcomes-metering (merge SHA recorded in the P8 addendum) |
| Migration | voice `0005_shiny_supernaut` — voice_call_reviews (no row = pending), voice_usage_ledger (IMMUTABLE, unique (provider, call_id)), voice_usage_cap_states (unique (firm, period), pause_requested/cleared); rollback refuses on non-empty ledger (billing evidence) or undecided cap states. Generated clean against 0004's snapshot. |
| New files | `lib/voiceUsage/{usageService,voiceMonitoring.test}.ts`, `lib/voiceAlerts/{alertTransport,dailyDigest}.ts`, `lib/voiceReviews/reviewService.ts`, `routes/{monitoring,receptionistMonitoring}.ts`, migration + rollback, `docs/backend-program/P7_SPEC.md` |
| Modified | webhook route (end-of-call metering + cap evaluation, best-effort), voiceIssueService (+`usage_pause_requested`, fire-and-forget critical alert hook), routes/index.ts (+2 routers), server index.ts (backfill sweep on the reconciliation flag, digest scheduler on its own flag), inventory pins (9 migrations / 21 domain / 48 public) |
| New env contract (all inert) | `VOICE_USAGE_INCLUDED_MINUTES` (unset = metering-only; malformed throws), `VOICE_ALERTS_ENABLED` + `RESEND_API_KEY`/`VOICE_ALERTS_FROM`/`VOICE_ALERTS_TO` (pinned api.resend.com, no SDK), `VOICE_DIGEST_ENABLED`, `VOICE_METRICS_TOKEN` (unset = /metricz does not exist) |
| Deferred live gate | Sending any alert/digest (flags off, no key), acting on any pause_requested state (owner decision via the P6 pause route) |
| Residual risks | Metering periods use report arrival time; digest manual re-runs are not idempotent (gated off); alert failures are logged/locally-refused, not persisted as issues (deliberate — avoids DB writes from the fire-and-forget path) |

P7 addendum: PR #12 merged as `d9accb43032ef2d93aa1ded3d38d4b19b72c32c8`.
First phase green on the first CI run (the P6 defect-family lesson —
construct failing fixture cases explicitly — was applied while writing
the tests, not after CI caught it).

## P8 — Billing, entitlements, and accounts (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p8-billing-accounts (merge SHA recorded in the P9 addendum) |
| Migration | voice `0006_dizzy_komodo` — voice_subscriptions (unique firm + unique stripe customer; grace⇒deadline CHECK), voice_account_tokens (hash-only, purpose+shape CHECKs), voice_account_states, voice_firm_members (lowercase-email CHECK), voice_audit_log (append-only, actor/action-shape CHECKs); rollback refuses on live subscriptions or audit evidence. |
| New files | `lib/voiceBilling/{entitlements,subscriptionState,stripeWebhookAuth,voiceAccountsBilling.test}.ts`, `lib/accountSecurity/accountTokens.ts`, `lib/voiceAccounts/{auditLog,membership}.ts`, `routes/{receptionistAccount,adminVoiceDiagnostics,voiceBillingWebhook}.ts`, migration + rollback, `docs/backend-program/P8_SPEC.md` |
| Modified | app.ts (raw-body mount for the billing webhook), routes/index.ts (+3 routers), server index.ts (hourly grace-expiry sweep on the reconciliation flag), voiceIssueService (+`billing_suspended`), alertTransport (per-message `to` for account emails), inventory pins (10 migrations / 26 domain / 53 public) |
| New env contract (all inert) | `VOICE_PLAN_CATALOG_JSON` + `VOICE_DEFAULT_PLAN_CODE` (fail-closed catalog), `VOICE_BILLING_GRACE_DAYS` (default 7, bounded), `VOICE_BILLING_WEBHOOK_SECRET` (unset = webhook 503s) |
| Deferred live gate | Any Stripe resource/webhook/price change; entitlement enforcement; multi-user login sessions (roster + invitations are the prepared surface); acting on `suspended` |
| Residual risks | In-route limiter is per-process memory (defense-in-depth over token unguessability); subscription mapping rows are admin-set pending an owner-approved checkout metadata change; account emails require the alert transport to be enabled (503 otherwise, documented) |

P8 addendum: PR #13 merged as `6cfd3dddd00feee6b34a73b14c5b78292469406a`.
Green on the first CI run.

## P9 — Deployment, recovery, and operations (2026-08-30)

| Item | Value |
| --- | --- |
| PR | phase/p9-deployment-recovery (merge SHA recorded in the final report) |
| Migration | none — tooling and procedure only |
| New files | `lib/db/src/{migrate-preflight,restore-guards,db-backup,db-restore-drill}.mjs`, `lib/db/deployRecoveryContract.test.ts`, `api-server src/lib/{envContract,envContract.test}.ts`, `docs/backend-program/deploy/{STAGING_MANIFEST,PRODUCTION_MANIFEST,STARTUP_CONTRACT}.md`, `docs/backend-program/runbooks/{ROLLBACK,SECRET_ROTATION,NUMBER_PAUSE,INCIDENT}.md`, `docs/backend-program/{RELEASE_CHECKLIST,PILOT_ACTIVATION,P9_SPEC}.md` |
| Modified | lib/db package.json (+preflight/backup/restore:drill scripts), migrate-guard.mjs (readState exported), scripts package.json (test chain +deployRecoveryContract), server index.ts (boot env-contract logging — behavior unchanged) |
| New env contract | none — P9 registers and validates the existing 40-variable contract instead (completeness-tested source scan) |
| Deferred live gate | Executing any deploy/migration/backup/drill against a real environment; every activation step in PILOT_ACTIVATION.md marked [OWNER] |
| Residual risks | Graceful-drain contract absent (documented); CALENDAR_TOKEN_KEY rotation requires firm reconnects (documented); drill assumes pg client binaries at the operator's machine (guards are what CI tests) |

P9 addendum: PR #14 merged as `54ae1c87660b0d43207e562be5d582657dd9d4b3`.
Two in-phase CI catches: the tools-config probe validated process.env
instead of the env under test (default-parameter family again — fixed
`f68a02f`), and the P9 guard fixtures tripped the postgres-url secret
rule because the local pre-commit scan sees only TRACKED files (fixture
allowlisted `e4d7942`; lesson: `git add -A` before the local scan).

## Program complete (2026-08-30)

All nine phases merged through protected main with real green CI.
The full accounting is `FINAL_REPORT.md`; activation path is
`PILOT_ACTIVATION.md`. Nothing was deployed, migrated, or activated —
every live capability awaits its [OWNER] step.
