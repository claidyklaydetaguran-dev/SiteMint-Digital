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
import {
  findFirmIdForVapiAssistant,
  storeVapiWebhookEvent,
  readStoredToolCallResults,
  storeToolCallResults,
} from "../lib/voice/webhooks/realCallsRepository.js";
import { buildVapiEventKey } from "../lib/voice/webhooks/eventKey.js";
import { dispatchToolCalls } from "../lib/voice/tools/toolDispatcher.js";
import { openVoiceIssue } from "../lib/voiceIssues/voiceIssueService.js";
import { resolveAssistantForNumber, resolveTransferDestination, scanEmergencyLanguage } from "../lib/voiceNumbers/numberService.js";

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

  // P6: assistant-request precedes assistant attribution by definition —
  // the whole point is telling the provider WHICH assistant answers this
  // number. Tenant identity comes from our own number inventory row.
  if (message.type === "assistant-request") {
    const providerNumberId = message.call.phoneNumberId;
    if (!providerNumberId) {
      res.status(200).json({ error: "This number is not in service." });
      return;
    }
    try {
      const resolution = await resolveAssistantForNumber(providerNumberId);
      if (resolution.ok) {
        await storeVapiWebhookEvent(resolution.firmId, message);
        req.log.info({ firmId: resolution.firmId, callId: message.call.id }, "[voice webhook] assistant-request routed");
        // The provider assistant id goes back to the PROVIDER itself here —
        // never to a client. This is the inbound-routing answer.
        res.status(200).json({ assistantId: resolution.providerAssistantId });
      } else {
        req.log.warn({ reason: resolution.reason, callId: message.call.id }, "[voice webhook] assistant-request unroutable");
        const spoken =
          resolution.reason === "paused"
            ? "This number is temporarily unavailable. Please try again later."
            : "This number is not in service.";
        res.status(200).json({ error: spoken });
      }
    } catch (err) {
      req.log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[voice webhook] assistant-request failed");
      res.status(200).json({ error: "This number is temporarily unavailable. Please try again later." });
    }
    return;
  }

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

  // P6: transfer-destination-request — in-call escalation routing against
  // the firm's approved destination list with the business-hours guard.
  // Failure is a spoken outcome, never a dropped call.
  if (message.type === "transfer-destination-request") {
    try {
      await storeVapiWebhookEvent(firmId, message);
      const resolution = await resolveTransferDestination(firmId);
      if (resolution.ok) {
        req.log.info({ firmId, callId: message.call.id }, "[voice webhook] transfer destination resolved");
        res.status(200).json({
          destination: {
            type: "number",
            number: resolution.destinationE164,
            message: `Connecting you to ${resolution.label}.`,
          },
        });
      } else {
        req.log.info({ firmId, reason: resolution.reason }, "[voice webhook] transfer unavailable");
        res.status(200).json({
          error:
            resolution.reason === "after_hours"
              ? "The office is closed right now, but I can take a detailed message."
              : "No one is available for a transfer right now, but I can take a detailed message.",
        });
      }
    } catch (err) {
      req.log.error({ firmId, errorClass: err instanceof Error ? err.name : "unknown" }, "[voice webhook] transfer resolution failed");
      res.status(200).json({ error: "I could not reach anyone to transfer you, but I can take a detailed message." });
    }
    return;
  }

  // P3: tool-calls are request/response — the model is waiting on the answer.
  // The ledger still provides idempotency: a redelivered batch is answered
  // from the stored results, so a mutating tool never executes twice for the
  // same toolCallId.
  if (message.type === "tool-calls") {
    try {
      const eventKey = buildVapiEventKey(message);
      const { inserted } = await storeVapiWebhookEvent(firmId, message);
      if (!inserted) {
        const replay = await readStoredToolCallResults(eventKey);
        if (replay) {
          req.log.info(
            { firmId, callId: message.call.id, count: replay.results.length, authMode: auth.mode },
            "[voice webhook] tool-calls replayed from stored results",
          );
          res.status(200).json({ results: replay.results });
          return;
        }
        // Stored event without results: the first attempt crashed between
        // store and respond — executing now is the correct completion.
      }
      const calls = (message.toolCallList ?? []).map((t) => ({ toolCallId: t.id, name: t.name, args: t.arguments }));
      const results = await dispatchToolCalls(firmId, calls);
      await storeToolCallResults(firmId, eventKey, results);
      req.log.info(
        { firmId, callId: message.call.id, count: results.length, authMode: auth.mode },
        "[voice webhook] tool-calls executed",
      );
      res.status(200).json({ results });
    } catch (err) {
      req.log.error(
        { firmId, callId: message.call.id, errorClass: err instanceof Error ? err.name : "unknown" },
        "[voice webhook] tool-calls handling failed",
      );
      res.status(500).json({ error: "Internal error" });
    }
    return;
  }

  try {
    const { inserted } = await storeVapiWebhookEvent(firmId, message);
    // P5: an end-of-call report also links the caller to a firm-scoped
    // voice contact (idempotent; conflict-driven). Best-effort: identity
    // must never turn a stored event into a retry loop.
    // P6: flag emergency language for immediate operator attention. A
    // conservative keyword scan — the assistant's own prompt handles the
    // in-call "hang up and dial 911" instruction; this guarantees a human
    // sees that it happened.
    if (message.type === "end-of-call-report") {
      const scan = scanEmergencyLanguage(message.transcript);
      if (scan.flagged) {
        try {
          await openVoiceIssue({
            firmId,
            level: "critical",
            code: "emergency_language_detected",
            message: "A call transcript matched emergency language; review immediately.",
            dedupeKey: message.call.id,
            context: { callId: message.call.id },
          });
        } catch { /* flagging is best-effort */ }
      }
    }
    if (message.type === "end-of-call-report" && message.call.customerNumber) {
      try {
        const { linkCallToContact } = await import("../lib/voiceContacts/contactLinker.js");
        await linkCallToContact(firmId, message.call.id, message.call.customerNumber, undefined);
      } catch (linkErr) {
        req.log.warn(
          { firmId, callId: message.call.id, errorClass: linkErr instanceof Error ? linkErr.name : "unknown" },
          "[voice webhook] contact linking failed",
        );
      }
    }
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
