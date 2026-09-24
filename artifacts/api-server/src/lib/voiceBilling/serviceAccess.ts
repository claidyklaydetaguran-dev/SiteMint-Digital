// Who may run a live receptionist.
//
// Publishing, synchronizing and browser test calls all spend provider
// resources on behalf of one business. With open registration, nothing tied
// them to a plan: any new sign-up could publish and start paid test calls.
// This is the single answer to "is this business activated?", read by every
// route that would spend provider time.
//
// VOICE_SERVICE_ACCESS_REQUIRED ("true" exactly) turns enforcement on. With it
// on, a business is activated only by a subscription row in `active` or
// `grace` whose plan is in the catalog — a paid Stripe subscription, or a plan
// the operator granted (pilot) through PUT /admin/voice/firms/:id/subscription.
// `suspended` and `canceled` are not activated: service stops, and the owner
// is told why. With it off, nothing changes, so staging and tests behave as
// before.
//
// Numbers stay operator-assigned, so phone calls are already under operator
// control; this gate covers the paths a customer can start alone.

import { findPlan, loadVoicePlanCatalogFromEnv } from "./entitlements.js";

export const VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR = "VOICE_SERVICE_ACCESS_REQUIRED";

export type ServiceAccessDenial = "not_activated" | "suspended" | "canceled";

export type ServiceAccess =
  | { allowed: true; basis: "not_required" }
  | { allowed: true; basis: "subscription"; planCode: string; state: "active" | "grace" }
  | { allowed: false; reason: ServiceAccessDenial };

export interface ServiceAccessDeps {
  findSubscription: (firmId: number) => Promise<{ planCode: string; state: string } | undefined>;
  env?: Record<string, string | undefined>;
}

export function isServiceAccessRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_SERVICE_ACCESS_REQUIRED_ENV_VAR] === "true";
}

async function productionFindSubscription(firmId: number): Promise<{ planCode: string; state: string } | undefined> {
  const { db } = await import("@workspace/db");
  const { voiceSubscriptions } = await import("@workspace/db/schema/voice");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ planCode: voiceSubscriptions.planCode, state: voiceSubscriptions.state })
    .from(voiceSubscriptions)
    .where(eq(voiceSubscriptions.firmId, firmId))
    .limit(1);
  return row;
}

export async function resolveServiceAccess(
  firmId: number,
  deps: Partial<ServiceAccessDeps> = {},
): Promise<ServiceAccess> {
  const env = deps.env ?? process.env;
  if (!isServiceAccessRequired(env)) return { allowed: true, basis: "not_required" };

  // A catalog that fails to parse must not read as "activated". Treat it the
  // same as no plan at all: fail closed.
  let catalog;
  try {
    catalog = loadVoicePlanCatalogFromEnv(env);
  } catch {
    return { allowed: false, reason: "not_activated" };
  }
  if (catalog === null) return { allowed: false, reason: "not_activated" };

  const subscription = await (deps.findSubscription ?? productionFindSubscription)(firmId);
  if (!subscription) return { allowed: false, reason: "not_activated" };
  if (subscription.state === "suspended") return { allowed: false, reason: "suspended" };
  if (subscription.state === "canceled") return { allowed: false, reason: "canceled" };
  if (subscription.state !== "active" && subscription.state !== "grace") return { allowed: false, reason: "not_activated" };
  if (!findPlan(catalog, subscription.planCode)) return { allowed: false, reason: "not_activated" };
  return { allowed: true, basis: "subscription", planCode: subscription.planCode, state: subscription.state };
}

export const SERVICE_ACCESS_MESSAGES: Record<ServiceAccessDenial, string> = {
  not_activated: "Your receptionist isn't activated yet. Choose a plan in Billing, or contact SiteMint to activate it.",
  suspended: "Your receptionist is paused because a payment didn't go through. Update your payment in Billing to turn it back on.",
  canceled: "Your plan is cancelled, so your receptionist is off. Choose a plan in Billing to turn it back on.",
};

export const SERVICE_NOT_ACTIVE_CODE = "service_not_active";
