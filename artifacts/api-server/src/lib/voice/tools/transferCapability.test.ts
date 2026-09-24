// V9 — putting a caller through to a person.
//
// The defect this covers was a hole rather than a bug: the webhook could answer
// a `transfer-destination-request`, the resolver was correct and firm-scoped,
// the dashboard offered transfer contacts — and no assistant was ever given a
// tool that could ask. The capability was unreachable end to end, while the
// Transfer Contacts screen told every business with a phone number that callers
// "can be handed to a transfer contact".
//
// So these cases assert the four things that make it real, and the four that
// keep it honest:
//
//   the payload carries ONE provider-native transfer tool, and no destination
//   the validator refuses a destination list, a second tool, or a stray key
//   readiness means an ACTIVE contact with recorded consent — not hours
//   the dashboard, the payload, the comparison and the in-call gate agree
//
// Nothing here contacts a provider, opens a socket, or touches a database.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  describeFirmCapabilities,
  isCapabilityExecutable,
  readCapabilityEnvironment,
  resolveEffectiveCapabilities,
  resolveFirmCapabilities,
  resolveFirmToolNames,
  NO_READINESS,
  type CapabilityResolutionDeps,
  type FirmReadiness,
} from "./firmCapabilities.js";
import { TOOL_NAMES } from "./toolCatalog.js";
import {
  buildVoiceTransferToolDefinition,
  hasTransferTool,
  loadVoiceToolsConfigFromEnv,
  withTransferInstruction,
  TRANSFER_TOOL_INSTRUCTION,
  TRANSFER_TOOL_TYPE,
} from "../../voicePublishing/toolsConfig.js";
import { computeProviderPayloadHash } from "../../voicePublishing/providerPayloadHash.js";
import { buildSyncProviderInput } from "../../voicePublishing/syncService.js";
import {
  deriveProviderSyncState,
  type ProviderSyncStateDependencies,
} from "../../voiceAssistants/providerSyncState.js";
import { validateVapiRuntimeConfig } from "../providers/vapi/types.js";
import { buildVapiAssistantRequestBody } from "../providers/vapi/mapper.js";
import { describeTransferCapability } from "../../voiceTransferContacts/transferContactService.js";
import { VoiceProviderError } from "../errors.js";
import type { JsonObject } from "../types.js";
import type { RuntimeCatalog } from "../../voicePublishing/types.js";
import type { VoiceToolCapability } from "./toolCapabilities.js";
import type { VoiceAssistant } from "@workspace/db/schema/voice";

const SERVER = { url: "https://example.test/api/voice/webhooks/vapi", credentialId: "cred_abcdefgh" };

/** A real contact's line. It must appear nowhere in anything we send. */
const A_CONTACT_NUMBER = "+15550001111";

const ATTACH_ON = { VOICE_TOOLS_ATTACH_ENABLED: "true" };
const ALL_AUTHORIZED = { ...ATTACH_ON, VOICE_TOOLS_CAPABILITIES: "messages,scheduling,transfer" };
const NO_TRANSFER_AUTHORIZED = { ...ATTACH_ON, VOICE_TOOLS_CAPABILITIES: "messages,scheduling" };

const READY: FirmReadiness = {
  bookableAppointmentTypes: 2,
  openWeekdays: 5,
  hasUsableTimezone: true,
  dialableTransferDestinations: 1,
};

const NO_CONTACT: FirmReadiness = { ...READY, dialableTransferDestinations: 0 };

/** The payload a business would actually get, for an env + readiness. */
function payload(env: Record<string, string | undefined>, readiness: FirmReadiness): JsonObject[] | null {
  const capEnv = readCapabilityEnvironment(true, env);
  return loadVoiceToolsConfigFromEnv(
    SERVER,
    env,
    resolveFirmToolNames(capEnv, readiness),
    resolveFirmCapabilities(capEnv, readiness),
  );
}

const BASE_CONFIG = {
  model: { provider: "openai", model: "gpt-4.1" },
  voice: { provider: "vapi", voiceId: "Elliot" },
  transcriber: { provider: "soniox" },
  firstMessageMode: "assistant-speaks-first" as const,
  systemInstructions: "Answer as the front desk.",
  server: SERVER,
};

