/**
 * Frontend V2 Phase 13 — every string and every rule the Appointments
 * workspace displays, in one module with no React and no network access.
 *
 * The route is an **appointment-request capture** workspace. It is not a
 * booking system. The backend it talks to
 * (`artifacts/api-server/src/routes/receptionistAvailability.ts`) can store a
 * request, hold a slot, list requests and cancel one; it has no endpoint that
 * confirms, approves, reschedules, writes a calendar event, sends a message or
 * notifies anyone. So this module owns the wording that keeps the interface
 * inside that boundary, and the contract tests beside it assert that no
 * stronger claim can be produced by any reachable state.
 *
 * Why a separate module at all: the phrases that matter most here are the ones
 * that must *never* appear, and a phrase inlined in JSX can only be checked by
 * reading the component. Centralising them means a single enumerable surface —
 * `everyRenderableString()` at the foot of this file — that a test can walk
 * exhaustively rather than sampling.
 */

import type {
  AppointmentRequestState,
  AvailabilityConfig,
  DayReason,
} from "@/lib/availabilityApi";

/* ── Page ──────────────────────────────────────────────────────────────── */

export const PAGE = {
  eyebrow: "SCHEDULING",
  title: "Appointments",
  detail: "Review appointment requests and manage when clients can request time.",
  loading: "Checking your session…",
} as const;

/* ── Views ─────────────────────────────────────────────────────────────── */

export type ViewId = "preview" | "requests" | "availability";

export interface View {
  id: ViewId;
  label: string;
}

/**
 * Three local views, no route change. Order is the operator's reading order:
 * what a client sees, what they sent, and the rules that govern both.
 */
export function views(): View[] {
  return [
    { id: "preview", label: "Booking preview" },
    { id: "requests", label: "Requests" },
    { id: "availability", label: "Availability" },
  ];
}

/** Roving arrow-key movement, wrapping at both ends — the Phase 12 behaviour. */
export function nextView(current: ViewId, delta: number): ViewId {
  const all = views();
  const at = all.findIndex((v) => v.id === current);
  const next = (at + delta + all.length) % all.length;
  return all[next]!.id;
}

/* ── Day reasons ───────────────────────────────────────────────────────────
   Every one of these is a value the server computed and sent
   (`availabilityEngine.ts`). The browser never decides why a day is closed and
   never recomputes availability — it labels what it was told. */

const DAY_REASON_LABEL: Record<DayReason, string> = {
  open: "Open",
  blocked: "Blocked date",
  outside_hours: "Outside weekly hours",
  fully_booked: "No times left",
  past_booking_window: "Inside minimum notice",
  beyond_advance_window: "Beyond booking window",
};

export function dayReasonLabel(reason: DayReason | undefined): string {
  if (reason === undefined) return "Not available";
  return DAY_REASON_LABEL[reason] ?? "Not available";
}

export function isSelectableDay(reason: DayReason | undefined): boolean {
  return reason === "open";
}

/**
 * The calendar legend. Only the three marks the grid actually draws — a legend
 * that explains states the operator cannot see is decoration.
 */
export function dayLegend(): { tone: "open" | "full" | "closed"; label: string }[] {
  return [
    { tone: "open", label: "Open" },
    { tone: "full", label: "No times left" },
    { tone: "closed", label: "Closed" },
  ];
}

/* ── Request states ────────────────────────────────────────────────────────
   `AppointmentRequestState` models eight values, but only four are reachable
   through any code path that exists today (see the note in
   `lib/availabilityApi.ts`). The four are named explicitly. The rest are
   humanised from whatever the server sent rather than being given prepared
   labels, so this interface never ships a ready-made word for an outcome the
   product cannot produce — and never dresses one as a success. */

const REACHABLE_STATE_LABEL: Partial<Record<AppointmentRequestState, string>> = {
  pending_review: "Pending review",
  held: "Held",
  cancelled: "Cancelled",
  expired: "Expired",
};

export function requestStateLabel(state: string): string {
  const known = REACHABLE_STATE_LABEL[state as AppointmentRequestState];
  if (known !== undefined) return known;
  if (typeof state !== "string" || state.trim() === "") return "Unknown";
  const words = state.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type StateTone = "attention" | "neutral" | "muted";

/**
 * No tone is celebratory. Nothing this workspace can produce is an
 * achievement — a stored request is work waiting for a person.
 */
export function requestStateTone(state: string): StateTone {
  if (state === "pending_review") return "attention";
  if (state === "held") return "neutral";
  return "muted";
}

/** Only a request still awaiting review can be cancelled from here. */
export function canCancel(state: string): boolean {
  return state === "pending_review" || state === "held";
}

const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  ai_receptionist: "AI receptionist",
  manual: "Added manually",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? "Unknown source";
}

