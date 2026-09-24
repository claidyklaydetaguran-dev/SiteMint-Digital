// Checkpoint B (Replit connector path): read-only Google Calendar free/busy
// using the Replit connector SDK proxy rather than a manually-provisioned
// access token. The connector handles OAuth2, token refresh, and identity
// entirely through Replit's connector infra — this class never touches,
// stores, or logs an OAuth token of any kind.
//
// Scope: the Google Calendar connector is authorized with the narrowest scope
// that supports FreeBusy (https://www.googleapis.com/auth/calendar.freebusy).
// This class calls exactly one Google endpoint (calendar/v3/freeBusy via the
// Replit connector proxy) and no event-mutating endpoint. The proxy response
// contains only { start, end } busy ranges — no event titles, attendees,
// descriptions, locations, or other private fields.
//
// Two env vars scope the query:
//   GOOGLE_CALENDAR_DEV_CALENDAR_ID  — which calendar to probe (server-side only)
//   GOOGLE_CALENDAR_DEV_FIRM_ID      — which SiteMint firm owns that calendar
//
// Neither value ever leaves the server; the public API and client receive only
// the derived slot availability (open / unavailable) with no calendar metadata.

import { ReplitConnectors } from "@replit/connectors-sdk";
import type { FreeBusyProvider, BusyRange } from "./FreeBusyProvider.js";

function readConfig(): { calendarId: string; firmId: number } | null {
  const calendarId = process.env["GOOGLE_CALENDAR_DEV_CALENDAR_ID"];
  const firmIdRaw = process.env["GOOGLE_CALENDAR_DEV_FIRM_ID"];
  if (!calendarId || !firmIdRaw) return null;
  const firmId = Number(firmIdRaw);
  if (!Number.isInteger(firmId) || firmId <= 0) return null;
  return { calendarId, firmId };
}

interface FreeBusyApiResponse {
  calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
}

export const CONNECTOR_NAME = "google-calendar";
export const FREEBUSY_PATH = "/calendar/v3/freeBusy";

export class ConnectorGoogleFreeBusyProvider implements FreeBusyProvider {
  /**
   * Connected when GOOGLE_CALENDAR_DEV_CALENDAR_ID and
   * GOOGLE_CALENDAR_DEV_FIRM_ID are both set and the firmId matches.
   * A full connectivity probe (HTTP round-trip) is too expensive to run on
   * every calendar-status check — getBusyRanges returns [] on any failure.
   */
  async isConnected(firmId: number): Promise<boolean> {
    const config = readConfig();
    return config !== null && config.firmId === firmId;
  }

  async getBusyRanges(firmId: number, rangeStartUtc: Date, rangeEndUtc: Date): Promise<BusyRange[]> {
    const config = readConfig();
    if (!config || config.firmId !== firmId) return [];

    let response: Response;
    try {
      const connectors = new ReplitConnectors();
      response = await connectors.proxy(CONNECTOR_NAME, FREEBUSY_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: rangeStartUtc.toISOString(),
          timeMax: rangeEndUtc.toISOString(),
          items: [{ id: config.calendarId }],
        }),
      });
    } catch {
      // Connector not authorized or Replit infra unavailable — honest fallback.
      return [];
    }

    if (!response.ok) return [];

    let body: FreeBusyApiResponse;
    try {
      body = (await response.json()) as FreeBusyApiResponse;
    } catch {
      return [];
    }

    // Only ever read { start, end } — no event titles, attendees, or other
    // private fields exist in a FreeBusy response (that is the entire point
    // of the API), and this class never logs the raw response body.
    const busy = body.calendars?.[config.calendarId]?.busy ?? [];
    return busy
      .map((range) => ({ startUtc: new Date(range.start), endUtc: new Date(range.end) }))
      .filter((r) => !Number.isNaN(r.startUtc.getTime()) && !Number.isNaN(r.endUtc.getTime()));
  }
}
