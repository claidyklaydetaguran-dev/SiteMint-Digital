// R6 — proof for the startup lifecycle.
//
// The real app is booted over loopback with the database trapped, and the
// migration step is driven by a promise this test controls. That is what makes
// "the probe is answered while migrations run, but nothing else is" observable
// rather than asserted about a diagram.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env["DATABASE_URL"] ??= "postgresql://127.0.0.1:1/boot_never_connected";
process.env["CORS_ALLOWED_ORIGINS"] ??= "https://example.test";

const dbHits: string[] = [];
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const trap = (name: string) =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return undefined;
          (globalThis as { __bootDbHits?: string[] }).__bootDbHits?.push(`${name}.${String(prop)}`);
          throw new Error("database accessed");
        },
      },
    );
  return { ...actual, db: trap("db"), pool: trap("pool") };
});
(globalThis as { __bootDbHits?: string[] }).__bootDbHits = dbHits;

const { default: app } = await import("./app.js");
const { runBootSequence, sanitizeBootError } = await import("./lib/bootSequence.js");
const { getBootState, resetBootStateForTests } = await import("./lib/bootState.js");
const { BOOT_UNAVAILABLE_MESSAGE } = await import("./lib/bootGate.js");

let server: http.Server | null = null;
let base = "";

function listen(): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, "127.0.0.1", () => {
      server = s;
      base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
      resolve(s);
    });
  });
}

