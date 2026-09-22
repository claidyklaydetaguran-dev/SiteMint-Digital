# Launch audit — 22 September 2026

This is observed evidence, not a release certificate. Product decisions and flowcharts are in `PRODUCT-AND-WORKFLOWS.md`.

## Latest release status (supersedes inspection snapshots below)

- **Backend retry published successfully.** Replit reports "Published your app" for deployment `eb7f0e0b-e301-492f-a337-82ef4c7d01a1`, build `1d9cef21-c842-4dd8-a9bb-17d28a56194f`. Public-domain health and readiness both return 200; readiness returns `{"status":"ready"}`. This supersedes the cancelled first attempt described below.
- `/api/crm/staff/bootstrap-state` returns 200 with `staffCount: 0`. Browser `/admin` renders "Create the first account"; `/portal/sign-in` renders the invited-client sign-in form; `/ai-receptionist/dashboard/login` renders receptionist sign-in. Their successful authenticated sessions are not yet verified. The owner setup page is handed to the owner for password entry/submission.
- CORS checked with real Origin headers: apex, www and the backend Replit origin each receive their exact allow-origin plus credentials=true. An untrusted example origin receives neither header. A non-browser HTTP 200 for the latter is expected; CORS restricts browser response access, not all network requests.
- Public Mint Clarity package `02421d7`, source `f531741`, is LIVE. The public release marker confirms it; homepage, receptionist page, pricing and portfolio return 200. Signup is noindex. Browser inspection found one homepage H1, no horizontal overflow at 1280px and no broken loaded images.
- API, helpdesk and web-agency builds all passed in Web Asset Builder. API/helpdesk source was checked against tested `6ff789b`; the web-agency frontend was updated from `02421d7`. Nine pre-existing helpdesk source files were preserved.
- The production additive upgrade was applied after the successful restore rehearsal, using both CRM packets followed by voice, discovery and scheduling guards against verified `neondb` / `d375623a3d85`. All exited 0. Checked lead/task/discovery counts remained 3/40/8; staff and notifications were both zero. Production schema-check passed.
- Four existing core deployment secrets were added to publishing settings: CORS_ALLOWED_ORIGINS, CRM_LEGACY_BEARER_ENABLED, ADMIN_PASSWORD and CALENDAR_TOKEN_KEY. Secret values were not exposed. Automatic Stripe sandbox-to-live catalog synchronization is OFF; development-data copying remains OFF.
- Backend publication was CANCELLED at Replit's generated-migration validation gate. Its old development schema caused proposed production table/column deletions. No destructive migration was approved. A subsequent production schema-check still passed. Public readiness remains 404 until a safe backend publish completes.
- Development `heliumdb` / `7d15e87d6b1b` was backed up to `/tmp/sitemint-dev-before-upgrade-20260922.dump`; both additive CRM packets succeeded there. Its legacy journal contains only voice 0000/0001. The guarded domain migration and full-history baseline both correctly refused this partial historical state. Development reconciliation is in progress; do not approve generated production deletions or overwrite production with development data.
- No real staff accounts, production test records, calls, outgoing messages or payments were created. Owner/technical-director assignment is decided; authenticated production access is still unverified.
- Development journal reconciliation subsequently passed a catalog proof against `crm_test_d`: all 90 required historical columns, 31 constraints and 18 indexes matched. The two existing legacy voice hashes matched the committed prefix exactly; scheduling 0000's existing objects were verified. A development-only, identity-checked transaction recorded those three historical entries in per-domain journals, preserving the legacy journal. No migration SQL was modified. Remaining guarded voice/discovery/scheduling upgrades then completed. All 1,587 public column definitions now match production exactly (zero missing, extra or different).
- A subsequent public-schema comparison also found all 409 constraints and 358 indexes identical between development and production. This preserves the pre-existing production index/constraint differences from a fresh database. The backend retry passed provisioning and began building. Cancellation had discarded pending publication settings, so the four existing keys were re-added and Stripe catalog sync disabled again before retrying.
- Live HTTP audit of every sitemap entry: all 14 canonical public URLs returned 200, each with one rendered H1, a page title and the matching canonical URL. Local evidence: `outputs/public-route-audit-20260922.json` outside the release repository. This is page/metadata evidence, not an inquiry submission or authentication test.

### Remaining acceptance work

1. Owner completes bootstrap in the live browser; then verify their authenticated session, reload and role access. Invite the confirmed technical director with the existing `technical_admin` role rather than making a second owner. No account or invitation is claimed complete yet.
2. Verify invited-client and receptionist authenticated journeys using staging test accounts, including tenant isolation and saved changes. Automated database-backed suites passed, but browser journey acceptance remains distinct.
3. Certify each pilot business's voice provider sync, customer calendar, caller consent, outbox and delivery evidence. SMS, paid billing, real calls and customer notifications have not been exercised in this release.
4. Receptionist sign-in still contains static "Available now" labels for voice/booking and "Planned" for caller texts. Those are product-level labels, not live integration readiness; revise them to assisted-setup wording before onboarding an external pilot business. Do not infer enabled providers from the login copy.

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
