// Support requests a business can send, follow up and close.
//
// Authenticated and firm-scoped: `req.firmId` comes from the receptionist
// session, never from a body or a parameter, and another business's request id
// answers 404 — the same answer as one that does not exist.
//
// Two things this route deliberately does NOT do:
//   - it never emails the customer. A person replies from SiteMint's own inbox,
//     and the thread here is the record of that conversation;
//   - it never claims SiteMint was told. The alert to the operator inbox is
//     best-effort, and only a send that the provider accepted stamps
//     `operator_notified_at`, which the dashboard reads back.

import { Router, type IRouter, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  addSupportMessage,
  closeSupportRequest,
  createSupportRequest,
  getSupportRequest,
  listSupportRequests,
  loadAccountEmail,
  markOperatorNotified,
  validateSupportMessage,
  validateSupportRequest,
} from "../lib/voiceSupport/supportService.js";
import type { VoiceSupportMessage, VoiceSupportRequest } from "@workspace/db/schema/voice";

const router: IRouter = Router();

function serializeRequest(row: VoiceSupportRequest) {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    status: row.status,
    requestedByEmail: row.requestedByEmail,
    /** Whether SiteMint's own inbox has been told — not whether anyone replied. */
    operatorNotified: row.operatorNotifiedAt !== null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeMessage(row: VoiceSupportMessage) {
  return { id: row.id, author: row.author, body: row.body, createdAt: row.createdAt.toISOString() };
}

/**
 * Tells SiteMint's own inbox that a request exists. It carries the firm id, the
 * request id, the category and the subject — enough to act on — and not the
 * message body: the operator alert inbox is shared, and the body belongs to the
 * business's own record.
 */
async function alertOperator(firmId: number, row: VoiceSupportRequest): Promise<boolean> {
  try {
    const { createAlertTransportFromEnv } = await import("../lib/voiceAlerts/alertTransport.js");
    const result = await createAlertTransportFromEnv().send({
      subject: `[SiteMint support] #${row.id} ${row.subject}`.slice(0, 160),
      text: [
        "A business sent a support request through the dashboard.",
        "",
        `Request: #${row.id}`,
        `Firm:    ${firmId}`,
        `Category:${row.category}`,
        `Subject: ${row.subject}`,
        `Reply to:${row.requestedByEmail}`,
        "",
        "The message itself is on the request in the dashboard. This alert carries no customer content by design.",
      ].join("\n"),
      idempotencyKey: `support-request/${row.id}`,
    });
    return result.ok;
  } catch {
    return false;
  }
}

// ── POST /api/receptionist/support/requests ──────────────────────────────────

router.post("/receptionist/support/requests", requireReceptionistAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const validation = validateSupportRequest({ subject: body.subject, body: body.body, category: body.category });
  if (!validation.ok) {
    res.status(400).json({ error: validation.errors[0]!.message, fieldErrors: validation.errors });
    return;
  }
  try {
    const firmId = req.firmId!;
    const email = await loadAccountEmail(firmId);
    if (!email) {
      res.status(409).json({
        error: "Add an email address to your account before sending a support request, so we can reply to you.",
      });
      return;
    }
    const created = await createSupportRequest(firmId, email, validation.value);
    if (await alertOperator(firmId, created.request)) {
      await markOperatorNotified(firmId, created.request.id);
    }
    const fresh = await getSupportRequest(firmId, created.request.id);
    res.status(201).json({
      request: serializeRequest((fresh ?? created).request),
      messages: (fresh ?? created).messages.map(serializeMessage),
    });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[support] create failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/support/requests ───────────────────────────────────

router.get("/receptionist/support/requests", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const rows = await listSupportRequests(req.firmId!);
    res.json({ items: rows.map(serializeRequest), count: rows.length });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[support] list failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/receptionist/support/requests/:id ───────────────────────────────

router.get("/receptionist/support/requests/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  try {
    const found = await getSupportRequest(req.firmId!, id);
    if (!found) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    res.json({ request: serializeRequest(found.request), messages: found.messages.map(serializeMessage) });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[support] read failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/support/requests/:id/messages ─────────────────────

router.post("/receptionist/support/requests/:id/messages", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  const validation = validateSupportMessage((req.body as Record<string, unknown> | undefined)?.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.errors[0]!.message, fieldErrors: validation.errors });
    return;
  }
  try {
    const updated = await addSupportMessage(req.firmId!, id, "business", validation.value);
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    res.status(201).json({ request: serializeRequest(updated.request), messages: updated.messages.map(serializeMessage) });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[support] reply failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/receptionist/support/requests/:id/close ────────────────────────

router.post("/receptionist/support/requests/:id/close", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid request id." });
    return;
  }
  try {
    const closed = await closeSupportRequest(req.firmId!, id);
    if (!closed) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    res.json({ request: serializeRequest(closed) });
  } catch (err) {
    req.log.error({ firmId: req.firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[support] close failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
