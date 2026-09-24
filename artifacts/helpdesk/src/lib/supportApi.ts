/**
 * Client for the support requests a business sends to SiteMint.
 * Same-origin, cookie-authenticated, firm-scoped by the server.
 */

const API_BASE = "/api";

export type SupportCategory = "question" | "problem" | "billing" | "other";
export type SupportStatus = "open" | "in_progress" | "answered" | "closed";
export type SupportAuthor = "business" | "sitemint";

export interface SupportRequest {
  id: number;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  requestedByEmail: string;
  /** SiteMint's own inbox was told. Not a claim that anybody has replied. */
  operatorNotified: boolean;
  lastMessageAt: string;
  closedAt: string | null;
  createdAt: string;
}

export interface SupportMessage {
  id: number;
  author: SupportAuthor;
  body: string;
  createdAt: string;
}

export interface SupportFieldError {
  field: "subject" | "body" | "category";
  code: string;
  message: string;
}

export interface SupportRequestError extends Error {
  status: number;
  fieldErrors: SupportFieldError[];
}

export function isSupportRequestError(err: unknown): err is SupportRequestError {
  return err instanceof Error && typeof (err as SupportRequestError).status === "number";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    // The server's own sentence is shown as written; it knows which field is wrong.
    let message = `Request failed (${res.status}).`;
    let fieldErrors: SupportFieldError[] = [];
    try {
      const body = (await res.json()) as { error?: string; fieldErrors?: SupportFieldError[] };
      if (typeof body.error === "string" && body.error.trim() !== "") message = body.error;
      if (Array.isArray(body.fieldErrors)) fieldErrors = body.fieldErrors;
    } catch {
      // keep the status-based message
    }
    throw Object.assign(new Error(message), { status: res.status, fieldErrors });
  }
  return res.json() as Promise<T>;
}

export function listSupportRequests(): Promise<{ items: SupportRequest[]; count: number }> {
  return apiFetch("/receptionist/support/requests");
}

export function readSupportRequest(id: number): Promise<{ request: SupportRequest; messages: SupportMessage[] }> {
  return apiFetch(`/receptionist/support/requests/${id}`);
}

export function createSupportRequest(input: {
  subject: string;
  body: string;
  category: SupportCategory;
}): Promise<{ request: SupportRequest; messages: SupportMessage[] }> {
  return apiFetch("/receptionist/support/requests", { method: "POST", body: JSON.stringify(input) });
}

export function replyToSupportRequest(
  id: number,
  body: string,
): Promise<{ request: SupportRequest; messages: SupportMessage[] }> {
  return apiFetch(`/receptionist/support/requests/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
}

export function closeSupportRequest(id: number): Promise<{ request: SupportRequest }> {
  return apiFetch(`/receptionist/support/requests/${id}/close`, { method: "POST" });
}
