/**
 * What adminFetch does when a live session's security token is refused, and
 * what it must never do.
 *
 * The recovery is only safe because of a property proved on the server side:
 * every CRM gate checks the token before any handler runs, so a refused write
 * changed nothing and replaying it once cannot perform it twice. These tests
 * pin the client half — one renewal, one replay, no loop, and no silent
 * sign-out where a credential was merely rejected.
 */
import { describe, it, expect, beforeEach } from "vitest";

// jsdom is not configured in this package, so stand up the minimum the module
// touches: a localStorage, and a window that can carry an event.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

const listeners = new Map<string, ((event: unknown) => void)[]>();
const storage = new MemoryStorage();
(globalThis as Record<string, unknown>)["window"] = {
  localStorage: storage,
  location: { pathname: "/admin/crm/leads", search: "" },
  addEventListener: (type: string, fn: (event: unknown) => void) => {
    listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  },
  removeEventListener: (type: string, fn: (event: unknown) => void) => {
    listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
  },
  dispatchEvent: (event: { type: string }) => {
    for (const fn of listeners.get(event.type) ?? []) fn(event);
    return true;
  },
};

const admin = await import("./adminFetch.js");
const connection = await import("./connectionState.js");

interface Call { url: string; init: RequestInit }

let calls: Call[] = [];
let answer: (call: Call) => Response = () => new Response("", { status: 500 });
let signedOutEvents = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const call: Call = { url: String(input), init };
  calls.push(call);
  return answer(call);
}) as typeof fetch;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tokenOn = (call: Call): string | null => new Headers(call.init.headers ?? undefined).get("X-CSRF-Token");
const urls = () => calls.map((c) => c.url);
const renewals = () => calls.filter((c) => c.url === admin.CSRF_REISSUE_PATH).length;

const REFUSED = { error: "This page's security token is missing or out of date.", code: "csrf_token_invalid" };

beforeEach(() => {
  calls = [];
  signedOutEvents = 0;
  storage.clear();
  listeners.clear();
  connection.__resetConnectionState();
  admin.resetUnauthorizedNotice();
  window.addEventListener(admin.ADMIN_UNAUTHORIZED_EVENT, () => { signedOutEvents += 1; });
});

