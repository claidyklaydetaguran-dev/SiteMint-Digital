// Milestone 1 / Checkpoint E3B2: strict, static route-facing error shape for
// the publish endpoint. Every message here is a short, bounded, fixed string
// — never raw provider text, repository errors, SQL, a stack trace, an
// environment value, a system instruction, a first message, a runtime
// catalog, a request-body reflection, an attempt ID, or a firm ID. No code
// here ever suggests automatic retry.

export type PublishRouteErrorCode =
  | "publish_disabled"
  | "invalid_request"
  | "assistant_not_found"
  | "assistant_config_invalid"
  | "unsupported_preset"
  | "already_published"
  | "publish_in_progress"
  | "publish_uncertain"
  | "publish_state_conflict"
  | "provider_authentication_failed"
  | "provider_rate_limited"
  | "provider_request_rejected"
  | "provider_timeout"
  | "provider_network_error"
  | "provider_result_uncertain"
  | "local_finalize_failed"
  | "unknown_publish_error"
  | "internal_error";

export interface PublishRouteError {
  status: number;
  code: PublishRouteErrorCode;
  message: string;
  retryable: false;
}

const MESSAGE_BY_CODE: Record<PublishRouteErrorCode, string> = {
  publish_disabled: "Publishing is not currently available.",
  invalid_request: "The request was not valid.",
  assistant_not_found: "Assistant not found.",
  assistant_config_invalid: "This assistant's configuration cannot be published as-is.",
  unsupported_preset: "This assistant's selected voice preset is not supported for publishing.",
  already_published: "This assistant has already been published.",
  publish_in_progress: "A publish attempt for this assistant is already in progress.",
  publish_uncertain: "Publishing could not be confirmed. Do not retry automatically.",
  publish_state_conflict: "This assistant is not in a publishable state right now.",
  provider_authentication_failed: "The voice provider rejected the request credentials.",
  provider_rate_limited: "The voice provider rate-limited this request.",
  provider_request_rejected: "The voice provider rejected this request.",
  provider_timeout: "The voice provider request timed out. Do not retry automatically.",
  provider_network_error: "A network error occurred contacting the voice provider. Do not retry automatically.",
  provider_result_uncertain: "Publishing could not be confirmed. Do not retry automatically.",
  local_finalize_failed: "Publishing could not be confirmed. Do not retry automatically.",
  unknown_publish_error: "The voice provider request failed.",
  internal_error: "An internal error occurred. Do not retry automatically.",
};

const STATUS_BY_CODE: Record<PublishRouteErrorCode, number> = {
  publish_disabled: 503,
  invalid_request: 400,
  assistant_not_found: 404,
  assistant_config_invalid: 422,
  unsupported_preset: 422,
  already_published: 409,
  publish_in_progress: 409,
  publish_uncertain: 409,
  publish_state_conflict: 409,
  provider_authentication_failed: 502,
  provider_rate_limited: 429,
  provider_request_rejected: 502,
  provider_timeout: 502,
  provider_network_error: 502,
  provider_result_uncertain: 502,
  local_finalize_failed: 502,
  unknown_publish_error: 502,
  internal_error: 500,
};

/** Builds the safe, static route error for a given stable machine-readable code. Always retryable: false — no publish outcome in this checkpoint is presented as safe to retry automatically. */
export function buildPublishRouteError(code: PublishRouteErrorCode): PublishRouteError {
  return { status: STATUS_BY_CODE[code], code, message: MESSAGE_BY_CODE[code], retryable: false };
}
