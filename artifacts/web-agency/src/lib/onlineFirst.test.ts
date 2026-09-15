/**
 * Online-first behaviour, as the owner specified it for this release.
 *
 * The requirements being pinned here are mostly about what must NOT happen:
 * no offline write queue, nothing sent or approved on reconnect, and one
 * person's unsent text never appearing in another person's editor on a shared
 * machine. Those are easy to regress into, because each would look like a
 * helpful feature while being the thing that was ruled out.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// jsdom is not configured in this package, so stand up the minimum these two
// modules touch: a localStorage and a window with event listeners. Keeping it
// this small also keeps it obvious what they actually depend on.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

const listeners = new Map<string, ((e: unknown) => void)[]>();
(globalThis as Record<string, unknown>)["window"] = {
  localStorage: new MemoryStorage(),
  addEventListener: (t: string, fn: (e: unknown) => void) => {
    listeners.set(t, [...(listeners.get(t) ?? []), fn]);
  },
};

const conn = await import("./connectionState.js");
const vault = await import("./draftVault.js");

beforeEach(() => {
  conn.__resetConnectionState();
  (window.localStorage as Storage).clear();
  listeners.clear();
});

afterEach(() => {
  conn.__resetConnectionState();
});

describe("connection state", () => {
  it("starts online and stays online while requests complete", () => {
    expect(conn.getConnectionState().status).toBe("online");
    conn.reportRequestSucceeded();
    expect(conn.getConnectionState().status).toBe("online");
  });

  it("shows reconnecting on the first failure, not offline", () => {
    // One dropped request is a blip. Declaring the user offline immediately is
    // how a banner cries wolf and stops being read.
    conn.reportRequestFailed();
    expect(conn.getConnectionState().status).toBe("reconnecting");
  });

  it("declares offline only after repeated failures", () => {
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    expect(conn.getConnectionState().status).toBe("offline");
  });

  it("recovers the moment a request completes again", () => {
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestSucceeded();
    const s = conn.getConnectionState();
    expect(s.status).toBe("online");
    expect(s.consecutiveFailures).toBe(0);
    expect(s.troubleSince).toBeNull();
  });

  it("notifies subscribers when the status changes", () => {
    const seen: string[] = [];
    conn.subscribeConnection((s) => seen.push(s.status));
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestSucceeded();
    expect(seen).toContain("reconnecting");
    expect(seen).toContain("offline");
    expect(seen).toContain("online");
  });

  it("treats the browser's online event as a hint, never as proof", () => {
    // navigator.onLine reports a network interface, not whether OUR server is
    // reachable. Trusting it would clear the banner while nothing works.
    conn.startConnectionWatch();
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    conn.reportRequestFailed();
    expect(conn.getConnectionState().status).toBe("offline");

    for (const fn of listeners.get("online") ?? []) fn({});
    expect(conn.getConnectionState().status).toBe("reconnecting");
    expect(conn.getConnectionState().status).not.toBe("online");
  });
});

describe("preserved drafts", () => {
  it("keeps unsent text and hands it back", () => {
    vault.saveDraft(7, "ticket:12", { body: "half a reply" });
    expect(vault.readDraft<{ body: string }>(7, "ticket:12")?.value.body).toBe("half a reply");
  });

  it("isolates one person's draft from another's on the same machine", () => {
    vault.saveDraft(7, "ticket:12", { body: "Shasta's words" });
    expect(vault.readDraft(9, "ticket:12")).toBeNull();
  });

  it("discards everything when the account changes", () => {
    vault.setDraftOwner(7);
    vault.saveDraft(7, "ticket:12", { body: "Shasta's words" });
    vault.setDraftOwner(9);
    expect(vault.readDraft(7, "ticket:12")).toBeNull();
  });

  it("keeps drafts when the same person is re-identified", () => {
    vault.setDraftOwner(7);
    vault.saveDraft(7, "ticket:12", { body: "still mine" });
    vault.setDraftOwner(7);
    expect(vault.readDraft<{ body: string }>(7, "ticket:12")?.value.body).toBe("still mine");
  });

  it("clears every draft on sign-out", () => {
    vault.saveDraft(7, "a", { body: "one" });
    vault.saveDraft(9, "b", { body: "two" });
    vault.clearAllDrafts();
    expect(vault.readDraft(7, "a")).toBeNull();
    expect(vault.readDraft(9, "b")).toBeNull();
  });

  it("never calls unsent content saved", () => {
    // The wording is the requirement: "saved" would be a lie and "saved
    // locally" would imply a durability this does not have.
    const text = vault.describeSaveStatus({
      kind: "unsaved", reason: "we cannot reach the server.", preservedAt: Date.now(),
    });
    expect(text).toMatch(/^Not saved/);
    expect(text).toMatch(/kept in this browser/i);
    expect(text).not.toMatch(/\bSaved\b/);
  });

  it("exposes no way to replay a draft to the server", () => {
    // The absence IS the feature. If a `flushDrafts`/`syncDrafts`/`replay`
    // ever appears here, the online-first decision has been quietly reversed
    // and something can send itself after a reconnect.
    const exported = Object.keys(vault);
    for (const name of exported) {
      expect(name).not.toMatch(/flush|sync|replay|resend|retryAll|upload/i);
    }
  });
});
