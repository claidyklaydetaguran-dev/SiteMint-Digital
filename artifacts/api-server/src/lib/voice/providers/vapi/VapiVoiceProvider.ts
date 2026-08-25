// Milestone 1 / Checkpoint E3A: server-side Vapi transport adapter. Real
// network calls only occur when a method is invoked on a constructed
// instance — importing this module causes zero network requests, zero
// environment reads, zero timers, and zero registration.
//
// AR-001E hardening: the configured timeout now covers the whole operation
// (dispatch, headers, body read, JSON parse) rather than stopping at the
// response headers, and `deleteAssistant` validates the documented success
// response instead of accepting any 2xx.

import { VoiceProviderError } from "../../errors";
import { validateAssistantInput, validateProviderAssistantId } from "../../validation";
import type { VoiceProvider } from "../../VoiceProvider";
import type { VoiceAssistantDeleteResult, VoiceAssistantInput, VoiceAssistantResult } from "../../types";
import { VAPI_PROVIDER_KEY, type VapiProviderConfig } from "./config";
import { buildVapiAssistantRequestBody, mapVapiAssistantResponse } from "./mapper";
import { validateVapiAssistantName, validateVapiRuntimeConfig } from "./types";

export { VAPI_PROVIDER_KEY } from "./config";

const MAX_RESPONSE_BODY_BYTES = 1_000_000;

/**
 * The only status Vapi documents as success for `DELETE /assistant/{id}`.
 * Every other 2xx is undocumented for this endpoint and therefore proves
 * nothing about whether the resource was removed.
 */
const VAPI_DOCUMENTED_DELETE_SUCCESS_STATUS = 200;

type ParsedJson = { ok: true; value: unknown } | { ok: false };

/** Raw transport result. Status classification is the caller's job. */
interface RawVapiResponse {
  status: number;
  text: string;
}

