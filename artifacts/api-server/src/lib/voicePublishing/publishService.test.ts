/**
 * AR-001A — provider-safe publish-service harness.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 * (collected automatically by vitest.config.ts `include: ["src/**\/*.test.ts"]`,
 * so no aggregate-test registration change is needed for this suite.)
 *
 * This drives the real `publishAssistant()` — the production implementation,
 * unmodified — through every branch it has, using only the explicit
 * `PublishServiceDependencies` seam it already exposes. Nothing here contacts a
 * provider, reads a credential, opens a socket, or touches a database.
 *
 * `@workspace/db` is mocked because importing it evaluates
 * `lib/db/src/index.ts`, which throws without DATABASE_URL and otherwise
 * constructs a `pg.Pool` at module scope. `publishService` reaches it
 * transitively through `voiceAssistants/repository.ts` (for the default
 * dependency object, which these tests never use). Mocking is what makes this
 * suite runnable with no database and no environment variable at all — the
 * alternative, setting a dummy DATABASE_URL, would still construct a pool.
 *
 * Deliberately NOT covered here, and not simulated: the frontend's 4-second
 * status poll, the `beforeunload` handlers, and the confirm-dialog double-submit
 * ref all live in `AssistantBuilder.tsx` and `useAssistants.ts`. They are React
 * behaviours; exercising them needs a renderer this workspace does not have.
 * What is covered below is the server contract those behaviours depend on.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Hoisted above every import: the real module must never evaluate.
vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { publishAssistant, type PublishServiceDependencies } from "./publishService.js";
import { buildPublishRouteError, type PublishRouteErrorCode } from "./publishHttpErrors.js";
import type { RuntimeCatalog, RuntimeCatalogPreset } from "./types.js";
import { parseVoiceArtifactPolicy, type VoiceArtifactPolicy } from "../voice/providers/vapi/artifactPolicy.js";
import { VoiceProviderError } from "../voice/errors.js";
import { FakeVoiceProvider } from "../voice/FakeVoiceProvider.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import type { Clock } from "../voice/types.js";
import { STALE_PUBLISHING_THRESHOLD_MS } from "../voiceAssistants/repository.js";
import { FakePublishRepository, type FakeAssistantSeed } from "./testing/fakePublishRepository.js";
import { ScriptedVoiceProvider } from "./testing/scriptedVoiceProvider.js";

// ─── Tripwires ─────────────────────────────────────────────────────────────
//
// Absence of credentials is not proof of inaction, so every escape route this
// process actually has is instrumented and asserted to have been untouched.

const tripwire = {
  fetch: 0,
  XMLHttpRequest: 0,
  WebSocket: 0,
  RTCPeerConnection: 0,
  getUserMedia: 0,
  sendBeacon: 0,
};

const globalAny = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};

function installTripwire(name: keyof typeof tripwire): void {
  originals[name] = globalAny[name];
  globalAny[name] = function trip(): never {
    tripwire[name] += 1;
    throw new Error(`AR-001A tripwire: ${name} was invoked by a test that must never touch the network or media`);
  };
}

beforeAll(() => {
  (["fetch", "XMLHttpRequest", "WebSocket", "RTCPeerConnection", "sendBeacon"] as const).forEach(installTripwire);
});

afterAll(() => {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalAny[name];
    else globalAny[name] = value;
  }
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FIRM_ID = 7;
const OTHER_FIRM_ID = 8;
const ASSISTANT_ID = 42;
const FIXED_NOW = new Date("2026-08-25T00:00:00.000Z");

function catalogPreset(): RuntimeCatalogPreset {
  return {
    key: "natural-balanced",
    provider: "vapi",
    model: { provider: "test-model-provider", model: "test-model" },
    voice: { provider: "test-voice-provider", voiceId: "test-voice" },
    transcriber: { provider: "test-transcriber-provider", model: "test-transcriber", language: "en" },
  } as RuntimeCatalogPreset;
}

function catalog(): RuntimeCatalog {
  return {
    version: 1,
    presets: {
      "natural-balanced": catalogPreset(),
      "fast-response": { ...catalogPreset(), key: "fast-response" } as RuntimeCatalogPreset,
      "highest-intelligence": { ...catalogPreset(), key: "highest-intelligence" } as RuntimeCatalogPreset,
      "budget-friendly": { ...catalogPreset(), key: "budget-friendly" } as RuntimeCatalogPreset,
    },
  } as RuntimeCatalog;
}

function validConfig(preset = "natural-balanced"): Record<string, unknown> {
  return {
    schemaVersion: 1,
    setup: { assistantName: "Front Desk" },
    prompt: {
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Thanks for calling Northside Dental.",
      systemInstructions: "Answer politely, confirm the caller's name, and take a message.",
    },
    voiceModel: { preset },
  };
}

const fixedClock: Clock = { now: () => new Date(FIXED_NOW.getTime()) };

function deps(overrides: {
  repository: FakePublishRepository;
  provider?: VoiceProvider;
  isEnabled?: () => boolean;
  loadCatalog?: () => RuntimeCatalog;
  loadArtifactPolicy?: () => VoiceArtifactPolicy;
  createProvider?: () => VoiceProvider;
  clock?: Clock;
}): PublishServiceDependencies {
  const provider = overrides.provider ?? new FakeVoiceProvider(fixedClock);
  return {
    isEnabled: overrides.isEnabled ?? (() => true),
    loadCatalog: overrides.loadCatalog ?? catalog,
    // AR-001G: the only policy approved for AR-001 staging.
    loadArtifactPolicy: overrides.loadArtifactPolicy ?? ((): VoiceArtifactPolicy => "none"),
    createProvider: overrides.createProvider ?? (() => provider),
    repository: overrides.repository,
    clock: overrides.clock ?? fixedClock,
  };
}

function seedDraft(extra: Partial<FakeAssistantSeed> = {}): FakeAssistantSeed {
  return { id: ASSISTANT_ID, firmId: FIRM_ID, status: "draft", config: validConfig(), ...extra };
}

afterEach(() => {
  for (const key of Object.keys(tripwire) as (keyof typeof tripwire)[]) {
    expect(tripwire[key], `${key} must never be invoked`).toBe(0);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe("publish route error contract", () => {
  // Enumerated from source: publishHttpErrors.ts PublishRouteErrorCode.
  const EXPECTED: Array<[PublishRouteErrorCode, number]> = [
    ["publish_disabled", 503],
    ["invalid_request", 400],
    ["assistant_not_found", 404],
    ["assistant_config_invalid", 422],
    ["unsupported_preset", 422],
    ["already_published", 409],
    ["publish_in_progress", 409],
    ["publish_uncertain", 409],
    ["publish_state_conflict", 409],
    ["provider_authentication_failed", 502],
    ["provider_rate_limited", 429],
    ["provider_request_rejected", 502],
    ["provider_timeout", 502],
    ["provider_network_error", 502],
    ["provider_result_uncertain", 502],
    ["local_finalize_failed", 502],
    ["unknown_publish_error", 502],
    ["internal_error", 500],
  ];

  it("defines exactly eighteen route error codes", () => {
    expect(EXPECTED).toHaveLength(18);
  });

  it.each(EXPECTED)("%s maps to HTTP %i and is never automatically retryable", (code, status) => {
    const error = buildPublishRouteError(code);
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(false);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message.length).toBeLessThanOrEqual(300);
  });

  it("never leaks a credential, host, prompt, firm id or attempt id in any message", () => {
    // Matches identifier leakage, not English prose: "A publish attempt for
    // this assistant is already in progress." is the intended copy for
    // publish_in_progress, and the word "attempt" in it is not an attempt id.
    for (const [code] of EXPECTED) {
      const { message } = buildPublishRouteError(code);
      expect(message, `${code} names a host or credential`).not.toMatch(
        /vapi\.ai|daily\.co|twilio|api[ _-]?key|apikey|bearer|authorization|postgres|firmId|firm_id|publishAttemptId|publish_attempt_id/i,
      );
      expect(message, `${code} embeds a UUID`).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      // No route message interpolates any numeric id — firm, assistant, or otherwise.
      expect(message, `${code} embeds a number`).not.toMatch(/\d/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("preconditions — nothing is claimed or called before configuration succeeds", () => {
  it("returns publish_disabled when the backend flag is off, without touching the repository", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, isEnabled: () => false }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    expect(repository.calls.claimForPublish).toBe(0);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  it("returns publish_disabled when the runtime catalog cannot be loaded", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        loadCatalog: () => {
          throw new Error("catalog missing");
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    expect(repository.calls.claimForPublish).toBe(0);
  });

  it("returns publish_disabled when provider configuration is missing", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        createProvider: () => {
          throw new Error("VAPI_API_KEY is not set");
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    expect(repository.calls.claimForPublish).toBe(0);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  // ── AR-001G: artifact policy is a pre-claim precondition ──────────────────

  it("causes no provider activity when the policy is missing and publishing is disabled", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    let policyReads = 0;
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        provider,
        isEnabled: () => false,
        loadArtifactPolicy: () => {
          policyReads += 1;
          return parseVoiceArtifactPolicy(undefined);
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    // The disabled flag short-circuits first, so the missing policy is not
    // even reached — and nothing at all is attempted.
    expect(policyReads).toBe(0);
    expect(repository.calls.claimForPublish).toBe(0);
    expect(provider.createCallCount).toBe(0);
  });

  it("returns publish_disabled when the artifact policy is missing", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        provider,
        loadArtifactPolicy: () => {
          throw new VoiceProviderError("NOT_CONFIGURED", "VOICE_ARTIFACT_POLICY is not set.");
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    // The whole point: no claim, no row transition, and no provider request.
    expect(repository.calls.claimForPublish).toBe(0);
    expect(provider.createCallCount).toBe(0);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  it("returns publish_disabled when the artifact policy is invalid", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        provider,
        loadArtifactPolicy: () => parseVoiceArtifactPolicy("record-everything"),
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    expect(repository.calls.claimForPublish).toBe(0);
    expect(provider.createCallCount).toBe(0);
  });

  it("checks the artifact policy even before provider construction", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    let providerConstructed = 0;
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        loadArtifactPolicy: () => parseVoiceArtifactPolicy(undefined),
        createProvider: () => {
          providerConstructed += 1;
          return new FakeVoiceProvider(fixedClock);
        },
      }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_disabled") });
    expect(providerConstructed).toBe(0);
  });

  it("proceeds when the approved staging policy is configured", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({ repository, loadArtifactPolicy: () => parseVoiceArtifactPolicy("none") }),
    );

    expect(result.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("success", () => {
  it("publishes a draft exactly once and stores the provider identity", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()], now: () => FIXED_NOW });
    const provider = new FakeVoiceProvider(fixedClock);
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assistant.status).toBe("published");
    expect(result.assistant.provider).toBe("fake");
    expect(result.assistant.providerAssistantId).toBe("fake_asst_000001");
    expect(result.assistant.lastSyncedAt).toBe(FIXED_NOW.toISOString());

    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("published");
    expect(row?.publishAttemptId).toBeNull();
    expect(row?.publishStartedAt).toBeNull();
    expect(row?.syncError).toBeNull();
    expect(repository.calls.finalizePublished).toBe(1);
  });

  it("publishes from the error status, which is a retryable claim status", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "error", syncError: "provider_rate_limited" })],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));
    expect(result.ok).toBe(true);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("published");
  });

  it("sends only catalog-derived runtime values and the saved prompt — never a browser-supplied field", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "success" }] });
    await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(provider.createCallCount).toBe(1);
    const sent = provider.createCalls[0]!;
    expect(sent.name).toBe("Front Desk");

    const config = sent.config as Record<string, unknown>;
    expect(config.model).toEqual({ provider: "test-model-provider", model: "test-model" });
    expect(config.voice).toEqual({ provider: "test-voice-provider", voiceId: "test-voice" });
    expect(config.firstMessageMode).toBe("assistant-speaks-first");
    expect(config.systemInstructions).toBe(
      "Answer politely, confirm the caller's name, and take a message.",
    );

    // The browser's Advanced/analysis blocks and every identifier must be absent.
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toMatch(/advanced|analysis|firmId|publishAttemptId|schemaVersion/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("configuration rejection — the provider is never called", () => {
  it("rejects an unsupported preset and records a definitive error", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft({ config: validConfig("custom") })] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("unsupported_preset") });
    expect(provider.createCallCount).toBe(0);
    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("error");
    expect(row?.syncError).toBe("unsupported_preset");
    expect(row?.provider).toBeNull();
  });

  it("rejects a preset absent from the runtime catalog as unsupported, not as invalid config", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft({ config: validConfig("budget-friendly") })] });
    const sparseCatalog = { version: 1, presets: { "natural-balanced": catalogPreset() } } as RuntimeCatalog;
    const provider = new ScriptedVoiceProvider({ outcomes: [] });

    const result = await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({ repository, provider, loadCatalog: () => sparseCatalog }),
    );

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("unsupported_preset") });
    expect(provider.createCallCount).toBe(0);
  });

  it.each([
    ["a missing schema version", { ...validConfig(), schemaVersion: undefined }],
    ["empty system instructions", { ...validConfig(), prompt: { firstMessageMode: "assistant-speaks-first", firstMessage: "Hi", systemInstructions: "   " } }],
    ["an unsupported first-message mode", { ...validConfig(), prompt: { firstMessageMode: "sing", firstMessage: "Hi", systemInstructions: "Be helpful." } }],
    ["a speaks-first mode with no first message", { ...validConfig(), prompt: { firstMessageMode: "assistant-speaks-first", systemInstructions: "Be helpful." } }],
  ])("rejects %s as assistant_config_invalid", async (_label, config) => {
    const repository = new FakePublishRepository({ seed: [seedDraft({ config: config as Record<string, unknown> })] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("assistant_config_invalid") });
    expect(provider.createCallCount).toBe(0);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("provider failures — definitive versus uncertain", () => {
  const DEFINITIVE: Array<[string, PublishRouteErrorCode]> = [
    ["AUTHENTICATION_FAILED", "provider_authentication_failed"],
    ["RATE_LIMITED", "provider_rate_limited"],
    ["VALIDATION_FAILED", "provider_request_rejected"],
    ["NOT_FOUND", "provider_request_rejected"],
    ["CONFLICT", "provider_request_rejected"],
    ["UNSUPPORTED_OPERATION", "provider_request_rejected"],
  ];

  it.each(DEFINITIVE)("%s becomes %s and leaves the row reclaimable in error", async (providerCode, routeCode) => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({
      outcomes: [{ kind: "providerError", code: providerCode as never }],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError(routeCode) });
    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("error");
    expect(row?.provider).toBeNull();
    expect(row?.providerAssistantId).toBeNull();
    expect(row?.publishAttemptId).toBeNull();
  });

  const UNCERTAIN: Array<[string, PublishRouteErrorCode]> = [
    ["TIMEOUT", "provider_timeout"],
    ["NETWORK_ERROR", "provider_network_error"],
    ["PROVIDER_ERROR", "provider_result_uncertain"],
  ];

  it.each(UNCERTAIN)("%s becomes %s and parks the row in publish_uncertain", async (providerCode, routeCode) => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({
      outcomes: [{ kind: "providerError", code: providerCode as never }],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError(routeCode) });
    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("publish_uncertain");
    expect(row?.syncError).toBe(routeCode);
  });

  it("treats a non-normalized throw conservatively as uncertain, never as a clean failure", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "unnormalizedThrow" }] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("provider_result_uncertain") });
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("publish_uncertain");
  });

  it("makes exactly one provider call per publish attempt on the failure path", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "providerError", code: "TIMEOUT" as never }] });
    await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));
    expect(provider.createCallCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("local finalization failure after provider success", () => {
  it("records local_finalize_failed and preserves the known provider identity", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft()],
      returnNullOn: { finalizePublished: true },
    });
    const provider = new ScriptedVoiceProvider({
      outcomes: [{ kind: "success", providerAssistantId: "scripted_asst_7788" }],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("local_finalize_failed") });
    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("publish_uncertain");
    expect(row?.provider).toBe("vapi");
    expect(row?.providerAssistantId).toBe("scripted_asst_7788");
    expect(provider.createCallCount).toBe(1);
  });

  it("does not call the provider a second time when finalization throws", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft()],
      throwOn: { finalizePublished: true },
    });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "success" }] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result.ok).toBe(false);
    expect(provider.createCallCount).toBe(1);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("publish_uncertain");
  });

  it("falls back to internal_error when recording uncertainty also fails, without another provider call", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft()],
      returnNullOn: { finalizePublished: true },
      throwOn: { recordPublishUncertain: true },
    });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "success" }] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("internal_error") });
    expect(provider.createCallCount).toBe(1);
  });

  it("returns internal_error when a definitive error transition cannot be persisted", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft()],
      throwOn: { recordPublishError: true },
    });
    const provider = new ScriptedVoiceProvider({
      outcomes: [{ kind: "providerError", code: "AUTHENTICATION_FAILED" as never }],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("internal_error") });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("claim conflicts and firm isolation", () => {
  it("reports assistant_not_found for an id this firm does not own, with no state leak", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft({ firmId: OTHER_FIRM_ID })] });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("assistant_not_found") });
    expect(provider.createCallCount).toBe(0);
    expect(repository.peek(OTHER_FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  it("reports assistant_not_found identically for a nonexistent id", async () => {
    const repository = new FakePublishRepository({ seed: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));
    expect(result).toEqual({ ok: false, error: buildPublishRouteError("assistant_not_found") });
  });

  it("reports already_published without calling the provider", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "published", provider: "vapi", providerAssistantId: "asst_live" })],
    });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("already_published") });
    expect(provider.createCallCount).toBe(0);
  });

  it("reports publish_in_progress for a fresh publishing row", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publishing", publishAttemptId: "attempt-live", publishStartedAt: FIXED_NOW })],
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));
    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_in_progress") });
    expect(repository.calls.markStalePublishingUncertain).toBe(0);
  });

  it("never reclaims a publish_uncertain row — it stays uncertain", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publish_uncertain", syncError: "provider_timeout" })],
    });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_uncertain") });
    expect(provider.createCallCount).toBe(0);
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("publish_uncertain");
  });

  it("reports publish_state_conflict when a claimable row loses a concurrent race", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft()],
      returnNullOn: { claimForPublish: true },
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));
    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_state_conflict") });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("duplicate activation", () => {
  it("issues exactly one provider call when two publishes race the same assistant", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "success" }] });
    const d = deps({ repository, provider });

    const [first, second] = await Promise.all([
      publishAssistant(FIRM_ID, ASSISTANT_ID, d),
      publishAssistant(FIRM_ID, ASSISTANT_ID, d),
    ]);

    expect(provider.createCallCount).toBe(1);
    expect(repository.calls.claimForPublish).toBe(2);

    const outcomes = [first.ok, second.ok].sort();
    expect(outcomes).toEqual([false, true]);

    const loser = first.ok ? second : first;
    expect(loser.ok).toBe(false);
    if (!loser.ok) expect(loser.error.code).toBe("publish_in_progress");
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("published");
  });

  it("does not start a second provider call while the first is still in flight", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "hang" }] });
    const d = deps({ repository, provider });

    void publishAssistant(FIRM_ID, ASSISTANT_ID, d);
    await Promise.resolve();
    const second = await publishAssistant(FIRM_ID, ASSISTANT_ID, d);

    expect(provider.createCallCount).toBe(1);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("publish_in_progress");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("stale attempt recovery — the bound that terminates a publishing state", () => {
  it("sweeps a publishing row older than the threshold to publish_uncertain", async () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PUBLISHING_THRESHOLD_MS - 1000);
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publishing", publishAttemptId: "attempt-old", publishStartedAt: stale })],
      now: () => FIXED_NOW,
    });
    const provider = new ScriptedVoiceProvider({ outcomes: [] });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_uncertain") });
    expect(provider.createCallCount).toBe(0);
    const row = repository.peek(FIRM_ID, ASSISTANT_ID);
    expect(row?.status).toBe("publish_uncertain");
    expect(row?.syncError).toBe("stale_publish_attempt");
    expect(row?.publishAttemptId).toBeNull();
  });

  it("keeps a row exactly at the threshold in publishing rather than sweeping it early", async () => {
    const borderline = new Date(FIXED_NOW.getTime() - STALE_PUBLISHING_THRESHOLD_MS + 1);
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publishing", publishAttemptId: "attempt-fresh", publishStartedAt: borderline })],
      now: () => FIXED_NOW,
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));
    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_in_progress") });
  });

  it("still reports publish_uncertain when the sweep itself fails", async () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PUBLISHING_THRESHOLD_MS - 1000);
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publishing", publishAttemptId: "attempt-old", publishStartedAt: stale })],
      throwOn: { markStalePublishingUncertain: true },
      now: () => FIXED_NOW,
    });
    const result = await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }));

    expect(result).toEqual({ ok: false, error: buildPublishRouteError("publish_uncertain") });
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("publishing");
  });

  it("never resets a swept row to draft, so it cannot be auto-republished", async () => {
    const stale = new Date(FIXED_NOW.getTime() - STALE_PUBLISHING_THRESHOLD_MS - 1000);
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "publishing", publishAttemptId: "attempt-old", publishStartedAt: stale })],
      now: () => FIXED_NOW,
    });
    const d = deps({ repository });

    await publishAssistant(FIRM_ID, ASSISTANT_ID, d);
    const again = await publishAssistant(FIRM_ID, ASSISTANT_ID, d);

    expect(again).toEqual({ ok: false, error: buildPublishRouteError("publish_uncertain") });
    expect(repository.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("publish_uncertain");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("repository failures propagate rather than being silently swallowed", () => {
  it("propagates a claim failure so the route can answer internal_error", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()], throwOn: { claimForPublish: true } });
    await expect(publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }))).rejects.toThrow();
  });

  it("propagates a publish-state read failure during conflict classification", async () => {
    const repository = new FakePublishRepository({
      seed: [seedDraft({ status: "published", provider: "vapi", providerAssistantId: "asst_live" })],
      throwOn: { getPublishState: true },
    });
    await expect(publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository }))).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("provider-safety invariants", () => {
  it("uses the FakeVoiceProvider without any network capability", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    const provider = new FakeVoiceProvider(fixedClock);
    await publishAssistant(FIRM_ID, ASSISTANT_ID, deps({ repository, provider }));

    // The fake's ids are sequential and local; a real provider id would not be.
    const created = await provider.getAssistant("fake_asst_000001");
    expect(created.provider).toBe("fake");
  });

  it("never constructs the production provider when dependencies are injected", async () => {
    const repository = new FakePublishRepository({ seed: [seedDraft()] });
    let constructed = 0;
    const provider = new ScriptedVoiceProvider({ outcomes: [{ kind: "success" }] });

    await publishAssistant(
      FIRM_ID,
      ASSISTANT_ID,
      deps({
        repository,
        createProvider: () => {
          constructed += 1;
          return provider;
        },
      }),
    );

    expect(constructed).toBe(1);
    expect(provider.createCallCount).toBe(1);
  });
});
