/**
 * V5 PR-7 — every string and every rule the Calendar screen displays.
 *
 * The screen has five interaction states — not-connected, connecting,
 * connected, error and disabled — driven by `POST .../google/start`,
 * `GET .../google/callback` (a server redirect, never called from the browser
 * directly) and `DELETE .../connection`.
 *
 * It additionally reports CONNECTION HEALTH from
 * `GET /api/receptionist/calendar/health`. That endpoint exists because
 * `.../availability/calendar-status` answers a single boolean derived from a
 * row existing, and that boolean is wrong in the case that matters most: when
 * an owner withdraws SiteMint's access at Google, the row stays active until
 * something tries to use it, so the screen showed a healthy connection while
 * every approval silently failed. Everything displayed here comes from what the
 * connection row actually records — no event count, and no claim about a
 * calendar this workspace has not read.
 */

import type { CalendarActionError } from "@/lib/calendarApi";

export const PAGE = {
  eyebrow: "SCHEDULING",
  title: "Calendar",
  breadcrumb: "Scheduling / Calendar",
  detail: "Connect Google Calendar so SiteMint can check busy times and write appointments your team approves.",
  loading: "Checking your session…",
} as const;

export const CONNECT = {
  notConnectedTitle: "Calendar isn't connected",
  notConnectedDetail:
    "Appointment times are based on the availability settings under Availability. Connect Google Calendar to also check busy times on a real calendar and write approved appointments to it.",
  scopesHeading: "What connecting allows",
  scopeCheckBusy: "Read busy and free time on the calendar you choose, to avoid double-booking.",
  scopeWriteEvents: "Create, update, and remove events for appointments approved in this dashboard.",
  scopeLimit: "SiteMint never reads event details beyond what it writes, and never touches any other calendar.",
  connectLabel: "Connect Google Calendar",
  connectingLabel: "Opening Google…",
  connectFailedTitle: "Calendar connection couldn't start",
  connectFailedDetail: "Nothing changed. Try connecting again.",

  disabledTitle: "Calendar connection is not enabled on this workspace yet",
  disabledDetail: "Ask SiteMint to enable calendar connection for this workspace, then try again.",

  connectedTitle: "Google Calendar is connected",
  providerLabel: "Provider",
  providerGoogle: "Google Calendar",
  lastCheckedLabel: "Last successful check",
  lastCheckedUnknown: "Not checked yet this visit",
  connectedExplain:
    "SiteMint checks this calendar's busy times when computing availability, and writes an event only for an appointment approved under Appointments.",
  disconnectLabel: "Disconnect calendar",
  disconnectingLabel: "Disconnecting…",
  disconnectConfirmTitle: "Disconnect Google Calendar?",
  disconnectConfirmDetail:
    "SiteMint stops checking this calendar's busy times and stops writing new appointment events to it. Appointments already booked stay on the calendar unless you cancel them individually.",
  disconnectConfirmAction: "Disconnect",
  disconnectConfirmDismiss: "Keep connected",
  disconnectedAnnouncement: "Calendar disconnected.",
  disconnectFailedTitle: "Calendar wasn't disconnected",
  disconnectFailedDetail: "Nothing changed. Try again.",

  errorTitle: "Calendar status couldn't be checked",
  errorDetail: "SiteMint couldn't read the calendar connection state. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",
} as const;

/* ── Connection health ─────────────────────────────────────────────────── */
//
// "Connected" was derived from a row existing, which is exactly wrong in the
// case that matters: the owner removes SiteMint's access at Google, every call
// starts failing, and the row stays active until something tries to use it. The
// screen showed a healthy connection while every approval silently failed.
//
// `GET /receptionist/calendar/health` answers what the row actually records,
// and these five states are the honest readings of it.

export type CalendarHealthState = "not_connected" | "revoked" | "failing" | "untested" | "healthy";

export interface CalendarHealth {
  state: CalendarHealthState;
  usable: boolean;
  provider: string | null;
  accountLabel: string | null;
  calendarId: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  connectedAt: string | null;
}

