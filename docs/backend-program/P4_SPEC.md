# P4 — Per-firm calendar truth

Objective: availability reflects each firm's real Google busy time, and a
confirmed booking exists on their calendar — with the connect flow, token
handling, and event writing production-grade but DISABLED by default, and
no Google credential, consent, or live request anywhere.

## Scope

- **Migration** (scheduling domain journal, `0001_black_reavers`):
  `scheduling_calendar_connections` (one per firm+provider; AES-256-GCM
  token envelopes; active/revoked) and `scheduling_calendar_oauth_states`
  (one-time hashed states + encrypted PKCE verifiers). Rollback SQL under
  `drizzle/scheduling-rollback/`. The `scheduling_` prefix keeps both tables
  under the push `tablesFilter` deletion protection. **No new linkage
  column**: the requests table already carries `providerEventId` +
  `providerCalendarId` with the Checkpoint-B CHECK making `status='booked'`
  unrepresentable without both — this phase builds on that invariant
  instead of duplicating it.
- **Crypto** (`tokenCrypto.ts`): AES-256-GCM envelopes, 32-byte
  `CALENDAR_TOKEN_KEY`, fail-closed loader, tamper-indistinguishable errors.
- **OAuth** (`googleOAuth.ts`): PKCE S256, offline+consent, pinned Google
  endpoints, injectable transport, `invalid_grant` classification. Config
  from env only (https redirect enforced).
- **Connect routes** (`receptionistCalendar.ts`): start (one-time hashed
  state + encrypted verifier), callback (session-authenticated, state
  consumed via single DELETE…RETURNING, upsert re-activates), disconnect
  (always available). Everything else 503 until
  `CALENDAR_CONNECT_ENABLED="true"` + valid config + key.
- **Per-firm free/busy** (`PerFirmGoogleFreeBusyProvider`): wraps the
  existing workspace-level selection (connector/dev-token/null) — inert
  fall-through until a connection row exists. Stale-token refresh persists
  new envelopes; `invalid_grant` → revoked + `calendar_revoked` issue;
  provider errors degrade to internal-only availability + issue (booking
  still revalidates inside the advisory lock).
- **Event writer** (`eventWriter.ts`): create / patch-times / delete-by-id
  only; `iCalUID = publicId@sitemint.digital` for structural dedupe; bodies
  carry a name-only summary, never contact fields; delete treats 404/410 as
  success.
- **Booked sync** (`calendarEventSync.ts`, gated by
  `CALENDAR_WRITE_ENABLED`): `approveRequestToBooked` = insert event →
  guarded stamp (`pending_review/held → booked` + both ids in one UPDATE);
  a lost stamp race deletes the just-written event (no orphans).
  `removeCalendarEventForRequest` + a per-firm reconcile for lingering
  events on cancelled/rescheduled/failed/expired rows. The inverse
  direction needs no backfill — the CHECK forbids booked-without-event.
- Windows fix: the scheduling drizzle config normalizes `path.sep` so
  `generate` works on both platforms (POSIX no-op).

## Threat model

| Threat | Mitigation |
| --- | --- |
| Token theft from DB/backup | AES-256-GCM envelopes; key only in server env; revoked rows drop tokens |
| CSRF / authorization-code injection | One-time firm-scoped hashed state (single DELETE…RETURNING) + PKCE S256 |
| Token endpoints redirected | Google hosts pinned as constants; redirect URI env-validated https |
| Cross-tenant calendar access | Connections keyed+queried by firmId; provider resolves per firm; callback firm = session firm |
| Orphan events blocking real calendars | Write-then-stamp with compensating delete; iCalUID convergence; reconcile sweep |
| PII spilled into shared calendars | Event bodies: name-only summary; tested no-contact assertion |
| Availability outage on Google failure | Degrade to internal-only busy data + firm-scoped issue; never fabricate, never crash booking |
| Secret leakage in errors/logs | Errors name variables/rules; issue contexts carry ids and statuses only |

## Tests

`calendarIntegration.test.ts` (17 cases): crypto roundtrip/tamper/key
matrix; PKCE vectors; pinned auth URL parameters; exchange/refresh parsing
incl. form assertions; per-firm provider fall-through, fresh-token path,
refresh-and-persist, invalid_grant→revoked, degrade-on-error; event-body
iCalUID + no-PII; 404-tolerant delete; approve matrix (disabled/not_found/
not_approvable/idempotent/happy/write-fail/race-compensation); removal
matrix. CI's journal proofs exercise the migration on a throwaway Postgres
automatically (fresh, reverse-order, legacy-baseline, no-replay paths read
the committed folders dynamically).

## Exit criteria

- CI green; journal proofs pass with the new scheduling migration.
- No live capability enabled; no Google request possible without three
  separate env values that do not exist anywhere.

## Rollback

Revert the PR; the committed rollback SQL drops both tables (documented
token/connection loss); no existing column or constraint is touched.
