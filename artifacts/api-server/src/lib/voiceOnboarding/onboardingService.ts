// V5 PR-5: persistent onboarding-hub progress, firm-scoped, one row per firm
// (lib/db/src/schema/voice/voiceOnboarding.ts, migration 0007 — not yet
// applied anywhere by this PR; see MIGRATION-PACKET.md).
//
// Degrade-gracefully contract: until that migration is applied, every
// database call in this module is wrapped so a missing-table error (or any
// other DB error) falls back to an in-process, per-firm in-memory map
// instead of throwing. That keeps GET/PUT /api/receptionist/onboarding
// working today (progress just doesn't survive a restart) and keeps it
// working identically, without a code change, once the migration lands —
// the fallback is a behavior of the reads/writes below, not a separate mode
// the route has to know about. The fallback logs ONCE per process so an
// operator notices without flooding logs on every request.
//
// Repository access is injectable (the P2-P8 pattern: `deps.repo`, lazily
// resolved to a real database implementation in production) specifically so
// unit tests can exercise the fallback path deterministically — by
// injecting a repo that throws — without depending on ambient DATABASE_URL
// state shared across test files in the same worker.

import { ONBOARDING_STEP_KEYS, ONBOARDING_STEP_STATUSES, type OnboardingStepKey, type OnboardingStepStatus, type OnboardingSteps } from "@workspace/db/schema/voice";

export interface OnboardingStateDto {
  currentStep: OnboardingStepKey | null;
  steps: OnboardingSteps;
  completedAt: string | null;
}

interface OnboardingRow {
  currentStep: string | null;
  steps: OnboardingSteps;
  completedAt: Date | null;
}

export interface OnboardingRepository {
  find(firmId: number): Promise<OnboardingRow | undefined>;
  /** Insert-or-ignore (unique on firmId); returns the row this call created, or undefined if another writer won the race. */
  createDefault(firmId: number, now: Date): Promise<OnboardingRow | undefined>;
  upsertSteps(firmId: number, row: { steps: OnboardingSteps; currentStep: OnboardingStepKey | null; completedAt: Date | null }, now: Date): Promise<OnboardingRow>;
}

export interface OnboardingRepositoryDeps {
  now?: () => Date;
  logger?: (event: string, fields: Record<string, unknown>) => void;
  repo?: OnboardingRepository;
}

function emptySteps(): OnboardingSteps {
  return {};
}

function computeCurrentStep(steps: OnboardingSteps): OnboardingStepKey | null {
  for (const key of ONBOARDING_STEP_KEYS) {
    const s = steps[key];
    if (!s || s.status !== "done") return key;
  }
  return null;
}

function isComplete(steps: OnboardingSteps): boolean {
  return ONBOARDING_STEP_KEYS.every((k) => steps[k]?.status === "done");
}

// ── in-memory fallback (per-process; never the source of truth once the
// migration is applied — see the module comment) ────────────────────────────

const memoryStates = new Map<number, OnboardingStateDto>();
let warnedOnce = false;

function memoryDefault(): OnboardingStateDto {
  return { currentStep: ONBOARDING_STEP_KEYS[0], steps: emptySteps(), completedAt: null };
}

function warnFallback(logger: OnboardingRepositoryDeps["logger"]): void {
  if (warnedOnce) return;
  warnedOnce = true;
  logger?.("onboarding_state_memory_fallback", {
    reason: "voice_onboarding_states unavailable (migration not applied, or DB error) — progress will not survive a restart",
  });
}

// ── production repository (lazy import, matching the P2-P8 pattern) ─────────

async function productionRepo(): Promise<OnboardingRepository> {
  const { db } = await import("@workspace/db");
  const { voiceOnboardingStates } = await import("@workspace/db/schema/voice");
  const { eq } = await import("drizzle-orm");
  return {
    find: async (firmId) => {
      const [row] = await db.select().from(voiceOnboardingStates).where(eq(voiceOnboardingStates.firmId, firmId)).limit(1);
      return row;
    },
    createDefault: async (firmId, now) => {
      const [created] = await db
        .insert(voiceOnboardingStates)
        .values({ firmId, currentStep: ONBOARDING_STEP_KEYS[0], steps: emptySteps(), createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: [voiceOnboardingStates.firmId] })
        .returning();
      return created;
    },
    upsertSteps: async (firmId, row, now) => {
      const [updated] = await db
        .insert(voiceOnboardingStates)
        .values({ firmId, steps: row.steps, currentStep: row.currentStep, completedAt: row.completedAt, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [voiceOnboardingStates.firmId],
          set: { steps: row.steps, currentStep: row.currentStep, completedAt: row.completedAt, updatedAt: now },
        })
        .returning();
      if (!updated) throw new Error("onboarding state upsert returned no row");
      return updated;
    },
  };
}

