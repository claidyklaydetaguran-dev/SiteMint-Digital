/**
 * V5 PR-8 — client for `GET /receptionist/voice/usage?period=YYYY-MM`.
 * Same-origin, cookie-authenticated, firm-scoped. Cap/pause *state* is not
 * exposed by this endpoint — the documented contract carries only counts —
 * so pause is derived client-side from `includedMinutes`/`totalSeconds` (see
 * `usageContract.ts`'s `isPaused`), and labelled honestly as a derived
 * estimate rather than a value the server asserted.
 */

const API_BASE = "/api";

export interface UsagePeriod {
  period: string;
  callCount: number;
  totalSeconds: number;
  includedMinutes: number | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

/** `period` is `YYYY-MM`; omit for the server's current billing period. */
export function fetchUsage(period?: string): Promise<UsagePeriod> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : "";
  return apiFetch(`/receptionist/voice/usage${qs}`);
}
