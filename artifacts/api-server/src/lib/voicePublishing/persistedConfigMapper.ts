// Milestone 1 / Checkpoint E3B1: pure, side-effect-free extraction of only
// the customer-controlled fields needed to publish, from the persisted
// schemaVersion 1 assistant `config` JSON object (see
// artifacts/helpdesk/src/lib/assistantConfig.ts, `serializeDraftToConfig` /
// CONFIG_SCHEMA_VERSION — read-only reference, never imported here).
//
// This module never executes customer content, never interpolates
// environment variables, never does dynamic property access keyed by a
// customer string beyond a fixed, explicit set of known field names, and
// never logs or includes system instructions / first message in a thrown
// error. `advanced`, `rawOverrides`, `tools`, `knowledge`, `testing`, and
// `analysis` are read by nothing in this module — they are simply never
// referenced, so nothing from them can leak into the extracted result.

import { PublishFoundationError } from "./errors.js";
import { isSiteMintPresetKey } from "./runtimeCatalog.js";
import type { ExtractedAssistantPublishConfig, PublishFirstMessageMode, RuntimeCatalog } from "./types.js";
import { getRuntimeCatalogPreset } from "./runtimeCatalog.js";

/** Must match `CONFIG_SCHEMA_VERSION` in artifacts/helpdesk/src/lib/assistantConfig.ts. */
export const SUPPORTED_CONFIG_SCHEMA_VERSION = 1;

const MAX_SYSTEM_INSTRUCTIONS_LENGTH = 10_000;
const MAX_FIRST_MESSAGE_LENGTH = 1_000;

const FIRST_MESSAGE_MODES: readonly PublishFirstMessageMode[] = ["assistant-speaks-first", "wait-for-caller"];

function fail(message: string): never {
  throw new PublishFoundationError("INVALID_ASSISTANT_CONFIG", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNonEmptyString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    fail(`${label} must not be empty.`);
  }
  if (trimmed.length > maxLength) {
    fail(`${label} exceeds the maximum allowed length.`);
  }
  return trimmed;
}

function boundedOptionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    fail(`${label} must be a string when provided.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    fail(`${label} exceeds the maximum allowed length.`);
  }
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Extracts and strictly validates the fields needed to publish from a
 * persisted assistant `config`. Requires the preset selected in
 * `voiceModel.preset` to be both a known SiteMint preset key AND present in
 * the supplied server runtime catalog — a known-but-uncatalogued preset
 * (e.g. the catalog env var doesn't define it yet) fails closed exactly like
 * an unknown one, both as UNSUPPORTED_PRESET.
 */
export function extractPublishableAssistantConfig(
  config: unknown,
  catalog: RuntimeCatalog,
): ExtractedAssistantPublishConfig {
  if (!isPlainObject(config)) {
    fail("config must be a plain JSON object.");
  }

  if (config.schemaVersion !== SUPPORTED_CONFIG_SCHEMA_VERSION) {
    fail("config schemaVersion is not supported.");
  }

  if (!isPlainObject(config.voiceModel)) {
    fail('config "voiceModel" must be a plain object.');
  }
  const presetKeyRaw = config.voiceModel.preset;
  if (typeof presetKeyRaw !== "string" || presetKeyRaw.trim().length === 0) {
    fail('config "voiceModel.preset" must be a non-empty string.');
  }
  const presetKey = presetKeyRaw.trim();
  if (!isSiteMintPresetKey(presetKey)) {
    throw new PublishFoundationError("UNSUPPORTED_PRESET", "Selected voice preset is not supported for publishing.");
  }
  if (getRuntimeCatalogPreset(catalog, presetKey) === undefined) {
    throw new PublishFoundationError(
      "UNSUPPORTED_PRESET",
      "Selected voice preset is not present in the server runtime catalog.",
    );
  }

  if (!isPlainObject(config.prompt)) {
    fail('config "prompt" must be a plain object.');
  }

  const systemInstructions = boundedNonEmptyString(
    config.prompt.systemInstructions,
    "prompt.systemInstructions",
    MAX_SYSTEM_INSTRUCTIONS_LENGTH,
  );

  const firstMessageModeRaw = config.prompt.firstMessageMode;
  if (
    typeof firstMessageModeRaw !== "string" ||
    !(FIRST_MESSAGE_MODES as readonly string[]).includes(firstMessageModeRaw)
  ) {
    fail('config "prompt.firstMessageMode" must be a supported first-message behavior.');
  }
  const firstMessageMode = firstMessageModeRaw as PublishFirstMessageMode;

  const firstMessage = boundedOptionalString(config.prompt.firstMessage, "prompt.firstMessage", MAX_FIRST_MESSAGE_LENGTH);
  if (firstMessageMode === "assistant-speaks-first" && firstMessage === undefined) {
    fail('config "prompt.firstMessage" must not be empty when firstMessageMode is "assistant-speaks-first".');
  }

  return {
    presetKey,
    systemInstructions,
    firstMessageMode,
    ...(firstMessage !== undefined ? { firstMessage } : {}),
  };
}
