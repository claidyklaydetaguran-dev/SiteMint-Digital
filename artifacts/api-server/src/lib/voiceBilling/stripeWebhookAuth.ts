// P8: Stripe webhook signature verification, implemented pure (no SDK
// dependency in the verification path — same decision as vapiWebhookAuth):
// header `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...]` where
// v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Timestamp bound into the
// signature; bounded freshness; constant-time comparison; multiple v1
// entries accepted (Stripe sends several during secret rotation).

import crypto from "node:crypto";

export const VOICE_BILLING_WEBHOOK_SECRET_ENV_VAR = "VOICE_BILLING_WEBHOOK_SECRET";
export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300;

export type StripeVerification =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_header" | "malformed_header" | "stale_timestamp" | "signature_mismatch" };

export function verifyStripeSignature(
  rawBody: Buffer,
  header: unknown,
  secret: string,
  nowMs: number,
): StripeVerification {
  if (typeof header !== "string" || header.length === 0) return { ok: false, reason: "missing_header" };
  let timestamp: number | undefined;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) candidates.push(value);
  }
  if (timestamp === undefined || candidates.length === 0) return { ok: false, reason: "malformed_header" };
  if (Math.abs(nowMs / 1000 - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SEC) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  for (const candidate of candidates) {
    const provided = Buffer.from(candidate, "hex");
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return { ok: true, timestamp };
    }
  }
  return { ok: false, reason: "signature_mismatch" };
}

/** Test helper mirror: builds the header a genuine sender would produce. */
export function buildStripeSignatureHeader(rawBody: Buffer, secret: string, timestampSec: number): string {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestampSec}.`)
    .update(rawBody)
    .digest("hex");
  return `t=${timestampSec},v1=${signature}`;
}

// ── event mapping ────────────────────────────────────────────────────────────

import type { SubscriptionEvent } from "./subscriptionState.js";

/**
 * The closed set of Stripe event types this webhook acts on. Everything
 * else is acknowledged and ignored (Stripe sends dozens of types; acting
 * on an open set is how surprising transitions happen).
 */
export function mapStripeEventType(type: unknown): SubscriptionEvent | null {
  switch (type) {
    case "invoice.payment_succeeded":
      return "payment_succeeded";
    case "invoice.payment_failed":
      return "payment_failed";
    case "customer.subscription.deleted":
      return "canceled";
    case "customer.subscription.resumed":
      return "reactivated";
    default:
      return null;
  }
}

/** The customer id lives in different places per event family; only string forms are accepted. */
export function extractStripeCustomerId(event: Record<string, unknown>): string | null {
  const data = event["data"];
  if (typeof data !== "object" || data === null) return null;
  const object = (data as Record<string, unknown>)["object"];
  if (typeof object !== "object" || object === null) return null;
  const customer = (object as Record<string, unknown>)["customer"];
  return typeof customer === "string" && customer.length > 0 ? customer : null;
}
