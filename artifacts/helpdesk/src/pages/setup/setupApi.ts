/**
 * V5 customer-shell foundation — data access for the Setup hub (S-3).
 *
 * Combines the onboarding endpoint (`lib/onboardingApi.ts`) with the
 * real-data signals the brief authorises inferring status from: business
 * profile (agent-config, `lib/accountApi.ts`), availability configuration
 * and calendar connection (`lib/availabilityApi.ts`, via the existing
 * `useAvailabilityConfig` / `useCalendarStatus` hooks this file imports but
 * does not modify), and assigned phone numbers. `/receptionist/voice/numbers`
 * has no existing client anywhere in the app, so it is added here, scoped to
 * `src/pages/setup/*` as the task brief allows.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { useAvailabilityConfig, useCalendarStatus } from "@/hooks/useAvailability";
import { fetchAgentConfig, readAccountProfile } from "@/lib/accountApi";
import {
  fetchOnboardingState,
  updateOnboardingState,
  type OnboardingState,
} from "@/lib/onboardingApi";
import {
  deriveStepStatuses,
  newlyInferredDone,
  type SavedSteps,
  type SetupSignals,
} from "./setupContract";

const ROOT = "setup" as const;

// ─── Phone numbers (no existing client in the app) ─────────────────────────

export interface VoiceNumberSummary {
  id: number | string;
  phoneNumberDisplay: string;
  state: string;
}

export function fetchVoiceNumbers(): Promise<{ items: VoiceNumberSummary[]; count: number }> {
  return apiFetch("/receptionist/voice/numbers");
}

function useVoiceNumbers() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "numbers", firmId] : [ROOT, "numbers", "unresolved"],
    queryFn: fetchVoiceNumbers,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

// ─── Onboarding state ───────────────────────────────────────────────────────

export function useOnboardingState() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<OnboardingState>({
    queryKey: firmId !== undefined ? [ROOT, "onboarding", firmId] : [ROOT, "onboarding", "unresolved"],
    queryFn: fetchOnboardingState,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

function useAgentConfig() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "agent-config", firmId] : [ROOT, "agent-config", "unresolved"],
    queryFn: fetchAgentConfig,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

// ─── Combined ────────────────────────────────────────────────────────────

export interface SetupData {
  loading: boolean;
  /** True once every query has resolved (success or error) at least once. */
  ready: boolean;
  saved: SavedSteps;
  signals: SetupSignals;
  completedAt: string | null;
}

/**
 * Every query the Setup hub needs, combined into one signals object. Each
 * source degrades independently to `null` on failure — a failed availability
 * request must not make the business-profile signal disappear too, and the
 * page never blocks entirely on one slow or failing query.
 */
export function useSetupData(): SetupData {
  const onboarding = useOnboardingState();
  const agentConfig = useAgentConfig();
  const availability = useAvailabilityConfig();
  const calendarStatus = useCalendarStatus();
  const numbers = useVoiceNumbers();

  const loading =
    onboarding.isLoading || agentConfig.isLoading || availability.isLoading || calendarStatus.isLoading || numbers.isLoading;
  const ready =
    !onboarding.isLoading && !agentConfig.isLoading && !availability.isLoading && !calendarStatus.isLoading && !numbers.isLoading;

  const profile = agentConfig.isError ? null : readAccountProfile(agentConfig.data ?? null);
  const availabilityConfig = availability.isError ? null : (availability.data as { config?: unknown } | undefined)?.config;

  const signals: SetupSignals = {
    businessComplete: profile ? Boolean(profile.name.trim() && profile.industry.trim()) : null,
    availabilityConfigured: availability.isError
      ? null
      : Boolean(
          availabilityConfig &&
            typeof availabilityConfig === "object" &&
            "appointmentTypes" in (availabilityConfig as Record<string, unknown>) &&
            Array.isArray((availabilityConfig as { appointmentTypes?: unknown[] }).appointmentTypes) &&
            ((availabilityConfig as { appointmentTypes: unknown[] }).appointmentTypes.length > 0),
        ),
    calendarConnected: calendarStatus.isError ? null : (calendarStatus.data?.connected ?? null),
    phoneAssigned: numbers.isError ? null : (numbers.data ? numbers.data.items.length > 0 : null),
  };

  return {
    loading,
    ready,
    saved: (onboarding.data?.steps as SavedSteps | undefined) ?? {},
    signals,
    completedAt: onboarding.data?.completedAt ?? null,
  };
}

/**
 * Writes back any step that real data now proves done but the server has not
 * yet recorded — idempotent by contract (see `newlyInferredDone`), so a
 * repeated call with nothing new to report is a silent no-op.
 */
export function useSyncInferredSteps() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return async (saved: SavedSteps, signals: SetupSignals) => {
    const newlyDone = newlyInferredDone(saved, signals);
    if (newlyDone.length === 0) return;
    const patch: Record<string, { status: "done" }> = {};
    for (const key of newlyDone) patch[key] = { status: "done" };
    await updateOnboardingState({ steps: patch });
    if (firmId !== undefined) {
      qc.invalidateQueries({ queryKey: [ROOT, "onboarding", firmId] });
    }
  };
}

export { deriveStepStatuses };
