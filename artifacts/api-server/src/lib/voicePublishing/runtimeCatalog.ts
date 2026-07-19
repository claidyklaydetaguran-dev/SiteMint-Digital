// Milestone 1 / Checkpoint E3B1: server-owned runtime preset catalog. This is
// a security boundary — it is the only place SiteMint decides which literal
// provider/model/voice/transcriber values may ever reach a real provider
// call in a later checkpoint. It never trusts customer-entered data and
// never imports frontend code.
//
// The catalog source is the VOICE_RUNTIME_CATALOG_JSON environment variable,
// read only when loadRuntimeCatalogFromEnv() is explicitly called — never at
// module import time. No real production model/voice/transcriber identifier
// is ever committed to source, .env files, docs, fixtures, migrations,
// tests, or logs; only clearly synthetic values may appear in tests, and
// only for the duration of the test.

import { PublishFoundationError } from "./errors.js";
import {
  RUNTIME_CATALOG_VERSION,
  type RuntimeCatalog,
  type RuntimeCatalogModel,
  type RuntimeCatalogPreset,
  type RuntimeCatalogTranscriber,
  type RuntimeCatalogVoice,
} from "./types.js";

export const VOICE_RUNTIME_CATALOG_ENV_VAR = "VOICE_RUNTIME_CATALOG_JSON";

/** Bounded input size, checked before JSON.parse is ever called. */
const MAX_CATALOG_JSON_BYTES = 32_768;

const MAX_PRESET_STRING_LENGTH = 200;

/**
 * The complete, server-approved set of SiteMint voice-preset keys. This is
 * intentionally the frontend `VoicePresetId` allowlist
 * (artifacts/helpdesk/src/lib/assistantEstimates.ts, `VOICE_MODEL_PRESETS`)
 * MINUS `"custom"`. The "custom" preset lets a customer configure
 * model/voice/transcriber via the Advanced tab, which per SiteMint policy
 * (CLAUDE.md, VOICE_PLATFORM policy) must never be trusted for a live
 * provider call — there is no safe way to represent "customer-supplied" in a
 * server-owned catalog entry. A config that selects "custom" therefore fails
 * closed as an unsupported preset; this is intentional, not an omission.
 *
 * A focused test (see runtimeCatalog.test.ts) compares this list against the
 * frontend registry so the two cannot silently drift apart, without creating
 * a runtime dependency from the API server on the frontend bundle.
 */
export const SITEMINT_PRESET_KEYS = [
  "natural-balanced",
  "fast-response",
  "highest-intelligence",
  "budget-friendly",
] as const;

export type SiteMintPresetKey = (typeof SITEMINT_PRESET_KEYS)[number];

export function isSiteMintPresetKey(value: string): value is SiteMintPresetKey {
  return (SITEMINT_PRESET_KEYS as readonly string[]).includes(value);
}

const TOP_LEVEL_KEYS = new Set(["version", "presets"]);
const PRESET_KEYS = new Set(["key", "provider", "model", "voice", "transcriber"]);
const MODEL_KEYS = new Set(["provider", "model"]);
const VOICE_KEYS = new Set(["provider", "voiceId", "version"]);
const TRANSCRIBER_KEYS = new Set(["provider", "model", "language"]);

