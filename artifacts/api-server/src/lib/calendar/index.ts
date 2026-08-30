import { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
import { GoogleFreeBusyProvider } from "./GoogleFreeBusyProvider.js";
import { ConnectorGoogleFreeBusyProvider } from "./ConnectorGoogleFreeBusyProvider.js";
import type { FreeBusyProvider } from "./FreeBusyProvider.js";

export type { FreeBusyProvider, BusyRange } from "./FreeBusyProvider.js";
export { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
export { GoogleFreeBusyProvider, GOOGLE_CALENDAR_FREEBUSY_SCOPE } from "./GoogleFreeBusyProvider.js";
export { ConnectorGoogleFreeBusyProvider } from "./ConnectorGoogleFreeBusyProvider.js";

let cached: FreeBusyProvider | undefined;

/**
 * Provider selection (evaluated once, then cached):
 *
 *  1. GOOGLE_CALENDAR_DEV_ACCESS_TOKEN set → GoogleFreeBusyProvider
 *     (direct fetch with a manually-provisioned short-lived token; original
 *     Development path, kept for backward compatibility and offline testing).
 *
 *  2. GOOGLE_CALENDAR_DEV_CALENDAR_ID set but no access token →
 *     ConnectorGoogleFreeBusyProvider (Replit OAuth connector proxy, preferred
 *     when the Google Calendar connector is authorized in this workspace).
 *
 *  3. Anything else → NullFreeBusyProvider (honest "not connected" fallback;
 *     never a silent failure, never fabricated availability).
 *
 * The legacy CALENDAR_PROVIDER=google env var also activates path 1 when set.
 */
export function getFreeBusyProvider(): FreeBusyProvider {
  if (!cached) {
    const hasAccessToken = Boolean(process.env["GOOGLE_CALENDAR_DEV_ACCESS_TOKEN"]);
    const hasCalendarId = Boolean(process.env["GOOGLE_CALENDAR_DEV_CALENDAR_ID"]);
    const legacyFlag = process.env["CALENDAR_PROVIDER"] === "google";

    if (hasAccessToken || legacyFlag) {
      cached = new GoogleFreeBusyProvider();
    } else if (hasCalendarId) {
      cached = new ConnectorGoogleFreeBusyProvider();
    } else {
      cached = new NullFreeBusyProvider();
    }
  }
  return cached;
}

/** Test-only: resets the cached provider selection. */
export function _resetFreeBusyProviderForTests(): void {
  cached = undefined;
}
