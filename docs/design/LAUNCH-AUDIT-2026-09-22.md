# Launch audit — 22 September 2026

This is observed evidence, not a release certificate. Product decisions and flowcharts are in `PRODUCT-AND-WORKFLOWS.md`.

## Production and source

- Public domain `release.json` still identifies `3094afe`. Marketing polish `a6ff07d`, packaged as `6ff789b`, is not confirmed deployed.
- Public `/api/healthz`: 200. `/api/readyz`: 404.
- `/admin` and `/portal/sign-in` return older web-agency assets. An HTTP 200 alone does not prove that the SPA route or login works.
- Web Asset Builder publishing UI reports the last successful publish about two months ago. Its workspace HEAD is `194ff79` with extensive uncommitted source changes. Do not deploy that working tree by assuming HEAD identifies its content.
- An isolated copy of GitHub release `6ff789b2f21d617090dcb6416d33683d0083f3d0` is prepared at `/tmp/sitemint-launch-20260922` in Web Asset Builder. Frozen dependency installation succeeded with lifecycle scripts disabled.

## Configuration gaps

Replit Publishing settings explicitly lists CORS_ALLOWED_ORIGINS, CRM_LEGACY_BEARER_ENABLED, ADMIN_PASSWORD and CALENDAR_TOKEN_KEY as editor secrets missing from production. Workspace presence is not deployment configuration evidence. Voice settings are also listed as missing; do not blindly add development calendar overrides or enable paid providers.

The optional sandbox-to-live Stripe catalog synchronization is enabled in publishing settings. Resolve this before any backend publish; no synchronization or payment is authorized as a test. The development-database-copy option is unchecked and must stay unchecked.

## Read-only schema inspection

Queries used a read-only transaction and printed schema metadata only.

| Connection variable | Database | Public tables | crm_staff | voice_notifications | provider_call_id column |
| --- | --- | ---: | --- | --- | --- |
| DATABASE_URL | heliumdb | 35 | absent | absent | absent |
| SNAPSHOT_SOURCE | neondb | 27 | absent | absent | absent |

Historical reports identify SNAPSHOT_SOURCE as production; verify its fingerprint against the deployment target before any production write. These connections are not a substitute for inspecting the separate voice-staging app database.

The production rehearsal documented on 18 September tested the domain migrations. CRM's additive push packet must also be included and checked; a rehearsal without crm_staff cannot establish staff-login readiness. Application startup runs Stripe migrations, not all product migrations.

An empty `crm_test_d` database was created on the development server for disposable test fixtures after checking the connected database was `heliumdb`. Existing rehearsal databases were preserved. No customer rows or production schemas were changed.

## Validation

- Frontend: 17 test files, 161 passing tests; marketing server syntax check passed.
- Initial backend run: 1,716 passed, 599 skipped, two failing tests and one failing suite. Git ownership configuration and a cold Svix import accounted for two files; both passed on targeted rerun (18 tests).
- The remaining guard test exposed an eager database import when only reading the disposable-name allowlist. The helper now imports the client only when checking a connected database's identity. All four guard tests pass; the allowlist and identity enforcement are unchanged.
- Full local backend rerun: 96 files passed, 36 skipped; 1,720 tests passed and 599 database-dependent tests skipped. Exit 0.
- Updated public frontend Vite build passed. Prerender passed: 22 documents and SPA fallback, exit 0.
- Database-dependent tests and authenticated production journeys are not certified by the no-database unit run.
- Voice staging health/readiness respond 200; browser reaches its sign-in page after retry. No successful authenticated staging journey is claimed yet.

## Account assignments

- Business owner: confirmed business mailbox, existing `owner` role.
- Technical director: confirmed personal mailbox, existing `technical_admin` role.
- These are confirmed desired assignments, not provisioned accounts. Customer calendars connect through the customer's own Google authorization.

## Remaining release gates

1. Verify isolated schema bootstrap and CRM/auth journeys with test-only fixtures and delivery sinks.
2. Fresh production backup and restore rehearsal including CRM packet and domain migrations; verify data preservation and schema completeness.
3. Resolve production settings, build provenance and provider enablement.
4. Deploy exact reviewed artifacts and verify public routes, staff access, invited portal access and receptionist access through the real domain.
5. Publish evidence of supported pilot capabilities and unresolved provider dependencies. Do not claim the whole product is ready from HTTP status codes or passing unit tests alone.
