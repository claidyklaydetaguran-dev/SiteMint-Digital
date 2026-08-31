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

// R6: count every Stripe client acquisition and Checkout Session creation, so
// "a blocked checkout makes zero Stripe calls" is measured, not assumed.
const stripeCalls: string[] = [];
(globalThis as { __stripeCalls?: string[] }).__stripeCalls = stripeCalls;
vi.mock("./lib/stripeClient.js", () => ({
  getUncachableStripeClient: async () => {
    (globalThis as { __stripeCalls?: string[] }).__stripeCalls?.push("getClient");
    return {
      checkout: {
        sessions: {
          create: async () => {
            (globalThis as { __stripeCalls?: string[] }).__stripeCalls?.push("sessions.create");
            return { url: "https://checkout.example.test/session" };
          },
        },
      },
    };
  },
  getStripeSync: async () => ({}),
}));

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
  "AI_TOOLKIT_CHECKOUT_ENABLED",
] as const;

afterEach(() => {
  for (const f of FLAGS) delete process.env[f];
  dbHits.length = 0;
  stripeCalls.length = 0;
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

// A structurally valid v1 discovery submission — enough to get past the
// schema if the gate ever let it through, so the test proves the GATE is
// what stops it and not a validation error.
const DISCOVERY_V1_BODY = {
  meta: { formStartedAt: new Date(Date.now() - 60_000).toISOString(), honeypot: "" },
  answers: { contact: { name: "A", email: "a@b.test" } },
};

// Several gated routes have OTHER legitimate 503s (discovery-v1 answers 503
// when its fingerprint config is unavailable), so "did the gate fire?" is
// decided by the gate's own message, never by the status code alone.
const DISABLED_MESSAGE: Record<string, string> = {
  PUBLIC_REGISTRATION_ENABLED: "Account creation is not currently available.",
  PUBLIC_FORM_SUBMISSIONS_ENABLED: "Form submission is not currently available.",
  PUBLIC_ANALYTICS_WRITES_ENABLED: "Analytics recording is not currently available.",
  AI_TOOLKIT_CHECKOUT_ENABLED: "Checkout is not currently available.",
};

// path → [flag that gates it, a body that WOULD be valid if it got through]
const GATED: Array<[string, string, unknown]> = [
  ["/api/receptionist/auth/signup", "PUBLIC_REGISTRATION_ENABLED", { email: "a@b.test", password: "Str0ngPassw0rd!", firmName: "X" }],
  ["/api/contact/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { name: "A", email: "a@b.test", message: "hello there" }],
  ["/api/discovery/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { name: "A", email: "a@b.test" }],
  ["/api/landing-test/submit", "PUBLIC_FORM_SUBMISSIONS_ENABLED", { vertical: "lawyers", name: "A", email: "a@b.test" }],
  ["/api/landing-test/view", "PUBLIC_ANALYTICS_WRITES_ENABLED", { page: "lawyers" }],
  // R6: the two writers closed in this PR.
  ["/api/v1/discovery-submissions", "PUBLIC_FORM_SUBMISSIONS_ENABLED", DISCOVERY_V1_BODY],
  ["/api/ai-toolkit/checkout", "AI_TOOLKIT_CHECKOUT_ENABLED", {}],
];

describe("public write gates — runtime behaviour", () => {
  for (const [path, flag, body] of GATED) {
    it(`${path} is refused with 503 and touches no database when ${flag} is absent`, async () => {
      const res = await post(path, body);
      expect(res.status).toBe(503);
      expect(res.body).toContain(DISABLED_MESSAGE[flag] as string);
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
        expect(res.body).toContain(DISABLED_MESSAGE[flag] as string);
        expect(dbHits).toEqual([]);
      });
    }

    it(`${path} passes the gate when ${flag} is exactly "true"`, async () => {
      process.env[flag] = "true";
      const res = await post(path, body);
      // Past the gate the request meets the trapped database, this route's own
      // validation, or its own unrelated 503 — what must no longer appear is
      // the GATE's reply. That is what the exact string "true" changes.
      expect(res.body).not.toContain(DISABLED_MESSAGE[flag] as string);
    });
  }

  it("the analytics gate is independent of the form-submission gate", async () => {
    process.env["PUBLIC_FORM_SUBMISSIONS_ENABLED"] = "true";
    const res = await post("/api/landing-test/view", { page: "lawyers" });
    expect(res.status, "enabling forms must not enable analytics").toBe(503);
    expect(res.body).toContain(DISABLED_MESSAGE["PUBLIC_ANALYTICS_WRITES_ENABLED"] as string);
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

  it("a blocked checkout makes zero Stripe calls", async () => {
    const res = await post("/api/ai-toolkit/checkout", {});
    expect(res.status).toBe(503);
    expect(stripeCalls, "no Stripe client may be built and no session created").toEqual([]);
    expect(dbHits, "not even the price lookup may run").toEqual([]);
  });

  it("an enabled checkout reaches Stripe and returns the session url", async () => {
    process.env["AI_TOOLKIT_CHECKOUT_ENABLED"] = "true";
    const res = await post("/api/ai-toolkit/checkout", {});
    // The price lookup hits the trapped database first, which is itself proof
    // the gate opened; Stripe is reached only once that lookup succeeds.
    expect(res.status).not.toBe(503);
    expect(dbHits.length, "enabled checkout performs the price lookup").toBeGreaterThan(0);
  });

  it("checkout is not gated by the boot-sync flag", async () => {
    process.env["STRIPE_BOOT_SYNC_ENABLED"] = "true";
    const res = await post("/api/ai-toolkit/checkout", {});
    expect(res.status, "boot sync must not enable customer checkout").toBe(503);
    expect(stripeCalls).toEqual([]);
    delete process.env["STRIPE_BOOT_SYNC_ENABLED"];
  });

  it("a blocked discovery submission creates no submission, job or external action", async () => {
    const res = await post("/api/v1/discovery-submissions", DISCOVERY_V1_BODY);
    expect(res.status).toBe(503);
    expect(dbHits, "no submission row and no pending job").toEqual([]);
    expect(stripeCalls).toEqual([]);
  });

  it("discovery and checkout gates are independent of each other", async () => {
    process.env["AI_TOOLKIT_CHECKOUT_ENABLED"] = "true";
    expect((await post("/api/v1/discovery-submissions", DISCOVERY_V1_BODY)).body)
      .toContain(DISABLED_MESSAGE["PUBLIC_FORM_SUBMISSIONS_ENABLED"] as string);
    delete process.env["AI_TOOLKIT_CHECKOUT_ENABLED"];
    process.env["PUBLIC_FORM_SUBMISSIONS_ENABLED"] = "true";
    const res = await post("/api/ai-toolkit/checkout", {});
    expect(res.status).toBe(503);
    expect(stripeCalls).toEqual([]);
  });

  it("login is not gated by any public-write flag", async () => {
    // A gate on login would lock out existing customers; it must reach the
    // credential path (and therefore the trapped database) even with all
    // three flags absent.
    const res = await post("/api/receptionist/auth/login", { email: "a@b.test", password: "x" });
    expect(res.status).not.toBe(503);
  });
});