/* ── Booking preview ───────────────────────────────────────────────────── */

export const PREVIEW = {
  heading: "Booking preview",
  /* The old page called this a preview in which "nothing submitted is a real
     appointment". That was wrong: this form posts to the same endpoint the
     public page posts to, and it stores a real request against this account.
     Saying so is the whole point of the disclosure below. */
  detail:
    "The request form a client sees. Anything submitted here is stored on this account, exactly as if a client had sent it.",
  noTypesTitle: "No appointment types yet",
  noTypesDetail:
    "Clients can't request a time until at least one appointment type exists. Add one under Availability.",
  loading: "Loading availability…",
  readFailed: "Availability couldn't be loaded. Try again shortly.",
  slotsLoading: "Loading times…",
  slotsFailed: "Times couldn't be loaded for this day.",
  slotsEmpty: "No times left on this day.",
  pickDay: "Select an open day",
  pickDayDetail: "Choose a day marked open to see the times a client could request.",
  typeLabel: "Appointment type",
  holdLabel: "Hold this time",
  holdPendingLabel: "Holding…",
  holdConflictTitle: "That time was taken",
  holdConflictDetail:
    "Someone else took this time while it was open. Choose another time to continue.",
  holdFailedTitle: "The time couldn't be held",
  holdFailedDetail: "Nothing was stored. Try holding the time again.",
  contactHeading: "Client details",
  nameLabel: "Client name",
  phoneLabel: "Phone (optional)",
  emailLabel: "Email (optional)",
  nameRequired: "Enter the client's name to continue.",
  back: "Back to calendar",
  submitLabel: "Submit request",
  submitPendingLabel: "Submitting…",
  /* Required disclosure, shown before the operator can submit. */
  disclosure:
    "Submitting creates an appointment request. It does not confirm an appointment or add it to a calendar.",
  submitFailedTitle: "The request wasn't submitted",
  submitFailedDetail: "Nothing was stored. Try submitting again.",
  conflictTitle: "That time was taken",
  conflictDetail: "The time is no longer available. Choose another time to continue.",
  resultTitle: "Request submitted",
  resultState: "Pending review",
  resultDetail:
    "The request is stored on this account with the time the client chose. Nothing is confirmed and nothing is on a calendar.",
  resultAgain: "Submit another request",
  continueLabel: "Continue to request",
  chooseNote:
    "Continuing performs no action on its own. Holding stores a temporary hold and takes the time out of the list.",
  heldState: "Held",
  heldTitle: "Time held",
  heldDetail:
    "The hold is listed under Requests. It stops holding the time once it expires.",
  heldUntilPrefix: "Holds the time until",
} as const;

/* ── Requests ──────────────────────────────────────────────────────────── */

export const REQUESTS = {
  heading: "Requests",
  detail: "Appointment requests stored on this account.",
  loading: "Loading requests…",
  failed: "Requests couldn't be loaded. Try again shortly.",
  emptyTitle: "No requests yet",
  emptyDetail:
    "Requests submitted from the booking preview or the public scheduling page appear here.",
  columnClient: "Client",
  columnType: "Type",
  columnWhen: "Requested time",
  columnStatus: "Status",
  columnSource: "Source",
  noName: "No name given",
  noContact: "No contact details given",
  unknownType: "Unspecified type",
  cancelLabel: "Cancel request",
  cancelConfirmTitle: "Cancel this request?",
  cancelConfirmDetail:
    "The request is marked cancelled on this account. Nobody is told, and nothing else changes.",
  cancelConfirmAction: "Cancel request",
  cancelConfirmDismiss: "Keep request",
  cancelPendingLabel: "Cancelling…",
  cancelledAnnouncement: "Request cancelled.",
  cancelMissingTitle: "That request is gone",
  cancelMissingDetail: "It was already cancelled or removed. Nothing changed.",
  cancelFailedTitle: "The request wasn't cancelled",
  cancelFailedDetail: "Nothing changed. Try cancelling again.",
} as const;

/* ── Availability ──────────────────────────────────────────────────────── */