function validate(tools: unknown): unknown {
  return validateVapiRuntimeConfig({ ...BASE_CONFIG, tools });
}

function rejectionFor(tools: unknown): VoiceProviderError {
  try {
    validate(tools);
  } catch (err) {
    return err as VoiceProviderError;
  }
  throw new Error("expected the validator to reject this payload");
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** src/lib/voice/tools → src */
const SRC = path.resolve(here, "../../..");
const readSrc = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");

// ── what reaches the provider ────────────────────────────────────────────────

describe("the transfer tool as the provider receives it", () => {
  it("is two keys, and the absent third is the point", () => {
    const tool = buildVoiceTransferToolDefinition(SERVER);

    expect(Object.keys(tool).sort()).toEqual(["server", "type"]);
    expect(tool.type).toBe(TRANSFER_TOOL_TYPE);
    expect(tool.server).toEqual({ url: SERVER.url, credentialId: SERVER.credentialId });
    // A destination list would freeze a business's private numbers into a
    // provider-stored config and route around consent and hours.
    expect(tool).not.toHaveProperty("destinations");
    expect(tool).not.toHaveProperty("function");
  });

  it("carries no telephone number of any kind, anywhere in the assistant body", () => {
    const tools = payload(ALL_AUTHORIZED, READY) ?? [];
    const body = buildVapiAssistantRequestBody("Front Desk", validate(tools) as never, { recordingEnabled: false });
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("destinations");
    expect(serialized).not.toContain(A_CONTACT_NUMBER);
    // Nothing phone-number-shaped at all, so this keeps holding for a number
    // no fixture here happens to name.
    expect(serialized).not.toMatch(/\+\d{7,}/);
  });

  it("rides into model.tools, where Vapi actually reads tools from", () => {
    const tools = payload(ALL_AUTHORIZED, READY) ?? [];
    const body = buildVapiAssistantRequestBody("Front Desk", validate(tools) as never, { recordingEnabled: false });

    const model = body.model as Record<string, unknown>;
    const carried = model.tools as JsonObject[];
    expect(carried.filter((t) => t.type === TRANSFER_TOOL_TYPE)).toHaveLength(1);
    // And never as a top-level property, which the API refuses outright.
    expect(body).not.toHaveProperty("tools");
  });
});

describe("the payload carries transfer only when it is actually available", () => {
  it("attaches exactly one transfer tool when authorized and ready", () => {
    const tools = payload(ALL_AUTHORIZED, READY) ?? [];
    expect(tools.filter((t) => t.type === TRANSFER_TOOL_TYPE)).toHaveLength(1);
    expect(hasTransferTool(tools)).toBe(true);
    // The function tools are unchanged and still first.
    expect(tools.slice(0, TOOL_NAMES.length).every((t) => t.type === "function")).toBe(true);
  });

  it("attaches none when the business has no contact it may dial", () => {
    const tools = payload(ALL_AUTHORIZED, NO_CONTACT) ?? [];
    expect(hasTransferTool(tools)).toBe(false);
  });

  it("attaches none when SiteMint has not authorized transfer, however ready the business is", () => {
    const tools = payload(NO_TRANSFER_AUTHORIZED, READY) ?? [];
    expect(hasTransferTool(tools)).toBe(false);
  });

  it("attaches nothing at all while the master switch is off", () => {
    expect(payload({ VOICE_TOOLS_CAPABILITIES: "transfer" }, READY)).toBeNull();
  });

  it("can be the only capability: transfer alone still produces the tool", () => {
    const tools = payload({ ...ATTACH_ON, VOICE_TOOLS_CAPABILITIES: "transfer" }, READY) ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0]!.type).toBe(TRANSFER_TOOL_TYPE);
  });
});

// ── the validator ────────────────────────────────────────────────────────────

