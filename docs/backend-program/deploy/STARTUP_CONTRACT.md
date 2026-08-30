# Startup and readiness contract

What the API server guarantees about its own boot, and what an
orchestrator may rely on.

## Boot sequence (api-server `src/index.ts`)

1. **Config that can refuse boot** — production CORS validation
   (`CORS_ALLOWED_ORIGINS` empty/invalid under `NODE_ENV=production`
   exits before the port opens). Nothing else refuses boot.
2. **Internal Stripe schema migration** (`runStripeMigrations`) — an
   internal database step, independent of `STRIPE_BOOT_SYNC_ENABLED`.
3. **Port opens** (8080). From here liveness is green.
4. **Background registrations**, each self-gated and logging its own
   disabled/enabled line:
   - campaign scheduler (60 s)
   - P2 call-state reconciliation (5 min, `VOICE_RECONCILIATION_ENABLED`)
   - P7 metering backfill (15 min, same flag)
   - P7 digest schedule (24 h, `VOICE_DIGEST_ENABLED`)
   - P8 grace-expiry sweep (60 min, reconciliation flag)
   - Stripe boot sync (only `STRIPE_BOOT_SYNC_ENABLED="true"`)
   - P9 env-contract validation (logging only; see below)
5. **Voice domain migrations are NEVER run by startup.** They are
   operator actions through the guarded commands.

## Endpoints an orchestrator may probe

| Endpoint | Meaning | Failure |
| --- | --- | --- |
| `GET /api/healthz` | process is alive and serving HTTP | (any non-200 = restart) |
| `GET /api/readyz` | database round-trip succeeds | 503 `not_ready` — hold traffic, do not restart on its own |
| `GET /api/metricz` | operator counters (uptime, db, events/ledger 24 h, unresolved issues) | 404 when `VOICE_METRICS_TOKEN` unset; 401 bad bearer |

Readiness failing while liveness passes means the DATABASE is the
problem; restarting the process will not help and loses in-memory admin
sessions.

## The env-contract boot lines

`[env contract]` lines appear once per boot (warn/error level):

- `warning` — a flag is set to a value that does not enable it (only the
  exact string `"true"` enables; `TRUE`, `1`, `yes` silently leave a
  feature OFF).
- `error` — a fail-closed config (call policy, plan catalog, cap,
  grace days, alert config, server URL, SMS/tools config under their
  flags) would refuse the moment its feature is touched.

These lines change no behavior. Treat any `error` line as a
must-fix-before-activation item.

## Shutdown

No graceful-drain contract is promised yet (sweeps hold no locks across
ticks; the SMS outbox claim uses `FOR UPDATE SKIP LOCKED`, so a killed
worker's rows simply time back). Documented as a P9 residual.
