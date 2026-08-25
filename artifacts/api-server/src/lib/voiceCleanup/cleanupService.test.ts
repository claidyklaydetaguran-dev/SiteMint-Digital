/**
 * AR-001C — guarded staging provider cleanup.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 * (collected by vitest.config.ts `include: ["src/**\/*.test.ts"]`.)
 *
 * Drives the real `cleanupStagingAssistant()` through every branch using the
 * AR-001A deterministic fakes, extended with the one new repository method.
 * Nothing here contacts a provider, opens a socket, or touches a database:
 * `cleanupService.ts` imports no db client at all, and the CLI shell that does
 * is never imported.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupStagingAssistant,
  evaluateEnvironmentGuards,
  exitCodeFor,
  formatCleanupResult,
  parseCleanupArgs,
  parseStrictPositiveInteger,
  CLEANUP_ELIGIBLE_STATUSES,
  CLEANUP_SUPPORTED_PROVIDERS,
  STAGING_CLEANUP_ENV_VAR,
  type CleanupRepositoryDependency,
  type CleanupResult,
  type CleanupServiceDependencies,
} from "./cleanupService.js";
import { VoiceProviderError, type VoiceProviderErrorCode } from "../voice/errors.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";
import type { Clock } from "../voice/types.js";
import { FakePublishRepository, type FakeAssistantSeed } from "../voicePublishing/testing/fakePublishRepository.js";

// ─── Tripwires ─────────────────────────────────────────────────────────────

const tripwire = { fetch: 0, XMLHttpRequest: 0, WebSocket: 0, RTCPeerConnection: 0, sendBeacon: 0 };
const globalAny = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};

beforeAll(() => {
  for (const name of Object.keys(tripwire) as (keyof typeof tripwire)[]) {
    originals[name] = globalAny[name];
    globalAny[name] = function trip(): never {
      tripwire[name] += 1;
      throw new Error(`AR-001C tripwire: ${name} was invoked`);
    };
  }
});

afterAll(() => {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalAny[name];
    else globalAny[name] = value;
  }
});

afterEach(() => {
  for (const key of Object.keys(tripwire) as (keyof typeof tripwire)[]) {
    expect(tripwire[key], `${key} must never be invoked`).toBe(0);
  }
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FIRM_ID = 7;
const OTHER_FIRM_ID = 8;
const ASSISTANT_ID = 42;
const REMOTE_ID = "asst_staging_0001";
const FIXED_NOW = new Date("2026-08-25T00:00:00.000Z");
const fixedClock: Clock = { now: () => new Date(FIXED_NOW.getTime()) };

/** Records every delete call and answers from a script. Never performs I/O. */
class ScriptedDeleteProvider implements VoiceProvider {
  readonly deleteCalls: string[] = [];
  constructor(private readonly outcome: { kind: "ok" } | { kind: "error"; code: VoiceProviderErrorCode } | { kind: "unnormalized" }) {}

  async deleteAssistant(providerAssistantId: string) {
    this.deleteCalls.push(providerAssistantId);
    if (this.outcome.kind === "error") {
      throw new VoiceProviderError(this.outcome.code, "Scripted provider failure.", { provider: "vapi" });
    }
    if (this.outcome.kind === "unnormalized") throw new TypeError("Scripted non-normalized throw");
    return { providerAssistantId, deleted: true as const };
  }
  async createAssistant(): Promise<never> {
    throw new Error("cleanup must never call createAssistant");
  }
  async getAssistant(): Promise<never> {
    throw new Error("cleanup must never call getAssistant");
  }
  async updateAssistant(): Promise<never> {
    throw new Error("cleanup must never call updateAssistant");
  }
}

/** AR-001A's fake plus the one new conditional reconcile method. */
class CleanupFakeRepository implements CleanupRepositoryDependency {
  readonly inner: FakePublishRepository;
  clearCalls = 0;
  private readonly failClear: boolean;
  private readonly nullClear: boolean;
  /** Fires once, immediately before the conditional update, to simulate a concurrent writer. */
  onBeforeClear?: () => void;

  constructor(opts: { seed?: FakeAssistantSeed[]; failClear?: boolean; nullClear?: boolean } = {}) {
    this.inner = new FakePublishRepository({ seed: opts.seed ?? [], now: () => FIXED_NOW });
    this.failClear = opts.failClear ?? false;
    this.nullClear = opts.nullClear ?? false;
  }

