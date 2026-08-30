/**
 * AR-001V — provider-safe synchronization-service harness.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * This drives the real `synchronizePublishedAssistant()` — the production
 * implementation, unmodified — through every branch it has, using only the
 * explicit `SyncServiceDependencies` seam it already exposes. Nothing here
 * contacts a provider, reads a credential, opens a socket, or touches a
 * database, and the tripwires below assert that rather than assume it.
 *
 * `@workspace/db` is mocked because importing it evaluates lib/db/src/index.ts,
 * which throws without DATABASE_URL and otherwise constructs a pg.Pool at
 * module scope. syncService reaches it transitively through
 * voiceAssistants/repository.ts, for the default dependency object these tests
 * never use.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Hoisted above every import: the real module must never evaluate.
vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  synchronizePublishedAssistant,
  buildSyncProviderInput,
  type SyncServiceDependencies,
  type SyncRepositoryDependency,
} from "./syncService.js";
import { computeProviderPayloadHash, canonicalJsonStringify } from "./providerPayloadHash.js";
import { PROVIDER_SYNC_ERROR_CODES } from "./syncErrors.js";
import type { RuntimeCatalog, RuntimeCatalogPreset } from "./types.js";
import type { VoiceArtifactPolicy } from "../voice/providers/vapi/artifactPolicy.js";
import { VoiceProviderError } from "../voice/errors.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import type { Clock, VoiceAssistantInput, VoiceAssistantResult, VoiceAssistantDeleteResult } from "../voice/types.js";
import { STALE_PROVIDER_SYNC_THRESHOLD_MS } from "../voiceAssistants/repository.js";
import { deriveProviderSyncState } from "../voiceAssistants/providerSyncState.js";

// ─── Tripwires ─────────────────────────────────────────────────────────────

const tripwire = { fetch: 0, XMLHttpRequest: 0, WebSocket: 0, sendBeacon: 0 };
const globalAny = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};

beforeAll(() => {
  (["fetch", "XMLHttpRequest", "WebSocket", "sendBeacon"] as const).forEach((name) => {
    originals[name] = globalAny[name];
    globalAny[name] = function trip(): never {
      tripwire[name] += 1;
      throw new Error(`AR-001V tripwire: ${name} was invoked by a test that must never touch the network`);
    };
  });
});

afterAll(() => {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalAny[name];
    else globalAny[name] = value;
  }
  expect(tripwire).toEqual({ fetch: 0, XMLHttpRequest: 0, WebSocket: 0, sendBeacon: 0 });
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FIRM_ID = 7;
const OTHER_FIRM_ID = 8;
const ASSISTANT_ID = 42;
const PROVIDER_ASSISTANT_ID = "prov-abc-123";
const FIXED_NOW = new Date("2026-08-29T00:00:00.000Z");
const fixedClock: Clock = { now: () => new Date(FIXED_NOW.getTime()) };

function catalogPreset(): RuntimeCatalogPreset {
  return {
    provider: "vapi",
    model: { provider: "test-model-provider", model: "test-model" },
    voice: { provider: "test-voice-provider", voiceId: "test-voice" },
    transcriber: { provider: "test-transcriber-provider", model: "test-transcriber", language: "en" },
  } as RuntimeCatalogPreset;
}

function catalog(): RuntimeCatalog {
  return { version: 1, presets: { "natural-balanced": catalogPreset() } } as RuntimeCatalog;
}

function validConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    prompt: {
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Thanks for calling.",
      systemInstructions: "Answer politely and take a message.",
    },
    voiceModel: { preset: "natural-balanced" },
    ...extra,
  };
}

interface Row {
  id: number;
  firmId: number;
  name: string;
  templateKey: string;
  status: string;
  provider: string | null;
  providerAssistantId: string | null;
  config: Record<string, unknown>;
  syncError: string | null;
  publishAttemptId: string | null;
  publishStartedAt: Date | null;
  lastSyncedAt: Date | null;
  providerConfigHash: string | null;
  providerSyncAttemptId: string | null;
  providerSyncStartedAt: Date | null;
  providerSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: ASSISTANT_ID,
    firmId: FIRM_ID,
    name: "Front Desk",
    templateKey: "blank",
    status: "published",
    provider: "vapi",
    providerAssistantId: PROVIDER_ASSISTANT_ID,
    config: validConfig(),
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

/**
 * In-memory stand-in that reproduces each real predicate as a guard, so a
 * service bug that relies on a looser predicate fails here too.
 */
