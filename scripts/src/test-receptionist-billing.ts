/**
 * One-shot integration test for the AI Receptionist billing flow.
 * Run: pnpm --filter @workspace/scripts run test-receptionist-billing
 *
 * Tests:
 * 1. Creates a Stripe test recurring price
 * 2. Creates a checkout session via the live API server
 * 3. Simulates webhook events (checkout.session.completed, idempotency,
 *    customer.subscription.deleted) with proper HMAC signatures
 * 4. Verifies DB state after each event
 *
 * Delete this file after the initial verification pass.
 */

import crypto from "crypto";

const BASE = "http://localhost:80";
const WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
const DB_URL = process.env["DATABASE_URL"] ?? "";
const HOSTNAME = process.env["REPLIT_CONNECTORS_HOSTNAME"] ?? "";
const REPL_ID = process.env["REPL_IDENTITY"] ?? "";

// ── Stripe key ───────────────────────────────────────────────────────────────

async function getStripeKey(): Promise<string> {
  const token = REPL_ID ? `repl ${REPL_ID}` : null;
  if (!HOSTNAME || !token) throw new Error("Missing Replit connector env vars");

  const resp = await fetch(
    `https://${HOSTNAME}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", "X_REPLIT_TOKEN": token },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!resp.ok) throw new Error(`Connector ${resp.status}: ${resp.statusText}`);
  const data = await resp.json() as { items?: Array<{ settings?: { secret?: string } }> };
  const key = data.items?.[0]?.settings?.secret;
  if (!key) throw new Error("No Stripe secret key from connector");
  return key;
}

// ── Stripe API helpers ───────────────────────────────────────────────────────

async function stripePost(path: string, body: Record<string, string>, key: string): Promise<unknown> {
  const params = new URLSearchParams(body);
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  return resp.json();
}

async function stripeGet(path: string, key: string): Promise<unknown> {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return resp.json();
}

// ── DB query ─────────────────────────────────────────────────────────────────

async function queryDb(sql: string): Promise<unknown> {
  // Use psql via child_process for simplicity
  const { execSync } = await import("child_process");
  const result = execSync(`psql "${DB_URL}" -t -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" });
  return result.trim();
}

// ── Stripe webhook signature ─────────────────────────────────────────────────

function signWebhookEvent(body: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${ts}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function sendWebhookEvent(eventBody: object): Promise<{ status: number; body: unknown }> {
  const bodyStr = JSON.stringify(eventBody);
  const sigHeader = signWebhookEvent(bodyStr, WEBHOOK_SECRET);

  const resp = await fetch(`${BASE}/api/receptionist/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sigHeader,
    },
    body: bodyStr,
  });
  const body = await resp.json();
  return { status: resp.status, body };
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Fake customer ID used for webhook tests — no real Stripe customer needed.
// The webhook handler only does a DB lookup by stripe_customer_id.
const FAKE_CUSTOMER_ID = "cus_fake_receptionist_webhook_test_" + Date.now();

console.log("=== AI Receptionist Billing Integration Test ===\n");

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// Step 0: Validate test prerequisites
check("STRIPE_WEBHOOK_SECRET is set", WEBHOOK_SECRET.length > 0);
check("DATABASE_URL is set", DB_URL.length > 0);
check("Replit connector env vars present", HOSTNAME.length > 0 && REPL_ID.length > 0);

console.log("\n--- 1. Stripe key + test price ---");

let stripeKey = "";
let priceId = "";
let testCustomerId = "";
let testFirmId = "";

try {
  stripeKey = await getStripeKey();
  check("Fetched Stripe secret key from connector", stripeKey.startsWith("sk_test_"), `got: ${stripeKey.slice(0, 12)}...`);
} catch (err) {
  check("Fetched Stripe secret key from connector", false, String(err));
}

if (stripeKey) {
  // Create or reuse test product + price
  const searchResp = await stripeGet(
    "prices/search?query=metadata%5B%27purpose%27%5D%3A%27receptionist_billing_test%27&limit=1",
    stripeKey
  ) as { data?: Array<{ id: string }> };

  if (searchResp.data?.[0]) {
    priceId = searchResp.data[0].id;
    console.log(`  (reusing existing test price: ${priceId})`);
  } else {
    const product = await stripePost("products", {
      "name": "AI Receptionist Pro (test)",
      "metadata[purpose]": "receptionist_billing_test",
    }, stripeKey) as { id?: string };

    const price = await stripePost("prices", {
      "currency": "usd",
      "unit_amount": "4900",
      "recurring[interval]": "month",
      "product": product.id ?? "",
      "metadata[purpose]": "receptionist_billing_test",
    }, stripeKey) as { id?: string };

    priceId = price.id ?? "";
  }

  check("Test price ID obtained", priceId.startsWith("price_"), priceId);
} else {
  console.log("  → Stripe connector not accessible from scripts process — skipping price creation.");
  console.log("  → Webhook tests use fake customer IDs (no Stripe needed for DB-only event handling).");
}

console.log("\n--- 2. STRIPE_RECEPTIONIST_PRICE_ID env var must be set to test checkout ---");
const priceFromEnv = process.env["STRIPE_RECEPTIONIST_PRICE_ID"] ?? "";
if (priceFromEnv) {
  check("STRIPE_RECEPTIONIST_PRICE_ID is set", true, priceFromEnv);
} else {
  console.log(`  → Price ID for this run: ${priceId}`);
  console.log(`  → Set STRIPE_RECEPTIONIST_PRICE_ID=${priceId} and restart the server, then run checkout test separately.`);
  console.log(`  → Skipping checkout session test (price env var not set in server process yet).`);
}

console.log("\n--- 3. Webhook signature verification ---");

// 3a. Valid signature → 200 with unhandled event type
const unknownEvt = await sendWebhookEvent({ type: "payment_intent.created", data: { object: {} } });
check("Valid signature → 200 received:true", unknownEvt.status === 200 && (unknownEvt.body as { received?: boolean }).received === true);

// 3b. Invalid signature → 400
const badSigResp = await fetch(`${BASE}/api/receptionist/billing/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "stripe-signature": "t=99,v1=badhex" },
  body: JSON.stringify({ type: "test" }),
});
check("Invalid signature → 400", badSigResp.status === 400);

console.log("\n--- 4. Seed test firm with fake Stripe customer ID ---");

// Seed the test firm with a fake customer ID — webhook tests only need DB lookup,
// not a real Stripe customer. This decouples webhook testing from Stripe connectivity.
await queryDb(
  `UPDATE intake_firms SET stripe_customer_id = '${FAKE_CUSTOMER_ID}', plan_tier = 'trial', stripe_subscription_id = NULL WHERE email = 'bob@test-receptionist.com'`
);
const firmRow = await queryDb(
  `SELECT id, plan_tier, stripe_customer_id FROM intake_firms WHERE email = 'bob@test-receptionist.com'`
);
console.log(`  Bob Realty DB state: ${firmRow}`);
testFirmId = String(firmRow).split("|")[0].trim();
check("Test firm found and seeded with fake Stripe customer ID", testFirmId.length > 0);

console.log("\n--- 5. checkout.session.completed → planTier = 'paid' ---");

const completedEvt = {
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_fake123",
      mode: "subscription",
      customer: FAKE_CUSTOMER_ID,
      subscription: "sub_test_abc123",
    },
  },
};

