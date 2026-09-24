// Operator surface for the support requests businesses send.
//
// Without it the customer half is a suggestion box: a business could write and
// see its own thread, and nobody at SiteMint could read or answer it.
//
// Auth: `requireOperator` (lib/operatorGate.ts) — a per-person CRM staff
// session with the named permission, or the legacy shared admin while it
// stands. Reads take `support.read`, writes `support.write`, the same grants
// the CRM's own support desk uses.
//
// These are the only cross-firm support routes. Everything a business itself
// calls stays firm-scoped in routes/receptionistSupport.ts, so a mistake here
// cannot widen what a customer can reach.

import { Router, type IRouter, type Request, type Response } from "express";

import { requireOperator } from "../lib/operatorGate.js";
import { auditAction } from "../lib/staffAuth.js";
import {
  addSupportMessage,
  listAllSupportRequests,
  markSupportInProgress,
  readAnySupportRequest,
  validateSupportMessage,
} from "../lib/voiceSupport/supportService.js";
import type { VoiceSupportMessage, VoiceSupportRequest } from "@workspace/db/schema/voice";

const router: IRouter = Router();

function serializeRequest(row: VoiceSupportRequest) {
  return {
    id: row.id,
    firmId: row.firmId,
    subject: row.subject,
    category: row.category,
    status: row.status,
    requestedByEmail: row.requestedByEmail,
    operatorNotified: row.operatorNotifiedAt !== null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeMessage(row: VoiceSupportMessage) {
  return { id: row.id, author: row.author, body: row.body, createdAt: row.createdAt.toISOString() };
}

// ── GET /api/admin/voice/support/requests ────────────────────────────────────

router.get("/admin/voice/support/requests", requireOperator("support.read"), async (req: Request, res: Response) => {
  try {
    const rows = await listAllSupportRequests();
    res.json({ items: rows.map(serializeRequest), count: rows.length });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin support] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/admin/voice/support/requests/:id ────────────────────────────────

router.get("/admin/voice/support/requests/:id", requireOperator("support.read"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  try {
    const found = await readAnySupportRequest(id);
    if (!found) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    res.json({ request: serializeRequest(found.request), messages: found.messages.map(serializeMessage) });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin support] read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/voice/support/requests/:id/messages ──────────────────────
//
// Replying marks the request answered, which is what the business's screen
// reads. Nothing is emailed from here: the reply is the record of what a person
// said, and the business sees it on its own Support page.

router.post("/admin/voice/support/requests/:id/messages", requireOperator("support.write"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  const validation = validateSupportMessage((req.body as Record<string, unknown> | undefined)?.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.errors[0]!.message });
    return;
  }
  try {
    const existing = await readAnySupportRequest(id);
    if (!existing) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    // The firm comes from the stored request, never from the request body.
    const updated = await addSupportMessage(existing.request.firmId, id, "sitemint", validation.value);
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    await auditAction(req, "support.request.replied", `request:${id} firm:${existing.request.firmId}`);
    res.status(201).json({ request: serializeRequest(updated.request), messages: updated.messages.map(serializeMessage) });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin support] reply failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/admin/voice/support/requests/:id/in-progress ───────────────────

router.post("/admin/voice/support/requests/:id/in-progress", requireOperator("support.write"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  try {
    const updated = await markSupportInProgress(id);
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    await auditAction(req, "support.request.in_progress", `request:${id} firm:${updated.firmId}`);
    res.json({ request: serializeRequest(updated) });
  } catch (err) {
    req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[admin support] status change failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