describe("the Vapi runtime validator", () => {
  it("accepts the function catalog plus one transfer tool", () => {
    const tools = payload(ALL_AUTHORIZED, READY) ?? [];
    const validated = validate(tools) as { tools: JsonObject[] };
    expect(validated.tools).toHaveLength(TOOL_NAMES.length + 1);
  });

  it("refuses a destination list outright", () => {
    const err = rejectionFor([
      { type: TRANSFER_TOOL_TYPE, server: SERVER, destinations: [{ type: "number", number: A_CONTACT_NUMBER }] },
    ]);
    expect(err).toBeInstanceOf(VoiceProviderError);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.message).toContain("destinations");
  });

  it("refuses any other stray key on the transfer tool", () => {
    for (const extra of [{ messages: [] }, { function: { name: "save_message" } }, { async: true }]) {
      const err = rejectionFor([{ type: TRANSFER_TOOL_TYPE, server: SERVER, ...extra }]);
      expect(err.code).toBe("VALIDATION_FAILED");
    }
  });

  it("refuses a second transfer tool, so the model is never choosing between two", () => {
    const err = rejectionFor([
      { type: TRANSFER_TOOL_TYPE, server: SERVER },
      { type: TRANSFER_TOOL_TYPE, server: SERVER },
    ]);
    expect(err.message).toMatch(/at most 1/);
  });

  it("still refuses every tool type outside the two it knows", () => {
    for (const type of ["endCall", "dtmf", "apiRequest", "transfer", "TRANSFERCALL"]) {
      expect(rejectionFor([{ type, server: SERVER }]).code).toBe("VALIDATION_FAILED");
    }
  });

  it("holds the transfer tool's server block to the same rules as a function tool's", () => {
    const cases: unknown[] = [
      { type: TRANSFER_TOOL_TYPE, server: { url: "http://example.test/hook", credentialId: "cred_abcdefgh" } },
      { type: TRANSFER_TOOL_TYPE, server: { url: "https://u:p@example.test/hook", credentialId: "cred_abcdefgh" } },
      { type: TRANSFER_TOOL_TYPE, server: { url: SERVER.url, credentialId: "cred_a,cred_b" } },
      { type: TRANSFER_TOOL_TYPE, server: { url: SERVER.url, credentialId: "short" } },
      { type: TRANSFER_TOOL_TYPE, server: { url: SERVER.url, secret: "a-webhook-secret" } },
      { type: TRANSFER_TOOL_TYPE },
    ];
    for (const tool of cases) {
      expect(rejectionFor([tool]).code, JSON.stringify(tool)).toBe("VALIDATION_FAILED");
    }
  });

  it("keeps the overall tool cap", () => {
    const tools = Array.from({ length: 9 }, () => ({ type: "function", function: { name: "save_message", description: "d", parameters: { type: "object" } }, server: SERVER }));
    expect(rejectionFor(tools).message).toMatch(/1\.\.8/);
  });
});

// ── readiness ────────────────────────────────────────────────────────────────

describe("transfer readiness is one contact you are allowed to dial", () => {
  const env = readCapabilityEnvironment(true, ALL_AUTHORIZED);
  const reasonFor = (readiness: FirmReadiness) =>
    describeFirmCapabilities(env, readiness).find((r) => r.key === "transfer")!.reason;

  it("blocks with needs_transfer_contact until there is one", () => {
    expect(reasonFor(NO_CONTACT)).toBe("needs_transfer_contact");
    expect(reasonFor(NO_READINESS)).toBe("needs_transfer_contact");
    expect(reasonFor(READY)).toBeNull();
  });

  it("does not depend on scheduling being set up", () => {
    // A business that books nothing can still put callers through.
    expect(reasonFor({ ...NO_READINESS, dialableTransferDestinations: 1 })).toBeNull();
  });

  it("is not blocked by the hours a contact keeps — that is a per-call question", () => {
    // There is deliberately no hours field to block on: whether now is inside a
    // contact's window is decided by the resolver, on the call.
    expect(Object.keys(READY)).not.toContain("transferHours");
    expect(reasonFor(READY)).toBeNull();
  });

  it("says not_authorized when SiteMint has not switched it on", () => {
    const narrow = readCapabilityEnvironment(true, NO_TRANSFER_AUTHORIZED);
    const report = describeFirmCapabilities(narrow, READY).find((r) => r.key === "transfer")!;
    expect(report.state).toBe("blocked");
    expect(report.reason).toBe("not_authorized");
  });

  it("says platform_disabled when no tool can attach at all", () => {
    const off = readCapabilityEnvironment(false, ALL_AUTHORIZED);
    expect(describeFirmCapabilities(off, READY).find((r) => r.key === "transfer")!.reason).toBe("platform_disabled");
  });

  it("contributes no dispatcher tool — it is provider-native", () => {
    const capEnv = readCapabilityEnvironment(true, { ...ATTACH_ON, VOICE_TOOLS_CAPABILITIES: "transfer" });
    expect(resolveFirmToolNames(capEnv, READY)).toEqual([]);
    expect(resolveFirmCapabilities(capEnv, READY)).toEqual(["transfer"]);
  });
});

