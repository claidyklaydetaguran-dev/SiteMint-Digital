// V5 — runtime proof for the THREE new public-write gates (invite-signup,
// public beta requests, controlled demo) plus the admin cookie-session
// degrade-gracefully contract, over real HTTP against the real app with the
// database replaced by a trap that throws on any access — same harness as
// publicWriteRuntime.test.ts (R5/R8), extended for V5.
//
// The trap doubles as the proof for O-1's degrade-gracefully requirement:
// with every database call refused, admin login must still succeed via the
// bearer token (unaffected), no admin_session cookie may be set, and a
// cookie-only request must be rejected — none of that should require, or
// wait on, a real Postgres instance.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env["DATABASE_URL"] ??= "postgresql://127.0.0.1:1/guard_never_connected";
process.env["CORS_ALLOWED_ORIGINS"] ??= "https://example.test";
process.env["ADMIN_PASSWORD"] ??= "test-only-not-a-real-secret";

const dbHits: string[] = [];
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const trap = (name: string) =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return undefined;
          const key = `${name}.${String(prop)}`;
          (globalThis as { __v5DbHits?: string[] }).__v5DbHits?.push(key);
          throw new Error(`database accessed: ${key}`);
        },
      },
    );
  return { ...actual, db: trap("db"), pool: trap("pool") };
});
(globalThis as { __v5DbHits?: string[] }).__v5DbHits = dbHits;

const { default: app } = await import("./app.js");
const { setBootState } = await import("./lib/bootState.js");
setBootState("ready");

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const FLAGS = ["INVITE_SIGNUP_ENABLED", "PUBLIC_BETA_REQUESTS_ENABLED", "PUBLIC_DEMO_ENABLED", "PUBLIC_DEMO_MAX_CONCURRENT", "PUBLIC_DEMO_DAILY_CAP_CENTS"] as const;

afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
  dbHits.length = 0;
});

interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function request(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<HttpResult> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${base}${path}`,
      {
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: out, headers: res.headers }));
      },
    );
    req.on("error", reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

const post = (path: string, body: unknown, headers?: Record<string, string>) => request("POST", path, body, headers);
const get = (path: string, headers?: Record<string, string>) => request("GET", path, undefined, headers);

describe("V5 public-write gates — runtime behaviour", () => {
  it("invite-signup is refused with 503 and touches no database when INVITE_SIGNUP_ENABLED is absent", async () => {
    const res = await post("/api/receptionist/auth/invite-signup", {
      inviteCode: "ABCDEFGHIJ",
      ownerName: "A",
      businessName: "B",
      email: "a@b.test",
      password: "Str0ngPassw0rd!",
      timezone: "America/Los_Angeles",
      acceptedTerms: true,
    });
    expect(res.status).toBe(503);
    expect(res.body).toContain("Account creation is not currently available.");
    expect(dbHits).toEqual([]);
  });

  it("invite-signup stays refused for non-\"true\" values and passes the gate on exactly \"true\"", async () => {
    for (const bad of ["", "TRUE", "1", "yes"]) {
      process.env["INVITE_SIGNUP_ENABLED"] = bad;
      const res = await post("/api/receptionist/auth/invite-signup", { inviteCode: "X", ownerName: "A", businessName: "B", email: "a@b.test", password: "Str0ngPassw0rd!", timezone: "UTC", acceptedTerms: true });
      expect(res.status, `value=${bad}`).toBe(503);
      expect(dbHits, `value=${bad}`).toEqual([]);
    }
    process.env["INVITE_SIGNUP_ENABLED"] = "true";
    const res = await post("/api/receptionist/auth/invite-signup", { inviteCode: "X", ownerName: "A", businessName: "B", email: "a@b.test", password: "Str0ngPassw0rd!", timezone: "UTC", acceptedTerms: true });
    // Past the gate the request reaches consumeInviteCode, which hits the trapped database.
    expect(res.body).not.toContain("Account creation is not currently available.");
    expect(dbHits.length).toBeGreaterThan(0);
  });

  it("public beta-requests is refused with 503 and touches no database when PUBLIC_BETA_REQUESTS_ENABLED is absent", async () => {
    const res = await post("/api/public/beta-requests", { name: "A", businessName: "B", workEmail: "a@b.test" });
    expect(res.status).toBe(503);
    expect(res.body).toContain("Form submission is not currently available.");
    expect(dbHits).toEqual([]);
  });

  it("public beta-requests passes the gate on exactly \"true\"", async () => {
    process.env["PUBLIC_BETA_REQUESTS_ENABLED"] = "true";
    const res = await post("/api/public/beta-requests", { name: "A", businessName: "B", workEmail: "a@b.test" });
    expect(res.body).not.toContain("Form submission is not currently available.");
    expect(dbHits.length).toBeGreaterThan(0);
  });

  it("the demo session route is refused with 503 when PUBLIC_DEMO_ENABLED is absent", async () => {
    const res = await post("/api/public/demo/session", {});
    expect(res.status).toBe(503);
    expect(res.body).toContain("Live demo is not available.");
    expect(dbHits).toEqual([]);
  });

  it("the demo session route stays refused when the flag is on but the caps are not configured", async () => {
    process.env["PUBLIC_DEMO_ENABLED"] = "true";
    const res = await post("/api/public/demo/session", {});
    expect(res.status).toBe(503);
    expect(res.body).toContain("Live demo is not available.");
    expect(dbHits, "the demo route makes no database call at all").toEqual([]);
  });

  it("the demo session route stays refused even fully configured, because no real provider is ever wired", async () => {
    process.env["PUBLIC_DEMO_ENABLED"] = "true";
    process.env["PUBLIC_DEMO_MAX_CONCURRENT"] = "5";
    process.env["PUBLIC_DEMO_DAILY_CAP_CENTS"] = "500";
    const res = await post("/api/public/demo/session", {});
    expect(res.status).toBe(503);
    expect(res.body).toContain("Live demo is not available.");
  });

  it("no refusal discloses the flag name or internal configuration", async () => {
    for (const [path, body] of [
      ["/api/receptionist/auth/invite-signup", { inviteCode: "X" }],
      ["/api/public/beta-requests", {}],
      ["/api/public/demo/session", {}],
    ] as const) {
      const res = await post(path, body);
      expect(res.body).not.toMatch(/INVITE_SIGNUP_ENABLED|PUBLIC_BETA_REQUESTS_ENABLED|PUBLIC_DEMO_[A-Z_]*/);
      expect(res.body).not.toMatch(/env|process|config/i);
    }
  });
});

describe("V5 admin cookie sessions — degrade-gracefully behaviour", () => {
  it("login still succeeds via the bearer token when the database is completely unreachable, and sets no admin_session cookie", async () => {
    const res = await post("/api/admin/login", { password: process.env["ADMIN_PASSWORD"] });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { token?: string };
    expect(typeof body.token).toBe("string");
    expect(res.headers["set-cookie"]?.some((c) => c.startsWith("admin_session=")) ?? false).toBe(false);
  });

  it("GET /api/admin/me succeeds with the bearer token even though cookie mode is unavailable", async () => {
    const login = await post("/api/admin/login", { password: process.env["ADMIN_PASSWORD"] });
    const { token } = JSON.parse(login.body) as { token: string };
    const me = await get("/api/admin/me", { authorization: `Bearer ${token}` });
    expect(me.status).toBe(200);
    expect(JSON.parse(me.body)).toEqual({ ok: true, mode: "bearer" });
  });

  it("GET /api/admin/me is rejected with no credential presented at all", async () => {
    const res = await get("/api/admin/me");
    expect(res.status).toBe(401);
  });

  it("a forged admin_session cookie alone (no bearer) is rejected, because cookie validation also hits the trapped database", async () => {
    const res = await get("/api/admin/me", { cookie: "admin_session=forged-token-value" });
    expect(res.status).toBe(401);
  });

  it("wrong password is still 401, and consumes no cookie/session machinery", async () => {
    const res = await post("/api/admin/login", { password: "definitely-wrong" });
    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
