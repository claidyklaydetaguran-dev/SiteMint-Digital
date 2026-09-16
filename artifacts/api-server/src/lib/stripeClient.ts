import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

export const STRIPE_SECRET_KEY_ENV_VAR = "STRIPE_SECRET_KEY";
export const STRIPE_WEBHOOK_SECRET_ENV_VAR = "STRIPE_WEBHOOK_SECRET";

/**
 * Credentials from the environment, when they are there.
 *
 * The Replit connector is the production path and stays the default. This
 * fallback exists because billing could not be exercised anywhere else: with no
 * connector, creating a checkout session failed with a 500 that said nothing
 * about configuration, so a test-mode run outside Replit was impossible. A
 * plain test key in the environment now answers the same question.
 *
 * Only the presence of the key is ever reported; the value is never logged,
 * returned to a caller, or included in an error message.
 */
export function readStripeCredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): { secretKey: string; webhookSecret?: string } | null {
  const secretKey = (env[STRIPE_SECRET_KEY_ENV_VAR] ?? "").trim();
  if (secretKey.length === 0) return null;
  const webhookSecret = (env[STRIPE_WEBHOOK_SECRET_ENV_VAR] ?? "").trim();
  return webhookSecret.length > 0 ? { secretKey, webhookSecret } : { secretKey };
}

/**
 * Fetches Stripe credentials: the environment first when it carries a key,
 * otherwise the Replit connection API.
 * Not cached -- tokens can rotate, so fetch fresh each time.
 */
async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  const fromEnv = readStripeCredentialsFromEnv();
  if (fromEnv) return fromEnv;

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe is not configured: no STRIPE_SECRET_KEY in the environment, and " +
        "no Replit connection is available. Either set the key or connect Stripe " +
        "via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret?: string; webhook_secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      "Stripe integration not connected or missing secret key. " +
        "Connect Stripe via the Integrations tab first.",
    );
  }

  return {
    secretKey: settings.secret,
    webhookSecret: settings.webhook_secret,
  };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns the Stripe webhook signing secret for manual event verification
 * (e.g. to inspect an event for CRM-specific side effects alongside stripe-replit-sync).
 */
export async function getStripeWebhookSecret(): Promise<string> {
  const { webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret not configured on the connection.");
  }
  return webhookSecret;
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
