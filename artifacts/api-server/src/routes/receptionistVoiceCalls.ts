// Milestone 2 foundation: authenticated, firm-scoped read access to real
// (Vapi + Twilio) call records, plus an honest provider-readiness status
// endpoint. Every route requires a valid receptionist session; firmId comes
// only from req.firmId, never from a request parameter — cross-firm access
// is structurally impossible since realCallsRepository queries always
// filter by that firmId.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { listRealCallsForFirm, getRealCallForFirm } from "../lib/voice/webhooks/realCallsRepository.js";
import { callStateLabel } from "../lib/voice/webhooks/callStateModel.js";
import type { RealCallRecord } from "../lib/voice/webhooks/callStateModel.js";

const router = Router();

function serializeSummary(call: RealCallRecord) {
  return {
    callId: call.callId,
    source: call.source,
    /** 'telephone' | 'browser' | 'unknown' — from the provider's call type first. */
    channel: call.channel,
    /** A SiteMint QA event, never a real call. */
    synthetic: call.synthetic,
    state: call.state,
    stateLabel: callStateLabel(call.state),
    isFinal: call.isFinal,
    callerNumberDisplay: call.callerNumberKnown ? call.callerNumberDisplay : null,
    startedAt: call.firstEventAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    // The provider's own measurement only. The receipt-time estimate measures
    // how far apart our webhooks arrived — 0 whenever a single event came in —
    // so it is not shown as a duration. Null reads as "not available".
    durationSec: call.providerDurationSec ?? null,
    // Only the word, on the list. The evidence behind it belongs on the
    // detail, where there is room to say why.
    transferState: call.transfer.state,
  };
}

function serializeDetail(call: RealCallRecord) {
  // "invalid" is a diagnostics-only distinction — every reader-facing
  // surface (this API included) treats it exactly like "unavailable".
  const analysisAvailability = call.analysisAvailability === "invalid" ? "unavailable" : call.analysisAvailability;
  return {
    ...serializeSummary(call),
    assistantId: call.assistantId ?? null,
    endedReason: call.endedReason ?? null,
    transcript: call.transcript ?? null,
    summary: call.summary ?? null,
    analysisAvailability,
    structuredOutcome: analysisAvailability === "available" ? call.structuredOutcome ?? null : null,
    transfer: call.transfer,
  };
}

// ── GET /api/receptionist/voice/calls ─────────────────────────────────────────

router.get("/receptionist/voice/calls", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const calls = await listRealCallsForFirm(req.firmId!);
    res.json({ items: calls.map(serializeSummary), count: calls.length });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to list real voice calls");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/voice/calls/:callId ─────────────────────────────────

router.get("/receptionist/voice/calls/:callId", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const call = await getRealCallForFirm(req.firmId!, req.params.callId as string);
    if (!call) {
      res.status(404).json({ error: "Call not found" });
      return;
    }
    res.json({ call: serializeDetail(call) });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to load real voice call");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/receptionist/voice/provider-status ───────────────────────────────
//
// Reports only whether each Development env var is PRESENT — never a value,
// length, prefix, or suffix. This backs the dashboard's honest
// "configured / not configured" readiness states (never "Live"/"Connected"
// unless a real call has actually been verified).

router.get("/receptionist/voice/provider-status", requireReceptionistAuth, (_req: Request, res: Response) => {
  res.json({
    vapiApiKeyConfigured: Boolean(process.env["VAPI_API_KEY"]),
    vapiWebhookSecretConfigured: Boolean(process.env["VAPI_WEBHOOK_SECRET"]),
    vapiPublicKeyConfigured: Boolean(process.env["VITE_VAPI_PUBLIC_KEY"]),
    // No application code today can tell whether a Development phone number
    // has actually been imported into Vapi (that requires a Vapi API call
    // this checkpoint does not make automatically) — this is always false
    // until that is verified read-only against the provider and recorded
    // deliberately, never inferred.
    developmentPhoneNumberVerified: false,
  });
});

export default router;
