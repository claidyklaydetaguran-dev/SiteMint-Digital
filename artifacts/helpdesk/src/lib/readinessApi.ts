/**
 * The server's readiness answer (`GET /api/receptionist/readiness`): four
 * setup steps, one overall state, one next action. Setup and the dashboard
 * both read it, so they cannot disagree.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

export type CheckState = "done" | "todo" | "attention" | "not_checked" | "off";
export type StepState = "done" | "current" | "upcoming" | "attention" | "not_checked";
export type OverallState =
  | "setting_up"
  | "ready_to_test"
  | "ready_to_activate_phone"
  | "phone_connected"
  | "live_call_verified"
  | "paused"
  | "needs_attention"
  | "not_checked";

export interface ReadinessCheck {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
  fixPath: string | null;
}

export interface ReadinessStep {
  key: string;
  number: number;
  title: string;
  summary: string;
  state: StepState;
  checks: ReadinessCheck[];
}

export interface Readiness {
  state: OverallState;
  label: string;
  detail: string;
  next: { label: string; path: string } | null;
  steps: ReadinessStep[];
  checkedAt: string;
}

export const READINESS_ENDPOINT = "/receptionist/readiness";

export function useReadiness() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<Readiness>({
    queryKey: firmId !== undefined ? ["readiness", firmId] : ["readiness", "unresolved"],
    queryFn: () => apiFetch<Readiness>(READINESS_ENDPOINT),
    enabled: firmId !== undefined,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Words shown next to each check, so state is never carried by colour alone. */
export const CHECK_STATE_LABEL: Record<CheckState, string> = {
  done: "Done",
  todo: "To do",
  attention: "Needs attention",
  not_checked: "Not checked",
  off: "Off",
};

export const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "Complete",
  current: "In progress",
  upcoming: "Not started",
  attention: "Needs attention",
  not_checked: "Not checked",
};

/** The dashboard tone each overall state takes. */
export function overallTone(state: OverallState): "live" | "ready" | "working" | "warning" | "muted" {
  switch (state) {
    case "live_call_verified":
      return "live";
    case "phone_connected":
    case "ready_to_activate_phone":
    case "ready_to_test":
      return "ready";
    case "setting_up":
      return "working";
    case "paused":
    case "needs_attention":
      return "warning";
    case "not_checked":
      return "muted";
  }
}
