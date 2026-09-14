// What we are allowed to say happened to a transfer.
//
// Every fixture here is built from Vapi's DOCUMENTED server-event fields and
// endedReason vocabulary. Nothing invents a status field: the docs give
// `transfer-update` a `destination` and nothing more, which is exactly why
// "the provider acknowledged it" is the ceiling of what that message proves.

import { describe, expect, it } from "vitest";

import { deriveVapiTransferOutcome, maskDestination } from "./transferOutcome.js";
import type { ParsedVapiMessage } from "../../webhooks/vapiServerMessage.js";

type Event = Pick<ParsedVapiMessage, "type" | "status" | "endedReason" | "transferDestination">;

const DEST = { type: "number", number: "+15550102030" };

const requestEvent: Event = { type: "transfer-destination-request", transferDestination: DEST };
const updateEvent: Event = { type: "transfer-update", transferDestination: DEST };
const forwarding: Event = { type: "status-update", status: "forwarding" };
const ended = (endedReason: string): Event => ({ type: "end-of-call-report", endedReason });

const derive = (events: Event[], requestedByUs = true) =>
  deriveVapiTransferOutcome({ requestedByUs, events });

describe("what an acknowledgement is allowed to mean", () => {
  it("treats transfer-update as acknowledged, never as connected", () => {
    // The single most important assertion in this file.
    const out = derive([requestEvent, updateEvent]);
    expect(out.state).toBe("accepted");
    expect(out.state).not.toBe("connected");
    expect(out.evidence).toMatch(/acknowledged/i);
  });

  it("treats a forwarding status the same way — acted on, not answered", () => {
    expect(derive([requestEvent, forwarding]).state).toBe("accepted");
  });

  it("never reports connected, and says why that is not a fault", () => {
    const out = derive([requestEvent, updateEvent, ended("assistant-forwarded-call")]);
    expect(out.state).not.toBe("connected");
    // A blind transfer ends the assistant's view of the call, so nothing
    // downstream is observable. Surfaces are expected to explain that.
    expect(out.connectionKnowable).toBe(false);
  });
});

describe("failures the provider actually names", () => {
  it("reports a failure for each documented failure reason", () => {
    const reasons = [
      "call.forwarding.operator-busy",
      "call.in-progress.error-transfer-failed",
      "customer-ended-call-during-transfer",
      "customer-ended-call-before-warm-transfer",
      "customer-ended-call-after-warm-transfer-attempt",
      "call.in-progress.error-warm-transfer-max-duration",
    ];
    for (const reason of reasons) {
      const out = derive([requestEvent, updateEvent, ended(reason)]);
      expect(out.state, reason).toBe("failed");
      expect(out.evidence, reason).toBeTruthy();
    }
  });

  it("explains a busy person in words a business would use", () => {
    expect(derive([requestEvent, ended("call.forwarding.operator-busy")]).evidence).toMatch(/busy/i);
  });

  it("lets a failure override an earlier acknowledgement", () => {
    const out = derive([requestEvent, updateEvent, ended("call.in-progress.error-transfer-failed")]);
    expect(out.state).toBe("failed");
  });
});

describe("when nothing conclusive arrives", () => {
  it("says unknown when the assistant handed over and nothing followed", () => {
    const out = derive([requestEvent, updateEvent, ended("assistant-forwarded-call")]);
    expect(out.state).toBe("unknown");
    expect(out.evidence).toMatch(/handed the call over/i);
  });

  it("says unknown when we asked and the call ended silently about it", () => {
    const out = derive([requestEvent, ended("customer-ended-call")]);
    expect(out.state).toBe("unknown");
    expect(out.evidence).toMatch(/without the provider reporting/i);
  });

  it("stays at requested while the call is still going", () => {
    expect(derive([requestEvent]).state).toBe("requested");
  });

  it("reports no transfer at all when none was involved", () => {
    const out = derive([ended("customer-ended-call")], false);
    expect(out.state).toBe("none");
  });
});

describe("redelivery and arrival order", () => {
  it("reaches the same answer whichever order the events arrive in", () => {
    const events = [requestEvent, updateEvent, ended("call.forwarding.operator-busy")];
    const forwards = derive(events).state;
    const backwards = derive([...events].reverse()).state;
    expect(forwards).toBe("failed");
    expect(backwards).toBe("failed");
  });

  it("is unchanged by a duplicate delivery", () => {
    const once = derive([requestEvent, updateEvent]);
    const twice = derive([requestEvent, updateEvent, updateEvent, requestEvent]);
    expect(twice).toEqual(once);
  });

  it("cannot be downgraded by a late weaker event", () => {
    // A redelivered acknowledgement arriving after the failure must not undo it.
    const out = derive([requestEvent, ended("call.forwarding.operator-busy"), updateEvent]);
    expect(out.state).toBe("failed");
  });
});

describe("what a business is shown", () => {
  it("masks the destination to its last two digits", () => {
    expect(maskDestination(DEST)).toBe("••••30");
    expect(derive([requestEvent, updateEvent]).destinationMasked).toBe("••••30");
  });

  it("names a SIP or assistant destination without inventing digits", () => {
    expect(maskDestination({ type: "sip", sipUri: "sip:x@y" })).toBe("a SIP destination");
    expect(maskDestination({ type: "assistant" })).toBe("another assistant");
  });

  it("reports no destination when the provider named none", () => {
    expect(maskDestination(undefined)).toBeNull();
    expect(derive([{ type: "transfer-update" }]).destinationMasked).toBeNull();
  });
});
