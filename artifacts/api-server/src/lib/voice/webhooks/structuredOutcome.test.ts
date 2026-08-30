import { describe, expect, it } from "vitest";
import { parseStructuredOutcome } from "./structuredOutcome.js";

describe("parseStructuredOutcome", () => {
  it("is unavailable when analysis is missing entirely (undefined/null)", () => {
    expect(parseStructuredOutcome(undefined)).toEqual({ availability: "unavailable" });
    expect(parseStructuredOutcome(null)).toEqual({ availability: "unavailable" });
  });

  it("is unavailable when analysis is present but has no structuredData (e.g. summary-only)", () => {
    const result = parseStructuredOutcome({ summary: "Caller asked a question." });
    expect(result).toEqual({ availability: "unavailable" });
  });

  it("is invalid when analysis itself isn't a usable object", () => {
    expect(parseStructuredOutcome("not an object")).toMatchObject({ availability: "invalid" });
    expect(parseStructuredOutcome([1, 2, 3])).toMatchObject({ availability: "invalid" });
  });

  it("is invalid when structuredData is present but not an object", () => {
    const result = parseStructuredOutcome({ structuredData: "not an object" });
    expect(result).toMatchObject({ availability: "invalid" });
  });

  it("parses a fully populated, valid structured outcome", () => {
    const result = parseStructuredOutcome({
      structuredData: {
        caller: { name: "Jamie Rivera (fictional)", phoneAvailable: true, email: null, companyOrBusiness: "Rivera Landscaping (fictional)" },
        inquiry: {
          reason: "Interested in a new business website",
          serviceInterest: ["website design", "pricing"],
          businessType: "landscaping",
          pricingQuestion: true,
          urgency: "normal",
        },
        appointmentRequest: {
          requested: true,
          preferredDateText: "next Tuesday",
          preferredTimeText: "afternoon",
          timezone: null,
        },
        followUp: { requested: true, phoneConsent: true, smsConsent: false, emailConsent: false },
        disposition: { outcome: "appointment_requested", summary: "Caller wants a website quote and a callback." },
      },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome).toEqual({
      schemaVersion: "1.0",
      caller: { name: "Jamie Rivera (fictional)", phoneAvailable: true, email: null, companyOrBusiness: "Rivera Landscaping (fictional)" },
      inquiry: {
        reason: "Interested in a new business website",
        serviceInterest: ["website design", "pricing"],
        businessType: "landscaping",
        pricingQuestion: true,
        urgency: "normal",
      },
      appointmentRequest: {
        requested: true,
        preferredDateText: "next Tuesday",
        preferredTimeText: "afternoon",
        timezone: null,
        status: "pending_review",
      },
      followUp: { requested: true, phoneConsent: true, smsConsent: false, emailConsent: false, status: "pending_review" },
      disposition: { outcome: "appointment_requested", summary: "Caller wants a website quote and a callback." },
    });
  });

  it("sets appointmentRequest.status to not_requested only when requested is explicitly false", () => {
    const result = parseStructuredOutcome({
      structuredData: { appointmentRequest: { requested: false } },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.appointmentRequest).toEqual({
      requested: false,
      preferredDateText: null,
      preferredTimeText: null,
      timezone: null,
      status: "not_requested",
    });
  });

  it("never produces a 'booked' appointment status — only not_requested or pending_review exist in the contract", () => {
    const result = parseStructuredOutcome({ structuredData: { appointmentRequest: { requested: true } } });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(["not_requested", "pending_review"]).toContain(result.outcome.appointmentRequest.status);
    expect(result.outcome.appointmentRequest.status).not.toBe("booked");
  });

  it("does not infer phone consent from phoneAvailable, appointment interest, or any other field", () => {
    const result = parseStructuredOutcome({
      structuredData: {
        caller: { phoneAvailable: true },
        appointmentRequest: { requested: true },
        followUp: { requested: true }, // no explicit consent booleans at all
      },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.followUp.phoneConsent).toBe(false);
    expect(result.outcome.followUp.smsConsent).toBe(false);
    expect(result.outcome.followUp.emailConsent).toBe(false);
  });

  it("phone consent never implies SMS consent, and SMS consent never implies email consent", () => {
    const result = parseStructuredOutcome({
      structuredData: { followUp: { requested: true, phoneConsent: true, smsConsent: true, emailConsent: false } },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.followUp).toEqual({
      requested: true,
      phoneConsent: true,
      smsConsent: true,
      emailConsent: false,
      status: "pending_review",
    });
  });

  it("only an explicit boolean true counts as consent — truthy non-boolean values do not", () => {
    const result = parseStructuredOutcome({
      structuredData: { followUp: { requested: true, phoneConsent: "yes", smsConsent: 1, emailConsent: "true" } },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.followUp.phoneConsent).toBe(false);
    expect(result.outcome.followUp.smsConsent).toBe(false);
    expect(result.outcome.followUp.emailConsent).toBe(false);
  });

  it("preserves ambiguous relative date/time wording verbatim rather than fabricating a normalized value", () => {
    const result = parseStructuredOutcome({
      structuredData: { appointmentRequest: { requested: true, preferredDateText: "tomorrow", preferredTimeText: "around 2" } },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.appointmentRequest.preferredDateText).toBe("tomorrow");
    expect(result.outcome.appointmentRequest.preferredTimeText).toBe("around 2");
    expect(result.outcome.appointmentRequest.timezone).toBeNull();
  });

  it("rejects an overlong string field to null rather than truncating into a misleading fragment", () => {
    const tooLong = "x".repeat(5000);
    const result = parseStructuredOutcome({ structuredData: { caller: { name: tooLong } } });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.caller.name).toBeNull();
  });

  it("caps serviceInterest to the documented maximum array size", () => {
    const many = Array.from({ length: 50 }, (_, i) => `service ${i}`);
    const result = parseStructuredOutcome({ structuredData: { inquiry: { serviceInterest: many } } });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.inquiry.serviceInterest.length).toBeLessThanOrEqual(10);
  });

  it("falls back to null/default for an unknown enum value rather than invalidating the whole record", () => {
    const result = parseStructuredOutcome({
      structuredData: { inquiry: { urgency: "extremely-urgent-made-up-value" }, disposition: { outcome: "made-up-outcome" } },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.inquiry.urgency).toBeNull();
    expect(result.outcome.disposition.outcome).toBe("unresolved");
  });

  it("strips unrecognized top-level and nested fields rather than passing them through", () => {
    const result = parseStructuredOutcome({
      structuredData: {
        caller: { name: "Jordan", secretApiKey: "sk_should_never_appear" },
        unknownTopLevelField: { anything: true },
      },
    });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(JSON.stringify(result.outcome)).not.toContain("secretApiKey");
    expect(JSON.stringify(result.outcome)).not.toContain("unknownTopLevelField");
  });

  it("defaults every section to a safe empty shape when structuredData is an empty object", () => {
    const result = parseStructuredOutcome({ structuredData: {} });
    expect(result.availability).toBe("available");
    if (result.availability !== "available") return;
    expect(result.outcome.caller).toEqual({ name: null, phoneAvailable: false, email: null, companyOrBusiness: null });
    expect(result.outcome.appointmentRequest.requested).toBe(false);
    expect(result.outcome.appointmentRequest.status).toBe("not_requested");
    expect(result.outcome.followUp.requested).toBe(false);
    expect(result.outcome.disposition.outcome).toBe("unresolved");
  });
});
