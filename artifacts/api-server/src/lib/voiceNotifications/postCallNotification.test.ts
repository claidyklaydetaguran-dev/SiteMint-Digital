// V7 — the post-call email a BUSINESS receives.
//
// The properties under test are the ones that make it trustworthy rather than
// merely present: it states only persisted facts, it never reads as a completed
// errand when nothing was completed, a test call is unmistakably labelled, and
// it carries no transcript or recording however much the provider retained.
//
// Plus the delivery-state honesty: `accepted` means the provider accepted the
// message, and nothing anywhere claims inbox delivery.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  composePostCallEmail,
  type PostCallFacts,
  type PostCallMessageFacts,
} from "./postCallComposer.js";
import {
  callerAckDedupeKey,
  notificationBackoffMs,
  postCallDedupeKey,
  dashboardCallUrl,
} from "./notificationOutbox.js";
import { resolveVerifiedBusinessRecipient } from "./recipient.js";
import { createResendAlertTransport, type FetchLike } from "../voiceAlerts/alertTransport.js";

const STARTED = new Date("2026-09-12T14:05:00.000Z");

function facts(overrides: Partial<PostCallFacts> = {}): PostCallFacts {
  return {
    providerCallId: "call_abc_123",
    source: "telephone",
    startedAt: STARTED,
    endedAt: new Date("2026-09-12T14:07:30.000Z"),
    durationSec: 150,
    callerNumberDisplay: "+1 555 010 2030",
    endedReason: "customer-ended-call",
    ...overrides,
  };
}

function message(overrides: Partial<PostCallMessageFacts> = {}): PostCallMessageFacts {
  return {
    callerName: "Dana Rivera",
    topic: "Quote for kitchen rewire",
    details: "Wants a quote for rewiring a kitchen; available weekday mornings.",
    callbackPhone: "+1 555 010 2030",
    callbackEmail: null,
    urgency: "normal",
    emailAckRequested: false,
    ...overrides,
  };
}

const BASE = {
  businessName: "Northgate Electrical",
  dashboardUrl: "https://example.test/ai-receptionist/dashboard/calls/call_abc_123",
  timeZone: "America/New_York",
};

describe("post-call email composition", () => {
  it("reports the saved message and the follow-up the business still owes", () => {
    const { subject, body } = composePostCallEmail({ ...BASE, facts: facts(), messages: [message()] });

    expect(subject).toBe("New message from Dana Rivera: Quote for kitchen rewire");
    expect(body).toContain("Dana Rivera");
    expect(body).toContain("Quote for kitchen rewire");
    expect(body).toContain("rewiring a kitchen");
    expect(body).toContain("WHAT YOU NEED TO DO");
    expect(body).toContain("Follow up with this caller");
    // The one promise we are allowed to have made.
    expect(body).toContain("someone will follow up");
  });

  it("does not read like a completed errand when no message was taken", () => {
    const { subject, body } = composePostCallEmail({ ...BASE, facts: facts(), messages: [] });

    expect(subject).toBe("Call received — no message taken");
    expect(body).toContain("did not save a message");
    expect(body).toContain("Nothing is recorded as outstanding");
    // Nothing may imply the call was dealt with.
    expect(body).not.toMatch(/handled|taken care of|resolved|completed/i);
  });

  it("labels a browser test call unmistakably, at the top", () => {
    const { subject, body } = composePostCallEmail({
      ...BASE,
      facts: facts({ source: "browser_test", callerNumberDisplay: null }),
      messages: [message()],
    });

    expect(subject.startsWith("[Test]")).toBe(true);
    expect(body.split("\n").slice(0, 3).join(" ")).toContain("BROWSER TEST CALL");
    expect(body).toContain("not a customer");
  });

  it("marks urgency only when the caller stated it", () => {
    expect(
      composePostCallEmail({ ...BASE, facts: facts(), messages: [message({ urgency: "urgent" })] }).subject,
    ).toContain("[Urgent]");
    expect(
      composePostCallEmail({ ...BASE, facts: facts(), messages: [message()] }).subject,
    ).not.toContain("[Urgent]");
  });

  it("reports the provider's ended reason verbatim rather than rewording it", () => {
    const body = composePostCallEmail({
      ...BASE,
      facts: facts({ endedReason: "call.in-progress.error-assistant-did-not-receive-customer-audio" }),
      messages: [],
    }).body;
    expect(body).toContain("call.in-progress.error-assistant-did-not-receive-customer-audio");
  });

  it("says what it does not know instead of inventing it", () => {
    const body = composePostCallEmail({
      ...BASE,
      facts: facts({ durationSec: null, callerNumberDisplay: null, endedReason: null }),
      messages: [message({ callbackPhone: null, callbackEmail: null })],
    }).body;

    expect(body).toContain("Duration:  not recorded");
    expect(body).toContain("Caller:    not available");
    expect(body).toContain("Ended:     not reported");
    expect(body).toContain("no number given");
    expect(body).toContain("no email given");
  });

  it("carries no transcript and no recording, and says so", () => {
    const body = composePostCallEmail({ ...BASE, facts: facts(), messages: [message()] }).body;
    expect(body).toContain("no call recording and no transcript");
    expect(body).not.toMatch(/https?:\/\/\S*recording/i);
  });

  it("tells the business the dashboard link still requires signing in", () => {
    const body = composePostCallEmail({ ...BASE, facts: facts(), messages: [message()] }).body;
    expect(body).toContain(BASE.dashboardUrl);
    expect(body).toContain("grants no access on its own");
  });

  it("reports every message when a call produced more than one", () => {
    const { subject, body } = composePostCallEmail({
      ...BASE,
      facts: facts(),
      messages: [message(), message({ callerName: "Sam Lee", topic: "Reschedule" })],
    });
    expect(subject).toContain("Dana Rivera");
    expect(body).toContain("MESSAGE 1 OF 2");
    expect(body).toContain("MESSAGE 2 OF 2");
    expect(body).toContain("Sam Lee");
    expect(body).toContain("Follow up on 2 saved messages");
  });

  it("mentions an email copy only when the caller asked for one", () => {
    const asked = composePostCallEmail({
      ...BASE,
      facts: facts(),
      messages: [message({ callbackEmail: "dana@example.test", emailAckRequested: true })],
    }).body;
    const notAsked = composePostCallEmail({
      ...BASE,
      facts: facts(),
      messages: [message({ callbackEmail: "dana@example.test", emailAckRequested: false })],
    }).body;

    expect(asked).toContain("asked us to email them a copy");
    // An address on file is not a request to be emailed.
    expect(notAsked).not.toContain("asked us to email them a copy");
  });
});

