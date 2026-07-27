import { describe, expect, it } from "vitest";
import { VoiceProviderError } from "../../errors.js";
import {
  buildVapiAssistantRequestBody,
  mapVapiAssistantResponse,
} from "./mapper.js";

describe("Vapi assistant mapper", () => {
  it("builds the bounded provider request from validated runtime fields", () => {
    const request = buildVapiAssistantRequestBody("Front Desk", {
      model: { provider: "test-model-provider", model: "test-model" },
      voice: { provider: "test-voice-provider", voiceId: "test-voice" },
      transcriber: {
        provider: "test-transcriber-provider",
        model: "test-transcriber",
        language: "en",
      },
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Thank you for calling. How can I help?",
      systemInstructions: "Act as a concise receptionist.",
    });

    expect(request).toEqual({
      name: "Front Desk",
      model: {
        provider: "test-model-provider",
        model: "test-model",
        messages: [
          { role: "system", content: "Act as a concise receptionist." },
        ],
      },
      voice: { provider: "test-voice-provider", voiceId: "test-voice" },
      transcriber: {
        provider: "test-transcriber-provider",
        model: "test-transcriber",
        language: "en",
      },
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "Thank you for calling. How can I help?",
    });
  });

  it("maps only normalized response fields", () => {
    const result = mapVapiAssistantResponse({
      id: "assistant-test-1",
      name: "Front Desk",
      model: {
        provider: "test-model-provider",
        model: "test-model",
        messages: [
          { role: "system", content: "Act as a concise receptionist." },
        ],
      },
      voice: { provider: "test-voice-provider", voiceId: "test-voice" },
      transcriber: { provider: "test-transcriber-provider", language: "en" },
      firstMessageMode: "assistant-speaks-first",
      firstMessage: "How can I help?",
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-26T12:01:00.000Z",
      privateKey: "must-not-pass-through",
    });

    expect(result.providerAssistantId).toBe("assistant-test-1");
    expect(result.name).toBe("Front Desk");
    expect(result.config).not.toHaveProperty("privateKey");
    expect(result.metadata).toEqual({});
  });

  it("rejects a provider response without an assistant id", () => {
    expect(() =>
      mapVapiAssistantResponse({
        name: "Front Desk",
        createdAt: "2026-07-26T12:00:00.000Z",
        updatedAt: "2026-07-26T12:01:00.000Z",
      }),
    ).toThrow(VoiceProviderError);
  });
});
