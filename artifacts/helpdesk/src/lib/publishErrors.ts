import type { PublishRouteErrorCode } from "@/lib/assistantsApi";

/**
 * Milestone 1 / Checkpoint E3C: static, user-friendly copy for every known
 * publish route error code (see backend publishHttpErrors.ts, read-only).
 * Machine codes are never shown to the customer as the primary message —
 * this is the only place that maps a code to display text. Codes whose
 * outcome the frontend instead recovers from via a refetch (already
 * published / in progress) are intentionally excluded here; callers should
 * special-case those before consulting this map.
 */
const ROUTE_ERROR_COPY: Record<PublishRouteErrorCode, string> = {
  publish_disabled: "Publishing is not enabled in this environment.",
  invalid_request: "That publish request wasn't valid. Please try again.",
  assistant_not_found: "Assistant not found.",
  assistant_config_invalid:
    "This assistant's configuration can't be published as-is. Review the builder and save your changes, then try again.",
  unsupported_preset:
    "The selected voice preset isn't supported for publishing. Choose a different preset, save your changes, and try again.",
  already_published: "This assistant has already been published.",
  publish_in_progress: "Publishing is already in progress.",
  publish_uncertain:
    "Publishing could not be confirmed. Do not publish again. Contact support before taking another action.",
  publish_state_conflict: "This assistant isn't in a publishable state right now.",
  provider_authentication_failed:
    "The voice provider couldn't be reached right now. Contact support if this continues.",
  provider_rate_limited: "The voice provider is temporarily busy. You can try again later.",
  provider_request_rejected:
    "The voice provider rejected this request. Review the assistant configuration and try again.",
  provider_timeout: "Publishing could not be confirmed. Do not publish again.",
  provider_network_error: "Publishing could not be confirmed. Do not publish again.",
  provider_result_uncertain: "Publishing could not be confirmed. Do not publish again.",
  local_finalize_failed: "Publishing could not be confirmed. Do not publish again.",
  unknown_publish_error: "The voice provider request failed. Please try again.",
  internal_error: "An internal error occurred. Please try again.",
};

const GENERIC_PUBLISH_ERROR_MESSAGE = "Something went wrong while publishing. Please try again.";

/**
 * Route error codes whose safe recovery is "refetch and show the
 * server-confirmed state" rather than a persistent error banner.
 */
export const REFETCH_AS_PUBLISHED_CODES: ReadonlySet<PublishRouteErrorCode> = new Set(["already_published"]);
export const REFETCH_AS_PUBLISHING_CODES: ReadonlySet<PublishRouteErrorCode> = new Set(["publish_in_progress"]);

/** Codes whose eventual server-confirmed state is expected to be publish_uncertain — never presented as an ordinary retryable error. */
export const UNCERTAIN_ROUTE_ERROR_CODES: ReadonlySet<PublishRouteErrorCode> = new Set([
  "publish_uncertain",
  "provider_timeout",
  "provider_network_error",
  "provider_result_uncertain",
  "local_finalize_failed",
]);

/**
 * Static, safe display copy for a publish route error code. Known codes
 * always take priority over the server-provided message. An unrecognized
 * code falls back to the (already bounded, already sanitized) server
 * message when present, else a generic safe message — never a raw code or
 * raw response content.
 */
export function publishRouteErrorMessage(code: PublishRouteErrorCode | undefined, serverMessage: string): string {
  if (code && code in ROUTE_ERROR_COPY) return ROUTE_ERROR_COPY[code];
  return serverMessage || GENERIC_PUBLISH_ERROR_MESSAGE;
}

/**
 * Milestone 1 / Checkpoint E3C: the exhaustive, server-owned allowlist of
 * `syncError` codes a persisted assistant DTO can carry (see backend
 * lib/voicePublishing/types.ts PUBLISH_SYNC_ERROR_CODES, read-only). Never
 * arbitrary text — only one of these fixed codes, or null.
 */
const PUBLISH_SYNC_ERROR_CODES = [
  "runtime_catalog_not_configured",
  "runtime_catalog_invalid",
  "unsupported_preset",
  "assistant_config_invalid",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_timeout",
  "provider_network_error",
  "provider_request_rejected",
  "provider_response_invalid",
  "provider_result_uncertain",
  "local_finalize_failed",
  "stale_publish_attempt",
  "unknown_publish_error",
] as const;

type PublishSyncErrorCode = (typeof PUBLISH_SYNC_ERROR_CODES)[number];

const SYNC_ERROR_COPY: Record<PublishSyncErrorCode, string> = {
  runtime_catalog_not_configured: "Publishing isn't fully configured in this environment yet.",
  runtime_catalog_invalid: "Publishing isn't fully configured in this environment yet.",
  unsupported_preset:
    "The selected voice preset isn't supported for publishing. Choose a different preset and save before publishing again.",
  assistant_config_invalid:
    "This assistant's configuration needs attention before it can be published. Review and save your changes.",
  provider_authentication_failed: "The voice provider couldn't be reached. Contact support if this continues.",
  provider_rate_limited: "The voice provider was temporarily busy. You can try publishing again later.",
  provider_timeout: "The previous publish attempt could not be confirmed.",
  provider_network_error: "The previous publish attempt could not be confirmed.",
  provider_request_rejected: "The voice provider rejected the previous publish attempt. Review the configuration.",
  provider_response_invalid: "The previous publish attempt could not be confirmed.",
  provider_result_uncertain: "The previous publish attempt could not be confirmed.",
  local_finalize_failed: "The previous publish attempt could not be confirmed.",
  stale_publish_attempt: "The previous publish attempt could not be confirmed.",
  unknown_publish_error: "The previous publish attempt failed.",
};

const PUBLISH_SYNC_ERROR_CODE_SET: ReadonlySet<string> = new Set(PUBLISH_SYNC_ERROR_CODES);

const GENERIC_SYNC_ERROR_MESSAGE = "Publishing failed for this assistant. Review the configuration and try again.";

/** Safe, static copy for a persisted assistant's `syncError` code. An unrecognized/malformed value never surfaces raw — it falls back to a generic message. */
export function safeSyncErrorMessage(code: string | null | undefined): string {
  if (code && PUBLISH_SYNC_ERROR_CODE_SET.has(code)) {
    return SYNC_ERROR_COPY[code as PublishSyncErrorCode];
  }
  return GENERIC_SYNC_ERROR_MESSAGE;
}
