// The operator gate's ordering is its security property: a live staff session
// is judged by the CRM gate as that person, and only a request with no live
// staff identity may fall back to the legacy shared admin — and only while the
// legacy credential has not been retired.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  staff: null as null | { staff: { id: number } },
  legacyEnabled: true,
  legacyMode: undefined as undefined | "bearer" | "cookie",
  gateStatus: 403 as number | "next",
  permissions: [] as string[],
};

vi.mock("./admin-session.js", () => ({
  resolveAdminAuthMode: async () => state.legacyMode,
}));

vi.mock("./staffAuth.js", () => ({
  resolveStaffSession: async () => state.staff,
  legacyBearerEnabled: () => state.legacyEnabled,
  requireCrmAuth: (permission: string) => {
    state.permissions.push(permission);
    return async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if (state.gateStatus === "next") next();
      else res.status(state.gateStatus).json({});
    };
  },
}));

const { requireOperator } = await import("./operatorGate.js");

async function run(permission = "settings.write"): Promise<"next" | number> {
  let status: number | undefined;
  let passed = false;
  const res = { status(n: number) { status = n; return { json: () => undefined }; } };
  await requireOperator(permission as never)({} as never, res as never, () => { passed = true; });
  return passed ? "next" : (status ?? 0);
}

beforeEach(() => {
  state.staff = null;
  state.legacyEnabled = true;
  state.legacyMode = undefined;
  state.gateStatus = 403;
  state.permissions = [];
});

describe("requireOperator", () => {
  it("names the permission to the CRM gate", async () => {
    requireOperator("integrations.manage" as never);
    expect(state.permissions).toEqual(["integrations.manage"]);
  });

  it("lets the legacy admin through by cookie or bearer when no staff session exists", async () => {
    state.gateStatus = 401;
    state.legacyMode = "cookie";
    expect(await run()).toBe("next");
    state.legacyMode = "bearer";
    expect(await run()).toBe("next");
  });

  it("judges a live staff session by the CRM gate with no fallback", async () => {
    state.staff = { staff: { id: 7 } };
    state.legacyMode = "cookie"; // the same browser also holds the shared credential
    state.gateStatus = 403;      // but this person lacks the permission
    expect(await run()).toBe(403);
    state.gateStatus = "next";
    expect(await run()).toBe("next");
  });

  it("refuses the legacy credential once it is retired", async () => {
    state.legacyEnabled = false;
    state.legacyMode = "cookie";
    state.gateStatus = 401;
    expect(await run()).toBe(401);
  });

  it("refuses a request with no operator identity (a customer session is neither)", async () => {
    state.gateStatus = 401;
    expect(await run()).toBe(401);
  });
});