export const HEALTH: Record<CalendarHealthState, { title: string; detail: string; tone: "ok" | "warn" | "error" | "neutral" }> = {
  not_connected: {
    title: "No calendar connected",
    detail: "SiteMint can still take and hold requests, but nothing can be written to a calendar until one is connected.",
    tone: "neutral",
  },
  revoked: {
    // The whole reason this exists. Say what happened, and that nothing is
    // working — not "disconnected", which sounds like something the business
    // chose.
    title: "Access to this calendar was withdrawn",
    detail:
      "Google is no longer letting SiteMint use this calendar, so busy times are not being checked and approvals cannot write events. Reconnect to restore it. Events already written stay where they are.",
    tone: "error",
  },
  failing: {
    title: "The last check on this calendar failed",
    detail:
      "The connection is still in place, so this may be temporary. If it keeps failing, disconnect and reconnect the calendar.",
    tone: "warn",
  },
  untested: {
    title: "Connected, not yet used",
    detail: "Nothing has needed to read this calendar yet. The first availability check will confirm it works.",
    tone: "neutral",
  },
  healthy: {
    title: "Connected and working",
    detail: "Busy times are being read from this calendar, and approved appointments are written to it.",
    tone: "ok",
  },
};

export const HEALTH_FIELDS = {
  accountLabel: "Account",
  calendarLabel: "Calendar",
  connectedAtLabel: "Connected",
  lastSuccessLabel: "Last successful check",
  /**
   * Shown when the server has recorded no successful use at all.
   *
   * The alternative — falling back to when this browser last re-read the
   * status — puts a fresh timestamp under the words "Last successful check"
   * for a calendar nothing has ever touched. That is the page telling the
   * customer their calendar is working on the strength of the page having
   * loaded.
   */
  lastSuccessNever: "Not used yet",
  lastErrorLabel: "Last failure",
  none: "Not recorded",
  defaultCalendar: "Primary calendar",
  writeDisabledTitle: "Writing to calendars is switched off for this workspace",
  writeDisabledDetail: "Busy times are still read. Approving an appointment will not create an event until it is switched on.",
} as const;

/** A connection can be present and still be unable to do the thing it exists for. */
export function healthSummary(health: CalendarHealth | undefined): { title: string; detail: string; tone: "ok" | "warn" | "error" | "neutral" } {
  return HEALTH[health?.state ?? "not_connected"];
}

/**
 * Shown when the health check itself could not be read.
 *
 * `healthSummary(undefined)` answers "No calendar connected", which is the
 * right reading for a business that never connected one and the wrong reading
 * for a request that failed. Telling somebody their calendar is disconnected
 * when we simply could not ask is how a working connection gets torn down and
 * rebuilt for no reason.
 */
export const HEALTH_UNREADABLE = {
  title: "We couldn't check this connection",
  detail:
    "This doesn't mean it stopped working — we couldn't reach the server just now. Nothing has changed. Try again in a moment.",
  tone: "neutral",
} as const;

/** Never invent a calendar name: "primary" is a provider default, not a label the business chose. */
export function calendarDisplayName(calendarId: string | null): string {
  if (calendarId === null || calendarId.trim() === "") return HEALTH_FIELDS.none;
  return calendarId === "primary" ? HEALTH_FIELDS.defaultCalendar : calendarId;
}

