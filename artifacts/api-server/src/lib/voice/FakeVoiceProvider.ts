// Milestone 1 / Checkpoint D: deterministic, in-memory VoiceProvider
// implementation for development and testing. No network, no filesystem, no
// database, no environment variables, no timers, no randomness. Each
// instance owns fully isolated state — no module-level singleton.

import { VoiceProviderError } from "./errors";
import type { VoiceProvider } from "./VoiceProvider";
import type {
  Clock,
  JsonObject,
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
} from "./types";
import { systemClock } from "./types";
import { cloneJsonValue, validateAssistantInput, validateProviderAssistantId } from "./validation";

export const FAKE_PROVIDER_KEY = "fake";

interface StoredAssistant {
  provider: string;
  providerAssistantId: string;
  name: string;
  config: JsonObject;
  metadata: JsonObject;
  createdAt: Date;
  updatedAt: Date;
}

function toResult(record: StoredAssistant): VoiceAssistantResult {
  return {
    provider: record.provider,
    providerAssistantId: record.providerAssistantId,
    name: record.name,
    config: cloneJsonValue(record.config) as JsonObject,
    metadata: cloneJsonValue(record.metadata) as JsonObject,
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

export class FakeVoiceProvider implements VoiceProvider {
  private readonly store = new Map<string, StoredAssistant>();
  private readonly clock: Clock;
  private nextId = 1;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
  }

  private nextProviderAssistantId(): string {
    const id = `fake_asst_${String(this.nextId).padStart(6, "0")}`;
    this.nextId += 1;
    return id;
  }

  async createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    const validated = validateAssistantInput(input);
    const providerAssistantId = this.nextProviderAssistantId();
    const now = this.clock.now();

    const record: StoredAssistant = {
      provider: FAKE_PROVIDER_KEY,
      providerAssistantId,
      name: validated.name,
      config: cloneJsonValue(validated.config) as JsonObject,
      metadata: cloneJsonValue(validated.metadata ?? {}) as JsonObject,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(providerAssistantId, record);
    return toResult(record);
  }

  async getAssistant(providerAssistantId: string): Promise<VoiceAssistantResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const record = this.store.get(id);
    if (!record) {
      throw new VoiceProviderError("NOT_FOUND", "Assistant not found.", {
        provider: FAKE_PROVIDER_KEY,
      });
    }
    return toResult(record);
  }

  async updateAssistant(
    providerAssistantId: string,
    input: VoiceAssistantInput,
  ): Promise<VoiceAssistantResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const validated = validateAssistantInput(input);
    const existing = this.store.get(id);
    if (!existing) {
      throw new VoiceProviderError("NOT_FOUND", "Assistant not found.", {
        provider: FAKE_PROVIDER_KEY,
      });
    }

    const updated: StoredAssistant = {
      provider: existing.provider,
      providerAssistantId: existing.providerAssistantId,
      name: validated.name,
      config: cloneJsonValue(validated.config) as JsonObject,
      metadata: cloneJsonValue(validated.metadata ?? {}) as JsonObject,
      createdAt: existing.createdAt,
      updatedAt: this.clock.now(),
    };

    this.store.set(id, updated);
    return toResult(updated);
  }

  async deleteAssistant(providerAssistantId: string): Promise<VoiceAssistantDeleteResult> {
    const id = validateProviderAssistantId(providerAssistantId);
    const existed = this.store.delete(id);
    if (!existed) {
      throw new VoiceProviderError("NOT_FOUND", "Assistant not found.", {
        provider: FAKE_PROVIDER_KEY,
      });
    }
    return { providerAssistantId: id, deleted: true };
  }
}
