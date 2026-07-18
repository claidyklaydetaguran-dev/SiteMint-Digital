// Milestone 1 / Checkpoint D: normalized provider errors. All providers
// (real or fake) must throw this type so calling code never branches on a
// vendor-specific error shape.

export type VoiceProviderErrorCode =
  | "NOT_CONFIGURED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "AUTHENTICATION_FAILED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED_OPERATION";

/** Error codes that are generally safe to retry without caller changes. */
const RETRYABLE_CODES: ReadonlySet<VoiceProviderErrorCode> = new Set([
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

export interface VoiceProviderErrorOptions {
  /** Provider key this error originated from, when known (e.g. "fake"). */
  provider?: string;
  /** Explicit retry override. Defaults to a safe per-code default. */
  retryable?: boolean;
  /** Internal cause, kept off the public message and never serialized by default. */
  cause?: unknown;
}

/**
 * Normalized provider error. `message` is always safe to surface to an
 * operator/log; it must never contain credentials, headers, env values, or
 * unfiltered provider response bodies. `cause` may hold internal detail but
 * is not included in toJSON()/serialization.
 */
export class VoiceProviderError extends Error {
  readonly code: VoiceProviderErrorCode;
  readonly provider?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: VoiceProviderErrorCode,
    message: string,
    options: VoiceProviderErrorOptions = {},
  ) {
    super(message);
    this.name = "VoiceProviderError";
    this.code = code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.cause = options.cause;
  }

  /** Safe, customer-neutral serialization. Never includes `cause`. */
  toJSON(): { code: VoiceProviderErrorCode; message: string; provider?: string; retryable: boolean } {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      retryable: this.retryable,
    };
  }
}
