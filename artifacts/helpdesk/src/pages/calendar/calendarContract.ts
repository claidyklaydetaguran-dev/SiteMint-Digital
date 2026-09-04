/**
 * V5 PR-7 — every string and every rule the Calendar screen displays.
 *
 * `GET /api/receptionist/availability/calendar-status` reports only
 * `{ connected, provider }`; the calendar router
 * (`artifacts/api-server/src/routes/receptionistCalendar.ts`) offers exactly
 * `POST .../google/start`, `GET .../google/callback` (a server redirect, never
 * called from the browser directly), and `DELETE .../connection`. So this
 * screen has five reachable states — not-connected, connecting, connected,
 * error and disabled — and nothing this module produces claims more than that
 * boundary supports: no calendar id, no account email, no event count.
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
    lastCheckedLabel(undefined),
    lastCheckedLabel(Date.now()),
  ];
}
