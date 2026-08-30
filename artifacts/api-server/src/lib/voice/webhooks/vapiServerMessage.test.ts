import { describe, expect, it } from "vitest";
import { parseVapiServerMessage } from "./vapiServerMessage.js";

describe("parseVapiServerMessage", () => {
  it("parses a minimal status-update message", () => {
    const result = parseVapiServerMessage({
      message: { type: "status-update", status: "ringing", call: { id: "call_123", assistantId: "asst_1" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe("status-update");
    expect(result.message.status).toBe("ringing");
    expect(result.message.call).toEqual({ id: "call_123", assistantId: "asst_1" });
  });

  it("parses an end-of-call-report with transcript, summary, and analysis", () => {
    const result = parseVapiServerMessage({
      message: {
        type: "end-of-call-report",
        endedReason: "customer-ended-call",
        transcript: "AI: Hello. Caller: Hi.",
        summary: "Caller asked about hours.",
        analysis: { structuredData: { callerName: "Jordan" } },
        call: { id: "call_456", assistantId: "asst_1" },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.transcript).toBe("AI: Hello. Caller: Hi.");
    expect(result.message.summary).toBe("Caller asked about hours.");
    expect(result.message.analysis).toEqual({ structuredData: { callerName: "Jordan" } });
    expect(result.message.endedReason).toBe("customer-ended-call");
  });

  it("extracts a nested customer.number field", () => {
    const result = parseVapiServerMessage({
      message: {
        type: "status-update",
        status: "in-progress",
        call: { id: "call_789", assistantId: "asst_1", customer: { number: "+15550102231" } },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.call.customerNumber).toBe("+15550102231");
  });

  it("rejects a body that isn't an object", () => {
    expect(parseVapiServerMessage("not an object")).toEqual({ ok: false, reason: "body_not_object" });
    expect(parseVapiServerMessage(null)).toEqual({ ok: false, reason: "body_not_object" });
    expect(parseVapiServerMessage([1, 2, 3])).toEqual({ ok: false, reason: "body_not_object" });
  });

  it("rejects a body missing the message envelope", () => {
    expect(parseVapiServerMessage({})).toEqual({ ok: false, reason: "missing_message" });
    expect(parseVapiServerMessage({ message: "not an object" })).toEqual({ ok: false, reason: "missing_message" });
  });

  it("rejects an unrecognized message type (never fabricates a provider event)", () => {
    const result = parseVapiServerMessage({ message: { type: "some-future-event", call: { id: "call_1" } } });
    expect(result).toEqual({ ok: false, reason: "unknown_message_type" });
  });

  it("rejects a message with no call id", () => {
    expect(parseVapiServerMessage({ message: { type: "status-update" } })).toEqual({
      ok: false,
      reason: "missing_call_id",
    });
    expect(parseVapiServerMessage({ message: { type: "status-update", call: {} } })).toEqual({
      ok: false,
      reason: "missing_call_id",
    });
  });

  it("does not require assistantId to be present (caller decides how to handle its absence)", () => {
    const result = parseVapiServerMessage({ message: { type: "hang", call: { id: "call_1" } } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.call.assistantId).toBeUndefined();
  });
});
