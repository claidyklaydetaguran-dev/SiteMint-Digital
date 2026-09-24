// P8: voice plan entitlements as server-owned config.
//
// One env value (VOICE_PLAN_CATALOG_JSON) in the artifact/server/tools/
// call-policy contract family: fail-closed, closed keys, bounded values,
// null when absent so nothing changes behavior until an owner sets it.
// No client, firm, or request input can influence the catalog.

export const VOICE_PLAN_CATALOG_ENV_VAR = "VOICE_PLAN_CATALOG_JSON";
export const VOICE_DEFAULT_PLAN_ENV_VAR = "VOICE_DEFAULT_PLAN_CODE";

export interface VoicePlan {
  planCode: string;
  includedMinutes: number;
  /** Whether the plan includes voice-side SMS features (informational until enforcement is activated). */
  smsIncluded: boolean;
}

export interface VoicePlanCatalog {
  plans: VoicePlan[];
  /** From VOICE_DEFAULT_PLAN_CODE; null when unset. Must exist in plans. */
  defaultPlanCode: string | null;
}

const PLAN_CODE_SHAPE = /^[a-z0-9_-]{1,40}$/;
const PLAN_KEYS = new Set(["planCode", "includedMinutes", "smsIncluded"]);

function invalid(message: string): never {
  throw new Error(`${VOICE_PLAN_CATALOG_ENV_VAR}: ${message}`);
}

/** Null when unset. Throws on any malformed value — a catalog the operator believes exists must never silently not exist. */
export function loadVoicePlanCatalogFromEnv(
  env: Record<string, string | undefined> = process.env,
): VoicePlanCatalog | null {
  const raw = env[VOICE_PLAN_CATALOG_ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid("must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) invalid("must be a non-empty JSON array of plans.");
  if (parsed.length > 20) invalid("supports at most 20 plans.");
  const plans: VoicePlan[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) invalid("every plan must be an object.");
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!PLAN_KEYS.has(key)) invalid(`plan contains an unsupported key: "${key}".`);
    }
    const planCode = record.planCode;
    if (typeof planCode !== "string" || !PLAN_CODE_SHAPE.test(planCode)) {
      invalid("every planCode must match ^[a-z0-9_-]{1,40}$.");
    }
    if (seen.has(planCode)) invalid(`duplicate planCode "${planCode}".`);
    seen.add(planCode);
    const includedMinutes = record.includedMinutes;
    if (typeof includedMinutes !== "number" || !Number.isInteger(includedMinutes) || includedMinutes < 1 || includedMinutes > 1_000_000) {
      invalid(`plan "${planCode}": includedMinutes must be an integer in [1, 1000000].`);
    }
    const smsIncluded = record.smsIncluded ?? false;
    if (typeof smsIncluded !== "boolean") invalid(`plan "${planCode}": smsIncluded must be a boolean.`);
    plans.push({ planCode, includedMinutes, smsIncluded });
  }
  const defaultRaw = env[VOICE_DEFAULT_PLAN_ENV_VAR];
  let defaultPlanCode: string | null = null;
  if (defaultRaw !== undefined && defaultRaw.trim().length > 0) {
    if (!seen.has(defaultRaw.trim())) {
      throw new Error(`${VOICE_DEFAULT_PLAN_ENV_VAR} "${defaultRaw.trim()}" is not in the catalog.`);
    }
    defaultPlanCode = defaultRaw.trim();
  }
  return { plans, defaultPlanCode };
}

export function findPlan(catalog: VoicePlanCatalog, planCode: string): VoicePlan | undefined {
  return catalog.plans.find((p) => p.planCode === planCode);
}

// ── per-firm resolution ──────────────────────────────────────────────────────

export interface EntitlementDeps {
  /** The firm's subscription row, when one exists. */
  findSubscription: (firmId: number) => Promise<{ planCode: string; state: string } | undefined>;
  env?: Record<string, string | undefined>;
}

async function productionEntitlementDeps(): Promise<Pick<EntitlementDeps, "findSubscription">> {
  const { db } = await import("@workspace/db");
  const { voiceSubscriptions } = await import("@workspace/db/schema/voice");
  const { eq } = await import("drizzle-orm");
  return {
    findSubscription: async (firmId) => {
      const [row] = await db
        .select({ planCode: voiceSubscriptions.planCode, state: voiceSubscriptions.state })
        .from(voiceSubscriptions)
        .where(eq(voiceSubscriptions.firmId, firmId))
        .limit(1);
      return row;
    },
  };
}

export type FirmEntitlements =
  | { source: "subscription"; plan: VoicePlan; subscriptionState: string }
  | { source: "default_plan"; plan: VoicePlan }
  | { source: "none" };

/**
 * Precedence: the firm's subscription plan (any state — entitlement
 * ENFORCEMENT on suspended/canceled firms is an activation decision the
 * caller makes with subscriptionState in hand), then the catalog's
 * default plan, then none. With no catalog configured, always none.
 */
export async function resolveEntitlementsForFirm(
  firmId: number,
  deps: Partial<EntitlementDeps> = {},
): Promise<FirmEntitlements> {
  const catalog = loadVoicePlanCatalogFromEnv(deps.env ?? process.env);
  if (catalog === null) return { source: "none" };
  const findSubscription = deps.findSubscription ?? (await productionEntitlementDeps()).findSubscription;
  const subscription = await findSubscription(firmId);
  if (subscription) {
    const plan = findPlan(catalog, subscription.planCode);
    if (plan) return { source: "subscription", plan, subscriptionState: subscription.state };
  }
  if (catalog.defaultPlanCode !== null) {
    const plan = findPlan(catalog, catalog.defaultPlanCode);
    if (plan) return { source: "default_plan", plan };
  }
  return { source: "none" };
}

/**
 * The P7 cap check's per-firm minutes source: plan minutes when
 * entitlements resolve, else the flat VOICE_USAGE_INCLUDED_MINUTES
 * fallback (P7 contract), else null (no cap).
 */
export async function resolveIncludedMinutesForFirm(
  firmId: number,
  deps: Partial<EntitlementDeps> = {},
): Promise<number | null> {
  const entitlements = await resolveEntitlementsForFirm(firmId, deps);
  if (entitlements.source !== "none") return entitlements.plan.includedMinutes;
  const { loadUsageCapMinutesFromEnv } = await import("../voiceUsage/usageService.js");
  return loadUsageCapMinutesFromEnv(deps.env ?? process.env);
}
