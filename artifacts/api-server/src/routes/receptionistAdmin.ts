/**
 * CRM-admin oversight of AI Receptionist customer accounts.
 *
 * Auth: the shared CRM gate, `requireCrmAuth` — a per-person `crm_staff_session`
 * with its CSRF check, MFA challenge and named permission, or the legacy shared
 * bearer while `CRM_LEGACY_BEARER_ENABLED` is not "false". That is a superset of
 * the bearer-only guard this file used to define locally, so no existing caller
 * loses access; what changes is that a member of staff signed in as themselves
 * is no longer refused.
 *
 * NOT using receptionist customer cookie auth — these are internal-facing
 * routes, and the two systems stay separate.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, isNotNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms, intakeConversations } from "@workspace/db/schema";
import { requireCrmAuth } from "../lib/staffAuth.js";

const router: IRouter = Router();

// ── GET /api/admin/receptionist-accounts ──────────────────────────────────────
// Returns all intake_firms rows with a real email (i.e. actual customer signups).
// Each entry includes conversation count + trial info.
// Sorted by signup date (newest first).
//
// Permission: `settings.read`. This is operational state about the service —
// which firms exist, what they are on, how much they have used — which is the
// same class as `/crm/operations/jobs`, `/crm/operations/deliveries` and
// `/crm/phone/status`, all of which read `settings.read`. It is not
// `reports.read`, which in this CRM means business analytics (revenue summary,
// sales forecast). Every staff role holds `settings.read`, so anyone who can
// run the operation can open the page.

router.get(
  "/admin/receptionist-accounts",
  requireCrmAuth("settings.read"),
  async (req: Request, res: Response) => {
    try {
      // Subquery: count conversations per firm
      const rows = await db
        .select({
          id:                      intakeFirms.id,
          name:                    intakeFirms.name,
          email:                   intakeFirms.email,
          twilioNumber:            intakeFirms.twilioNumber,
          planTier:                intakeFirms.planTier,
          trialConversationsLimit: intakeFirms.trialConversationsLimit,
          createdAt:               intakeFirms.createdAt,
          conversationCount: sql<number>`(
            SELECT COUNT(*) FROM intake_conversations ic
            WHERE ic.firm_id = ${intakeFirms.id}
          )`,
        })
        .from(intakeFirms)
        .where(isNotNull(intakeFirms.email))
        .orderBy(desc(intakeFirms.createdAt));

      const accounts = rows.map((r) => ({
        ...r,
        conversationCount: Number(r.conversationCount),
      }));

      res.json({ accounts });
    } catch (err) {
      req.log.error({ err }, "[receptionistAdmin] GET /admin/receptionist-accounts error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
