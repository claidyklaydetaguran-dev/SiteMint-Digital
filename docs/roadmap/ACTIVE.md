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

**No staging execution is authorized.** Before AR-001 staging UAT may begin, two
prerequisites remain: an isolated staging environment with its own database and
provider account, evidenced by the owner; and explicit owner authorization for real
provider activity. Cleanup readiness is now satisfied in code, but the command has
never been run against a real provider.

No additional phase or release may begin until AR-001 is either accepted or explicitly cancelled.
