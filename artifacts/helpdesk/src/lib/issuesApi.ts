/**
 * V5 PR-8 — client for `GET /receptionist/voice/issues` and
 * `POST /receptionist/voice/issues/:id/resolve`. Same-origin,
 * cookie-authenticated, firm-scoped.
 */

const API_BASE = "/api";

export type IssueLevel = "info" | "warning" | "error" | "critical";

export interface VoiceIssue {
  id: string;
  level: IssueLevel;
  code: string;
  message: string;
  occurrences: number;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchIssues(): Promise<{ items: VoiceIssue[]; count: number }> {
  return apiFetch("/receptionist/voice/issues");
}

export function resolveIssue(id: string): Promise<{ ok: true }> {
  return apiFetch(`/receptionist/voice/issues/${encodeURIComponent(id)}/resolve`, { method: "POST" });
}
