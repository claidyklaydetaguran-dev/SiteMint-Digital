import { NullFreeBusyProvider } from "./NullFreeBusyProvider.js";
import { GoogleFreeBusyProvider } from "./GoogleFreeBusyProvider.js";
import { ConnectorGoogleFreeBusyProvider } from "./ConnectorGoogleFreeBusyProvider.js";
import { PerFirmGoogleFreeBusyProvider } from "./PerFirmGoogleFreeBusyProvider.js";
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

    let workspaceLevel: FreeBusyProvider;
    if (hasAccessToken || legacyFlag) {
      workspaceLevel = new GoogleFreeBusyProvider();
    } else if (hasCalendarId) {
      workspaceLevel = new ConnectorGoogleFreeBusyProvider();
    } else {
      workspaceLevel = new NullFreeBusyProvider();
    }
    // P4: per-firm stored connections take precedence for any firm that has
    // one; every other firm falls through to the workspace-level selection
    // above. The wrapper is inert (always falls through) until a connection
    // row exists, so this changes nothing for current environments.
    cached = new PerFirmGoogleFreeBusyProvider(workspaceLevel);
  }
  return cached;
}

/** Test-only: resets the cached provider selection. */
export function _resetFreeBusyProviderForTests(): void {
  cached = undefined;
}
