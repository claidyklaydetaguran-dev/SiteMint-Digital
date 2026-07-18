// Milestone 1 / Checkpoint D: the provider-neutral contract. Any future real
// provider (e.g. a later VapiVoiceProvider) implements this interface and is
// registered under its own key via VoiceProviderRegistry — nothing outside
// that implementation may depend on vendor-specific types, URLs, or SDKs.
//
// Intentionally excludes (future checkpoints only): browser-call methods,
// phone-number methods, webhook methods, voice/model listing, tools,
// analytics.

import type {
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
} from "./types";

export interface VoiceProvider {
  createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult>;
  getAssistant(providerAssistantId: string): Promise<VoiceAssistantResult>;
  updateAssistant(
    providerAssistantId: string,
    input: VoiceAssistantInput,
  ): Promise<VoiceAssistantResult>;
  deleteAssistant(providerAssistantId: string): Promise<VoiceAssistantDeleteResult>;
}
