// Milestone 1 / Checkpoint E3A: server-side Vapi transport adapter. Real
// network calls only occur when a method is invoked on a constructed
// instance — importing this module causes zero network requests, zero
// environment reads, zero timers, and zero registration.

import { VoiceProviderError } from "../../errors";
import { validateAssistantInput, validateProviderAssistantId } from "../../validation";
import type { VoiceProvider } from "../../VoiceProvider";
import type { VoiceAssistantDeleteResult, VoiceAssistantInput, VoiceAssistantResult } from "../../types";
import { VAPI_PROVIDER_KEY, type VapiProviderConfig } from "./config";
import { buildVapiAssistantRequestBody, mapVapiAssistantResponse } from "./mapper";
import { validateVapiAssistantName, validateVapiRuntimeConfig } from "./types";

export { VAPI_PROVIDER_KEY } from "./config";

const MAX_RESPONSE_BODY_BYTES = 1_000_000;

type ParsedJson = { ok: true; value: unknown } | { ok: false };

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

function mapStatusToError(status: number): VoiceProviderError {
  if (status === 401 || status === 403) {
    return new VoiceProviderError("AUTHENTICATION_FAILED", "Vapi rejected the request credentials.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  if (status === 404) {
    return new VoiceProviderError("NOT_FOUND", "Vapi assistant was not found.", { provider: VAPI_PROVIDER_KEY });
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

export class VapiVoiceProvider implements VoiceProvider {
  private readonly config: VapiProviderConfig;

  constructor(config: VapiProviderConfig) {
    this.config = config;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

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
      if (controller.signal.aborted) {
        throw new VoiceProviderError("TIMEOUT", "Vapi request timed out.", {
          provider: VAPI_PROVIDER_KEY,
          cause: err,
          retryable: true,
        });
      }
      throw new VoiceProviderError("NETWORK_ERROR", "Network error contacting Vapi.", {
        provider: VAPI_PROVIDER_KEY,
        cause: err,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await readBoundedText(response);

    if (response.status >= 200 && response.status < 300) {
      const parsed = safeParseJson(text);
      if (!parsed.ok) {
        throw new VoiceProviderError("PROVIDER_ERROR", "Vapi returned a response that could not be parsed.", {
          provider: VAPI_PROVIDER_KEY,
        });
      }
      return parsed.value;
    }

    throw mapStatusToError(response.status);
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

  async deleteAssistant(providerAssistantId: string): Promise<VoiceAssistantDeleteResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    await this.request("DELETE", `/assistant/${encodeURIComponent(id)}`);
    return { providerAssistantId: id, deleted: true };
  }
}
