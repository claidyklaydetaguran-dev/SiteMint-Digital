// P8: internal-operator diagnostics + the ONE way a firm↔Stripe mapping
// comes to exist.
//
// Auth: the shared CRM gate, `requireCrmAuth` — a per-person
// `crm_staff_session` with its CSRF check, MFA challenge and named permission,
// or the legacy shared bearer while `CRM_LEGACY_BEARER_ENABLED` is not
// "false". A superset of the bearer-only guard this file used to define
// locally, so no existing caller loses access.
//
// Every mutation is still audited in the voice trail with actor 'admin' (that
// trail's actor vocabulary is fixed), and additionally in the CRM trail with
// the real person, so full access is not unlogged access.
//
// Setting a subscription mapping here is deliberate design, not
// convenience: the billing webhook refuses to attach events to firms by
// anything found in a request body, so the mapping must pre-exist as an
// audited internal action.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  voiceSubscriptions,
  voiceIssues,
  voiceNumbers,
  voiceUsageLedger,
  voiceUsageCapStates,
} from "@workspace/db/schema/voice";
import { auditAction, requireCrmAuth } from "../lib/staffAuth.js";
import { recordAuditEvent } from "../lib/voiceAccounts/auditLog.js";
import { computePeriodYm } from "../lib/voiceUsage/usageService.js";
import { loadVoicePlanCatalogFromEnv, findPlan } from "../lib/voiceBilling/entitlements.js";
import { SUBSCRIPTION_STATES, type SubscriptionState } from "../lib/voiceBilling/subscriptionState.js";

const router: IRouter = Router();

// ── GET /api/admin/voice/firms/:id/diagnostics ───────────────────────────────
//
// Permission: `settings.read` — operational state about one firm's service,
// the same class as `/crm/operations/jobs` and `/crm/phone/status`. Held by
// every staff role, so anyone who can run the operation can open the page.

router.get("/admin/voice/firms/:id/diagnostics", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const firmId = Number(req.params.id);
  if (!Number.isInteger(firmId)) {
    res.status(400).json({ error: "Invalid firm id." });
    return;
  }
  try {
    const period = computePeriodYm(new Date());
    const [subscription] = await db.select().from(voiceSubscriptions).where(eq(voiceSubscriptions.firmId, firmId)).limit(1);
    const [usage] = await db
      .select({
        totalSeconds: sql<number>`coalesce(sum(${voiceUsageLedger.durationSec}), 0)::int`,
        callCount: sql<number>`count(*)::int`,
      })
      .from(voiceUsageLedger)
      .where(and(eq(voiceUsageLedger.firmId, firmId), eq(voiceUsageLedger.periodYm, period)));
    const [openIssues] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(voiceIssues)
      .where(and(eq(voiceIssues.firmId, firmId), isNull(voiceIssues.resolvedAt)));
    const numbers = await db
      .select({ id: voiceNumbers.id, phoneE164: voiceNumbers.phoneE164, state: voiceNumbers.state })
      .from(voiceNumbers)
      .where(eq(voiceNumbers.firmId, firmId));
    const [capState] = await db
      .select()
      .from(voiceUsageCapStates)
      .where(and(eq(voiceUsageCapStates.firmId, firmId), eq(voiceUsageCapStates.periodYm, period)))
      .limit(1);
    res.json({
      firmId,
      period,
      subscription: subscription
        ? { planCode: subscription.planCode, state: subscription.state, graceUntil: subscription.graceUntil, hasStripeMapping: subscription.stripeCustomerId !== null }
        : null,
      usage: { totalSeconds: usage?.totalSeconds ?? 0, callCount: usage?.callCount ?? 0 },
      capState: capState ? { state: capState.state, capMinutes: capState.capMinutes } : null,
      openIssues: openIssues?.count ?? 0,
      numbers,
    });
  } catch (err) {
    req.log.error({ firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[admin voice] diagnostics failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/voice/firms/:id/subscription ──────────────────────────────
//
// Permission: `billing.manage`. This is not an operational read — it sets a
// firm's plan, its subscription state, and the firm↔Stripe customer mapping
// that every later billing event is attached by. That is billing
// administration, and `billing.manage` is OWNER_ONLY, so it cannot be
// side-loaded onto a non-owner by a per-person grant either.

router.put("/admin/voice/firms/:id/subscription", requireCrmAuth("billing.manage"), async (req: Request, res: Response) => {
  const firmId = Number(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(firmId)) {
    res.status(400).json({ error: "Invalid firm id." });
    return;
  }
  const planCode = typeof body.planCode === "string" ? body.planCode.trim() : "";
  let catalog;
  try {
    catalog = loadVoicePlanCatalogFromEnv();
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "Plan catalog invalid." });
    return;
  }
  if (catalog === null) {
    res.status(503).json({ error: "VOICE_PLAN_CATALOG_JSON is not configured." });
    return;
  }
  if (!findPlan(catalog, planCode)) {
    res.status(400).json({ error: "planCode is not in the catalog." });
    return;
  }
  const stripeCustomerId =
    typeof body.stripeCustomerId === "string" && /^cus_[A-Za-z0-9]{3,64}$/.test(body.stripeCustomerId)
      ? body.stripeCustomerId
      : null;
  const stateInput = typeof body.state === "string" ? body.state : "active";
  if (!(SUBSCRIPTION_STATES as readonly string[]).includes(stateInput)) {
    res.status(400).json({ error: `state must be one of ${SUBSCRIPTION_STATES.join(", ")}.` });
    return;
  }
  const state = stateInput as SubscriptionState;
  if (state === "grace") {
    // grace requires a dunning deadline; it is entered by billing events, not by hand.
    res.status(400).json({ error: "grace is entered by billing events, not set directly." });
    return;
  }
  try {
    const now = new Date();
    const [row] = await db
      .insert(voiceSubscriptions)
      .values({ firmId, planCode, state, stripeCustomerId, updatedAt: now })
      .onConflictDoUpdate({
        target: [voiceSubscriptions.firmId],
        set: { planCode, state, stripeCustomerId, graceUntil: null, updatedAt: now },
      })
      .returning();
    try {
      await recordAuditEvent({
        firmId,
        actor: "admin",
        action: "subscription.mapping_set",
        subject: planCode,
        context: { state, hasStripeMapping: stripeCustomerId !== null },
      });
    } catch {
      // audit best-effort
    }
    // The voice trail's actor vocabulary is a fixed union ("owner" | "system" |
    // "admin"), so it cannot name the person. The CRM trail can, and this is
    // exactly the act worth attributing: falls back to an explicit
    // "legacy-shared-bearer" label when the caller used the shared token, so
    // the pre-cutover gap is visible rather than attributed to nobody.
    try {
      await auditAction(req, "voice.subscription.mapping_set", `firm:${firmId} plan:${planCode}`);
    } catch {
      // audit best-effort
    }
    res.json({
      subscription: row
        ? { planCode: row.planCode, state: row.state, hasStripeMapping: row.stripeCustomerId !== null }
        : null,
    });
  } catch (err) {
    req.log.error({ firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[admin voice] subscription set failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