// ── the four call sites ──────────────────────────────────────────────────────

describe("the dashboard, the payload, the comparison and the gate agree", () => {
  it("a transfer capability reported active is one the payload carries", () => {
    for (const env of [ALL_AUTHORIZED, NO_TRANSFER_AUTHORIZED]) {
      for (const readiness of [READY, NO_CONTACT, NO_READINESS]) {
        const capEnv = readCapabilityEnvironment(true, env);
        const active = describeFirmCapabilities(capEnv, readiness).some(
          (r) => r.key === "transfer" && r.state === "active",
        );
        expect(hasTransferTool(payload(env, readiness)), `${env.VOICE_TOOLS_CAPABILITIES} / ${readiness.dialableTransferDestinations}`).toBe(active);
      }
    }
  });

  it("publish and synchronization build the instruction the same way, from the payload", () => {
    // Read from the sources, because the failure this prevents is one path
    // appending the instruction and the other not: the digests would differ
    // forever and a freshly published assistant would read as out of sync.
    const publishSrc = readSrc("lib/voicePublishing/publishService.ts");
    const syncSrc = readSrc("lib/voicePublishing/syncService.ts");
    const line = "systemInstructions: withTransferInstruction(extracted.systemInstructions, toolsConfig),";

    expect(publishSrc).toContain(line);
    expect(syncSrc).toContain(line);
    // And both narrow by the same two halves of the shared resolution.
    for (const src of [publishSrc, syncSrc]) {
      expect(src).toContain("effective.toolNames,");
      expect(src).toContain("effective.activeCapabilities,");
    }
  });

  it("the digest moves when the transfer tool is attached, and not with key order", () => {
    const tools = payload(ALL_AUTHORIZED, READY) ?? [];
    const without = payload(ALL_AUTHORIZED, NO_CONTACT) ?? [];

    const input = (t: JsonObject[], reversedOrder = false): { name: string; config: JsonObject } => {
      const config: JsonObject = reversedOrder
        ? { tools: t, systemInstructions: withTransferInstruction("Answer as the front desk.", t), server: SERVER }
        : { server: SERVER, systemInstructions: withTransferInstruction("Answer as the front desk.", t), tools: t };
      return { name: "Front Desk", config };
    };

    // Same content, different construction order: one digest.
    expect(computeProviderPayloadHash(input(tools), "none")).toBe(
      computeProviderPayloadHash(input(tools, true), "none"),
    );
    // Attaching the tool is a real change, and the comparison sees it.
    expect(computeProviderPayloadHash(input(tools), "none")).not.toBe(
      computeProviderPayloadHash(input(without), "none"),
    );
  });
});

// ── the comparison (the fourth call site) ────────────────────────────────────

