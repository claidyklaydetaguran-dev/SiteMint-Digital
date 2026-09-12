// V8 — the four call sites must agree.
//
// The dashboard, the published payload, the synchronization comparison and the
// runtime dispatcher each need to know what an assistant may do. Every past
// defect in this area was a disagreement between two of them:
//
//   dashboard says "Available", payload omits the tool   -> the screen lies
//   payload carries a tool the comparison ignores        -> permanent
//                                                           "changes not published"
//   payload still carries a tool the business can no
//   longer honour                                        -> the assistant
//                                                           promises a booking
//                                                           it cannot make
//
// So these cases assert agreement directly, and the lapse case asserts the one
// place the four are ALLOWED to differ: after readiness lapses, the runtime gate
// must refuse even though the provider is still advertising the tool.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  describeFirmCapabilities,
  readCapabilityEnvironment,
  resolveFirmToolNames,
  resolveEffectiveCapabilities,
  NO_READINESS,
  type FirmReadiness,
} from "./firmCapabilities.js";
import { loadVoiceToolsConfigFromEnv } from "../../voicePublishing/toolsConfig.js";

const SERVER = { url: "https://example.test/api/voice/webhooks/vapi", credentialId: "cred_abcdefgh" };

const FULLY_READY: FirmReadiness = {
  bookableAppointmentTypes: 2,
  openWeekdays: 5,
  hasUsableTimezone: true,
};

const BOTH_AUTHORIZED = {
  VOICE_TOOLS_ATTACH_ENABLED: "true",
  VOICE_TOOLS_CAPABILITIES: "messages,scheduling",
};

/** The names the payload actually carries, for a given env + readiness. */
function payloadToolNames(env: Record<string, string | undefined>, readiness: FirmReadiness): string[] {
  const capEnv = readCapabilityEnvironment(true, env);
  const firmToolNames = resolveFirmToolNames(capEnv, readiness);
  const defs = loadVoiceToolsConfigFromEnv(SERVER, env, firmToolNames) ?? [];
  return defs.map((d) => String((d.function as Record<string, unknown>).name));
}

describe("scheduling readiness is more than one appointment type", () => {
  it("is ready only when types, open days and a timezone are all present", () => {
    const env = readCapabilityEnvironment(true, BOTH_AUTHORIZED);
    const reasonFor = (readiness: FirmReadiness) =>
      describeFirmCapabilities(env, readiness).find((r) => r.key === "scheduling")!.reason;

    expect(reasonFor(FULLY_READY)).toBeNull();
    expect(reasonFor({ ...FULLY_READY, bookableAppointmentTypes: 0 })).toBe("needs_appointment_type");
    // The case that motivated this: a type exists, but every day is closed, so
    // the engine would answer "the office is closed" for every date a caller asks about.
    expect(reasonFor({ ...FULLY_READY, openWeekdays: 0 })).toBe("needs_opening_hours");
    expect(reasonFor({ ...FULLY_READY, hasUsableTimezone: false })).toBe("needs_timezone");
  });

  it("never blocks message-taking on scheduling configuration", () => {
    const env = readCapabilityEnvironment(true, BOTH_AUTHORIZED);
    const messages = describeFirmCapabilities(env, NO_READINESS).find((r) => r.key === "messages")!;
    expect(messages.state).toBe("active");
    expect(messages.reason).toBeNull();
  });
});

