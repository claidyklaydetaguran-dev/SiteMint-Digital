// Checkpoint B: read-only Google Calendar free/busy provider for exactly one
// authorized Development calendar (not a per-firm, multi-tenant OAuth flow —
// see docs/ai-receptionist/SCHEDULING.md for why). Credentials are read from
// environment variables only, at request time, and are never written to any
// database table or log line — the same convention this codebase already
// uses for every other third-party credential (VAPI_API_KEY,
// INTAKE_TWILIO_AUTH_TOKEN, etc). No OAuth consent flow, token refresh, or
// token persistence is implemented here: a valid short-lived access token
// for the Development calendar must already be present in
// GOOGLE_CALENDAR_DEV_ACCESS_TOKEN when a request needs it.
//
// Scope: https://www.googleapis.com/auth/calendar.freebusy — Google's
// narrowest available scope for this endpoint. It grants no event read,
// create, update, or delete capability of any kind, only the FreeBusy query
// used below. This class calls exactly one Google endpoint
// (calendar/v3/freeBusy) and never any event-mutating endpoint.
//
// Only ever returns { startUtc, endUtc } busy ranges — the FreeBusy response
// itself contains no event titles, attendees, descriptions, locations, or
// other private fields (that is the entire point of the API), and this
// class never logs the raw response body.

import type { FreeBusyProvider, BusyRange } from "./FreeBusyProvider.js";

const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
export const GOOGLE_CALENDAR_FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

function readConfig(): { accessToken: string; calendarId: string; firmId: number } | null {
  const accessToken = process.env.GOOGLE_CALENDAR_DEV_ACCESS_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_DEV_CALENDAR_ID;
  const firmIdRaw = process.env.GOOGLE_CALENDAR_DEV_FIRM_ID;
  if (!accessToken || !calendarId || !firmIdRaw) return null;
  const firmId = Number(firmIdRaw);
  if (!Number.isInteger(firmId)) return null;
  return { accessToken, calendarId, firmId };
}

interface FreeBusyApiResponse {
  calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
}

export class GoogleFreeBusyProvider implements FreeBusyProvider {
  async isConnected(firmId: number): Promise<boolean> {
    const config = readConfig();
    return config !== null && config.firmId === firmId;
  }

  async getBusyRanges(firmId: number, rangeStartUtc: Date, rangeEndUtc: Date): Promise<BusyRange[]> {
    const config = readConfig();
    if (!config || config.firmId !== firmId) return [];

    let response: Response;
    try {
      response = await fetch(FREEBUSY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: rangeStartUtc.toISOString(),
          timeMax: rangeEndUtc.toISOString(),
          items: [{ id: config.calendarId }],
        }),
      });
    } catch {
      // Network failure — honest fallback, never throws to the caller.
      return [];
    }

    if (!response.ok) return [];

    let body: FreeBusyApiResponse;
    try {
      body = (await response.json()) as FreeBusyApiResponse;
    } catch {
      return [];
    }

    const busy = body.calendars?.[config.calendarId]?.busy ?? [];
    return busy
      .map((range) => ({ startUtc: new Date(range.start), endUtc: new Date(range.end) }))
      .filter((r) => !Number.isNaN(r.startUtc.getTime()) && !Number.isNaN(r.endUtc.getTime()));
  }
}
