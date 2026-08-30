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

/**
 * Milestone 1 / Checkpoint E3C: the exhaustive set of assistant statuses the
 * backend (`ck_voice_assistants_status`) can return. "unknown" is a
 * frontend-only fallback for a malformed/unrecognized server value — it is
 * never sent to the server and must never enable Publish or Delete.
 */
export const KNOWN_ASSISTANT_STATUSES = [
  "draft",
  "publishing",
  "published",
  "error",
  "publish_uncertain",
] as const;

export type KnownAssistantStatus = (typeof KNOWN_ASSISTANT_STATUSES)[number];
export type AssistantStatus = KnownAssistantStatus | "unknown";

const KNOWN_ASSISTANT_STATUS_SET: ReadonlySet<string> = new Set(KNOWN_ASSISTANT_STATUSES);

function normalizeAssistantStatus(value: unknown): AssistantStatus {
  return typeof value === "string" && KNOWN_ASSISTANT_STATUS_SET.has(value)
    ? (value as KnownAssistantStatus)
    : "unknown";
}

export interface AssistantDto {
  id: number;
  name: string;
  templateKey: string;
  status: AssistantStatus;
  provider: string | null;
  /**
   * AR-001V.1: the provider assistant id is deliberately NOT part of this DTO
   * — ordinary list and detail responses now carry only whether a provider
   * resource exists. The id itself comes from
   * `fetchBrowserTestSession()` alone, once, after the owner confirms Start
   * Browser Test.
   */
  providerLinked: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  syncError: string | null;
  /**
   * AR-001V: server-derived provider-synchronization state. The digest it is
   * derived from never crosses this boundary — only the answer does.
   * Anything other than `"synchronized"` must NOT be rendered as saved and
   * published.
   */
  providerSyncState: ProviderSyncState;
  /** Safe static code, or null. Never provider text, payloads, or identifiers. */
  providerSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors PROVIDER_SYNC_STATES in the backend (read-only reference, never imported). */
export const PROVIDER_SYNC_STATES = [
  "not_published",
  "synchronizing",
  "interrupted",
  "synchronized",
  "local_changes",
  "sync_failed",
  "unknown",
] as const;

export type ProviderSyncState = (typeof PROVIDER_SYNC_STATES)[number];

const PROVIDER_SYNC_STATE_SET: ReadonlySet<string> = new Set(PROVIDER_SYNC_STATES);

/**
 * Defensive re-parse. An unrecognized value becomes `"unknown"`, never
 * `"synchronized"` — a malformed or downgraded server response can therefore
 * never make the UI claim the provider is up to date.
 */
export function normalizeProviderSyncState(value: unknown): ProviderSyncState {
  return typeof value === "string" && PROVIDER_SYNC_STATE_SET.has(value)
    ? (value as ProviderSyncState)
    : "unknown";
}

/**
 * Defensive re-parse of the `status` field on any assistant DTO from the
 * server — never trust `res.json() as T` to have validated it. Every read
 * path (list/get/create/update/duplicate/publish-merge) must route through
 * this before the DTO reaches a query cache or component.
 */
function normalizeAssistantDto(raw: AssistantDto): AssistantDto {
  return {
    ...raw,
    status: normalizeAssistantStatus(raw.status),
    providerSyncState: normalizeProviderSyncState(raw.providerSyncState),
  };
}

/**
 * The minimal safe fields the E3B2 publish endpoint returns on success. Never
 * the full assistant shape.
 *
 * AR-001V.2: `providerAssistantId` was removed. Showing "published" needs only
 * the status and the fact that a provider link now exists; the id itself
 * reaches a browser exclusively through `fetchBrowserTestSession()`.
 */
export interface PublishedAssistantResult {
  id: number;
  status: AssistantStatus;
  provider: string | null;
  providerLinked: boolean;
  lastSyncedAt: string | null;
}

function normalizePublishedResult(raw: PublishedAssistantResult): PublishedAssistantResult {
  return { ...raw, status: normalizeAssistantStatus(raw.status) };
}

/** The exact static, machine-readable codes the E3B2 publish route can return. See publishHttpErrors.ts (backend, read-only). */
export const PUBLISH_ROUTE_ERROR_CODES = [
  "publish_disabled",
  "invalid_request",
  "assistant_not_found",
  "assistant_config_invalid",
  "unsupported_preset",
  "already_published",
  "publish_in_progress",
  "publish_uncertain",
  "publish_state_conflict",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_request_rejected",
  "provider_timeout",
  "provider_network_error",
  "provider_result_uncertain",
  "local_finalize_failed",
  "unknown_publish_error",
  "internal_error",
] as const;

export type PublishRouteErrorCode = (typeof PUBLISH_ROUTE_ERROR_CODES)[number];

const PUBLISH_ROUTE_ERROR_CODE_SET: ReadonlySet<string> = new Set(PUBLISH_ROUTE_ERROR_CODES);

function normalizePublishRouteErrorCode(value: unknown): PublishRouteErrorCode | undefined {
  return typeof value === "string" && PUBLISH_ROUTE_ERROR_CODE_SET.has(value)
    ? (value as PublishRouteErrorCode)
    : undefined;
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
  /** Present only for the nested E3B2 publish error shape (`{error: {code, message, retryable}}`); undefined for the flat E1 shape. */
  readonly code?: PublishRouteErrorCode;
  /** Present only for the nested E3B2 publish error shape. Always false in this checkpoint, but read defensively rather than assumed. */
  readonly retryable?: boolean;
  constructor(status: number, message: string, opts?: { code?: PublishRouteErrorCode; retryable?: boolean }) {
    super(message);
    this.name = "AssistantApiRequestError";
    this.status = status;
    this.code = opts?.code;
    this.retryable = opts?.retryable;
  }
}

function boundedMessage(value: string): string | null {
  if (value.length > 0 && value.length <= MAX_MESSAGE_LENGTH) return value;
  return null;
}

/**
 * Safely extracts a display message from either the existing E1 flat shape
 * (`{error: "..."}`) or the E3B2 nested publish shape
 * (`{error: {code, message, retryable}}`). Never returns anything but a
 * short bounded string pulled from one of those two known shapes — never
 * raw HTML, a stack trace, or the response body reflected verbatim.
 */
function safeServerMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const errorField = (body as { error: unknown }).error;

