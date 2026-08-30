// AR-001V.1: the single, narrow boundary through which a provider assistant
// id may reach a browser.
//
// The id is not a secret in the way a key is — the Vapi Web SDK is handed it
// verbatim to start a call, so during an authorized browser test the
// authenticated owner's page necessarily has it. The requirement is
// confinement, not pretence: it must not sit in every list response, in every
// detail response, in a disabled-feature bundle, in a log line, or in an error
// body. It is issued here and nowhere else, once, on an explicit request that
// only happens after the owner confirms Start Browser Test.
//
// Every check below fails closed and none of them contacts a provider, reads a
// credential, constructs a provider client, or touches the microphone. This
// module resolves one firm-scoped row and returns two strings.

import { isVoiceBrowserTestEnabled } from "../voicePublishing/featureFlags.js";
import { voiceAssistantRepository } from "./repository.js";

/** The only provider key a browser test may be started for. Provider-neutral literal, no provider import. */
const VAPI_PROVIDER_NAME = "vapi";

export type BrowserTestSessionErrorCode =
  | "browser_test_disabled"
  | "invalid_request"
  | "assistant_not_found"
  | "assistant_not_published"
  | "provider_link_missing"
  | "unsupported_provider"
  | "internal_error";

export interface BrowserTestSessionError {
  status: number;
  code: BrowserTestSessionErrorCode;
  message: string;
}

/**
 * The complete response shape. Two fields, both required by the Web SDK to
 * start a call against an existing assistant.
 *
 * Deliberately absent: system instructions, first message, model/voice/
 * transcriber, artifact policy, the public key (which the browser gets from
 * its own build, never from an API), the private key, firmId, the database
 * row id, timestamps, publish status, attempt ids, the config digest, and any
 * field that would let a caller assemble a transient assistant.
 */
export interface BrowserTestSessionDto {
  provider: string;
  providerAssistantId: string;
}

export type BrowserTestSessionResult =
  | { ok: true; session: BrowserTestSessionDto }
  | { ok: false; error: BrowserTestSessionError };

const MESSAGE_BY_CODE: Record<BrowserTestSessionErrorCode, string> = {
  browser_test_disabled: "Browser testing is not currently available.",
  invalid_request: "The request was not valid.",
  assistant_not_found: "Assistant not found.",
  assistant_not_published: "This assistant has not been published yet.",
  provider_link_missing: "This assistant has no confirmed provider connection to test.",
  unsupported_provider: "Browser testing is not available for this assistant's provider.",
  internal_error: "An internal error occurred.",
};

const STATUS_BY_CODE: Record<BrowserTestSessionErrorCode, number> = {
  browser_test_disabled: 503,
  invalid_request: 400,
  assistant_not_found: 404,
  assistant_not_published: 409,
  provider_link_missing: 409,
  unsupported_provider: 409,
  internal_error: 500,
};

export function buildBrowserTestSessionError(code: BrowserTestSessionErrorCode): BrowserTestSessionError {
  return { status: STATUS_BY_CODE[code], code, message: MESSAGE_BY_CODE[code] };
}

export interface BrowserTestSessionDependencies {
  /** Explicit server switch, never read at module import time. Authoritative over any client build flag. */
  isEnabled: () => boolean;
  findByIdForFirm: typeof voiceAssistantRepository.findByIdForFirm;
}

export const defaultBrowserTestSessionDependencies: BrowserTestSessionDependencies = {
  isEnabled: isVoiceBrowserTestEnabled,
  findByIdForFirm: voiceAssistantRepository.findByIdForFirm,
};

function failure(code: BrowserTestSessionErrorCode): BrowserTestSessionResult {
  return { ok: false, error: buildBrowserTestSessionError(code) };
}

/**
 * Issues browser-test metadata for exactly one firm-scoped assistant.
 * `firmId` must come only from the authenticated server session; this
 * function never reads it from anywhere else, and the lookup is firm-scoped,
 * so a cross-tenant id is indistinguishable from a nonexistent one.
 *
 * The server flag is checked FIRST, before the row is even read, so while it
 * is false no crafted request can learn whether an assistant exists.
 */
export async function getBrowserTestSession(
  firmId: number,
  assistantId: number,
  deps: BrowserTestSessionDependencies = defaultBrowserTestSessionDependencies,
): Promise<BrowserTestSessionResult> {
  if (!deps.isEnabled()) {
    return failure("browser_test_disabled");
  }

  const row = await deps.findByIdForFirm(firmId, assistantId);
  if (!row) {
    return failure("assistant_not_found");
  }
  if (row.status !== "published") {
    return failure("assistant_not_published");
  }
  if (row.provider === null || row.provider.trim().length === 0) {
    return failure("provider_link_missing");
  }
  if (row.provider !== VAPI_PROVIDER_NAME) {
    return failure("unsupported_provider");
  }
  const providerAssistantId = row.providerAssistantId;
  if (providerAssistantId === null || providerAssistantId.trim().length === 0) {
    return failure("provider_link_missing");
  }

  return { ok: true, session: { provider: VAPI_PROVIDER_NAME, providerAssistantId: providerAssistantId.trim() } };
}
