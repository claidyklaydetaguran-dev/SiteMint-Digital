/**
 * V5 customer-shell foundation — client for the persistent guided-onboarding
 * endpoint (S-3, PR-5 in V5-BLUEPRINT.md §14).
 *
 * `GET /api/receptionist/onboarding` returns the firm's saved progress;
 * `PUT` writes it back. Both are firm-scoped by the session cookie, same as
 * every other receptionist route. The backend is built in parallel by the
 * owner named in the same PR — this module is written against the response
 * shape specified for that route and is additive only, so it fails closed
 * (see `fetchOnboardingState` below) until the route exists.
 */

import { apiFetch } from "@/lib/api";

export const ONBOARDING_STEP_KEYS = [
  "business",
  "assistant",
  "prompt",
  "voice",
  "availability",
  "appointment_types",
  "calendar",
  "test_call",
  "phone_number",
  "review",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStepStatus = "pending" | "done" | "blocked";

export interface OnboardingStep {
  status: OnboardingStepStatus;
  updatedAt: string | null;
}

export interface OnboardingState {
  currentStep: OnboardingStepKey | null;
  steps: Partial<Record<OnboardingStepKey, OnboardingStep>>;
  completedAt: string | null;
}

export interface OnboardingResponse {
  state: OnboardingState;
}

export interface OnboardingUpdateInput {
  currentStep?: OnboardingStepKey;
  steps?: Partial<Record<OnboardingStepKey, { status: OnboardingStepStatus }>>;
  completedAt?: string | null;
}

const EMPTY_STATE: OnboardingState = {
  currentStep: null,
  steps: {},
  completedAt: null,
};

/**
 * Reads the saved onboarding state. A 404 (the route has not shipped yet, or
 * a firm with no row) is treated as "nothing saved yet" rather than a page
 * error — the Setup hub still renders with everything inferred from real
 * data (assistant/calendar/number state) even before this endpoint exists.
 */
export async function fetchOnboardingState(): Promise<OnboardingState> {
  try {
    const res = await apiFetch<OnboardingResponse>("/receptionist/onboarding");
    return res.state ?? EMPTY_STATE;
  } catch (err) {
    const status = (err as { status?: number } | undefined)?.status;
    if (status === 404 || status === 503) return EMPTY_STATE;
    throw err;
  }
}

/**
 * Writes progress back. Idempotent by contract: the Setup hub calls this to
 * persist inferred "done" states, so calling it twice with the same input
 * must be harmless — that is a backend guarantee this client relies on but
 * does not re-implement.
 */
export function updateOnboardingState(input: OnboardingUpdateInput): Promise<OnboardingState> {
  return apiFetch<OnboardingResponse>("/receptionist/onboarding", {
    method: "PUT",
    body: JSON.stringify(input),
  }).then((res) => res.state ?? EMPTY_STATE);
}
