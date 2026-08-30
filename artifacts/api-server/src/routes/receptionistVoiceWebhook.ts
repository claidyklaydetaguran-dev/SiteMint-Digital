// Milestone 2 foundation → P2: real inbound-call webhook receiver.
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
// P2 hardening:
//   - Authentication goes through webhookAuthPolicy.ts: HMAC-only by
//     default (±300 s timestamp bound), previous-secret rotation overlap,
//     and the Bearer bridge only when VAPI_WEBHOOK_ALLOW_BEARER=true.
//   - A store failure is caught: the route answers 500 (so Vapi retries),
//     logs, and opens a firm-scoped voice_issue instead of leaking an
//     unhandled rejection.
//   - Malformed-but-authenticated payloads open a diagnostic issue when a
//     firm can be attributed; auth failures and unknown assistants cannot
//     be attributed to a firm and are log-only by design (voice_issues rows
//     are always firm-scoped).
//
// Raw body capture for signature verification is registered in app.ts,
// mirroring the existing Stripe / Resend / receptionist-billing webhooks —
// BEFORE the global express.json() parser runs.

import { Router, type Request, type Response } from "express";
import { authenticateVapiWebhook } from "../lib/voice/webhooks/webhookAuthPolicy.js";
import { parseVapiServerMessage } from "../lib/voice/webhooks/vapiServerMessage.js";
import { findFirmIdForVapiAssistant, storeVapiWebhookEvent } from "../lib/voice/webhooks/realCallsRepository.js";
import { openVoiceIssue } from "../lib/voiceIssues/voiceIssueService.js";

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

  const auth = authenticateVapiWebhook({
    rawBody,
    header: (name) => headerValue(req, name),
    env: process.env,
  });
  if (!auth.ok) {
    // Never echo the failure reason to the caller — an attacker probing
    // signature verification gets a uniform, uninformative rejection.
    req.log.warn({ reason: auth.reason, mechanism: auth.mechanism }, "[voice webhook] authentication failed");
    const status = auth.reason === "not_configured" ? 503 : 401;
    res.status(status).json({ error: "Unauthorized" });
    return;
  }
  if (auth.mode !== "hmac") {
    // Rotation progress / staging-bridge visibility: which non-primary path
    // authenticated this request. Value is one of our own enum labels.
    req.log.info({ mode: auth.mode }, "[voice webhook] authenticated via non-primary mode");
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

  try {
    const { inserted } = await storeVapiWebhookEvent(firmId, message);
    req.log.info(
      { firmId, callId: message.call.id, type: message.type, inserted, authMode: auth.mode },
      "[voice webhook] event processed",
    );
    res.status(200).json({ received: true });
  } catch (err) {
    req.log.error(
      { firmId, callId: message.call.id, type: message.type, errorClass: err instanceof Error ? err.name : "unknown" },
      "[voice webhook] event store failed",
    );
    try {
      await openVoiceIssue({
        firmId,
        level: "error",
        code: "webhook_store_failed",
        message: "A verified provider webhook event could not be stored; the provider will retry.",
        dedupeKey: message.call.id,
        context: { callId: message.call.id, type: message.type },
      });
    } catch {
      // Issue creation is best-effort; the 500 below already forces a retry.
    }
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