describe("the synchronization comparison rebuilds the payload publish actually sent", () => {
  const NOW = new Date("2026-09-16T00:00:00.000Z");
  const CATALOG = {
    version: 1,
    presets: {
      "natural-balanced": {
        provider: "vapi",
        model: { provider: "p", model: "m" },
        voice: { provider: "p", voiceId: "v" },
        transcriber: { provider: "p" },
      },
    },
  } as unknown as RuntimeCatalog;

  const publishedRow = (overrides: Record<string, unknown> = {}): VoiceAssistant =>
    ({
      id: 42,
      firmId: 7,
      name: "Front Desk",
      templateKey: "blank",
      status: "published",
      provider: "vapi",
      providerAssistantId: "prov-xyz-789",
      config: {
        schemaVersion: 1,
        prompt: {
          firstMessageMode: "assistant-speaks-first",
          firstMessage: "Hello.",
          systemInstructions: "Be helpful.",
        },
        voiceModel: { preset: "natural-balanced" },
      },
      syncError: null,
      publishAttemptId: null,
      publishStartedAt: null,
      lastSyncedAt: NOW,
      providerConfigHash: null,
      providerSyncAttemptId: null,
      providerSyncStartedAt: null,
      providerSyncError: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    }) as unknown as VoiceAssistant;

  const capEnv = readCapabilityEnvironment(true, ALL_AUTHORIZED);
  const firmToolNames = resolveFirmToolNames(capEnv, READY);

  /** The comparison's dependencies, with the capability list the caller passes. */
  const comparisonDeps = (
    firmCapabilities: readonly VoiceToolCapability[] | undefined,
  ): ProviderSyncStateDependencies => ({
    loadCatalog: () => CATALOG,
    loadArtifactPolicy: () => "none",
    loadServerConfig: () => SERVER,
    loadToolsConfig: (serverConfig, _env, names, caps) =>
      loadVoiceToolsConfigFromEnv(serverConfig, ALL_AUTHORIZED, names, caps),
    loadCallPolicy: () => null,
    firmToolNames,
    firmCapabilities,
    clock: { now: () => NOW },
  });

  /** The digest a publish with transfer active would have recorded. */
  const publishedHash = computeProviderPayloadHash(
    buildSyncProviderInput(
      publishedRow(),
      CATALOG,
      SERVER,
      loadVoiceToolsConfigFromEnv(SERVER, ALL_AUTHORIZED, firmToolNames, resolveFirmCapabilities(capEnv, READY)),
      null,
    ),
    "none",
  );

  it("reads as synchronized immediately after a publish that attached the transfer tool", () => {
    const state = deriveProviderSyncState(
      publishedRow({ providerConfigHash: publishedHash }),
      comparisonDeps(resolveFirmCapabilities(capEnv, READY)),
    );
    expect(state).toBe("synchronized");
  });

  it("would report 'changes not published' forever if it forgot the capability list", () => {
    // The V8 defect through a new door: narrowing by tool names alone drops the
    // transfer tool from the comparison's payload but not from the published
    // one, so the digests can never agree again.
    const state = deriveProviderSyncState(
      publishedRow({ providerConfigHash: publishedHash }),
      comparisonDeps(["messages", "scheduling"]),
    );
    expect(state).toBe("local_changes");
  });

  it("notices honestly when transfer readiness lapses after publication", () => {
    // Not a false "synchronized": the payload really has changed, and the owner
    // is told to publish again.
    const state = deriveProviderSyncState(
      publishedRow({ providerConfigHash: publishedHash }),
      comparisonDeps(resolveFirmCapabilities(capEnv, NO_CONTACT)),
    );
    expect(state).toBe("local_changes");
  });
});

// ── the model's instruction ──────────────────────────────────────────────────

describe("the assistant is told when to use it", () => {
  it("appends the instruction only when the tool is on the payload", () => {
    const base = "Answer as the front desk.";
    expect(withTransferInstruction(base, payload(ALL_AUTHORIZED, READY))).toContain(TRANSFER_TOOL_INSTRUCTION);
    expect(withTransferInstruction(base, payload(ALL_AUTHORIZED, NO_CONTACT))).toBe(base);
    expect(withTransferInstruction(base, null)).toBe(base);
  });

  it("keeps the business's own instructions intact ahead of it", () => {
    const base = "Never quote a price.";
    expect(withTransferInstruction(base, payload(ALL_AUTHORIZED, READY)).startsWith(base)).toBe(true);
  });

  it("names the fallback, so a refused transfer is not improvised", () => {
    expect(TRANSFER_TOOL_INSTRUCTION).toContain("transferCall");
    expect(TRANSFER_TOOL_INSTRUCTION).toContain("save_message");
    expect(TRANSFER_TOOL_INSTRUCTION).toMatch(/cannot be made/i);
  });
});

// ── the in-call gate ─────────────────────────────────────────────────────────

