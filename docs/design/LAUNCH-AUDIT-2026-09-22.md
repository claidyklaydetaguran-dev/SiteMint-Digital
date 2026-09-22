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
- Complete backend suite on isolated release `6ff789b` with freshly bootstrapped `crm_test_d`: **132 files, 2,319 tests passed, no skips**, exit 0. Child environment excluded live provider credentials; test delivery mode was enabled. This establishes automated application behavior on the current schema, not successful live-provider delivery or production browser login.
- Updated public frontend Vite build passed. Prerender passed: 22 documents and SPA fallback, exit 0.
- Database-dependent tests and authenticated production journeys are not certified by the no-database unit run.
- Voice staging health/readiness respond 200; browser reaches its sign-in page after retry. No successful authenticated staging journey is claimed yet.

## Account assignments

- Business owner: confirmed business mailbox, existing `owner` role.
- Technical director: confirmed personal mailbox, existing `technical_admin` role.
- These are confirmed desired assignments, not provisioned accounts. Customer calendars connect through the customer's own Google authorization.

## Remaining release gates

Fresh guarded backup completed from `neondb`, fingerprint `d375623a3d85`, to `/tmp/sitemint-backup-20260922.dump` inside Web Asset Builder: 229,840 bytes, mode 600. This temporary backup must not be packaged or committed. Restoration and upgrade verification remain separate requirements.

Restore completed into newly created development-only `scratch_release_20260922` (fingerprint `355ba9dfb61e`). Both reviewed CRM packets (`0001`, `0002`) and voice/discovery/scheduling migrations passed using the identity-gated runners. Lead/task/discovery counts stayed 3/40/8. All 1,587 column definitions (type, nullability, default) match the test database. Staff and voice-notification tables are now present in the rehearsal only.

Indexes/constraints are not byte-for-byte identical to the fresh schema: the restored database retains a partial unique email index on intake_firms rather than a named UNIQUE constraint, and an extra receptionist_sessions firm index and cascading firm foreign key. Counts: fresh 357 indexes / 409 constraints; rehearsal 358 / 409. Preserve existing objects and assess the differences; no production constraint was removed or changed. No current application reference to the named email constraint was found.

Public package `02421d7`, source `f531741`, is pushed and checksum-verified in the marketing workspace. Replit republish was started; live verification is required before calling it deployed. Rollback directory: `mkt.rollback-mint-f531741`.

1. Isolated schema bootstrap and all backend automated tests passed. Browser-authenticated journeys remain to verify.
2. Backup and additive upgrade rehearsal passed with preserved checked record counts. Review the preserved index/constraint differences and production identity before production migration.
3. Resolve production settings, build provenance and provider enablement.
4. Deploy exact reviewed artifacts and verify public routes, staff access, invited portal access and receptionist access through the real domain.
5. Publish evidence of supported pilot capabilities and unresolved provider dependencies. Do not claim the whole product is ready from HTTP status codes or passing unit tests alone.
