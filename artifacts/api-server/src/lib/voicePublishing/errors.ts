// Milestone 1 / Checkpoint E3B1: normalized errors for the publish
// foundation (runtime catalog, persisted-config extraction, publish-state
// transitions). Every message here must be safe to log or return to an
// operator: no raw catalog JSON, no system instructions, no first message,
// no provider credentials, no database query text/parameters, no stack
// trace, and no internal `cause` serialization. Route-to-HTTP-status mapping
// is deliberately out of scope for this checkpoint (Checkpoint E3B2).

import { PUBLISH_SYNC_ERROR_CODES, UNKNOWN_PUBLISH_ERROR_CODE, type PublishSyncErrorCode } from "./types.js";

export type PublishFoundationErrorCode =
  | "CATALOG_NOT_CONFIGURED"
  | "CATALOG_MALFORMED"
  | "UNSUPPORTED_PRESET"
  | "INVALID_ASSISTANT_CONFIG"
  | "PUBLISH_STATE_CONFLICT"
  | "STALE_ATTEMPT"
  | "DATABASE_FAILURE";

const MAX_MESSAGE_LENGTH = 300;

function boundMessage(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > MAX_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH)}...` : trimmed;
}

/**
 * Normalized publish-foundation error. `message` is a short, bounded,
 * machine-safe description built only from field names / state names / codes
 * — never from customer-entered content (system instructions, first
 * message) or raw provider/catalog payloads. `cause` may hold an internal
 * value for local debugging but is never included in toJSON().
 */
export class PublishFoundationError extends Error {
  readonly code: PublishFoundationErrorCode;
  readonly cause?: unknown;

  constructor(code: PublishFoundationErrorCode, message: string, cause?: unknown) {
    super(boundMessage(message));
    this.name = "PublishFoundationError";
    this.code = code;
    this.cause = cause;
  }

  /** Safe, customer-neutral serialization. Never includes `cause` or a stack trace. */
  toJSON(): { code: PublishFoundationErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

/** DB-level bound, matching `ck_voice_assistants_sync_error_length`. Every code in PUBLISH_SYNC_ERROR_CODES is far shorter than this. */
export const MAX_SYNC_ERROR_LENGTH = 500;

const PUBLISH_SYNC_ERROR_CODE_SET: ReadonlySet<string> = new Set(PUBLISH_SYNC_ERROR_CODES);

export function isPublishSyncErrorCode(value: unknown): value is PublishSyncErrorCode {
  return typeof value === "string" && PUBLISH_SYNC_ERROR_CODE_SET.has(value);
}

/**
 * Converts an arbitrary value into a safe, allowlisted sync-error code.
 * `sync_error` must NEVER store arbitrary text — a raw provider error body,
 * an API key, an Authorization/Bearer value, a system prompt, a first
 * message, SQL text/parameters, a stack trace, or a serialized `cause` are
 * all rejected by construction here: none of those can ever equal one of
 * the fixed strings in PUBLISH_SYNC_ERROR_CODES, so any such value falls
 * through to UNKNOWN_PUBLISH_ERROR_CODE rather than being stored verbatim.
 * This is the ONLY function repository writers should use to obtain a
 * sync_error value from an untyped/external source; callers that already
 * hold a `PublishSyncErrorCode`-typed value can pass it directly without
 * calling this.
 */
export function toSafeSyncErrorCode(value: unknown): PublishSyncErrorCode {
  return isPublishSyncErrorCode(value) ? value : UNKNOWN_PUBLISH_ERROR_CODE;
}