describe("the webhook refuses a transfer the business may no longer make", () => {
  const deps = (
    env: Record<string, string | undefined>,
    readiness: FirmReadiness,
    attachable = true,
  ): CapabilityResolutionDeps => ({
    env,
    isToolsAttachable: async () => attachable,
    loadReadiness: async () => readiness,
  });

  it("is executable only when authorized AND ready", async () => {
    expect(await isCapabilityExecutable(1, "transfer", deps(ALL_AUTHORIZED, READY))).toBe(true);
    expect(await isCapabilityExecutable(1, "transfer", deps(ALL_AUTHORIZED, NO_CONTACT))).toBe(false);
    expect(await isCapabilityExecutable(1, "transfer", deps(NO_TRANSFER_AUTHORIZED, READY))).toBe(false);
    expect(await isCapabilityExecutable(1, "transfer", deps(ALL_AUTHORIZED, READY, false))).toBe(false);
  });

  it("refuses when the capability state cannot be resolved at all", async () => {
    const throwing: CapabilityResolutionDeps = {
      env: ALL_AUTHORIZED,
      isToolsAttachable: async () => true,
      loadReadiness: async () => {
        throw new Error("database unavailable");
      },
    };
    expect(await isCapabilityExecutable(1, "transfer", throwing)).toBe(false);
  });

  it("stops being executable the moment the last consented contact goes, without a republish", async () => {
    const atPublish = await resolveEffectiveCapabilities(1, deps(ALL_AUTHORIZED, READY));
    expect(atPublish.activeCapabilities).toContain("transfer");

    const now = await resolveEffectiveCapabilities(1, deps(ALL_AUTHORIZED, NO_CONTACT));
    expect(now.activeCapabilities).not.toContain("transfer");
    // The provider is still advertising the tool; the runtime answer is already no.
    expect(now.reports.find((r) => r.key === "transfer")!.reason).toBe("needs_transfer_contact");
  });

  it("is checked in the route before any destination is resolved", () => {
    const route = readSrc("routes/receptionistVoiceWebhook.ts");
    const gate = route.indexOf('isCapabilityExecutable(firmId, "transfer")');
    const resolve = route.indexOf("resolveTransferDestination(firmId)");

    expect(gate).toBeGreaterThan(0);
    expect(resolve).toBeGreaterThan(gate);
    // The refusal speaks a line and returns no destination.
    const refusal = route.slice(gate, resolve);
    expect(refusal).toContain("TRANSFER_UNAVAILABLE_LINE");
    expect(refusal).not.toContain("destination:");
  });
});

// ── what the business is told ────────────────────────────────────────────────

describe("the Transfer Contacts banner states the real capability", () => {
  it("never calls a transfer available on the strength of an assigned number", () => {
    const banner = describeTransferCapability("not_authorized", true);
    expect(banner.state).toBe("blocked");
    expect(banner.telephoneTransferAvailable).toBe(false);
    expect(banner.explanation).toMatch(/not switched on by SiteMint/i);
  });

  it("tells a business with no authorised contact exactly what to do", () => {
    const banner = describeTransferCapability("needs_transfer_contact", true);
    expect(banner.state).toBe("blocked");
    expect(banner.explanation).toMatch(/add a contact/i);
    expect(banner.explanation).toMatch(/agreed to receive/i);
  });

  it("says a number is still needed when the capability is otherwise ready", () => {
    const banner = describeTransferCapability(null, false);
    expect(banner.state).toBe("active");
    expect(banner.telephoneTransferAvailable).toBe(false);
    expect(banner.explanation).toMatch(/need a phone number/i);
  });

  it("claims a transfer can happen only when both halves hold", () => {
    const banner = describeTransferCapability(null, true);
    expect(banner.telephoneTransferAvailable).toBe(true);
    expect(banner.explanation).toMatch(/can be handed to a transfer contact/i);
  });

  it("always states that a browser test call cannot hand anyone over", () => {
    for (const blocked of [null, "not_authorized", "needs_transfer_contact"] as const) {
      for (const numberAssigned of [true, false]) {
        expect(describeTransferCapability(blocked, numberAssigned).explanation).toMatch(/browser test calls/i);
      }
    }
  });

  it("never promises anyone answered, on any path", () => {
    for (const blocked of [null, "platform_disabled", "not_authorized", "needs_transfer_contact"] as const) {
      const { explanation } = describeTransferCapability(blocked, true);
      expect(explanation).not.toMatch(/will answer|someone will pick up|guaranteed/i);
    }
  });
});
