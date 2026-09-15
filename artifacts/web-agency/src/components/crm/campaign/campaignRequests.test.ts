/**
 * What the campaign workspace does when a request does not come back.
 *
 * The autosave in `CampaignWorkspace` is a chain of three states — pending,
 * saving, then saved or error — and every one of them is driven by `call`.
 * `call` is therefore the only thing standing between "the server refused this
 * and here is why" and a spinner that never stops.
 *
 * The defect this pins is a real one and was silent by construction:
 * `adminFetch` deliberately RE-THROWS a rejected fetch so a dropped connection
 * can never be mistaken for a server answer. Nothing in the campaign directory
 * caught that. A save attempted while the network was down rejected inside the
 * autosave timer, the component stayed on "Saving…" for ever, no error appeared
 * and no Try again button was offered — so the operator had every reason to
 * believe their work was stored, and closing the tab lost it.
 *
 * A save that cannot happen must SAY SO. It must not retry by itself and it
 * must not queue: this release is online-first, and the draft stays in the
 * editor for a person to save deliberately (see `lib/onlineFirst.test.ts`).
 *
 * There is no jsdom in this package, so the module is driven directly against a
 * stubbed `fetch` — the same approach `lib/onlineFirst.test.ts` takes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The minimum `adminFetch` and its two imports touch.
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

const { call, failureText, patchJson, stateAfterSave } = await import("./shared.js");
const conn = await import("@/lib/connectionState");

const realFetch = globalThis.fetch;

beforeEach(() => {
  conn.__resetConnectionState();
  (window.localStorage as Storage).clear();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  conn.__resetConnectionState();
});

describe("a campaign request that never reaches the server", () => {
  it("answers instead of throwing, so an autosave cannot hang on 'Saving…'", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;

    // The shape matters as much as the absence of a throw: `save()` awaits this
    // and branches on `ok`. A rejection here never reaches either branch.
    const r = await call("/api/crm/marketing/campaigns/1", patchJson({ subject: "half a subject" }));

    expect(r.ok).toBe(false);
    // Status 0 is this module's existing word for "no answer at all"; it is what
    // `failureText` has always been written for.
    expect(r.status).toBe(0);
    expect(r.data).toEqual({});
  });

  it("gives the operator a reason rather than a bare status code", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;

    const r = await call("/api/crm/marketing/campaigns/1", patchJson({ subject: "x" }));
    const message = failureText(r, "This could not be saved.");

    expect(message).toMatch(/did not answer/i);
    expect(message).toMatch(/try again/i);
    // "Saved" in any form would be the lie this exists to prevent.
    expect(message).not.toMatch(/\bsaved\b/i);
    // And it does not blame the operator's own work.
    expect(message).not.toMatch(/\(0\)/);
  });

  it("still reports the connection as troubled, so the banner is not bypassed", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;

    await call("/api/crm/marketing/campaigns/1");
    await call("/api/crm/marketing/campaigns/1");
    await call("/api/crm/marketing/campaigns/1");

    // Swallowing the throw must not also swallow the evidence: the shared
    // connection state is what draws the reconnecting banner.
    expect(conn.getConnectionState().status).toBe("offline");
  });

  it("does not retry by itself, and sends nothing a second time", async () => {
    // Online-first: a request that failed did not happen, and nothing replays
    // it. One call in, one attempt out — a helper that quietly retried a PATCH
    // would eventually retry a send.
    const attempts: string[] = [];
    globalThis.fetch = vi.fn(async (path: unknown) => {
      attempts.push(String(path));
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await call("/api/crm/marketing/campaigns/1", patchJson({ subject: "x" }));

    expect(attempts).toHaveLength(1);
  });

  it("keeps reporting a real server refusal as a refusal, not as a lost connection", async () => {
    // The fix must not turn every failure into "you are offline". A 409 from the
    // conflict guard has to stay a 409, or the workspace can no longer tell a
    // colleague's edit from a dropped request.
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: "Bruno Flow changed this campaign.", conflict: { by: "Bruno Flow", at: "now" } }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;

    const r = await call<{ conflict?: { by: string } }>("/api/crm/marketing/campaigns/1", patchJson({ subject: "x" }));

    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.data.conflict?.by).toBe("Bruno Flow");
    expect(failureText(r, "This could not be saved.")).toMatch(/Bruno Flow/);
  });

  it("survives a response that is not JSON at all", async () => {
    // A proxy error page or a gateway timeout is HTML. `.json()` rejects on it,
    // and that rejection would hang the same autosave the same way.
    globalThis.fetch = vi.fn(async () => new Response(
      "<html><body>502 Bad Gateway</body></html>",
      { status: 502, headers: { "Content-Type": "text/html" } },
    )) as unknown as typeof fetch;

    const r = await call("/api/crm/marketing/campaigns/1", patchJson({ subject: "x" }));

    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(failureText(r, "This could not be saved.")).toBe("This could not be saved. (502)");
  });
});

describe("what a successful save is allowed to claim", () => {
  // A save carries the draft as it was when the autosave timer fired. Typing
  // during the round trip is ordinary — it takes a second or more — and the
  // server then holds a version behind the editor.
  const draft = (subject: string) => ({ subject, blocks: [] as unknown[] });

  it("says Saved only when the editor still holds what was sent", () => {
    const sent = draft("Ten minutes, no pressure");
    expect(stateAfterSave(sent, sent)).toBe("saved");
  });

  it("goes back to pending when the operator typed while it was in flight", () => {
    // Not merely a wording problem: `saved` is terminal. The autosave re-arms
    // from `pending` only, so claiming Saved here strands those keystrokes
    // behind a tick until something else happens to touch the draft — and loses
    // them outright if the tab closes first.
    const sent = draft("Ten minutes");
    const current = draft("Ten minutes, no pressure");
    expect(stateAfterSave(sent, current)).toBe("pending");
  });

  it("compares identity, not content, so an identical retype is still unsaved work", () => {
    // Two objects with the same text are still two edits; the second one has
    // not been through a save. Comparing by value would silently drop it.
    expect(stateAfterSave(draft("same words"), draft("same words"))).toBe("pending");
  });
});
