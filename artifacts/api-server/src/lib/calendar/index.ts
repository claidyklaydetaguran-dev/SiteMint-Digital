import { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
import { GoogleFreeBusyProvider } from "./GoogleFreeBusyProvider.js";
import type { FreeBusyProvider } from "./FreeBusyProvider.js";

export type { FreeBusyProvider, BusyRange } from "./FreeBusyProvider.js";
export { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
export { GoogleFreeBusyProvider, GOOGLE_CALENDAR_FREEBUSY_SCOPE } from "./GoogleFreeBusyProvider.js";

let cached: FreeBusyProvider | undefined;

/**
 * CALENDAR_PROVIDER=google opts into the Google Development free/busy
 * provider; anything else (including unset, the default in every
 * environment until an owner explicitly sets it) uses the honest
 * NullFreeBusyProvider — never a silent failure, never fabricated
 * availability.
 */
export function getFreeBusyProvider(): FreeBusyProvider {
  if (!cached) {
    cached = process.env.CALENDAR_PROVIDER === "google" ? new GoogleFreeBusyProvider() : new NullFreeBusyProvider();
  }
  return cached;
}

/** Test-only: resets the cached provider selection. */
export function _resetFreeBusyProviderForTests(): void {
  cached = undefined;
}
