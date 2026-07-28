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
    state: call.state,
    stateLabel: callStateLabel(call.state),
    isFinal: call.isFinal,
    callerNumberDisplay: call.callerNumberDisplay,
    startedAt: call.firstEventAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSec: call.durationSec ?? null,
  };
}

function serializeDetail(call: RealCallRecord) {
  return {
    ...serializeSummary(call),
    assistantId: call.assistantId ?? null,
    endedReason: call.endedReason ?? null,
    transcript: call.transcript ?? null,
    summary: call.summary ?? null,
    analysis: call.analysis ?? null,
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
