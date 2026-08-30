# Staging deployment manifest

The single description of what the staging environment runs and holds.
The variable-by-variable source of truth is
`artifacts/api-server/src/lib/envContract.ts` (completeness-tested);
this manifest states the POSTURE. Secret NAMES for the Replit staging App
follow `docs/ai-receptionist/LAUNCH_CHECKLIST.md` §2/§2a.

## Services

| Service | Command | Port |
| --- | --- | --- |
| API server (all products) | `pnpm --filter @workspace/api-server run start` (after `run build`) | 8080 |
| AI Receptionist dashboard | static build of `artifacts/helpdesk` (`PORT=21622 BASE_PATH=/ai-receptionist/dashboard`) | 21622 |

## Required at boot (staging)

| Variable | Note |
| --- | --- |
| `DATABASE_URL` | The staging database. Identify it before ANY migration (`pnpm --filter @workspace/db run preflight`); never print it. |
| `ADMIN_PASSWORD` | Unset = admin login 503s (acceptable during pure receptionist testing). |
| `CORS_ALLOWED_ORIGINS` | Required only when `NODE_ENV=production` is set; staging usually runs without it. |

## Flag posture: EVERYTHING OFF

Staging boots with **every** voice flag unset. That is a working state:
webhooks 503/refuse, publish/sync/tools report `*_disabled`, sweeps
register nothing, SMS/alerts/digest/metrics do not exist. Individual
flags are turned on one at a time by an owner-approved activation step
(see `../PILOT_ACTIVATION.md` for the order and the verification after
each step).

Staging-acceptable deviations from production posture:

- `VAPI_WEBHOOK_ALLOW_BEARER="true"` is permitted on staging only (the
  bearer bridge; production is HMAC-only).
- `VOICE_SMS_OWNER_FIRM_ID` may pin the single test firm until numbers
  exist in `voice_numbers`.

## Database

- Domains: base push (bootstrap) + versioned journals voice/discovery/
  scheduling, each with its own journal table (`drizzle.__drizzle_migrations_<domain>`).
- Before every migration: `pnpm --filter @workspace/db run preflight`
  must print a safe plan (exit 0). Apply with the guarded
  `migrate:<domain>` commands only — never raw drizzle-kit, never push
  for domain tables.
- The stripe.* schema belongs to the Replit connector
  (see memory of AR-001O: `DROP SCHEMA public CASCADE` strips its
  triggers and does not heal itself — never do that).

## Health

- Liveness: `GET /api/healthz` → `{"status":"ok"}`
- Readiness: `GET /api/readyz` → 200 `ready` / 503 `not_ready` (db ping)
- Metrics: `GET /api/metricz` only if `VOICE_METRICS_TOKEN` is set (404 otherwise)

## Boot log check

After every deploy, read the `[env contract]` boot lines: they name any
flag set to a value that does not enable it and any fail-closed config
that would refuse at use time. A clean boot logs
`[env contract] clean`.
