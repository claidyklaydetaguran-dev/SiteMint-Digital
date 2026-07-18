// Milestone 1 / Checkpoint E3A: the adapter-owned explicit runtime
// configuration for a Vapi assistant. This is NOT the persisted E2 frontend
// config (`voiceModel.preset`, `advanced.*`) — it is a strictly validated
// shape that a future Checkpoint E3B will construct from a server-owned,
// approved preset catalog. SiteMint policy is fail-closed: model, voice, and
// transcriber are all required here even though Vapi's own API permits
// omitting them.

import { VoiceProviderError } from "../../errors";
import { VAPI_PROVIDER_KEY } from "./config";

/** Matches Vapi's documented firstMessageMode enum values. */
export type VapiFirstMessageMode = "assistant-speaks-first" | "assistant-waits-for-user";

export interface VapiAssistantRuntimeConfig {
  model: {
    provider: string;
    model: string;
  };
  voice: {
    provider: string;
    voiceId: string;
    version?: number;
  };
  transcriber: {
    provider: string;
    model?: string;
    language?: string;
  };
  firstMessageMode: VapiFirstMessageMode;
  firstMessage?: string;
  systemInstructions: string;
}

/** Vapi's documented assistant name limit. */
export const VAPI_MAX_ASSISTANT_NAME_LENGTH = 40;

const TOP_LEVEL_KEYS = new Set([
  "model",
  "voice",
  "transcriber",
  "firstMessageMode",
  "firstMessage",
  "systemInstructions",
]);
const MODEL_KEYS = new Set(["provider", "model"]);
const VOICE_KEYS = new Set(["provider", "voiceId", "version"]);
const TRANSCRIBER_KEYS = new Set(["provider", "model", "language"]);
const FIRST_MESSAGE_MODES: readonly VapiFirstMessageMode[] = [
  "assistant-speaks-first",
  "assistant-waits-for-user",
];

function fail(message: string): never {
  throw new VoiceProviderError("VALIDATION_FAILED", message, { provider: VAPI_PROVIDER_KEY });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNoUnknownKeys(obj: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      fail(`${label} contains an unsupported field: "${key}".`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(`${label} must not be empty.`);
  }
  return trimmed;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, label);
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer when provided.`);
  }
  return value;
}

/**
 * Strictly validates the adapter-owned Vapi runtime configuration. Throws
 * VoiceProviderError("VALIDATION_FAILED") for anything missing, malformed, or
 * outside the allowlisted keys. Never accepts credential-shaped fields.
 */
export function validateVapiRuntimeConfig(value: unknown): VapiAssistantRuntimeConfig {
  if (!isPlainObject(value)) {
    fail("Vapi runtime config must be a plain object.");
  }
  requireNoUnknownKeys(value, TOP_LEVEL_KEYS, "Vapi runtime config");

  if (!isPlainObject(value.model)) {
    fail('Vapi runtime config "model" must be a plain object.');
  }
  requireNoUnknownKeys(value.model, MODEL_KEYS, 'Vapi runtime config "model"');
  const model = {
    provider: requireNonEmptyString(value.model.provider, "model.provider"),
    model: requireNonEmptyString(value.model.model, "model.model"),
  };

  if (!isPlainObject(value.voice)) {
    fail('Vapi runtime config "voice" must be a plain object.');
  }
  requireNoUnknownKeys(value.voice, VOICE_KEYS, 'Vapi runtime config "voice"');
  const voiceVersion = optionalNonNegativeInteger(value.voice.version, "voice.version");
  const voice = {
    provider: requireNonEmptyString(value.voice.provider, "voice.provider"),
    voiceId: requireNonEmptyString(value.voice.voiceId, "voice.voiceId"),
    ...(voiceVersion !== undefined ? { version: voiceVersion } : {}),
  };

  if (!isPlainObject(value.transcriber)) {
    fail('Vapi runtime config "transcriber" must be a plain object.');
  }
  requireNoUnknownKeys(value.transcriber, TRANSCRIBER_KEYS, 'Vapi runtime config "transcriber"');
  const transcriberModel = optionalNonEmptyString(value.transcriber.model, "transcriber.model");
  const transcriberLanguage = optionalNonEmptyString(value.transcriber.language, "transcriber.language");
  const transcriber = {
    provider: requireNonEmptyString(value.transcriber.provider, "transcriber.provider"),
    ...(transcriberModel !== undefined ? { model: transcriberModel } : {}),
    ...(transcriberLanguage !== undefined ? { language: transcriberLanguage } : {}),
  };

  if (typeof value.firstMessageMode !== "string" || !FIRST_MESSAGE_MODES.includes(value.firstMessageMode as VapiFirstMessageMode)) {
    fail(`firstMessageMode must be one of: ${FIRST_MESSAGE_MODES.join(", ")}.`);
  }
  const firstMessageMode = value.firstMessageMode as VapiFirstMessageMode;

  const firstMessage = optionalNonEmptyString(value.firstMessage, "firstMessage");
  const systemInstructions = requireNonEmptyString(value.systemInstructions, "systemInstructions");

  return {
    model,
    voice,
    transcriber,
    firstMessageMode,
    ...(firstMessage !== undefined ? { firstMessage } : {}),
    systemInstructions,
  };
}

/**
 * Validates the assistant name against Vapi's documented 40-character limit.
 * Never truncates — a name over the limit is a validation failure.
 */
export function validateVapiAssistantName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    fail("Assistant name must not be empty.");
  }
  if (trimmed.length > VAPI_MAX_ASSISTANT_NAME_LENGTH) {
    fail(`Assistant name must be at most ${VAPI_MAX_ASSISTANT_NAME_LENGTH} characters.`);
  }
  return trimmed;
}
