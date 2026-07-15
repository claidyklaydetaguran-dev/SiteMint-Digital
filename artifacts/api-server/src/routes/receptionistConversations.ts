import { Router, type Request, type Response } from "express";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeFirms, intakeConversations, intakeMessages } from "@workspace/db/schema";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";

const router = Router();

// All routes gated — req.firmId is guaranteed after middleware.

// ── GET /api/receptionist/conversations ───────────────────────────────────────
// Returns all conversations for the logged-in firm.
// Each conversation includes `isOverCap` computed dynamically from creation-order
// rank vs. the firm's trialConversationsLimit. No static flag stored — if a
// firm upgrades their plan, the flag disappears automatically without migration.

router.get(
  "/receptionist/conversations",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      // Fetch firm details for cap computation
      const [firm] = await db
        .select({
          planTier:                intakeFirms.planTier,
          trialConversationsLimit: intakeFirms.trialConversationsLimit,
        })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, req.firmId!));

      const rows = await db
        .select()
        .from(intakeConversations)
        .where(eq(intakeConversations.firmId, req.firmId!))
        .orderBy(desc(intakeConversations.lastMessageAt));

      const isTrialFirm = (firm?.planTier ?? "trial") !== "paid";
      const limit       = firm?.trialConversationsLimit ?? 20;

      // Sort by creation order to determine rank
      const byCreation = [...rows].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      const conversations = rows.map((c) => {
        const rank = byCreation.findIndex((r) => r.id === c.id) + 1; // 1-based
        return { ...c, isOverCap: isTrialFirm && rank > limit };
      });

      res.json({ conversations });
    } catch (err) {
      req.log.error({ err }, "[receptionist] GET conversations error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── GET /api/receptionist/conversations/:id ───────────────────────────────────
// Returns a single conversation + its messages — ONLY if it belongs to req.firmId.
// Attempting to access another firm's conversation returns 404 (no information leak).

router.get(
  "/receptionist/conversations/:id",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params["id"] ?? ""), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid conversation id." });
        return;
      }

      const [conversation] = await db
        .select()
        .from(intakeConversations)
        .where(
          and(
            eq(intakeConversations.id, id),
            eq(intakeConversations.firmId, req.firmId!), // firm isolation enforced here
          ),
        );

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }

      const messages = await db
        .select()
        .from(intakeMessages)
        .where(eq(intakeMessages.conversationId, id))
        .orderBy(asc(intakeMessages.createdAt));

      // Compute isOverCap for this conversation's detail view
      const [firm] = await db
        .select({
          planTier:                intakeFirms.planTier,
          trialConversationsLimit: intakeFirms.trialConversationsLimit,
        })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, req.firmId!));

      const isTrialFirm = (firm?.planTier ?? "trial") !== "paid";
      if (isTrialFirm) {
        // Rank = number of conversations created at or before this one
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(intakeConversations)
          .where(
            and(
              eq(intakeConversations.firmId, req.firmId!),
              sql`created_at <= ${conversation.createdAt}`,
            ),
          );
        const rank = Number(count);
        const limit = firm?.trialConversationsLimit ?? 20;
        res.json({ conversation: { ...conversation, isOverCap: rank > limit }, messages });
      } else {
        res.json({ conversation: { ...conversation, isOverCap: false }, messages });
      }
    } catch (err) {
      req.log.error({ err }, "[receptionist] GET conversation/:id error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
