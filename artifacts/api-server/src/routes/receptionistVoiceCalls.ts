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

// ── artifact policy, as a non-secret read ─────────────────────────────────────
//
// VOICE_ARTIFACT_POLICY is owned by the server and is never accepted in a
// request body, never read from a persisted assistant config, and never
// defaulted (the publish path in lib/voice/providers/vapi/artifactPolicy.ts is
// the authority and fails closed). What this route adds is only the ability to
// REPORT the resolved policy name, so the dashboard's retention copy can match
// what is actually configured instead of asserting it.
//
// The name is not a secret and no value, length or prefix of any credential is
// involved. An unset or misspelled policy reports "unknown" rather than
// throwing or defaulting to a permissive answer.
const ARTIFACT_POLICIES = ["none", "transcript_only", "full"] as const;

export type ArtifactPolicyReport = (typeof ARTIFACT_POLICIES)[number] | "unknown";

function readArtifactPolicy(): ArtifactPolicyReport {
  const raw = (process.env["VOICE_ARTIFACT_POLICY"] ?? "").trim();
  return (ARTIFACT_POLICIES as readonly string[]).includes(raw) ? (raw as ArtifactPolicyReport) : "unknown";
}

/**
 * Only `transcript_only` and `full` retain a transcript. An unset or invalid
 * policy is treated as "not retained" — the safe direction: it can only ever
 * withhold content, never surface it.
 */
function transcriptRetained(): boolean {
  const policy = readArtifactPolicy();
  return policy === "transcript_only" || policy === "full";
}

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
    // Under the approved `none` policy nothing retains a transcript, so this
    // API must not hand one to the dashboard even if some older row still
    // carries one. The page's retention wording is driven by the same policy
    // (reported on provider-status), so copy and content cannot disagree.
    transcript: transcriptRetained() ? call.transcript ?? null : null,
    summary: call.summary ?? null,
    analysisAvailability,
    structuredOutcome: analysisAvailability === "available" ? call.structuredOutcome ?? null : null,
    transfer: call.transfer,
    // The resolved retention policy travels WITH the record the dashboard
    // already reads, so the page can state what is kept instead of asserting
    // it — and without the call pages taking on a second request. Never a
    // credential: this is the policy's name and nothing else.
    artifactPolicy: readArtifactPolicy(),
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
    // The resolved artifact policy name (never a credential). "none" is the
    // only policy approved for AR-001; the dashboard renders its retention
    // sentence from this rather than asserting a retention claim of its own.
    artifactPolicy: readArtifactPolicy(),
  });
});

export default router;