export const AVAILABILITY = {
  heading: "Availability",
  detail: "The rules the server uses to decide which times a client can request.",
  loading: "Loading availability settings…",
  failed: "Availability settings couldn't be loaded. Try again shortly.",
  timezoneHeading: "Time zone",
  timezoneLabel: "IANA time zone",
  timezoneHelp: "Every time on this page is shown in this zone.",
  hoursHeading: "Weekly hours",
  hoursHelp: "Days without hours are closed.",
  startLabel: "Start",
  endLabel: "End",
  setHours: "Set hours",
  markClosed: "Mark closed",
  closed: "Closed",
  typesHeading: "Appointment types",
  typesHelp: "At least one type is required. Duration is in minutes, from 5 to 480.",
  typeNameLabel: "Name",
  typeDurationLabel: "Minutes",
  addType: "Add appointment type",
  removeType: "Remove",
  limitsHeading: "Booking limits",
  bufferBeforeLabel: "Buffer before (minutes)",
  bufferAfterLabel: "Buffer after (minutes)",
  minNoticeLabel: "Minimum notice (hours)",
  maxAdvanceLabel: "Booking window (days ahead)",
  dailyLimitLabel: "Daily limit (optional)",
  dailyLimitHelp: "Leave empty for no daily limit.",
  blockedHeading: "Blocked dates",
  blockedHelp: "Holidays and time off. Clients can't request a time on these days.",
  blockedNone: "No blocked dates.",
  blockedAdd: "Add a blocked date",
  blockedRemove: "Remove",
  saveLabel: "Save availability",
  savePendingLabel: "Saving…",
  saveSuccessTitle: "Availability saved",
  saveSuccessDetail: "The server accepted these rules and is using them now.",
  saveInvalidTitle: "Availability wasn't saved",
  saveFailedTitle: "Availability wasn't saved",
  saveFailedDetail: "Nothing changed. Try saving again.",
} as const;

/* ── Calendar connection ───────────────────────────────────────────────────
   The endpoint returns exactly `{ connected, provider }` and nothing else — no
   calendar id, no account email, no token. Connected means one thing only: the
   server may consult that calendar's busy times while computing availability.
   It has never meant, and must never be worded as, writing an event. */

export const CALENDAR = {
  heading: "Calendar availability",
  checking: "Checking calendar availability…",
  disconnectedHeading: "Calendar availability isn’t connected",
  disconnectedDetail: "Appointment times are based on the availability settings shown here.",
  connectedHeading: "Calendar availability is connected",
  connectedDetail:
    "Busy times from the connected calendar are checked alongside the availability settings shown here. Nothing is written to that calendar.",
  failedHeading: "Calendar availability couldn’t be checked",
  failedDetail: "Appointment times are based on the availability settings shown here.",
} as const;

export type CalendarState = "checking" | "connected" | "disconnected" | "failed";

export function calendarCopy(state: CalendarState): { heading: string; detail: string } {
  if (state === "checking") return { heading: CALENDAR.checking, detail: "" };
  if (state === "connected") {
    return { heading: CALENDAR.connectedHeading, detail: CALENDAR.connectedDetail };
  }
  if (state === "failed") {
    return { heading: CALENDAR.failedHeading, detail: CALENDAR.failedDetail };
  }
  return { heading: CALENDAR.disconnectedHeading, detail: CALENDAR.disconnectedDetail };
}

/* ── Public scheduling link ────────────────────────────────────────────────
   There is no GET for this. `PUT .../public-link` is the only endpoint, and it
   answers with the state it just set. So on arrival the workspace genuinely
   does not know whether the link is on, and it says exactly that rather than
   drawing a toggle in a guessed position. */

export const PUBLIC_LINK = {
  heading: "Public scheduling page",
  detail:
    "A link clients can use without an account. Requests from it arrive here the same way.",
  unknownDetail: "This workspace can't read whether the link is currently on.",
  enableLabel: "Turn on public link",
  disableLabel: "Turn off public link",
  pendingLabel: "Saving…",
  enabledTitle: "Public link is on",
  enabledDetail: "This link is new. Any link issued before now has stopped working.",
  disabledTitle: "Public link is off",
  disabledDetail: "The link no longer opens a scheduling page.",
  failedTitle: "The public link wasn't changed",
  failedDetail: "Nothing changed. Try again.",
} as const;

export type PublicLinkState = "unknown" | "pending" | "enabled" | "disabled" | "failed";

/**
 * Build the public scheduling URL from the slug the server generated, under
 * either base configuration. Never fabricates a slug: without one there is no
 * URL to show. The dashboard lives at `<base>/appointments`; the public page is
 * a sibling of the dashboard base at `<origin><base>/schedule/<slug>`.
 */
export function publicScheduleUrl(
  origin: string,
  pathname: string,
  slug: string | null | undefined,
): string | null {
  if (typeof slug !== "string" || slug.trim() === "") return null;
  const base = pathname.replace(/\/appointments\/?$/, "").replace(/\/$/, "");
  return `${origin}${base}/schedule/${slug}`;
}

