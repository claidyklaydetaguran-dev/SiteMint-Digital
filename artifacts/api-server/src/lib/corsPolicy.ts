// AR-001G: credentialed CORS allowlist.
//
// The previous configuration was `cors({ origin: true, credentials: true })`,
// which reflects *whatever* `Origin` the browser sent back in
// `Access-Control-Allow-Origin` while also sending
// `Access-Control-Allow-Credentials: true`. That combination lets any website
// a signed-in user visits make credentialed, cookie-bearing requests to this
// API and read the responses — including the authenticated surface behind the
// receptionist session cookie. This module replaces it with an explicit,
// exact-match allowlist.
//
// Nothing here is read at module import time: `resolveCorsPolicy()` takes the
// environment as an argument, so tests never depend on `process.env`.

import cors, { type CorsOptions } from "cors";

export const CORS_ALLOWED_ORIGINS_ENV_VAR = "CORS_ALLOWED_ORIGINS";

/** Thrown for any invalid configuration. Never includes the rejected value — it may carry credentials. */
export class CorsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorsConfigurationError";
  }
}

/** Bounds the configuration string before any parsing work. */
const MAX_CONFIG_LENGTH = 4_096;

/** The only schemes ever accepted for an allowlisted origin. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * The only hostnames that may be treated as "safe loopback" outside
 * production. Deliberately a fixed set of literals: no suffix matching, no
 * `*.localhost`, no LAN range, and no `*.replit.dev`.
 */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validates one origin string and returns it unchanged.
 *
 * The check is an exact identity comparison against `URL.origin`, which is
 * what makes every rejected form fall out of a single rule rather than a list
 * of special cases:
 *
 * - a path, query or fragment (`https://a.test/x`, `?q=1`, `#f`) — `origin`
 *   drops them, so the raw string cannot equal it;
 * - a trailing slash (`https://a.test/`) — same reason;
 * - embedded credentials (`https://u:p@a.test`) — `origin` drops the userinfo;
 * - an explicitly written default port (`https://a.test:443`) — the WHATWG URL
 *   parser normalizes it away, exactly the trap already documented in
 *   `lib/voice/providers/vapi/config.ts`, so the written-out form is refused
 *   rather than silently treated as equivalent;
 * - a non-lowercase scheme or host (`HTTPS://A.test`) — `origin` lowercases
 *   both, so only the already-canonical form is accepted;
 * - `null`, `*`, and any other non-absolute string — these either do not parse
 *   as an absolute URL at all, or produce the opaque `"null"` origin.
 *
 * Requiring the configured text to already be canonical means the value later
 * compared against a request's `Origin` header is byte-for-byte what the
 * operator wrote, with no normalization step in between that could make two
 * different-looking strings compare equal.
 */
export function parseAllowedOrigin(raw: string): string {
  if (typeof raw !== "string") {
    throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} entries must be strings.`);
  }
  if (raw.length === 0) {
    throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} contains an empty origin.`);
  }
  if (raw === "*") {
    throw new CorsConfigurationError(
      `${CORS_ALLOWED_ORIGINS_ENV_VAR} must not contain a wildcard: a wildcard origin can never be combined with credentials.`,
    );
  }
  if (raw === "null") {
    throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} must not contain the opaque "null" origin.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CorsConfigurationError(
      `${CORS_ALLOWED_ORIGINS_ENV_VAR} contains an entry that is not an absolute origin.`,
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} entries must use http or https.`);
  }
  if (parsed.origin !== raw) {
    throw new CorsConfigurationError(
      `${CORS_ALLOWED_ORIGINS_ENV_VAR} entries must be a bare origin — no path, query, fragment, trailing slash, credentials, or redundant default port.`,
    );
  }

  return raw;
}

/**
 * Splits, validates and de-duplicates the comma-separated configuration.
 * Whitespace around a separator is tolerated (it is list formatting, not part
 * of an origin); whitespace *inside* an entry makes it fail
 * `parseAllowedOrigin`. An entirely empty or whitespace value yields an empty
 * list — whether that is fatal is the caller's decision, because it is only
 * fatal in production.
 */
export function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  if (raw.length > MAX_CONFIG_LENGTH) {
    throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} exceeds the maximum allowed length.`);
  }
  if (raw.trim().length === 0) return [];

  const seen = new Set<string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new CorsConfigurationError(`${CORS_ALLOWED_ORIGINS_ENV_VAR} contains an empty list entry.`);
    }
    seen.add(parseAllowedOrigin(trimmed));
  }
  return Object.freeze([...seen]);
}

export interface CorsPolicy {
  readonly allowedOrigins: readonly string[];
  /** True only outside production. Never widens the allowlist in production. */
  readonly allowLoopback: boolean;
}

/** The only environment fields this module reads. */
export interface CorsPolicyEnv {
  NODE_ENV?: string | undefined;
  CORS_ALLOWED_ORIGINS?: string | undefined;
}

/**
 * Builds the effective policy. In production a valid, non-empty
 * `CORS_ALLOWED_ORIGINS` is mandatory and loopback is never implied, so an
 * unconfigured or malformed production deployment throws here — and because
 * `app.ts` calls this while being imported, that happens before
 * `app.listen()` is ever reached.
 */
