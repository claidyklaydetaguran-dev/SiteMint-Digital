import { db, crmTransactions } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeSync, getUncachableStripeClient, getStripeWebhookSecret } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " + typeof payload + ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // On top of stripe-replit-sync's generic sync, reconcile CRM transactions
    // that were created via /crm/deals/:id/transactions/stripe-checkout.
    await WebhookHandlers.reconcileCrmTransaction(payload, signature);
  }

  private static async reconcileCrmTransaction(payload: Buffer, signature: string): Promise<void> {
    try {
      const [stripe, webhookSecret] = await Promise.all([
        getUncachableStripeClient(),
        getStripeWebhookSecret(),
      ]);
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      if (event.type !== "checkout.session.completed") return;

      const session = event.data.object as { id: string; payment_intent?: string | null };
      const [txn] = await db
        .select()
        .from(crmTransactions)
        .where(eq(crmTransactions.stripePaymentIntentId, session.id));
      if (!txn) return;

      await db
        .update(crmTransactions)
        .set({
          status: "completed",
          receivedAt: new Date(),
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : session.id,
          updatedAt: new Date(),
        })
        .where(eq(crmTransactions.id, txn.id));
    } catch {
      // Non-fatal: stripe-replit-sync already recorded the raw event above.
      // CRM transaction reconciliation is best-effort and must not fail the webhook 200.
    }
  }
}
