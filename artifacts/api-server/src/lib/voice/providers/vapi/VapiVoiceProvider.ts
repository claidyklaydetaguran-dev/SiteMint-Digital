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
import type {
  JsonObject,
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
  VoiceBrowserTokenInput,
  VoiceBrowserTokenResult,
  VoicePhoneNumberRecord,
  VoiceSampleAudio,
} from "../../types";
import { VAPI_PROVIDER_KEY, type VapiProviderConfig } from "./config";
import { buildVapiArtifactPlan, loadVoiceArtifactPolicyFromEnv } from "./artifactPolicy";
import { buildVapiAssistantRequestBody, mapVapiAssistantResponse } from "./mapper";
import { validateVapiAssistantName, validateVapiRuntimeConfig } from "./types";

// ── Voice samples ────────────────────────────────────────────────────────────
// Vapi's voice library lists each voice with a preview recording hosted in
// Vapi's own storage. Only that host is ever fetched: the URL comes from
// Vapi's authenticated response for a voice already in our server catalog,
// never from a request parameter, and redirects are refused.
const VOICE_SAMPLE_HOST = /^vapi-voice-preview-audio-[a-z0-9-]+.s3.[a-z0-9-]+.amazonaws.com$/;
const VOICE_LIBRARY_TTL_MS = 60 * 60 * 1000;
const VOICE_SAMPLE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_VOICE_SAMPLE_BYTES = 4 * 1024 * 1024;
let voiceLibraryCache: { at: number; previews: Map<string, string> } | null = null;
const voiceSampleCache = new Map<string, { at: number; audio: VoiceSampleAudio }>();

/** Test hook: forget cached library and samples. */
export function resetVapiVoiceSampleCaches(): void {
  voiceLibraryCache = null;
  voiceSampleCache.clear();
}

