/**
 * The guard's three answers.
 *
 * The case that matters is the last group: a request that never completed must
 * not be reported as "denied" for a staff session, because that redirects a
 * perfectly signed-in person to the sign-in page and discards the page they
 * were working on.
 */
import { describe, it, expect } from "vitest";

import { resolveAccess, type AccessProbes } from "./adminAccess.js";

const res = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rejects = () => Promise.reject(new TypeError("Failed to fetch"));

function probes(overrides: Partial<AccessProbes> = {}): AccessProbes {
  return {
    probeStaff: async () => res(401, { error: "Not signed in." }),
    probeLegacy: async () => res(401, { error: "Unauthorized" }),
    hasLegacyToken: () => false,
    staffIdFrom: async (r) => ((await r.json()) as { staff?: { id?: number } }).staff?.id ?? null,
    ...overrides,
  };
}

describe("resolveAccess", () => {
  it("allows a live staff session and reports who it is", async () => {
    const result = await resolveAccess(probes({ probeStaff: async () => res(200, { staff: { id: 7 } }) }));
    expect(result).toEqual({ outcome: "allowed", staffId: 7 });
  });

  it("allows the legacy shared admin when there is no staff session", async () => {
    const result = await resolveAccess(probes({ probeLegacy: async () => res(200, { ok: true }) }));
    expect(result).toEqual({ outcome: "allowed", staffId: null });
  });

  it("denies when both credentials are refused", async () => {
    expect(await resolveAccess(probes())).toEqual({ outcome: "denied", staffId: null });
  });

  it("falls back to the stored token when the backend has no /admin/me", async () => {
    const withToken = probes({ probeLegacy: async () => res(404), hasLegacyToken: () => true });
    expect((await resolveAccess(withToken)).outcome).toBe("allowed");
    const without = probes({ probeLegacy: async () => res(404) });
    expect((await resolveAccess(without)).outcome).toBe("denied");
  });

  it("reports a stopped server as unreachable, not as denied", async () => {
    const result = await resolveAccess(probes({ probeStaff: rejects }));
    expect(result).toEqual({ outcome: "unreachable", staffId: null });
  });

  it("reports unreachable when the second probe is the one that never completes", async () => {
    const result = await resolveAccess(probes({ probeLegacy: rejects }));
    expect(result.outcome).toBe("unreachable");
  });

  it("keeps a stored legacy token working while the server is unreachable", async () => {
    const result = await resolveAccess(probes({ probeStaff: rejects, hasLegacyToken: () => true }));
    expect(result).toEqual({ outcome: "allowed", staffId: null });
  });

  it("treats a proxy's 5xx as unreachable, because the application never answered", async () => {
    for (const status of [500, 502, 503, 504]) {
      const result = await resolveAccess(probes({ probeStaff: async () => res(status, { error: "upstream" }) }));
      expect({ status, ...result }).toEqual({ status, outcome: "unreachable", staffId: null });
    }
  });

  it("treats a 5xx on the second probe as unreachable too", async () => {
    const result = await resolveAccess(probes({ probeLegacy: async () => res(502) }));
    expect(result.outcome).toBe("unreachable");
  });

  it("keeps a stored legacy token working through a 5xx", async () => {
    const result = await resolveAccess(probes({ probeStaff: async () => res(503), hasLegacyToken: () => true }));
    expect(result).toEqual({ outcome: "allowed", staffId: null });
  });

  it("never calls the legacy probe once a staff session answered", async () => {
    let legacyCalls = 0;
    await resolveAccess(probes({
      probeStaff: async () => res(200, { staff: { id: 3 } }),
      probeLegacy: async () => { legacyCalls += 1; return res(200); },
    }));
    expect(legacyCalls).toBe(0);
  });
});
