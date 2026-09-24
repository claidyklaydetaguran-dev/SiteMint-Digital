import type { Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

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
 * `TRUSTED_PROXY_HOPS` when set (0–10); otherwise 2 in production and 0
 * elsewhere, where no proxy exists and the socket address is the client.
 *
 * Why 2 (measured live, 2026-09-24): Replit deployments sit behind a Google
 * Cloud HTTPS load balancer, which appends `<client-ip>,<load-balancer-ip>`
 * to X-Forwarded-For. With one trusted hop every limiter keyed on the
 * balancer's own address, which differs from request to request, so no
 * caller was ever limited (23 consecutive direct posts, no 429) while the
 * few balancer addresses that repeat could lock unrelated visitors out. The
 * client as the balancer observed it is the SECOND entry from the right.
 */
export function trustedProxyHopsForLimiters(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["TRUSTED_PROXY_HOPS"];
  if (raw !== undefined) {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
  }
  return env["NODE_ENV"] === "production" ? 2 : 0;
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
 * Visitor identity forwarded by SiteMint's own marketing proxy (launch
 * follow-up, 2026-09-24, owner-authorised edit). Every public visitor reaches
 * this API through `mkt/marketing-server.mjs`, so the trusted-hop derivation
 * below resolves them all to that proxy's egress address and they share one
 * limiter bucket. The proxy therefore forwards the address ITS edge observed
 * in `x-sitemint-visitor`, signed with HMAC-SHA256 over a secret both
 * deployments hold (`PROXY_VISITOR_SECRET`). A direct caller cannot mint a
 * valid signature, and the proxy strips any incoming copy of these headers,
 * so the value is only ever what the proxy itself observed. Without the
 * secret on this side the header is ignored and behaviour is unchanged.
 */
export function verifiedVisitorIp(req: Request, secret: string | undefined = process.env["PROXY_VISITOR_SECRET"]): string | null {
  if (!secret) return null;
  const visitor = req.headers["x-sitemint-visitor"];
  const sig = req.headers["x-sitemint-visitor-sig"];
  if (typeof visitor !== "string" || typeof sig !== "string" || !visitor || visitor.length > 64) return null;
  const expected = createHmac("sha256", secret).update(visitor).digest("hex");
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) return null;
  return visitor;
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
  const visitor = verifiedVisitorIp(req);
  if (visitor) return `v:${visitor}`;
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