function sampleContentType(header: string | null, url: URL): string | null {
  const type = (header ?? "").split(";")[0]!.trim().toLowerCase();
  if (type.startsWith("audio/")) return type;
  if (type === "" || type === "application/octet-stream" || type === "binary/octet-stream") {
    if (url.pathname.endsWith(".wav")) return "audio/wav";
    if (url.pathname.endsWith(".mp3")) return "audio/mpeg";
  }
  return null;
}

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

  /**
   * Resolves the server-owned artifact policy for one outgoing request.
   *
   * Read here, at the point of use, rather than captured at construction:
   * `providerFactory.createProductionVoiceProvider()` is shared with the
   * operator cleanup command, which only ever deletes and must keep working
   * without an artifact policy configured. Binding the policy to construction
   * would have made cleanup depend on it.
   *
   * This throws before any `fetch` is dispatched, so a missing or invalid
   * policy can never result in a provider request. The publish service checks
   * the same policy earlier still, before it claims the row; this is the
   * backstop that holds for any other caller.
   */
  private resolveArtifactPlan(): JsonObject {
    return buildVapiArtifactPlan(loadVoiceArtifactPolicyFromEnv());
  }

  async createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    const validated = validateAssistantInput(input);
    const name = validateVapiAssistantName(validated.name);
    const runtimeConfig = validateVapiRuntimeConfig(validated.config);
    const body = buildVapiAssistantRequestBody(name, runtimeConfig, this.resolveArtifactPlan());
    const raw = await this.request("POST", "/assistant", body);
    return mapVapiAssistantResponse(raw);
  }

  /**
   * AR-001V.3. Creates a PUBLIC token restricted to this assistant only.
   *
   * Verified against the live provider on 2026-09-12: a token carrying
   * `allowedAssistantIds: [A]` is refused with 403 when used to start a
   * different assistant, and refused again for a transient assistant — with no
   * call created, so a refusal costs nothing. That provider-side refusal is the
   * tenant boundary; our own endpoints returning 404 to other firms is a
   * separate, weaker layer that says nothing about a caller who goes straight
   * to the provider.
   */
  async createBrowserToken(input: VoiceBrowserTokenInput): Promise<VoiceBrowserTokenResult> {
    const assistantId = validateProviderAssistantId(input.providerAssistantId);
    const origins = input.allowedOrigins
      .map((o: string) => (typeof o === "string" ? o.trim() : ""))
      .filter((o: string) => o.length > 0);
    if (origins.length === 0) {
      throw new VoiceProviderError("VALIDATION_FAILED", "A browser token requires at least one allowed origin.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    const raw = await this.request("POST", "/token", {
      tag: "public",
      name: name.length > 0 ? name : "sitemint-browser-token",
      restrictions: {
        enabled: true,
        allowedOrigins: origins,
        allowedAssistantIds: [assistantId],
        allowTransientAssistant: false,
      },
    });
    const obj = raw as { id?: unknown; value?: unknown };
    const tokenId = typeof obj.id === "string" ? obj.id.trim() : "";
    const tokenValue = typeof obj.value === "string" ? obj.value.trim() : "";
    if (tokenId.length === 0 || tokenValue.length === 0) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned an unusable browser token.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }
    return { tokenId, tokenValue };
  }

  async deleteBrowserToken(tokenId: string): Promise<void> {
    const id = typeof tokenId === "string" ? tokenId.trim() : "";
    if (id.length === 0) {
      throw new VoiceProviderError("VALIDATION_FAILED", "A token id is required to revoke a browser token.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }
    await this.request("DELETE", `/token/${encodeURIComponent(id)}`);
  }

  /**
   * Reads the organisation's telephone numbers (`GET /phone-number`).
   *
   * Read only. Every field is passed through as the provider reported it and
   * normalized into the neutral record shape; nothing here interprets a status
   * word as health, and nothing here changes routing. An entry that carries no
   * usable id or number is skipped rather than guessed at — a half-parsed
   * number is worse than a shorter list, because the caller would go on to
   * assign it.
   */
  async listPhoneNumbers(): Promise<VoicePhoneNumberRecord[]> {
    const raw = await this.request("GET", "/phone-number");
    // The documented shape is a bare array; a paginated envelope is tolerated
    // so a provider-side change does not read to us as "no numbers exist".
    const entries = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { results?: unknown } | null)?.results)
        ? ((raw as { results: unknown[] }).results)
        : null;

    if (entries === null) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned a phone-number list in an unrecognized shape.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }

    const out: VoicePhoneNumberRecord[] = this.mapNumbers(entries);
    return out;
  }

  /**
   * Re-points one number at one assistant (`PATCH /phone-number/{id}`), or
   * detaches it with `null`. The provider's own answer is mapped and returned,
   * so the caller can check what actually happened rather than assume.
   */
  async setPhoneNumberAssistant(
    providerNumberId: string,
    providerAssistantId: string | null,
  ): Promise<VoicePhoneNumberRecord> {
    const id = typeof providerNumberId === "string" ? providerNumberId.trim() : "";
    if (id === "") {
      throw new VoiceProviderError("VALIDATION_FAILED", "A phone number id is required.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }
    const raw = await this.request("PATCH", `/phone-number/${encodeURIComponent(id)}`, {
      assistantId: providerAssistantId,
    });
    const [mapped] = this.mapNumbers([raw]);
    if (!mapped) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned an unusable phone-number response.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }
    return mapped;
  }

  /** Shared normalization for both the list and the single-number responses. */
  private mapNumbers(entries: readonly unknown[]): VoicePhoneNumberRecord[] {
    const out: VoicePhoneNumberRecord[] = [];
    for (const entry of entries) {
      if (entry === null || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const providerNumberId = typeof row.id === "string" ? row.id.trim() : "";
      const e164 = typeof row.number === "string" ? row.number.trim() : "";
      if (providerNumberId === "" || e164 === "") continue;
      out.push({
        providerNumberId,
        e164,
        origin: typeof row.provider === "string" ? row.provider : null,
        status: typeof row.status === "string" ? row.status : null,
        orgId: typeof row.orgId === "string" ? row.orgId : null,
        assignedAssistantId: typeof row.assistantId === "string" ? row.assistantId : null,
      });
    }
    return out;
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
    const body = buildVapiAssistantRequestBody(name, runtimeConfig, this.resolveArtifactPlan());
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

  /**
   * Returns the provider's own recording of one Vapi voice, or undefined when
   * the library has no usable preview for it. Library and audio are cached, so
   * repeated previews do not repeat provider traffic.
   */
  async getVoiceSample(voice: { provider: string; voiceId: string }): Promise<VoiceSampleAudio | undefined> {
    if (voice.provider !== "vapi") return undefined;
    const key = voice.voiceId.trim().toLowerCase();
    if (key === "") return undefined;

    const cached = voiceSampleCache.get(key);
    if (cached && Date.now() - cached.at < VOICE_SAMPLE_TTL_MS) return cached.audio;

    if (!voiceLibraryCache || Date.now() - voiceLibraryCache.at >= VOICE_LIBRARY_TTL_MS) {
      const raw = await this.request("GET", "/voice-library/vapi");
      const entries = Array.isArray(raw) ? raw : [];
      const previews = new Map<string, string>();
      for (const entry of entries) {
        if (entry === null || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        if (row.isDeleted === true) continue;
        const id = typeof row.providerId === "string" ? row.providerId.trim().toLowerCase() : "";
        const url = typeof row.previewUrl === "string" ? row.previewUrl.trim() : "";
        if (id && url) previews.set(id, url);
      }
      voiceLibraryCache = { at: Date.now(), previews };
    }

    const href = voiceLibraryCache.previews.get(key);
    if (!href) return undefined;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return undefined;
    }
    if (url.protocol !== "https:" || !VOICE_SAMPLE_HOST.test(url.hostname)) {
      throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned a voice preview from an unexpected host.", {
        provider: VAPI_PROVIDER_KEY,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal, redirect: "error" });
      } catch (err) {
        throw classifyTransportError(err, controller);
      }
      if (!response.ok) {
        throw new VoiceProviderError("PROVIDER_ERROR", `The voice preview could not be fetched (status ${response.status}).`, {
          provider: VAPI_PROVIDER_KEY,
        });
      }
      const contentType = sampleContentType(response.headers.get("content-type"), url);
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (!contentType || declared > MAX_VOICE_SAMPLE_BYTES) {
        throw new VoiceProviderError("PROVIDER_ERROR", "The voice preview was not a usable audio file.", {
          provider: VAPI_PROVIDER_KEY,
        });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_VOICE_SAMPLE_BYTES) {
        throw new VoiceProviderError("PROVIDER_ERROR", "The voice preview was empty or too large.", {
          provider: VAPI_PROVIDER_KEY,
        });
      }
      const audio: VoiceSampleAudio = { contentType, bytes };
      voiceSampleCache.set(key, { at: Date.now(), audio });
      return audio;
    } finally {
      clearTimeout(timer);
    }
  }
}
