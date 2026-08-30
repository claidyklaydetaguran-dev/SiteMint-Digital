/**
 * AR-001V.1 — the three voice capabilities are independent, default off, and
 * the server is authoritative.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * This exercises the real flag readers and the real service entry points
 * through their explicit dependency seams. Nothing here contacts a provider,
 * reads a real credential, opens a socket, or touches a database — the
 * tripwires assert that rather than assume it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  isVoicePublishEnabled,
  isVoiceSyncEnabled,
  isVoiceBrowserTestEnabled,
  VOICE_PUBLISH_ENABLED_ENV_VAR,
  VOICE_SYNC_ENABLED_ENV_VAR,
  VOICE_BROWSER_TEST_ENABLED_ENV_VAR,
} from "./featureFlags.js";
import { publishAssistant, type PublishServiceDependencies } from "./publishService.js";
import { synchronizePublishedAssistant, type SyncServiceDependencies } from "./syncService.js";
import { getBrowserTestSession } from "../voiceAssistants/browserTestSession.js";
import type { RuntimeCatalog, RuntimeCatalogPreset } from "./types.js";
import type { VoiceArtifactPolicy } from "../voice/providers/vapi/artifactPolicy.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import type { Clock, VoiceAssistantInput, VoiceAssistantResult, VoiceAssistantDeleteResult } from "../voice/types.js";

// ─── Tripwires ─────────────────────────────────────────────────────────────

const tripwire = { fetch: 0, XMLHttpRequest: 0, WebSocket: 0 };
const globalAny = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};

beforeAll(() => {
  (["fetch", "XMLHttpRequest", "WebSocket"] as const).forEach((name) => {
    originals[name] = globalAny[name];
    globalAny[name] = function trip(): never {
      tripwire[name] += 1;
      throw new Error(`AR-001V.1 tripwire: ${name} was invoked by a test that must never touch the network`);
    };
  });
});

afterAll(() => {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalAny[name];
    else globalAny[name] = value;
  }
  expect(tripwire).toEqual({ fetch: 0, XMLHttpRequest: 0, WebSocket: 0 });
});

// ─── Environment isolation ─────────────────────────────────────────────────

const ENV_VARS = [
  VOICE_PUBLISH_ENABLED_ENV_VAR,
  VOICE_SYNC_ENABLED_ENV_VAR,
  VOICE_BROWSER_TEST_ENABLED_ENV_VAR,
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_VARS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_VARS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FIRM_ID = 7;
const OTHER_FIRM_ID = 8;
const ASSISTANT_ID = 42;
const PROVIDER_ASSISTANT_ID = "prov-xyz-789";
const FIXED_NOW = new Date("2026-08-29T00:00:00.000Z");
const fixedClock: Clock = { now: () => new Date(FIXED_NOW.getTime()) };

function catalog(): RuntimeCatalog {
  return {
    version: 1,
    presets: {
      "natural-balanced": {
        provider: "vapi",
        model: { provider: "p", model: "m" },
        voice: { provider: "p", voiceId: "v" },
        transcriber: { provider: "p", model: "t", language: "en" },
      } as RuntimeCatalogPreset,
    },
  } as RuntimeCatalog;
}

function config(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    prompt: {
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Hello.",
      systemInstructions: "Be helpful.",
    },
    voiceModel: { preset: "natural-balanced" },
  };
}

function publishedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSISTANT_ID,
    firmId: FIRM_ID,
    name: "Front Desk",
    templateKey: "blank",
    status: "published",
    provider: "vapi",
    providerAssistantId: PROVIDER_ASSISTANT_ID,
    config: config(),
    syncError: null,
    publishAttemptId: null,
    publishStartedAt: null,
    lastSyncedAt: FIXED_NOW,
    providerConfigHash: null,
    providerSyncAttemptId: null,
    providerSyncStartedAt: null,
    providerSyncError: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

/** Any invocation is a failure: neither verb may be reached while its flag is off. */
class ForbiddenProvider implements VoiceProvider {
  createCalls = 0;
  updateCalls = 0;
  async createAssistant(): Promise<VoiceAssistantResult> {
    this.createCalls += 1;
    throw new Error("createAssistant must not be reachable here");
  }
  async getAssistant(): Promise<VoiceAssistantResult> {
    throw new Error("not used");
  }
  async updateAssistant(_id: string, _input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    this.updateCalls += 1;
    throw new Error("updateAssistant must not be reachable here");
  }
  async deleteAssistant(): Promise<VoiceAssistantDeleteResult> {
    throw new Error("not used");
  }
}

