// R5 — runtime proof for the three public-write gates.
//
// publicWriteGuards.test.ts proves guard PLACEMENT by scanning source. This
// file proves BEHAVIOUR: it boots the real app over loopback and issues real
// requests, with the database replaced by a trap that throws on any access.
//
// That trap is what makes "zero rows written" a real assertion rather than a
// hopeful one — a blocked request that reached the database would surface as a
// 500 from the route's catch block instead of the expected 503.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// No credentials in the literal — see apiRootLiveness.test.ts.
process.env["DATABASE_URL"] ??= "postgresql://127.0.0.1:1/guard_never_connected";
process.env["CORS_ALLOWED_ORIGINS"] ??= "https://example.test";

// Records every attempted database access so a blocked request can assert none.
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
          // Drizzle table objects are read from the same module; only the
          // query surfaces (`db`, `pool`) are trapped, so any hit here is a
          // genuine query attempt.
          (globalThis as { __dbHits?: string[] }).__dbHits?.push(key);
          throw new Error(`database accessed: ${key}`);
        },
      },
    );
  return { ...actual, db: trap("db"), pool: trap("pool") };
});
(globalThis as { __dbHits?: string[] }).__dbHits = dbHits;

const { default: app } = await import("./app.js");

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

const FLAGS = [
  "PUBLIC_REGISTRATION_ENABLED",
  "PUBLIC_FORM_SUBMISSIONS_ENABLED",
  "PUBLIC_ANALYTICS_WRITES_ENABLED",
] as const;

afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
  dbHits.length = 0;
});

function post(path: string, body: unknown): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${base}${path}`,
      { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: out }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

// path → [flag that gates it, a body that WOULD be valid if it got through]
const GATED: Array<[string, string, unknown]> = [
  ["/api/receptionist/auth/signup", "PUBLIC_REGISTRATION_ENABLED", { email: "a@b.test", password: "Str0ngPassw0rd!", firmName: "X" }],
  ["/api/contact/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { name: "A", email: "a@b.test", message: "hello there" }],
  ["/api/discovery/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { name: "A", email: "a@b.test" }],
  ["/api/landing-test/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { vertical: "lawyers", name: "A", email: "a@b.test" }],
  ["/api/landing-test/view", "PUBLIC_ANALYTICS_WRITES_ENABLED", { page: "lawyers" }],
];

describe("public write gates — runtime behaviour", () => {
  for (const [path, flag, body] of GATED) {
    it(`${path} is refused with 503 and touches no database when ${flag} is absent`, async () => {
      const res = await post(path, body);
      expect(res.status).toBe(503);
      expect(dbHits, "a blocked request must not reach the database").toEqual([]);
    });

    it(`${path} discloses no flag name or configuration detail while disabled`, async () => {
      const res = await post(path, body);
      expect(res.body).not.toContain(flag);
      expect(res.body).not.toMatch(/PUBLIC_[A-Z_]*ENABLED/);
      expect(res.body).not.toMatch(/env|process|config/i);
    });

    for (const bad of ["", " ", "false", "FALSE", "TRUE", "True", "1", "yes", "on", "true "]) {
      it(`${path} stays refused when ${flag}=${JSON.stringify(bad)}`, async () => {
        process.env[flag] = bad;
        const res = await post(path, body);
        expect(res.status).toBe(503);
        expect(dbHits).toEqual([]);
      });
    }

    it(`${path} passes the gate when ${flag} is exactly "true"`, async () => {
      process.env[flag] = "true";
      const res = await post(path, body);
      // Past the gate the request meets the trapped database (or this route's
      // own validation) — either way it is no longer the gate's 503. The
      // status changing on the exact string is the proof the gate opened.
      expect(res.status).not.toBe(503);
    });
  }

  it("the analytics gate is independent of the form-submission gate", async () => {
    process.env["PUBLIC_FORM_SUBMISSIONS_ENABLED"] = "true";
    const res = await post("/api/landing-test/view", { page: "lawyers" });
    expect(res.status, "enabling forms must not enable analytics").toBe(503);
    expect(dbHits).toEqual([]);
  });

  it("the form-submission gate is independent of the analytics gate", async () => {
    process.env["PUBLIC_ANALYTICS_WRITES_ENABLED"] = "true";
    const res = await post("/api/landing-test/submit", { vertical: "lawyers", name: "A", email: "a@b.test" });
    expect(res.status, "enabling analytics must not enable form submission").toBe(503);
    expect(dbHits).toEqual([]);
  });

  it("the registration gate is independent of both others", async () => {
    process.env["PUBLIC_FORM_SUBMISSIONS_ENABLED"] = "true";
    process.env["PUBLIC_ANALYTICS_WRITES_ENABLED"] = "true";
    const res = await post("/api/receptionist/auth/signup", { email: "a@b.test", password: "Str0ngPassw0rd!", firmName: "X" });
    expect(res.status).toBe(503);
    expect(dbHits).toEqual([]);
  });

  it("login is not gated by any public-write flag", async () => {
    // A gate on login would lock out existing customers; it must reach the
    // credential path (and therefore the trapped database) even with all
    // three flags absent.
    const res = await post("/api/receptionist/auth/login", { email: "a@b.test", password: "x" });
    expect(res.status).not.toBe(503);
  });
});
