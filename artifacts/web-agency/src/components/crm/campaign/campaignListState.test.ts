/**
 * The campaign list says only what is known about a send.
 *
 * A row used to read "3 delivered, 2 failed" and flag the campaign with "2
 * messages were refused by the mail provider". Neither was true in general:
 * accepted is not delivered, and a message the provider never answered for may
 * be in somebody's inbox. Somebody reading "refused" sends it again.
 */
import { describe, it, expect } from "vitest";
import type { Campaign } from "./shared";

(globalThis as Record<string, unknown>)["window"] ??= {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0, clear: () => {} },
  addEventListener: () => {},
  dispatchEvent: () => true,
};

const { displayState, resultsLine } = await import("./campaignListState");

const campaign = (over: Partial<Campaign>): Campaign => ({
  id: 1, name: "Autumn check-in", subject: "Hello", blocks: [], status: "draft",
  aiContentState: "none", updatedAt: "2026-09-15T10:00:00.000Z", ...over,
});

describe("a campaign on the list", () => {
  it("calls what was not accepted 'not confirmed', never 'refused' or 'failed'", () => {
    const c = campaign({ status: "sent", counts: { sent: 5, failed: 2, excluded: 1 } });
    const state = displayState(c, false);
    expect(state.key).toBe("attention");
    expect(state.note).toMatch(/not confirmed delivered/);
    expect(state.note).toMatch(/may have/);
    expect(state.note).not.toMatch(/refused|failed/i);

    expect(resultsLine(c)).toBe("5 sent, 2 not confirmed, 1 left out");
    expect(resultsLine(c)).not.toMatch(/delivered|failed/i);
  });

  it("does not claim a send happened before it did", () => {
    expect(resultsLine(campaign({ status: "draft" }))).toBe("Not sent yet");
    expect(resultsLine(campaign({ status: "scheduled" }))).toBe("Not sent yet");
  });

  it("marks a scheduled campaign as needing attention when nothing on the server will start it", () => {
    const c = campaign({ status: "scheduled", scheduledAt: "2026-09-20T09:00:00.000Z", scheduledTimezone: "UTC" });
    expect(displayState(c, false)).toMatchObject({ key: "attention" });
    expect(displayState(c, false).note).toMatch(/nothing on this server will start it/);
    expect(displayState(c, true)).toMatchObject({ key: "scheduled" });
  });
});