export function healthTimestamp(iso: string | null): string {
  if (iso === null) return HEALTH_FIELDS.none;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return HEALTH_FIELDS.none;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const RETURN_BANNER = {
  connectedTitle: "Google Calendar connected",
  connectedDetail: "SiteMint can now check busy times and write approved appointments to this calendar.",
  errorTitle: "Google Calendar wasn't connected",
  errorDetail: "The connection attempt didn't complete. Try connecting again from Calendar.",
  dismiss: "Dismiss",
} as const;

/* ── Screen state ──────────────────────────────────────────────────────── */

export type CalendarViewState =
  | "loading"
  | "error"
  | "not-connected"
  | "connecting"
  | "connected"
  | "disabled";

export interface CalendarViewInputs {
  statusLoading: boolean;
  statusError: boolean;
  connected: boolean;
  connecting: boolean;
  connectDisabled: boolean;
}

/**
 * The five reachable states, decided in one place so the component only
 * switches on a single value. `connecting` and `connectDisabled` are
 * mutually exclusive client-side flags the page owns; the server only ever
 * answers with `connected` (a boolean) or a transport failure.
 */
export function calendarViewState(inputs: CalendarViewInputs): CalendarViewState {
  if (inputs.statusLoading) return "loading";
  if (inputs.connecting) return "connecting";
  if (inputs.connectDisabled) return "disabled";
  if (inputs.statusError) return "error";
  return inputs.connected ? "connected" : "not-connected";
}

/* ── OAuth return banner ───────────────────────────────────────────────── */

export type CalendarReturnStatus = "connected" | "error" | null;

/**
 * Reads the `calendar` query param the server's OAuth callback redirect sets
 * (`?calendar=connected` or `?calendar=error`). Anything else — including no
 * param at all — is `null`, so an unrelated query string never triggers a
 * banner.
 */
export function parseCalendarReturn(search: string): CalendarReturnStatus {
  const params = new URLSearchParams(search);
  const value = params.get("calendar");
  return value === "connected" || value === "error" ? value : null;
}

export function calendarReturnCopy(status: "connected" | "error"): { title: string; detail: string } {
  return status === "connected"
    ? { title: RETURN_BANNER.connectedTitle, detail: RETURN_BANNER.connectedDetail }
    : { title: RETURN_BANNER.errorTitle, detail: RETURN_BANNER.errorDetail };
}

/* ── Last-checked time ─────────────────────────────────────────────────── */

/** `dataUpdatedAt` is 0 before React Query has ever completed this query. */
export function lastCheckedLabel(dataUpdatedAt: number | undefined): string {
  if (typeof dataUpdatedAt !== "number" || dataUpdatedAt <= 0) return CONNECT.lastCheckedUnknown;
  return new Date(dataUpdatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ── Connect-error classification ──────────────────────────────────────── */

export type ConnectFailure = "disabled" | "failed";

/** A 503 from `POST .../google/start` is the only way this screen learns the feature is off. */
export function classifyConnectError(err: CalendarActionError | { status?: number }): ConnectFailure {
  return err.status === 503 ? "disabled" : "failed";
}

/* ── Exhaustive string surface ─────────────────────────────────────────── */

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...Object.values(CONNECT),
    ...Object.values(RETURN_BANNER),
    ...Object.values(HEALTH).flatMap((h) => [h.title, h.detail]),
    ...Object.values(HEALTH_FIELDS),
    calendarDisplayName(null),
    calendarDisplayName("primary"),
    healthTimestamp(null),
    lastCheckedLabel(undefined),
    lastCheckedLabel(Date.now()),
  ];
}

/* ── Choosing the calendar ─────────────────────────────────────────────────
   The control exists because "primary" was never a decision the business
   made. The copy has to carry two awkward truths: a read-only calendar is
   visible but unusable, and a business that connected before this scope
   existed has to reconnect to grant one more permission — which is not the
   same as its calendar being broken. */

/**
 * Which listed calendar the stored selection actually names.
 *
 * A connection made before the picker existed stores Google's alias
 * "primary", which is not the id of any listed calendar. Fed straight into the
 * select, it matched no option: the browser displayed the first calendar
 * anyway, the component's state stayed "primary", and re-choosing the calendar
 * already on screen fires no change event — so Save stayed disabled on a
 * control that looked selected. Resolving the alias to the calendar Google
 * flags as primary makes what is shown and what is stored agree.
 */
export function resolveSelectedCalendarId(
  selectedCalendarId: string | null,
  calendars: readonly { id: string; primary?: boolean }[],
): string | null {
  if (selectedCalendarId === null) return null;
  if (selectedCalendarId !== "primary") return selectedCalendarId;
  return calendars.find((c) => c.primary === true)?.id ?? selectedCalendarId;
}

export const CALENDAR_PICKER = {
  heading: "Where appointments are saved",
  detail: "Approved appointments are written to this calendar. Busy times are read from it too.",
  label: "Calendar",
  save: "Save calendar",
  savePending: "Saving…",
  saved: "Calendar saved",
  savedDetail: "New appointments will be written here. Appointments already booked stay where they are.",
  loading: "Reading your calendars…",
  readOnlySuffix: "(view only — can't save appointments here)",
  needsPermissionTitle: "One more permission is needed",
  needsPermissionDetail:
    "SiteMint can book into your calendar but hasn't been allowed to see the list of calendars on this account, so it can't offer you a choice. Reconnect to grant that, and your current connection keeps working if you decide not to.",
  // The button label has to name the ACTION. It previously reused the section
  // heading, so the only control on this panel read "Where appointments are
  // saved" — a description of the panel, on a button that sends the customer
  // to Google.
  needsPermissionAction: "Reconnect Google Calendar",
  unavailableTitle: "Your calendars couldn't be listed",
  unavailableDetail: "This is usually temporary. The calendar already chosen keeps being used.",
  failedTitle: "That calendar wasn't saved",
} as const;
