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

/**
 * `uncertain` is its own outcome, and the distinction matters more than any
 * other here.
 *
 * A 400 means the write definitely did not happen. A timeout, a dropped
 * connection or a 5xx means we do not know: the event may well exist in the
 * business's calendar with our response lost on the way back. Collapsing that
 * into "failed" invites a retry, and a blind retry is how one appointment
 * becomes two events in a customer's calendar.
 */
export type EventWriteResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: "revoked" | "provider_error" | "uncertain" };

export type EventDeleteResult = { ok: true } | { ok: false; reason: "revoked" | "provider_error" | "uncertain" };

/** What the provider says about an event we may or may not have created. */
export type EventLookupResult =
  | { ok: true; eventId: string | null }
  | { ok: false; reason: "revoked" | "provider_error" | "uncertain" };

/** Create + delete-by-id + time-patch, plus the one read that resolves an ambiguous write. */
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
  /**
   * Does an event for this request already exist?
   *
   * The only read in this interface, and it exists for exactly one purpose:
   * after an uncertain write, ASK rather than guess. Keyed on the iCalUID the
   * writer stamps, which is derived from the request's public id — so the
   * question "did my write land?" has an authoritative answer.
   */
  findEventByRequest(connection: SchedulingCalendarConnection, requestPublicId: string): Promise<EventLookupResult>;
}

export type EventsTransport = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  accessToken: string,
  body?: Record<string, unknown>,
) => Promise<{ status: number; body: unknown }>;

/**
 * A timeout, so an unanswered request cannot hold an approval open forever.
 * Long enough that a slow-but-working provider is not cut off needlessly.
 */
export const EVENTS_TIMEOUT_MS = 15_000;

export const defaultEventsTransport: EventsTransport = async (method, url, accessToken, body) => {
  // A thrown fetch — DNS failure, connection reset, timeout — is reported as
  // status 0 rather than propagating. The caller has to be able to tell
  // "definitely refused" from "unknown", and an exception erases that
  // distinction by unwinding past the code that knows how to ask.
  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    return { status: response.status, body: parsed };
  } catch {
    return { status: 0, body: undefined };
  }
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
export function iCalUidForRequest(requestPublicId: string): string {
  return `${requestPublicId}@sitemint.digital`;
}

export function buildEventBody(input: CalendarEventInput): Record<string, unknown> {
  return {
    summary: input.summary,
    start: { dateTime: input.startUtc.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.endUtc.toISOString(), timeZone: input.timezone },
    iCalUID: iCalUidForRequest(input.requestPublicId),
  };
}

/**
 * Which HTTP statuses mean "we do not know whether it happened".
 *
 * 408/429/5xx and a 0 (the transport threw) are all unresolved: the request may
 * have been applied before the response was lost. Everything else the provider
 * answered with is a definite refusal.
 */
export function isUncertainStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
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
      // Accepted, but we cannot name what was created — treat as unknown, not
      // as failure: an event may well exist.
      return { ok: false, reason: "uncertain" };
    }
    // 409 means Google already holds an event with this iCalUID — our own
    // earlier write landed. Unknown here, and the lookup resolves it.
    if (status === 409) return { ok: false, reason: "uncertain" };
    return { ok: false, reason: isUncertainStatus(status) ? "uncertain" : "provider_error" };
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
    if (status === 200) return { ok: true, eventId };
    return { ok: false, reason: isUncertainStatus(status) ? "uncertain" : "provider_error" };
  }

  /**
   * Asks Google whether an event for this request exists, by the iCalUID the
   * writer stamps on every insert.
   *
   * `{ ok: true, eventId: null }` is a real answer — the provider replied and
   * there is no such event — and is what makes it safe to conclude that an
   * uncertain write did not land. Anything unresolved comes back `uncertain`,
   * never as "no event", because the two lead to opposite decisions.
   */
  async findEventByRequest(
    connection: SchedulingCalendarConnection,
    requestPublicId: string,
  ): Promise<EventLookupResult> {
    const accessToken = await this.accessTokenFor(connection);
    if (accessToken === undefined) return { ok: false, reason: "revoked" };
    const transport = this.deps.transport ?? defaultEventsTransport;
    const url =
      `${GOOGLE_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(connection.calendarId)}/events` +
      `?iCalUID=${encodeURIComponent(iCalUidForRequest(requestPublicId))}&showDeleted=false&maxResults=1`;
    const { status, body } = await transport("GET", url, accessToken);
    if (status !== 200) {
      return { ok: false, reason: isUncertainStatus(status) ? "uncertain" : "provider_error" };
    }
    const items = typeof body === "object" && body !== null ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) return { ok: false, reason: "uncertain" };
    const first = items[0];
    const id = typeof first === "object" && first !== null ? (first as { id?: unknown }).id : undefined;
    // Cancelled events still come back on some queries; only a live one counts
    // as "the write landed".
    const statusField = typeof first === "object" && first !== null ? (first as { status?: unknown }).status : undefined;
    if (typeof id === "string" && id.length > 0 && statusField !== "cancelled") return { ok: true, eventId: id };
    return { ok: true, eventId: null };
  }

  async deleteEvent(connection: SchedulingCalendarConnection, eventId: string): Promise<EventDeleteResult> {
    const accessToken = await this.accessTokenFor(connection);
    if (accessToken === undefined) return { ok: false, reason: "revoked" };
    const transport = this.deps.transport ?? defaultEventsTransport;
    const url = `${GOOGLE_EVENTS_ENDPOINT_BASE}/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`;
    const { status } = await transport("DELETE", url, accessToken);
    // 404/410: the event is already gone — deletion is idempotent by intent.
    if (status === 200 || status === 204 || status === 404 || status === 410) return { ok: true };
    return { ok: false, reason: isUncertainStatus(status) ? "uncertain" : "provider_error" };
  }
}
