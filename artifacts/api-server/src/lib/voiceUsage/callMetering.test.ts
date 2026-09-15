// What a finished call adds to usage. The two mistakes this prevents:
// dropping a genuine browser call (it spends real provider minutes) and
// counting a SiteMint QA event (nobody spent anything).

import { describe, expect, it } from "vitest";

import { meteringDecisionForReport } from "./callMetering.js";
import type { ParsedVapiMessage } from "../voice/webhooks/vapiServerMessage.js";

const RECEIVED = new Date("2026-10-01T00:00:30.000Z");

function report(overrides: Partial<ParsedVapiMessage> = {}, call: Partial<ParsedVapiMessage["call"]> = {}): ParsedVapiMessage {
  return {
    type: "end-of-call-report",
    call: { id: "4f7c1e0a-0000-4000-8000-000000000001", assistantId: "asst-1", ...call },
    ...overrides,
  };
}

describe("meteringDecisionForReport", () => {
  it("meters a browser test call, labelled as browser", () => {
    const d = meteringDecisionForReport(report({ durationSeconds: 95 }, { callType: "webCall" }), RECEIVED);
    expect(d).toMatchObject({ meter: true, durationSec: 95, channel: "browser" });
  });

  it("meters a telephone call whose caller withheld their number", () => {
    const d = meteringDecisionForReport(report({ durationSeconds: 40 }, { phoneNumberId: "pn-1" }), RECEIVED);
    expect(d).toMatchObject({ meter: true, channel: "telephone" });
  });

  it("falls back to the provider's own start and end times when no duration is given", () => {
    const d = meteringDecisionForReport(
      report({ startedAtIso: "2026-09-30T23:58:00.000Z", endedAtIso: "2026-09-30T23:59:30.000Z" }, { callType: "inboundPhoneCall" }),
      RECEIVED,
    );
    expect(d).toMatchObject({ meter: true, durationSec: 90, channel: "telephone" });
    // Billed in the month the call ended, not the month its report arrived.
    if (d.meter) expect(d.endedAt.toISOString()).toBe("2026-09-30T23:59:30.000Z");
  });

  it("does not invent a duration from receipt times", () => {
    expect(meteringDecisionForReport(report({}, { callType: "webCall" }), RECEIVED)).toEqual({ meter: false, reason: "no_provider_duration" });
  });

  it("leaves out only a SiteMint QA event", () => {
    expect(meteringDecisionForReport(report({ durationSeconds: 90 }, { id: "sitemint-qa-abc" }), RECEIVED)).toEqual({
      meter: false,
      reason: "synthetic_qa_event",
    });
  });
});
