import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/campaignScheduler.js";
import { getStripeSync } from "./lib/stripeClient.js";

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

  stripeSync.syncBackfill().catch((err) => {
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

await runStripeMigrations();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start campaign auto-send scheduler (60-second tick)
  startScheduler(60_000);

  // Run slow Stripe webhook registration/backfill in the background so it
  // doesn't delay the HTTP port opening (and failing deploy health checks).
  initStripeWebhookAndSync().catch((err) => {
    logger.error({ err }, "Error initializing Stripe webhook/sync");
  });
});
