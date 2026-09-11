// Milestone 1 / Checkpoint D: the provider-neutral contract. Any future real
// provider (e.g. a later VapiVoiceProvider) implements this interface and is
// registered under its own key via VoiceProviderRegistry — nothing outside
// that implementation may depend on vendor-specific types, URLs, or SDKs.
//
// Intentionally excludes (future checkpoints only): phone-number methods,
// webhook methods, voice/model listing, tools, analytics.
//
// AR-001V.3 deliberately adds ONE browser-call method, `createBrowserToken`.
// It is optional so a provider that cannot mint scoped browser credentials
// simply omits it and the browser-test path reports the capability as
// unavailable, rather than silently falling back to a broader credential.

import type {
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
  VoiceBrowserTokenInput,
  VoiceBrowserTokenResult,
} from "./types";

export interface VoiceProvider {
  createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult>;
  getAssistant(providerAssistantId: string): Promise<VoiceAssistantResult>;
  updateAssistant(
    providerAssistantId: string,
    input: VoiceAssistantInput,
  ): Promise<VoiceAssistantResult>;
  deleteAssistant(providerAssistantId: string): Promise<VoiceAssistantDeleteResult>;

  /**
   * Mints a browser-usable credential restricted to exactly one assistant.
   * Optional: absence means this provider offers no scoped browser credential.
   */
  createBrowserToken?(input: VoiceBrowserTokenInput): Promise<VoiceBrowserTokenResult>;
}
