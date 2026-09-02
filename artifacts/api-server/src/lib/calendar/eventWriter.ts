// P4: the deliberately narrow calendar EVENT writer — a sibling of the
// read-only FreeBusyProvider, never a widening of it. Create, patch times,
// delete by id; nothing else is expressible. Event bodies carry only what a
// calendar needs to block time and let the office recognize the booking —
// never transcripts, notes, or caller contact details beyond a first-name
// display label the firm's own reviewers already see.
//
// Duplicate prevention is structural: every insert sets
// iCalUID = "<requestPublicId>@sitemint.digital", so a crash-and-retry
// insert converges on one event Google-side even before our stored
// calendar_event_id linkage lands.

import type { SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";
import { decryptToken, loadCalendarTokenKey } from "./tokenCrypto.js";
import { loadGoogleOAuthConfig, refreshAccessToken, type OAuthTransport } from "./googleOAuth.js";
import { encryptToken } from "./tokenCrypto.js";

export const GOOGLE_EVENTS_ENDPOINT_BASE = "https://www.googleapis.com/calendar/v3/calendars";

export interface CalendarEventInput {
  requestPublicId: string;
  summary: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
}

export type EventWriteResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: "revoked" | "provider_error" };

export type EventDeleteResult = { ok: true } | { ok: false; reason: "revoked" | "provider_error" };

/** Create-only + delete-by-id + time-patch. No reads, no attendee management, no arbitrary fields. */
export interface CalendarEventWriter {
  insertEvent(connection: SchedulingCalendarConnection, input: CalendarEventInput): Promise<EventWriteResult>;
  patchEventTimes(
    connection: SchedulingCalendarConnection,
    eventId: string,
    startUtc: Date,
    endUtc: Date,
    timezone: string,
  ): Promise<EventWriteResult>;
  deleteEvent(connection: SchedulingCalendarConnection, eventId: string): Promise<EventDeleteResult>;
}

export type EventsTransport = (
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  accessToken: string,
  body?: Record<string, unknown>,
) => Promise<{ status: number; body: unknown }>;

export const defaultEventsTransport: EventsTransport = async (method, url, accessToken, body) => {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  return { status: response.status, body: parsed };
};

/**
 * Every field here must be one Google accepts on events.insert.
 *
 * There is no `source` block: Google validates Event.source whenever it is
 * present and requires a url with an http(s) scheme, so `source={title}` alone
 * made the API reject the whole insert with 400 "Invalid source url: .". The
 * attribution it was meant to carry is not worth putting a customer-facing URL
 * into a firm's calendar, and `summary` already identifies the booking.
 */
export function buildEventBody(input: CalendarEventInput): Record<string, unknown> {
  return {
    summary: input.summary,
    start: { dateTime: input.startUtc.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.endUtc.toISOString(), timeZone: input.timezone },
    iCalUID: `${input.requestPublicId}@sitemint.digital`,
  };
}

export interface GoogleEventWriterDeps {
  transport?: EventsTransport;
  oauthTransport?: OAuthTransport;
  updateAccessToken?: (firmId: number, accessTokenEnc: string, expiresAt: Date) => Promise<void>;
  now?: () => Date;
}

export class GoogleCalendarEventWriter implements CalendarEventWriter {
  private readonly deps: GoogleEventWriterDeps;
  constructor(deps: GoogleEventWriterDeps = {}) {
    this.deps = deps;
  }

  private async accessTokenFor(connection: SchedulingCalendarConnection): Promise<string | undefined> {
    const key = loadCalendarTokenKey();
    const now = this.deps.now?.() ?? new Date();
    if (
      connection.accessTokenEnc &&
      connection.accessTokenExpiresAt &&
      connection.accessTokenExpiresAt.getTime() - now.getTime() > 60_000
    ) {
      return decryptToken(connection.accessTokenEnc, key);
    }
    const refreshToken = decryptToken(connection.refreshTokenEnc, key);
    const result = await refreshAccessToken(loadGoogleOAuthConfig(), refreshToken, this.deps.oauthTransport);
    if (!result.ok) return result.reason === "invalid_grant" ? undefined : Promise.reject(new Error("refresh failed"));
    if (this.deps.updateAccessToken) {
      await this.deps.updateAccessToken(
        connection.firmId,
        encryptToken(result.accessToken, key),
        new Date(now.getTime() + result.expiresInSec * 1000),
      );
    }
    return result.accessToken;
  }

  async insertEvent(connection: SchedulingCalendarConnection, input: CalendarEventInput): Promise<EventWriteResult> {
    const accessToken = await this.accessTokenFor(connection);
    if (accessToken === undefined) return { ok: false, reason: "revoked" };
    const transport = this.deps.transport ?? defaultEventsTransport;
    const url = `${GOOGLE_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(connection.calendarId)}/events`;
    const { status, body } = await transport("POST", url, accessToken, buildEventBody(input));
    if (status === 200 || status === 201) {
      const id = typeof body === "object" && body !== null ? (body as Record<string, unknown>).id : undefined;
      if (typeof id === "string" && id.length > 0) return { ok: true, eventId: id };
    }
    return { ok: false, reason: "provider_error" };
  }

  async patchEventTimes(
    connection: SchedulingCalendarConnection,
    eventId: string,
    startUtc: Date,
    endUtc: Date,
    timezone: string,
  ): Promise<EventWriteResult> {
    const accessToken = await this.accessTokenFor(connection);
    if (accessToken === undefined) return { ok: false, reason: "revoked" };
    const transport = this.deps.transport ?? defaultEventsTransport;
    const url = `${GOOGLE_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`;
    const { status } = await transport("PATCH", url, accessToken, {
      start: { dateTime: startUtc.toISOString(), timeZone: timezone },
      end: { dateTime: endUtc.toISOString(), timeZone: timezone },
    });
    return status === 200 ? { ok: true, eventId } : { ok: false, reason: "provider_error" };
  }

  async deleteEvent(connection: SchedulingCalendarConnection, eventId: string): Promise<EventDeleteResult> {
    const accessToken = await this.accessTokenFor(connection);
    if (accessToken === undefined) return { ok: false, reason: "revoked" };
    const transport = this.deps.transport ?? defaultEventsTransport;
    const url = `${GOOGLE_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`;
    const { status } = await transport("DELETE", url, accessToken);
    // 404/410: the event is already gone — deletion is idempotent by intent.
    if (status === 200 || status === 204 || status === 404 || status === 410) return { ok: true };
    return { ok: false, reason: "provider_error" };
  }
}
