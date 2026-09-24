// V5 PR-5 — the onboarding progress service: step validation, currentStep
// derivation, completion, and the degrade-to-memory fallback contract. Every
// case here drives the injected OnboardingRepository (never a real
// database), so this suite is deterministic regardless of ambient
// DATABASE_URL state in the test worker.

import { describe, expect, it, beforeEach } from "vitest";
import {
  getOnboardingState,
  setOnboardingStep,
  _resetOnboardingMemoryForTests,
  type OnboardingRepository,
} from "./onboardingService.js";
import { ONBOARDING_STEP_KEYS } from "@workspace/db/schema/voice";

function workingRepo(): { repo: OnboardingRepository; rows: Map<number, { currentStep: string | null; steps: Record<string, unknown>; completedAt: Date | null }> } {
  const rows = new Map<number, { currentStep: string | null; steps: Record<string, unknown>; completedAt: Date | null }>();
  const repo: OnboardingRepository = {
    find: async (firmId) => rows.get(firmId) as never,
    createDefault: async (firmId, now) => {
      if (rows.has(firmId)) return undefined;
      const row = { currentStep: ONBOARDING_STEP_KEYS[0] as string, steps: {}, completedAt: null as Date | null };
      rows.set(firmId, row);
      void now;
      return row as never;
    },
    upsertSteps: async (firmId, next, now) => {
      const row = { currentStep: next.currentStep, steps: next.steps as Record<string, unknown>, completedAt: next.completedAt };
      rows.set(firmId, row);
      void now;
      return row as never;
    },
  };
  return { repo, rows };
}

function throwingRepo(): OnboardingRepository {
  return {
    find: async () => {
      throw new Error("relation \"voice_onboarding_states\" does not exist");
    },
    createDefault: async () => {
      throw new Error("relation \"voice_onboarding_states\" does not exist");
    },
    upsertSteps: async () => {
      throw new Error("relation \"voice_onboarding_states\" does not exist");
    },
  };
}

beforeEach(() => {
  _resetOnboardingMemoryForTests();
});

describe("getOnboardingState", () => {
  it("creates a default row lazily on first access", async () => {
    const { repo } = workingRepo();
    const state = await getOnboardingState(1, { repo });
    expect(state.currentStep).toBe(ONBOARDING_STEP_KEYS[0]);
    expect(state.steps).toEqual({});
    expect(state.completedAt).toBeNull();
  });

  it("returns the existing row on a second access without re-creating it", async () => {
    const { repo, rows } = workingRepo();
    await getOnboardingState(1, { repo });
    await getOnboardingState(1, { repo });
    expect(rows.size).toBe(1);
  });
});

describe("setOnboardingStep", () => {
  it("rejects an unrecognized step key", async () => {
    const { repo } = workingRepo();
    const result = await setOnboardingStep(1, "not_a_real_step", "done", { repo });
    expect(result).toEqual({ ok: false, reason: "invalid_step" });
  });

  it("rejects an unrecognized status", async () => {
    const { repo } = workingRepo();
    const result = await setOnboardingStep(1, "business", "finished", { repo });
    expect(result).toEqual({ ok: false, reason: "invalid_status" });
  });

  it("advances currentStep to the next incomplete step", async () => {
    const { repo } = workingRepo();
    const result = await setOnboardingStep(1, "business", "done", { repo });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.steps["business"]?.status).toBe("done");
    expect(result.state.currentStep).toBe(ONBOARDING_STEP_KEYS[1]);
    expect(result.state.completedAt).toBeNull();
  });

  it("sets completedAt once every step is done, and currentStep becomes null", async () => {
    const { repo } = workingRepo();
    let result;
    for (const key of ONBOARDING_STEP_KEYS) {
      result = await setOnboardingStep(1, key, "done", { repo });
    }
    expect(result!.ok).toBe(true);
    if (!result!.ok) throw new Error("unreachable");
    expect(result!.state.currentStep).toBeNull();
    expect(result!.state.completedAt).not.toBeNull();
  });

  it("a blocked step does not advance currentStep past it", async () => {
    const { repo } = workingRepo();
    const result = await setOnboardingStep(1, "business", "blocked", { repo });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.currentStep).toBe("business");
  });
});

describe("degrade-to-memory fallback", () => {
  it("GET falls back to an in-memory default when the repository throws", async () => {
    const state = await getOnboardingState(42, { repo: throwingRepo(), logger: () => {} });
    expect(state.currentStep).toBe(ONBOARDING_STEP_KEYS[0]);
    expect(state.completedAt).toBeNull();
  });

  it("PUT falls back to an in-memory write when the repository throws, and still validates first", async () => {
    const invalid = await setOnboardingStep(42, "nope", "done", { repo: throwingRepo(), logger: () => {} });
    expect(invalid).toEqual({ ok: false, reason: "invalid_step" });

    const result = await setOnboardingStep(42, "business", "done", { repo: throwingRepo(), logger: () => {} });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.steps["business"]?.status).toBe("done");
  });

  it("the memory fallback persists across calls for the same firm within the process", async () => {
    await setOnboardingStep(99, "business", "done", { repo: throwingRepo(), logger: () => {} });
    const state = await getOnboardingState(99, { repo: throwingRepo(), logger: () => {} });
    expect(state.steps["business"]?.status).toBe("done");
  });

  it("the memory fallback is isolated per firm", async () => {
    await setOnboardingStep(1, "business", "done", { repo: throwingRepo(), logger: () => {} });
    const other = await getOnboardingState(2, { repo: throwingRepo(), logger: () => {} });
    expect(other.steps["business"]).toBeUndefined();
  });

  it("the fallback warning logs at most once per process", async () => {
    let warnings = 0;
    const logger = (event: string) => {
      if (event === "onboarding_state_memory_fallback") warnings += 1;
    };
    await getOnboardingState(1, { repo: throwingRepo(), logger });
    await getOnboardingState(2, { repo: throwingRepo(), logger });
    await getOnboardingState(3, { repo: throwingRepo(), logger });
    expect(warnings).toBe(1);
  });
});
