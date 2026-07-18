// Milestone 1 / Checkpoint D: validation and safe deep-cloning for the
// provider-neutral boundary. All failures throw VoiceProviderError so callers
// never need to distinguish validation errors from provider errors.

import { VoiceProviderError } from "./errors";
import type { JsonObject, JsonValue, VoiceAssistantInput, VoiceProviderKey } from "./types";

export function validateProviderKey(key: unknown): VoiceProviderKey {
  if (typeof key !== "string") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Provider key must be a string.");
  }
  const normalized = key.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Provider key must not be empty.");
  }
  return normalized;
}

export function validateAssistantName(name: unknown): string {
  if (typeof name !== "string") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Assistant name must be a string.");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Assistant name must not be empty.");
  }
  return trimmed;
}

export function validateProviderAssistantId(id: unknown): string {
  if (typeof id !== "string") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Provider assistant ID must be a string.");
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Provider assistant ID must not be empty.");
  }
  return trimmed;
}

export function validateExternalReference(ref: unknown): string | undefined {
  if (ref === undefined) return undefined;
  if (typeof ref !== "string") {
    throw new VoiceProviderError("VALIDATION_FAILED", "External reference must be a string.");
  }
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new VoiceProviderError("VALIDATION_FAILED", "External reference must not be empty when provided.");
  }
  return trimmed;
}

/**
 * Validate that `value` is a JSON-serializable value and return a deep,
 * defensive clone. Rejects functions, symbols, bigint, undefined-in-object,
 * Date, Map, Set, class instances (non-plain objects), circular references,
 * and non-finite numbers. Validates before cloning so no partial/invalid
 * structure is ever returned.
 */
export function cloneJsonValue(value: unknown, seen: Set<unknown> = new Set()): JsonValue {
  if (value === null) return null;

  const t = typeof value;

  if (t === "string" || t === "boolean") {
    return value as JsonValue;
  }

  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new VoiceProviderError("VALIDATION_FAILED", "Numbers must be finite.");
    }
    return value as number;
  }

  if (t === "bigint") {
    throw new VoiceProviderError("VALIDATION_FAILED", "bigint values are not supported.");
  }
  if (t === "function") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Function values are not supported.");
  }
  if (t === "symbol") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Symbol values are not supported.");
  }
  if (t === "undefined") {
    throw new VoiceProviderError("VALIDATION_FAILED", "undefined values are not supported.");
  }

  // t === "object" from here on.
  if (seen.has(value)) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Circular references are not supported.");
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const out = value.map((item) => cloneJsonValue(item, seen));
    seen.delete(value);
    return out;
  }

  if (value instanceof Date) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Date instances are not supported inside JSON config/metadata.");
  }
  if (value instanceof Map) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Map instances are not supported.");
  }
  if (value instanceof Set) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Set instances are not supported.");
  }

  const proto = Object.getPrototypeOf(value as object);
  if (proto !== Object.prototype && proto !== null) {
    throw new VoiceProviderError("VALIDATION_FAILED", "Only plain objects are supported.");
  }

  seen.add(value);
  const out: { [key: string]: JsonValue } = {};
  for (const [key, propValue] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneJsonValue(propValue, seen);
  }
  seen.delete(value);
  return out;
}

/** Validate and clone a required JSON-object field (e.g. `config`). */
export function validateJsonObject(value: unknown, fieldName: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new VoiceProviderError("VALIDATION_FAILED", `${fieldName} must be a plain object.`);
  }
  const cloned = cloneJsonValue(value);
  return cloned as JsonObject;
}

/** Validate and clone an optional JSON-object field (e.g. `metadata`). */
export function validateOptionalJsonObject(value: unknown, fieldName: string): JsonObject | undefined {
  if (value === undefined) return undefined;
  return validateJsonObject(value, fieldName);
}

/** Full validation of a provider-neutral assistant input. Returns a defensive clone. */
export function validateAssistantInput(input: unknown): VoiceAssistantInput {
  if (input === null || typeof input !== "object") {
    throw new VoiceProviderError("VALIDATION_FAILED", "Assistant input must be an object.");
  }
  const candidate = input as Record<string, unknown>;

  const name = validateAssistantName(candidate["name"]);
  const config = validateJsonObject(candidate["config"], "config");
  const metadata = validateOptionalJsonObject(candidate["metadata"], "metadata");
  const externalReference = validateExternalReference(candidate["externalReference"]);

  const result: VoiceAssistantInput = { name, config };
  if (metadata !== undefined) result.metadata = metadata;
  if (externalReference !== undefined) result.externalReference = externalReference;
  return result;
}
