import { describe, expect, it } from "vitest";
import {
  mapVapiStatusToInternalState,
  maskCallerNumber,
  foldEventsIntoCallRecord,
  type StoredVapiEvent,
} from "./callStateModel.js";
import type { ParsedVapiMessage } from "./vapiServerMessage.js";

function event(at: number, message: Partial<ParsedVapiMessage> & Pick<ParsedVapiMessage, "type">): StoredVapiEvent {
  return { type: message.type, message: { call: { id: "call_1" }, ...message }, createdAt: new Date(at) };
}

describe("mapVapiStatusToInternalState", () => {
  it("maps queued, ringing, forwarding, in-progress directly", () => {
    expect(mapVapiStatusToInternalState("queued", undefined)).toBe("queued");
    expect(mapVapiStatusToInternalState("ringing", undefined)).toBe("ringing");
    expect(mapVapiStatusToInternalState("forwarding", undefined)).toBe("connecting");
    expect(mapVapiStatusToInternalState("in-progress", undefined)).toBe("in_progress");
  });

  it("never labels an ended call 'completed' by default reasoning alone — it reads endedReason", () => {
    expect(mapVapiStatusToInternalState("ended", "customer-ended-call")).toBe("completed");
    expect(mapVapiStatusToInternalState("ended", "assistant-said-goodbye")).toBe("completed");
    expect(mapVapiStatusToInternalState("ended", "no-answer")).toBe("no_answer");
    expect(mapVapiStatusToInternalState("ended", "busy")).toBe("busy");
    expect(mapVapiStatusToInternalState("ended", "twilio-failed-to-connect-call")).toBe("provider_error");
    expect(mapVapiStatusToInternalState("ended", "cancelled")).toBe("canceled");
  });

  it("falls back to completed for an ended call with no reason at all, never throwing", () => {
    expect(mapVapiStatusToInternalState("ended", undefined)).toBe("completed");
  });

  it("defaults unknown/undefined status to queued rather than fabricating a stronger claim", () => {
    expect(mapVapiStatusToInternalState(undefined, undefined)).toBe("queued");
  });
});

describe("maskCallerNumber", () => {
  it("shows only the last 4 digits", () => {
    expect(maskCallerNumber("+15550102231")).toBe("•••• 2231");
  });
  it("returns Unknown for missing or too-short input", () => {
    expect(maskCallerNumber(undefined)).toBe("Unknown");
    expect(maskCallerNumber("12")).toBe("Unknown");
  });
});

describe("foldEventsIntoCallRecord", () => {
  it("returns null for an empty event list", () => {
    expect(foldEventsIntoCallRecord("call_1", [])).toBeNull();
  });

  it("folds a normal call started -> in-progress -> ended lifecycle", () => {
    const events = [
      event(1000, { type: "status-update", status: "queued", call: { id: "call_1", assistantId: "asst_1" } }),
      event(2000, { type: "status-update", status: "ringing" }),
      event(3000, { type: "status-update", status: "in-progress" }),
      event(9000, { type: "status-update", status: "ended", endedReason: "customer-ended-call" }),
      event(9500, {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        transcript: "full transcript",
        summary: "call summary",
      }),
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.state).toBe("completed");
    expect(record.isFinal).toBe(true);
    expect(record.source).toBe("vapi_twilio");
    expect(record.assistantId).toBe("asst_1");
    expect(record.transcript).toBe("full transcript");
    expect(record.summary).toBe("call summary");
    expect(record.durationSec).toBe(8); // 1000ms -> 9000ms (first terminal event)
  });

  it("marks a failed call honestly rather than as completed", () => {
    const events = [
      event(1000, { type: "status-update", status: "queued", call: { id: "call_1", assistantId: "asst_1" } }),
      event(2000, { type: "status-update", status: "ended", endedReason: "pipeline-error-openai-llm-failed" }),
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.state).toBe("provider_error");
    expect(record.isFinal).toBe(true);
  });

  it("does not let an out-of-order, stale non-terminal status-update regress a terminal call", () => {
    const events = [
      event(1000, { type: "status-update", status: "in-progress", call: { id: "call_1", assistantId: "asst_1" } }),
      event(3000, { type: "status-update", status: "ended", endedReason: "customer-ended-call" }),
      // Arrives after the ended event (e.g. redelivered/delayed in transit) —
      // must never flip a completed call back to "ringing".
      event(3500, { type: "status-update", status: "ringing" }),
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.state).toBe("completed");
    expect(record.isFinal).toBe(true);
  });

  it("still merges a transcript/analysis that arrives in a later event after the call ended", () => {
    const events = [
      event(1000, { type: "status-update", status: "ended", endedReason: "customer-ended-call", call: { id: "call_1", assistantId: "asst_1" } }),
      event(2000, { type: "end-of-call-report", transcript: "late transcript", analysis: { callerName: "Jordan" } }),
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.transcript).toBe("late transcript");
    expect(record.analysis).toEqual({ callerName: "Jordan" });
  });

  it("never overwrites an already-populated transcript with a later empty one", () => {
    const events = [
      event(1000, { type: "end-of-call-report", transcript: "first transcript", call: { id: "call_1", assistantId: "asst_1" } }),
      event(2000, { type: "end-of-call-report" }), // duplicate/late delivery with no transcript field
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.transcript).toBe("first transcript");
  });

  it("treats an unexpected hang with no prior terminal state as a provider error, never as completed", () => {
    const events = [
      event(1000, { type: "status-update", status: "in-progress", call: { id: "call_1", assistantId: "asst_1" } }),
      event(2000, { type: "hang" }),
    ];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.state).toBe("provider_error");
    expect(record.isFinal).toBe(true);
  });

  it("always reports source vapi_twilio — a real-call record can never read as Demo Mode", () => {
    const events = [event(1000, { type: "status-update", status: "queued", call: { id: "call_1", assistantId: "asst_1" } })];
    const record = foldEventsIntoCallRecord("call_1", events)!;
    expect(record.source).toBe("vapi_twilio");
  });
});