  getPublishState = async (firmId: number, id: number) => this.inner.getPublishState(firmId, id);

  clearProviderLinkForFirm = async (firmId: number, id: number, expectedProviderAssistantId: string) => {
    this.clearCalls += 1;
    if (this.onBeforeClear) {
      const hook = this.onBeforeClear;
      this.onBeforeClear = undefined;
      hook();
    }
    if (this.failClear) throw new Error("forced reconcile failure");
    if (this.nullClear) return null;

    const row = this.inner.peek(firmId, id);
    // Mirrors the real conditional UPDATE predicate exactly.
    if (!row || row.providerAssistantId !== expectedProviderAssistantId) return null;
    return this.inner.applyCleared(firmId, id);
  };
}

function seed(extra: Partial<FakeAssistantSeed> = {}): FakeAssistantSeed {
  return {
    id: ASSISTANT_ID,
    firmId: FIRM_ID,
    status: "published",
    provider: "vapi",
    providerAssistantId: REMOTE_ID,
    lastSyncedAt: FIXED_NOW,
    ...extra,
  };
}

function deps(repository: CleanupRepositoryDependency, provider: VoiceProvider): CleanupServiceDependencies {
  return { repository, createProvider: () => provider, clock: fixedClock };
}

const execRequest = { firmId: FIRM_ID, assistantId: ASSISTANT_ID, confirmProviderAssistantId: REMOTE_ID, execute: true };
const dryRequest = { firmId: FIRM_ID, assistantId: ASSISTANT_ID, execute: false };