describe("notification identity and retry shape", () => {
  it("derives one dedupe key per call, so a redelivered event cannot duplicate an email", () => {
    expect(postCallDedupeKey("call_abc_123")).toBe("post_call:call_abc_123");
    expect(postCallDedupeKey("call_abc_123")).toBe(postCallDedupeKey("call_abc_123"));
    expect(postCallDedupeKey("call_zzz_999")).not.toBe(postCallDedupeKey("call_abc_123"));
    expect(callerAckDedupeKey(12)).not.toBe(postCallDedupeKey("12"));
  });

  it("backs off increasingly, and stops growing at a bounded ceiling", () => {
    const delays = [1, 2, 3, 4, 5, 6, 10].map(notificationBackoffMs);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
    expect(delays[0]).toBe(30_000);
    expect(delays.at(-1)).toBeLessThanOrEqual(30 * 60_000);
  });

  it("builds a dashboard link from configuration, and a relative one without it", () => {
    expect(dashboardCallUrl("call_abc_123", { VOICE_DASHBOARD_BASE_URL: "https://x.test/" })).toBe(
      "https://x.test/ai-receptionist/dashboard/calls/call_abc_123",
    );
    expect(dashboardCallUrl("call_abc_123", {})).toBe("/ai-receptionist/dashboard/calls/call_abc_123");
  });
});

describe("recipient resolution", () => {
  const deps = (email: string | null, verified: boolean) => ({
    loadFirmRecipient: async () => ({ email, verified }),
  });

  it("returns the business's own verified address", async () => {
    expect(await resolveVerifiedBusinessRecipient(7, deps("Owner@Example.TEST", true))).toEqual({
      ok: true,
      email: "owner@example.test",
    });
  });

  it("refuses an unverified address rather than emailing caller details to it", async () => {
    expect(await resolveVerifiedBusinessRecipient(7, deps("owner@example.test", false))).toEqual({
      ok: false,
      reason: "email_not_verified",
    });
  });

  it("refuses a missing or malformed address, and never substitutes a fallback", async () => {
    expect(await resolveVerifiedBusinessRecipient(7, deps(null, true))).toEqual({
      ok: false,
      reason: "no_account_email",
    });
    expect(await resolveVerifiedBusinessRecipient(7, deps("not-an-address", true))).toEqual({
      ok: false,
      reason: "no_account_email",
    });
    // Specifically: no operator inbox, no notify_email, nothing shared.
    const resolution = await resolveVerifiedBusinessRecipient(7, {
      loadFirmRecipient: async () => undefined,
    });
    expect(resolution.ok).toBe(false);
  });
});

describe("delivery result honesty", () => {
  const config = { apiKey: "key_test_value", from: "a@example.test", to: "ops@example.test" };

  it("reports the provider's receipt when it returns one", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "resend_msg_1" }),
    });
    const result = await createResendAlertTransport(config, fetchImpl).send({ subject: "s", text: "t" });
    expect(result).toEqual({ ok: true, providerMessageId: "resend_msg_1" });
  });

  it("still counts as accepted when no receipt comes back — a retry would duplicate the email", async () => {
    for (const json of [
      undefined,
      async () => ({}),
      async () => {
        throw new Error("unparseable");
      },
    ]) {
      const fetchImpl: FetchLike = async () => ({ ok: true, status: 200, json: json as never });
      const result = await createResendAlertTransport(config, fetchImpl).send({ subject: "s", text: "t" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.providerMessageId).toBeUndefined();
    }
  });

  it("reports a failure as our own short code, never the provider's body", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: "domain not verified", name: "validation_error" }),
    });
    const result = await createResendAlertTransport(config, fetchImpl).send({ subject: "s", text: "t" });
    expect(result).toEqual({ ok: false, reason: "provider_status_422" });
    if (!result.ok) {
      expect(result.reason).not.toContain("domain");
      expect(result.reason).not.toContain(config.apiKey);
    }
  });

  it("sends to the business's address, not the operator inbox, when one is given", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => ({ id: "x" }) };
    };
    await createResendAlertTransport(config, fetchImpl).send({
      to: "business@example.test",
      subject: "s",
      text: "t",
    });
    expect(seen[0]!.to).toEqual(["business@example.test"]);
    expect(seen[0]!.to).not.toEqual([config.to]);
  });
});
