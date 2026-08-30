// Milestone 1 / Checkpoint E1: request validation for the assistant
// persistence API. Reuses the provider-neutral JSON-safety cloning logic
// from lib/voice/validation.ts (pure, side-effect-free, no provider call)
// but never lets a VoiceProviderError escape this module.

import { VoiceProviderError } from "../voice/errors.js";
import { validateJsonObject } from "../voice/validation.js";
import type { JsonObject, JsonValue } from "../voice/types.js";
import { AssistantApiError } from "./errors.js";

export const ASSISTANT_TEMPLATE_KEYS = [
  "ai-receptionist",
  "appointment-setter",
  "lead-qualification",
  "customer-support",
  "after-hours-receptionist",
  "real-estate-inquiry",
  "law-firm-intake",
  "blank",
] as const;

export type AssistantTemplateKey = (typeof ASSISTANT_TEMPLATE_KEYS)[number];

const MAX_NAME_LENGTH = 100;
const MAX_CONFIG_BYTES = 100_000;
const POSTGRES_INT_MAX = 2147483647;
const ROUTE_ID_PATTERN = /^[1-9]\d*$/;

// Client-controlled fields that are never allowed in a create/update body.
const PROTECTED_FIELDS = new Set([
  "id",
  "firmId",
  "status",
  "provider",
  "providerAssistantId",
  "lastSyncedAt",
  "syncError",
  "createdAt",
  "updatedAt",
]);

const CREATE_ALLOWED_FIELDS = new Set(["name", "templateKey", "config"]);
const UPDATE_ALLOWED_FIELDS = new Set(["name", "templateKey", "config"]);

// Case/separator-insensitive credential-shaped key check. Inspects object
// keys only — never scans string values, so ordinary prompt text mentioning
// "password" or "secret" is unaffected.
const SECRET_KEY_SUBSTRINGS = [
  "apikey",
  "secret",
  "accesstoken",
  "authtoken",
  "authorization",
  "password",
  "privatekey",
  "databaseurl",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

function assertNoSecretKeys(value: JsonValue): void {
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretKeys(item);
    return;
  }

  for (const [key, propValue] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (SECRET_KEY_SUBSTRINGS.some((pattern) => normalized.includes(pattern))) {
      throw new AssistantApiError(
        "VALIDATION",
        `config must not contain a credential-like key ("${key}")`,
      );
    }
    assertNoSecretKeys(propValue);
  }
}

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new AssistantApiError("VALIDATION", "name must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LENGTH) {
    throw new AssistantApiError("VALIDATION", `name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

function validateTemplateKey(value: unknown): AssistantTemplateKey {
  if (typeof value !== "string" || !(ASSISTANT_TEMPLATE_KEYS as readonly string[]).includes(value)) {
    throw new AssistantApiError(
      "VALIDATION",
      "templateKey must be one of the supported assistant templates",
    );
  }
  return value as AssistantTemplateKey;
}

function validateConfig(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AssistantApiError("VALIDATION", "config must be a plain JSON object");
  }

  let cloned: JsonObject;
  try {
    cloned = validateJsonObject(value, "config");
  } catch (err) {
    if (err instanceof VoiceProviderError) {
      throw new AssistantApiError("VALIDATION", `config is invalid: ${err.message}`);
    }
    throw err;
  }

  assertNoSecretKeys(cloned);

  const byteSize = Buffer.byteLength(JSON.stringify(cloned), "utf8");
  if (byteSize > MAX_CONFIG_BYTES) {
    throw new AssistantApiError(
      "PAYLOAD_TOO_LARGE",
      `config exceeds the maximum allowed size of ${MAX_CONFIG_BYTES} bytes`,
    );
  }

  return cloned;
}

function assertNoUnknownOrProtectedFields(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.has(key)) {
      throw new AssistantApiError("VALIDATION", `"${key}" is not an editable field`);
    }
    if (!allowed.has(key)) {
      throw new AssistantApiError("VALIDATION", `Unknown field "${key}"`);
    }
  }
}

export interface CreateAssistantInput {
  name: string;
  templateKey: AssistantTemplateKey;
  config: JsonObject;
}

export function validateCreateBody(body: unknown): CreateAssistantInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new AssistantApiError("VALIDATION", "Request body must be a JSON object");
  }
  const candidate = body as Record<string, unknown>;
  assertNoUnknownOrProtectedFields(candidate, CREATE_ALLOWED_FIELDS);

  return {
    name: validateName(candidate["name"]),
    templateKey: validateTemplateKey(candidate["templateKey"]),
    config: validateConfig(candidate["config"]),
  };
}

export interface UpdateAssistantInput {
  name?: string;
  templateKey?: AssistantTemplateKey;
  config?: JsonObject;
}

export function validateUpdateBody(body: unknown): UpdateAssistantInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new AssistantApiError("VALIDATION", "Request body must be a JSON object");
  }
  const candidate = body as Record<string, unknown>;
  assertNoUnknownOrProtectedFields(candidate, UPDATE_ALLOWED_FIELDS);

  const patch: UpdateAssistantInput = {};
  if (candidate["name"] !== undefined) patch.name = validateName(candidate["name"]);
  if (candidate["templateKey"] !== undefined) {
    patch.templateKey = validateTemplateKey(candidate["templateKey"]);
  }
  if (candidate["config"] !== undefined) patch.config = validateConfig(candidate["config"]);

  if (Object.keys(patch).length === 0) {
    throw new AssistantApiError(
      "VALIDATION",
      "At least one of name, templateKey, config must be provided",
    );
  }

  return patch;
}

/**
 * Strict positive base-10 integer parse for route :id params. Rejects zero,
 * negatives, decimals, scientific notation, mixed strings, and values
 * outside the Postgres integer range.
 */
export function validateRouteId(raw: string): number {
  if (typeof raw !== "string" || !ROUTE_ID_PATTERN.test(raw)) {
    throw new AssistantApiError("VALIDATION", "Invalid assistant id");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > POSTGRES_INT_MAX) {
    throw new AssistantApiError("VALIDATION", "Invalid assistant id");
  }
  return parsed;
}
