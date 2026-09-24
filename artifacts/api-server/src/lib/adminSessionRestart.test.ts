// Operator sign-in across a restart and across instances.
//
// The operator routes that assign telephone numbers used to accept only the
// in-memory bearer token, which `admin-session.ts` mints with randomBytes at
// module load. Every restart or deploy mints a new one, and a deployment with
// two instances holds two different ones. The first test below reproduces that
// by loading the module twice, exactly as two processes would.
//
// The fix is not a new credential. The same login already issues a persistent,
// hashed `admin_session` cookie; the operator routes now use the shared gate
// that accepts it. These tests pin both halves and keep the permission boundary
// where it was: a customer's receptionist session is not an operator.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessions: Array<{ id: number; tokenHash: string; lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null }> = [];
let lastLookupHash: string | undefined;

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  eq: (_column: unknown, value: unknown) => ({ eq: value }),
  gt: (_column: unknown, value: unknown) => ({ gt: value }),
  isNull: (_column: unknown) => ({ isNull: true }),
}));

vi.mock("@workspace/db", () => {
  const findHash = (cond: unknown): string | undefined => {
    const parts = (cond as { and?: Array<{ eq?: unknown }> }).and ?? [];
    const hit = parts.find((p) => typeof p.eq === "string");
    return hit?.eq as string | undefined;
  };
  return {
    crmAdminSessions: {},
    crmAdminAuditLog: {},
    db: {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => ({
            limit: async () => {
              lastLookupHash = findHash(cond);
              const now = Date.now();
              return sessions.filter(
                (s) => s.tokenHash === lastLookupHash && s.revokedAt === null && s.expiresAt.getTime() > now,
              );
            },
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({ values: async () => undefined }),
    },
  };
});

const ROUTES = resolve(dirname(fileURLToPath(import.meta.url)), "../routes");

function fakeReq(opts: { bearer?: string; cookie?: string; receptionistCookie?: string }) {
  return {
    headers: opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {},
    cookies: {
      ...(opts.cookie ? { admin_session: opts.cookie } : {}),
      ...(opts.receptionistCookie ? { receptionist_session: opts.receptionistCookie } : {}),
    },
  } as never;
}

function fakeRes() {
  const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(b: unknown) { this.body = b; return this; } };
  return res;
}

async function gate(mod: typeof import("./admin-session.js"), req: never): Promise<"next" | number> {
  const res = fakeRes();
  let passed = false;
  await mod.requireAdmin(req, res as never, () => { passed = true; });
  return passed ? "next" : res.statusCode;
}

beforeEach(() => {
  sessions.length = 0;
  lastLookupHash = undefined;
});

describe("the defect: a bearer token belongs to one process", () => {
  it("a token minted before a restart is refused after it", async () => {
    vi.resetModules();
    const before = await import("./admin-session.js");
    const token = before.getSessionToken();
    expect(before.validateToken(token)).toBe(true);

    vi.resetModules();
    const after = await import("./admin-session.js");
    expect(after.getSessionToken()).not.toBe(token);
    expect(after.validateToken(token)).toBe(false);
    expect(await gate(after, fakeReq({ bearer: token }))).toBe(401);
  });
});

describe("the fix: the persistent operator session survives it", () => {
  it("a cookie session issued before a restart is still accepted after it", async () => {
    const raw = crypto.randomBytes(32).toString("hex");
    sessions.push({
      id: 1,
      tokenHash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
    });

    vi.resetModules();
    const instanceA = await import("./admin-session.js");
    vi.resetModules();
    const instanceB = await import("./admin-session.js");

    expect(await gate(instanceA, fakeReq({ cookie: raw }))).toBe("next");
    expect(await gate(instanceB, fakeReq({ cookie: raw }))).toBe("next");
    // Only the hash is ever looked up — never the raw token.
    expect(lastLookupHash).not.toBe(raw);
    expect(lastLookupHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a revoked, expired, or idle session is refused", async () => {
    const mod = await import("./admin-session.js");
    const mk = (raw: string, over: Partial<(typeof sessions)[number]>) =>
      sessions.push({
        id: sessions.length + 1,
        tokenHash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        ...over,
      });
    mk("revoked", { revokedAt: new Date() });
    mk("expired", { expiresAt: new Date(Date.now() - 1000) });
    mk("idle", { lastSeenAt: new Date(Date.now() - 13 * 60 * 60 * 1000) });
    for (const raw of ["revoked", "expired", "idle", "never-issued"]) {
      expect(await gate(mod, fakeReq({ cookie: raw }))).toBe(401);
    }
  });

  it("a customer's receptionist session is not an operator session", async () => {
    const mod = await import("./admin-session.js");
    expect(await gate(mod, fakeReq({ receptionistCookie: "any-customer-session" }))).toBe(401);
    expect(await gate(mod, fakeReq({}))).toBe(401);
  });
});

describe("the operator routes use the shared gate", () => {
  // Every operator voice route goes through `requireOperator`, which accepts a
  // CRM staff session with a named permission or the cookie-or-bearer
  // `requireAdmin` path above (see operatorGate.test.ts for its ordering).
  for (const file of [
    "adminVoiceNumbers.ts", "adminVoiceDiagnostics.ts", "receptionistInvites.ts",
    "adminVoiceIssues.ts", "publicBetaRequests.ts",
  ]) {
    it(`${file} uses requireOperator and defines no gate of its own`, () => {
      const src = readFileSync(resolve(ROUTES, file), "utf8");
      expect(src).toMatch(/import \{[^}]*\brequireOperator\b[^}]*\} from "\.\.\/lib\/operatorGate\.js"/);
      expect(src).not.toMatch(/function requireAdmin\s*\(/);
      expect(src).not.toMatch(/function orLegacyAdminSession\s*\(/);
      expect(src).not.toMatch(/validateToken\(/);
      // Every /admin route in the file is gated — none is left open.
      const adminRoutes = src.match(/router\.(get|post|put|patch|delete)\("\/admin\/[^"]*",[^\n]*/g) ?? [];
      expect(adminRoutes.length).toBeGreaterThan(0);
      for (const line of adminRoutes) expect(line).toMatch(/requireOperator\("[a-z_.]+"\)/);
    });
  }
});
