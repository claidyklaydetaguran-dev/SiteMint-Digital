// Milestone 1 / Checkpoint E3A: request/response mapping between the
// adapter-owned VapiAssistantRuntimeConfig and Vapi's assistant JSON shape.
// Only explicitly validated, known-safe fields are mapped in either
// direction — never a spread of the full input or the full provider
// response.

import { VoiceProviderError } from "../../errors";
import { cloneJsonValue } from "../../validation";
import type { JsonObject, VoiceAssistantResult } from "../../types";
import { VAPI_PROVIDER_KEY } from "./config";
import type { VapiAssistantRuntimeConfig } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Builds the Vapi create/update request body from a validated runtime config. Sends no undefined fields. */
export function buildVapiAssistantRequestBody(name: string, config: VapiAssistantRuntimeConfig): JsonObject {
  const model: JsonObject = {
    provider: config.model.provider,
    model: config.model.model,
    messages: [{ role: "system", content: config.systemInstructions }],
  };

  const voice: JsonObject = {
    provider: config.voice.provider,
    voiceId: config.voice.voiceId,
    ...(config.voice.version !== undefined ? { version: config.voice.version } : {}),
  };

  const transcriber: JsonObject = {
    provider: config.transcriber.provider,
    ...(config.transcriber.model !== undefined ? { model: config.transcriber.model } : {}),
    ...(config.transcriber.language !== undefined ? { language: config.transcriber.language } : {}),
  };

  return {
    name,
    model,
    voice,
    transcriber,
    firstMessageMode: config.firstMessageMode,
    ...(config.firstMessage !== undefined ? { firstMessage: config.firstMessage } : {}),
  };
}

function extractSystemInstructions(model: unknown): string {
  if (!isPlainObject(model) || !Array.isArray(model.messages)) return "";
  const systemMessage = model.messages.find((m) => isPlainObject(m) && m.role === "system");
  if (!isPlainObject(systemMessage)) return "";
  return asString(systemMessage.content) ?? "";
}

/** Reconstructs a provider-neutral config JSON object from only known-safe response subfields. */
function extractConfig(raw: Record<string, unknown>): JsonObject {
  const model = isPlainObject(raw.model) ? raw.model : {};
  const voice = isPlainObject(raw.voice) ? raw.voice : {};
  const transcriber = isPlainObject(raw.transcriber) ? raw.transcriber : {};

  const voiceVersion = asFiniteNumber(voice.version);
  const transcriberModel = asString(transcriber.model);
  const transcriberLanguage = asString(transcriber.language);
  const firstMessage = asString(raw.firstMessage);
  const firstMessageMode = asString(raw.firstMessageMode) ?? "assistant-speaks-first";

  const config: JsonObject = {
    model: {
      provider: asString(model.provider) ?? "",
      model: asString(model.model) ?? "",
    },
    voice: {
      provider: asString(voice.provider) ?? "",
      voiceId: asString(voice.voiceId) ?? "",
      ...(voiceVersion !== undefined ? { version: voiceVersion } : {}),
    },
    transcriber: {
      provider: asString(transcriber.provider) ?? "",
      ...(transcriberModel !== undefined ? { model: transcriberModel } : {}),
      ...(transcriberLanguage !== undefined ? { language: transcriberLanguage } : {}),
    },
    firstMessageMode,
    systemInstructions: extractSystemInstructions(raw.model),
    ...(firstMessage !== undefined ? { firstMessage } : {}),
  };

  return config;
}

function extractMetadata(raw: Record<string, unknown>): JsonObject {
  if (!isPlainObject(raw.metadata)) return {};
  try {
    return cloneJsonValue(raw.metadata) as JsonObject;
  } catch {
    // Provider returned a metadata shape that isn't plain JSON — omit rather
    // than propagate an un-cloneable/unsafe structure.
    return {};
  }
}

function parseDate(value: unknown, fieldName: string): Date {
  if (typeof value !== "string") {
    throw new VoiceProviderError("PROVIDER_ERROR", `Vapi response is missing a valid ${fieldName}.`, {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new VoiceProviderError("PROVIDER_ERROR", `Vapi response has an invalid ${fieldName}.`, {
      provider: VAPI_PROVIDER_KEY,
    });
  }
  return date;
}

/** Maps a raw Vapi assistant response into the normalized VoiceAssistantResult. Defensive: never returns the raw object. */
export function mapVapiAssistantResponse(raw: unknown): VoiceAssistantResult {
  if (!isPlainObject(raw)) {
    throw new VoiceProviderError("PROVIDER_ERROR", "Vapi response was not a valid assistant object.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }

  const id = asString(raw.id);
  if (!id || id.trim().length === 0) {
    throw new VoiceProviderError("PROVIDER_ERROR", "Vapi response is missing the assistant id.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }

  const rawName = asString(raw.name);
  const name = rawName?.trim();
  if (!name || name.length === 0) {
    throw new VoiceProviderError("PROVIDER_ERROR", "The voice provider returned an invalid assistant response.", {
      provider: VAPI_PROVIDER_KEY,
    });
  }

  const createdAt = parseDate(raw.createdAt, "createdAt");
  const updatedAt = parseDate(raw.updatedAt, "updatedAt");

  return {
    provider: VAPI_PROVIDER_KEY,
    providerAssistantId: id,
    name,
    config: extractConfig(raw),
    metadata: extractMetadata(raw),
    createdAt,
    updatedAt,
  };
}