class FakeSyncRepository implements SyncRepositoryDependency {
  readonly rows = new Map<string, Row>();
  claimAttempts = 0;
  private counter = 0;

  constructor(seed: Row[]) {
    for (const r of seed) this.rows.set(`${r.firmId}:${r.id}`, r);
  }

  private find(firmId: number, id: number): Row | undefined {
    return this.rows.get(`${firmId}:${id}`);
  }

  claimForProviderSync = async (firmId: number, id: number) => {
    this.claimAttempts += 1;
    const r = this.find(firmId, id);
    if (!r) return null;
    if (r.status !== "published") return null;
    if (r.provider !== "vapi") return null;
    if (r.providerAssistantId === null || r.providerAssistantId.trim() === "") return null;
    if (r.publishAttemptId !== null) return null;
    // AR-001V.1: mirrors the real predicate — a free row, or one whose claim
    // is already older than the stale threshold, may be claimed. A fresh claim
    // is still exclusive.
    if (r.providerSyncAttemptId !== null) {
      const startedAt = r.providerSyncStartedAt;
      const stale =
        startedAt !== null && FIXED_NOW.getTime() - startedAt.getTime() >= STALE_PROVIDER_SYNC_THRESHOLD_MS;
      if (!stale) return null;
    }

    this.counter += 1;
    const providerSyncAttemptId = `attempt-${this.counter}`;
    r.providerSyncAttemptId = providerSyncAttemptId;
    r.providerSyncStartedAt = FIXED_NOW;
    return { assistant: r as never, providerSyncAttemptId };
  };

  finalizeProviderSynced = async (firmId: number, id: number, attemptId: string, hash: string) => {
    const r = this.find(firmId, id);
    if (!r || r.providerSyncAttemptId !== attemptId) return null;
    r.providerConfigHash = hash;
    r.providerSyncError = null;
    r.providerSyncAttemptId = null;
    r.providerSyncStartedAt = null;
    r.lastSyncedAt = FIXED_NOW;
    return r as never;
  };

  recordProviderSyncError = async (firmId: number, id: number, attemptId: string, code: string) => {
    const r = this.find(firmId, id);
    if (!r || r.providerSyncAttemptId !== attemptId) return null;
    r.providerSyncError = code;
    r.providerSyncAttemptId = null;
    r.providerSyncStartedAt = null;
    return r as never;
  };

  releaseProviderSyncClaim = async (firmId: number, id: number, attemptId: string) => {
    const r = this.find(firmId, id);
    if (!r || r.providerSyncAttemptId !== attemptId) return null;
    r.providerSyncError = null;
    r.providerSyncAttemptId = null;
    r.providerSyncStartedAt = null;
    return r as never;
  };

  markStaleProviderSyncFailed = async (firmId: number, id: number) => {
    const r = this.find(firmId, id);
    if (!r || r.providerSyncAttemptId === null) return null;
    r.providerSyncError = "sync_interrupted";
    r.providerSyncAttemptId = null;
    r.providerSyncStartedAt = null;
    return r as never;
  };

  getPublishState = async (firmId: number, id: number) => (this.find(firmId, id) ?? null) as never;
}

/** Records every provider interaction. `createAssistant` throws: reaching it at all is the failure. */
class RecordingProvider implements VoiceProvider {
  updates: Array<{ providerAssistantId: string; input: VoiceAssistantInput }> = [];
  createCalls = 0;
  constructor(private readonly failure?: unknown) {}

  async createAssistant(): Promise<VoiceAssistantResult> {
    this.createCalls += 1;
    throw new Error("AR-001V: createAssistant must never be reached from the synchronization path");
  }
  async getAssistant(): Promise<VoiceAssistantResult> {
    throw new Error("not used");
  }
  async updateAssistant(providerAssistantId: string, input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    this.updates.push({ providerAssistantId, input });
    if (this.failure !== undefined) throw this.failure;
    return {
      provider: "vapi",
      providerAssistantId,
      config: input.config,
      metadata: {},
    } as VoiceAssistantResult;
  }
  async deleteAssistant(): Promise<VoiceAssistantDeleteResult> {
    throw new Error("not used");
  }
}

