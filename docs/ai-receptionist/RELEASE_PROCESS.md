# AI Receptionist — reproducible release process

Every release is a pair of commits that already exist on GitHub. Nothing reaches
a deployment that is not first pushed, and "is the deployment this commit?" is
answered by a file-by-file check, never by a bundle hash or a health check.

## Why

The staging workspace has no git remote. Code reached it through hand-typed
chunks and one-off patches, which let three kinds of drift accumulate: commits
deployed but never pushed, a test file that no transfer had ever included, and
line-ending differences nobody could tell apart from real changes.

## The recorded source

`.release/SOURCE.json` in the deployment's workspace names the commit it was
verified against, the manifest digest, and the file count. It is written only
after every shipped file matched.

Shipped source means: `artifacts/api-server/src`, `artifacts/helpdesk/src`,
`lib/db/src`, `lib/db/drizzle`, their `package.json` files, the helpdesk
`index.html` and `vite.config.ts`, the api-server `build.mjs`, and
`pnpm-lock.yaml`. The marketing site and CRM are not part of this release.

Files are compared with carriage returns stripped. Applied migration `.sql`
files on a deployment keep the exact bytes their journal hash was taken from;
rewriting their line endings locks every migration command out
(`lib/db/MIGRATIONS.md` §13), so the check must not require byte equality.

## Steps

1. **Gates on the source commit.** `pnpm run typecheck`, `pnpm run test`, and
   `git diff` on every protected file in `CLAUDE.md` = 0 lines.
2. **Push.** `git push origin <branch>` — never with `--force`.
3. **Package.**
   `node scripts/release/package-release.mjs --from <commit in SOURCE.json> --to <pushed commit> --out <scratch dir>`
   It refuses a `--to` commit that is not on origin. Add `--refresh <path,...>`
   only for a file the deployment is known to hold at different content.
4. **Transfer.** Upload `release-<tag>.b64` and `apply-release-<tag>.mjs` through
   the workspace file tree's upload input (not the Agent's attachment box), and
   move them out of the workspace root before publishing.
5. **Apply.** In the workspace shell, from `~/workspace`:
   `node <path>/apply-release-<tag>.mjs <path>/release-<tag>.b64`.
   It refuses a payload whose hash differs from the packaged one, refuses a tree
   that `git apply --check` rejects, and ends with `VERIFIED release <tag>`.
6. **Migrations**, only when the release adds one, and only with owner
   authorisation naming the database: follow `lib/db/MIGRATIONS.md`
   (identify the target, preflight, apply through `migrate:<domain>`, then
   `db-schema-check.mjs` to prove the objects exist).
7. **Build in the workspace.** `pnpm --filter @workspace/api-server run build`
   and `PORT=21622 BASE_PATH=/ai-receptionist/dashboard pnpm --filter @workspace/helpdesk run build`.
   Republish ships whatever `dist` holds, so the build is not optional.
8. **Publish**, then verify behaviour on the deployed host: a route the release
   adds answers (`401` without a session, `200` with one), and the served
   dashboard entry changed and contains the change.
9. **Confirm the record.** `node apply-release-<tag>.mjs --verify-only` passes,
   and the ledger names the commit.

## The production release (decided 2026-09-16)

Production is the **Web Asset Builder** app, serving `sitemintdigital.com`
through the SiteMint-Digital marketing proxy. It differs from staging in three
ways that change the steps above:

- **It has a git remote.** Steps 3–5 (package, transfer, apply) are not used
  there: the workspace fetches the pushed commit. The packager stays the tool
  for staging, which has no remote.
- **It ships the CRM from the same api-server.** The release is therefore the
  merge of both branches on `release/sitemint-production-2026-09-16`, and one
  session holds the deploy lock (Secrets, schema upgrade, build, Publish) so two
  sessions can never write to production at once.
- **Its database has never held this schema.** The upgrade is generated from
  production's real catalog and rehearsed on a restored copy before anything is
  applied. The receptionist side needs voice `0000`–`0013` and scheduling
  `0000`–`0003`; the discovery migration cannot be replayed there, because
  production already has the 15 columns it adds, so its two missing tables and
  its journal row are handled explicitly rather than by running it.

Four things must be true before Publish, each recorded with its evidence in the
ledger:

1. `CORS_ALLOWED_ORIGINS` is set. It is the only value read at module load: the
   API refuses to start in production without it.
2. The schema upgrade has been applied. Start-up runs only Stripe's own
   migration step, and the workers start immediately after.
3. `ADMIN_PASSWORD` exists, or no first staff owner can be created.
4. `CRM_EMAIL_TEST_MODE=false`, or production mail is only simulated.

Everything else in the receptionist's configuration is read at the moment it is
used, so a missing value is a clean refusal rather than a crash — but each
GROUP must be set completely or left off: the webhook attachment
(`VOICE_WEBHOOK_ATTACH_ENABLED`, `VOICE_SERVER_URL`, `VAPI_WEBHOOK_CREDENTIAL_ID`),
the tools attachment (`VOICE_TOOLS_ATTACH_ENABLED`, `VOICE_TOOLS_CAPABILITIES`),
and email (`VOICE_ALERTS_ENABLED`, `VOICE_ALERTS_FROM`, `VOICE_ALERTS_TO`,
`RESEND_API_KEY`). Half a group fails at the first publish or the first email.
`VOICE_ARTIFACT_POLICY=none` must be set before any assistant is published, and
`VOICE_TOOLS_CAPABILITIES` keeps `transfer` out until a live call has proved it.

## Rollback

Code: package a release `--from <current> --to <previous commit>` and apply it,
or redeploy the previous Replit deployment version. Database: each versioned
migration has committed rollback SQL in `lib/db/drizzle/<domain>-rollback/`;
take a backup first, because rollback of an additive migration drops the data it
held.
