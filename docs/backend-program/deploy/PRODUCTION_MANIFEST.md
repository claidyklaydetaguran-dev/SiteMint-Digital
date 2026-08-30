# Production deployment manifest

Everything in `STAGING_MANIFEST.md` applies, plus the hard production
rules below. Variable source of truth:
`artifacts/api-server/src/lib/envContract.ts`.

## Non-negotiable production posture

| Rule | Enforcement |
| --- | --- |
| `NODE_ENV=production` | Operator-set; activates the CORS requirement. |
| `CORS_ALLOWED_ORIGINS` set to the exact site origins | Startup FAILS before the port opens without it. Never `origin: true`, never wildcard+credentials. |
| `ADMIN_PASSWORD` set (strong, unique) | No fallback exists; unset = admin 503. |
| `VAPI_WEBHOOK_ALLOW_BEARER` ABSENT | The bearer bridge is staging-only; production webhook auth is HMAC with ±300 s freshness. |
| `VOICE_ARTIFACT_POLICY=none` | The only approved value (AR-001). A missing/invalid value fails publish before any provider request. |
| Every `VOICE_*_ENABLED` flag off until its activation step | Owner approval per flag; see `../PILOT_ACTIVATION.md`. |
| `VITE_VOICE_*_ENABLED` build flags false in the dashboard build | The disabled build contains no provider SDK/URL (CI's built-output scan + 20-variant matrix prove it). |
| Intake SMS isolation | `VOICE_TWILIO_*` values must differ from `INTAKE_TWILIO_*` (the loader structurally refuses equality). The intake number is NEVER imported into Vapi. |

## Secrets checklist (production values, never shared with staging)

`VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET` (+`_PREVIOUS` during rotation only),
`VOICE_BILLING_WEBHOOK_SECRET`, `CALENDAR_TOKEN_KEY`,
`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, `VOICE_TWILIO_ACCOUNT_SID`/`_AUTH_TOKEN`,
`RESEND_API_KEY`, `VOICE_METRICS_TOKEN`, `ADMIN_PASSWORD`, `DATABASE_URL`.

Rotation procedures: `../runbooks/SECRET_ROTATION.md`.

## Database

- Production migrations are OWNER-APPROVED events, never routine:
  1. `pnpm --filter @workspace/db run backup -- --out <file>.dump`
  2. `pnpm --filter @workspace/db run restore:drill -- --from <file>.dump`
     against a disposable database → must print PASS
  3. `pnpm --filter @workspace/db run preflight` → safe plan, exit 0
  4. the guarded `migrate:<domain>` commands from the plan, in order
  5. re-run `preflight` → "nothing to do"
- Rollback SQL for every voice/scheduling migration is committed under
  `lib/db/drizzle/<domain>-rollback/`; procedure in `../runbooks/ROLLBACK.md`.
- Never edit an applied migration's bytes (hash-locks every migrate
  command — `lib/db/MIGRATIONS.md`). `preflight` detects this drift.

## Release

Ship only through `../RELEASE_CHECKLIST.md`: merge-commit main, green
`gates` + `voice-matrix`, tagged SHA, boot-log env-contract check, and
the health triplet after cutover.