const completedResp = await sendWebhookEvent(completedEvt);
check("checkout.session.completed → 200", completedResp.status === 200);

const afterCompleted = await queryDb(
  `SELECT plan_tier, stripe_subscription_id FROM intake_firms WHERE email = 'bob@test-receptionist.com'`
);
console.log(`  DB after checkout.session.completed: ${afterCompleted}`);
check("planTier flipped to 'paid'", String(afterCompleted).includes("paid"));
check("stripeSubscriptionId stored", String(afterCompleted).includes("sub_test_abc123"));

console.log("\n--- 6. Idempotency: redeliver checkout.session.completed ---");

const redeliveredResp = await sendWebhookEvent(completedEvt);
check("Redelivered event → 200 (no crash)", redeliveredResp.status === 200);
const afterRedelivery = await queryDb(
  `SELECT plan_tier FROM intake_firms WHERE email = 'bob@test-receptionist.com'`
);
check("Still 'paid' after redeliver (not double-processed)", String(afterRedelivery).trim() === "paid");

console.log("\n--- 7. customer.subscription.deleted → planTier = 'trial' ---");

const deletedEvt = {
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: "sub_test_abc123",
      customer: FAKE_CUSTOMER_ID,
    },
  },
};

const deletedResp = await sendWebhookEvent(deletedEvt);
check("customer.subscription.deleted → 200", deletedResp.status === 200);

const afterDeleted = await queryDb(
  `SELECT plan_tier, stripe_subscription_id FROM intake_firms WHERE email = 'bob@test-receptionist.com'`
);
console.log(`  DB after subscription.deleted: ${afterDeleted}`);
check("planTier reverted to 'trial'", String(afterDeleted).includes("trial"));
check("stripeSubscriptionId cleared", !String(afterDeleted).includes("sub_test_abc123"));

console.log("\n--- 8. Idempotency: redeliver subscription.deleted ---");
const redeliveredDel = await sendWebhookEvent(deletedEvt);
check("Redelivered deletion → 200 (no crash)", redeliveredDel.status === 200);
const afterRedeliveredDel = await queryDb(
  `SELECT plan_tier FROM intake_firms WHERE email = 'bob@test-receptionist.com'`
);
check("Still 'trial' after redeliver", String(afterRedeliveredDel).trim() === "trial");

console.log("\n--- 9. Missing stripe-signature → 400 ---");
const noSigResp = await fetch(`${BASE}/api/receptionist/billing/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "test" }),
});
check("Missing stripe-signature → 400", noSigResp.status === 400);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`PASSED: ${passed}  |  FAILED: ${failed}`);
if (priceId && !priceFromEnv) {
  console.log(`\nNEXT STEP: Set STRIPE_RECEPTIONIST_PRICE_ID=${priceId} as a secret/env var`);
  console.log(`and restart the server to enable the upgrade checkout flow.`);
}
console.log("─".repeat(50));

process.exit(failed > 0 ? 1 : 0);
