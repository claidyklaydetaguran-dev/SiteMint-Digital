// R5 — Replit's platform health probe requests the API root (`GET /api`) and
// treats a non-2xx as an unhealthy deployment. Before this change the root had
// no handler at all, so it fell through the mounted router to Express's
// default finalhandler.
//
// These tests boot the REAL app (the same `./app` module `index.ts` imports)
// on an ephemeral loopback port and issue real HTTP requests, so they prove
// the wiring rather than a re-implementation of it. The database module is
// mocked to a value that throws on any property access: a liveness response
// that touched the database would fail here rather than silently pass.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `@workspace/db` throws at import unless DATABASE_URL is set, and the routes
// import real constants from it, so the module is loaded for real with a dummy
// connection string. Creating a `Pool` opens no socket — only a query would.
// No credentials in the literal: nothing ever connects, and a user:password
// URL would (correctly) trip the repository secret scan.
process.env["DATABASE_URL"] ??= "postgresql://127.0.0.1:1/liveness_never_connected";
// The CORS policy is resolved during module evaluation and fails closed, so a
// value must be present before `./app` is imported.
process.env["CORS_ALLOWED_ORIGINS"] ??= "https://example.test";

// Keep every real export, but replace the query surfaces with traps: a
// liveness response that touched the database fails loudly instead of
// silently passing against a mock that quietly returns undefined.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const trap = (name: string) =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return undefined; // never mistaken for a thenable
          throw new Error(`database accessed during a liveness request: ${name}.${String(prop)}`);
        },
      },
    );
  return { ...actual, db: trap("db"), pool: trap("pool") };
});

const { default: app } = await import("./app.js");

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type Res = { status: number; body: string; headers: http.IncomingHttpHeaders };

function request(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("API root liveness", () => {
  it("GET /api returns 200 with a minimal generic status body", async () => {
    const res = await request("GET", "/api");
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed).toEqual({ status: "ok" });
  });

  it("HEAD /api succeeds and sends no body", async () => {
    const res = await request("HEAD", "/api");
    expect(res.status).toBe(200);
    expect(res.body).toBe("");
  });

  it("discloses no environment, version, build or dependency information", async () => {
    const res = await request("GET", "/api");
    // The whole payload is one generic field; assert exhaustively rather than
    // blocklisting individual key names.
    expect(Object.keys(JSON.parse(res.body) as object)).toEqual(["status"]);
    const forbidden = /version|env|node|commit|sha|build|database|host|region|uptime|pid/i;
    expect(forbidden.test(res.body)).toBe(false);
  });

  it("is served by an explicit handler, not a catch-all: unknown API paths still 404", async () => {
    for (const p of ["/api/definitely-not-a-route", "/api/nope/deeper", "/api/receptionist/not-real"]) {
      const res = await request("GET", p);
      expect(res.status, p).toBe(404);
    }
  });

  it("does not turn unknown paths outside /api into successes", async () => {
    for (const p of ["/", "/apifoo", "/healthz"]) {
      const res = await request("GET", p);
      expect(res.status, p).toBe(404);
    }
  });

  it("leaves /api/healthz behavior unchanged", async () => {
    const res = await request("GET", "/api/healthz");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });

  it("leaves /api/readyz behavior unchanged — it still pings the database", async () => {
    // Readiness is a different contract from liveness: it queries the database,
    // so against the trapped db it correctly reports "not ready" (503). That it
    // fails here while GET /api returns 200 is the proof that the liveness route
    // is a separate, genuinely database-free handler rather than a shared one.
    const res = await request("GET", "/api/readyz");
    expect(res.status).toBe(503);
  });

  it("rejects mutating verbs on the API root", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await request(m, "/api");
      expect(res.status, m).not.toBe(200);
    }
  });
});
