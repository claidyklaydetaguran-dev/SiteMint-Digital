import { describe, expect, it } from "vitest";
import { buildVapiEventKey } from "./eventKey.js";
import type { ParsedVapiMessage } from "./vapiServerMessage.js";

function msg(partial: Partial<ParsedVapiMessage> & Pick<ParsedVapiMessage, "type">): ParsedVapiMessage {
  return { call: { id: "call_1" }, ...partial };
}

describe("buildVapiEventKey", () => {
  it("produces the same key for two identical deliveries of the same status-update (duplicate delivery)", () => {
    const a = buildVapiEventKey(msg({ type: "status-update", status: "ringing" }));
    const b = buildVapiEventKey(msg({ type: "status-update", status: "ringing" }));
    expect(a).toBe(b);
  });

  it("produces different keys for genuinely distinct status-update events on the same call", () => {
    const queued = buildVapiEventKey(msg({ type: "status-update", status: "queued" }));
    const ringing = buildVapiEventKey(msg({ type: "status-update", status: "ringing" }));
    const inProgress = buildVapiEventKey(msg({ type: "status-update", status: "in-progress" }));
    expect(new Set([queued, ringing, inProgress]).size).toBe(3);
  });

  it("scopes keys by call id — the same status on a different call never collides", () => {
    const call1 = buildVapiEventKey({ call: { id: "call_1" }, type: "status-update", status: "ringing" });
    const call2 = buildVapiEventKey({ call: { id: "call_2" }, type: "status-update", status: "ringing" });
    expect(call1).not.toBe(call2);
  });

  it("collapses a byte-identical end-of-call-report redelivery to the same key", () => {
    const first = buildVapiEventKey(msg({ type: "end-of-call-report", transcript: "a" }));
    const second = buildVapiEventKey(msg({ type: "end-of-call-report", transcript: "a" }));
    expect(first).toBe(second);
  });

  it("gives a content-different end-of-call-report redelivery its own key — analysis arrives on a later delivery and must not be dropped", () => {
    const withoutAnalysis = buildVapiEventKey(msg({ type: "end-of-call-report", transcript: "a" }));
    const withAnalysis = buildVapiEventKey(
      msg({ type: "end-of-call-report", transcript: "a", analysis: { structuredData: { caller: { name: "Jordan" } } } }),
    );
    expect(withoutAnalysis).not.toBe(withAnalysis);
  });

  it("gives hang its own stable key", () => {
    expect(buildVapiEventKey(msg({ type: "hang" }))).toBe("call_1:hang");
  });
});
