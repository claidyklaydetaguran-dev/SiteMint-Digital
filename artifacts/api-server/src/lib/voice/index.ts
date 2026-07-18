// Milestone 1 / Checkpoint D: focused barrel for the voice-provider boundary.
// Importing this module has zero side effects: no network requests, no DB
// connections, no file writes, no timers, no route registration, and no
// provider registration.

export type {
  Clock,
  JsonObject,
  JsonValue,
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
  VoiceProviderKey,
} from "./types";
export { systemClock } from "./types";

export type { VoiceProviderErrorCode, VoiceProviderErrorOptions } from "./errors";
export { VoiceProviderError } from "./errors";

export type { VoiceProvider } from "./VoiceProvider";

export { FakeVoiceProvider, FAKE_PROVIDER_KEY } from "./FakeVoiceProvider";

export { VoiceProviderRegistry } from "./registry";

export {
  validateAssistantInput,
  validateAssistantName,
  validateExternalReference,
  validateJsonObject,
  validateOptionalJsonObject,
  validateProviderAssistantId,
  validateProviderKey,
} from "./validation";
