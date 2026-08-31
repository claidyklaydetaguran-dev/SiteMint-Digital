import type { Server } from "node:http";
import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/campaignScheduler.js";
import { startVoiceReconciliationSweep } from "./lib/voice/webhooks/reconciliation.js";
import { startUsageBackfillSweep } from "./lib/voiceUsage/usageService.js";
import { startVoiceDigestSchedule } from "./lib/voiceAlerts/dailyDigest.js";
import { startGraceExpirySweep } from "./lib/voiceBilling/subscriptionState.js";
import { logEnvContractFindings } from "./lib/envContract.js";
import { getStripeSync } from "./lib/stripeClient.js";
import { isStripeBootSyncEnabled, startStripeBootSync } from "./lib/stripeBootSync.js";
import { runBootSequence } from "./lib/bootSequence.js";

async function runStripeMigrations(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required for Stripe integration.");
  }

  await runMigrations({ databaseUrl });
}

async function initStripeWebhookAndSync(): Promise<void> {
  const stripeSync = await getStripeSync();

  const webhookBaseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
  await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);

  stripeSync.syncBackfill({ object: "all" }).catch((err) => {
    logger.error({ err }, "Error syncing Stripe data");
  });
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Everything that must NOT run until migrations have succeeded.
 *
 * Each starter already checks its own capability flag and registers nothing
 * while that flag is off; this only decides *when* they are allowed to start.
 */
function startBackgroundWorkers(): void {
  // Campaign auto-send scheduler (60-second tick)
  startScheduler(60_000);

  // P2: voice call-state reconciliation sweep (5-minute tick). Inert unless
  // VOICE_RECONCILIATION_ENABLED="true" — the starter itself checks the flag
  // and registers nothing when it is off, per the disabled-by-default rule.
  startVoiceReconciliationSweep(5 * 60_000, {
    logger: (event, meta) => logger.info(meta, event),
  });

  // P7: metering backfill (15-minute tick) rides the same reconciliation
  // flag; the daily digest has its own flag. Both starters register nothing
  // while their flag is off.
  startUsageBackfillSweep(15 * 60_000, {
    logger: (event, meta) => logger.info(meta, event),
  } as Parameters<typeof startUsageBackfillSweep>[1]);
  startVoiceDigestSchedule(24 * 60 * 60_000, {
    logger: (event, meta) => logger.info(meta, event),
  } as Parameters<typeof startVoiceDigestSchedule>[1]);
  // P8: dunning-window expiry (hourly tick), same reconciliation flag.
  startGraceExpirySweep(60 * 60_000, {
    logger: (event, meta) => logger.info(meta, event),
  } as Parameters<typeof startGraceExpirySweep>[1]);

  // P9: environment-contract validation — surfaces flags that do not
  // enable anything and fail-closed configs that would refuse at use
  // time. Logging only; behavior is unchanged.
  void logEnvContractFindings((level, message) =>
    level === "error" ? logger.error(message) : logger.warn(message),
  );

  // Stripe webhook registration/backfill.
  //
  // AR-001G: this is opt-in. Registering a managed webhook and starting a
  // backfill are external mutations of a Stripe account, and they must not
  // happen merely because a connector happens to be attached to whatever
  // environment the server booted in. `runStripeMigrations()` is a different
  // thing entirely — an internal database migration that startup requires —
  // and is deliberately left outside this flag.
  startStripeBootSync({
    isEnabled: () => isStripeBootSyncEnabled(process.env),
    runBootSync: initStripeWebhookAndSync,
    logger,
  });
}

// R6: bind the port BEFORE migrations so the platform's health probe has an
// upstream while they run, with `bootGate` refusing application traffic until
// they succeed. See lib/bootSequence.ts.
await runBootSequence({
  listen: () =>
    new Promise<Server>((resolve, reject) => {
      const server = app.listen(port, () => {
        logger.info({ port }, "Server listening");
        resolve(server);
      });
      server.on("error", reject);
    }),
  runMigrations: runStripeMigrations,
  startWorkers: startBackgroundWorkers,
  logger,
  exit: (code) => process.exit(code),
});
