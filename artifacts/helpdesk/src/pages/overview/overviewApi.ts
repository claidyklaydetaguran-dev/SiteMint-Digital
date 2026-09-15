/**
 * V5 customer-shell foundation — data access for the redesigned Overview
 * (D-1), narrowed to the counts this page owns.
 *
 * Readiness itself is no longer measured here. Overview used to answer "is my
 * receptionist ready?" from the saved onboarding ticks alone while the Setup
 * hub answered it from real configuration, so the two screens could disagree —
 * and did, because the ticks were never being saved at all. Both now read
 * `pages/setup/setupApi.ts` → `useSetupData()` and
 * `pages/setup/setupContract.ts` → `deriveStepStatuses()`, one measurement
 * shared by both. The onboarding-progress, assistant-status, assigned-number,
 * calendar-connection and email-status queries that used to live here moved
 * there with it.
 *
 * What remains is Overview's own: open issues, pending appointment requests,
 * and the recent-calls list. `useRecentCalls` is also the single calls query
 * for the whole dashboard — `setupApi` reads it for the "has a real call
 * happened?" signal rather than issuing a second request for the same rows.
 *
 * Every voice-platform query here is gated on `voicePlatformEnabled`
 * (`lib/featureFlags.ts`) with fold-guarded endpoint literals, so a gated-out
 * build carries neither the request nor the endpoint string.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { useAppointmentRequests } from "@/hooks/useAvailability";

const ROOT = "overview" as const;

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

// ─── Calls ──────────────────────────────────────────────────────────────

export interface RealCallLite {
  callId: string;
  stateLabel: string;
  callerNumberDisplay: string;
  startedAt: string;
}

/**
 * The dashboard's one calls query.
 *
 * Read twice over — here for the recent-calls list, and by `setupApi` for the
 * test-call signal — but fetched once, under one key.
 */
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
 * `pending_review` are the two states awaiting an owner decision.
 *
 * `held` is counted too: the server approves a held row exactly as it approves
 * a pending_review one (`calendarEventSync.ts`), so a held slot is genuinely
 * waiting on the owner rather than being an in-flight reservation nobody has
 * to look at.
 */
const AWAITING_DECISION = new Set(["requested", "pending_review", "held"]);

export function usePendingAppointmentRequestsCount(): number | null {
  const { data, isLoading, isError } = useAppointmentRequests();
  if (isLoading || isError) return null;
  const items = (data as { items?: Array<{ state?: string }> } | undefined)?.items ?? [];
  return items.filter((r) => typeof r.state === "string" && AWAITING_DECISION.has(r.state)).length;
}
