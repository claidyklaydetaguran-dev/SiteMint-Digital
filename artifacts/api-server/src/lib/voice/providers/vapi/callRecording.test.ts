import { afterEach, describe, expect, it, vi } from "vitest";
import { VapiVoiceProvider } from "./VapiVoiceProvider";
import { createVapiProviderConfig } from "./config";

const id = "65b908ed-d20c-4a24-96d0-ef7eed879c98";
const signed = "https://vapi-recordings.s3.us-west-2.amazonaws.com/call.wav?X-Amz-Signature=test";
const provider = () => new VapiVoiceProvider(createVapiProviderConfig({ apiKey: "test-only-private-key", timeoutMs: 1000 }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("private call recording transport", () => {
  it("uses the authenticated endpoint without following its redirect or caching the signed URL", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: signed } }));
    vi.stubGlobal("fetch", transport);
    const p = provider();
    expect(await p.getCallRecording(id)).toEqual({ url: signed });
    expect(await p.getCallRecording(id)).toEqual({ url: signed });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledWith(`https://api.vapi.ai/call/${id}/mono-recording`, expect.objectContaining({
      headers: { Authorization: "Bearer test-only-private-key" }, redirect: "manual",
    }));
  });
  it.each([404, 410])("keeps an absent artifact distinct from a provider failure (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await provider().getCallRecording(id)).toBeUndefined();
  });
  it.each([401, 403, 429, 500, 200, 307])("refuses undocumented success or provider errors (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(provider().getCallRecording(id)).rejects.toThrow();
  });
  it.each(["", "http://vapi-recordings.s3.amazonaws.com/x?s=1", "https://evil.example/x?s=1", "https://127.0.0.1/x?s=1", "https://key@vapi-recordings.s3.amazonaws.com/x?s=1", "https://vapi-recordings.s3.amazonaws.com/x"])("refuses unsafe or unsigned redirect %s", async (location) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location } })));
    await expect(provider().getCallRecording(id)).rejects.toThrow("Recording location is unavailable.");
  });
  it("rejects path injection before contacting the provider", async () => {
    const transport = vi.fn(); vi.stubGlobal("fetch", transport);
    await expect(provider().getCallRecording("../other-call")).rejects.toThrow("Invalid call identifier.");
    expect(transport).not.toHaveBeenCalled();
  });
  it("aborts a stalled provider request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const result = expect(provider().getCallRecording(id)).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1001);
    await result;
  });
});
