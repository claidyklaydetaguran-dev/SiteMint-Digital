# AI Receptionist Browser Voice — Staging Launch Checklist

## 1. Confirm the release source

- [ ] Use `feature/ai-receptionist-today-mvp`.
- [ ] Confirm the worktree is clean except for the reviewed release diff.
- [ ] Confirm no protected file listed in `CLAUDE.md` changed.
- [ ] Do not merge or deploy another Claude voice branch.

## 2. Configure staging

Set these as staging secrets or build variables. Never paste their values into a prompt, log, issue, commit, or screenshot.

| Variable | Where used | Required value |
|---|---|---|
| `DATABASE_URL` | API and migration | Staging database only |
| `VOICE_PUBLISH_ENABLED` | API runtime | `true` for staging UAT |
| `VAPI_API_KEY` | API runtime | Vapi private server key |
| `VOICE_RUNTIME_CATALOG_JSON` | API runtime | Reviewed JSON catalog described below |
| `VITE_VOICE_PLATFORM_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_PUBLISH_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_BROWSER_TEST_ENABLED` | Dashboard build | `true` |
| `VITE_VAPI_PUBLIC_KEY` | Dashboard build | Vapi public browser key |

Receptionist sessions use **server-generated randomness**, not a signing secret.
`createSession()` generates a 40-byte token with `crypto.randomBytes` and stores it
in the `receptionist_sessions` table, so session persistence and integrity depend on
the database rather than on an environment variable. No `SESSION_SECRET` is read
anywhere in the code path; `DATABASE_URL` and genuine database isolation are the
staging requirements that matter here.

`VOICE_RUNTIME_CATALOG_JSON` must be version `1` and may contain only SiteMint's four preset keys. Replace every placeholder with an identifier verified in the connected Vapi account:

```json
{
  "version": 1,
  "presets": [
    {
      "key": "natural-balanced",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "fast-response",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "highest-intelligence",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    },
    {
      "key": "budget-friendly",
      "provider": "vapi",
      "model": { "provider": "REPLACE", "model": "REPLACE" },
      "voice": { "provider": "REPLACE", "voiceId": "REPLACE" },
      "transcriber": { "provider": "REPLACE", "model": "REPLACE", "language": "en" }
    }
  ]
}
```

The dashboard flags and public key are embedded during the Vite build. Rebuild after changing them. The Vapi private key is server-only.

## 3. Verify code before touching the database

```bash
pnpm run test
pnpm run typecheck
PORT=21622 BASE_PATH=/ai-receptionist/dashboard pnpm run build
```

- [ ] All commands pass.
- [ ] Review `git diff --check`.
- [ ] Review the generated voice migration and rollback SQL.

## 4. Apply the voice migration to staging

This is a manual, owner-approved action. First verify the active environment without printing the database URL.

```bash
pnpm --filter @workspace/db run migrate:voice
```

- [ ] Migration applied to staging only.
- [ ] `voice_assistants`, `provider_webhook_events`, and `voice_issues` exist with firm foreign keys and indexes.
- [ ] Existing `intake_*` and `crm_*` schema remains unchanged.

## 5. Run the real staging journey

- [ ] Sign up or sign in through `/ai-receptionist/dashboard/login`.
- [ ] Open Assistants and create one from a template.
- [ ] Save a valid name, greeting, prompt, and non-custom voice preset.
- [ ] Publish once.
- [ ] Confirm status becomes `Published` and provider becomes `Connected`.
- [ ] Start Browser Test and accept microphone permission.
- [ ] Speak at least three turns and confirm usable response latency and audio.
- [ ] End the test and confirm the UI returns to a terminal ended state.
- [ ] Reload the page and confirm the assistant remains published.
- [ ] Repeat once on a 390px-wide mobile viewport.
- [ ] Verify no browser console errors or secret/provider payload leakage.

## 6. Release decision

The browser voice launch candidate is accepted only when every staging item passes. Phone calls, appointment booking, transcripts, recordings, CRM handoff, contacts, analytics, and voice billing remain separate work and must not be described as complete.

## 6a. Clean up the staging assistant (required)

Publishing creates a real assistant inside the provider account. Nothing in the
dashboard can remove it, and the local row cannot be deleted while it carries a
provider link, so cleanup is an explicit operator step.

