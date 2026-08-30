// Phase 2C.2D verification — regression test for the LEGACY, unmodified
// POST /api/discovery/submit endpoint (routes/discovery.ts). This route has
// no dependency-injection seam (unlike the new discoveryV1.ts), so it is
// exercised here as a real, minimal, standalone Express app on an
// ephemeral local port, with `db`'s methods monkey-patched in place (same
// singleton object the route itself imports — ESM module caching
// guarantees both this file and routes/discovery.ts share one `db`
// instance, so patching its methods here is visible there too) and
// `globalThis.fetch` monkey-patched to intercept the Resend SDK's outbound
// HTTP call (confirmed at node_modules/resend/dist/index.mjs — it calls
// the global `fetch`) — no real database write, no real email, no real
// network call leaves this process.
//
// Requires DATABASE_URL and RESEND_API_KEY to be set to harmless dummy
// values in the invoking shell (NOT real credentials) purely so
// `@workspace/db`'s module-scope Pool construction and email.ts's
// getResend() don't throw before the monkey-patches take effect — no
// connection is ever attempted against either value; both `db`'s query
// methods and `fetch` are fully intercepted below before any request is sent.
//
// Run via:
//   DATABASE_URL=postgres://test:test@127.0.0.1:1/test_never_connects \
//   RESEND_API_KEY=test-only-dummy-key \
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryLegacyRoute.test.ts
import express from "express";
import http from "node:http";
import { db, discoverySubmissions, formSubmissions } from "@workspace/db";
import discoveryRouter from "../src/routes/discovery";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) {
  console.error("This test requires dummy DATABASE_URL and RESEND_API_KEY env vars — see the run-via comment above.");
  process.exit(1);
}

// ── Monkey-patch db methods (same singleton routes/discovery.ts imports) ──

type FakeRow = Record<string, unknown>;
let nextSubmissionId = 1;
let nextFormSubmissionId = 1;
const insertedSubmissions: FakeRow[] = [];
const insertedFormSubmissions: FakeRow[] = [];
const updatedFormSubmissions: FakeRow[] = [];
let dbShouldThrowOnInsert = false;

function fakeInsert(table: unknown) {
  return {
    values(v: unknown) {
      return {
        async returning() {
          if (dbShouldThrowOnInsert) throw new Error("simulated db failure");
          if (table === discoverySubmissions) {
            const row = { id: nextSubmissionId++, ...(v as FakeRow) };
            insertedSubmissions.push(row);
            return [row];
          }
          if (table === formSubmissions) {
            const row = { id: nextFormSubmissionId++, ...(v as FakeRow) };
            insertedFormSubmissions.push(row);
            return [row];
          }
          throw new Error("unexpected table in fake insert");
        },
      };
    },
  };
}

function fakeUpdate(table: unknown) {
  return {
    set(v: unknown) {
      return {
        async where() {
          if (table === formSubmissions) {
            updatedFormSubmissions.push(v as FakeRow);
          }
          return undefined;
        },
      };
    },
  };
}

// @ts-expect-error -- intentional monkey-patch of the shared db singleton for this test process only.
db.insert = fakeInsert;
// @ts-expect-error -- intentional monkey-patch of the shared db singleton for this test process only.
db.update = fakeUpdate;

// ── Monkey-patch global fetch (intercepts the Resend SDK's outbound call) ──

// Tracks only calls that matched the resend.com interception below — the
// test's own `fetch()` calls to the local ephemeral server also pass
// through this same patched global, so a raw total isn't meaningful here.
let resendFetchCallCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("resend.com")) {
    resendFetchCallCount++;
    return new Response(JSON.stringify({ id: "test-fake-email-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;

// ── Standalone app ──────────────────────────────────────────────────────

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // routes/discovery.ts's handler reads req.log — pino-http isn't mounted
    // in this minimal app, so provide a no-op logger with the same shape.
    (req as unknown as { log: Record<string, (...a: unknown[]) => void> }).log = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    next();
  });
  app.use("/api", discoveryRouter);
  return app;
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = buildTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function run() {
  // 1. Route is registered and reachable at the established path.
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/discovery/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    check("route is registered (does not 404)", res.status !== 404);
    check("empty body is rejected with 400 (missing required fields)", res.status === 400);
    const body = (await res.json()) as Record<string, unknown>;
    check(
      "400 body names the established required fields",
      typeof body.error === "string" && body.error.includes("contactName") && body.error.includes("companyName") && body.error.includes("email"),
    );
  });

  // 2. Valid submission — established 201 success shape, DB insert + email attempt observed via patches, no real I/O.
  await withServer(async (baseUrl) => {
    resendFetchCallCount = 0;
    const payload = {
      contactName: "Jane Doe",
      companyName: "Acme Co",
      email: "jane@example.com",
      phone: "555-1234",
      industry: "Retail",
      services: ["new-website"],
      budget: "5k-10k",
      timeline: "asap",
      decisionMaker: "just-me",
    };
    const res = await fetch(`${baseUrl}/api/discovery/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    check("valid submission returns 201 (established success status)", res.status === 201);
    const body = (await res.json()) as Record<string, unknown>;
    check("201 body has success: true", body.success === true);
    check("201 body has a numeric id", typeof body.id === "number");
    check("a discoverySubmissions row was inserted (via the patched db, not a real write)", insertedSubmissions.length === 1);
    check("a formSubmissions row was inserted (via the patched db, not a real write)", insertedFormSubmissions.length === 1);
    check(
      "both team and client emails were attempted and intercepted at resend.com (team + client), never a real network send",
      resendFetchCallCount === 2,
    );
    check("formSubmissions row was updated with the (intercepted) email result", updatedFormSubmissions.length === 1);
  });

  // 3. Established behavior on DB failure — 500 with the fixed generic message (never a raw error).
  await withServer(async (baseUrl) => {
    dbShouldThrowOnInsert = true;
    try {
      const res = await fetch(`${baseUrl}/api/discovery/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName: "A", companyName: "B", email: "a@b.com" }),
      });
      check("a db failure returns 500 (established failure status)", res.status === 500);
      const body = (await res.json()) as Record<string, unknown>;
      check(
        "500 body is the fixed generic message, not a raw error",
        body.error === "Failed to save submission",
      );
    } finally {
      dbShouldThrowOnInsert = false;
    }
  });

  globalThis.fetch = originalFetch;

  if (failures > 0) {
    console.error(`\n${failures} discoveryLegacyRoute test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll discoveryLegacyRoute (legacy /api/discovery/submit regression) tests passed.");
  }
}

run();
