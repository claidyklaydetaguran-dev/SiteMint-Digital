import { getClientIp } from "./authRateLimit.js";

/**
 * Minimal abuse protection for the public Contact form (POST
 * /api/contact/submit), which previously had none — no rate limit, no
 * spam check, unlike the receptionist auth routes. Reuses `getClientIp`,
 * the one relevant helper authRateLimit.ts actually exports.
 *
 * authRateLimit.ts's own `SlidingWindow` class is NOT exported (it's a
 * local, unexported class in that file), and authRateLimit.ts is a
 * protected file (root CLAUDE.md — "never modify without an explicit
 * owner request naming them") — adding `export` to it is out of scope for
 * this phase. Rather than touch that file, this is a small, self-
 * contained sliding-window limiter with the same semantics
 * (isOverLimit-then-record, periodic stale purge), scoped only to
 * Contact. It does not change receptionist signup/login's limiters,
 * thresholds, or behavior in any way.
 *
 * 5 submissions per IP per hour mirrors signupIpLimiter's shape (same
 * order of magnitude for a public, unauthenticated form) while allowing a
 * real visitor a couple of retries after a typo.
 */
export const CONTACT_IP_LIMIT = 5;
export const CONTACT_IP_WINDOW = 60 * 60 * 1000; // 1 hour
const PURGE_INTERVAL = 5 * 60 * 1000; // 5 min

/**
 * Exported (unlike authRateLimit.ts's equivalent local class) specifically
 * so tests can construct their own isolated instance with an injected
 * clock (`now`) instead of sharing the route's real singleton or waiting
 * on real timers — deterministic rate-limit tests without real waits.
 */
export class SlidingWindowLimiter {
  private readonly store = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    now: () => number = Date.now,
  ) {
    this.now = now;
  }

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const timestamps = (this.store.get(key) ?? []).filter((t) => t > cutoff);
    if (timestamps.length > 0) {
      this.store.set(key, timestamps);
    } else {
      this.store.delete(key);
    }
    return timestamps;
  }

  isOverLimit(key: string): boolean {
    return this.prune(key).length >= this.limit;
  }

  record(key: string): void {
    const timestamps = this.prune(key);
    timestamps.push(this.now());
    this.store.set(key, timestamps);
  }

  purgeStale(): void {
    for (const key of this.store.keys()) {
      this.prune(key);
    }
  }
}

export const contactIpLimiter = new SlidingWindowLimiter(CONTACT_IP_LIMIT, CONTACT_IP_WINDOW);

setInterval(() => {
  contactIpLimiter.purgeStale();
}, PURGE_INTERVAL).unref();

export { getClientIp };

/**
 * Honeypot field name — deliberately not the same as any real, labeled
 * form field (the real form has no "website" field), and never rendered
 * as a visible/labeled input by PlatformContactPreview.tsx: kept
 * off-screen, aria-hidden, tabIndex -1, autocomplete off. A legitimate
 * visitor — mouse, keyboard, or screen reader — never populates it; a
 * basic bot that fills every input in a scraped form does. Any non-empty
 * value is treated as spam without telling the caller why.
 */
export const HONEYPOT_FIELD = "hp_field";

export function isHoneypotTripped(data: Record<string, unknown>): boolean {
  const value = data[HONEYPOT_FIELD];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Removes the honeypot key before anything downstream (DB row, email
 * templates) ever sees the payload — a populated honeypot already rejects
 * the request via isHoneypotTripped, but this guarantees an *empty* one
 * (the normal case) is never persisted or forwarded as a real field either.
 */
export function stripHoneypot(data: Record<string, unknown>): Record<string, unknown> {
  const { [HONEYPOT_FIELD]: _dropped, ...rest } = data;
  void _dropped;
  return rest;
}
