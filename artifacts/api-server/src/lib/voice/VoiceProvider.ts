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
  VoicePhoneNumberRecord,
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

  /**
   * Revokes a credential previously minted by `createBrowserToken`.
   *
   * Required for two things a mint-only contract cannot do: cleaning up a token
   * that was created but lost a write race (it would otherwise stay live at the
   * provider, referenced by nothing), and replacing a token the provider has
   * stopped accepting. Optional for the same reason `createBrowserToken` is —
   * absence degrades cleanup to "the token stays until an operator removes it",
   * which is reported honestly rather than assumed away.
   */
  deleteBrowserToken?(tokenId: string): Promise<void>;

  /**
   * Reads the telephone numbers the provider organisation holds.
   *
   * READ ONLY, and optional for the same reason `createBrowserToken` is: a
   * provider that cannot enumerate its stock simply omits it, and the caller
   * reports "cannot be read" rather than reporting an empty organisation.
   * That distinction matters — an empty list and an unanswerable question look
   * identical to a customer and mean opposite things to an operator.
   *
   * Acquiring, importing and releasing numbers are NOT here. Those spend money
   * and change where live calls land; they stay behind the separate,
   * owner-gated acquisition seam.
   */
  listPhoneNumbers?(): Promise<VoicePhoneNumberRecord[]>;

  /**
   * Points one telephone number at one assistant, or at nothing.
   *
   * This is the write that makes a number actually ring. Recording an
   * assignment in our own table does not route a single call: until the
   * provider is told, the number answers to nobody, and a business would be
   * looking at a dashboard that says "connected" beside a telephone that does
   * not work.
   *
   * Passing `null` detaches it. That is the other half of rollback — a number
   * we have released locally must stop routing at the provider too, or a
   * business that gave a number up keeps receiving its calls.
   *
   * Still not acquisition: this re-points a number the organisation already
   * owns, and buys, imports and releases nothing.
   */
  setPhoneNumberAssistant?(
    providerNumberId: string,
    providerAssistantId: string | null,
  ): Promise<VoicePhoneNumberRecord>;
}
