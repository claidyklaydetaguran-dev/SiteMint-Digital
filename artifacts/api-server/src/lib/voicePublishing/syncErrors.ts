// AR-001V: the server-owned allowlists for the provider-synchronization
// lifecycle. Modelled directly on publishHttpErrors.ts / types.ts and kept
// deliberately separate from them, so widening one lifecycle can never
// silently widen the other.
//
// Every string in this module is a short, fixed, machine-readable literal.
// Nothing here can carry a provider response body, an API key, an
// Authorization value, a provider assistant id, system instructions, a first
// message, SQL text, a stack trace, a firm id, or an attempt id — none of
// those are members of these lists, and nothing outside the lists is
// accepted.

/** Codes persisted to voice_assistants.provider_sync_error. Bounded to 100 chars by CHECK. */
export const PROVIDER_SYNC_ERROR_CODES = [
  "assistant_config_invalid",
  "unsupported_preset",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_timeout",
  "provider_network_error",
  "provider_request_rejected",
  "provider_response_invalid",
  "provider_result_uncertain",
  "local_finalize_failed",
  "sync_interrupted",
  "unknown_sync_error",
] as const;

export type ProviderSyncErrorCode = (typeof PROVIDER_SYNC_ERROR_CODES)[number];

const PROVIDER_SYNC_ERROR_CODE_SET: ReadonlySet<string> = new Set(PROVIDER_SYNC_ERROR_CODES);

export const UNKNOWN_SYNC_ERROR_CODE: ProviderSyncErrorCode = "unknown_sync_error";

/** The exact static code written when an abandoned attempt is swept. Never caller-supplied. */
export const SYNC_INTERRUPTED_CODE: ProviderSyncErrorCode = "sync_interrupted";

export function isProviderSyncErrorCode(value: unknown): value is ProviderSyncErrorCode {
  return typeof value === "string" && PROVIDER_SYNC_ERROR_CODE_SET.has(value);
}

/** Narrows any value to a member of the allowlist. Anything else becomes the fallback code. */
export function toSafeProviderSyncErrorCode(value: unknown): ProviderSyncErrorCode {
  return isProviderSyncErrorCode(value) ? value : UNKNOWN_SYNC_ERROR_CODE;
}

export type SyncRouteErrorCode =
  | "sync_disabled"
  | "invalid_request"
  | "assistant_not_found"
  | "assistant_not_published"
  | "provider_link_missing"
  | "unsupported_provider"
  | "assistant_config_invalid"
  | "unsupported_preset"
  | "sync_in_progress"
  | "provider_authentication_failed"
  | "provider_rate_limited"
  | "provider_request_rejected"
  | "provider_timeout"
  | "provider_network_error"
  | "provider_result_uncertain"
  | "local_finalize_failed"
  | "unknown_sync_error"
  | "internal_error";

export interface SyncRouteError {
  status: number;
  code: SyncRouteErrorCode;
  message: string;
  /** Always false. No synchronization outcome in this checkpoint is presented as safe to retry automatically. */
  retryable: false;
}

const MESSAGE_BY_CODE: Record<SyncRouteErrorCode, string> = {
  sync_disabled: "Updating the published assistant is not currently available.",
  invalid_request: "The request was not valid.",
  assistant_not_found: "Assistant not found.",
  assistant_not_published: "This assistant has not been published yet.",
  provider_link_missing: "This assistant has no confirmed provider connection to update.",
  unsupported_provider: "Updating is not available for this assistant's provider.",
  assistant_config_invalid: "This assistant's configuration cannot be sent to the voice provider as-is.",
  unsupported_preset: "This assistant's selected voice preset is not supported.",
  sync_in_progress: "An update for this assistant is already in progress.",
  provider_authentication_failed: "The voice provider rejected the request credentials.",
  provider_rate_limited: "The voice provider rate-limited this request.",
  provider_request_rejected: "The voice provider rejected this request.",
  provider_timeout: "The voice provider request timed out. Do not retry automatically.",
  provider_network_error: "A network error occurred contacting the voice provider. Do not retry automatically.",
  provider_result_uncertain: "The update could not be confirmed. Do not retry automatically.",
  local_finalize_failed: "The update could not be confirmed. Do not retry automatically.",
  unknown_sync_error: "The voice provider request failed.",
  internal_error: "An internal error occurred. Do not retry automatically.",
};

const STATUS_BY_CODE: Record<SyncRouteErrorCode, number> = {
  sync_disabled: 503,
  invalid_request: 400,
  assistant_not_found: 404,
  assistant_not_published: 409,
  provider_link_missing: 409,
  unsupported_provider: 409,
  assistant_config_invalid: 422,
  unsupported_preset: 422,
  sync_in_progress: 409,
  provider_authentication_failed: 502,
  provider_rate_limited: 429,
  provider_request_rejected: 502,
  provider_timeout: 502,
  provider_network_error: 502,
  provider_result_uncertain: 502,
  local_finalize_failed: 502,
  unknown_sync_error: 502,
  internal_error: 500,
};

export function buildSyncRouteError(code: SyncRouteErrorCode): SyncRouteError {
  return { status: STATUS_BY_CODE[code], code, message: MESSAGE_BY_CODE[code], retryable: false };
}
