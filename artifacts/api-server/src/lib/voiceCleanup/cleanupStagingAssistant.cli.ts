/**
 * AR-001C: operator entrypoint for staging provider cleanup.
 *
 * Deliberately NOT part of any automated suite: it is not named `*.test.ts`,
 * so `vitest.config.ts`'s `src/**\/*.test.ts` glob does not collect it, and it
 * is not reachable from `src/index.ts`, so the esbuild server bundle
 * (build.mjs, single entry point) never includes it. Same arrangement as the
 * existing `schedulingRepository.dbcheck.ts` operator script.
 *
 * It has no HTTP route and no UI control, by owner decision — a customer must
 * never be able to trigger a provider deletion.
 *
 * Run (dry run — the default; no flag makes it safe, a flag makes it act):
 *
 *   VOICE_STAGING_CLEANUP_ENABLED=true DATABASE_URL=... \
 *     pnpm --filter @workspace/scripts run cleanup-staging-assistant \
 *       -- --firm-id=<n> --assistant-id=<n>
 *
 * Then, only after reading the dry-run output, re-run with `--execute` and the
 * `--confirm=<providerAssistantId>` value it printed.
 *
 * The repository and provider modules are imported *lazily*, after the
 * environment guards pass. `@workspace/db` opens a connection pool at module
 * load, so a refused invocation must never reach that import — this ordering
 * is what makes "refused" mean nothing at all happened.
 */

import {
  cleanupStagingAssistant,
  evaluateEnvironmentGuards,
  exitCodeFor,
  formatCleanupResult,
  parseCleanupArgs,
  ENVIRONMENT_GUARD_MESSAGE,
  type CleanupRepositoryDependency,
} from "./cleanupService.js";

const USAGE = `
Staging provider cleanup — removes ONE assistant's remote provider resource.

  --firm-id=<n>        required
  --assistant-id=<n>   required
  --confirm=<id>       required with --execute; must equal the recorded provider assistant id
  --execute            perform the deletion (omitted = dry run)

Environment:
  VOICE_STAGING_CLEANUP_ENABLED=true   required
  NODE_ENV must not be "production"
  DATABASE_URL must point at the staging database
`.trim();

async function main(): Promise<number> {
  // Guards first, before any database or provider module is loaded.
  const guardFailure = evaluateEnvironmentGuards(process.env);
  if (guardFailure) {
    console.error(ENVIRONMENT_GUARD_MESSAGE[guardFailure]);
    return 1;
  }

  const args = parseCleanupArgs(process.argv.slice(2));
  if (args.firmId === undefined || args.assistantId === undefined) {
    console.error(USAGE);
    return 1;
  }

  const [{ voiceAssistantRepository }, { createProductionVoiceProvider }, { systemClock }] = await Promise.all([
    import("../voiceAssistants/repository.js"),
    import("../voicePublishing/providerFactory.js"),
    import("../voice/types.js"),
  ]);

  // Narrowed on purpose: the full repository can publish, duplicate and delete.
  // This command is handed only the two methods it needs.
  const repository: CleanupRepositoryDependency = {
    getPublishState: voiceAssistantRepository.getPublishState,
    clearProviderLinkForFirm: voiceAssistantRepository.clearProviderLinkForFirm,
  };

  const result = await cleanupStagingAssistant(
    {
      firmId: args.firmId,
      assistantId: args.assistantId,
      ...(args.confirmProviderAssistantId !== undefined
        ? { confirmProviderAssistantId: args.confirmProviderAssistantId }
        : {}),
      execute: args.execute,
    },
    {
      repository,
      createProvider: createProductionVoiceProvider,
      clock: systemClock,
      logger: (event, meta) => console.error(`[cleanup] ${event} ${JSON.stringify(meta)}`),
    },
  );

  console.log(formatCleanupResult(result));
  return exitCodeFor(result);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(() => {
    // Never surface a raw error: it can carry a connection string or provider
    // detail. The safe classification is "unknown outcome".
    console.error(
      "UNEXPECTED FAILURE — the outcome is unknown. Do not assume the remote resource was deleted.",
    );
    process.exitCode = 1;
  });
