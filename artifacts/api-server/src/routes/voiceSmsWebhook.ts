// P5: Twilio webhooks for the VOICE number — inbound messages (STOP/START
// consent) and delivery-status callbacks. Authenticated with the voice
// channel's OWN auth token via X-Twilio-Signature; answers 503 while the
// voice SMS credential set is absent, and never touches the intake
// pipeline's number, credentials, or handlers.
//
// app.ts registers urlencoded parsing for exactly these paths (Twilio posts
// form-encoded; the signature covers the decoded parameters).

import { Router, type Request, type Response } from "express";
import {
  classifyInboundKeyword,
  isVoiceSmsEnabled,
  loadVoiceSmsConfig,
  verifyTwilioSignature,
  type VoiceSmsConfig,
} from "../lib/voiceSms/smsCore.js";
import { recordConsent, recordDeliveryStatus } from "../lib/voiceSms/outboxService.js";
import { normalizePhoneE164 } from "../lib/voiceContacts/contactLinker.js";

const router = Router();

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function paramsOf(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

function requireVerified(req: Request, res: Response): { config: VoiceSmsConfig; params: Record<string, string> } | undefined {
  let config: VoiceSmsConfig;
  try {
    config = loadVoiceSmsConfig();
  } catch {
    res.status(503).json({ error: "Unavailable" });
    return undefined;
  }
  const params = paramsOf(req);
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const signature = req.get("x-twilio-signature");
  if (!verifyTwilioSignature(config.authToken, url, params, signature ?? undefined)) {
    req.log.warn("[voice sms] signature verification failed");
    res.status(401).json({ error: "Unauthorized" });
    return undefined;
  }
  return { config, params };
}

// ── POST /api/voice/sms/inbound ──────────────────────────────────────────────

router.post("/voice/sms/inbound", async (req: Request, res: Response) => {
  const verified = requireVerified(req, res);
  if (!verified) return;
  const { params } = verified;

  const from = normalizePhoneE164(params["From"]);
  const firmIdRaw = Number(params["firmId"] ?? NaN); // never trusted — see below
  void firmIdRaw;

  // Tenant resolution: exactly one voice number exists per deployment stage
  // in the pilot architecture (VOICE_TWILIO_FROM_NUMBER), owned by exactly
  // one firm. Until the P6 number inventory maps To→firm, consent updates
  // apply to the firm that owns the configured number, provided by env.
  const ownerFirmId = Number(process.env["VOICE_SMS_OWNER_FIRM_ID"] ?? NaN);
  if (!from || !Number.isInteger(ownerFirmId)) {
    // Acknowledge so Twilio doesn't retry, but change nothing.
    res.type("text/xml").send(EMPTY_TWIML);
    return;
  }

  const keyword = classifyInboundKeyword(params["Body"]);
  if (keyword === "stop") {
    await recordConsent(ownerFirmId, from.e164, "stopped", "sms_stop");
    req.log.info({ firmId: ownerFirmId }, "[voice sms] STOP recorded");
  } else if (keyword === "start" && isVoiceSmsEnabled()) {
    await recordConsent(ownerFirmId, from.e164, "granted", "sms_start");
    req.log.info({ firmId: ownerFirmId }, "[voice sms] START recorded");
  }
  // Everything else: no auto-conversation on the voice number in this phase.
  res.type("text/xml").send(EMPTY_TWIML);
});

// ── POST /api/voice/sms/status ───────────────────────────────────────────────

router.post("/voice/sms/status", async (req: Request, res: Response) => {
  const verified = requireVerified(req, res);
  if (!verified) return;
  const { params } = verified;
  const sid = params["MessageSid"];
  const status = params["MessageStatus"];
  if (typeof sid === "string" && sid.length > 0 && typeof status === "string" && status.length > 0) {
    await recordDeliveryStatus(sid, status);
  }
  res.status(204).end();
});

export default router;