function fail(message: string): never {
  throw new PublishFoundationError("CATALOG_MALFORMED", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNoUnknownKeys(obj: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      fail(`${label} contains an unsupported field.`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PRESET_STRING_LENGTH) {
    fail(`${label} must be a non-empty, bounded string.`);
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

function parseModel(value: unknown): RuntimeCatalogModel {
  if (!isPlainObject(value)) fail('Preset "model" must be a plain object.');
  requireNoUnknownKeys(value, MODEL_KEYS, 'Preset "model"');
  return {
    provider: requireNonEmptyString(value.provider, "model.provider"),
    model: requireNonEmptyString(value.model, "model.model"),
  };
}

function parseVoice(value: unknown): RuntimeCatalogVoice {
  if (!isPlainObject(value)) fail('Preset "voice" must be a plain object.');
  requireNoUnknownKeys(value, VOICE_KEYS, 'Preset "voice"');
  const version = optionalNonNegativeInteger(value.version, "voice.version");
  return {
    provider: requireNonEmptyString(value.provider, "voice.provider"),
    voiceId: requireNonEmptyString(value.voiceId, "voice.voiceId"),
    ...(version !== undefined ? { version } : {}),
  };
}

function parseTranscriber(value: unknown): RuntimeCatalogTranscriber {
  if (!isPlainObject(value)) fail('Preset "transcriber" must be a plain object.');
  requireNoUnknownKeys(value, TRANSCRIBER_KEYS, 'Preset "transcriber"');
  const model = optionalNonEmptyString(value.model, "transcriber.model");
  const language = optionalNonEmptyString(value.language, "transcriber.language");
  return {
    provider: requireNonEmptyString(value.provider, "transcriber.provider"),
    ...(model !== undefined ? { model } : {}),
    ...(language !== undefined ? { language } : {}),
  };
}

/**
 * Parses one array element of the `presets` array. The entry's `key` is read
 * and validated as part of the entry itself — this is the field that makes
 * duplicate detection possible: two distinct array elements can carry the
 * same `key` string, and unlike an object's property name, an array index
 * is never a place JSON.parse can silently collapse data into. The caller
 * (parseRuntimeCatalog) is responsible for rejecting a repeated `key` value
 * across entries.
 */
function parsePresetEntry(value: unknown, index: number): { key: string; preset: RuntimeCatalogPreset } {
  if (!isPlainObject(value)) {
    fail(`Runtime catalog preset at index ${index} must be a plain object.`);
  }
  requireNoUnknownKeys(value, PRESET_KEYS, `Runtime catalog preset at index ${index}`);

  const keyRaw = value.key;
  if (typeof keyRaw !== "string" || keyRaw.trim().length === 0) {
    fail(`Runtime catalog preset at index ${index} must have a non-empty "key".`);
  }
  const key = keyRaw.trim();
  if (!isSiteMintPresetKey(key)) {
    fail("Runtime catalog contains an unknown preset key.");
  }

  if (value.provider !== "vapi") {
    fail(`Preset "${key}" must have provider "vapi".`);
  }

  const preset: RuntimeCatalogPreset = {
    provider: "vapi",
    model: parseModel(value.model),
    voice: parseVoice(value.voice),
    transcriber: parseTranscriber(value.transcriber),
  };

  return { key, preset };
}

/**
 * Parses and strictly validates a runtime catalog JSON string. Bounds input
 * size before JSON.parse. Rejects unknown top-level/preset/nested keys,
 * non-"vapi" providers, empty/oversized strings, and any credential-,
 * firm-, or override-shaped key (those are simply not in any allowlist here,
 * so they are rejected as unknown fields rather than specially detected).
 * Returns a defensively-cloned, readonly catalog. Never echoes the raw input
 * in a thrown error.
 *
 * The wire format's `presets` field is a JSON ARRAY of `{key, ...}` entries,
 * not a keyed object. This is deliberate: a keyed JSON object
 * (`{"presets": {"x": ..., "x": ...}}`) has its duplicate key silently
 * collapsed to the last occurrence by JSON.parse itself, before any
 * validation code runs — so an object-keyed format can never actually
 * detect a duplicate preset key in the raw source. An array has no such
 * collapsing: two elements with the same `key` field both survive
 * `JSON.parse` and are both visible to the loop below, so a genuine
 * duplicate is observable and rejected here.
 */
export function parseRuntimeCatalog(raw: string): RuntimeCatalog {
  if (typeof raw !== "string") {
    fail("Runtime catalog must be a JSON string.");
  }
  const byteLength = Buffer.byteLength(raw, "utf8");
  if (byteLength === 0) {
    fail("Runtime catalog must not be empty.");
  }
  if (byteLength > MAX_CATALOG_JSON_BYTES) {
    fail(`Runtime catalog exceeds the maximum allowed size of ${MAX_CATALOG_JSON_BYTES} bytes.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("Runtime catalog is not valid JSON.");
  }

  if (!isPlainObject(parsed)) {
    fail("Runtime catalog must be a plain JSON object.");
  }
  requireNoUnknownKeys(parsed, TOP_LEVEL_KEYS, "Runtime catalog");

  if (parsed.version !== RUNTIME_CATALOG_VERSION) {
    fail(`Runtime catalog version must equal ${RUNTIME_CATALOG_VERSION}.`);
  }

  if (!Array.isArray(parsed.presets)) {
    fail('Runtime catalog "presets" must be an array.');
  }

  const presets: Record<string, RuntimeCatalogPreset> = {};
  parsed.presets.forEach((entry, index) => {
    const { key, preset } = parsePresetEntry(entry, index);
    if (Object.prototype.hasOwnProperty.call(presets, key)) {
      fail("Runtime catalog contains a duplicate preset key.");
    }
    presets[key] = preset;
  });

  return { version: RUNTIME_CATALOG_VERSION, presets: Object.freeze(presets) };
}

/**
 * Explicitly reads and parses VOICE_RUNTIME_CATALOG_JSON from the process
 * environment. Never called at module import time — callers (e.g. a future
 * publish route) must call this themselves at the point of use. Throws
 * PublishFoundationError("CATALOG_NOT_CONFIGURED") when unset, with no
 * silent fallback preset, provider, or FakeVoiceProvider default.
 */
export function loadRuntimeCatalogFromEnv(): RuntimeCatalog {
  const raw = process.env[VOICE_RUNTIME_CATALOG_ENV_VAR];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new PublishFoundationError(
      "CATALOG_NOT_CONFIGURED",
      `${VOICE_RUNTIME_CATALOG_ENV_VAR} is not set.`,
    );
  }
  return parseRuntimeCatalog(raw);
}

/** Looks up a single preset by key. Returns undefined for any key not present in this catalog — callers decide how to fail. */
export function getRuntimeCatalogPreset(catalog: RuntimeCatalog, presetKey: string): RuntimeCatalogPreset | undefined {
  return catalog.presets[presetKey];
}
