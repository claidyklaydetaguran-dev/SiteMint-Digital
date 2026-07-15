import { Router, type Request, type Response } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { intakeConversations, intakeMessages } from "@workspace/db/schema";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";

const router = Router();

// All routes gated — req.firmId is guaranteed after middleware.

// ── GET /api/receptionist/conversations ───────────────────────────────────────
// Returns all conversations for the logged-in firm only.

router.get(
  "/receptionist/conversations",
  requireReceptionistAuth,
  async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(intakeConversations)
        .where(eq(intakeConversations.firmId, req.firmId!))
        .orderBy(desc(intakeConversations.lastMessageAt));

      res.json({ conversations: rows });
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

      res.json({ conversation, messages });
    } catch (err) {
      req.log.error({ err }, "[receptionist] GET conversation/:id error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