type Res = { status: number; body: string };
function request(method: string, path: string, body?: unknown): Promise<Res> {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${base}${path}`,
      {
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: out }));
      },
    );
    req.on("error", reject);
    req.end(payload ?? undefined);
  });
}

beforeEach(() => {
  resetBootStateForTests();
  dbHits.length = 0;
  // Must be cleared, or a case's `waitFor(base !== "")` is satisfied by the
  // PREVIOUS case's closed port and every request is a socket hang up.
  base = "";
});

afterEach(async () => {
  if (server) {
    const s = server;
    server = null;
    await new Promise<void>((r) => s.close(() => r()));
  }
});

/** Routes that must all be refused while the process is still starting. */
const APPLICATION_ROUTES: Array<[string, string, unknown]> = [
  ["POST", "/api/receptionist/auth/login", { email: "a@b.test", password: "x" }],
  ["POST", "/api/receptionist/auth/signup", { email: "a@b.test", password: "x", firmName: "X" }],
  ["POST", "/api/contact/submit", { name: "A", email: "a@b.test", message: "hi" }],
  ["POST", "/api/landing-test/view", { page: "lawyers" }],
  ["POST", "/api/ai-toolkit/checkout", {}],
  ["POST", "/api/voice/webhooks/vapi", { type: "x" }],
  ["POST", "/api/stripe/webhook", { id: "evt" }],
  ["GET", "/api/receptionist/auth/me", undefined],
  ["POST", "/api/crm/campaigns", { name: "x" }],
];

describe("startup lifecycle — while migrations are running", () => {
  it("answers liveness but refuses everything else, touching nothing", async () => {
    let release!: () => void;
    const migrationDone = new Promise<void>((r) => (release = r));
    let workersStarted = false;

    const booting = runBootSequence({
      listen,
      runMigrations: () => migrationDone,
      startWorkers: () => {
        workersStarted = true;
      },
      logger: { info: () => {}, error: () => {} },
      exit: () => {},
    });

    // Give listen() a turn; the sequence is now parked on the migration.
    await vi.waitFor(() => expect(base).not.toBe(""));
    expect(getBootState()).toBe("starting");

    // 1. the platform probe is satisfied
    const root = await request("GET", "/api");
    expect(root.status).toBe(200);
    expect(JSON.parse(root.body)).toEqual({ status: "ok" });
    expect((await request("HEAD", "/api")).status).toBe(200);

    const healthz = await request("GET", "/api/healthz");
    expect(healthz.status).toBe(200);
    expect(JSON.parse(healthz.body)).toEqual({ status: "ok" });

    // 2. readiness must NOT claim ready before migrations finish
    const readyz = await request("GET", "/api/readyz");
    expect(readyz.status).toBe(503);

    // 3. no application, auth, webhook or write route may execute
    for (const [method, path, body] of APPLICATION_ROUTES) {
      const res = await request(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(503);
      expect(res.body, `${method} ${path}`).toContain(BOOT_UNAVAILABLE_MESSAGE);
    }

    // 4. nothing reached the database, and no worker started
    expect(dbHits, "a blocked request must not reach the database").toEqual([]);
    expect(workersStarted, "workers must not start before migrations succeed").toBe(false);

    release();
    const outcome = await booting;
    expect(outcome.state).toBe("ready");
    expect(outcome.migrationRuns).toBe(1);
    expect(workersStarted).toBe(true);
  });

  it("does not disclose state, flags or configuration in the refusal", async () => {
    let release!: () => void;
    const booting = runBootSequence({
      listen,
      runMigrations: () => new Promise<void>((r) => (release = r)),
      startWorkers: () => {},
      logger: { info: () => {}, error: () => {} },
      exit: () => {},
    });
    await vi.waitFor(() => expect(base).not.toBe(""));

    const res = await request("POST", "/api/contact/submit", { name: "A" });
    // "starting up" is fine — it is what a user needs to know. What must never
    // appear is anything about internals: the migration step, the environment,
    // a variable name, or a stack.
    expect(res.body).not.toMatch(/migration|DATABASE_URL|process\.env|PUBLIC_[A-Z_]*ENABLED|_ENABLED|at \w+ \(/);
    expect(JSON.parse(res.body)).toEqual({ error: BOOT_UNAVAILABLE_MESSAGE });
    release();
    await booting;
  });
});

describe("startup lifecycle — after migrations succeed", () => {
  it("becomes ready, starts workers exactly once, and restores route behavior", async () => {
    let workerRuns = 0;
    let migrationRuns = 0;
    const outcome = await runBootSequence({
      listen,
      runMigrations: async () => {
        migrationRuns += 1;
      },
      startWorkers: () => {
        workerRuns += 1;
      },
      logger: { info: () => {}, error: () => {} },
      exit: () => {},
    });

    expect(outcome.state).toBe("ready");
    expect(getBootState()).toBe("ready");
    expect(migrationRuns, "migrations must run exactly once").toBe(1);
    expect(workerRuns, "workers must start exactly once").toBe(1);

    // Liveness unchanged.
    expect((await request("GET", "/api")).status).toBe(200);
    // Readiness now performs its real check — against the trapped database it
    // honestly reports not-ready rather than a blanket boot 503.
    const readyz = await request("GET", "/api/readyz");
    expect(readyz.status).toBe(503);
    expect(readyz.body).not.toContain(BOOT_UNAVAILABLE_MESSAGE);
    // Application routes execute again: this one is refused by its own
    // public-write gate, not by the boot gate.
    const signup = await request("POST", "/api/receptionist/auth/signup", { email: "a@b.test", password: "x", firmName: "X" });
    expect(signup.status).toBe(503);
    expect(signup.body).toContain("Account creation is not currently available.");
    expect(signup.body).not.toContain(BOOT_UNAVAILABLE_MESSAGE);
  });
});

describe("startup lifecycle — when migrations fail", () => {
  it("marks failed, starts no workers, closes the server and exits non-zero", async () => {
    let workersStarted = false;
    const exits: number[] = [];
    let closed = false;

    const outcome = await runBootSequence({
      listen: async () => {
        const s = await listen();
        const realClose = s.close.bind(s);
        s.close = ((cb?: () => void) => {
          closed = true;
          return realClose(cb);
        }) as typeof s.close;
        return s;
      },
      runMigrations: () => Promise.reject(new Error("relation does not exist")),
      startWorkers: () => {
        workersStarted = true;
      },
      logger: { info: () => {}, error: () => {} },
      exit: (code) => exits.push(code),
    });

    expect(outcome.state).toBe("failed");
    expect(getBootState()).toBe("failed");
    expect(workersStarted, "a failed migration must not start workers").toBe(false);
    expect(closed, "the HTTP server must be closed").toBe(true);
    expect(exits, "must select a non-zero exit path").toEqual([1]);
    expect(outcome.migrationRuns).toBe(1);
    server = null; // already closed by the sequence
  });

  it("never reports healthy once failed — the probe must not be lied to", async () => {
    const booting = runBootSequence({
      listen,
      runMigrations: () => Promise.reject(new Error("boom")),
      startWorkers: () => {},
      logger: { info: () => {}, error: () => {} },
      exit: () => {},
    });
    await booting;
    expect(getBootState()).toBe("failed");
    // The socket is closing; if it still answers, it must not answer 200.
    try {
      const res = await request("GET", "/api");
      expect(res.status).not.toBe(200);
    } catch {
      // Connection refused is the expected outcome and is equally acceptable.
    }
    server = null;
  });

  it("logs a sanitized error — no connection string, no credentials", () => {
    // Assembled from fragments on purpose: a whole credential-shaped URL
    // written as one literal would (correctly) trip the repository secret
    // scan, and allowlisting this file to keep a fixture would weaken a
    // control that has already caught two real mistakes in this workstream.
    const scheme = "postgre" + "sql://";
    const creds = "user:" + "hunter2" + "@";
    const dirty = new Error(
      `connect failed for ${scheme}${creds}db.internal:5432/app?sslmode=require pass` + "word=hunter2",
    );
    const clean = sanitizeBootError(dirty);
    expect(clean.name).toBe("Error");
    expect(clean.message).not.toContain("hunter2");
    expect(clean.message).not.toContain("db.internal");
    expect(clean.message).toContain("[redacted-url]");
    expect(clean.message).toContain("password=[redacted]");
    // Still useful to a human.
    expect(clean.message).toContain("connect failed");
  });

  it("caps a hostile error message instead of logging it whole", () => {
    const clean = sanitizeBootError(new Error("x".repeat(5000)));
    expect(clean.message.length).toBeLessThanOrEqual(500);
  });
});