export function resolveCorsPolicy(env: CorsPolicyEnv): CorsPolicy {
  const isProduction = env.NODE_ENV === "production";
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (isProduction && allowedOrigins.length === 0) {
    throw new CorsConfigurationError(
      `${CORS_ALLOWED_ORIGINS_ENV_VAR} must list at least one origin when NODE_ENV=production.`,
    );
  }

  return Object.freeze({ allowedOrigins, allowLoopback: !isProduction });
}

/**
 * True for `http(s)://localhost:<port>`, `http(s)://127.0.0.1:<port>` and
 * `http(s)://[::1]:<port>` only. An explicit port is required, so a bare
 * `http://localhost` is not a safe loopback origin. Every other host —
 * including any LAN address and any `*.replit.dev` preview host — is false.
 */
export function isSafeLoopbackOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false;
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  if (parsed.port === "") return false;
  // `URL.hostname` strips the brackets from an IPv6 literal, so `[::1]` is
  // compared in both the bare and bracketed forms.
  return LOOPBACK_HOSTNAMES.has(parsed.hostname) || LOOPBACK_HOSTNAMES.has(`[${parsed.hostname}]`);
}

/**
 * Exact-match membership test. There is no prefix, suffix, subdomain or
 * regular-expression matching anywhere in this module, so
 * `https://app.example.test.attacker.test`, `https://evil-app.example.test`
 * and `https://sub.app.example.test` are all simply absent from the set.
 */
export function isOriginAllowed(origin: string, policy: CorsPolicy): boolean {
  if (typeof origin !== "string" || origin.length === 0) return false;
  if (origin === "null" || origin === "*") return false;
  if (policy.allowedOrigins.includes(origin)) return true;
  return policy.allowLoopback && isSafeLoopbackOrigin(origin);
}

/**
 * Builds the `cors` options for a resolved policy.
 *
 * The delegate answers `false` for a denied origin rather than an `Error`.
 * That distinction matters: `cors` turns an error into `next(err)`, which
 * would surface as a 500, whereas `false` makes it call `next()` having set
 * no `Access-Control-Allow-Origin` and no `Access-Control-Allow-Credentials`
 * header at all. The browser then blocks the response itself, which is the
 * correct denial and discloses nothing about why.
 *
 * A request with no `Origin` header is answered `true`. This is not a
 * widening: with no origin to reflect, `cors` computes an
 * `Access-Control-Allow-Origin` value of `undefined` and therefore emits no
 * such header. It exists so that server-to-server and same-origin callers,
 * which CORS does not govern, keep working.
 */
export function createCorsOptions(policy: CorsPolicy): CorsOptions {
  return {
    credentials: true,
    origin(requestOrigin, callback) {
      if (requestOrigin === undefined) {
        callback(null, true);
        return;
      }
      callback(null, isOriginAllowed(requestOrigin, policy));
    },
  };
}

/**
 * Appends `Origin` to the response `Vary` header without duplicating it.
 *
 * This is applied to every request, allowed or denied, and that is the whole
 * point. `cors` only sets `Vary: Origin` on the path where it actually
 * evaluates an origin; when the delegate denies, `cors` short-circuits to
 * `next()` and sets no headers at all. A denied response and an allowed
 * response for the same URL differ, so without `Vary: Origin` on both a
 * shared cache could serve one origin's credentialed response to another.
 *
 * The `vary` package is a transitive dependency of `cors`, not a declared
 * dependency of this workspace, so it is deliberately not imported here.
 */
export function appendVaryOrigin(res: {
  getHeader(name: string): number | string | string[] | undefined;
  setHeader(name: string, value: string): unknown;
}): void {
  const existing = res.getHeader("Vary");
  if (existing === undefined) {
    res.setHeader("Vary", "Origin");
    return;
  }
  const current = Array.isArray(existing) ? existing.join(", ") : String(existing);
  if (current.trim() === "*") return;
  const alreadyPresent = current.split(",").some((part) => part.trim().toLowerCase() === "origin");
  if (!alreadyPresent) {
    res.setHeader("Vary", `${current}, Origin`);
  }
}

/** Minimal request surface the CORS layer touches. */
export interface CorsRequestLike {
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/** Minimal response surface the CORS layer touches. */
export interface CorsResponseLike {
  statusCode?: number;
  getHeader(name: string): number | string | string[] | undefined;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

/**
 * The middleware actually mounted by `app.ts`: `Vary: Origin` first, on every
 * request, then the configured `cors` middleware. Exported so tests exercise
 * the exact composition that runs in production rather than re-assembling an
 * equivalent one.
 */
export function createCorsMiddleware(
  policy: CorsPolicy,
): (req: CorsRequestLike, res: CorsResponseLike, next: (err?: unknown) => void) => void {
  const inner = cors(createCorsOptions(policy)) as unknown as (
    req: CorsRequestLike,
    res: CorsResponseLike,
    next: (err?: unknown) => void,
  ) => void;

  return function siteMintCors(req, res, next): void {
    appendVaryOrigin(res);
    inner(req, res, next);
  };
}