/** Every repository method counts calls and refuses to mutate: a claim here is already a failure. */
function spyRepository() {
  const calls = { claimForPublish: 0, claimForProviderSync: 0, getPublishState: 0, findByIdForFirm: 0 };
  return {
    calls,
    publish: {
      claimForPublish: async () => {
        calls.claimForPublish += 1;
        return null;
      },
      finalizePublished: async () => null,
      recordPublishError: async () => null,
      recordPublishUncertain: async () => null,
      markStalePublishingUncertain: async () => null,
      getPublishState: async () => {
        calls.getPublishState += 1;
        return null;
      },
    } as unknown as PublishServiceDependencies["repository"],
    sync: {
      claimForProviderSync: async () => {
        calls.claimForProviderSync += 1;
        return null;
      },
      finalizeProviderSynced: async () => null,
      recordProviderSyncError: async () => null,
      releaseProviderSyncClaim: async () => null,
      markStaleProviderSyncFailed: async () => null,
      getPublishState: async () => {
        calls.getPublishState += 1;
        return null;
      },
    } as unknown as SyncServiceDependencies["repository"],
  };
}

function publishDeps(repo: PublishServiceDependencies["repository"], provider: VoiceProvider): PublishServiceDependencies {
  return {
    isEnabled: isVoicePublishEnabled,
    loadCatalog: catalog,
    loadArtifactPolicy: (): VoiceArtifactPolicy => "none",
    createProvider: () => provider,
    repository: repo,
    clock: fixedClock,
  };
}

function syncDeps(repo: SyncServiceDependencies["repository"], provider: VoiceProvider): SyncServiceDependencies {
  return {
    isEnabled: isVoiceSyncEnabled,
    loadCatalog: catalog,
    loadArtifactPolicy: (): VoiceArtifactPolicy => "none",
    createProvider: () => provider,
    repository: repo,
    clock: fixedClock,
  };
}

// ─── Defaults ──────────────────────────────────────────────────────────────

describe("every voice capability defaults to false", () => {
  it("is false when the variable is unset", () => {
    expect(isVoicePublishEnabled()).toBe(false);
    expect(isVoiceSyncEnabled()).toBe(false);
    expect(isVoiceBrowserTestEnabled()).toBe(false);
  });

  it("accepts only the exact literal true — every near-miss stays false", () => {
    for (const value of ["", " ", "TRUE", "True", " true ", "1", "yes", "on", "false", "0"]) {
      for (const key of ENV_VARS) process.env[key] = value;
      expect(isVoicePublishEnabled()).toBe(false);
      expect(isVoiceSyncEnabled()).toBe(false);
      expect(isVoiceBrowserTestEnabled()).toBe(false);
    }
  });

  it("uses three distinct variable names", () => {
    expect(new Set(ENV_VARS).size).toBe(3);
    expect(VOICE_PUBLISH_ENABLED_ENV_VAR).toBe("VOICE_PUBLISH_ENABLED");
    expect(VOICE_SYNC_ENABLED_ENV_VAR).toBe("VOICE_SYNC_ENABLED");
    expect(VOICE_BROWSER_TEST_ENABLED_ENV_VAR).toBe("VOICE_BROWSER_TEST_ENABLED");
  });
});

// ─── The four meaningful publish/sync combinations ─────────────────────────

