import type { AssistantDto } from "@/lib/assistantsApi";
import { voiceBrowserTestEnabled } from "@/lib/featureFlags";
import { SYNC } from "@/pages/assistants/assistantsContract";

export interface BrowserTestEligibilityInput {
  /** Undefined/null for the new-unsaved builder route. */
  assistant: Pick<AssistantDto, "status" | "provider" | "providerLinked"> | null | undefined;
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

  if (!assistant.providerLinked && (!assistant.provider || assistant.provider === "vapi")) {
    return "The published provider connection is incomplete.";
  }
  if (assistant.provider !== "vapi") return "Browser testing is not available for this provider.";
  if (!assistant.providerLinked) return "The published provider connection is incomplete.";

  if (!voiceBrowserTestEnabled) return "Browser voice testing is not enabled in this environment.";
  if (!clientAvailable) return "Browser voice integration is not connected yet.";
  if (testActive) return "A browser test is already active.";

  return undefined;
}

export function isBrowserTestEligible(input: BrowserTestEligibilityInput): boolean {
  return browserTestDisabledReason(input) === undefined;
}

/**
 * A warning, not a blocker.
 *
 * A browser test dials the PROVIDER's assistant — `fetchBrowserTestSession`
 * hands the SDK a provider assistant id — so it always plays back the
 * configuration the provider last confirmed. When the saved configuration has
 * moved on, the call the owner is about to hear is not the one they just
 * wrote, and without this they would reasonably read the result as a verdict
 * on their latest changes.
 *
 * It deliberately does not disable the test: testing the assistant callers
 * actually reach is a legitimate thing to do, and is often exactly what is
 * wanted. It only says which version is being heard.
 */
export function browserTestSyncWarning(
  assistant: Pick<AssistantDto, "status" | "providerSyncState"> | null | undefined,
): string | undefined {
  if (!assistant || assistant.status !== "published") return undefined;
  return assistant.providerSyncState === "synchronized" ? undefined : SYNC.testUsesPublished;
}
