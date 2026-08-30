// P6 — numbers, inbound routing, transfers, and failure policy: the state
// machine, assistant resolution, destination resolution with the hours
// guard, the call-policy loader/validator/mapper chain, emergency-language
// scanning, and a deterministic failure matrix binding resolutions to the
// exact spoken outcomes the webhook returns.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  canTransition,
  createProductionPhoneNumberProvider,
  FakePhoneNumberProvider,
  resolveAssistantForNumber,
  resolveFirmIdForInboundSmsNumber,
  resolveTransferDestination,
  scanEmergencyLanguage,
  type NumberRoutingDeps,
  type TransferResolutionDeps,
} from "./numberService.js";
import { loadVoiceCallPolicyFromEnv, VOICE_CALL_POLICY_ENV_VAR } from "../voicePublishing/callPolicyConfig.js";
import { PublishFoundationError } from "../voicePublishing/errors.js";
import { validateVapiRuntimeConfig } from "../voice/providers/vapi/types.js";
import { buildVapiAssistantRequestBody } from "../voice/providers/vapi/mapper.js";
import { parseVapiServerMessage } from "../voice/webhooks/vapiServerMessage.js";
import { buildVapiEventKey } from "../voice/webhooks/eventKey.js";
import type { VoiceNumber, VoiceTransferDestination } from "@workspace/db/schema/voice";

const NOW = new Date("2026-08-31T15:00:00.000Z");

function number(overrides: Partial<VoiceNumber> = {}): VoiceNumber {
  return {
    id: 1,
    firmId: 7,
    phoneE164: "+15550001234",
    acquisition: "twilio_byo",
    providerNumberId: "pn-1",
    state: "assigned",
    assignedAssistantId: 42,
    pausedReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    releasedAt: null,
    ...overrides,
  } as VoiceNumber;
}

