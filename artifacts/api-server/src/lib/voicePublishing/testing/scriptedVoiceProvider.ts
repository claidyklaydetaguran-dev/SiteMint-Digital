// AR-001A — TEST-ONLY. Never imported by production code.
//
// A `VoiceProvider` whose every call is answered from a script. It performs no
// network request of any kind: there is no fetch, no host, no credential, and
// no Vapi type anywhere in this file.
//
// `FakeVoiceProvider` (lib/voice/FakeVoiceProvider.ts, read-only and
// unmodified) already covers the success path faithfully, and the tests use it
// for exactly that. What it cannot do is fail: it throws only NOT_FOUND for a
// missing id, so none of the eight provider error codes the publish service
// branches on are reachable through it. This class fills that gap and nothing
// more — it is a failure generator, not a replacement.

import { VoiceProviderError, type VoiceProviderErrorCode } from "../../voice/errors.js";
import type { VoiceProvider } from "../../voice/VoiceProvider.js";
import type {
  VoiceAssistantDeleteResult,
  VoiceAssistantInput,
  VoiceAssistantResult,
} from "../../voice/types.js";

export type ScriptedOutcome =
  /** Resolve with a well-formed provider result. */
  | { kind: "success"; providerAssistantId?: string }
  /** Throw a normalized VoiceProviderError with this code. */
  | { kind: "providerError"; code: VoiceProviderErrorCode }
  /** Throw something that is NOT a VoiceProviderError — the service must treat this conservatively as uncertain. */
  | { kind: "unnormalizedThrow" }
  /** Never settle. Used to observe the in-flight window without a timer. */
  | { kind: "hang" };

export interface ScriptedVoiceProviderOptions {
  /** Consumed in order, one per createAssistant call. Exhausting it is an error, so an unexpected second call cannot pass silently. */
  outcomes: ScriptedOutcome[];
  /** Fixed timestamp for every result. */
  now?: Date;
}

export class ScriptedVoiceProvider implements VoiceProvider {
  private readonly outcomes: ScriptedOutcome[];
  private readonly now: Date;
  private index = 0;

  /** Every input handed to createAssistant, in order — lets a test assert what was (and was not) sent. */
  readonly createCalls: VoiceAssistantInput[] = [];

  constructor(options: ScriptedVoiceProviderOptions) {
    this.outcomes = options.outcomes;
    this.now = options.now ?? new Date("2026-08-25T00:00:00.000Z");
  }

  /** Number of times createAssistant was invoked. The duplicate-activation tests assert this is exactly 1. */
  get createCallCount(): number {
    return this.createCalls.length;
  }

  async createAssistant(input: VoiceAssistantInput): Promise<VoiceAssistantResult> {
    this.createCalls.push(input);
    const outcome = this.outcomes[this.index];
    this.index += 1;

    if (outcome === undefined) {
      throw new Error(
        `ScriptedVoiceProvider: createAssistant called ${this.index} time(s) but only ${this.outcomes.length} outcome(s) were scripted`,
      );
    }

    switch (outcome.kind) {
      case "success":
        return {
          provider: "vapi",
          providerAssistantId: outcome.providerAssistantId ?? "scripted_asst_0001",
          name: input.name,
          config: input.config,
          metadata: {},
          createdAt: new Date(this.now.getTime()),
          updatedAt: new Date(this.now.getTime()),
        };
      case "providerError":
        throw new VoiceProviderError(outcome.code, "Scripted provider failure.", { provider: "vapi" });
      case "unnormalizedThrow":
        throw new TypeError("Scripted non-normalized provider throw");
      case "hang":
        return new Promise<VoiceAssistantResult>(() => {
          // Intentionally never settles. No timer is created, so this leaks
          // nothing that could keep the process alive after the test ends.
        });
    }
  }

  // The publish path never calls these. They exist to satisfy the interface and
  // fail loudly if that ever stops being true.
  async getAssistant(): Promise<VoiceAssistantResult> {
    throw new Error("ScriptedVoiceProvider: getAssistant must not be called by the publish path");
  }

  async updateAssistant(): Promise<VoiceAssistantResult> {
    throw new Error("ScriptedVoiceProvider: updateAssistant must not be called by the publish path");
  }

  async deleteAssistant(): Promise<VoiceAssistantDeleteResult> {
    throw new Error("ScriptedVoiceProvider: deleteAssistant must not be called by the publish path");
  }
}
