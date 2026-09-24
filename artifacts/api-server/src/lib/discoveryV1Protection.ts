import { SlidingWindowLimiter, getClientIp } from "./contactProtection.js";

/**
 * Endpoint-scoped abuse protection for POST /api/v1/discovery-submissions.
 * A separate limiter instance from `contactIpLimiter` (contactProtection.ts)
 * and from `authRateLimit.ts`'s internal limiter — this never changes
 * either of those. 10/hour is looser than Contact's 5/hour: this is a
 * multi-step guided form a legitimate visitor may reasonably restart or
 * retry more than once.
 */
export const DISCOVERY_V1_IP_LIMIT = 10;
export const DISCOVERY_V1_IP_WINDOW = 60 * 60 * 1000; // 1 hour
const PURGE_INTERVAL = 5 * 60 * 1000; // 5 min

export const discoveryV1IpLimiter = new SlidingWindowLimiter(DISCOVERY_V1_IP_LIMIT, DISCOVERY_V1_IP_WINDOW);

setInterval(() => {
  discoveryV1IpLimiter.purgeStale();
}, PURGE_INTERVAL).unref();

export { getClientIp };

/**
 * Minimum plausible time (ms) between `meta.formStartedAt` and the request
 * arriving at the server. This is an 8-step guided form — a real human
 * takes far longer than this floor to complete it; a bot that fills and
 * submits it programmatically often does not. A malformed/unparseable
 * timestamp is treated as suspicious (fails the check) rather than ignored.
 */
export const MIN_COMPLETION_TIME_MS = 3000;

export function isHoneypotTripped(honeypot: string | undefined): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

export function isImplausiblyFast(formStartedAtIso: string, now: () => number = Date.now): boolean {
  const started = Date.parse(formStartedAtIso);
  if (Number.isNaN(started)) return true;
  return now() - started < MIN_COMPLETION_TIME_MS;
}