function safeParseJson(text: string): ParsedJson {
  if (text.length === 0) {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BODY_BYTES) {
    throw new VoiceProviderError("PROVIDER_ERROR", "Vapi response body exceeded the maximum allowed size.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BODY_BYTES) {
    throw new VoiceProviderError("PROVIDER_ERROR", "Vapi response body exceeded the maximum allowed size.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  return text;
}

/**
 * Distinguishes "our own deadline fired" from "the transport failed". Used for
 * both the dispatch/headers phase and the body-read phase, so a stalled body
 * is classified exactly like a stalled header wait.
 */
function classifyTransportError(err: unknown, controller: AbortController): VoiceProviderError {
  if (controller.signal.aborted) {
    return new VoiceProviderError("TIMEOUT", "Vapi request timed out.", {
      provider: VAPI_PROVIDER_KEY,
      cause: err,
      retryable: true,
    });
  }
  return new VoiceProviderError("NETWORK_ERROR", "Network error contacting Vapi.", {
    provider: VAPI_PROVIDER_KEY,
    cause: err,
    retryable: true,
  });
}

function mapStatusToError(status: number): VoiceProviderError {
  // 400/422 are request-rejection statuses: the provider evaluated the request
  // and refused it, so no state changed. They are definitive, not uncertain.
  if (status === 400 || status === 422) {
    return new VoiceProviderError("VALIDATION_FAILED", "Vapi rejected the request as invalid.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  if (status === 401 || status === 403) {
    return new VoiceProviderError("AUTHENTICATION_FAILED", "Vapi rejected the request credentials.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  if (status === 404) {
    // Deliberately worded as an observation, not a conclusion. Vapi does not
    // document what a 404 on this endpoint means — absent, inaccessible, or
    // addressed to a different organization are all consistent with it — so
    // this message must never be read as proof the resource does not exist.
    return new VoiceProviderError("NOT_FOUND", "Vapi returned HTTP 404 for this assistant.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  if (status === 409) {
    return new VoiceProviderError("CONFLICT", "Vapi reported a conflict for this request.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  if (status === 429) {
    return new VoiceProviderError("RATE_LIMITED", "Vapi rate-limited this request.", {
      provider: VAPI_PROVIDER_KEY,
      retryable: true,
    });
  }
  return new VoiceProviderError("PROVIDER_ERROR", `Vapi request failed with status ${status}.`, {
    provider: VAPI_PROVIDER_KEY,
  });
}

/** Uncertain-outcome error for a delete whose response did not prove anything. */
function undocumentedDeleteResponse(detail: string): VoiceProviderError {
  return new VoiceProviderError("PROVIDER_ERROR", `Vapi delete response was not conclusive: ${detail}`, {
    provider: VAPI_PROVIDER_KEY,
  });
}

export class VapiVoiceProvider implements VoiceProvider {
  private readonly config: VapiProviderConfig;

  constructor(config: VapiProviderConfig) {
    this.config = config;
  }

  /**
   * Performs one HTTP exchange under a single deadline.
   *
   * The abort timer is intentionally NOT cleared when the response headers
   * arrive: `this.config.timeoutMs` bounds the *whole* operation — dispatch,
   * waiting for headers, reading the body, and the caller's synchronous JSON
   * parse of the returned text. A response that stalls mid-body therefore
   * aborts and normalizes to TIMEOUT instead of hanging indefinitely. The
   * timer is cleared in the outer `finally`, on every path, so nothing is left
   * dangling and no rejection escapes unhandled.
   */
  private async send(method: string, path: string, body?: unknown): Promise<RawVapiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(`${this.config.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
          redirect: "error",
        });
      } catch (err) {
        throw classifyTransportError(err, controller);
      }

      let text: string;
      try {
        text = await readBoundedText(response);
      } catch (err) {
        // The size cap is already a normalized decision; anything else is a
        // transport failure or our own abort firing during the body read.
        if (err instanceof VoiceProviderError) throw err;
        throw classifyTransportError(err, controller);
      }

      return { status: response.status, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** JSON-2xx helper for create/get/update. Unchanged contract. */
  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const { status, text } = await this.send(method, path, body);

    if (status >= 200 && status < 300) {
      const parsed = safeParseJson(text);
      if (!parsed.ok) {
        throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned a response that could not be parsed.", {
          provider: VAPI_PROVIDER_KEY,
        });
      }
      return parsed.value;
    }

    throw mapStatusToError(status);
  }

  async createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    const validated = validateAssistantInput(input);
    const name = validateVapiAssistantName(validated.name);
    const runtimeConfig = validateVapiRuntimeConfig(validated.config);
    const body = buildVapiAssistantRequestBody(name, runtimeConfig);
    const raw = await this.request("POST", "/assistant", body);
    return mapVapiAssistantResponse(raw);
  }

  async getAssistant(providerAssistantId: string): Promise<VoiceAssistantResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const raw = await this.request("GET", `/assistant/${encodeURIComponent(id)}`);
    return mapVapiAssistantResponse(raw);
  }

  async updateAssistant(providerAssistantId: string, input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const validated = validateAssistantInput(input);
    const name = validateVapiAssistantName(validated.name);
    const runtimeConfig = validateVapiRuntimeConfig(validated.config);
    const body = buildVapiAssistantRequestBody(name, runtimeConfig);
    const raw = await this.request("PATCH", `/assistant/${encodeURIComponent(id)}`, body);
    return mapVapiAssistantResponse(raw);
  }

  /**
   * Deletes one assistant, and reports success ONLY on the response Vapi
   * actually documents for this endpoint.
   *
   * Vapi documents `DELETE /assistant/{id}` as returning `200` with the JSON
   * assistant object, whose `id` is the deleted assistant. This method treats
   * deletion as definitive only when all of that holds: status exactly 200, a
   * parseable JSON object body, and a nonblank string `id` exactly equal to
   * the id we asked to delete.
   *
   * Everything else — an undocumented 2xx, an empty body, unparseable JSON, a
   * missing/blank/mismatched id — resolves to PROVIDER_ERROR, which callers
   * classify as an uncertain outcome. That is deliberate: an unproven delete
   * must never be allowed to look like a proven one. In particular a 404 stays
   * NOT_FOUND and is NOT a success here; Vapi does not document whether a 404
   * means absent, inaccessible, or belonging to another organization.
   */
  async deleteAssistant(providerAssistantId: string): Promise<VoiceAssistantDeleteResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const { status, text } = await this.send("DELETE", `/assistant/${encodeURIComponent(id)}`);

    if (status !== VAPI_DOCUMENTED_DELETE_SUCCESS_STATUS) {
      if (status >= 200 && status < 300) {
        // 201/202/204/… are not documented for this endpoint. Never read one
        // as "accepted for asynchronous deletion" or as a completed deletion.
        throw undocumentedDeleteResponse(`status ${status} is not a documented success for this endpoint`);
      }
      throw mapStatusToError(status);
    }

    const parsed = safeParseJson(text);
    if (!parsed.ok) {
      throw undocumentedDeleteResponse("the 200 body was not valid JSON");
    }
    if (parsed.value === undefined) {
      throw undocumentedDeleteResponse("the 200 body was empty");
    }
    const value = parsed.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw undocumentedDeleteResponse("the 200 body was not a JSON object");
    }
    const returnedId = (value as Record<string, unknown>)["id"];
    if (typeof returnedId !== "string" || returnedId.trim().length === 0) {
      throw undocumentedDeleteResponse("the 200 body carried no usable assistant id");
    }
    // Compared against the requested id and never echoed into the message: a
    // mismatched id may name a resource this caller is not entitled to see.
    if (returnedId !== id) {
      throw undocumentedDeleteResponse("the 200 body reported a different assistant id than the one requested");
    }

    return { providerAssistantId: id, deleted: true };
  }
}
