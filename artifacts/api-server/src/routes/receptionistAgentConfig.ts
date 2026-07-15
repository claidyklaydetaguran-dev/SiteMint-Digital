import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, intakeFirms } from "@workspace/db";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";

const router = Router();

const MAX_QUESTIONS   = 6;
const MAX_Q_LENGTH    = 200;
const MAX_GREETING    = 500;
const MAX_DESCRIPTION = 1000;

// ── GET /api/receptionist/agent-config ────────────────────────────────────────
// Returns the logged-in firm's current agent configuration.

router.get(
  "/receptionist/agent-config",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const [firm] = await db
        .select({
          name:                intakeFirms.name,
          industry:            intakeFirms.industry,
          greetingMessage:     intakeFirms.greetingMessage,
          businessDescription: intakeFirms.businessDescription,
          qualifyingQuestions: intakeFirms.qualifyingQuestions,
        })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, req.firmId!))
        .limit(1);

      if (!firm) {
        res.status(404).json({ error: "Firm not found" });
        return;
      }

      res.json({
        firm: { ...firm, qualifyingQuestions: firm.qualifyingQuestions ?? [] },
      });
    } catch (err) {
      req.log.error({ err }, "[receptionist] GET agent-config error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── PATCH /api/receptionist/agent-config ──────────────────────────────────────
// Updates the logged-in firm's agent configuration.
// Only updates provided fields. firmId-scoped — cannot edit another firm.

router.patch(
  "/receptionist/agent-config",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const { greetingMessage, businessDescription, qualifyingQuestions } =
        req.body as {
          greetingMessage?:     unknown;
          businessDescription?: unknown;
          qualifyingQuestions?: unknown;
        };

      // Validate greetingMessage
      if (greetingMessage !== undefined) {
        if (typeof greetingMessage !== "string" || greetingMessage.length > MAX_GREETING) {
          res.status(400).json({
            error: `greetingMessage must be a string of at most ${MAX_GREETING} characters`,
          });
          return;
        }
      }

      // Validate businessDescription
      if (businessDescription !== undefined) {
        if (typeof businessDescription !== "string" || businessDescription.length > MAX_DESCRIPTION) {
          res.status(400).json({
            error: `businessDescription must be a string of at most ${MAX_DESCRIPTION} characters`,
          });
          return;
        }
      }

      // Validate qualifyingQuestions
      if (qualifyingQuestions !== undefined) {
        if (!Array.isArray(qualifyingQuestions)) {
          res.status(400).json({ error: "qualifyingQuestions must be an array" });
          return;
        }
        if (qualifyingQuestions.length > MAX_QUESTIONS) {
          res.status(400).json({
            error: `qualifyingQuestions may have at most ${MAX_QUESTIONS} items`,
          });
          return;
        }
        for (const q of qualifyingQuestions) {
          if (typeof q !== "string" || q.trim().length === 0) {
            res.status(400).json({ error: "Each qualifying question must be a non-empty string" });
            return;
          }
          if (q.length > MAX_Q_LENGTH) {
            res.status(400).json({
              error: `Each qualifying question must be at most ${MAX_Q_LENGTH} characters`,
            });
            return;
          }
        }
      }

      // Build update payload — only include provided fields
      const updates: Partial<{
        greetingMessage:     string | null;
        businessDescription: string | null;
        qualifyingQuestions: string[];
      }> = {};

      if (greetingMessage !== undefined) {
        updates.greetingMessage = (greetingMessage as string).trim() || null;
      }
      if (businessDescription !== undefined) {
        updates.businessDescription = (businessDescription as string).trim() || null;
      }
      if (qualifyingQuestions !== undefined) {
        updates.qualifyingQuestions = (qualifyingQuestions as string[]).map(q => q.trim());
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      await db
        .update(intakeFirms)
        .set(updates)
        .where(eq(intakeFirms.id, req.firmId!));

      const [updated] = await db
        .select({
          name:                intakeFirms.name,
          industry:            intakeFirms.industry,
          greetingMessage:     intakeFirms.greetingMessage,
          businessDescription: intakeFirms.businessDescription,
          qualifyingQuestions: intakeFirms.qualifyingQuestions,
        })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, req.firmId!))
        .limit(1);

      req.log.info(
        { firmId: req.firmId, fields: Object.keys(updates) },
        "[receptionist] agent-config updated",
      );

      res.json({
        firm: { ...updated, qualifyingQuestions: updated.qualifyingQuestions ?? [] },
      });
    } catch (err) {
      req.log.error({ err }, "[receptionist] PATCH agent-config error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
