// P8: the voice-subscription Stripe webhook — SEPARATE from the protected
// /api/receptionist/billing/webhook (checkout product), with its own
// secret. 503 while unconfigured (fail-closed); signature-verified;
// idempotent via the provider_webhook_events ledger (provider
// 'stripe_voice', eventKey = Stripe's own event id); acts only on a
// closed set of event types; resolves the firm ONLY through our stored
// stripe_customer_id mapping (an audited admin action) — never from
// request-body identifiers, so an attacker with a leaked secret still
// cannot attach events to arbitrary firms.
//
// app.ts mounts express.raw() on this path; req.body is a Buffer here.

import { Router, type IRouter, type Request, type Response } from "express";
import {
  extractStripeCustomerId,
  mapStripeEventType,
  verifyStripeSignature,
  VOICE_BILLING_WEBHOOK_SECRET_ENV_VAR,
} from "../lib/voiceBilling/stripeWebhookAuth.js";
import { applyEventForStripeCustomer } from "../lib/voiceBilling/subscriptionState.js";

const router: IRouter = Router();

router.post("/voice/billing/webhook", async (req: Request, res: Response) => {
  const secret = process.env[VOICE_BILLING_WEBHOOK_SECRET_ENV_VAR];
  if (typeof secret !== "string" || secret.trim().length < 16) {
    res.status(503).json({ error: "Billing webhook is not configured." });
    return;
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const verification = verifyStripeSignature(rawBody, req.headers["stripe-signature"], secret, Date.now());
  if (!verification.ok) {
    req.log.warn({ reason: verification.reason }, "[voice billing] webhook rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    event = parsed as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Malformed event" });
    return;
  }

  const eventId = typeof event["id"] === "string" && event["id"].length > 0 ? (event["id"] as string) : null;
  const mapped = mapStripeEventType(event["type"]);
  if (eventId === null || mapped === null) {
    // Outside our closed set (or unidentifiable): acknowledge, change nothing.
    res.status(200).json({ received: true });
    return;
  }
  const stripeCustomerId = extractStripeCustomerId(event);
  if (stripeCustomerId === null) {
    res.status(200).json({ received: true });
    return;
  }

  try {
    const outcome = await applyEventForStripeCustomer(stripeCustomerId, mapped, undefined, {
      provider: "stripe_voice",
      eventKey: eventId,
    });
    req.log.info(
      { eventType: event["type"], applied: outcome.applied, reason: outcome.applied ? undefined : outcome.reason },
      "[voice billing] event processed",
    );
    res.status(200).json({ received: true });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[voice billing] event failed");
    // 500 → Stripe retries; the idempotency ledger absorbs the redelivery.
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
