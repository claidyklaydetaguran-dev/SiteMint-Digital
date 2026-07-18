/**
 * Milestone 1 / Checkpoint E2: focused API client for the assistant
 * persistence endpoints (Checkpoint E1). Same-origin, cookie-authenticated
 * requests only — no tokens, no client-controlled firmId, no provider calls.
 *
 * Error responses are parsed defensively: only a short server-provided
 * string message is ever surfaced, never raw HTML/stack traces/response
 * bodies. Config/prompt content is never logged.
 */

const API_BASE = "/api";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const MAX_MESSAGE_LENGTH = 300;

export type AssistantStatus = "draft" | "published" | "error";

export interface AssistantDto {
  id: number;
  name: string;
  templateKey: string;
  status: AssistantStatus;
  provider: string | null;
  providerAssistantId: string | null;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssistantInput {
  name: string;
  templateKey: string;
  config: Record<string, unknown>;
}

export interface UpdateAssistantInput {
  name?: string;
  templateKey?: string;
  config?: Record<string, unknown>;
}

export class AssistantApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AssistantApiRequestError";
    this.status = status;
  }
}

function safeServerMessage(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    const message = (body as { error: string }).error;
    if (message.length > 0 && message.length <= MAX_MESSAGE_LENGTH) return message;
  }
  return null;
}

async function parseErrorResponse(res: Response): Promise<AssistantApiRequestError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body (e.g. an HTML error page from a proxy) — fall
    // through to the generic, status-appropriate message below.
  }

  const serverMessage = safeServerMessage(body);
  if (serverMessage) return new AssistantApiRequestError(res.status, serverMessage);

  switch (res.status) {
    case 401:
      return new AssistantApiRequestError(res.status, "Your session has expired. Please log in again.");
    case 404:
      return new AssistantApiRequestError(res.status, "Assistant not found.");
    case 409:
      return new AssistantApiRequestError(res.status, "This assistant can't be changed right now.");
    case 413:
      return new AssistantApiRequestError(res.status, "This configuration is too large to save.");
    default:
      return new AssistantApiRequestError(res.status, GENERIC_ERROR_MESSAGE);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    // Preserve query-cancellation semantics: a request aborted because the
    // caller's AbortSignal fired (e.g. a firm/session switch cancelling
    // in-flight assistant requests) must propagate as an abort, not be
    // reported to the user as a network failure.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AssistantApiRequestError(0, "Network error. Check your connection and try again.");
  }

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    throw new AssistantApiRequestError(res.status, GENERIC_ERROR_MESSAGE);
  }
}

export async function listAssistants(signal?: AbortSignal): Promise<AssistantDto[]> {
  const result = await request<{ items: AssistantDto[]; count: number }>("/receptionist/voice/assistants", { signal });
  return result.items;
}

export async function createAssistant(input: CreateAssistantInput): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>("/receptionist/voice/assistants", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.assistant;
}

export async function getAssistant(id: number, signal?: AbortSignal): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}`, { signal });
  return result.assistant;
}

export async function updateAssistant(id: number, patch: UpdateAssistantInput): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return result.assistant;
}

export async function duplicateAssistant(id: number): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}/duplicate`, {
    method: "POST",
  });
  return result.assistant;
}

export async function deleteAssistant(id: number): Promise<void> {
  await request<void>(`/receptionist/voice/assistants/${id}`, { method: "DELETE" });
}
