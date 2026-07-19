import type { AssistantDto } from "@/lib/assistantsApi";
import { voiceBrowserTestEnabled } from "@/lib/featureFlags";

export interface BrowserTestEligibilityInput {
  /** Undefined/null for the new-unsaved builder route. */
  assistant: Pick<AssistantDto, "status" | "provider" | "providerAssistantId"> | null | undefined;
  isDirty: boolean;
  savePending: boolean;
  publishPending: boolean;
  clientAvailable: boolean;
  /** True while a browser test is preparing/connecting/connected/ending. */
  testActive: boolean;
}

/**
 * Milestone 1 / Checkpoint F1: single source of truth for why Test is
 * disabled, in the deterministic priority order the checkpoint spec
 * requires. Returns `undefined` only when Test is fully eligible.
 */
export function browserTestDisabledReason(input: BrowserTestEligibilityInput): string | undefined {
  const { assistant, isDirty, savePending, publishPending, clientAvailable, testActive } = input;

  if (!assistant) return "Save and publish this assistant before testing.";
  if (isDirty) return "Save your changes before testing.";
  if (assistant.status === "draft" || assistant.status === "error")
    return "Publish this assistant before testing.";
  if (assistant.status === "publishing" || savePending || publishPending)
    return "Wait for publishing to finish before testing.";
  if (assistant.status === "publish_uncertain")
    return "Publishing could not be confirmed. Contact support before testing.";
  if (assistant.status === "unknown") return "Publish this assistant before testing.";
  if (assistant.status !== "published") return "Publish this assistant before testing.";

  if (!assistant.providerAssistantId && (!assistant.provider || assistant.provider === "vapi")) {
    return "The published provider connection is incomplete.";
  }
  if (assistant.provider !== "vapi") return "Browser testing is not available for this provider.";
  if (!assistant.providerAssistantId) return "The published provider connection is incomplete.";

  if (!voiceBrowserTestEnabled) return "Browser voice testing is not enabled in this environment.";
  if (!clientAvailable) return "Browser voice integration is not connected yet.";
  if (testActive) return "A browser test is already active.";

  return undefined;
}

export function isBrowserTestEligible(input: BrowserTestEligibilityInput): boolean {
  return browserTestDisabledReason(input) === undefined;
}
