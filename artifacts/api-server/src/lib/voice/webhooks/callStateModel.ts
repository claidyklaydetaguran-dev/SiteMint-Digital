// Milestone 2 foundation: normalizes raw Vapi server messages (as stored,
// one row per event, in provider_webhook_events) into a single honest call
// record. This is a pure, DB-free fold — the caller supplies the events for
// one call id already loaded from storage.

import type { ParsedVapiMessage, VapiCallStatus } from "./vapiServerMessage.js";

export const INTERNAL_CALL_STATES = [
  "queued",
  "ringing",
  "connecting",
  "in_progress",
  "completed",
  "failed",
  "no_answer",
  "busy",
  "canceled",
  "provider_error",
] as const;

export type InternalCallState = (typeof INTERNAL_CALL_STATES)[number];

const TERMINAL_STATES: ReadonlySet<InternalCallState> = new Set([
  "completed",
  "failed",
  "no_answer",
  "busy",
  "canceled",
  "provider_error",
]);

/**
 * Maps Vapi's in-call status to an internal state. "ended" alone is
 * ambiguous — Vapi's `endedReason` (present on the end-of-call-report /
 * final status-update) is what actually distinguishes a normal hangup from
 * no-answer, busy, or a provider-side failure, so this never labels a call
 * "completed" from a bare `status: "ended"` with no reason attached.
 */
export function mapVapiStatusToInternalState(
  status: VapiCallStatus | undefined,
  endedReason: string | undefined,
): InternalCallState {
  switch (status) {
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "forwarding":
      return "connecting";
    case "in-progress":
      return "in_progress";
    case "ended": {
      const reason = (endedReason ?? "").toLowerCase();
      if (!reason) return "completed";
      if (reason.includes("no-answer") || reason.includes("no_answer")) return "no_answer";
      if (reason.includes("busy")) return "busy";
      if (reason.includes("canceled") || reason.includes("cancelled")) return "canceled";
      if (reason.includes("error") || reason.includes("failed") || reason.includes("pipeline")) {
        return "provider_error";
      }
      // customer-ended-call, assistant-ended-call, assistant-said-goodbye,
      // silence-timed-out, etc. — a normal, non-error completion.
      return "completed";
    }
    default:
      return "queued";
  }
}

export function callStateLabel(state: InternalCallState): string {
  switch (state) {
    case "queued": return "Queued";
    case "ringing": return "Ringing";
    case "connecting": return "Connecting";
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "no_answer": return "No answer";
    case "busy": return "Busy";
    case "canceled": return "Canceled";
    case "provider_error": return "Provider error";
  }
}

/** Never displays more than the last 4 digits of a caller-supplied number. */
export function maskCallerNumber(number: string | undefined): string {
  if (!number) return "Unknown";
  const digits = number.replace(/\D/g, "");
  if (digits.length < 4) return "Unknown";
  return `•••• ${digits.slice(-4)}`;
}

export interface StoredVapiEvent {
  type: ParsedVapiMessage["type"];
  message: ParsedVapiMessage;
  /** provider_webhook_events.created_at — the order events were received in. */
  createdAt: Date;
}

export interface RealCallRecord {
  callId: string;
  assistantId: string | undefined;
  provider: "vapi";
  /** Always "vapi_twilio" — a real-call record can never claim Demo Mode or vice versa. */
  source: "vapi_twilio";
  state: InternalCallState;
  /** True once any terminal state has been observed for this call. */
  isFinal: boolean;
  callerNumberDisplay: string;
  firstEventAt: Date;
  lastEventAt: Date;
  endedAt: Date | undefined;
  durationSec: number | undefined;
  endedReason: string | undefined;
  transcript: string | undefined;
  summary: string | undefined;
  analysis: unknown;
}

/**
 * Folds every stored event for one call id into a single record. Processes
 * events in the order they were received (createdAt) but never lets an
 * out-of-order, non-terminal status-update regress a call that has already
 * reached a terminal state — the terminal state and its endedReason /
 * transcript / summary are sticky once observed, while later-arriving
 * additive fields (a transcript or analysis that lands after the ended
 * event) still get merged in rather than discarded.
 */
export function foldEventsIntoCallRecord(
  callId: string,
  events: readonly StoredVapiEvent[],
): RealCallRecord | null {
  if (events.length === 0) return null;

  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let assistantId: string | undefined;
  let callerNumberDisplay = "Unknown";
  let state: InternalCallState = "queued";
  let isFinal = false;
  let endedReason: string | undefined;
  let transcript: string | undefined;
  let summary: string | undefined;
  let analysis: unknown;
  let endedAt: Date | undefined;

  const firstEventAt = ordered[0]!.createdAt;
  let lastEventAt = firstEventAt;

  for (const event of ordered) {
    const { message } = event;
    if (message.call.assistantId) assistantId = message.call.assistantId;
    if (message.call.customerNumber) callerNumberDisplay = maskCallerNumber(message.call.customerNumber);
    lastEventAt = event.createdAt;

    if (message.type === "status-update" && message.status) {
      const next = mapVapiStatusToInternalState(message.status, message.endedReason);
      if (!isFinal) {
        state = next;
        if (TERMINAL_STATES.has(next)) {
          isFinal = true;
          endedAt = event.createdAt;
          if (message.endedReason) endedReason = message.endedReason;
        }
      }
      // Once final, further status-update events are ignored for `state`
      // itself (Vapi does not un-end a call), but assistantId/caller number
      // above are still refreshed defensively.
    }

    if (message.type === "end-of-call-report") {
      // The authoritative terminal record. Always wins over a prior
      // provisional status-update guess, including endedReason.
      isFinal = true;
      endedAt = endedAt ?? event.createdAt;
      if (message.endedReason) endedReason = message.endedReason;
      state = mapVapiStatusToInternalState("ended", message.endedReason);
      if (message.transcript) transcript = message.transcript;
      if (message.summary) summary = message.summary;
      if (message.analysis !== undefined) analysis = message.analysis;
    }

    if (message.type === "hang" && !isFinal) {
      isFinal = true;
      state = "provider_error";
      endedAt = event.createdAt;
    }

    // A transcript/summary/analysis can also ride in on a plain
    // status-update in some Vapi configurations — never overwrite an
    // already-populated value with an empty one from an earlier event.
    if (message.transcript && !transcript) transcript = message.transcript;
    if (message.summary && !summary) summary = message.summary;
    if (message.analysis !== undefined && analysis === undefined) analysis = message.analysis;
  }

  const durationSec = endedAt
    ? Math.max(0, Math.round((endedAt.getTime() - firstEventAt.getTime()) / 1000))
    : undefined;

  return {
    callId,
    assistantId,
    provider: "vapi",
    source: "vapi_twilio",
    state,
    isFinal,
    callerNumberDisplay,
    firstEventAt,
    lastEventAt,
    endedAt,
    durationSec,
    endedReason,
    transcript,
    summary,
    analysis,
  };
}