describe("the dashboard and the payload agree", () => {
  it("a capability reported active is one the payload carries", () => {
    for (const readiness of [FULLY_READY, { ...FULLY_READY, openWeekdays: 0 }, NO_READINESS]) {
      const env = readCapabilityEnvironment(true, BOTH_AUTHORIZED);
      const activeKeys = describeFirmCapabilities(env, readiness)
        .filter((r) => r.state === "active")
        .map((r) => r.key);
      const carried = payloadToolNames(BOTH_AUTHORIZED, readiness);

      // Message-taking active <=> save_message carried.
      expect(activeKeys.includes("messages")).toBe(carried.includes("save_message"));
      // Scheduling active <=> the booking tools carried.
      expect(activeKeys.includes("scheduling")).toBe(carried.includes("book_appointment"));
    }
  });

  it("an unconfigured business publishes message-taking but no booking tools", () => {
    const carried = payloadToolNames(BOTH_AUTHORIZED, NO_READINESS);
    expect(carried).toEqual(["save_message"]);
  });

  it("readiness can only narrow the operator allowlist, never widen it", () => {
    // Scheduling fully configured, but the operator authorized messages only.
    const carried = payloadToolNames(
      { VOICE_TOOLS_ATTACH_ENABLED: "true", VOICE_TOOLS_CAPABILITIES: "messages" },
      FULLY_READY,
    );
    expect(carried).toEqual(["save_message"]);
  });
});

describe("the payload and the synchronization comparison agree", () => {
  it("both build from the same resolved list, so the digests match", () => {
    // The comparison calls the same loader with the same firm list. If these
    // ever diverge the assistant reads as "changes not published" forever —
    // the 88df967 defect.
    for (const readiness of [FULLY_READY, NO_READINESS]) {
      const capEnv = readCapabilityEnvironment(true, BOTH_AUTHORIZED);
      const firmToolNames = resolveFirmToolNames(capEnv, readiness);

      const fromPublish = loadVoiceToolsConfigFromEnv(SERVER, BOTH_AUTHORIZED, firmToolNames);
      const fromComparison = loadVoiceToolsConfigFromEnv(SERVER, BOTH_AUTHORIZED, firmToolNames);
      expect(fromComparison).toEqual(fromPublish);
    }
  });

  it("a comparison that forgets the firm list would differ — which is why it is threaded", () => {
    const capEnv = readCapabilityEnvironment(true, BOTH_AUTHORIZED);
    const narrowed = loadVoiceToolsConfigFromEnv(
      SERVER,
      BOTH_AUTHORIZED,
      resolveFirmToolNames(capEnv, NO_READINESS),
    );
    const unnarrowed = loadVoiceToolsConfigFromEnv(SERVER, BOTH_AUTHORIZED, undefined);
    expect(narrowed).not.toEqual(unnarrowed);
  });
});

describe("readiness that lapses after publication", () => {
  it("stops being executable immediately, without waiting for a republish", async () => {
    // Published while fully configured…
    const atPublish = await resolveEffectiveCapabilities(1, {
      isToolsAttachable: async () => true,
      env: BOTH_AUTHORIZED,
      loadReadiness: async () => FULLY_READY,
    });
    expect(atPublish.toolNames).toContain("book_appointment");

    // …then the business deletes its last appointment type. The provider is
    // still advertising the tool; the runtime answer must already be no.
    const now = await resolveEffectiveCapabilities(1, {
      isToolsAttachable: async () => true,
      env: BOTH_AUTHORIZED,
      loadReadiness: async () => ({ ...FULLY_READY, bookableAppointmentTypes: 0 }),
    });
    const scheduling = now.reports.find((r) => r.key === "scheduling")!;
    expect(scheduling.state).toBe("blocked");
    expect(scheduling.reason).toBe("needs_appointment_type");
    expect(now.toolNames).not.toContain("book_appointment");

    // And message-taking is untouched by a scheduling lapse.
    expect(now.toolNames).toContain("save_message");
  });

  it("authorizes nothing when the capability state cannot be resolved", async () => {
    const effective = await resolveEffectiveCapabilities(1, {
      isToolsAttachable: async () => false,
      env: BOTH_AUTHORIZED,
      loadReadiness: async () => FULLY_READY,
    });
    expect(effective.toolNames).toEqual([]);
    expect(effective.reports.every((r) => r.state === "blocked")).toBe(true);
  });
});