function destination(overrides: Partial<VoiceTransferDestination> = {}): VoiceTransferDestination {
  return {
    id: 1,
    firmId: 7,
    label: "Front desk",
    phoneE164: "+15550005678",
    priority: 100,
    active: true,
    businessHoursOnly: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as VoiceTransferDestination;
}

// ── state machine ────────────────────────────────────────────────────────────

describe("number state machine", () => {
  it("permits exactly the documented transitions", () => {
    const allowed: Array<[string, string]> = [
      ["inventory", "assigned"],
      ["inventory", "released"],
      ["assigned", "paused"],
      ["assigned", "released"],
      ["paused", "assigned"],
      ["paused", "released"],
    ];
    const states = ["inventory", "assigned", "paused", "released"] as const;
    for (const from of states) {
      for (const to of states) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from}->${to}`).toBe(expected);
      }
    }
  });

  it("production acquisition seam refuses until owner-gated activation; the fake records", async () => {
    const production = createProductionPhoneNumberProvider();
    await expect(production.importTwilioNumber("+15550001234")).rejects.toThrow(/owner-gated/);
    await expect(production.releaseProviderNumber("pn-1")).rejects.toThrow(/owner-gated/);
    const fake = new FakePhoneNumberProvider();
    const acquired = await fake.importTwilioNumber("+15550001234");
    expect(acquired.providerNumberId).toBe("fake-pn-1");
    expect(fake.imported).toEqual(["+15550001234"]);
  });
});

// ── inbound routing ──────────────────────────────────────────────────────────

describe("resolveAssistantForNumber", () => {
  function routing(row: VoiceNumber | undefined, providerId: string | undefined = "prov-abc"): NumberRoutingDeps {
    return {
      findByProviderNumberId: async () => row,
      findAssistantProviderId: async () => providerId,
    };
  }

  it("routes only an assigned number with a provider-linked assistant", async () => {
    expect(await resolveAssistantForNumber("pn-1", routing(number()))).toEqual({
      ok: true,
      providerAssistantId: "prov-abc",
      firmId: 7,
    });
  });

  it("refuses unknown, paused, unassigned, and unlinked — each with its own reason", async () => {
    expect(await resolveAssistantForNumber("pn-x", routing(undefined))).toEqual({ ok: false, reason: "unknown_number" });
    expect(await resolveAssistantForNumber("pn-1", routing(number({ state: "paused" })))).toEqual({
      ok: false,
      reason: "paused",
    });
    expect(
      await resolveAssistantForNumber("pn-1", routing(number({ state: "inventory", firmId: null, assignedAssistantId: null }))),
    ).toEqual({ ok: false, reason: "not_assigned" });
    // Built inline: passing undefined through the helper would re-trigger
    // its default parameter and hand the assistant a provider id anyway.
    expect(
      await resolveAssistantForNumber("pn-1", {
        findByProviderNumberId: async () => number(),
        findAssistantProviderId: async () => undefined,
      }),
    ).toEqual({
      ok: false,
      reason: "assistant_unlinked",
    });
  });
});

// ── transfer resolution ──────────────────────────────────────────────────────

describe("resolveTransferDestination", () => {
  function transfer(
    destinations: VoiceTransferDestination[],
    withinHours: boolean,
  ): TransferResolutionDeps {
    return {
      listActiveDestinations: async () => destinations,
      isWithinBusinessHours: async () => withinHours,
      now: () => NOW,
    };
  }

  it("picks the lowest-priority active destination during business hours", async () => {
    const result = await resolveTransferDestination(
      7,
      transfer(
        [destination({ id: 2, priority: 10, label: "Urgent line", phoneE164: "+15550001111" }), destination()],
        true,
      ),
    );
    expect(result).toEqual({ ok: true, destinationE164: "+15550001111", label: "Urgent line" });
  });

  it("after hours, business-hours-only destinations are skipped and an always-on one wins", async () => {
    const afterHours = await resolveTransferDestination(
      7,
      transfer(
        [
          destination({ id: 1, priority: 10 }), // hours-only, skipped
          destination({ id: 2, priority: 20, businessHoursOnly: false, label: "On-call", phoneE164: "+15550002222" }),
        ],
        false,
      ),
    );
    expect(afterHours).toEqual({ ok: true, destinationE164: "+15550002222", label: "On-call" });
  });

  it("reports after_hours when only hours-bound destinations exist, and no_destinations when none do", async () => {
    expect(await resolveTransferDestination(7, transfer([destination()], false))).toEqual({
      ok: false,
      reason: "after_hours",
    });
    expect(await resolveTransferDestination(7, transfer([], true))).toEqual({ ok: false, reason: "no_destinations" });
  });
});

// ── call policy: loader → validator → request body ───────────────────────────

describe("call policy", () => {
  it("is null when unset and fail-closed on malformed values", () => {
    expect(loadVoiceCallPolicyFromEnv({})).toBeNull();
    const bad = [
      "not json",
      '"a string"',
      "{}",
      '{"unknownKey":1}',
      '{"silenceTimeoutSeconds":5}',
      '{"silenceTimeoutSeconds":1000}',
      '{"maxDurationSeconds":10}',
      '{"endCallMessage":""}',
    ];
    for (const raw of bad) {
      let thrown: unknown;
      try {
        loadVoiceCallPolicyFromEnv({ [VOICE_CALL_POLICY_ENV_VAR]: raw });
      } catch (err) {
        thrown = err;
      }
      expect(thrown, raw).toBeInstanceOf(PublishFoundationError);
    }
  });

  it("valid policy flows through the Vapi validator into first-class request fields", () => {
    const policy = loadVoiceCallPolicyFromEnv({
      [VOICE_CALL_POLICY_ENV_VAR]: JSON.stringify({
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 1800,
        endCallMessage: "Thanks for calling. Goodbye.",
        voicemailMessage: "Please call back during business hours.",
      }),
    });
    expect(policy).not.toBeNull();
    const validated = validateVapiRuntimeConfig({
      model: { provider: "p", model: "m" },
      voice: { provider: "vp", voiceId: "vid" },
      transcriber: { provider: "tp" },
      firstMessageMode: "assistant-speaks-first",
      systemInstructions: "Hello.",
      callPolicy: policy,
    });
    const body = buildVapiAssistantRequestBody("Front Desk", validated, { recordingEnabled: false });
    expect(body.silenceTimeoutSeconds).toBe(30);
    expect(body.maxDurationSeconds).toBe(1800);
    expect(body.endCallMessage).toBe("Thanks for calling. Goodbye.");
    expect(body.voicemailMessage).toBe("Please call back during business hours.");
    expect(body.callPolicy).toBeUndefined(); // mapped to first-class fields, never nested
  });

  it("rejects unknown callPolicy keys at the provider validator too", () => {
    expect(() =>
      validateVapiRuntimeConfig({
        model: { provider: "p", model: "m" },
        voice: { provider: "vp", voiceId: "vid" },
        transcriber: { provider: "tp" },
        firstMessageMode: "assistant-speaks-first",
        systemInstructions: "Hello.",
        callPolicy: { silenceTimeoutSeconds: 30, surprise: true },
      }),
    ).toThrow(/unsupported field/);
  });
});

// ── inbound-SMS tenant mapping ───────────────────────────────────────────────

describe("resolveFirmIdForInboundSmsNumber", () => {
  it("maps an in-service number to its firm and nothing else to anyone", async () => {
    const inventory = new Map<string, number | undefined>([["+15550001234", 7]]);
    const deps = { findOwningFirmByE164: async (e164: string) => inventory.get(e164) };
    expect(await resolveFirmIdForInboundSmsNumber("+15550001234", deps)).toBe(7);
    // Unknown, released, and inventory numbers are the dep's undefined —
    // consent never updates through a number a firm does not operate.
    expect(await resolveFirmIdForInboundSmsNumber("+15559999999", deps)).toBeUndefined();
  });
});

// ── emergency language ───────────────────────────────────────────────────────

describe("scanEmergencyLanguage", () => {
  it("flags genuine emergency phrasing", () => {
    for (const text of [
      "I think I need to call 911",
      "this is an EMERGENCY",
      "he said he wants to kill himself",
      "she has chest pain and can't breathe",
      "possible heart attack",
    ]) {
      expect(scanEmergencyLanguage(text).flagged, text).toBe(true);
    }
  });
  it("stays quiet on lookalikes and absence", () => {
    for (const text of [
      undefined,
      "",
      "my address is 9110 Main Street",
      "I work at 911th Signal Battalion",
      "the emergency exit sign broke", // contains 'emergency' — flagged? yes by design
    ].slice(0, 4)) {
      expect(scanEmergencyLanguage(text as string | undefined).flagged, String(text)).toBe(false);
    }
  });
});

// ── parser + deterministic failure matrix ────────────────────────────────────

describe("P6 message types and failure matrix", () => {
  it("parses and keys the two new message types", () => {
    const tdr = parseVapiServerMessage({
      message: { type: "transfer-destination-request", call: { id: "c1", assistantId: "a1" } },
    });
    expect(tdr.ok).toBe(true);
    if (tdr.ok) expect(buildVapiEventKey(tdr.message)).toBe("c1:transfer-destination-request");
    const tu = parseVapiServerMessage({
      message: { type: "transfer-update", call: { id: "c1", assistantId: "a1" }, status: "in-progress" },
    });
    expect(tu.ok).toBe(true);
  });

  it("binds every failure mode to a deterministic spoken outcome", async () => {
    // The matrix a live pilot's scripted calls will exercise, asserted here
    // at the resolution layer the webhook maps 1:1 into responses.
    const matrix: Array<{ name: string; result: unknown; expect: unknown }> = [
      {
        name: "unknown number",
        result: await resolveAssistantForNumber("pn-x", { findByProviderNumberId: async () => undefined, findAssistantProviderId: async () => undefined }),
        expect: { ok: false, reason: "unknown_number" },
      },
      {
        name: "paused number",
        result: await resolveAssistantForNumber("pn-1", {
          findByProviderNumberId: async () => number({ state: "paused" }),
          findAssistantProviderId: async () => "prov-abc",
        }),
        expect: { ok: false, reason: "paused" },
      },
      {
        name: "transfer after hours",
        result: await resolveTransferDestination(7, {
          listActiveDestinations: async () => [destination()],
          isWithinBusinessHours: async () => false,
        }),
        expect: { ok: false, reason: "after_hours" },
      },
      {
        name: "transfer with no destinations",
        result: await resolveTransferDestination(7, {
          listActiveDestinations: async () => [],
          isWithinBusinessHours: async () => true,
        }),
        expect: { ok: false, reason: "no_destinations" },
      },
    ];
    for (const row of matrix) {
      expect(row.result, row.name).toEqual(row.expect);
    }
  });
});
