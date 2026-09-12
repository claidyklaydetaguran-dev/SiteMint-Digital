/**
 * V5 PR-7 — every string the Availability workspace displays: the rules the
 * server uses to decide which times a client can request, plus the
 * appointment-type catalogue, plus the public scheduling link.
 *
 * Split out of the Frontend V2 Phase 13 `appointmentsContract.ts`, which
 * combined this with the booking preview and the requests list in one route.
 * Backed by the same, unchanged `PUT /receptionist/availability/config` and
 * `PUT /receptionist/availability/public-link` endpoints — no shape here is
 * new. What is new is presentation only: buffers, minimum notice, the
 * booking window, the daily limit and blocked dates now sit behind an
 * "Advanced" disclosure (owner decision B-1), and appointment types are their
 * own tab rather than a section on the same scroll.
 *
 * Calendar *connection* status and its Connect/Disconnect controls moved to
 * their own screen (`pages/Calendar.tsx`, PR-7) now that connecting writes
 * real calendar events rather than only informing availability. This module
 * keeps only a one-line pointer to that screen — it duplicates neither the
 * connection state nor its wording.
 */

export const PAGE = {
  eyebrow: "SCHEDULING",
  title: "Availability",
  detail: "The rules the server uses to decide which times a client can request.",
  loading: "Loading availability settings…",
  failed: "Availability settings couldn't be loaded. Try again shortly.",
} as const;

export type AvailabilityTab = "settings" | "types";

export function tabs(): { id: AvailabilityTab; label: string }[] {
  return [
    { id: "settings", label: "Settings" },
    { id: "types", label: "Appointment types" },
  ];
}

/**
 * The approved nav lists "Appointment Types" as its own entry under
 * Scheduling, but it renders as a tab of this same screen rather than a
 * second route (see the module doc). `?tab=types` is how a nav item — or any
 * other deep link — lands directly on that tab; anything else, including no
 * param at all, opens on Settings.
 */
export function initialTabFromSearch(search: string): AvailabilityTab {
  const params = new URLSearchParams(search);
  return params.get("tab") === "types" ? "types" : "settings";
}

