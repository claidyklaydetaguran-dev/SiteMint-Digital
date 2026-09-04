/**
 * V5 PR-8 — client for the phone-number management endpoints
 * (`GET /receptionist/voice/numbers`, `.../:id/pause`, `.../:id/unpause`).
 * Same-origin, cookie-authenticated, firm-scoped. Built against the
 * documented contract: `{ items: [{ id, phoneNumberDisplay, state,
 * assistantId, assignedAt }], count }`.
 *
 * Assignment (`POST .../:id/assign`) is documented on the same router but is
 * not exercised by this screen — Phone Number, per the approved scope, shows
 * the number SiteMint already assigned during onboarding and offers only
 * pause/unpause. The endpoint is typed here for completeness and future use.
 */

const API_BASE = "/api";

export type PhoneNumberState = "inventory" | "assigned" | "paused" | "released";

export interface PhoneNumberSummary {
  id: number;
  phoneNumberDisplay: string;
  state: PhoneNumberState;
  assistantId: number | null;
  assignedAt: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) message = body.error.slice(0, 300);
    } catch {
      // no JSON body
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchNumbers(): Promise<{ items: PhoneNumberSummary[]; count: number }> {
  return apiFetch("/receptionist/voice/numbers");
}

export function assignNumber(id: number, assistantId: number): Promise<{ number: PhoneNumberSummary }> {
  return apiFetch(`/receptionist/voice/numbers/${id}/assign`, { method: "POST", body: JSON.stringify({ assistantId }) });
}

export function pauseNumber(id: number): Promise<{ number: PhoneNumberSummary }> {
  return apiFetch(`/receptionist/voice/numbers/${id}/pause`, { method: "POST" });
}

export function unpauseNumber(id: number): Promise<{ number: PhoneNumberSummary }> {
  return apiFetch(`/receptionist/voice/numbers/${id}/unpause`, { method: "POST" });
}
