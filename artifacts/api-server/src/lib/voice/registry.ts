// Milestone 1 / Checkpoint D: explicit provider registry. Instances are
// isolated (no module-level global) and providers are registered/selected
// explicitly by the caller — nothing here reads VOICE_PROVIDER or any other
// environment variable, and nothing is registered automatically at import
// time.

import { VoiceProviderError } from "./errors";
import { validateProviderKey } from "./validation";
import type { VoiceProvider } from "./VoiceProvider";
import type { VoiceProviderKey } from "./types";

export class VoiceProviderRegistry {
  private readonly providers = new Map<VoiceProviderKey, VoiceProvider>();

  register(key: VoiceProviderKey, provider: VoiceProvider): void {
    const normalized = validateProviderKey(key);
    if (this.providers.has(normalized)) {
      throw new VoiceProviderError(
        "CONFLICT",
        `Provider "${normalized}" is already registered.`,
      );
    }
    this.providers.set(normalized, provider);
  }

  get(key: VoiceProviderKey): VoiceProvider {
    const normalized = validateProviderKey(key);
    const provider = this.providers.get(normalized);
    if (!provider) {
      throw new VoiceProviderError(
        "NOT_CONFIGURED",
        `Provider "${normalized}" is not registered.`,
      );
    }
    return provider;
  }

  has(key: VoiceProviderKey): boolean {
    const normalized = validateProviderKey(key);
    return this.providers.has(normalized);
  }
}
