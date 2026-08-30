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
