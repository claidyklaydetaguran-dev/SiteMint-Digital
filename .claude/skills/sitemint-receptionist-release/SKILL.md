---
name: sitemint-receptionist-release
description: Complete and verify an authorized SiteMint receptionist release across its shared API, customer frontend, database and provider integrations.
---

Confirm source, environment and database identity; preserve existing CRM and Discovery.
Use reviewed versioned migrations, recoverable backups and a production-specific
restore rehearsal. Reuse evidence only while its relevant inputs remain unchanged.
Verify business ownership, roles, webhook authentication, replay handling, durable
jobs, usage limits and the actual deployed customer journey.
Distinguish implemented, deployed, customer-verified and deferred in the Pilot Ledger.
Require every launch-critical check to pass; a completion percentage cannot waive it.
Keep unresolved optional features disabled and disclose their status accurately.
Publish only to the authorized target through supported tools, retain rollback,
and verify the public version and critical flows after publication.

Repository anchors: `docs/ai-receptionist/RELEASE_PROCESS.md` (staging snapshot
releases via `scripts/release/package-site.mjs`), reviewed SQL via
`lib/db/src/apply-push-packet.mjs` and `lib/db/push-packets/`, versioned voice
migrations via `lib/db/src/migrate-guard.mjs` with `--target/--expect-db/--expect-fingerprint`.
Never run `migrate:fresh` or `drizzle-kit push` against an existing environment.
Staging is SiteMint-Voice-Staging (site-mint-voice-staging.replit.app); production is
Web-Asset-Builder (sitemintdigital.com).