describe("publish and synchronization are independent", () => {
  it("sync on, publish off: the update path is permitted and publishing is refused", async () => {
    process.env[VOICE_SYNC_ENABLED_ENV_VAR] = "true";
    const repo = spyRepository();
    const provider = new ForbiddenProvider();

    const published = await publishAssistant(FIRM_ID, ASSISTANT_ID, publishDeps(repo.publish, provider));
    expect(published.ok).toBe(false);
    if (!published.ok) expect(published.error.code).toBe("publish_disabled");
    // Refused before the claim: publishing is not merely rejected later, it
    // never reaches the state machine.
    expect(repo.calls.claimForPublish).toBe(0);

    // The synchronization path is permitted to proceed as far as its claim.
    const synced = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, syncDeps(repo.sync, provider));
    expect(repo.calls.claimForProviderSync).toBe(1);
    expect(synced.ok).toBe(false); // the spy repository grants no claim
    if (!synced.ok) expect(synced.error.code).not.toBe("sync_disabled");

    expect(provider.createCalls).toBe(0);
    expect(provider.updateCalls).toBe(0);
  });

  it("publish on, sync off: synchronization is refused before any claim or provider construction", async () => {
    process.env[VOICE_PUBLISH_ENABLED_ENV_VAR] = "true";
    const repo = spyRepository();
    const provider = new ForbiddenProvider();

    const synced = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, syncDeps(repo.sync, provider));
    expect(synced.ok).toBe(false);
    if (!synced.ok) expect(synced.error.code).toBe("sync_disabled");
    expect(repo.calls.claimForProviderSync).toBe(0);
    expect(repo.calls.getPublishState).toBe(0);
    expect(provider.updateCalls).toBe(0);

    // Publishing itself still reaches its own claim.
    await publishAssistant(FIRM_ID, ASSISTANT_ID, publishDeps(repo.publish, provider));
    expect(repo.calls.claimForPublish).toBe(1);
  });

  it("both off: neither mutation is permitted", async () => {
    const repo = spyRepository();
    const provider = new ForbiddenProvider();

    const published = await publishAssistant(FIRM_ID, ASSISTANT_ID, publishDeps(repo.publish, provider));
    const synced = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, syncDeps(repo.sync, provider));

    expect(published.ok).toBe(false);
    expect(synced.ok).toBe(false);
    if (!published.ok) expect(published.error.code).toBe("publish_disabled");
    if (!synced.ok) expect(synced.error.code).toBe("sync_disabled");
    expect(repo.calls.claimForPublish).toBe(0);
    expect(repo.calls.claimForProviderSync).toBe(0);
    expect(provider.createCalls).toBe(0);
    expect(provider.updateCalls).toBe(0);
  });

  it("both on: each path still reaches only its own verb", async () => {
    process.env[VOICE_PUBLISH_ENABLED_ENV_VAR] = "true";
    process.env[VOICE_SYNC_ENABLED_ENV_VAR] = "true";
    const repo = spyRepository();
    const provider = new ForbiddenProvider();

    await publishAssistant(FIRM_ID, ASSISTANT_ID, publishDeps(repo.publish, provider));
    await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, syncDeps(repo.sync, provider));

    expect(repo.calls.claimForPublish).toBe(1);
    expect(repo.calls.claimForProviderSync).toBe(1);
    expect(provider.createCalls).toBe(0);
    expect(provider.updateCalls).toBe(0);
  });

  it("a crafted request cannot bypass the server flag — the client has no say in it", async () => {
    const repo = spyRepository();
    const provider = new ForbiddenProvider();

    // The service takes exactly two caller-supplied values, both server-side:
    // the authenticated firm id and the route id. There is no request body, no
    // header, and no dependency a browser can influence.
    for (const [firm, assistant] of [
      [FIRM_ID, ASSISTANT_ID],
      [OTHER_FIRM_ID, ASSISTANT_ID],
      [FIRM_ID, 999999],
    ] as const) {
      const result = await synchronizePublishedAssistant(firm, assistant, syncDeps(repo.sync, provider));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("sync_disabled");
    }
    expect(repo.calls.claimForProviderSync).toBe(0);
    expect(provider.updateCalls).toBe(0);
  });
});

// ─── Browser-test session boundary ─────────────────────────────────────────

