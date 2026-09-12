// V7: the business's own view of the messages its assistant took, and the
// follow-up workflow it drives from them.
//
// Every route requires a receptionist session and takes firmId from
// req.firmId only — never a parameter, never a body field — so a cross-firm id
// is indistinguishable from a nonexistent one.
//
// What is deliberately NOT here: transcripts and recordings. A saved message is
// the structured thing a caller confirmed; the recording/transcript restrictions
// stay owned by VOICE_ARTIFACT_POLICY and the existing call-detail route.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  getVoiceMessageForFirm,
  isMessageFollowUpStatus,
  listVoiceMessagesForFirm,
  setVoiceMessageFollowUpStatus,
  type MessageFollowUpStatus,
} from "../lib/voiceMessages/messageRepository.js";
import type { VoiceMessage } from "@workspace/db/schema/voice";

const router = Router();

function serializeMessage(message: VoiceMessage) {
  return {
    id: message.id,
    callId: message.providerCallId,
    callerName: message.callerName,
    topic: message.topic,
    details: message.details,
    callbackPhone: message.callbackPhone,
    callbackEmail: message.callbackEmail,
    urgency: message.urgency,
    emailAckRequested: message.emailAckRequested,
    followUpStatus: message.followUpStatus,
    statusChangedAt: message.statusChangedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

function parseStatusFilter(raw: unknown): MessageFollowUpStatus[] | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const valid = requested.filter(isMessageFollowUpStatus);
  // An unrecognized filter returns everything rather than silently nothing: an
  // empty inquiry list is the one answer a business must never be given wrongly.
  return valid.length > 0 ? valid : undefined;
}

// ── GET /api/receptionist/voice/messages ──────────────────────────────────────

router.get("/receptionist/voice/messages", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const statuses = parseStatusFilter(req.query["status"]);
    const messages = await listVoiceMessagesForFirm(req.firmId!, statuses ? { statuses } : {});
    const counts = { new: 0, in_progress: 0, resolved: 0 };
    // Counts come from the unfiltered set so the tabs do not change as you
    // filter. One extra indexed read, and it keeps the UI honest.
    const all = statuses ? await listVoiceMessagesForFirm(req.firmId!) : messages;
    for (const message of all) {
      if (message.followUpStatus === "new") counts.new += 1;
      else if (message.followUpStatus === "in_progress") counts.in_progress += 1;
      else if (message.followUpStatus === "resolved") counts.resolved += 1;
    }
    res.json({ items: messages.map(serializeMessage), count: messages.length, counts });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to list voice messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/voice/messages/:id ──────────────────────────────────

router.get("/receptionist/voice/messages/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid message id" });
    return;
  }
  try {
    const message = await getVoiceMessageForFirm(req.firmId!, id);
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message: serializeMessage(message) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to load voice message");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/receptionist/voice/messages/:id ────────────────────────────────
//
// The whole follow-up workflow: New -> In progress -> Resolved, in any order,
// because a business that resolves something immediately should not have to
// click through an intermediate state it never used.

router.patch("/receptionist/voice/messages/:id", requireReceptionistAuth, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid message id" });
    return;
  }
  const status = (req.body as { followUpStatus?: unknown } | undefined)?.followUpStatus;
  if (!isMessageFollowUpStatus(status)) {
    res.status(400).json({ error: "followUpStatus must be one of: new, in_progress, resolved" });
    return;
  }
  try {
    const updated = await setVoiceMessageFollowUpStatus(req.firmId!, id, status);
    if (!updated) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message: serializeMessage(updated) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to update voice message status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/voice/notifications ─────────────────────────────────
//
// Honest delivery status for the dashboard. `accepted` means the email provider
// accepted the message and, when it returned one, gave us a receipt id. It does
// NOT mean the message reached an inbox — nothing in this product can observe
// that, so nothing in this response claims it.

router.get("/receptionist/voice/notifications", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const { db } = await import("@workspace/db");
    const { voiceNotifications } = await import("@workspace/db/schema/voice");
    const { desc, eq } = await import("drizzle-orm");
    const rows = await db
      .select({
        id: voiceNotifications.id,
        kind: voiceNotifications.kind,
        dedupeKey: voiceNotifications.dedupeKey,
        recipient: voiceNotifications.recipient,
        subject: voiceNotifications.subject,
        state: voiceNotifications.state,
        attempts: voiceNotifications.attempts,
        lastErrorCode: voiceNotifications.lastErrorCode,
        acceptedAt: voiceNotifications.acceptedAt,
        nextAttemptAt: voiceNotifications.nextAttemptAt,
        createdAt: voiceNotifications.createdAt,
      })
      .from(voiceNotifications)
      .where(eq(voiceNotifications.firmId, req.firmId!))
      .orderBy(desc(voiceNotifications.id))
      .limit(50);

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        callId: row.dedupeKey.startsWith("post_call:") ? row.dedupeKey.slice("post_call:".length) : null,
        recipient: row.recipient,
        subject: row.subject,
        state: row.state,
        attempts: row.attempts,
        // Already one of our own short codes; safe to show an owner.
        lastErrorCode: row.lastErrorCode,
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        nextAttemptAt: row.nextAttemptAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      count: rows.length,
    });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to list voice notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
