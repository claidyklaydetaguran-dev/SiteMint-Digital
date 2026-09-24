// Which calendars a connected account has, so a business can choose where its
// appointments land.
//
// Until now the product wrote to whatever Google calls `primary` and never
// said so. That is not a preference anyone expressed — it is the only calendar
// the granted scopes could name. Neither `calendar.events` nor
// `calendar.freebusy` can enumerate calendars; that needs
// `calendar.calendarlist.readonly`, a third scope, which is why this arrives
// with a re-authorization rather than as a pure UI change.
//
// The listing is deliberately thin: an id, the name the owner gave it, whether
// it is their primary, and whether we could write to it. No event content is
// read, and none is readable with this scope.

import type { SchedulingCalendarConnection } from "@workspace/db/schema/scheduling";

export const GOOGLE_CALENDAR_LIST_ENDPOINT = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

/** Google's accessRole values that permit creating events. */
const WRITABLE_ROLES = new Set(["owner", "writer"]);

export interface CalendarChoice {
  id: string;
  name: string;
  /** The account's own default calendar. */
  primary: boolean;
  /**
   * Whether appointments could be written here. A calendar shared read-only
   * is listed but cannot be selected — choosing it would produce a booking
   * that silently fails at approval time.
   */
  writable: boolean;
  /** Google's own word, kept so an operator can see why something is unwritable. */
  accessRole: string;
}

export type CalendarListResult =
  | { ok: true; calendars: CalendarChoice[] }
  | { ok: false; reason: "revoked" | "needs_permission" | "unavailable"; detail: string };

export type ListTransport = (
  url: string,
  accessToken: string,
) => Promise<{ status: number; body: unknown }>;

export const defaultListTransport: ListTransport = async (url, accessToken) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    // A thrown transport is indistinguishable from a timeout here, and both
    // mean the same thing to the caller: we could not read the list.
    return { status: 0, body: null };
  }
};

export interface CalendarListDeps {
  accessTokenFor: (connection: SchedulingCalendarConnection) => Promise<string | undefined>;
  transport?: ListTransport;
}

/**
 * Reads the account's calendars.
 *
 * A `403` is treated as a MISSING PERMISSION rather than a failure: an account
 * connected before this scope existed has a perfectly good grant for booking
 * and simply cannot list. Telling that business to reconnect is right;
 * telling it the calendar is broken is not.
 */
export async function listCalendars(
  connection: SchedulingCalendarConnection,
  deps: CalendarListDeps,
): Promise<CalendarListResult> {
  const accessToken = await deps.accessTokenFor(connection);
  if (accessToken === undefined) {
    return { ok: false, reason: "revoked", detail: "Access to this calendar was withdrawn." };
  }

  const transport = deps.transport ?? defaultListTransport;
  const { status, body } = await transport(`${GOOGLE_CALENDAR_LIST_ENDPOINT}?minAccessRole=reader&maxResults=250`, accessToken);

  if (status === 401) {
    return { ok: false, reason: "revoked", detail: "Access to this calendar was withdrawn." };
  }
  if (status === 403) {
    return {
      ok: false,
      reason: "needs_permission",
      detail: "SiteMint has not been given permission to see your list of calendars.",
    };
  }
  if (status !== 200) {
    return { ok: false, reason: "unavailable", detail: "Your calendar list could not be read just now." };
  }

  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return { ok: false, reason: "unavailable", detail: "Your calendar list could not be read just now." };
  }

  const calendars: CalendarChoice[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id === "") continue;
    const accessRole = typeof row.accessRole === "string" ? row.accessRole : "";
    calendars.push({
      id,
      // `summaryOverride` is the name this account gave a shared calendar; it
      // is what the owner recognises, so it wins over the calendar's own name.
      name:
        (typeof row.summaryOverride === "string" && row.summaryOverride.trim() !== "" ? row.summaryOverride : undefined) ??
        (typeof row.summary === "string" && row.summary.trim() !== "" ? row.summary : undefined) ??
        id,
      primary: row.primary === true,
      writable: WRITABLE_ROLES.has(accessRole),
      accessRole,
    });
  }

  // The primary first, then by name: the order a person would expect.
  calendars.sort((a, b) => (a.primary === b.primary ? a.name.localeCompare(b.name) : a.primary ? -1 : 1));
  return { ok: true, calendars };
}

export type SelectionRefusal = "unknown_calendar" | "not_writable" | "unreadable";

export const SELECTION_REFUSALS: Record<SelectionRefusal, string> = {
  unknown_calendar: "That calendar isn't one of the calendars on this account.",
  not_writable:
    "SiteMint can only write appointments to a calendar you own or can edit. Pick one you have edit access to.",
  unreadable: "Your calendar list could not be read, so the selection was not changed.",
};

/**
 * Validates a chosen calendar against what the account actually has.
 *
 * Checked against the live list rather than trusted from the request: a
 * selection is the address every future appointment is written to, and an id
 * that is merely well-formed is not the same as one this account can use.
 */
export function validateSelection(
  calendarId: unknown,
  listing: CalendarListResult,
): { ok: true; calendarId: string } | { ok: false; reason: SelectionRefusal; detail: string } {
  const id = typeof calendarId === "string" ? calendarId.trim() : "";
  if (!listing.ok) return { ok: false, reason: "unreadable", detail: SELECTION_REFUSALS.unreadable };
  const match = listing.calendars.find((c) => c.id === id);
  if (!match) return { ok: false, reason: "unknown_calendar", detail: SELECTION_REFUSALS.unknown_calendar };
  if (!match.writable) return { ok: false, reason: "not_writable", detail: SELECTION_REFUSALS.not_writable };
  return { ok: true, calendarId: match.id };
}
