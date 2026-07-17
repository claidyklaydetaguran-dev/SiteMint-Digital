import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms } from "@workspace/db/schema";
import Stripe from "stripe";
import { getUncachableStripeClient } from "../lib/stripeClient.js";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";

const router = Router();

// ── Helper: derive app base URL from REPLIT_DOMAINS ──────────────────────────

function getAppBaseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (domain) return `https://${domain}`;
  return "http://localhost:" + (process.env["PORT"] ?? "8080");
}

// ── POST /api/receptionist/billing/create-checkout-session ────────────────────
// Creates a Stripe Checkout Session in subscription mode for the logged-in firm.

router.post(
  "/receptionist/billing/create-checkout-session",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    const priceId = process.env["STRIPE_RECEPTIONIST_PRICE_ID"];
    if (!priceId) {
      res.status(500).json({ error: "Billing is not configured yet" });
      return;
    }

    try {
      const [firm] = await db
        .select({
          id:               intakeFirms.id,
          name:             intakeFirms.name,
          email:            intakeFirms.email,
          planTier:         intakeFirms.planTier,
          stripeCustomerId: intakeFirms.stripeCustomerId,
        })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, req.firmId!));

      if (!firm) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const stripe = await getUncachableStripeClient();

      // Reuse or create Stripe customer
      let stripeCustomerId = firm.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: firm.email ?? undefined,
          name:  firm.name,
          metadata: { intake_firm_id: String(firm.id) },
        });
        stripeCustomerId = customer.id;

        await db
          .update(intakeFirms)
          .set({ stripeCustomerId })
          .where(eq(intakeFirms.id, firm.id));
      }

      const base = getAppBaseUrl();
      const session = await stripe.checkout.sessions.create({
        customer:   stripeCustomerId,
        mode:       "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/ai-receptionist/dashboard/billing?upgraded=1`,
        cancel_url:  `${base}/ai-receptionist/dashboard/billing`,
      });

      res.json({ url: session.url });
    } catch (err) {
      req.log.error({ err }, "[receptionist] create-checkout-session error");
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  },
);

// ── POST /api/receptionist/billing/webhook ────────────────────────────────────
// Stripe sends events here after checkout or subscription changes.
// Raw body is captured in app.ts BEFORE express.json() runs.
// Signature is verified using STRIPE_WEBHOOK_SECRET env var.

router.post(
  "/receptionist/billing/webhook",
  async (req: Request, res: Response) => {
    const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      req.log.warn("[receptionist] STRIPE_WEBHOOK_SECRET not set — webhook disabled");
      res.status(400).json({ error: "Webhook not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event: Stripe.Event;
    try {
      // Signature verification is pure HMAC math — no Stripe API call needed.
      // Use a local Stripe instance with a placeholder key so the connector
      // is never contacted here.
      const stripeLocal = new Stripe("sk_placeholder_for_webhook_verification_only");
      event = stripeLocal.webhooks.constructEvent(
        req.body as Buffer,
        Array.isArray(sig) ? sig[0]! : sig,
        webhookSecret,
      );
    } catch (err) {
      req.log.warn({ err }, "[receptionist] Stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    try {
      await handleStripeEvent(event, req);
    } catch (err) {
      req.log.error({ err, eventType: event.type }, "[receptionist] Stripe webhook handler error");
      res.status(500).json({ error: "Webhook handler error" });
      return;
    }

    res.status(200).json({ received: true });
  },
);

// ── Event handler (idempotent) ────────────────────────────────────────────────

async function handleStripeEvent(
  event: Stripe.Event,
  req: Request,
): Promise<void> {
  switch (event.type) {
    // checkout.session.completed: subscription is now active
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId     = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;

      if (!customerId || session.mode !== "subscription") break;

      const [firm] = await db
        .select({ id: intakeFirms.id, planTier: intakeFirms.planTier })
        .from(intakeFirms)
        .where(eq(intakeFirms.stripeCustomerId, customerId));

      if (!firm) {
        req.log.warn({ customerId }, "[receptionist] webhook: no firm for customerId");
        break;
      }

      // Idempotent — skip if already paid
      if (firm.planTier === "paid") {
        req.log.info({ firmId: firm.id }, "[receptionist] webhook: already paid, skipping");
        break;
      }

      await db
        .update(intakeFirms)
        .set({ planTier: "paid", stripeSubscriptionId: subscriptionId })
        .where(eq(intakeFirms.id, firm.id));

      req.log.info({ firmId: firm.id, subscriptionId }, "[receptionist] webhook: upgraded to paid");
      break;
    }

    // customer.subscription.created: emitted after checkout too — planTier already set above,
    // so this is a no-op in practice, but handle it for explicit subscription provisioning flows.
    case "customer.subscription.created": {
      const sub        = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      const [firm] = await db
        .select({ id: intakeFirms.id, planTier: intakeFirms.planTier })
        .from(intakeFirms)
        .where(eq(intakeFirms.stripeCustomerId, customerId));

      if (!firm || firm.planTier === "paid") break;

      await db
        .update(intakeFirms)
        .set({ planTier: "paid", stripeSubscriptionId: sub.id })
        .where(eq(intakeFirms.id, firm.id));

      req.log.info({ firmId: firm.id, subscriptionId: sub.id }, "[receptionist] webhook: subscription.created → paid");
      break;
    }

    // customer.subscription.deleted: subscription canceled
    case "customer.subscription.deleted": {
      const sub        = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      const [firm] = await db
        .select({ id: intakeFirms.id, planTier: intakeFirms.planTier })
        .from(intakeFirms)
        .where(eq(intakeFirms.stripeCustomerId, customerId));

      if (!firm) {
        req.log.warn({ customerId }, "[receptionist] webhook: no firm for customerId on deletion");
        break;
      }

      // Idempotent — skip if already trial
      if (firm.planTier === "trial") {
        req.log.info({ firmId: firm.id }, "[receptionist] webhook: already trial, skipping");
        break;
      }

      await db
        .update(intakeFirms)
        .set({ planTier: "trial", stripeSubscriptionId: null })
        .where(eq(intakeFirms.id, firm.id));

      req.log.info({ firmId: firm.id }, "[receptionist] webhook: subscription.deleted → trial");
      break;
    }

    default:
      req.log.info({ eventType: event.type }, "[receptionist] webhook: unhandled event type");
  }
}

export default router;