export const SETTINGS = {
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

  advancedHeading: "Advanced",
  advancedHelp: "Buffers, minimum notice, the booking window, the daily limit, and blocked dates.",
  advancedShow: "Show advanced settings",
  advancedHide: "Hide advanced settings",

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

export const TYPES = {
  heading: "Appointment types",
  help: "At least one type is required. Duration is in minutes, from 5 to 480.",
  nameLabel: "Name",
  durationLabel: "Minutes",
  add: "Add appointment type",
  remove: "Remove",

  descriptionLabel: "What this is (optional)",
  descriptionHelp: "Shown on your public scheduling page.",

  publicLabel: "Offer on the public scheduling page",
  publicHelp: "Off means only you and the receptionist can use it.",
  activeLabel: "Accepting bookings",
  inactiveBadge: "Not accepting bookings",
  inactiveHelp: "Turn this back on to make it bookable again. Past appointments keep their type either way.",

  rulesToggleShow: "Set different rules for this service",
  rulesToggleHide: "Hide this service's rules",
  rulesHelp: "Anything left on “Follow business setting” uses the value from the Settings tab.",
  inheritLabel: "Follow business setting",
  overrideLabel: "Set for this service",
  // The effective value is always stated, so a business never has to work out
  // what an inherited rule currently resolves to.
  effectivePrefix: "In use now:",

  ruleBufferBefore: "Buffer before (minutes)",
  ruleBufferAfter: "Buffer after (minutes)",
  ruleMinNotice: "Minimum notice (hours)",
  ruleMaxAdvance: "Booking window (days ahead)",
  ruleSlotInterval: "Start times every (minutes)",
  ruleDailyLimit: "Most per day, this service",
  ruleDailyLimitHelp: "Counts only this service. The business-wide daily limit still applies on top.",
} as const;

/**
 * Per-date closures and short days.
 *
 * Separate from "Blocked dates" on purpose, and the wording says which is
 * which: a blocked date shuts a day, an exception can also OPEN one or shorten
 * it. Collapsing the two would make "closed" and "open 9–11" the same control.
 */
export const EXCEPTIONS = {
  heading: "Specific dates",
  help: "Holidays, and days with different hours. These override your weekly hours for that one date.",
  none: "No date changes yet.",
  addClosed: "Add a closed day",
  addHours: "Add a day with different hours",
  remove: "Remove",
  dateLabel: "Date",
  labelLabel: "Why (optional)",
  labelPlaceholder: "e.g. Public holiday",
  startLabel: "Opens",
  endLabel: "Closes",
  closedTag: "Closed all day",
  openTag: "Different hours",
  switchToClosed: "Close all day instead",
  switchToHours: "Use different hours instead",
  duplicate: "That date is already listed. Edit the existing entry instead.",
} as const;

/** One-line pointer to the Calendar screen; this module owns no connection wording. */
export const CALENDAR_POINTER = {
  heading: "Calendar availability",
  detail: "Connect a calendar and manage the connection under Calendar.",
  linkLabel: "Go to Calendar",
  href: "/calendar",
} as const;

/* ── Public scheduling link — unchanged from Phase 13 ──────────────────── */

export const PUBLIC_LINK = {
  heading: "Public scheduling page",
  detail: "A link clients can use without an account. Requests from it arrive here the same way.",
  unknownDetail: "This workspace can't read whether the link is currently on. Choose the state to set.",
  commandsLabel: "Set the public link",
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
export type PublicLinkKnownState = "unknown" | "enabled" | "disabled";

export function publicLinkActions(known: PublicLinkKnownState): { enable: boolean; disable: boolean } {
  return { enable: known !== "enabled", disable: known !== "disabled" };
}

export function publicLinkUrlVisible(known: PublicLinkKnownState, slug: string | null | undefined): boolean {
  return known === "enabled" && typeof slug === "string" && slug.trim() !== "";
}

export function publicScheduleUrl(origin: string, pathname: string, slug: string | null | undefined): string | null {
  if (typeof slug !== "string" || slug.trim() === "") return null;
  const base = pathname.replace(/\/availability\/?$/, "").replace(/\/$/, "");
  return `${origin}${base}/schedule/${slug}`;
}

/* ── Server validation ─────────────────────────────────────────────────── */

export type ConfigField =
  | "timezone"
  | "weeklyHours"
  | "appointmentTypes"
  | "bufferBeforeMin"
  | "bufferAfterMin"
  | "minNoticeHours"
  | "maxAdvanceDays"
  | "blockedDates"
  | "dateExceptions"
  | "dailyLimit";

// Order matters: the server's per-type messages are prefixed
// `appointmentTypes[n].bufferBeforeMin`, so the appointmentTypes pattern has to
// be tested BEFORE the bare rule names or every per-type rejection would be
// attributed to the business-wide field on the other tab.
const FIELD_PATTERNS: [ConfigField, RegExp][] = [
  ["timezone", /timezone|IANA/i],
  ["weeklyHours", /weeklyHours/i],
  ["appointmentTypes", /appointmentTypes|appointment type/i],
  ["dateExceptions", /dateExceptions/i],
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

export function saveErrorDetail(message: string | null | undefined): string {
  if (typeof message === "string" && message.trim() !== "") return message.trim();
  return "The server rejected these settings. Check the values and try again.";
}

/** Which tab a rejected field lives on, so the error can move the operator there. */
const ADVANCED_FIELDS: ReadonlySet<ConfigField> = new Set([
  "bufferBeforeMin", "bufferAfterMin", "minNoticeHours", "maxAdvanceDays", "blockedDates", "dateExceptions", "dailyLimit",
]);

export function tabForField(field: ConfigField): AvailabilityTab {
  return field === "appointmentTypes" ? "types" : "settings";
}

export function isAdvancedField(field: ConfigField): boolean {
  return ADVANCED_FIELDS.has(field);
}

export { WEEKDAY_NAMES } from "../../lib/schedulingDates";

/* ── Read shape → write shape ──────────────────────────────────────────── */

import type {
  AppointmentTypeDetail,
  AppointmentTypeInput,
  AvailabilityConfig,
  AvailabilityConfigInput,
  DateException,
} from "../../lib/availabilityApi";

/**
 * The editable draft, derived from what the server returned.
 *
 * `appointmentTypeDetail` is the source for types when the server provides it;
 * `appointmentTypes` is the fallback for a server that predates per-type rules.
 * Without that fallback, a dashboard deployed ahead of its backend would show a
 * business zero appointment types and then save that emptiness.
 *
 * The read-only `effective` block is deliberately dropped: echoing a computed
 * value back as if it were a setting is how every inherited rule would silently
 * become a hard-coded override on the first save.
 */
export function toConfigInput(config: AvailabilityConfig): AvailabilityConfigInput {
  const detail = config.appointmentTypeDetail;
  const types: AppointmentTypeInput[] =
    detail !== undefined
      ? detail.map((t) => ({
          id: t.id,
          name: t.name,
          durationMin: t.durationMin,
          description: t.description,
          active: t.active,
          public: t.public,
          calendarId: t.calendarId,
          ...t.overrides,
        }))
      : config.appointmentTypes.map((t) => ({ id: t.id, name: t.name, durationMin: t.durationMin }));

  return {
    timezone: config.timezone,
    weeklyHours: { ...config.weeklyHours },
    appointmentTypes: types,
    bufferBeforeMin: config.bufferBeforeMin,
    bufferAfterMin: config.bufferAfterMin,
    minNoticeHours: config.minNoticeHours,
    maxAdvanceDays: config.maxAdvanceDays,
    blockedDates: [...config.blockedDates],
    dateExceptions: (config.dateExceptions ?? []).map((e) => ({ ...e })),
    dailyLimit: config.dailyLimit,
  };
}

/** The `effective` block for one draft type, or null for a type the server has not seen yet. */
export function effectiveForType(
  config: AvailabilityConfig | undefined,
  typeId: string | undefined,
): AppointmentTypeDetail["effective"] | null {
  if (config?.appointmentTypeDetail === undefined || typeId === undefined) return null;
  return config.appointmentTypeDetail.find((t) => t.id === typeId)?.effective ?? null;
}

/* ── Date exceptions ───────────────────────────────────────────────────── */

/** ISO date key for today in the viewer's own zone — the sensible default for a new row. */
export function todayDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A date not already claimed by another exception.
 *
 * The server refuses two entries for one date (the table's unique index), so
 * offering a duplicate would produce a rejected save instead of a new row.
 */
export function nextFreeDateKey(existing: readonly DateException[], now: Date): string {
  const taken = new Set(existing.map((e) => e.dateKey));
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 400; i += 1) {
    const key = todayDateKey(cursor);
    if (!taken.has(key)) return key;
    cursor.setDate(cursor.getDate() + 1);
  }
  return todayDateKey(now);
}

export function exceptionsSorted(list: readonly DateException[]): DateException[] {
  return [...list].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** True when changing row `index`'s date to `dateKey` would collide with another row. */
export function wouldDuplicateDate(list: readonly DateException[], index: number, dateKey: string): boolean {
  return list.some((e, i) => i !== index && e.dateKey === dateKey);
}

/* ── Exhaustive string surface ─────────────────────────────────────────── */

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...tabs().map((t) => t.label),
    ...Object.values(SETTINGS),
    ...Object.values(TYPES),
    ...Object.values(EXCEPTIONS),
    ...Object.values(CALENDAR_POINTER),
    ...Object.values(PUBLIC_LINK),
    saveErrorDetail(null),
  ];
}