function deps(overrides: {
  repository: SyncRepositoryDependency;
  provider?: VoiceProvider;
  isEnabled?: () => boolean;
  loadCatalog?: () => RuntimeCatalog;
  loadArtifactPolicy?: () => VoiceArtifactPolicy;
  clock?: Clock;
}): SyncServiceDependencies {
  const provider = overrides.provider ?? new RecordingProvider();
  return {
    isEnabled: overrides.isEnabled ?? (() => true),
    loadCatalog: overrides.loadCatalog ?? catalog,
    loadArtifactPolicy: overrides.loadArtifactPolicy ?? ((): VoiceArtifactPolicy => "none"),
    createProvider: () => provider,
    repository: overrides.repository,
    clock: overrides.clock ?? fixedClock,
  };
}

function hashOf(r: Row): string {
  return computeProviderPayloadHash(buildSyncProviderInput(r as never, catalog()), "none");
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1 / 7. The published path updates, and only ever updates ──────────────

describe("published assistants are updated, never re-created", () => {
  it("calls updateAssistant exactly once with the persisted provider id", async () => {
    const repo = new FakeSyncRepository([row()]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(true);
    expect(provider.updates).toHaveLength(1);
    expect(provider.updates[0]!.providerAssistantId).toBe(PROVIDER_ASSISTANT_ID);
    expect(provider.createCalls).toBe(0);
  });

  it("never references createAssistant in the synchronization module's executable code", () => {
    // Comments are stripped first: the module's own documentation explains why
    // createAssistant is absent, and prose must not satisfy or fail this check.
    const source = readFileSync(path.join(__dirname, "syncService.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code.includes("createAssistant")).toBe(false);
    // And the executable code does reach updateAssistant.
    expect(code.includes("updateAssistant(")).toBe(true);
  });

  it("leaves the draft/error publish path untouched — a draft cannot be synchronized", async () => {
    const repo = new FakeSyncRepository([row({ status: "draft", provider: null, providerAssistantId: null })]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("assistant_not_published");
    expect(provider.updates).toHaveLength(0);
    expect(provider.createCalls).toBe(0);
  });
});

// ─── 3 / 4 / 5 / 6. Fail-closed eligibility ────────────────────────────────

describe("eligibility fails closed", () => {
  it("rejects cross-firm access as not-found and makes no provider request", async () => {
    const repo = new FakeSyncRepository([row()]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(
      OTHER_FIRM_ID,
      ASSISTANT_ID,
      deps({ repository: repo, provider }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("assistant_not_found");
    expect(provider.updates).toHaveLength(0);
  });

  it("refuses a published row whose provider assistant id is missing or blank", async () => {
    for (const value of [null, "", "   "]) {
      const repo = new FakeSyncRepository([row({ providerAssistantId: value })]);
      const provider = new RecordingProvider();
      const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("provider_link_missing");
      expect(provider.updates).toHaveLength(0);
    }
  });

  it("refuses an unsupported provider", async () => {
    const repo = new FakeSyncRepository([row({ provider: "some-other-provider" })]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_provider");
    expect(provider.updates).toHaveLength(0);
  });

  it("refuses a preset that is absent from the runtime catalog, and records a safe error", async () => {
    const repo = new FakeSyncRepository([row({ config: validConfig({ voiceModel: { preset: "fast-response" } }) })]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("unsupported_preset");
    expect(provider.updates).toHaveLength(0);
    const stored = repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!;
    expect(stored.providerSyncError).toBe("unsupported_preset");
    expect(stored.providerSyncAttemptId).toBeNull();
  });

  it("makes no provider request at all while the server switch is off", async () => {
    const repo = new FakeSyncRepository([row()]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({ repository: repo, provider, isEnabled: () => false }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("sync_disabled");
    expect(repo.claimAttempts).toBe(0);
    expect(provider.updates).toHaveLength(0);
  });
});

// ─── 7. Deterministic payload mapping ──────────────────────────────────────

describe("provider payload mapping is deterministic", () => {
  it("produces the same digest regardless of property order in the persisted config", () => {
    const a = row({
      config: {
        schemaVersion: 1,
        voiceModel: { preset: "natural-balanced" },
        prompt: {
          systemInstructions: "Answer politely and take a message.",
          firstMessage: "Thanks for calling.",
          firstMessageMode: "assistant-speaks-first",
        },
      },
    });
    const b = row({ config: validConfig() });

    expect(hashOf(a)).toBe(hashOf(b));
  });

  it("changes the digest when a provider-relevant field changes", () => {
    const before = row();
    const after = row({
      config: validConfig({
        prompt: {
          firstMessageMode: "assistant-speaks-first",
          firstMessage: "Thanks for calling.",
          systemInstructions: "A materially different instruction.",
        },
      }),
    });

    expect(hashOf(before)).not.toBe(hashOf(after));
  });

  it("changes the digest when the artifact policy changes", () => {
    const input = buildSyncProviderInput(row() as never, catalog());
    expect(computeProviderPayloadHash(input, "none")).not.toBe(computeProviderPayloadHash(input, "full"));
  });

  it("canonicalizes objects by key and preserves array order", () => {
    expect(canonicalJsonStringify({ b: 1, a: 2 } as never)).toBe('{"a":2,"b":1}');
    expect(canonicalJsonStringify([2, 1] as never)).toBe("[2,1]");
  });
});

// ─── 8 / 12. Idempotence, and local-only edits ─────────────────────────────

describe("no provider request when nothing provider-relevant changed", () => {
  it("reports success without contacting the provider when the digest already matches", async () => {
    const seeded = row();
    seeded.providerConfigHash = hashOf(seeded);
    const repo = new FakeSyncRepository([seeded]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assistant.providerRequestSent).toBe(false);
      expect(result.assistant.providerConfigSynchronized).toBe(true);
    }
    expect(provider.updates).toHaveLength(0);
    expect(repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!.providerSyncAttemptId).toBeNull();
  });

  it("treats a purely local edit as already synchronized — Setup/Analysis/Advanced never reach the provider", async () => {
    const seeded = row();
    seeded.providerConfigHash = hashOf(seeded);
    // Exactly the edit the builder makes when only non-provider fields change.
    seeded.config = validConfig({
      setup: { assistantName: "Renamed in the builder", industry: "HVAC" },
      analysis: { callSummaryEnabled: true },
      advanced: { timeoutSeconds: "30" },
    });
    seeded.updatedAt = new Date(FIXED_NOW.getTime() + 60_000);

    expect(hashOf(seeded)).toBe(seeded.providerConfigHash);

    const repo = new FakeSyncRepository([seeded]);
    const provider = new RecordingProvider();
    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(true);
    expect(provider.updates).toHaveLength(0);
    expect(deriveProviderSyncState(seeded as never, { loadCatalog: catalog, loadArtifactPolicy: () => "none", clock: fixedClock })).toBe(
      "synchronized",
    );
  });
});

// ─── 9. Concurrency ────────────────────────────────────────────────────────

describe("concurrent submissions", () => {
  it("produces at most one provider update for two simultaneous calls", async () => {
    const repo = new FakeSyncRepository([row()]);
    const provider = new RecordingProvider();
    const d = deps({ repository: repo, provider });

    const [first, second] = await Promise.all([
      synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, d),
      synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, d),
    ]);

    expect(provider.updates).toHaveLength(1);
    const outcomes = [first.ok, second.ok].sort();
    expect(outcomes).toEqual([false, true]);
    const loser = first.ok ? second : first;
    if (!loser.ok) expect(loser.error.code).toBe("sync_in_progress");
  });

  it("reports sync_in_progress rather than starting a second update while one is claimed", async () => {
    const repo = new FakeSyncRepository([row({ providerSyncAttemptId: "attempt-live", providerSyncStartedAt: FIXED_NOW })]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("sync_in_progress");
    expect(provider.updates).toHaveLength(0);
  });

  it("lets a later explicit attempt atomically reclaim a stale claim and complete", async () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PROVIDER_SYNC_THRESHOLD_MS - 1000);
    const repo = new FakeSyncRepository([
      row({ providerSyncAttemptId: "attempt-abandoned", providerSyncStartedAt: stale }),
    ]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    // Recovery stays passive: nothing swept this row in the background, the
    // next deliberate attempt simply took the claim over.
    expect(result.ok).toBe(true);
    expect(provider.updates).toHaveLength(1);
    const stored = repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!;
    expect(stored.providerSyncAttemptId).toBeNull();
    expect(stored.providerSyncError).toBeNull();
    expect(stored.providerConfigHash).toBe(hashOf(row()));
  });

  it("still refuses to start a second update while a FRESH claim is held", async () => {
    const fresh = new Date(FIXED_NOW.getTime() - 1000);
    const repo = new FakeSyncRepository([row({ providerSyncAttemptId: "attempt-live", providerSyncStartedAt: fresh })]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("sync_in_progress");
    expect(provider.updates).toHaveLength(0);
  });
});

// ─── 10 / 11. Failure preserves state; success is atomic ───────────────────

describe("failure and success transitions", () => {
  const cases: Array<{ name: string; failure: unknown; expected: string }> = [
    { name: "authentication", failure: new VoiceProviderError("AUTHENTICATION_FAILED", "x"), expected: "provider_authentication_failed" },
    { name: "rate limit", failure: new VoiceProviderError("RATE_LIMITED", "x"), expected: "provider_rate_limited" },
    { name: "rejection", failure: new VoiceProviderError("VALIDATION_FAILED", "x"), expected: "provider_request_rejected" },
    { name: "timeout", failure: new VoiceProviderError("TIMEOUT", "x"), expected: "provider_timeout" },
    { name: "network", failure: new VoiceProviderError("NETWORK_ERROR", "x"), expected: "provider_network_error" },
    { name: "unclassified throw", failure: new Error("boom"), expected: "provider_result_uncertain" },
  ];

  for (const c of cases) {
    it(`preserves the last synchronized digest and records a safe code on ${c.name} failure`, async () => {
      const seeded = row({ providerConfigHash: "a".repeat(64) });
      const repo = new FakeSyncRepository([seeded]);
      const provider = new RecordingProvider(c.failure);

      const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

      expect(result.ok).toBe(false);
      const stored = repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!;
      // The working provider version is preserved: the digest never moves on failure.
      expect(stored.providerConfigHash).toBe("a".repeat(64));
      expect(stored.providerSyncError).toBe(c.expected);
      expect(PROVIDER_SYNC_ERROR_CODES as readonly string[]).toContain(stored.providerSyncError!);
      expect(stored.providerSyncAttemptId).toBeNull();
      expect(stored.providerSyncStartedAt).toBeNull();
      // The publish lifecycle is untouched by a failed update.
      expect(stored.status).toBe("published");
      expect(stored.provider).toBe("vapi");
      expect(stored.providerAssistantId).toBe(PROVIDER_ASSISTANT_ID);
      expect(stored.syncError).toBeNull();
    });
  }

  it("stamps the digest, clears the error and the claim together on success", async () => {
    const seeded = row({ providerSyncError: "provider_timeout" });
    const repo = new FakeSyncRepository([seeded]);
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(true);
    const stored = repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!;
    expect(stored.providerConfigHash).toBe(hashOf(seeded));
    expect(stored.providerSyncError).toBeNull();
    expect(stored.providerSyncAttemptId).toBeNull();
    expect(stored.providerSyncStartedAt).toBeNull();
    expect(stored.lastSyncedAt).toEqual(FIXED_NOW);
  });

  it("does not stamp the digest when the provider succeeded but finalization failed", async () => {
    const seeded = row();
    const repo = new FakeSyncRepository([seeded]);
    repo.finalizeProviderSynced = async () => null;
    const provider = new RecordingProvider();

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("local_finalize_failed");
    expect(provider.updates).toHaveLength(1);
    const stored = repo.rows.get(`${FIRM_ID}:${ASSISTANT_ID}`)!;
    expect(stored.providerConfigHash).toBeNull();
    expect(stored.providerSyncError).toBe("local_finalize_failed");
  });
});

// ─── 14. Nothing sensitive escapes ─────────────────────────────────────────

describe("responses and recorded state carry nothing sensitive", () => {
  it("returns no provider assistant id, credential, config, or digest on success", async () => {
    const repo = new FakeSyncRepository([row()]);
    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.assistant);
    expect(serialized).not.toContain(PROVIDER_ASSISTANT_ID);
    expect(serialized).not.toContain("Answer politely");
    expect(serialized).not.toContain("Thanks for calling");
    expect(Object.keys(result.assistant).sort()).toEqual(
      ["id", "lastSyncedAt", "providerConfigSynchronized", "providerRequestSent", "status"].sort(),
    );
  });

  it("returns only static messages and allowlisted codes on failure", async () => {
    const repo = new FakeSyncRepository([row()]);
    const provider = new RecordingProvider(
      new VoiceProviderError("VALIDATION_FAILED", "raw provider text with prov-abc-123 and Bearer sk-secret"),
    );

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository: repo, provider }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const serialized = JSON.stringify(result.error);
    expect(serialized).not.toContain(PROVIDER_ASSISTANT_ID);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("sk-secret");
    expect(result.error.retryable).toBe(false);
  });

  it("passes only safe identifiers to the logger", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const seeded = row();
    const repo = new FakeSyncRepository([seeded]);
    repo.finalizeProviderSynced = async () => null;
    repo.recordProviderSyncError = async () => null;

    const result = await synchronizePublishedAssistant(FIRM_ID, ASSISTANT_ID, {
      ...deps({ repository: repo }),
      logger: (_event, meta) => {
        seen.push(meta);
      },
    });

    expect(result.ok).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
    for (const meta of seen) {
      expect(Object.keys(meta).sort()).toEqual(["assistantId", "firmId"]);
    }
  });
});

// ─── 15/16 support: the derived state never over-claims ────────────────────

describe("derived synchronization state never over-claims", () => {
  const stateDeps = { loadCatalog: catalog, loadArtifactPolicy: (): VoiceArtifactPolicy => "none", clock: fixedClock };

  it("reports local_changes when no digest was ever recorded", () => {
    expect(deriveProviderSyncState(row() as never, stateDeps)).toBe("local_changes");
  });

  it("reports local_changes when the digest differs", () => {
    expect(deriveProviderSyncState(row({ providerConfigHash: "b".repeat(64) }) as never, stateDeps)).toBe("local_changes");
  });

  it("reports synchronizing while a claim is held", () => {
    const r = row({ providerSyncAttemptId: "attempt-live", providerSyncStartedAt: FIXED_NOW });
    expect(deriveProviderSyncState(r as never, stateDeps)).toBe("synchronizing");
  });

  it("reports sync_failed when an error is recorded and the digest still differs", () => {
    const r = row({ providerSyncError: "provider_timeout" });
    expect(deriveProviderSyncState(r as never, stateDeps)).toBe("sync_failed");
  });

  it("reports not_published for any unpublished row", () => {
    for (const status of ["draft", "publishing", "error", "publish_uncertain"]) {
      expect(deriveProviderSyncState(row({ status }) as never, stateDeps)).toBe("not_published");
    }
  });

  it("reports interrupted for a claim older than the bounded threshold", () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PROVIDER_SYNC_THRESHOLD_MS);
    const r = row({ providerSyncAttemptId: "attempt-abandoned", providerSyncStartedAt: stale });
    expect(deriveProviderSyncState(r as never, stateDeps)).toBe("interrupted");
  });

  it("reports synchronizing right up to the threshold and interrupted from it onward", () => {
    const justFresh = new Date(FIXED_NOW.getTime() - (STALE_PROVIDER_SYNC_THRESHOLD_MS - 1));
    const justStale = new Date(FIXED_NOW.getTime() - (STALE_PROVIDER_SYNC_THRESHOLD_MS + 1));
    expect(
      deriveProviderSyncState(
        row({ providerSyncAttemptId: "a", providerSyncStartedAt: justFresh }) as never,
        stateDeps,
      ),
    ).toBe("synchronizing");
    expect(
      deriveProviderSyncState(
        row({ providerSyncAttemptId: "a", providerSyncStartedAt: justStale }) as never,
        stateDeps,
      ),
    ).toBe("interrupted");
  });

  it("treats a claim with no start time as interrupted, never as in progress", () => {
    const r = row({ providerSyncAttemptId: "a", providerSyncStartedAt: null });
    expect(deriveProviderSyncState(r as never, stateDeps)).toBe("interrupted");
  });

  it("exposes no timestamp, provider id, payload, or internal error in the state itself", () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PROVIDER_SYNC_THRESHOLD_MS - 1);
    const state = deriveProviderSyncState(
      row({ providerSyncAttemptId: "attempt-abandoned", providerSyncStartedAt: stale }) as never,
      stateDeps,
    );
    expect(typeof state).toBe("string");
    expect(state).toBe("interrupted");
    expect(state).not.toContain(PROVIDER_ASSISTANT_ID);
  });

  it("never reports synchronized when the catalog cannot be read", () => {
    const seeded = row();
    seeded.providerConfigHash = hashOf(seeded);
    const broken = {
      loadCatalog: () => {
        throw new Error("catalog unreadable");
      },
      loadArtifactPolicy: (): VoiceArtifactPolicy => "none",
    };
    expect(deriveProviderSyncState(seeded as never, broken as never)).toBe("unknown");
  });
});
