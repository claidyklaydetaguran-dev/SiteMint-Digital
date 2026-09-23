import type { Request } from "express";

// ── Rate-limit constants ────────────────────────────────────────────────────────

export const LOGIN_EMAIL_LIMIT  = 10;
export const LOGIN_EMAIL_WINDOW = 15 * 60 * 1000; // 15 min

export const LOGIN_IP_LIMIT     = 30;
export const LOGIN_IP_WINDOW    = 15 * 60 * 1000; // 15 min

export const SIGNUP_IP_LIMIT    = 5;
export const SIGNUP_IP_WINDOW   = 60 * 60 * 1000; // 1 hour

const PURGE_INTERVAL = 5 * 60 * 1000; // 5 min

// ── Sliding-window limiter ─────────────────────────────────────────────────────
// Keyed by any string (IP or normalised email). Stores an array of event
// timestamps (epoch ms) per key. Per-call pruning keeps old timestamps out;
// the periodic purge removes entries that have gone entirely stale.

class SlidingWindow {
  private readonly store = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private prune(key: string): number[] {
    const cutoff     = Date.now() - this.windowMs;
    const timestamps = (this.store.get(key) ?? []).filter((t) => t > cutoff);
    if (timestamps.length > 0) {
      this.store.set(key, timestamps);
    } else {
      this.store.delete(key);
    }
    return timestamps;
  }

  /** Current event count within the window (does not record). */
  count(key: string): number {
    return this.prune(key).length;
  }

  /**
   * True if the count has already reached the limit WITHOUT recording.
   * Use for pre-checks (check then decide whether to record separately).
   */
  isOverLimit(key: string): boolean {
    return this.count(key) >= this.limit;
  }

  /** Record a new event. */
  record(key: string): void {
    const timestamps = this.prune(key);
    timestamps.push(Date.now());
    this.store.set(key, timestamps);
  }

  /** Clear all events for a key (called on successful login to reset email counter). */
  reset(key: string): void {
    this.store.delete(key);
  }

  /** Remove fully-stale entries (called by the periodic purge). */
  purgeStale(): void {
    for (const key of this.store.keys()) {
      this.prune(key); // prune already deletes entries that become empty
    }
  }
}

// ── Exported instances ─────────────────────────────────────────────────────────

export const loginEmailLimiter = new SlidingWindow(LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW);
export const loginIpLimiter    = new SlidingWindow(LOGIN_IP_LIMIT,    LOGIN_IP_WINDOW);
export const signupIpLimiter   = new SlidingWindow(SIGNUP_IP_LIMIT,   SIGNUP_IP_WINDOW);

// ── Periodic memory purge ──────────────────────────────────────────────────────
// .unref() prevents the interval from keeping the process alive during tests.

setInterval(() => {
  loginEmailLimiter.purgeStale();
  loginIpLimiter.purgeStale();
  signupIpLimiter.purgeStale();
}, PURGE_INTERVAL).unref();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Number of reverse-proxy hops whose X-Forwarded-For entries may be trusted.
 * `TRUSTED_PROXY_HOPS` when set (0–10); otherwise 1 in production (Replit's
 * edge is always exactly one hop in front of the container) and 0 elsewhere,
 * where no proxy exists and the socket address is the client.
 */
export function trustedProxyHopsForLimiters(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["TRUSTED_PROXY_HOPS"];
  if (raw !== undefined) {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
  }
  return env["NODE_ENV"] === "production" ? 1 : 0;
}

/**
 * Pure derivation shared with the tests: the address the OUTERMOST trusted
 * proxy observed. Each proxy appends the address it received the connection
 * from, so only the rightmost `hops` entries were written by our own
 * infrastructure; everything further left came from the caller and is
 * forgeable. A chain shorter than the configured topology means the request
 * did not traverse it, so the socket address is used instead.
 */
export function clientIpFromForwardedChain(
  forwardedFor: string | string[] | undefined,
  socketAddress: string | undefined,
  hops: number,
): string {
  const fallback = socketAddress ?? "unknown";
  if (hops === 0) return fallback;
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? "";
  const chain = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const idx = chain.length - hops;
  if (idx < 0 || idx >= chain.length) return fallback;
  return chain[idx] ?? fallback;
}

/**
 * Derive the client IP for rate limiting.
 *
 * Launch security audit (2026-09-24, owner-authorised edit): the previous
 * implementation took the LEFTMOST X-Forwarded-For value, which the caller
 * controls, so a random header per request bypassed every limiter built on
 * this helper (admin login, receptionist login/signup, public forms). It now
 * uses the same trusted-hop derivation as `staffAuth.deriveClientIp`.
 *
 * Note: app.ts does NOT set `trust proxy`; IP derivation is scoped to this
 * helper so there are no side effects on req.ip / req.protocol across other
 * routes.
 */
export function getClientIp(req: Request): string {
  return clientIpFromForwardedChain(
    req.headers["x-forwarded-for"],
    req.socket.remoteAddress,
    trustedProxyHopsForLimiters(),
  );
}

/**
 * Mask an email address for safe logging: "alice@example.com" → "a***@example.com".
 * Returns "***" for malformed inputs (no "@" or empty local part).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return email[0] + "***" + email.slice(at);
}