/* ── Server validation ─────────────────────────────────────────────────────
   The server is the authority on what is valid; the browser never silently
   rewrites a rejected value into an accepted one. A 400 carries a sentence
   naming the offending field, so it is shown at that field when it can be
   matched and at the form otherwise. */

export type ConfigField =
  | "timezone"
  | "weeklyHours"
  | "appointmentTypes"
  | "bufferBeforeMin"
  | "bufferAfterMin"
  | "minNoticeHours"
  | "maxAdvanceDays"
  | "blockedDates"
  | "dailyLimit";

const FIELD_PATTERNS: [ConfigField, RegExp][] = [
  ["timezone", /timezone|IANA/i],
  ["weeklyHours", /weeklyHours/i],
  ["appointmentTypes", /appointmentTypes|appointment type/i],
  ["bufferBeforeMin", /bufferBeforeMin/i],
  ["bufferAfterMin", /bufferAfterMin/i],
  ["minNoticeHours", /minNoticeHours/i],
  ["maxAdvanceDays", /maxAdvanceDays/i],
  ["blockedDates", /blockedDates/i],
  ["dailyLimit", /dailyLimit/i],
];

export function fieldForError(message: string | null | undefined): ConfigField | null {
  if (typeof message !== "string") return null;
  for (const [field, pattern] of FIELD_PATTERNS) {
    if (pattern.test(message)) return field;
  }
  return null;
}

/** The server's own sentence, or a form-level fallback for a bare 400. */
export function saveErrorDetail(message: string | null | undefined): string {
  if (typeof message === "string" && message.trim() !== "") return message.trim();
  return "The server rejected these settings. Check the values and try again.";
}

/* ── Calendar grid ─────────────────────────────────────────────────────────
   Pure date arithmetic in UTC so a grid never shifts with the viewer's zone.
   It decides layout only; which days are open is always the server's answer. */

export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  return { start: dateKey(year, month, 1), end: dateKey(year, month, daysInMonth(year, month)) };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function slotTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
}

export function slotDateTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  } catch {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

export function timezoneAbbreviation(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/* ── Request-list display ──────────────────────────────────────────────────
   Optional values are genuinely optional in the response: `contact` can be
   null, and phone and email can each be null on a present contact. Nothing is
   invented to fill a gap — the absence is stated. */

export function contactName(contact: { name?: string | null } | null | undefined): string {
  const name = contact?.name;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return REQUESTS.noName;
}

export function contactDetail(
  contact: { phone?: string | null; email?: string | null } | null | undefined,
): string {
  const parts = [contact?.phone, contact?.email]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return parts.length > 0 ? parts.join(" · ") : REQUESTS.noContact;
}

export function typeName(
  config: AvailabilityConfig | undefined,
  appointmentTypeId: string,
): string {
  const found = config?.appointmentTypes.find((t) => t.id === appointmentTypeId);
  if (found && typeof found.name === "string" && found.name.trim() !== "") return found.name;
  return REQUESTS.unknownType;
}

/* ── Exhaustive string surface ─────────────────────────────────────────────
   Everything this route can render, for the contract test to scan in one pass.
   A phrase that is not reachable from here is not reachable from the page. */

export function everyRenderableString(): string[] {
  const states = ["pending_review", "held", "cancelled", "expired", "requested", "booked", "rescheduled", "failed", ""];
  const reasons: (DayReason | undefined)[] = [
    "open",
    "blocked",
    "outside_hours",
    "fully_booked",
    "past_booking_window",
    "beyond_advance_window",
    undefined,
  ];
  return [
    ...Object.values(PAGE),
    ...views().map((v) => v.label),
    ...Object.values(PREVIEW),
    ...Object.values(REQUESTS),
    ...Object.values(AVAILABILITY),
    ...Object.values(CALENDAR),
    ...Object.values(PUBLIC_LINK),
    ...dayLegend().map((l) => l.label),
    ...reasons.map((r) => dayReasonLabel(r)),
    ...states.map((s) => requestStateLabel(s)),
    ...["website", "ai_receptionist", "manual", "unknown"].map((s) => sourceLabel(s)),
    ...(["checking", "connected", "disconnected", "failed"] as CalendarState[]).flatMap((s) => [
      calendarCopy(s).heading,
      calendarCopy(s).detail,
    ]),
    ...WEEKDAY_NAMES,
    saveErrorDetail(null),
    contactName(null),
    contactDetail(null),
    typeName(undefined, "whatever"),
  ];
}
