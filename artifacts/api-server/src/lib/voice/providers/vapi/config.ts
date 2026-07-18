// Milestone 1 / Checkpoint E3A: explicit Vapi provider configuration.
// Validation happens only during explicit construction (createVapiProviderConfig).
// No environment variable is read at module import time, and no provider
// instance is created or registered here.

import { VoiceProviderError } from "../../errors";

export const VAPI_PROVIDER_KEY = "vapi";

/** Official Vapi REST API base URL (docs.vapi.ai). This is the only accepted origin. */
export const VAPI_OFFICIAL_BASE_URL = "https://api.vapi.ai";

/** The only two caller-provided strings accepted: the bare origin, and the same with a trailing slash. */
const VAPI_ACCEPTED_BASE_URL_STRINGS: ReadonlySet<string> = new Set([
  VAPI_OFFICIAL_BASE_URL,
  `${VAPI_OFFICIAL_BASE_URL}/`,
]);

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Validates that a caller-supplied base URL is exactly the official Vapi
 * origin (`https://api.vapi.ai`, optionally with a single trailing slash) —
 * no alternate host, subdomain, port (including an explicit default port),
 * userinfo, query, fragment, or path is accepted. On success returns the
 * canonical `VAPI_OFFICIAL_BASE_URL` string; the caller-provided text is
 * never preserved or echoed back.
 *
 * This deliberately uses an exact string match rather than `URL`-based
 * structural validation: the WHATWG URL parser silently normalizes an
 * explicit default port away (e.g. `new URL("https://api.vapi.ai:443").port
 * === ""`), which would let a written-out `:443` slip past a
 * `parsed.port !== ""` check. An exact match against the two accepted
 * literal strings has no such normalization surface. Never logs or
 * includes the rejected input (which may contain credentials) in the
 * thrown error.
 */
function validateAndCanonicalizeBaseUrl(rawBaseUrl: string): string {
  if (typeof rawBaseUrl !== "string" || !VAPI_ACCEPTED_BASE_URL_STRINGS.has(rawBaseUrl)) {
    throw new VoiceProviderError("NOT_CONFIGURED", "Vapi base URL must be exactly the official Vapi API origin.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  return VAPI_OFFICIAL_BASE_URL;
}

export interface VapiProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface VapiProviderConfigInput {
  apiKey: string;
  /** Defaults to VAPI_OFFICIAL_BASE_URL when omitted. Must be exactly the official Vapi origin (https://api.vapi.ai, with or without a bare trailing slash) — no alternate host, port, userinfo, query, fragment, or path is accepted. */
  baseUrl?: string;
  /** Defaults to a safe bound when omitted. Must be within [1_000, 60_000]. */
  timeoutMs?: number;
}

/**
 * Validates and constructs Vapi provider configuration. Throws
 * VoiceProviderError("NOT_CONFIGURED") for any invalid/missing value. Never
 * logs or includes the API key in thrown messages.
 */
export function createVapiProviderConfig(input: VapiProviderConfigInput): VapiProviderConfig {
  if (typeof input?.apiKey !== "string" || input.apiKey.trim().length === 0) {
    throw new VoiceProviderError("NOT_CONFIGURED", "Vapi API key must be a non-empty string.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }

  const baseUrl = validateAndCanonicalizeBaseUrl(input.baseUrl ?? VAPI_OFFICIAL_BASE_URL);

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new VoiceProviderError(
      "NOT_CONFIGURED",
      `Vapi timeoutMs must be a number between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`,
      { provider: VAPI_PROVIDER_KEY },
    );
  }

  return {
    apiKey: input.apiKey.trim(),
    baseUrl,
    timeoutMs,
  };
}

/**
 * Optional helper for future startup code. Reads VAPI_API_KEY from the
 * environment. Not called anywhere in Checkpoint E3A.
 */
export function readVapiApiKeyFromEnv(): string {
  const value = process.env.VAPI_API_KEY;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VoiceProviderError("NOT_CONFIGURED", "VAPI_API_KEY environment variable is not set.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  return value.trim();
}
