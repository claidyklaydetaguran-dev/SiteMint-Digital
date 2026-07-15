/**
 * CRM-admin oversight of AI Receptionist customer accounts.
 * Auth: same requireAdmin (Bearer token) as crm.ts / intakeAgent.ts.
 * NOT using receptionist customer cookie auth — these are internal-facing routes.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql, isNotNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms, intakeConversations } from "@workspace/db/schema";
import { validateToken } from "../lib/admin-session.js";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!validateToken(token)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

// ── GET /api/admin/receptionist-accounts ──────────────────────────────────────
// Returns all intake_firms rows with a real email (i.e. actual customer signups).
// Each entry includes conversation count + trial info.
// Sorted by signup date (newest first).

router.get(
  "/admin/receptionist-accounts",
  requireAdmin,
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