describe("browser-test session metadata", () => {
  function sessionDeps(row: unknown, spy: { count: number }) {
    return {
      isEnabled: isVoiceBrowserTestEnabled,
      findByIdForFirm: async (firmId: number, id: number) => {
        spy.count += 1;
        const r = row as { firmId: number; id: number } | null;
        if (!r || r.firmId !== firmId || r.id !== id) return null;
        return row as never;
      },
    };
  }

  it("is denied while the server flag is false, without even reading the row", async () => {
    const spy = { count: 0 };
    const result = await getBrowserTestSession(FIRM_ID, ASSISTANT_ID, sessionDeps(publishedRow(), spy));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("browser_test_disabled");
    // Nothing was read, so a crafted request cannot even probe existence.
    expect(spy.count).toBe(0);
  });

  it("is denied cross-firm, indistinguishably from a nonexistent assistant", async () => {
    process.env[VOICE_BROWSER_TEST_ENABLED_ENV_VAR] = "true";
    const spy = { count: 0 };

    const crossFirm = await getBrowserTestSession(OTHER_FIRM_ID, ASSISTANT_ID, sessionDeps(publishedRow(), spy));
    const missing = await getBrowserTestSession(FIRM_ID, 999999, sessionDeps(publishedRow(), spy));

    expect(crossFirm.ok).toBe(false);
    expect(missing.ok).toBe(false);
    if (!crossFirm.ok && !missing.ok) {
      expect(crossFirm.error.code).toBe("assistant_not_found");
      expect(crossFirm.error).toEqual(missing.error);
    }
  });

  it("fails closed for an unpublished, unlinked, or non-vapi assistant", async () => {
    process.env[VOICE_BROWSER_TEST_ENABLED_ENV_VAR] = "true";
    const spy = { count: 0 };

    const cases: Array<[Record<string, unknown>, string]> = [
      [{ status: "draft", provider: null, providerAssistantId: null }, "assistant_not_published"],
      [{ provider: null }, "provider_link_missing"],
      [{ provider: "   " }, "provider_link_missing"],
      [{ provider: "other-provider" }, "unsupported_provider"],
      [{ providerAssistantId: null }, "provider_link_missing"],
      [{ providerAssistantId: "   " }, "provider_link_missing"],
    ];

    for (const [overrides, expected] of cases) {
      const result = await getBrowserTestSession(FIRM_ID, ASSISTANT_ID, sessionDeps(publishedRow(overrides), spy));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(expected);
    }
  });

  it("is the ONLY response shape in the server that carries a provider assistant id", () => {
    // A source-level contract, because these DTOs are what every route hands
    // to a browser. Each interface body is read on its own so a mention
    // elsewhere in the file — a comment, a repository call, a persisted row —
    // cannot satisfy or break the check.
    const body = (file: string, iface: string): string => {
      const src = readFileSync(path.join(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const start = src.indexOf(`export interface ${iface}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = src.indexOf("}", start);
      return src.slice(start, end);
    };

    expect(body("../voiceAssistants/service.ts", "AssistantDto")).not.toContain("providerAssistantId");
    expect(body("../voiceAssistants/service.ts", "AssistantDto")).toContain("providerLinked");

    expect(body("./publishService.ts", "PublishedAssistantDto")).not.toContain("providerAssistantId");
    expect(body("./publishService.ts", "PublishedAssistantDto")).toContain("providerLinked");

    expect(body("./syncService.ts", "SynchronizedAssistantDto")).not.toContain("providerAssistantId");

    // The one permitted place.
    expect(body("../voiceAssistants/browserTestSession.ts", "BrowserTestSessionDto")).toContain(
      "providerAssistantId",
    );
  });

  it("returns exactly two fields and nothing else when everything checks out", async () => {
    process.env[VOICE_BROWSER_TEST_ENABLED_ENV_VAR] = "true";
    const spy = { count: 0 };

    const result = await getBrowserTestSession(FIRM_ID, ASSISTANT_ID, sessionDeps(publishedRow(), spy));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.session).sort()).toEqual(["provider", "providerAssistantId"]);
    expect(result.session.provider).toBe("vapi");
    expect(result.session.providerAssistantId).toBe(PROVIDER_ASSISTANT_ID);

    // No prompt, no config, no key, no firm id, no database field, no publish
    // metadata, and nothing that could seed a transient assistant.
    const serialized = JSON.stringify(result.session);
    for (const forbidden of ["Be helpful", "Hello.", "natural-balanced", "firmId", "createdAt", "status", "config", "publish"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
