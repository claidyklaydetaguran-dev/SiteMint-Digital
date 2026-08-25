# Active SiteMint Delivery

**Only active delivery:** `AR-001 — AI Receptionist Browser Voice Launch Candidate`

**Current implementation branch:** `redesign/frontend-v2`

**Historical / superseded branch references:** `claude/milestone-1-f2b-readiness-kvbe27`
(canonical starting point) and `feature/ai-receptionist-today-mvp` (working branch).
Neither exists in the current worktrees or their local remote-tracking refs. They are
retained here as historical references and treated as superseded by
`redesign/frontend-v2` unless later proven otherwise against the remote.

**Exit requirement:** A staging user can sign in, create and save an assistant, publish it to Vapi exactly once, complete a browser microphone call, and see accurate status/error handling. Typecheck, tests, builds, protected-file checks, and the launch checklist must pass.

The following are explicitly not active today:

- Inbound phone-number calling
- Appointment-calendar tools
- End-of-call transcript or recording ingestion
- CRM contact handoff
- Usage billing
- Contacts and analytics expansion
- Public production launch

## Status

AR-001 remains **active and unexecuted**. It is not accepted.

- **AR-001A — completed.** Provider-safe test infrastructure: a browser voice-client
  fake and a publish-service harness driving the real `publishAssistant()` through
  deterministic fakes. Test-only; zero production files changed.
- **AR-001B — staging execution blocked.** The readiness audit found no evidenced
  isolated staging environment and no verified provider-resource cleanup path.
- **AR-001C — completed.** A guarded operator-only staging cleanup command
  (`pnpm --filter @workspace/scripts run cleanup-staging-assistant`), dry-run by
  default, plus corrections to this file, `LAUNCH_CHECKLIST.md` and `CLAUDE.md`.
- **AR-001D — completed as a read-only contract audit, and it required correction.**
  It executed nothing and changed nothing. It found the AR-001C cleanup command not
  yet safe for controlled staging validation: a Vapi DELETE 404 was treated as proof
  of absence and cleared the local provider link; only the documented `200` success
  shape was unvalidated; `400`/`422` were not mapped to a definitive rejection; the
  request deadline stopped at the response headers and did not cover the body read;
  and CLI identifiers used permissive numeric coercion.
- **AR-001E — completed.** The cleanup-hardening correction for those findings. A
  404 is now classified as uncertain and performs zero local writes; the
  `already_absent` success shape is removed and unrepresentable; deletion is
  definitive only on HTTP `200` with a JSON assistant object whose `id` exactly
  matches the requested id; every other 2xx is uncertain; `400`/`422` map to
  `VALIDATION_FAILED`; the timeout covers dispatch, headers, body read and parse;
  and CLI identifiers require strict positive base-10 integers, rejected before any
  database or provider module is loaded. No acknowledgement flag was added, and none
  may be: operator acknowledgement cannot convert undocumented provider behavior
  into proof. Partial success (remote deleted, local reconcile failed) now stops and
  requires manual dashboard verification plus a separately authorized reconciliation
  procedure, instead of advising a blind rerun.

**Real Vapi behavior remains unverified.** Every AR-001E assertion is made against
local fetch stubs. Nothing in this correction contacted `api.vapi.ai`, used a
provider credential, or touched a database, and the cleanup command has still never
been run against a real provider.

**No staging execution is authorized.** Before AR-001 staging UAT may begin, three
prerequisites remain: an isolated staging environment with its own database and
provider account, evidenced by the owner; explicit owner authorization for real
provider activity; and isolated staging evidence of what a Vapi DELETE 404 actually
means for a same-organization versus a cross-organization assistant, since the
cleanup command deliberately refuses to reconcile without it.

No additional phase or release may begin until AR-001 is either accepted or explicitly cancelled.