// ═══════════════════════════════════════════════════════════════════════════
describe("eligibility — read directly off the database invariant", () => {
  it("allows exactly the two statuses whose rows may carry a provider id", () => {
    expect([...CLEANUP_ELIGIBLE_STATUSES].sort()).toEqual(["publish_uncertain", "published"]);
  });

  it("supports only the provider whose deletion capability exists", () => {
    expect([...CLEANUP_SUPPORTED_PROVIDERS]).toEqual(["vapi"]);
  });

  it.each([
    ["a draft with no provider link", { status: "draft", provider: null, providerAssistantId: null }, "not_provider_linked"],
    ["a publishing row (schema forbids a provider id)", { status: "publishing", provider: null, providerAssistantId: null, publishAttemptId: "a-1", publishStartedAt: FIXED_NOW }, "not_provider_linked"],
    ["an error row (schema forbids a provider id)", { status: "error", provider: null, providerAssistantId: null, syncError: "provider_rate_limited" }, "not_provider_linked"],
    ["a row missing only the provider id", { provider: "vapi", providerAssistantId: null }, "not_provider_linked"],
    ["a blank provider id", { provider: "vapi", providerAssistantId: "   " }, "not_provider_linked"],
    ["an unsupported provider", { provider: "someone-else", providerAssistantId: "x_1" }, "unsupported_provider"],
  ])("refuses %s", async (_label, extra, reason) => {
    const repository = new CleanupFakeRepository({ seed: [seed(extra as Partial<FakeAssistantSeed>)] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, provider));

    expect(result).toEqual({ ok: false, status: "ineligible", reason });
    expect(provider.deleteCalls).toHaveLength(0);
    expect(repository.clearCalls).toBe(0);
  });

  it("refuses a wrong-firm lookup exactly like a missing assistant, leaking nothing", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed({ firmId: OTHER_FIRM_ID })] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });

    const wrongFirm = await cleanupStagingAssistant(execRequest, deps(repository, provider));
    const missing = await cleanupStagingAssistant(
      { ...execRequest, assistantId: 999 },
      deps(new CleanupFakeRepository({ seed: [] }), provider),
    );

    expect(wrongFirm).toEqual({ ok: false, status: "ineligible", reason: "assistant_not_found" });
    expect(missing).toEqual(wrongFirm);
    expect(provider.deleteCalls).toHaveLength(0);
    // The other firm's row is untouched.
    expect(repository.inner.peek(OTHER_FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
  });

  it.each([
    ["a zero firm id", { firmId: 0 }],
    ["a negative assistant id", { assistantId: -1 }],
    ["a non-integer assistant id", { assistantId: 1.5 }],
    ["NaN", { firmId: Number.NaN }],
  ])("refuses %s before touching the repository", async (_label, override) => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant({ ...execRequest, ...override }, deps(repository, provider));

    expect(result).toEqual({ ok: false, status: "ineligible", reason: "invalid_identifiers" });
    expect(repository.inner.calls.getPublishState).toBe(0);
    expect(provider.deleteCalls).toHaveLength(0);
  });

  it("refuses a wrong confirmation value without calling the provider", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(
      { ...execRequest, confirmProviderAssistantId: "asst_wrong" },
      deps(repository, provider),
    );

    expect(result).toEqual({ ok: false, status: "ineligible", reason: "confirmation_mismatch" });
    expect(provider.deleteCalls).toHaveLength(0);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
  });

  it("refuses a missing confirmation value", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(
      { firmId: FIRM_ID, assistantId: ASSISTANT_ID, execute: true },
      deps(repository, provider),
    );

    expect(result).toEqual({ ok: false, status: "ineligible", reason: "confirmation_mismatch" });
    expect(provider.deleteCalls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("dry run", () => {
  it("performs zero provider calls and zero writes", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(dryRequest, deps(repository, provider));

    expect(result).toEqual({
      ok: true,
      status: "dry_run",
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      assistantStatus: "published",
      provider: "vapi",
      providerAssistantId: REMOTE_ID,
    });
    expect(provider.deleteCalls).toHaveLength(0);
    expect(repository.clearCalls).toBe(0);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("published");
  });

  it("never constructs a provider on the dry-run path, so it needs no credential", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    let constructed = 0;
    const result = await cleanupStagingAssistant(dryRequest, {
      repository,
      createProvider: () => {
        constructed += 1;
        throw new Error("VAPI_API_KEY is not set");
      },
      clock: fixedClock,
    });

    expect(result.ok).toBe(true);
    expect(constructed).toBe(0);
  });

  it("needs no confirmation value, and reports one for the operator to copy", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(dryRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));
    const output = formatCleanupResult(result);

    expect(output).toContain("DRY RUN");
    expect(output).toContain(`--confirm=${REMOTE_ID}`);
    expect(output).toContain("--execute");
    expect(exitCodeFor(result)).toBe(0);
  });

  it("is the default: parsing no flags yields execute=false", () => {
    expect(parseCleanupArgs([]).execute).toBe(false);
    expect(parseCleanupArgs(["--firm-id=7", "--assistant-id=42"]).execute).toBe(false);
    expect(parseCleanupArgs(["--firm-id=7", "--execute"]).execute).toBe(true);
  });

  it("dry-runs a publish_uncertain row with a known provider identity", async () => {
    const repository = new CleanupFakeRepository({
      seed: [seed({ status: "publish_uncertain", syncError: "provider_timeout" })],
    });
    const result = await cleanupStagingAssistant(dryRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "dry_run") expect(result.assistantStatus).toBe("publish_uncertain");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("environment guards", () => {
  it("refuses when NODE_ENV is production", () => {
    expect(evaluateEnvironmentGuards({ NODE_ENV: "production", [STAGING_CLEANUP_ENV_VAR]: "true" })).toBe(
      "production_environment",
    );
  });

  it("refuses when the staging-cleanup variable is absent or not exactly true", () => {
    expect(evaluateEnvironmentGuards({})).toBe("not_enabled");
    expect(evaluateEnvironmentGuards({ [STAGING_CLEANUP_ENV_VAR]: "TRUE" })).toBe("not_enabled");
    expect(evaluateEnvironmentGuards({ [STAGING_CLEANUP_ENV_VAR]: "1" })).toBe("not_enabled");
    expect(evaluateEnvironmentGuards({ [STAGING_CLEANUP_ENV_VAR]: "yes" })).toBe("not_enabled");
  });

  it("passes only when both guards are satisfied", () => {
    expect(evaluateEnvironmentGuards({ NODE_ENV: "development", [STAGING_CLEANUP_ENV_VAR]: "true" })).toBeUndefined();
  });

  it("applies the guards to a dry run too", () => {
    expect(evaluateEnvironmentGuards({ NODE_ENV: "production" })).toBe("production_environment");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("definitive deletion", () => {
  it("makes exactly one delete call and reconciles local state once", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, provider));

    expect(result).toEqual({
      ok: true,
      status: "cleaned",
      remote: "deleted",
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });
    expect(provider.deleteCalls).toEqual([REMOTE_ID]);
    expect(repository.clearCalls).toBe(1);
    expect(exitCodeFor(result)).toBe(0);
  });

  it("returns the assistant to a genuine editable draft, preserving config and firm", async () => {
    const config = { schemaVersion: 1, setup: { assistantName: "Front Desk" } };
    const repository = new CleanupFakeRepository({ seed: [seed({ config, name: "Front Desk" })] });
    await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));

    const row = repository.inner.peek(FIRM_ID, ASSISTANT_ID)!;
    expect(row.status).toBe("draft");
    expect(row.provider).toBeNull();
    expect(row.providerAssistantId).toBeNull();
    expect(row.publishAttemptId).toBeNull();
    expect(row.publishStartedAt).toBeNull();
    expect(row.syncError).toBeNull();
    expect(row.lastSyncedAt).toBeNull();
    // Preserved:
    expect(row.firmId).toBe(FIRM_ID);
    expect(row.name).toBe("Front Desk");
    expect(row.config).toEqual(config);
  });

  it("cleans a publish_uncertain row with a known provider identity", async () => {
    const repository = new CleanupFakeRepository({
      seed: [seed({ status: "publish_uncertain", syncError: "local_finalize_failed" })],
    });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));

    expect(result.ok).toBe(true);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  it("never calls any provider method other than delete", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    await cleanupStagingAssistant(execRequest, deps(repository, provider));
    // createAssistant/getAssistant/updateAssistant all throw if reached; the
    // clean result above proves none was.
    expect(provider.deleteCalls).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("AR-001E — a 404 is not proof of absence", () => {
  it("classifies NOT_FOUND as uncertain and writes nothing at all", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "error", code: "NOT_FOUND" });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, provider));

    expect(result).toEqual({
      ok: false,
      status: "uncertain",
      code: "NOT_FOUND",
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });
    expect(repository.clearCalls, "a 404 must trigger zero local writes").toBe(0);
    expect(provider.deleteCalls).toHaveLength(1);
  });

  it("preserves the provider id, the provider, and the status after a 404", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "error", code: "NOT_FOUND" })),
    );

    const row = repository.inner.peek(FIRM_ID, ASSISTANT_ID)!;
    expect(row.providerAssistantId).toBe(REMOTE_ID);
    expect(row.provider).toBe("vapi");
    expect(row.status).toBe("published");
  });

  it("exits nonzero after a 404", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "error", code: "NOT_FOUND" })),
    );
    expect(exitCodeFor(result)).toBe(1);
  });

  it("tells the operator the truth about the 404 and instructs them to stop", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "error", code: "NOT_FOUND" })),
    );
    const output = formatCleanupResult(result);

    expect(output).toContain("UNCERTAIN");
    expect(output).toContain("HTTP 404");
    expect(output).toContain("does not document");
    expect(output).toContain("STOP HERE");
    // No success claim.
    expect(output).not.toMatch(/CLEANED|already absent|succeeded|has been deleted/i);
    expect(output).toContain("it is NOT known whether the remote assistant was deleted");
    // Re-running is forbidden, not invited, and no acknowledgement flag exists.
    expect(output).toMatch(/Do not re-run this command/i);
    expect(output).not.toMatch(/try again|--accept-not-found|acknowledge/i);
  });

  it("offers no success result shape that a 404 could reach", async () => {
    // `already_absent` was AR-001C's success carrier for a 404. Nothing in the
    // module may produce it any more, for any provider outcome.
    const outcomes: Array<{ kind: "ok" } | { kind: "error"; code: VoiceProviderErrorCode } | { kind: "unnormalized" }> =
      [
        { kind: "ok" },
        { kind: "unnormalized" },
        ...(["NOT_FOUND", "CONFLICT", "PROVIDER_ERROR", "TIMEOUT", "NETWORK_ERROR", "AUTHENTICATION_FAILED"] as const).map(
          (code) => ({ kind: "error", code }) as const,
        ),
      ];

    for (const outcome of outcomes) {
      const repository = new CleanupFakeRepository({ seed: [seed()] });
      const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider(outcome)));
      expect(JSON.stringify(result)).not.toContain("already_absent");
      expect(formatCleanupResult(result)).not.toContain("already absent");
    }
  });

  it("does not fabricate provider confirmation for any failure code", async () => {
    for (const code of ["NOT_FOUND", "CONFLICT", "PROVIDER_ERROR", "TIMEOUT"] as VoiceProviderErrorCode[]) {
      const repository = new CleanupFakeRepository({ seed: [seed()] });
      const result = await cleanupStagingAssistant(
        execRequest,
        deps(repository, new ScriptedDeleteProvider({ kind: "error", code })),
      );
      expect(result.ok).toBe(false);
      expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("definitive provider failure — local state untouched", () => {
  const DEFINITIVE: VoiceProviderErrorCode[] = [
    "AUTHENTICATION_FAILED",
    "RATE_LIMITED",
    "CONFLICT",
    "VALIDATION_FAILED",
    "UNSUPPORTED_OPERATION",
    "NOT_CONFIGURED",
  ];

  it.each(DEFINITIVE)("%s leaves the provider id in place and exits nonzero", async (code) => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "error", code });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, provider));

    expect(result).toEqual({
      ok: false,
      status: "provider_failed",
      code,
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });
    const row = repository.inner.peek(FIRM_ID, ASSISTANT_ID)!;
    expect(row.status).toBe("published");
    expect(row.providerAssistantId).toBe(REMOTE_ID);
    expect(repository.clearCalls).toBe(0);
    expect(exitCodeFor(result)).toBe(1);
    expect(provider.deleteCalls).toHaveLength(1);
  });

  it("reports a provider that cannot even be constructed as a definitive failure", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(execRequest, {
      repository,
      createProvider: () => {
        throw new Error("VAPI_API_KEY is not set");
      },
      clock: fixedClock,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.status === "provider_failed") expect(result.code).toBe("NOT_CONFIGURED");
    expect(repository.clearCalls).toBe(0);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("uncertain provider outcome — never assume deletion", () => {
  const UNCERTAIN: VoiceProviderErrorCode[] = ["TIMEOUT", "NETWORK_ERROR", "PROVIDER_ERROR", "NOT_FOUND"];

  it.each(UNCERTAIN)("%s leaves local state unchanged and exits nonzero", async (code) => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "error", code })),
    );

    expect(result).toEqual({
      ok: false,
      status: "uncertain",
      code,
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });
    expect(repository.clearCalls).toBe(0);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
    expect(exitCodeFor(result)).toBe(1);
  });

  it("treats a non-normalized throw as uncertain, not as a clean failure", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "unnormalized" })),
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.status === "uncertain") expect(result.code).toBe("unnormalized_error");
    expect(repository.clearCalls).toBe(0);
  });

  it("tells the operator explicitly not to assume deletion", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const result = await cleanupStagingAssistant(
      execRequest,
      deps(repository, new ScriptedDeleteProvider({ kind: "error", code: "TIMEOUT" })),
    );
    const output = formatCleanupResult(result);
    expect(output).toContain("UNCERTAIN");
    expect(output).toContain("DO NOT assume the remote resource is gone");
    expect(output).toContain("Nothing was retried");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("partial success — remote gone, local reconcile failed", () => {
  it("is reported distinctly from a provider failure and preserves recovery identity", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()], failClear: true });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, provider));

    expect(result).toEqual({
      ok: false,
      status: "local_reconcile_failed",
      remote: "deleted",
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });
    expect(exitCodeFor(result)).toBe(1);
    expect(formatCleanupResult(result)).toContain(REMOTE_ID);
    expect(provider.deleteCalls).toHaveLength(1);
  });

  it("distinguishes a zero-row conditional update from a thrown write", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()], nullClear: true });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("local_reconcile_failed");
  });

  it("reports remote deletion as confirmed and local reconciliation as incomplete", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()], failClear: true });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));
    const output = formatCleanupResult(result);

    expect(output).toContain("PARTIAL");
    expect(output).toContain("Remote deletion IS confirmed");
    expect(output).toContain("Local reconciliation is incomplete");
    expect(output).toContain("provider dashboard");
    expect(output).toContain("separately authorized procedure");
  });

  it("does not recommend a blind re-run, because a second 404 would prove nothing", async () => {
    // AR-001C told the operator to re-run and let the resulting 404 finish the
    // job. AR-001E removed that advice: the second DELETE's 404 is undocumented
    // and cannot confirm the first deletion.
    const repository = new CleanupFakeRepository({ seed: [seed()], failClear: true });
    const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));
    const output = formatCleanupResult(result);

    expect(output).toContain("Do NOT re-run this command");
    expect(output).not.toMatch(/already absent|it will observe|re-run this command to finish/i);
  });

  it("prefers a stale local link over an orphaned remote resource", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()], failClear: true });
    await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));

    const row = repository.inner.peek(FIRM_ID, ASSISTANT_ID)!;
    expect(row.providerAssistantId).toBe(REMOTE_ID);
    expect(row.provider).toBe("vapi");
  });

  it("issues no second delete of its own after a failed reconcile", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()], failClear: true });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    await cleanupStagingAssistant(execRequest, deps(repository, provider));
    expect(provider.deleteCalls).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("race and duplicate protection", () => {
  it("a concurrent runner that sees a 404 reconciles nothing", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const providerA = new ScriptedDeleteProvider({ kind: "ok" });
    const providerB = new ScriptedDeleteProvider({ kind: "error", code: "NOT_FOUND" });

    const [a, b] = await Promise.all([
      cleanupStagingAssistant(execRequest, deps(repository, providerA)),
      cleanupStagingAssistant(execRequest, deps(repository, providerB)),
    ]);

    // Only the runner holding a documented success may write. The 404 runner
    // stops at "uncertain", so exactly one reconcile is attempted in total.
    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(["cleaned", "uncertain"]);
    expect(repository.clearCalls).toBe(1);
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.status).toBe("draft");
  });

  it("a repeated execution after success is refused, not re-deleted", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });

    const first = await cleanupStagingAssistant(execRequest, deps(repository, provider));
    expect(first.ok).toBe(true);

    const second = await cleanupStagingAssistant(execRequest, deps(repository, provider));
    expect(second).toEqual({ ok: false, status: "ineligible", reason: "not_provider_linked" });
    // Still exactly one delete call across both runs.
    expect(provider.deleteCalls).toHaveLength(1);
  });

  it("a row that changes between read and reconcile is not corrupted", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    // Simulate a concurrent republish landing a different provider id.
    repository.onBeforeClear = () => {
      repository.inner.forceProviderAssistantId(FIRM_ID, ASSISTANT_ID, "asst_republished_9999");
    };

    const result = await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "ok" })));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("local_reconcile_failed");
    // The concurrent writer's identity survives — cleanup did not clear it.
    expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe("asst_republished_9999");
  });

  it("never clears the provider id before the remote outcome is definitive", async () => {
    for (const code of [
      "TIMEOUT",
      "NETWORK_ERROR",
      "PROVIDER_ERROR",
      "AUTHENTICATION_FAILED",
      "NOT_FOUND",
    ] as VoiceProviderErrorCode[]) {
      const repository = new CleanupFakeRepository({ seed: [seed()] });
      await cleanupStagingAssistant(execRequest, deps(repository, new ScriptedDeleteProvider({ kind: "error", code })));
      expect(repository.clearCalls, `${code} must not reconcile`).toBe(0);
      expect(repository.inner.peek(FIRM_ID, ASSISTANT_ID)?.providerAssistantId).toBe(REMOTE_ID);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("AR-001E — strict CLI identifier parsing", () => {
  it("accepts canonical positive decimal integers", () => {
    expect(parseStrictPositiveInteger("1")).toBe(1);
    expect(parseStrictPositiveInteger("42")).toBe(42);
    expect(parseStrictPositiveInteger("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    ["a missing value", undefined],
    ["an empty string", ""],
    ["zero", "0"],
    ["a negative value", "-1"],
    ["a negative zero", "-0"],
    ["a decimal", "1.5"],
    ["a trailing decimal point", "1."],
    ["exponent notation", "1e3"],
    ["uppercase exponent notation", "1E3"],
    ["hexadecimal", "0x10"],
    ["octal", "0o10"],
    ["binary", "0b10"],
    ["an explicit plus sign", "+1"],
    ["a leading zero", "01"],
    ["leading whitespace", " 1"],
    ["trailing whitespace", "1 "],
    ["surrounding whitespace", "  1  "],
    ["a newline", "1\n"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["a bare word", "abc"],
    ["trailing characters", "1abc"],
    ["a separator", "1_000"],
    ["a thousands comma", "1,000"],
    ["one past MAX_SAFE_INTEGER", "9007199254740992"],
    ["a very large integer", "99999999999999999999"],
  ])("rejects %s", (_label, raw) => {
    expect(parseStrictPositiveInteger(raw as string | undefined)).toBeUndefined();
  });

  it.each([
    "",
    "0",
    "-1",
    "1.5",
    "1e3",
    "0x10",
    "+1",
    "01",
    " 1 ",
    "Infinity",
    "NaN",
    "abc",
    "9007199254740992",
  ])("leaves --firm-id=%s undefined so the CLI stops before any import", (raw) => {
    const args = parseCleanupArgs([`--firm-id=${raw}`, "--assistant-id=42"]);
    expect(args.firmId).toBeUndefined();
    // This is the property the CLI's guard depends on: a malformed id is
    // indistinguishable from a missing one, and `NaN` never reaches it.
    expect(Number.isNaN(args.firmId as number)).toBe(false);
  });

  it.each(["", "0", "-1", "1.5", "1e3", "0x10", "+1", "01", " 1 ", "Infinity", "NaN", "9007199254740992"])(
    "leaves --assistant-id=%s undefined",
    (raw) => {
      expect(parseCleanupArgs(["--firm-id=7", `--assistant-id=${raw}`]).assistantId).toBeUndefined();
    },
  );

  it("parses a fully valid invocation", () => {
    const args = parseCleanupArgs(["--firm-id=7", "--assistant-id=42", `--confirm=${REMOTE_ID}`, "--execute"]);
    expect(args).toEqual({
      firmId: 7,
      assistantId: 42,
      confirmProviderAssistantId: REMOTE_ID,
      execute: true,
    });
  });

  it("still refuses a rejected identifier at the service layer, as defence in depth", async () => {
    const repository = new CleanupFakeRepository({ seed: [seed()] });
    const provider = new ScriptedDeleteProvider({ kind: "ok" });
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const result = await cleanupStagingAssistant(
        { ...execRequest, firmId: bad },
        deps(repository, provider),
      );
      expect(result).toEqual({ ok: false, status: "ineligible", reason: "invalid_identifiers" });
    }
    expect(repository.inner.calls.getPublishState).toBe(0);
    expect(provider.deleteCalls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("output safety", () => {
  const results: CleanupResult[] = [
    { ok: true, status: "dry_run", firmId: FIRM_ID, assistantId: ASSISTANT_ID, assistantStatus: "published", provider: "vapi", providerAssistantId: REMOTE_ID },
    { ok: true, status: "cleaned", remote: "deleted", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
    { ok: false, status: "ineligible", reason: "confirmation_mismatch" },
    { ok: false, status: "provider_failed", code: "AUTHENTICATION_FAILED", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
    { ok: false, status: "uncertain", code: "TIMEOUT", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
    { ok: false, status: "uncertain", code: "NOT_FOUND", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
    { ok: false, status: "provider_failed", code: "VALIDATION_FAILED", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
    { ok: false, status: "local_reconcile_failed", remote: "deleted", firmId: FIRM_ID, assistantId: ASSISTANT_ID, providerAssistantId: REMOTE_ID },
  ];

  it("gives a 400/422 rejection definitive wording with no mandatory investigation", () => {
    const output = formatCleanupResult({
      ok: false,
      status: "provider_failed",
      code: "VALIDATION_FAILED",
      firmId: FIRM_ID,
      assistantId: ASSISTANT_ID,
      providerAssistantId: REMOTE_ID,
    });

    expect(output).toContain("PROVIDER REFUSED");
    expect(output).toContain("The remote outcome is known");
    expect(output).toContain("nothing was deleted");
    expect(output).toContain("Local state is unchanged");
    // Definitive: never described as unknown, and no dashboard step is demanded.
    expect(output).not.toMatch(/UNCERTAIN|is NOT known|unknown outcome/i);
    expect(output).not.toMatch(/dashboard|investigat/i);
    expect(output).toContain("Nothing was retried");
  });

  it.each(results.map((r) => [`${r.status}:${"code" in r ? r.code : r.status}`, r] as const))("%s output carries no credential, host, prompt, or config", (_s, result) => {
    const output = formatCleanupResult(result);
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toMatch(/api\.vapi\.ai|vapi\.ai|daily\.co|Bearer|api[ _-]?key|apikey|authorization|postgres|DATABASE_URL|receptionist_session/i);
    expect(output).not.toMatch(/systemInstructions|firstMessage|schemaVersion|prompt/i);
  });

  it("gives every outcome a non-zero-length operator explanation", () => {
    for (const result of results) expect(formatCleanupResult(result).split("\n").length).toBeGreaterThan(1);
  });
});
