# SiteMint Backend Autonomous Execution Program — Final Report

Date: 2026-08-30. All nine phases merged into protected `main` through
one PR each, every merge behind a genuinely green CI run (`gates` +
`voice-matrix`, both required + strict + enforced on admins). Nothing
was deployed, migrated, activated, or purchased; every live capability
waits behind an owner-gated step.

## 1. Phases, PRs, and merge SHAs

| Phase | Scope | PR | Merge SHA |
| --- | --- | --- | --- |
| P1a | CI pipeline (gates + 20-variant voice matrix, disposable-postgres journal proofs, scanners) | #5 | `3a04c176` |
| P1b | Program docs + branch protection | #6 | `33809b9b` |
| P2 | Webhook lifecycle: HMAC policy + rotation overlap, idempotent event ledger, reconciliation, voice issues | #7 | `c973aa58` |
| P3 | Tool loop: closed 4-tool catalog, dispatcher onto real scheduling, result replay | #8 | `16ed1ac2` |
| P4 | Per-firm calendar truth: OAuth + AES-GCM token envelopes, free/busy, event write with compensation | #9 | `c9f290d8` |
| P5 | Contacts + voice SMS: identity, consent ledger (STOP wins), outbox, structural intake isolation | #10 | `875ffd46` |
| P6 | Numbers: lifecycle state machine, inventory-only inbound routing, approved-destination transfers, call policy, emergency scan | #11 | `1cfc4b40` |
| P7 | Metering: immutable usage ledger, cap → recorded pause request, alerts/digest (off), reviews, readyz/metricz | #12 | `d9accb43` |
| P8 | Billing/accounts: subscription state machine + Stripe webhook (mapping-only firm resolution), tokens/reset/verification, membership, audit log | #13 | `6cfd3ddd` |
| P9 | Ops: migrate preflight (hash-drift detection), guarded backup/restore drill, 41-var env contract, manifests, runbooks, activation path | #14 | `54ae1c87` |

Full SHAs and per-phase details: `EXECUTION_LEDGER.md`. This report's
own PR is the final merge.

## 2. CI evidence

Every phase merged on a green run of the exact head SHA; the ledger
records the runs. CI caught real defects in five of nine phases (fixture
spreads ×2, the drizzle 0002 snapshot-gap re-emission, the
default-parameter family ×2, inventory-pin drift each migration phase,
and the tracked-files secret-scan gap) — the gates did the job they were
built for in P1.

## 3. Database inventory

10 versioned migrations across three domain journals (each with its own
journal table): voice 0000–0006, discovery 0000, scheduling 0000–0001.
26 domain tables + 27 push-mode barrel tables = **53 public tables**
(counts are DERIVED in the contract tests, not pinned). Every voice
migration has committed rollback SQL whose guards refuse while live
state (assigned numbers, mid-flight SMS, billing evidence, live
subscriptions, audit rows) would be destroyed. `migrate:fresh` is
bootstrap-only; `preflight` reports drift read-only before any migrate.

## 4. Implemented capabilities (all inert until activation)

Provider-verified webhooks with rotation and idempotency; call-state
folding and reconciliation; a closed tool loop that books/reschedules/
cancels against the firm's real scheduling; per-firm calendar truth with
compensating writes; caller identity + consent-disciplined SMS
structurally isolated from the intake pipeline; a number lifecycle whose
inbound routing answers only from our inventory and whose transfers only
reach stored approved destinations; server-owned call policy; emergency
language flagging; immutable per-call metering with cap → recorded pause
request; operator alerts + daily digest behind their own flags; staff
review lifecycle; subscription dunning state machine driven by a
signature-verified Stripe webhook that cannot attach events to firms by
request data; enumeration-proof password reset, email verification,
membership invitations, append-only audit; readiness + token-gated
metrics; and the full deploy/recover/rotate/pause/incident procedure
set.

## 5. The dormant environment contract

41 variables, registered and completeness-tested in
`artifacts/api-server/src/lib/envContract.ts` (14 exact-"true" flags —
every one currently off; 12 secrets — none currently exists anywhere;
13 fail-closed configs; 2 identifiers). Boot logs `[env contract]`
findings for do-nothing flag values and configs that would refuse at use
time.

## 6. Hard stops that remain with the owner

Purchasing/importing/porting/releasing any number (the production
`PhoneNumberProvider` throws); creating/changing anything at Vapi,
Twilio, Google, Stripe, or Resend; any staging/production migration or
deploy; flipping any flag; the missed-call text-back policy (rows are
born `blocked_no_consent`); acting on any `pause_requested`/`suspended`
state; recording/transcripts (`VOICE_ARTIFACT_POLICY` stays `none`).

## 7. Business-policy decisions awaiting the owner

Plan catalog contents and pricing; included minutes / cap posture and
what "over cap" means commercially; grace-days length; missed-call
text-back on/off; digest and alert recipients; retention posture beyond
`none`; multi-user login (the roster is ready; the auth change is not
authorized); entitlement ENFORCEMENT semantics for suspended/canceled
firms.

## 8. Completion assessment

Against the Master Audit baselines: SMS product unchanged (~85%,
untouched by design, 0-line diffs proven every phase). Voice pilot
backend: **code-complete for a controlled pilot** — what remains is
activation, not construction (audit baseline was ~55%). Scalable V1
backend: ~85% (multi-user auth, entitlement enforcement, and a
transcript/retention decision are the notable gaps; audit baseline
~40%). Frontend remains deferred per the program.

## 9. First paid-pilot activation sequence

`PILOT_ACTIVATION.md` — six stages, every provider/spend/flag step
marked `[OWNER]`, per-step verification, ordered so that each stage is
independently reversible (flags off = safe state at any point).

## 10. Exact next authorization

> **AR-002 AUTHORIZED — controlled staging activation, stages 1–2.**
> On the Replit staging App only: set the Stage 1 provider variables
> (staging Vapi key + webhook secret, `VOICE_ARTIFACT_POLICY=none`,
> runtime catalog, server URL; bearer bridge permitted on staging),
> flip `VOICE_PUBLISH_ENABLED` + `VOICE_WEBHOOK_ATTACH_ENABLED` +
> `VOICE_TOOLS_ATTACH_ENABLED`, publish the staging assistant, point
> the Vapi server URL at the staging webhook, and run one browser test
> call. Verify per PILOT_ACTIVATION stages 1–2 (event rows, metering
> row, contact link, no transcript). Report PASS/BLOCKED with evidence;
> change nothing beyond the listed variables and flags.
