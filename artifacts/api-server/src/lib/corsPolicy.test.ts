/**
 * AR-001G — credentialed CORS allowlist.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * Nothing here opens a socket. The middleware assertions drive the real
 * composition returned by `createCorsMiddleware()` with a minimal in-memory
 * request/response pair, so the headers asserted below are the headers the
 * `cors` package actually writes — no listening server, no fetch, no network.
 */

import { describe, expect, it } from "vitest";
import {
  CORS_ALLOWED_ORIGINS_ENV_VAR,
  CorsConfigurationError,
  appendVaryOrigin,
  createCorsMiddleware,
  isOriginAllowed,
  isSafeLoopbackOrigin,
  parseAllowedOrigin,
  parseAllowedOrigins,
  resolveCorsPolicy,
  type CorsPolicy,
} from "./corsPolicy.js";

// Documentation-only hostnames (RFC 2606 `.test`). No real SiteMint or
// staging hostname appears in this repository.
const ALLOWED = "https://staging-receptionist.example.test";
const ALLOWED_2 = "https://app.example.test";

function policy(origins: string[], allowLoopback = false): CorsPolicy {
  return { allowedOrigins: Object.freeze(origins), allowLoopback };
}

// ─── In-memory request/response ────────────────────────────────────────────

interface CapturedResponse {
  headers: Map<string, string>;
  statusCode: number;
  ended: boolean;
  getHeader(name: string): string | undefined;
  setHeader(name: string, value: string): void;
  end(): void;
}

function makeRes(): CapturedResponse {
  const headers = new Map<string, string>();
  return {
    headers,
    statusCode: 200,
    ended: false,
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    end() {
      this.ended = true;
    },
  };
}

interface RunResult {
  res: CapturedResponse;
  nextCalled: boolean;
  nextError: unknown;
}

function run(p: CorsPolicy, origin: string | undefined, method = "GET"): RunResult {
  const middleware = createCorsMiddleware(p);
  const res = makeRes();
  const result: RunResult = { res, nextCalled: false, nextError: undefined };
  const req = {
    method,
    headers: origin === undefined ? {} : { origin },
  };
  middleware(req, res, (err?: unknown) => {
    result.nextCalled = true;
    result.nextError = err;
  });
  return result;
}