The command is dry-run by default and refuses to run unless
`VOICE_STAGING_CLEANUP_ENABLED=true` and `NODE_ENV` is not `production`.

### Manual provider-dashboard pre-check (required before any real deletion)

Do this in the Vapi dashboard **before** running the command with `--execute`.
It is not automated and must not be: no linked-resource API is assumed to
exist, and none may be invented to skip this step.

- [ ] Confirm the provider assistant ID, character for character, against the
      dry-run output.
- [ ] Confirm the Vapi organization / workspace the assistant belongs to is the
      staging one, not any other organization.
- [ ] Confirm **zero phone numbers** reference the assistant.
- [ ] Confirm **zero squads** reference the assistant.
- [ ] Confirm **zero workflows** reference the assistant.
- [ ] Record who performed the check, and when, alongside this checklist.
- [ ] **Stop if any link exists.** Remove the link first, or escalate — do not
      delete a linked assistant.

Vapi does not document what deleting an assistant does to a resource that
references it. Never assume deletion cascades to a phone number, squad, or
workflow, and never assume it leaves them intact either.

### Run the command

```bash
pnpm --filter @workspace/scripts run cleanup-staging-assistant -- --firm-id=<n> --assistant-id=<n>
```

`--firm-id` and `--assistant-id` must be positive decimal integers — no sign,
no leading zero, no exponent, no whitespace. A malformed identifier is refused
before the database module is loaded.

- [ ] Read the dry-run output and copy the reported provider assistant id.
- [ ] Complete the pre-check above.
- [ ] Re-run with `--confirm=<that id> --execute`.
- [ ] Confirm the command reports `CLEANED` and exits 0.
- [ ] Confirm the assistant is a draft again, then delete it normally.
- [ ] Confirm the assistant is gone from the provider account.

`CLEANED` is reported only when Vapi returned its one documented success for
this endpoint: HTTP `200` carrying a JSON assistant object whose `id` is
exactly the id that was requested. Every other response — any other 2xx, an
empty or unparseable body, a missing or mismatched id — is reported as
uncertain and changes nothing locally.

Stop rules — do not improvise past any of these:

- **UNCERTAIN**: the remote outcome is unknown. Do not re-run to "make sure", and do
  not assume deletion. Verify the resource in the provider account first.
- **UNCERTAIN with `providerErrorCode: NOT_FOUND`**: the provider answered HTTP 404.
  Vapi does not document whether that means the assistant is absent, inaccessible,
  or owned by a different organization, so **a 404 does not authorize local
  reconciliation**. Nothing was written. Stop and escalate to the owner; do not
  re-run, and do not edit the row by hand.
- **PROVIDER REFUSED**: the request was definitively rejected. Nothing was deleted
  and local state is unchanged. Resolve the cause before re-running. No
  provider-dashboard investigation is required for this outcome — the remote
  outcome is known.
- **PARTIAL**: remote deletion is confirmed but the local row was not reconciled.
  Blindly rerunning cannot repair this: the second `DELETE` would answer 404, which
  proves nothing. Verify the assistant's absence in the provider dashboard, then
  reconcile local state only under a separately authorized procedure. A stale local
  link is the safer end state; do not clear it to tidy up.
- Never use the voice rollback SQL as cleanup. Dropping the tables destroys the only
  record of the provider assistant id and orphans the remote resource permanently.

### Handling the identifiers

- `--confirm=<providerAssistantId>` is typed on the command line and will be
  retained in shell history. Treat provider assistant IDs as operationally
  sensitive identifiers: they name a real remote resource and appear nowhere in
  the dashboard.
- Clear or exclude the history entry afterwards on any shared operator machine.
- Secrets, API keys, connection strings, tokens, and session cookies must never
  appear in the command, in its arguments, or in anything pasted into a log,
  ticket, or this checklist. The command is designed to need none of them on the
  command line: `VAPI_API_KEY` and `DATABASE_URL` are read from the environment.

## Rollback

1. Set `VOICE_PUBLISH_ENABLED=false`.
2. Set all three `VITE_VOICE_*_ENABLED` flags to `false`.
3. Rebuild and redeploy the dashboard.
4. Leave the additive voice tables in place; do not run destructive rollback SQL during an incident.
5. Confirm the existing SMS receptionist still answers and handles STOP/START correctly.
