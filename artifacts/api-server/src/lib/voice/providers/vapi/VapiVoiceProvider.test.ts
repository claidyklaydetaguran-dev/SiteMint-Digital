/**
 * AR-001E — Vapi delete-contract hardening, exercised through the REAL
 * `VapiVoiceProvider` with a local fetch stub.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 * (collected by vitest.config.ts `include: ["src/**\/*.test.ts"]`.)
 *
 * AR-001D found that the cleanup contract had only ever been tested through a
 * scripted provider that returned pre-normalized `VoiceProviderError`s. That
 * proves how cleanup reacts to a code, and nothing about which HTTP responses
 * produce which code. This file closes that gap: every assertion below drives
 * `VapiVoiceProvider` itself and stubs only the global `fetch`.
 *
 * Nothing here reaches a network. `fetch` is replaced for the whole file by a
 * stub that answers from a queued script and throws if it is called without
 * one, so an unscripted request fails the test rather than escaping. Every
 * other I/O global is a tripwire that records and throws.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { VapiVoiceProvider } from "./VapiVoiceProvider";
import { createVapiProviderConfig, VAPI_OFFICIAL_BASE_URL } from "./config";
import { VoiceProviderError, type VoiceProviderErrorCode } from "../../errors";

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** Not a real credential: a fixed literal that exists only inside this file. */
const TEST_API_KEY = "test-key-not-a-real-credential";
const TIMEOUT_MS = 1_000; // the configured minimum, so timeout tests stay short
const REMOTE_ID = "asst_staging_0001";

function provider(): VapiVoiceProvider {
  return new VapiVoiceProvider(createVapiProviderConfig({ apiKey: TEST_API_KEY, timeoutMs: TIMEOUT_MS }));
}

function abortError(): Error {
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

// ─── Local fetch stub ──────────────────────────────────────────────────────

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  hasBody: boolean;
  redirect: unknown;
}

type ScriptedReply =
  /** Resolve with a response carrying this status and body text. */
  | { kind: "response"; status: number; body: string; contentLength?: string }
  /** Reject the fetch itself, as a transport failure would. */
  | { kind: "network_error" }
  /** Never deliver headers; reject only once the provider's deadline aborts. */
  | { kind: "stall_headers" }
  /** Deliver headers immediately, then stall the body until the deadline aborts. */
  | { kind: "stall_body"; status: number };

const recorded: RecordedRequest[] = [];
let script: ScriptedReply[] = [];

function stubResponse(status: number, body: string, contentLength?: string): Response {
  return {
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-length" ? (contentLength ?? null) : null),
    },
    text: async () => body,
  } as unknown as Response;
}

/** Resolves only when `signal` aborts, and then rejects — never on a timer of its own. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

async function fetchStub(input: unknown, init: Record<string, unknown> = {}): Promise<Response> {
  const signal = init["signal"] as AbortSignal;
  recorded.push({
    url: String(input),
    method: String(init["method"] ?? "GET"),
    headers: { ...((init["headers"] as Record<string, string>) ?? {}) },
    hasBody: init["body"] !== undefined,
    redirect: init["redirect"],
  });

  const next = script.shift();
  if (next === undefined) {
    throw new Error("AR-001E: fetch was called with no scripted reply queued");
  }

  switch (next.kind) {
    case "response":
      return stubResponse(next.status, next.body, next.contentLength);
    case "network_error":
      throw new TypeError("fetch failed");
    case "stall_headers":
      return rejectOnAbort(signal);
    case "stall_body":
      return {
        status: next.status,
        headers: { get: () => null },
        // The body never arrives. Only the provider's own deadline ends this.
        text: () => rejectOnAbort(signal),
      } as unknown as Response;
  }
}

// ─── Tripwires for every other I/O surface ─────────────────────────────────

const tripwire = { XMLHttpRequest: 0, WebSocket: 0, RTCPeerConnection: 0, sendBeacon: 0, getUserMedia: 0 };
const globalAny = globalThis as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};
let originalFetch: unknown;

beforeAll(() => {
  originalFetch = globalAny["fetch"];
  globalAny["fetch"] = fetchStub;
  for (const name of Object.keys(tripwire) as (keyof typeof tripwire)[]) {
    originals[name] = globalAny[name];
    globalAny[name] = function trip(): never {
      tripwire[name] += 1;
      throw new Error(`AR-001E tripwire: ${name} was invoked`);
    };
  }
});

afterAll(() => {
  if (originalFetch === undefined) delete globalAny["fetch"];
  else globalAny["fetch"] = originalFetch;
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalAny[name];
    else globalAny[name] = value;
  }
});

beforeEach(() => {
  recorded.length = 0;
  script = [];
});

afterEach(() => {
  for (const key of Object.keys(tripwire) as (keyof typeof tripwire)[]) {
    expect(tripwire[key], `${key} must never be invoked`).toBe(0);
  }
  // Nothing may be left queued: an unconsumed reply means a request the test
  // expected was never made.
  expect(script, "every scripted reply must be consumed").toHaveLength(0);
});

/** Runs `fn` and returns the VoiceProviderError it threw. Fails if it resolved. */
async function captureError(fn: () => Promise<unknown>): Promise<VoiceProviderError> {
  try {
    await fn();
  } catch (err) {
    expect(err, "provider must normalize every failure").toBeInstanceOf(VoiceProviderError);
    return err as VoiceProviderError;
  }
  throw new Error("expected the provider call to reject, but it resolved");
}

// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE request shape", () => {
  it("targets the documented endpoint with a percent-encoded id and no body", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) }];
    await provider().deleteAssistant(REMOTE_ID);

    expect(recorded).toHaveLength(1);
    const request = recorded[0]!;
    expect(request.url).toBe(`${VAPI_OFFICIAL_BASE_URL}/assistant/${REMOTE_ID}`);
    expect(request.method).toBe("DELETE");
    expect(request.hasBody).toBe(false);
    expect(request.headers["Content-Type"]).toBeUndefined();
    expect(request.redirect).toBe("error");
  });

  it("percent-encodes an id containing URL-significant characters", async () => {
    const awkward = "asst 1/2?x=3&y=4#z";
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: awkward }) }];
    await provider().deleteAssistant(awkward);

    expect(recorded[0]!.url).toBe(`${VAPI_OFFICIAL_BASE_URL}/assistant/${encodeURIComponent(awkward)}`);
    // The path must carry exactly one segment after /assistant/.
    expect(new URL(recorded[0]!.url).pathname.split("/")).toHaveLength(3);
  });

  it("sends a bearer authorization header whose value is never asserted in the clear", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) }];
    await provider().deleteAssistant(REMOTE_ID);

    const authorization = recorded[0]!.headers["Authorization"];
    expect(typeof authorization).toBe("string");
    expect(authorization!.startsWith("Bearer ")).toBe(true);
    expect(authorization!.slice("Bearer ".length).length).toBeGreaterThan(0);
    // Deliberately no equality assertion against the key itself.
  });

  it("makes exactly one request per delete call and never retries on its own", async () => {
    for (const status of [200, 404, 429, 500]) {
      recorded.length = 0;
      script = [{ kind: "response", status, body: status === 200 ? JSON.stringify({ id: REMOTE_ID }) : "{}" }];
      await provider()
        .deleteAssistant(REMOTE_ID)
        .catch(() => undefined);
      expect(recorded, `status ${status} must produce exactly one request`).toHaveLength(1);
    }
  });

  it("rejects a blank id before any request is dispatched", async () => {
    const error = await captureError(() => provider().deleteAssistant("   "));
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(recorded).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("documented success — HTTP 200 with a matching assistant id", () => {
  it("is the only shape that reports a definitive deletion", async () => {
    script = [
      { kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID, name: "Front Desk", orgId: "org_1" }) },
    ];
    const result = await provider().deleteAssistant(REMOTE_ID);
    expect(result).toEqual({ providerAssistantId: REMOTE_ID, deleted: true });
  });

  it("accepts the documented body regardless of the other fields it carries", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID, extra: { nested: true } }) }];
    await expect(provider().deleteAssistant(REMOTE_ID)).resolves.toEqual({
      providerAssistantId: REMOTE_ID,
      deleted: true,
    });
  });

  it("trims the caller's id and matches the response against the trimmed value", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) }];
    const result = await provider().deleteAssistant(`  ${REMOTE_ID}  `);
    expect(result.providerAssistantId).toBe(REMOTE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("HTTP 200 that does not prove deletion — uncertain, never success", () => {
  it.each([
    ["an empty body", ""],
    ["invalid JSON", "{not json"],
    ["a JSON array", JSON.stringify([{ id: REMOTE_ID }])],
    ["JSON null", "null"],
    ["a JSON string", JSON.stringify("deleted")],
    ["a missing id", JSON.stringify({ name: "Front Desk" })],
    ["a blank id", JSON.stringify({ id: "   " })],
    ["a non-string id", JSON.stringify({ id: 12345 })],
    ["a mismatched id", JSON.stringify({ id: "asst_someone_elses_9999" })],
    ["an untrimmed id that is not an exact match", JSON.stringify({ id: ` ${REMOTE_ID} ` })],
  ])("treats %s as PROVIDER_ERROR", async (_label, body) => {
    script = [{ kind: "response", status: 200, body }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).not.toMatch(/deleted|success/i);
    expect(recorded).toHaveLength(1);
  });

  it("never names the mismatched id it received", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: "asst_someone_elses_9999" }) }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
    expect(error.message).not.toContain("asst_someone_elses_9999");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("undocumented 2xx — never read as deletion", () => {
  it.each([201, 202, 204, 205, 206, 299])("treats %i as an inconclusive PROVIDER_ERROR", async (status) => {
    script = [{ kind: "response", status, body: status === 204 ? "" : JSON.stringify({ id: REMOTE_ID }) }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toContain("not a documented success");
    // Explicitly not read as an async-accepted deletion.
    expect(error.message).not.toMatch(/accepted|asynchronous|queued|scheduled/i);
  });

  it("does not treat a 202 body that happens to echo the id as proof", async () => {
    script = [{ kind: "response", status: 202, body: JSON.stringify({ id: REMOTE_ID }) }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
    expect(error.code).toBe("PROVIDER_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("HTTP status → normalized error code", () => {
  const MATRIX: ReadonlyArray<readonly [number, VoiceProviderErrorCode]> = [
    [400, "VALIDATION_FAILED"],
    [401, "AUTHENTICATION_FAILED"],
    [403, "AUTHENTICATION_FAILED"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "VALIDATION_FAILED"],
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_ERROR"],
    [502, "PROVIDER_ERROR"],
    [503, "PROVIDER_ERROR"],
  ];

  it.each(MATRIX)("maps %i to %s on delete", async (status, code) => {
    script = [{ kind: "response", status, body: JSON.stringify({ message: "provider detail" }) }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
    expect(error.code).toBe(code);
  });

  it("maps the same statuses identically on get, so no operation was weakened", async () => {
    for (const [status, code] of MATRIX) {
      script = [{ kind: "response", status, body: "{}" }];
      const error = await captureError(() => provider().getAssistant(REMOTE_ID));
      expect(error.code, `GET ${status}`).toBe(code);
    }
  });

  it("marks 400 and 422 as definitive rather than retryable", async () => {
    for (const status of [400, 422]) {
      script = [{ kind: "response", status, body: "{}" }];
      const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.retryable, `status ${status} must not be retryable`).toBe(false);
    }
  });

  it("keeps 404 as NOT_FOUND and words it as an observation, not as absence", async () => {
    script = [{ kind: "response", status: 404, body: "" }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));

    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toContain("404");
    // The old wording ("was not found") asserted absence. It must not return.
    expect(error.message).not.toMatch(/was not found|does not exist|already (absent|deleted|gone)/i);
  });

  it("never echoes a provider response body into the normalized message", async () => {
    script = [{ kind: "response", status: 500, body: JSON.stringify({ message: "internal detail leak" }) }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
    expect(error.message).not.toContain("internal detail leak");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("transport failures", () => {
  it("maps a network failure to NETWORK_ERROR", async () => {
    script = [{ kind: "network_error" }];
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.retryable).toBe(true);
  });

  it("maps a stalled header wait to TIMEOUT", async () => {
    script = [{ kind: "stall_headers" }];
    const started = Date.now();
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));

    expect(error.code).toBe("TIMEOUT");
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
  });

  it("maps a stalled response BODY to TIMEOUT — the deadline covers the read", async () => {
    // AR-001D found the abort timer was cleared once headers arrived, so a
    // body that never completed hung forever. This is the regression test.
    script = [{ kind: "stall_body", status: 200 }];
    const started = Date.now();
    const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));

    expect(error.code).toBe("TIMEOUT");
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(recorded).toHaveLength(1);
  });

  it("aborts a stalled body on GET too, not only on DELETE", async () => {
    script = [{ kind: "stall_body", status: 200 }];
    const error = await captureError(() => provider().getAssistant(REMOTE_ID));
    expect(error.code).toBe("TIMEOUT");
  });

  it("clears its deadline timer on every path, leaving nothing dangling", async () => {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const ours = new Set<unknown>();
    let cleared = 0;

    // Only the provider's own deadline (delay === TIMEOUT_MS) is tracked, so
    // unrelated timers from the test runner cannot pollute the count.
    (globalThis as unknown as Record<string, unknown>)["setTimeout"] = ((
      handler: () => void,
      delay?: number,
      ...rest: unknown[]
    ) => {
      const id = (realSetTimeout as unknown as (...a: unknown[]) => unknown)(handler, delay, ...rest);
      if (delay === TIMEOUT_MS) ours.add(id);
      return id;
    }) as unknown as typeof setTimeout;

    (globalThis as unknown as Record<string, unknown>)["clearTimeout"] = ((id: unknown) => {
      if (ours.has(id)) cleared += 1;
      return (realClearTimeout as unknown as (...a: unknown[]) => unknown)(id);
    }) as unknown as typeof clearTimeout;

    try {
      script = [
        { kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) },
        { kind: "response", status: 500, body: "{}" },
        { kind: "network_error" },
        { kind: "stall_headers" },
      ];
      const p = provider();
      await p.deleteAssistant(REMOTE_ID);
      await p.deleteAssistant(REMOTE_ID).catch(() => undefined);
      await p.deleteAssistant(REMOTE_ID).catch(() => undefined);
      await p.deleteAssistant(REMOTE_ID).catch(() => undefined);

      expect(ours.size, "four calls create four deadline timers").toBe(4);
      expect(cleared, "every deadline timer is cleared").toBe(4);
    } finally {
      (globalThis as unknown as Record<string, unknown>)["setTimeout"] = realSetTimeout;
      (globalThis as unknown as Record<string, unknown>)["clearTimeout"] = realClearTimeout;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("safety envelope", () => {
  it("only ever addresses the official Vapi origin, and never leaves the stub", async () => {
    script = [
      { kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) },
      { kind: "response", status: 404, body: "" },
    ];
    const p = provider();
    await p.deleteAssistant(REMOTE_ID);
    await p.deleteAssistant(REMOTE_ID).catch(() => undefined);

    expect(recorded.length).toBeGreaterThan(0);
    for (const request of recorded) {
      expect(new URL(request.url).origin).toBe(VAPI_OFFICIAL_BASE_URL);
    }
    // The stub is the only fetch this module can reach; it answers from the
    // script above and never forwards to the real implementation.
    expect(globalAny["fetch"]).toBe(fetchStub);
  });

  it("never issues a create or update request while deleting", async () => {
    script = [{ kind: "response", status: 200, body: JSON.stringify({ id: REMOTE_ID }) }];
    await provider().deleteAssistant(REMOTE_ID);

    expect(recorded.every((r) => r.method === "DELETE")).toBe(true);
    expect(recorded.some((r) => r.method === "POST" || r.method === "PATCH")).toBe(false);
    expect(recorded.some((r) => r.hasBody)).toBe(false);
  });

  it("leaks no credential into any normalized error across the whole matrix", async () => {
    const statuses = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500];
    for (const status of statuses) {
      script = [{ kind: "response", status, body: status === 200 ? "" : "{}" }];
      const error = await captureError(() => provider().deleteAssistant(REMOTE_ID));
      expect(error.message).not.toContain(TEST_API_KEY);
      expect(error.message).not.toMatch(/Bearer|authorization|api[_ -]?key/i);
      expect(JSON.stringify(error.toJSON())).not.toContain(TEST_API_KEY);
    }
  });

  it("keeps the cleanup path free of browser, media, and database imports", () => {
    // A static check, because these must be absent from the module graph
    // rather than merely unused at runtime.
    const here = fileURLToPath(new URL(".", import.meta.url));
    const sources = [
      `${here}VapiVoiceProvider.ts`,
      `${here}../../../voiceCleanup/cleanupService.ts`,
      `${here}../../../voiceCleanup/cleanupStagingAssistant.cli.ts`,
    ].map((path) => readFileSync(path, "utf8"));

    for (const source of sources) {
      expect(source).not.toMatch(/@vapi-ai\/web|vapi-web|getUserMedia|RTCPeerConnection|new WebSocket|sendBeacon/);
      expect(source).not.toMatch(/from ["']pg["']|drizzle-orm\/node-postgres|createPool|new Pool\(/);
    }
    // cleanupService.ts in particular must reach no database client at all,
    // directly or through the repository module.
    expect(sources[1]).not.toContain("@workspace/db/client");
  });
});
