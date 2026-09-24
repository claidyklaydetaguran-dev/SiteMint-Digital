// ── The campaign an operator is editing, and what survives a save that fails ──
//
// Online-first: a save that cannot reach the server does not happen, and nothing
// here replays one. What must not also happen is losing what somebody typed. So
// until the server confirms a save, the editor's draft is kept in THIS browser
// (`lib/draftVault`, scoped to the signed-in person). When the campaign is next
// opened, the person is told it exists and decides what to do with it.
//
// Pure apart from that storage, so the rules can be tested without a DOM.

import { currentDraftOwner, discardDraft, readDraft, saveDraft } from "@/lib/draftVault";
import type { AudienceMode, Campaign, EmailBlock, SegmentDefinition } from "./shared";

export interface CampaignDraft {
  name: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  audienceMode: AudienceMode;
  segmentId: number | null;
  audienceDefinition: SegmentDefinition | null;
  audienceLeadIds: number[];
}

export const draftFrom = (c: Campaign): CampaignDraft => ({
  name: c.name,
  subject: c.subject ?? "",
  preheader: c.preheader ?? "",
  blocks: c.blocks ?? [],
  audienceMode: c.audienceMode ?? "segment",
  segmentId: c.segmentId ?? null,
  audienceDefinition: c.audienceDefinition ?? null,
  audienceLeadIds: c.audienceLeadIds ?? [],
});

/**
 * A stable rendering for comparison: key order ignored, and absent, null and
 * empty treated alike — the server stores an empty preview line as null, and
 * that is not a change anybody made.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined || value === "") return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Whether two drafts say the same thing. */
export function sameDraft(a: CampaignDraft, b: CampaignDraft): boolean {
  return canonical(a) === canonical(b);
}

const keyFor = (campaignId: number) => `marketing-campaign:${campaignId}`;

export interface PreservedCampaignDraft {
  draft: CampaignDraft;
  /**
   * The version these edits were made on top of. Restoring saves against it, so
   * if anybody has saved the campaign since, the server's conflict guard refuses
   * and both versions are put in front of the person — nobody is overwritten.
   */
  baseUpdatedAt: string;
}

/** Keeps what the editor holds, because the server does not have it yet. Returns when. */
export function preserveUnsaved(campaignId: number, draft: CampaignDraft, baseUpdatedAt: string): number {
  saveDraft<PreservedCampaignDraft>(currentDraftOwner(), keyFor(campaignId), { draft, baseUpdatedAt });
  return Date.now();
}

/** The server has it now, or the person chose to let it go. */
export function forgetUnsaved(campaignId: number): void {
  discardDraft(currentDraftOwner(), keyFor(campaignId));
}

export interface RecoverableDraft extends PreservedCampaignDraft {
  preservedAt: number;
  /** True when the campaign has been saved — by anybody — since these edits were based on it. */
  changedSince: boolean;
}

const looksLikeDraft = (v: unknown): v is CampaignDraft => {
  const d = v as Partial<CampaignDraft> | null;
  return !!d && typeof d === "object" && typeof d.name === "string" && typeof d.subject === "string"
    && Array.isArray(d.blocks) && Array.isArray(d.audienceLeadIds);
};

/**
 * Unsaved work this browser kept for this campaign, if there is any worth
 * offering back. A kept copy that says what the server already holds is not
 * work anybody could lose, so it is dropped rather than offered.
 */
export function recoverableDraft(campaign: Campaign): RecoverableDraft | null {
  const kept = readDraft<PreservedCampaignDraft>(currentDraftOwner(), keyFor(campaign.id));
  if (!kept) return null;
  const value = kept.value;
  if (!value || !looksLikeDraft(value.draft) || typeof value.baseUpdatedAt !== "string") {
    forgetUnsaved(campaign.id);
    return null;
  }
  if (sameDraft(value.draft, draftFrom(campaign))) {
    forgetUnsaved(campaign.id);
    return null;
  }
  return {
    draft: value.draft,
    baseUpdatedAt: value.baseUpdatedAt,
    preservedAt: kept.savedAt,
    changedSince: new Date(value.baseUpdatedAt).getTime() !== new Date(campaign.updatedAt).getTime(),
  };
}

/**
 * What the editor holds after the server rewrote the COPY — an AI draft.
 *
 * The subject, preview line and content are the server's: rewriting them is
 * what the operator asked for. The name and the audience were not part of that
 * request, so whatever the operator had changed there and not yet saved stays
 * exactly as they left it, and is still unsaved.
 */
export function adoptServerCopy(current: CampaignDraft, server: CampaignDraft): CampaignDraft {
  return { ...current, subject: server.subject, preheader: server.preheader, blocks: server.blocks };
}

/**
 * The version a save must name as the one it was based on.
 *
 * Normally that is the version on screen. For changes restored from this
 * browser it is the version THEY were made on — kept through every retry and
 * every autosave until one save lands — so that if a colleague saved in
 * between, the server's conflict guard refuses and names them, rather than the
 * restored text quietly replacing their work.
 */
export function saveAgainst(restoredFrom: string | null, onScreen: string): string {
  return restoredFrom ?? onScreen;
}

export type SaveState = "clean" | "pending" | "saving" | "saved" | "error";

/**
 * The words on the save line.
 *
 * "Saved" appears in exactly one state: a save the server accepted, while the
 * editor still holds what was sent. Everything else says what is true instead.
 */
export function saveIndicator(args: {
  state: SaveState;
  readOnly: boolean;
  savedAt: string | null;
  lastSavedAt: string;
  message: string | null;
  keptInBrowser: boolean;
  format: (iso: string | null | undefined) => string;
}): string {
  if (args.readOnly) return "This campaign can no longer be edited";
  switch (args.state) {
    case "saving": return "Saving…";
    case "pending": return "Unsaved changes";
    case "saved": return `Saved ${args.format(args.savedAt)}`;
    case "error":
      return `Not saved — ${args.message ?? "the server did not accept it."}`
        + (args.keptInBrowser ? " Your changes are kept in this browser until they are saved." : "");
    default: return `Last saved ${args.format(args.lastSavedAt)}`;
  }
}
