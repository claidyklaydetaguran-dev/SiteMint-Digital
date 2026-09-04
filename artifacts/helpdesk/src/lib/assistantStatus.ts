import type { AssistantDto, AssistantStatus } from "@/lib/assistantsApi";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * Milestone 1 / Checkpoint E3C: shared status display + eligibility rules
 * for the assistant list and builder. Single source of truth so a status
 * badge, a filter option, and an eligibility check can never silently drift
 * from one another.
 */

export const STATUS_LABEL: Record<AssistantStatus, string> = {
  draft: "Draft",
  publishing: "Publishing",
  published: "Published",
  error: "Error",
  publish_uncertain: "Publish uncertain",
  unknown: "Unknown",
};

export const STATUS_TONE: Record<AssistantStatus, StatusTone> = {
  draft: "neutral",
  publishing: "info",
  published: "success",
  error: "destructive",
  publish_uncertain: "warning",
  unknown: "neutral",
};

/**
 * Delete stays eligible only for a clean, unlinked draft. An "unknown"
 * status (malformed/unrecognized server value) fails closed here for free,
 * since it is never equal to "draft".
 */
export function isEligibleForDelete(
  assistant: Pick<AssistantDto, "status" | "provider" | "providerLinked">,
): boolean {
  return assistant.status === "draft" && !assistant.provider && !assistant.providerLinked;
}

/**
 * Publish is eligible only for a persisted, clean, provider-unlinked
 * assistant in "draft" or "error" status. Callers must additionally gate on
 * the two frontend feature flags, an authenticated firm id, no dirty local
 * edits, no pending Save Draft, no pending publish mutation, and local
 * builder-name validity — those depend on component state this helper
 * doesn't have, so it only encodes the assistant-shape half of the rule.
 */
export function isPublishableStatus(status: AssistantStatus): boolean {
  return status === "draft" || status === "error";
}

/**
 * V5 PR-6 (C-1): the one-assistant status card collapses the six detailed
 * statuses this journey can report into the three an owner needs at a
 * glance. "Needs update" covers every state that is not a clean, confirmed
 * publish: error, publish_uncertain, publishing, an unrecognized status, or a
 * published assistant whose provider hasn't confirmed the saved
 * configuration (`providerSyncState !== "synchronized"`) — never claiming
 * "Published" for a state this journey cannot actually confirm is live.
 */
export type CardStatusKey = "draft" | "published" | "needs_update";

export const CARD_STATUS_LABEL: Record<CardStatusKey, string> = {
  draft: "Draft",
  published: "Published",
  needs_update: "Needs update",
};

export const CARD_STATUS_TONE: Record<CardStatusKey, StatusTone> = {
  draft: "neutral",
  published: "success",
  needs_update: "warning",
};

export function assistantCardStatus(
  assistant: Pick<AssistantDto, "status" | "providerSyncState">,
): { key: CardStatusKey; label: string; tone: StatusTone } {
  const key: CardStatusKey =
    assistant.status === "draft"
      ? "draft"
      : assistant.status === "published" && assistant.providerSyncState === "synchronized"
        ? "published"
        : "needs_update";
  return { key, label: CARD_STATUS_LABEL[key], tone: CARD_STATUS_TONE[key] };
}
