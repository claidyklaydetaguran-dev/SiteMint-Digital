/**
 * What a mail failure's recorded reason can prove.
 *
 * `trySendStaffMail` (lib/staffMail.ts) collapses every outcome into one of four
 * classes plus a reason string, and its `failed` class holds two things that
 * must never be confused: a connection that never opened, and a 5xx or
 * rate-limit ANSWER from a provider that had already received the request. Only
 * the first proves no message exists. A caller deciding whether a retry could
 * deliver twice can tell them apart only by the transport code in the reason.
 *
 * The codes live here, in a module with no dependencies, so a route can use
 * them without importing the scheduler (which imports the marketing routes).
 * `crmScheduler.ts` keeps an identical list for the reminder engine.
 */

/** Transport codes that prove the request never reached the provider's server. */
export const NEVER_LEFT_CODES = [
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
  "ERR_INVALID_URL", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
] as const;

/** Does this reason name a transport failure that rules out any side effect? */
export function reasonProvesNeverLeft(reason: string): boolean {
  const upper = reason.toUpperCase();
  return NEVER_LEFT_CODES.some((code) => upper.includes(code));
}
