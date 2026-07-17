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
 * Derive the real client IP from X-Forwarded-For (set by Replit's reverse
 * proxy). Takes the leftmost (client-set) value from the comma-separated list.
 * Falls back to the raw socket address for local dev where no proxy is present.
 *
 * Note: app.ts does NOT set `trust proxy`; IP derivation is scoped to this
 * helper so there are no side effects on req.ip / req.protocol across other
 * routes.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const raw = Array.isArray(xff) ? xff[0]! : xff;
    return raw.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
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
