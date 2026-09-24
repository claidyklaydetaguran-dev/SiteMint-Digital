import { SlidingWindowLimiter, getClientIp } from "../contactProtection.js";

/**
 * Endpoint-scoped abuse protection for the public scheduling page
 * (GET/POST /api/public/schedule/*). A separate limiter instance from
 * `contactIpLimiter` and `discoveryV1IpLimiter` — never changes either of
 * those. Looser than Contact's 5/hour since a legitimate visitor may
 * reasonably browse several days/slots before submitting.
 */
export const PUBLIC_SCHEDULING_IP_LIMIT = 20;
export const PUBLIC_SCHEDULING_IP_WINDOW = 60 * 60 * 1000; // 1 hour
const PURGE_INTERVAL = 5 * 60 * 1000; // 5 min

export const publicSchedulingIpLimiter = new SlidingWindowLimiter(PUBLIC_SCHEDULING_IP_LIMIT, PUBLIC_SCHEDULING_IP_WINDOW);

setInterval(() => {
  publicSchedulingIpLimiter.purgeStale();
}, PURGE_INTERVAL).unref();

export { getClientIp };

/** Honeypot field name — never a real, labeled input on the public form. */
export const HONEYPOT_FIELD = "company_fax";

export function isHoneypotTripped(honeypot: unknown): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

/**
 * Minimum plausible time (ms) between the page rendering the contact step
 * and the request arriving at the server. A real visitor selects a date,
 * a slot, and fills in contact fields — a bot submitting immediately after
 * page load takes far less time than this floor.
 */
export const MIN_COMPLETION_TIME_MS = 2000;

export function isImplausiblyFast(formStartedAtIso: unknown, now: () => number = Date.now): boolean {
  if (typeof formStartedAtIso !== "string") return true;
  const started = Date.parse(formStartedAtIso);
  if (Number.isNaN(started)) return true;
  return now() - started < MIN_COMPLETION_TIME_MS;
}
