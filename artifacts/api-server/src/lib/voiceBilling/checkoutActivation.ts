// J7: a paid checkout activates the business's voice plan, and every later
// Stripe event (failed payment, recovery, cancellation, resume) moves that
// plan through the same state machine the rest of the product reads.
//
// Before this, checkout only flipped the legacy `intake_firms.plan_tier` to
// "paid". Nothing created the voice subscription the plan gate reads, so a
// business that paid still could not publish, and nothing a payment failure
// or cancellation did was ever visible to the gate either.
//
// Idempotency: every Stripe event id is recorded in the provider_webhook_events
// ledger (provider "stripe_receptionist") before it is applied, a redelivery
// is a no-op, and a failed apply releases its ledger row so Stripe's retry is
// processed rather than dropped.

import { findPlan, loadVoicePlanCatalogFromEnv } from "./entitlements.js";
import type { SubscriptionEvent } from "./subscriptionState.js";

export const VOICE_CHECKOUT_PLAN_CODE_ENV_VAR = "VOICE_CHECKOUT_PLAN_CODE";
export const RECEPTIONIST_STRIPE_LEDGER = "stripe_receptionist";

/** The plan a completed checkout activates, or null when unset or not in the catalog (checkout then refuses). */
export function loadCheckoutPlanCode(env: Record<string, string | undefined> = process.env): string | null {
  const code = (env[VOICE_CHECKOUT_PLAN_CODE_ENV_VAR] ?? "").trim();
  if (!code) return null;
  let catalog;
  try {
    catalog = loadVoicePlanCatalogFromEnv(env);
  } catch {
    return null;
  }
  return catalog && findPlan(catalog, code) ? code : null;
}

export interface CheckoutActivationDeps {
  /** Ledger insert; false when this event id was already recorded. */
  storeEventOnce: (firmId: number, provider: string, eventKey: string, eventType: string) => Promise<{ inserted: boolean }>;
  releaseEvent: (provider: string, eventKey: string) => Promise<void>;
  /** Upserts the firm's voice subscription to `active` on this plan, mapped to this Stripe customer. */
  activate: (firmId: number, planCode: string, stripeCustomerId: string) => Promise<void>;
  audit?: (firmId: number, action: string) => Promise<void>;
}

export type ActivationOutcome = { applied: true } | { applied: false; reason: "duplicate_event" };

export async function activateVoicePlanFromCheckout(
  input: { firmId: number; stripeCustomerId: string; planCode: string; eventId: string },
  deps: CheckoutActivationDeps,
): Promise<ActivationOutcome> {
  const { inserted } = await deps.storeEventOnce(input.firmId, RECEPTIONIST_STRIPE_LEDGER, input.eventId, "checkout.session.completed");
  if (!inserted) return { applied: false, reason: "duplicate_event" };
  try {
    await deps.activate(input.firmId, input.planCode, input.stripeCustomerId);
  } catch (err) {
    await deps.releaseEvent(RECEPTIONIST_STRIPE_LEDGER, input.eventId).catch(() => undefined);
    throw err;
  }
  await deps.audit?.(input.firmId, "subscription.activated_by_checkout").catch(() => undefined);
  return { applied: true };
}

export async function productionCheckoutActivationDeps(): Promise<CheckoutActivationDeps> {
  const [{ db }, voice, { and, eq }, { recordAuditEvent }] = await Promise.all([
    import("@workspace/db"),
    import("@workspace/db/schema/voice"),
    import("drizzle-orm"),
    import("../voiceAccounts/auditLog.js"),
  ]);
  return {
    storeEventOnce: async (firmId, provider, eventKey, eventType) => {
      const rows = await db
        .insert(voice.providerWebhookEvents)
        .values({ firmId, provider, eventKey, payload: { eventType }, processedAt: new Date() })
        .onConflictDoNothing({ target: [voice.providerWebhookEvents.provider, voice.providerWebhookEvents.eventKey] })
        .returning({ id: voice.providerWebhookEvents.id });
      return { inserted: rows.length > 0 };
    },
    releaseEvent: async (provider, eventKey) => {
      await db
        .delete(voice.providerWebhookEvents)
        .where(and(eq(voice.providerWebhookEvents.provider, provider), eq(voice.providerWebhookEvents.eventKey, eventKey)));
    },
    activate: async (firmId, planCode, stripeCustomerId) => {
      const now = new Date();
      await db
        .insert(voice.voiceSubscriptions)
        .values({ firmId, planCode, state: "active", stripeCustomerId, updatedAt: now })
        .onConflictDoUpdate({
          target: [voice.voiceSubscriptions.firmId],
          set: { planCode, state: "active", stripeCustomerId, graceUntil: null, updatedAt: now },
        });
    },
    audit: (firmId, action) => recordAuditEvent({ firmId, actor: "system", action }),
  };
}

/** The Stripe events that move an existing voice subscription, by name. */
export function mapReceptionistStripeEvent(type: string): SubscriptionEvent | null {
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
