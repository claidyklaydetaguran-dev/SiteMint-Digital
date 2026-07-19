// Milestone 1 / Checkpoint E3B2: lazy production VoiceProvider construction.
// Importing this module has zero side effects: VAPI_API_KEY is read only
// when createProductionVoiceProvider() is explicitly invoked by the publish
// service, never at module import time, never automatically, and never with
// a silent fallback provider or credential.

import { VapiVoiceProvider } from "../voice/providers/vapi/VapiVoiceProvider.js";
import { createVapiProviderConfig, readVapiApiKeyFromEnv } from "../voice/providers/vapi/config.js";
import type { VoiceProvider } from "../voice/VoiceProvider.js";

/**
 * Reads VAPI_API_KEY from the environment and constructs a VapiVoiceProvider
 * bound to the exact E3A canonical official base URL and bounded timeout.
 * Throws VoiceProviderError("NOT_CONFIGURED") when the key is missing or
 * blank — the caller (publishService) treats this as a pre-claim
 * configuration failure and makes no database or provider network call.
 * Never logs or includes the API key anywhere in a thrown error.
 */
export function createProductionVoiceProvider(): VoiceProvider {
  const apiKey = readVapiApiKeyFromEnv();
  const config = createVapiProviderConfig({ apiKey });
  return new VapiVoiceProvider(config);
}
