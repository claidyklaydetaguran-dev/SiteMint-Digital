import { describe, expect, it } from "vitest";
import { parseRuntimeCatalog } from "./runtimeCatalog.js";

function preset(key: string) {
  return {
    key,
    provider: "vapi",
    model: { provider: "test-model-provider", model: "test-model" },
    voice: { provider: "test-voice-provider", voiceId: "test-voice" },
    transcriber: {
      provider: "test-transcriber-provider",
      model: "test-transcriber",
      language: "en",
    },
  };
}

describe("parseRuntimeCatalog", () => {
  it("accepts the SiteMint preset allowlist and freezes the preset map", () => {
    const result = parseRuntimeCatalog(
      JSON.stringify({
        version: 1,
        presets: [
          preset("natural-balanced"),
          preset("fast-response"),
          preset("highest-intelligence"),
          preset("budget-friendly"),
        ],
      }),
    );

    expect(Object.keys(result.presets)).toEqual([
      "natural-balanced",
      "fast-response",
      "highest-intelligence",
      "budget-friendly",
    ]);
    expect(Object.isFrozen(result.presets)).toBe(true);
  });

  it("rejects duplicate preset keys", () => {
    expect(() =>
      parseRuntimeCatalog(
        JSON.stringify({
          version: 1,
          presets: [preset("natural-balanced"), preset("natural-balanced")],
        }),
      ),
    ).toThrow("duplicate preset key");
  });

  it("rejects unknown preset keys", () => {
    expect(() =>
      parseRuntimeCatalog(
        JSON.stringify({
          version: 1,
          presets: [preset("customer-controlled")],
        }),
      ),
    ).toThrow("unknown preset key");
  });

  it("rejects credentials or arbitrary fields in a preset", () => {
    expect(() =>
      parseRuntimeCatalog(
        JSON.stringify({
          version: 1,
          presets: [{ ...preset("natural-balanced"), apiKey: "must-not-pass" }],
        }),
      ),
    ).toThrow("unsupported field");
  });
});
