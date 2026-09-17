/**
 * A business's voice choice, from the catalog to the provider payload.
 *
 * The customer failure this pins: the dashboard offered response styles the
 * environment's catalog did not define, and publishing then failed with
 * "unsupported preset". Voices and styles now come from the same catalog
 * publish resolves through, and a chosen voice is carried into the provider
 * payload by one resolver shared by publish, sync and the sync-state digest.
 *
 * Synthetic identifiers only (repository policy: no real provider identifier
 * in source or tests).
 */

import { describe, expect, it } from "vitest";
import { parseRuntimeCatalog, resolveRuntimePreset } from "./runtimeCatalog.js";
import { extractPublishableAssistantConfig } from "./persistedConfigMapper.js";
import { PublishFoundationError } from "./errors.js";

const SCHEMA_VERSION = 1;

const preset = (voiceId: string) => ({
  key: "natural-balanced",
  provider: "vapi",
  model: { provider: "test-model-co", model: "test-model" },
  voice: { provider: "vapi", voiceId, version: 2 },
  transcriber: { provider: "test-stt", model: "test-stt-1", language: "en" },
});

const voice = (key: string, voiceId: string) => ({
  key,
  label: key[0]!.toUpperCase() + key.slice(1),
  description: "A synthetic test voice.",
  voice: { provider: "vapi", voiceId, version: 2 },
});

const catalogJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, presets: [preset("test-voice-a")], voices: [voice("aria", "test-voice-a"), voice("brook", "test-voice-b")], ...extra });

const config = (voiceModel: Record<string, unknown>) => ({
  schemaVersion: SCHEMA_VERSION,
  voiceModel,
  prompt: { systemInstructions: "Answer politely.", firstMessageMode: "assistant-speaks-first", firstMessage: "Hello." },
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof PublishFoundationError ? e.code : "OTHER";
  }
  return undefined;
}

describe("runtime catalog voices", () => {
  it("parses an optional curated voice list alongside the presets", () => {
    const catalog = parseRuntimeCatalog(catalogJson());
    expect(Object.keys(catalog.voices)).toEqual(["aria", "brook"]);
    expect(catalog.voices.brook!.voice.voiceId).toBe("test-voice-b");
  });

  it("accepts a catalog with no voice list, as existing environments have", () => {
    const catalog = parseRuntimeCatalog(JSON.stringify({ version: 1, presets: [preset("test-voice-a")] }));
    expect(catalog.voices).toEqual({});
  });

  it("refuses duplicate, malformed, non-vapi and excessive voice entries", () => {
    expect(code(() => parseRuntimeCatalog(catalogJson({ voices: [voice("aria", "x"), voice("aria", "y")] })))).toBe("CATALOG_MALFORMED");
    expect(code(() => parseRuntimeCatalog(catalogJson({ voices: [voice("Not A Slug", "x")] })))).toBe("CATALOG_MALFORMED");
    expect(code(() => parseRuntimeCatalog(catalogJson({ voices: [{ ...voice("aria", "x"), voice: { provider: "other", voiceId: "x" } }] })))).toBe("CATALOG_MALFORMED");
    expect(code(() => parseRuntimeCatalog(catalogJson({ voices: [{ ...voice("aria", "x"), secret: "no" }] })))).toBe("CATALOG_MALFORMED");
    const many = Array.from({ length: 13 }, (_, i) => voice(`v${i}x`, `id${i}`));
    expect(code(() => parseRuntimeCatalog(catalogJson({ voices: many })))).toBe("CATALOG_MALFORMED");
  });
});

describe("resolving a saved choice to provider values", () => {
  const catalog = parseRuntimeCatalog(catalogJson());

  it("uses the style's own voice when no voice was chosen", () => {
    expect(resolveRuntimePreset(catalog, { presetKey: "natural-balanced" }).voice.voiceId).toBe("test-voice-a");
  });

  it("replaces only the voice when one was chosen; model and transcriber stay the style's", () => {
    const resolved = resolveRuntimePreset(catalog, { presetKey: "natural-balanced", voiceKey: "brook" });
    expect(resolved.voice).toEqual({ provider: "vapi", voiceId: "test-voice-b", version: 2 });
    expect(resolved.model).toEqual({ provider: "test-model-co", model: "test-model" });
    expect(resolved.transcriber.model).toBe("test-stt-1");
  });

  it("never mutates the catalog entry it resolved from", () => {
    resolveRuntimePreset(catalog, { presetKey: "natural-balanced", voiceKey: "brook" });
    expect(catalog.presets["natural-balanced"]!.voice.voiceId).toBe("test-voice-a");
  });

  it("refuses a style or voice the environment does not offer, instead of substituting one", () => {
    expect(code(() => resolveRuntimePreset(catalog, { presetKey: "highest-intelligence" }))).toBe("UNSUPPORTED_PRESET");
    expect(code(() => resolveRuntimePreset(catalog, { presetKey: "natural-balanced", voiceKey: "zed" }))).toBe("UNSUPPORTED_PRESET");
  });
});

describe("reading the choice from a saved assistant", () => {
  const catalog = parseRuntimeCatalog(catalogJson());

  it("reproduces the reported failure: a style the catalog does not define", () => {
    expect(code(() => extractPublishableAssistantConfig(config({ preset: "highest-intelligence" }), catalog))).toBe("UNSUPPORTED_PRESET");
  });

  it("carries a chosen voice through, and treats null as no choice", () => {
    expect(extractPublishableAssistantConfig(config({ preset: "natural-balanced", voice: "brook" }), catalog).voiceKey).toBe("brook");
    expect(extractPublishableAssistantConfig(config({ preset: "natural-balanced", voice: null }), catalog).voiceKey).toBeUndefined();
    expect(extractPublishableAssistantConfig(config({ preset: "natural-balanced" }), catalog).voiceKey).toBeUndefined();
  });

  it("refuses a withdrawn voice and a malformed one", () => {
    expect(code(() => extractPublishableAssistantConfig(config({ preset: "natural-balanced", voice: "zed" }), catalog))).toBe("UNSUPPORTED_PRESET");
    expect(code(() => extractPublishableAssistantConfig(config({ preset: "natural-balanced", voice: 7 }), catalog))).toBe("INVALID_ASSISTANT_CONFIG");
  });
});