/** The two headers that, together, authorize a credentialed cross-origin read. */
function credentialedHeaders(res: CapturedResponse): {
  allowOrigin: string | undefined;
  allowCredentials: string | undefined;
} {
  return {
    allowOrigin: res.getHeader("access-control-allow-origin"),
    allowCredentials: res.getHeader("access-control-allow-credentials"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe("origin configuration parsing", () => {
  it("accepts one allowed HTTPS origin", () => {
    expect(parseAllowedOrigins(ALLOWED)).toEqual([ALLOWED]);
  });

  it("accepts multiple allowed origins and tolerates separator whitespace", () => {
    expect(parseAllowedOrigins(`${ALLOWED}, ${ALLOWED_2}`)).toEqual([ALLOWED, ALLOWED_2]);
  });

  it("de-duplicates a repeated origin", () => {
    expect(parseAllowedOrigins(`${ALLOWED},${ALLOWED},${ALLOWED_2}`)).toEqual([ALLOWED, ALLOWED_2]);
  });

  it("accepts a loopback development origin with an explicit port", () => {
    expect(parseAllowedOrigins("http://127.0.0.1:4173")).toEqual(["http://127.0.0.1:4173"]);
  });

  it.each([
    ["a wildcard", "*"],
    ["the opaque null origin", "null"],
    ["a trailing slash", "https://app.example.test/"],
    ["a path", "https://app.example.test/api"],
    ["a query string", "https://app.example.test?q=1"],
    ["a fragment", "https://app.example.test#f"],
    ["embedded credentials", "https://user:pass@app.example.test"],
    ["a redundant default port", "https://app.example.test:443"],
    ["a non-lowercase host", "https://APP.example.test"],
    ["a non-http scheme", "ftp://app.example.test"],
    ["a bare hostname", "app.example.test"],
    ["internal whitespace", "https://app.example .test"],
    ["an empty list entry", `${ALLOWED},,${ALLOWED_2}`],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseAllowedOrigins(raw)).toThrow(CorsConfigurationError);
  });

  it("never echoes the rejected value in the error message", () => {
    const secretish = "https://user:sup3rs3cret@app.example.test";
    try {
      parseAllowedOrigin(secretish);
      throw new Error("expected a CorsConfigurationError");
    } catch (err) {
      expect(err).toBeInstanceOf(CorsConfigurationError);
      expect((err as Error).message).not.toContain("sup3rs3cret");
      expect((err as Error).message).toContain(CORS_ALLOWED_ORIGINS_ENV_VAR);
    }
  });

  it("bounds an oversized configuration value", () => {
    expect(() => parseAllowedOrigins(`${ALLOWED},`.repeat(500))).toThrow(CorsConfigurationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("policy resolution", () => {
  it("fails when production configuration is absent", () => {
    expect(() => resolveCorsPolicy({ NODE_ENV: "production" })).toThrow(CorsConfigurationError);
  });

  it("fails when production configuration is empty or whitespace", () => {
    expect(() => resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "" })).toThrow(
      CorsConfigurationError,
    );
    expect(() => resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "   " })).toThrow(
      CorsConfigurationError,
    );
  });

  it("fails when production configuration is invalid", () => {
    expect(() => resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "*" })).toThrow(
      CorsConfigurationError,
    );
  });

  it("never implies loopback in production", () => {
    const resolved = resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: ALLOWED });
    expect(resolved.allowLoopback).toBe(false);
    expect(isOriginAllowed("http://localhost:5173", resolved)).toBe(false);
  });

  it("permits loopback outside production without any configuration", () => {
    const resolved = resolveCorsPolicy({ NODE_ENV: "development" });
    expect(resolved.allowedOrigins).toEqual([]);
    expect(resolved.allowLoopback).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", resolved)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("safe loopback classification", () => {
  it.each(["http://localhost:5173", "http://127.0.0.1:4173", "https://localhost:8443", "http://[::1]:3000"])(
    "accepts %s",
    (origin) => {
      expect(isSafeLoopbackOrigin(origin)).toBe(true);
    },
  );

  it.each([
    ["a bare localhost with no explicit port", "http://localhost"],
    ["an arbitrary LAN host", "http://192.168.1.20:3000"],
    ["a LAN hostname", "http://build-box.local:3000"],
    ["a replit preview host", "https://something.replit.dev"],
    ["a replit app host", "https://something.replit.app"],
    ["a localhost-suffixed impersonation", "http://localhost.attacker.test:3000"],
    ["a localhost-prefixed impersonation", "http://localhost-attacker.test:3000"],
  ])("rejects %s", (_label, origin) => {
    expect(isSafeLoopbackOrigin(origin)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("origin matching", () => {
  const p = policy([ALLOWED, ALLOWED_2]);

  it("allows an exactly listed origin", () => {
    expect(isOriginAllowed(ALLOWED, p)).toBe(true);
    expect(isOriginAllowed(ALLOWED_2, p)).toBe(true);
  });

  it.each([
    ["an unrelated origin", "https://attacker.test"],
    ["suffix impersonation", "https://app.example.test.attacker.test"],
    ["prefix impersonation", "https://evil-app.example.test"],
    ["subdomain impersonation", "https://evil.app.example.test"],
    ["a parent domain", "https://example.test"],
    ["the wrong scheme", "http://app.example.test"],
    ["the wrong port", "https://app.example.test:8443"],
    ["a trailing slash", "https://app.example.test/"],
    ["the opaque null origin", "null"],
    ["a wildcard", "*"],
    ["an empty origin", ""],
    ["non-loopback http", "http://192.168.1.20:3000"],
  ])("denies %s", (_label, origin) => {
    expect(isOriginAllowed(origin, p)).toBe(false);
  });

  it("denies loopback when loopback is not permitted", () => {
    expect(isOriginAllowed("http://localhost:5173", p)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("middleware behaviour", () => {
  const p = policy([ALLOWED, ALLOWED_2]);

  it("authorizes an allowed origin with credentials and Vary: Origin", () => {
    const { res, nextCalled } = run(p, ALLOWED);
    const { allowOrigin, allowCredentials } = credentialedHeaders(res);

    expect(allowOrigin).toBe(ALLOWED);
    expect(allowCredentials).toBe("true");
    expect(res.getHeader("vary")).toBe("Origin");
    expect(nextCalled).toBe(true);
  });

  it("never answers with a wildcard origin", () => {
    const { res } = run(p, ALLOWED);
    expect(credentialedHeaders(res).allowOrigin).not.toBe("*");
  });

  it.each([
    ["an unrelated origin", "https://attacker.test"],
    ["suffix impersonation", "https://app.example.test.attacker.test"],
    ["prefix impersonation", "https://evil-app.example.test"],
    ["subdomain impersonation", "https://evil.app.example.test"],
    ["the wrong scheme", "http://app.example.test"],
    ["the wrong port", "https://app.example.test:8443"],
    ["the opaque null origin", "null"],
  ])("grants no credentialed authorization to %s", (_label, origin) => {
    const { res, nextCalled, nextError } = run(p, origin);
    const { allowOrigin, allowCredentials } = credentialedHeaders(res);

    // Both halves must be absent: an allow-origin without allow-credentials
    // would still authorize an unauthenticated cross-origin read.
    expect(allowOrigin).toBeUndefined();
    expect(allowCredentials).toBeUndefined();
    // A denial is a missing header, not a server error.
    expect(nextCalled).toBe(true);
    expect(nextError).toBeFalsy();
  });

  it("still sets Vary: Origin on a denied response so caches cannot cross the two", () => {
    const { res } = run(p, "https://attacker.test");
    expect(res.getHeader("vary")).toBe("Origin");
  });

  it("leaks no cookie or session header to a denied origin", () => {
    const { res } = run(p, "https://attacker.test");
    expect(res.getHeader("set-cookie")).toBeUndefined();
    expect(res.getHeader("access-control-expose-headers")).toBeUndefined();
  });

  it("answers a preflight from an allowed origin", () => {
    const { res } = run(p, ALLOWED, "OPTIONS");
    const { allowOrigin, allowCredentials } = credentialedHeaders(res);

    expect(allowOrigin).toBe(ALLOWED);
    expect(allowCredentials).toBe("true");
    expect(res.getHeader("access-control-allow-methods")).toBeDefined();
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });

  it("refuses a preflight from a denied origin without any allow header", () => {
    const { res, nextCalled } = run(p, "https://attacker.test", "OPTIONS");
    const { allowOrigin, allowCredentials } = credentialedHeaders(res);

    expect(allowOrigin).toBeUndefined();
    expect(allowCredentials).toBeUndefined();
    expect(res.getHeader("access-control-allow-methods")).toBeUndefined();
    // Not short-circuited into a successful 204 preflight.
    expect(res.ended).toBe(false);
    expect(nextCalled).toBe(true);
  });

  it("lets an originless request through without an allow-origin header", () => {
    const { res, nextCalled, nextError } = run(p, undefined);

    expect(credentialedHeaders(res).allowOrigin).toBeUndefined();
    expect(nextCalled).toBe(true);
    expect(nextError).toBeFalsy();
  });

  it("permits a loopback origin only when the policy allows loopback", () => {
    const dev = policy([], true);
    expect(credentialedHeaders(run(dev, "http://localhost:5173").res).allowOrigin).toBe("http://localhost:5173");
    expect(credentialedHeaders(run(p, "http://localhost:5173").res).allowOrigin).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Vary header composition", () => {
  it("sets Origin when Vary is absent", () => {
    const res = makeRes();
    appendVaryOrigin(res);
    expect(res.getHeader("vary")).toBe("Origin");
  });

  it("appends Origin to an existing Vary", () => {
    const res = makeRes();
    res.setHeader("Vary", "Accept-Encoding");
    appendVaryOrigin(res);
    expect(res.getHeader("vary")).toBe("Accept-Encoding, Origin");
  });

  it("does not duplicate an Origin already present in any case", () => {
    const res = makeRes();
    res.setHeader("Vary", "Accept-Encoding, origin");
    appendVaryOrigin(res);
    expect(res.getHeader("vary")).toBe("Accept-Encoding, origin");
  });

  it("leaves a wildcard Vary alone", () => {
    const res = makeRes();
    res.setHeader("Vary", "*");
    appendVaryOrigin(res);
    expect(res.getHeader("vary")).toBe("*");
  });

  it("is idempotent across the middleware and the cors package", () => {
    const { res } = run(policy([ALLOWED]), ALLOWED);
    expect(res.getHeader("vary")).toBe("Origin");
  });
});
