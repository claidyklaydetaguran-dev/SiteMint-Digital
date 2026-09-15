/**
 * A campaign draft survives a save that does not land.
 *
 * The workspace autosaves, and online-first means a save that cannot reach the
 * server simply does not happen. These pin the half of that promise that is
 * easy to lose: the operator's words are kept in this browser until the server
 * has them, offered back when the campaign is opened again, never shown to the
 * next person on a shared machine, and never described as "Saved" when they
 * were not.
 *
 * No jsdom in this package, so the module runs against a stand-in localStorage —
 * the same approach as `lib/onlineFirst.test.ts`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Campaign } from "./shared";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

(globalThis as Record<string, unknown>)["window"] = {
  localStorage: new MemoryStorage(),
  addEventListener: () => {},
  dispatchEvent: () => true,
};

const vault = await import("@/lib/draftVault");
const drafts = await import("./campaignDraft");
const { stateAfterSave } = await import("./shared");

const OPENED_AT = "2026-09-15T10:00:00.000Z";

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: 41,
  name: "Autumn check-in",
  subject: "A note for {{company|your team}}",
  preheader: null,
  blocks: [{ id: "h", type: "heading", text: "Hi {{first_name|there}}" } as Campaign["blocks"][number]],
  audienceMode: "list",
  audienceLeadIds: [1, 2],
  segmentId: null,
  audienceDefinition: null,
  status: "draft",
  aiContentState: "none",
  updatedAt: OPENED_AT,
  ...over,
});

beforeEach(() => {
  (window.localStorage as Storage).clear();
  vault.setDraftOwner(7);
});

describe("unsaved campaign work", () => {
  it("is kept when a save fails, and offered back when the campaign is opened again", () => {
    const server = campaign();
    const typed = { ...drafts.draftFrom(server), subject: "Written while the network was down" };

    drafts.preserveUnsaved(server.id, typed, server.updatedAt);

    // The tab closed; later the same person opens the same campaign.
    const back = drafts.recoverableDraft(server);
    expect(back?.draft.subject).toBe("Written while the network was down");
    expect(back?.baseUpdatedAt).toBe(OPENED_AT);
    expect(back?.changedSince).toBe(false);
  });

  it("is not offered back when it says what the server already holds", () => {
    const server = campaign({ preheader: null });
    // Same content, spelled differently: an empty preview line the server
    // stores as null, and keys in another order.
    const same = { ...drafts.draftFrom(server), preheader: "" };
    drafts.preserveUnsaved(server.id, same, server.updatedAt);

    expect(drafts.recoverableDraft(server)).toBeNull();
    // And it is gone, not merely hidden.
    expect(vault.readDraft(vault.currentDraftOwner(), `marketing-campaign:${server.id}`)).toBeNull();
  });

  it("says so when somebody saved the campaign after these edits were made", () => {
    // Restoring then saves against the OLD version, so the server's conflict
    // guard names the colleague instead of their work being overwritten.
    const typed = { ...drafts.draftFrom(campaign()), subject: "Mine" };
    drafts.preserveUnsaved(41, typed, OPENED_AT);

    const moved = campaign({ updatedAt: "2026-09-15T10:05:00.000Z", subject: "Theirs" });
    const back = drafts.recoverableDraft(moved);
    expect(back?.changedSince).toBe(true);
    expect(back?.baseUpdatedAt).toBe(OPENED_AT);
  });

  it("is forgotten once the server has it", () => {
    const server = campaign();
    drafts.preserveUnsaved(server.id, { ...drafts.draftFrom(server), name: "Renamed" }, server.updatedAt);
    drafts.forgetUnsaved(server.id);
    expect(drafts.recoverableDraft(server)).toBeNull();
  });

  it("never appears in the next person's editor on a shared machine", () => {
    const server = campaign();
    drafts.preserveUnsaved(server.id, { ...drafts.draftFrom(server), subject: "Shasta's words" }, server.updatedAt);

    vault.setDraftOwner(9);
    expect(drafts.recoverableDraft(server)).toBeNull();
  });

  it("treats a kept copy it cannot read as nothing, rather than breaking the editor", () => {
    const server = campaign();
    drafts.preserveUnsaved(server.id, { nonsense: true } as unknown as ReturnType<typeof drafts.draftFrom>, server.updatedAt);
    expect(drafts.recoverableDraft(server)).toBeNull();
  });

  it("keeps unsaved name and audience edits when the AI rewrites the copy", () => {
    const opened = drafts.draftFrom(campaign());
    const current = { ...opened, name: "Renamed, not saved yet", audienceLeadIds: [1, 2, 3] };
    const afterAi = drafts.draftFrom(campaign({
      subject: "A short note about your website",
      blocks: [{ id: "ai-body", type: "text", text: "Worth a call?" } as Campaign["blocks"][number]],
    }));

    const next = drafts.adoptServerCopy(current, afterAi);
    expect(next.subject).toBe("A short note about your website");
    expect(next.blocks).toEqual(afterAi.blocks);
    expect(next.name).toBe("Renamed, not saved yet");
    expect(next.audienceLeadIds).toEqual([1, 2, 3]);
    // Still different from what the server holds, so it is still unsaved —
    // which is what re-arms the autosave for it.
    expect(drafts.sameDraft(next, afterAi)).toBe(false);
  });

  it("saves restored changes against the version they were made on, through retries, until one save lands", () => {
    // On screen is the colleague's newer version; the restored text predates it.
    // Naming the old version is what lets the server refuse and name them.
    expect(drafts.saveAgainst(OPENED_AT, "2026-09-15T10:05:00.000Z")).toBe(OPENED_AT);
    // Once a save has landed there is no restored base any more.
    expect(drafts.saveAgainst(null, "2026-09-15T10:05:00.000Z")).toBe("2026-09-15T10:05:00.000Z");
  });

  it("offers no way to send a kept draft to the server by itself", () => {
    // The absence is the feature: recovery is a person choosing to restore.
    for (const name of Object.keys(drafts)) {
      expect(name).not.toMatch(/flush|sync|replay|resend|retryAll|upload|submit/i);
    }
  });
});

describe("the save line", () => {
  const format = (iso: string | null | undefined) => (iso ? `at ${iso.slice(11, 16)}` : "—");
  const say = (state: "clean" | "pending" | "saving" | "saved" | "error", over: Partial<Parameters<typeof drafts.saveIndicator>[0]> = {}) =>
    drafts.saveIndicator({
      state, readOnly: false, savedAt: "2026-09-15T10:07:00.000Z", lastSavedAt: OPENED_AT,
      message: null, keptInBrowser: false, format, ...over,
    });

  it("says Saved only for a save that landed", () => {
    expect(say("saved")).toBe("Saved at 10:07");
    for (const state of ["pending", "saving", "error"] as const) {
      expect(say(state), state).not.toMatch(/\bSaved\b/);
    }
  });

  it("does not call a save Saved when the operator kept typing while it was in flight", () => {
    const sent = drafts.draftFrom(campaign());
    const current = { ...sent, subject: "One more word" };
    const state = stateAfterSave(sent, current);
    expect(state).toBe("pending");
    expect(say(state)).not.toMatch(/\bSaved\b/);
  });

  it("gives the reason a save failed, and says the work is still here", () => {
    const text = say("error", { message: "The server did not answer. Check your connection and try again.", keptInBrowser: true });
    expect(text).toMatch(/^Not saved — The server did not answer/);
    expect(text).toMatch(/kept in this browser/i);
    expect(text).not.toMatch(/\bSaved\b/);
  });
});
