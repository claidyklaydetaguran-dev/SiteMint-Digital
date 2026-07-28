// Milestone 2 foundation: real inbound-call webhook receiver.
//
// Architecture (docs/ai-receptionist/ROADMAP.md, DECISION_LOG.md): Twilio
// owns the phone number and, once it is imported into Vapi as a BYO number,
// Vapi owns the call itself and is the only party that calls back to
// SiteMint — Twilio never calls this server directly for voice. Vapi is
// therefore the sole source of truth for call ids and lifecycle status;
// duplicate/out-of-order delivery is handled by the idempotent event store
// (see lib/voice/webhooks/realCallsRepository.ts) rather than by anything in
// this route.
//
// Raw body capture for signature verification is registered in app.ts,
// mirroring the existing Stripe / Resend / receptionist-billing webhooks —
// BEFORE the global express.json() parser runs.

import { Router, type Request, type Response } from "express";
import {
  verifyVapiWebhookSignature,
  VAPI_SIGNATURE_HEADER,
  VAPI_TIMESTAMP_HEADER,
} from "../lib/voice/webhooks/vapiWebhookAuth.js";
import { parseVapiServerMessage } from "../lib/voice/webhooks/vapiServerMessage.js";
import { findFirmIdForVapiAssistant, storeVapiWebhookEvent } from "../lib/voice/webhooks/realCallsRepository.js";

const router = Router();

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// ── POST /api/voice/webhooks/vapi ─────────────────────────────────────────────

router.post("/voice/webhooks/vapi", async (req: Request, res: Response) => {
  // req.body is the raw Buffer captured by app.ts for this exact path.
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    req.log.error("[voice webhook] raw body middleware not applied — check app.ts registration order");
    res.status(500).json({ error: "Webhook misconfigured" });
    return;
  }

  const auth = verifyVapiWebhookSignature({
    rawBody,
    signatureHeader: headerValue(req, VAPI_SIGNATURE_HEADER),
    timestampHeader: headerValue(req, VAPI_TIMESTAMP_HEADER),
    secret: process.env["VAPI_WEBHOOK_SECRET"],
  });
  if (!auth.ok) {
    // Never echo the failure reason to the caller — an attacker probing
    // signature verification gets a uniform, uninformative rejection.
    req.log.warn({ reason: auth.reason }, "[voice webhook] authentication failed");
    const status = auth.reason === "not_configured" ? 503 : 401;
    res.status(status).json({ error: "Unauthorized" });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Malformed request body" });
    return;
  }

  const parsed = parseVapiServerMessage(body);
  if (!parsed.ok) {
    req.log.warn({ reason: parsed.reason }, "[voice webhook] rejected malformed server message");
    res.status(400).json({ error: "Malformed request body" });
    return;
  }
  const { message } = parsed;

  if (!message.call.assistantId) {
    // We can't safely associate this event with a firm. Acknowledge so Vapi
    // doesn't retry indefinitely, but do not persist anything.
    req.log.warn({ callId: message.call.id, type: message.type }, "[voice webhook] event missing assistantId");
    res.status(200).json({ received: true });
    return;
  }

  // The firm is derived ONLY from our own voice_assistants row for this
  // provider assistant id — never trusted from anything in the request body.
  const firmId = await findFirmIdForVapiAssistant(message.call.assistantId);
  if (!firmId) {
    req.log.warn(
      { assistantId: message.call.assistantId, type: message.type },
      "[voice webhook] event for an assistant not known to this application",
    );
    res.status(200).json({ received: true });
    return;
  }

  const { inserted } = await storeVapiWebhookEvent(firmId, message);
  req.log.info(
    { firmId, callId: message.call.id, type: message.type, inserted },
    "[voice webhook] event processed",
  );

  res.status(200).json({ received: true });
});

export default router;