function toDto(row: OnboardingRow): OnboardingStateDto {
  return {
    currentStep: (row.currentStep as OnboardingStepKey | null) ?? null,
    steps: row.steps ?? {},
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/** Reads a firm's onboarding state, creating a default row lazily on first access. */
export async function getOnboardingState(firmId: number, deps: OnboardingRepositoryDeps = {}): Promise<OnboardingStateDto> {
  const now = deps.now?.() ?? new Date();
  try {
    const repo = deps.repo ?? (await productionRepo());
    const existing = await repo.find(firmId);
    if (existing) return toDto(existing);

    const created = await repo.createDefault(firmId, now);
    if (created) return toDto(created);
    // Lost a create race — the other writer's row now exists; read it.
    const row = await repo.find(firmId);
    if (row) return toDto(row);
    throw new Error("onboarding state insert-then-read returned no row");
  } catch (err) {
    warnFallback(deps.logger);
    deps.logger?.("onboarding_state_read_fallback", { firmId, errorClass: err instanceof Error ? err.name : "unknown" });
    if (!memoryStates.has(firmId)) memoryStates.set(firmId, memoryDefault());
    return memoryStates.get(firmId)!;
  }
}

export type OnboardingUpdateResult =
  | { ok: true; state: OnboardingStateDto }
  | { ok: false; reason: "invalid_step" | "invalid_status" };

/** Updates one step's status and recomputes currentStep/completedAt. */
export async function setOnboardingStep(
  firmId: number,
  step: unknown,
  status: unknown,
  deps: OnboardingRepositoryDeps = {},
): Promise<OnboardingUpdateResult> {
  if (typeof step !== "string" || !(ONBOARDING_STEP_KEYS as readonly string[]).includes(step)) {
    return { ok: false, reason: "invalid_step" };
  }
  if (typeof status !== "string" || !(ONBOARDING_STEP_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: "invalid_status" };
  }
  const stepKey = step as OnboardingStepKey;
  const stepStatus = status as OnboardingStepStatus;
  const now = deps.now?.() ?? new Date();

  try {
    const repo = deps.repo ?? (await productionRepo());
    const existing = await repo.find(firmId);
    const baseSteps = existing?.steps ?? emptySteps();
    const nextSteps: OnboardingSteps = { ...baseSteps, [stepKey]: { status: stepStatus, updatedAt: now.toISOString() } };
    const nextCurrent = computeCurrentStep(nextSteps);
    const completedAt = isComplete(nextSteps) ? now : null;

    const updated = await repo.upsertSteps(firmId, { steps: nextSteps, currentStep: nextCurrent, completedAt }, now);
    return { ok: true, state: toDto(updated) };
  } catch (err) {
    warnFallback(deps.logger);
    deps.logger?.("onboarding_state_write_fallback", { firmId, errorClass: err instanceof Error ? err.name : "unknown" });
    const current = memoryStates.get(firmId) ?? memoryDefault();
    const nextSteps: OnboardingSteps = { ...current.steps, [stepKey]: { status: stepStatus, updatedAt: now.toISOString() } };
    const nextCurrent = computeCurrentStep(nextSteps);
    const state: OnboardingStateDto = {
      currentStep: nextCurrent,
      steps: nextSteps,
      completedAt: isComplete(nextSteps) ? now.toISOString() : null,
    };
    memoryStates.set(firmId, state);
    return { ok: true, state };
  }
}

/** Test-only: clears the in-memory fallback between test cases. */
export function _resetOnboardingMemoryForTests(): void {
  memoryStates.clear();
  warnedOnce = false;
}
