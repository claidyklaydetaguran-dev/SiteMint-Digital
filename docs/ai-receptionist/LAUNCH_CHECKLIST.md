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
| `SESSION_SECRET` | Receptionist sessions | Existing strong staging secret |
| `VOICE_PUBLISH_ENABLED` | API runtime | `true` for staging UAT |
| `VAPI_API_KEY` | API runtime | Vapi private server key |
| `VOICE_RUNTIME_CATALOG_JSON` | API runtime | Reviewed JSON catalog described below |
| `VITE_VOICE_PLATFORM_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_PUBLISH_ENABLED` | Dashboard build | `true` |
| `VITE_VOICE_BROWSER_TEST_ENABLED` | Dashboard build | `true` |
| `VITE_VAPI_PUBLIC_KEY` | Dashboard build | Vapi public browser key |

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

## Rollback

1. Set `VOICE_PUBLISH_ENABLED=false`.
2. Set all three `VITE_VOICE_*_ENABLED` flags to `false`.
3. Rebuild and redeploy the dashboard.
4. Leave the additive voice tables in place; do not run destructive rollback SQL during an incident.
5. Confirm the existing SMS receptionist still answers and handles STOP/START correctly.
