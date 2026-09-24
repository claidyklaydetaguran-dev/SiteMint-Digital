// Milestone 1 / Checkpoint E3A: focused barrel for the Vapi provider adapter.
// Importing this module has zero side effects: no network requests, no
// environment reads, no timers, and no provider/registry registration.

export {
  VAPI_PROVIDER_KEY,
  VAPI_OFFICIAL_BASE_URL,
  createVapiProviderConfig,
  readVapiApiKeyFromEnv,
} from "./config";
export type { VapiProviderConfig, VapiProviderConfigInput } from "./config";

export {
  VAPI_MAX_ASSISTANT_NAME_LENGTH,
  validateVapiRuntimeConfig,
  validateVapiAssistantName,
} from "./types";
export type { VapiAssistantRuntimeConfig, VapiFirstMessageMode } from "./types";

export { VapiVoiceProvider } from "./VapiVoiceProvider";
