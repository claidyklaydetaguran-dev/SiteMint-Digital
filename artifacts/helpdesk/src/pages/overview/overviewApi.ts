/**
 * V5 customer-shell foundation — data access for the redesigned Overview
 * (D-1). Combines the receptionist-state signals (onboarding progress,
 * assistant status, assigned number), the needs-attention counts (open
 * issues, pending appointment requests) and today's call count.
 *
 * Setup progress here is read from the **saved** onboarding state only — it
 * does not re-run the Setup hub's real-data inference
 * (`pages/setup/setupContract.ts`), so it never duplicates the availability/
 * calendar/agent-config queries that page already owns. Once a visit to
 * `/setup` writes an inferred step back with `PUT`, this reads the same
 * saved fact on the next load — the two pages converge without either one
 * re-deriving the other's signals.
 *
 * Every voice-platform query here is gated on `voicePlatformEnabled`
 * (`lib/featureFlags.ts`) with fold-guarded endpoint literals, so a gated-out
 * itself — so Overview degrades to its non-voice sections in the canonical
 * (voice-off) build, per the task brief.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { useAppointmentRequests } from "@/hooks/useAvailability";
import { fetchOnboardingState } from "@/lib/onboardingApi";
import { SETUP_STEPS } from "@/pages/setup/setupContract";

const ROOT = "overview" as const;

// ─── Onboarding progress (saved state only) ─────────────────────────────────

export function useOnboardingProgress() {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery({
    queryKey: firmId !== undefined ? [ROOT, "onboarding", firmId] : [ROOT, "onboarding", "unresolved"],
    queryFn: fetchOnboardingState,
    enabled: firmId !== undefined,
    retry: 1,
  });

  const nonReviewKeys = SETUP_STEPS.filter((s) => s.key !== "review").map((s) => s.key);
  const doneCount = query.data
    ? nonReviewKeys.filter((key) => query.data!.steps[key]?.status === "done").length
    : 0;

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    doneCount,
    total: nonReviewKeys.length,
    anyStepDone: doneCount > 0,
    setupComplete: doneCount === nonReviewKeys.length,
  };
}

// ─── Assistant status ────────────────────────────────────────────────────

export function useAssistantPublished(): boolean {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery<{ items: Array<{ status?: string }>; count: number } | null>({
    queryKey: firmId !== undefined ? [ROOT, "assistants-lite", firmId] : [ROOT, "assistants-lite", "unresolved"],
    queryFn: () => {
      if (!voicePlatformEnabled) {
        // AR-001M: the endpoint literal must not survive into a gated-out build.
        return Promise.resolve(null);
      }
      return apiFetch<{ items: Array<{ status?: string }>; count: number }>("/receptionist/voice/assistants");
    },
    enabled: firmId !== undefined && voicePlatformEnabled,
    retry: 1,
  });
  return (query.data?.items ?? []).some((a) => a.status === "published");
}

// ─── Phone numbers ──────────────────────────────────────────────────────

export interface VoiceNumberSummary {
  id: number | string;
  phoneNumberDisplay: string;
  state: string;
}

function fetchVoiceNumbers(): Promise<{ items: VoiceNumberSummary[]; count: number }> {
  if (!voicePlatformEnabled) {
    // AR-001M: the endpoint literal must not survive into a gated-out build.
    return Promise.resolve(null as never);
  }
  return apiFetch("/receptionist/voice/numbers");
}

export function useAssignedNumber() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "numbers", firmId] : [ROOT, "numbers", "unresolved"],
    queryFn: fetchVoiceNumbers,
    enabled: firmId !== undefined && voicePlatformEnabled,
    retry: 1,
  });
}

// ─── Calendar connection ────────────────────────────────────────────────

export function useCalendarConnectedFlag(): boolean | null {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery({
    queryKey: firmId !== undefined ? [ROOT, "calendar-status", firmId] : [ROOT, "calendar-status", "unresolved"],
    queryFn: () => apiFetch<{ connected: boolean; provider: string }>("/receptionist/availability/calendar-status"),
    enabled: firmId !== undefined,
    retry: 1,
  });
  if (query.isLoading || query.isError) return null;
  return query.data?.connected ?? null;
}

// ─── Open issues ────────────────────────────────────────────────────────

export function useOpenIssuesCount(): number | null {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery({
    queryKey: firmId !== undefined ? [ROOT, "issues", firmId] : [ROOT, "issues", "unresolved"],
    queryFn: () => { if (!voicePlatformEnabled) return Promise.resolve(null as never); return apiFetch<{ items: unknown[]; count: number }>("/receptionist/voice/issues"); },
    enabled: firmId !== undefined && voicePlatformEnabled,
    retry: 1,
  });
  if (query.isLoading || query.isError || !voicePlatformEnabled) return null;
  return query.data?.count ?? null;
}

// ─── Today's calls ──────────────────────────────────────────────────────

export interface RealCallLite {
  callId: string;
  stateLabel: string;
  callerNumberDisplay: string;
  startedAt: string;
}

export function useRecentCalls(): { items: RealCallLite[]; isError: boolean; isLoading: boolean } {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery({
    queryKey: firmId !== undefined ? [ROOT, "calls", firmId] : [ROOT, "calls", "unresolved"],
    queryFn: () => { if (!voicePlatformEnabled) return Promise.resolve(null as never); return apiFetch<{ items: RealCallLite[]; count: number }>("/receptionist/voice/calls"); },
    enabled: firmId !== undefined && voicePlatformEnabled,
    retry: 1,
  });
  return {
    items: query.data?.items ?? [],
    isError: query.isError,
    isLoading: query.isLoading,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function countCallsToday(calls: RealCallLite[], now: number = Date.now()): number | null {
  if (!voicePlatformEnabled) return null;
  if (calls.length === 0) return null;
  const cutoff = now - DAY_MS;
  return calls.filter((c) => {
    const t = new Date(c.startedAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

// ─── Pending appointment requests ───────────────────────────────────────

/**
 * `availabilityApi.ts` has no literal `"pending"` state — `requested` and
 * `pending_review` are the two states awaiting an owner decision;
 * `held` is a transient in-flight booking-flow reservation, not a request
 * waiting on the owner, so it is not counted here.
 */
const AWAITING_DECISION = new Set(["requested", "pending_review"]);

export function usePendingAppointmentRequestsCount(): number | null {
  const { data, isLoading, isError } = useAppointmentRequests();
  if (isLoading || isError) return null;
  const items = (data as { items?: Array<{ state?: string }> } | undefined)?.items ?? [];
  return items.filter((r) => typeof r.state === "string" && AWAITING_DECISION.has(r.state)).length;
}
