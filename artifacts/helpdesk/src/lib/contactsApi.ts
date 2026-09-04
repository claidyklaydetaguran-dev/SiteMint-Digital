/**
 * V5 PR-8 — client for the contacts read endpoints
 * (`GET /receptionist/contacts`, `GET /receptionist/contacts/:id`).
 * Same-origin, cookie-authenticated, firm-scoped by the session — the
 * browser never sends a firm id. Implemented by the backend owner in
 * parallel; this module builds against the documented response shape.
 */

const API_BASE = "/api";

export type ContactSource = "voice" | "sms" | "manual";

export interface ContactSummary {
  id: string;
  name: string | null;
  phone: string;
  source: ContactSource;
  lastInteractionAt: string | null;
  disposition: string | null;
  nextAppointmentAt: string | null;
  optedOut: boolean;
  callCount: number;
  conversationCount: number;
}

export interface ContactCallRef {
  callId: string;
  startedAt: string;
  state: string;
}

export interface ContactConversationRef {
  id: string;
  lastMessageAt: string;
  status: string;
}

export interface ContactDetailResponse {
  contact: ContactSummary;
  calls: ContactCallRef[];
  conversations: ContactConversationRef[];
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchContacts(query: string): Promise<{ items: ContactSummary[]; count: number }> {
  const params = new URLSearchParams();
  if (query.trim() !== "") params.set("query", query.trim());
  const qs = params.toString();
  return apiFetch(`/receptionist/contacts${qs ? `?${qs}` : ""}`);
}

export function fetchContactDetail(id: string): Promise<ContactDetailResponse | undefined> {
  return apiFetch<ContactDetailResponse>(`/receptionist/contacts/${encodeURIComponent(id)}`).catch((err: unknown) => {
    if (err instanceof Error && (err as Error & { status?: number }).status === 404) return undefined;
    throw err;
  });
}
