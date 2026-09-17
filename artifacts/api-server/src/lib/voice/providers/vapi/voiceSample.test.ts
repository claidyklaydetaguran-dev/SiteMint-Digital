/**
 * Voice samples through the real VapiVoiceProvider, with `fetch` stubbed.
 *
 * Pins: only Vapi's own preview host is ever fetched; the URL comes from the
 * authenticated library response, never a caller; redirects are refused;
 * non-audio and oversize bodies are rejected; and results are cached so
 * repeated previews add no provider traffic.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VapiVoiceProvider, resetVapiVoiceSampleCaches } from "./VapiVoiceProvider";
import { createVapiProviderConfig } from "./config";
import { VoiceProviderError } from "../../errors";

const realFetch = globalThis.fetch;
const HOST = "https://vapi-voice-preview-audio-us-west-2-production.s3.us-west-2.amazonaws.com";
let calls: Array<{ url: string; redirect?: string }> = [];

function install(library: unknown[], sample: () => Response) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect });
    if (url.endsWith("/voice-library/vapi")) {
      return new Response(JSON.stringify(library), { status: 200, headers: { "content-type": "application/json" } });
    }
    return sample();
  }) as typeof fetch;
}

const provider = () => new VapiVoiceProvider(createVapiProviderConfig({ apiKey: "test-key-not-real", timeoutMs: 1000 }));
const wav = () => new Response(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), { status: 200, headers: { "content-type": "audio/wav" } });

beforeEach(() => {
  calls = [];
  resetVapiVoiceSampleCaches();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("VapiVoiceProvider.getVoiceSample", () => {
  it("returns the library's own preview audio, and caches it", async () => {
    install([{ providerId: "Testvoice", previewUrl: `${HOST}/testvoice.wav` }], wav);
    const p = provider();
    const first = await p.getVoiceSample({ provider: "vapi", voiceId: "testvoice" });
    expect(first?.contentType).toBe("audio/wav");
    expect(first?.bytes.length).toBe(8);
    const second = await p.getVoiceSample({ provider: "vapi", voiceId: "TESTVOICE" });
    expect(second?.bytes.length).toBe(8);
    expect(calls.length).toBe(2); // one library read, one audio read
    expect(calls[1]!.url).toBe(`${HOST}/testvoice.wav`);
    expect(calls[1]!.redirect).toBe("error");
  });

  it("reports no sample for an unknown or deleted voice, and for other providers", async () => {
    install([{ providerId: "gone", previewUrl: `${HOST}/gone.wav`, isDeleted: true }], wav);
    expect(await provider().getVoiceSample({ provider: "vapi", voiceId: "gone" })).toBeUndefined();
    expect(await provider().getVoiceSample({ provider: "vapi", voiceId: "never" })).toBeUndefined();
    expect(await provider().getVoiceSample({ provider: "other", voiceId: "gone" })).toBeUndefined();
  });

  it("refuses a preview hosted anywhere but Vapi's preview bucket", async () => {
    install([{ providerId: "evil", previewUrl: "https://attacker.example/steal.wav" }], wav);
    await expect(provider().getVoiceSample({ provider: "vapi", voiceId: "evil" })).rejects.toBeInstanceOf(VoiceProviderError);
    expect(calls.some((c) => c.url.includes("attacker.example"))).toBe(false);
  });

  it("rejects a body that is not audio, and an empty one", async () => {
    install([{ providerId: "html", previewUrl: `${HOST}/x.wav` }], () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(provider().getVoiceSample({ provider: "vapi", voiceId: "html" })).rejects.toBeInstanceOf(VoiceProviderError);
    resetVapiVoiceSampleCaches();
    install([{ providerId: "empty", previewUrl: `${HOST}/y.wav` }], () => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "audio/wav" } }));
    await expect(provider().getVoiceSample({ provider: "vapi", voiceId: "empty" })).rejects.toBeInstanceOf(VoiceProviderError);
  });
});
