// J5: a transfer SiteMint declined is reported as "not put through, message
// offered" — never "outcome unknown" — and a resolved transfer is warm, so a
// busy or unanswered contact brings the assistant back to the caller.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { deriveVapiTransferOutcome } from "./transferOutcome.js";
import { buildVapiTransferDestination } from "./transferDestination.js";

const request = (resolution?: string) => ({ type: "transfer-destination-request" as const, siteMintTransferResolution: resolution });
const endOfCall = (endedReason: string) => ({ type: "end-of-call-report" as const, endedReason });

describe("declined transfers", () => {
  for (const reason of ["no_destinations", "no_consent", "after_hours", "not_enabled", "error"]) {
    it(`declined:${reason} reads as declined with its own reason, even after the call ends`, () => {
      const out = deriveVapiTransferOutcome({ requestedByUs: true, events: [request(`declined:${reason}`), endOfCall("customer-ended-call")] });
      expect(out.state).toBe("declined");
      expect(out.evidence).toMatch(/offered to take a message/);
    });
  }

  it("an unrecognised decline still reads as declined, with the generic reason", () => {
    expect(deriveVapiTransferOutcome({ events: [request("declined:something_new")] }).state).toBe("declined");
  });

  it("is order-independent", () => {
    const a = deriveVapiTransferOutcome({ events: [endOfCall("customer-ended-call"), request("declined:after_hours")] });
    const b = deriveVapiTransferOutcome({ events: [request("declined:after_hours"), endOfCall("customer-ended-call")] });
    expect(a).toEqual(b);
  });

  it("a resolved request keeps the existing requested/unknown behaviour", () => {
    expect(deriveVapiTransferOutcome({ events: [request("resolved"), endOfCall("customer-ended-call")] }).state).toBe("unknown");
    expect(deriveVapiTransferOutcome({ events: [request(undefined)] }).state).toBe("requested");
  });
});

describe("warm transfer destination", () => {
  const d = buildVapiTransferDestination({ destinationE164: "+15550001111", label: "Claidy" });

  it("holds the caller and keeps the assistant on the line if nobody answers", () => {
    expect(d.type).toBe("number");
    expect(d.number).toBe("+15550001111");
    expect(d.transferPlan.mode).toBe("warm-transfer-experimental");
    expect(d.transferPlan.fallbackPlan.endCallEnabled).toBe(false);
    expect(d.transferPlan.fallbackPlan.message).toMatch(/take a detailed message/);
  });

  it("never speaks the number, and falls back to a neutral label", () => {
    expect(JSON.stringify(d.message)).not.toContain("5550001111");
    expect(buildVapiTransferDestination({ destinationE164: "+15550001111", label: "   " }).message).toContain("the team");
  });

  it("the webhook uses it and records what it answered in every branch", () => {
    const route = readFileSync(new URL("../../../../routes/receptionistVoiceWebhook.ts", import.meta.url), "utf8");
    const block = route.slice(route.indexOf('message.type === "transfer-destination-request"'), route.indexOf("// P3: tool-calls"));
    expect(block).toContain("buildVapiTransferDestination(");
    for (const r of ['noteResolution("resolved")', 'noteResolution("declined:not_enabled")', "noteResolution(`declined:${resolution.reason}`)", 'noteResolution("declined:error")']) {
      expect(block).toContain(r);
    }
  });
});