  if (typeof errorField === "string") return boundedMessage(errorField);

  if (errorField && typeof errorField === "object" && "message" in errorField) {
    const message = (errorField as { message: unknown }).message;
    if (typeof message === "string") return boundedMessage(message);
  }

  return null;
}

/** Extracts `code`/`retryable` from the nested E3B2 publish error shape only. Absent (not guessed) for the flat E1 shape. */
function safePublishErrorMeta(body: unknown): { code?: PublishRouteErrorCode; retryable?: boolean } {
  if (!body || typeof body !== "object" || !("error" in body)) return {};
  const errorField = (body as { error: unknown }).error;
  if (!errorField || typeof errorField !== "object") return {};

  const candidate = errorField as { code?: unknown; retryable?: unknown };
  return {
    code: normalizePublishRouteErrorCode(candidate.code),
    retryable: typeof candidate.retryable === "boolean" ? candidate.retryable : undefined,
  };
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
  const meta = safePublishErrorMeta(body);
  if (serverMessage) return new AssistantApiRequestError(res.status, serverMessage, meta);

  switch (res.status) {
    case 401:
      return new AssistantApiRequestError(res.status, "Your session has expired. Please log in again.", meta);
    case 404:
      return new AssistantApiRequestError(res.status, "Assistant not found.", meta);
    case 409:
      return new AssistantApiRequestError(res.status, "This assistant can't be changed right now.", meta);
    case 413:
      return new AssistantApiRequestError(res.status, "This configuration is too large to save.", meta);
    default:
      return new AssistantApiRequestError(res.status, GENERIC_ERROR_MESSAGE, meta);
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
  return result.items.map(normalizeAssistantDto);
}

export async function createAssistant(input: CreateAssistantInput): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>("/receptionist/voice/assistants", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return normalizeAssistantDto(result.assistant);
}

export async function getAssistant(id: number, signal?: AbortSignal): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}`, { signal });
  return normalizeAssistantDto(result.assistant);
}

export async function updateAssistant(id: number, patch: UpdateAssistantInput): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return normalizeAssistantDto(result.assistant);
}

export async function duplicateAssistant(id: number): Promise<AssistantDto> {
  const result = await request<{ assistant: AssistantDto }>(`/receptionist/voice/assistants/${id}/duplicate`, {
    method: "POST",
  });
  return normalizeAssistantDto(result.assistant);
}

export async function deleteAssistant(id: number): Promise<void> {
  await request<void>(`/receptionist/voice/assistants/${id}`, { method: "DELETE" });
}

const ASSISTANT_ID_PATTERN = /^[1-9]\d*$/;

/**
 * Milestone 1 / Checkpoint E3C: POST .../publish. Sends no request body (the
 * backend route requires the body to be absent or `{}`) — never firmId,
 * attempt id, provider, providerAssistantId, status, runtime catalog, model/
 * voice/transcriber, an API key, or any assistant config/prompt content.
 * Deliberately does not accept an AbortSignal: unmounting the builder must
 * never appear to cancel a publish attempt that is genuinely still running
 * server-side, and this call is never automatically retried by the caller.
 */
export async function publishAssistant(id: number): Promise<PublishedAssistantResult> {
  if (!ASSISTANT_ID_PATTERN.test(String(id)) || !Number.isSafeInteger(id) || id <= 0) {
    throw new AssistantApiRequestError(0, GENERIC_ERROR_MESSAGE);
  }
  const result = await request<{ assistant: PublishedAssistantResult }>(
    `/receptionist/voice/assistants/${id}/publish`,
    { method: "POST", headers: { Accept: "application/json" } },
  );
  return normalizePublishedResult(result.assistant);
}

/** The minimal safe fields the AR-001V sync endpoint returns. Carries no provider assistant id and no provider response. */
export interface SynchronizedAssistantResult {
  id: number;
  status: AssistantStatus;
  providerConfigSynchronized: true;
  /** False when the payload already matched and the server made no provider request. */
  providerRequestSent: boolean;
  lastSyncedAt: string | null;
}

/** The exact static codes the AR-001V sync route can return. See syncErrors.ts (backend, read-only). */
export const SYNC_ROUTE_ERROR_CODES = [
  "sync_disabled",
  "invalid_request",
  "assistant_not_found",
  "assistant_not_published",
  "provider_link_missing",
  "unsupported_provider",
  "assistant_config_invalid",
  "unsupported_preset",
  "sync_in_progress",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_request_rejected",
  "provider_timeout",
  "provider_network_error",
  "provider_result_uncertain",
  "local_finalize_failed",
  "unknown_sync_error",
  "internal_error",
] as const;

export type SyncRouteErrorCode = (typeof SYNC_ROUTE_ERROR_CODES)[number];

const SYNC_ROUTE_ERROR_CODE_SET: ReadonlySet<string> = new Set(SYNC_ROUTE_ERROR_CODES);

export function normalizeSyncRouteErrorCode(value: unknown): SyncRouteErrorCode | undefined {
  return typeof value === "string" && SYNC_ROUTE_ERROR_CODE_SET.has(value)
    ? (value as SyncRouteErrorCode)
    : undefined;
}

/**
 * AR-001V: POST .../sync. Sends no request body — never firmId, an attempt id,
 * a provider, a providerAssistantId, a config, or a digest. Like publish it
 * deliberately accepts no AbortSignal: unmounting the builder must never
 * appear to cancel a provider update that is genuinely still running, and the
 * caller never retries it automatically.
 */
export async function syncAssistant(id: number): Promise<SynchronizedAssistantResult> {
  if (!ASSISTANT_ID_PATTERN.test(String(id)) || !Number.isSafeInteger(id) || id <= 0) {
    throw new AssistantApiRequestError(0, GENERIC_ERROR_MESSAGE);
  }
  const result = await request<{ assistant: SynchronizedAssistantResult }>(
    `/receptionist/voice/assistants/${id}/sync`,
    { method: "POST", headers: { Accept: "application/json" } },
  );
  return { ...result.assistant, status: normalizeAssistantStatus(result.assistant.status) };
}

/**
 * AR-001V.1: the browser-test session. Two fields, nothing else — the Web SDK
 * needs the provider assistant id and nothing in this response may be used to
 * assemble a transient assistant.
 */
export interface BrowserTestSessionDto {
  provider: string;
  providerAssistantId: string;
}

/**
 * AR-001V.1: fetches the minimum metadata a browser test needs.
 *
 * Call this ONLY from the confirm handler of the browser-test dialog. It must
 * never be called on page load, on mount, on hover, or speculatively: the
 * whole point of the endpoint is that the provider assistant id reaches the
 * browser once, in response to a deliberate owner action, and only while the
 * server's own browser-test flag is on. It issues no provider request and
 * touches no microphone.
 */
export async function fetchBrowserTestSession(id: number): Promise<BrowserTestSessionDto> {
  if (!ASSISTANT_ID_PATTERN.test(String(id)) || !Number.isSafeInteger(id) || id <= 0) {
    throw new AssistantApiRequestError(0, GENERIC_ERROR_MESSAGE);
  }
  const result = await request<{ session: BrowserTestSessionDto }>(
    `/receptionist/voice/assistants/${id}/browser-test-session`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  return result.session;
}