describe("a write refused for its security token", () => {
  it("renews the token once and replays the write once", async () => {
    admin.setCsrfToken("stale");
    answer = (call) => {
      if (call.url === admin.CSRF_REISSUE_PATH) return json(200, { csrfToken: "fresh" });
      return tokenOn(call) === "fresh" ? json(200, { saved: true }) : json(403, REFUSED);
    };

    const res = await admin.adminFetch("/api/crm/leads/7/notes", { method: "POST", body: "{}" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true });
    expect(urls()).toEqual(["/api/crm/leads/7/notes", admin.CSRF_REISSUE_PATH, "/api/crm/leads/7/notes"]);
    expect(admin.getCsrfToken()).toBe("fresh");
    // The renewal asks with the custom header, which is what stops another site
    // rotating a signed-in person's token.
    const renewal = calls[1];
    expect(renewal.init.method).toBe("POST");
    expect(new Headers(renewal.init.headers ?? undefined).get(admin.REISSUE_REQUEST_HEADER)).toBe("1");
    expect(renewal.init.credentials).toBe("include");
  });

  it("surfaces a second refusal instead of looping", async () => {
    admin.setCsrfToken("stale");
    answer = (call) => (call.url === admin.CSRF_REISSUE_PATH ? json(200, { csrfToken: "fresh" }) : json(403, REFUSED));

    const res = await admin.adminFetch("/api/crm/leads/7/notes", { method: "POST", body: "{}" });

    expect(res.status).toBe(403);
    // The caller can still read the body we inspected.
    expect(await res.json()).toMatchObject({ code: "csrf_token_invalid" });
    expect(calls.length).toBe(3);
    expect(renewals()).toBe(1);
  });

  it("shares one renewal between writes refused at the same time", async () => {
    admin.setCsrfToken("stale");
    let issued = 0;
    answer = (call) => {
      if (call.url === admin.CSRF_REISSUE_PATH) {
        issued += 1;
        return json(200, { csrfToken: `fresh-${issued}` });
      }
      return tokenOn(call)?.startsWith("fresh") ? json(200, { ok: true }) : json(403, REFUSED);
    };

    const [first, second] = await Promise.all([
      admin.adminFetch("/api/crm/leads/7/notes", { method: "POST", body: "{}" }),
      admin.adminFetch("/api/crm/leads/8", { method: "PATCH", body: "{}" }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(issued).toBe(1);
    expect(renewals()).toBe(1);
  });

  it("uses a token another request already renewed rather than rotating again", async () => {
    // This request carries an older token than the one in storage: renewing
    // again would invalidate the token the other request is about to use.
    admin.setCsrfToken("newer");
    answer = (call) => {
      if (call.url === admin.CSRF_REISSUE_PATH) throw new Error("must not renew");
      return tokenOn(call) === "newer" ? json(200, { ok: true }) : json(403, REFUSED);
    };

    const res = await admin.adminFetch("/api/crm/leads/7/notes", {
      method: "POST", body: "{}", headers: { "X-CSRF-Token": "older" },
    });

    expect(res.status).toBe(200);
    expect(renewals()).toBe(0);
    expect(calls.length).toBe(2);
  });

  it("raises the sign-out once, and replays nothing, when the session has ended too", async () => {
    admin.setCsrfToken("stale");
    answer = (call) => (call.url === admin.CSRF_REISSUE_PATH
      ? json(401, { error: "Not signed in." })
      : json(403, REFUSED));

    const res = await admin.adminFetch("/api/crm/leads/7/notes", { method: "POST", body: "{}" });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Not signed in." });
    expect(signedOutEvents).toBe(1);
    expect(admin.getCsrfToken()).toBeNull();
    expect(calls.length).toBe(2);
  });

  it("does not renew for a read, or for a refusal that is about permission", async () => {
    admin.setCsrfToken("stale");
    answer = () => json(403, REFUSED);
    expect((await admin.adminFetch("/api/crm/leads")).status).toBe(403);
    expect(renewals()).toBe(0);

    calls = [];
    answer = () => json(403, { error: "You do not have permission to do that.", permission: "leads.write" });
    expect((await admin.adminFetch("/api/crm/leads/7", { method: "PATCH", body: "{}" })).status).toBe(403);
    expect(renewals()).toBe(0);
    expect(calls.length).toBe(1);
  });
});

describe("what a 401 means, and where", () => {
  it("is a real sign-out from the Discovery Portal's data, now that it accepts a staff session", async () => {
    answer = () => json(401, { error: "Unauthorized" });
    await admin.adminFetch("/api/admin/submissions");
    expect(signedOutEvents).toBe(1);
  });

  it("is NOT a sign-out when a credential was simply rejected", async () => {
    // Treating a mistyped password or code as a sign-out wiped the token the
    // password step had just stored, leaving the person signed in and unable to
    // save anything.
    admin.setCsrfToken("kept");
    answer = () => json(401, { error: "That code is not valid." });

    const res = await admin.adminFetch("/api/crm/staff/login/mfa", { method: "POST", body: "{}" });

    expect(res.status).toBe(401);
    expect(signedOutEvents).toBe(0);
    expect(admin.getCsrfToken()).toBe("kept");
  });
});

describe("the words a refused request gets", () => {
  it("tells somebody whose token could not be renewed what to do instead", () => {
    const refusal = admin.describeRefusal(new admin.AdminApiError(403, REFUSED.error, REFUSED));
    expect(refusal?.title).toMatch(/security token/i);
    expect(refusal?.detail).not.toMatch(/refresh/i);
    expect(refusal?.permission).toBeNull();
  });

  it("still names a missing permission as a permission problem", () => {
    const refusal = admin.describeRefusal(
      new admin.AdminApiError(403, "You do not have permission to do that.", { permission: "data.export" }),
    );
    expect(refusal?.permission).toBe("data.export");
    expect(refusal?.detail).toContain("data.export");
  });
});
