/**
 * V5 PR-7/PR-8 — shared, provider-agnostic date/time arithmetic and
 * formatting for every screen that renders the availability calendar grid or
 * a slot time: the Test Booking preview and the Appointments reschedule
 * picker. No React, no network access.
 *
 * Split out of the Frontend V2 Phase 13 `appointmentsContract.ts` (which
 * previously served the single combined Appointments workspace) so the two
 * screens that now need this arithmetic — Test Booking and the Appointments
 * reschedule flow — share one implementation instead of two copies drifting
 * apart. Pure date arithmetic stays in UTC so a grid never shifts with the
 * viewer's zone; which days are open is always the server's answer, never
 * recomputed here.
 */

import type { DayReason } from "@/lib/availabilityApi";

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
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
}

export function slotDateTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
    });
  } catch {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }
}

export function timezoneAbbreviation(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

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

export function dayLegend(): { tone: "open" | "full" | "closed"; label: string }[] {
  return [
    { tone: "open", label: "Open" },
    { tone: "full", label: "No times left" },
    { tone: "closed", label: "Closed" },
  ];
}

export const LEGEND_TONE: Record<DayReason, "open" | "full" | "closed"> = {
  open: "open",
  fully_booked: "full",
  blocked: "closed",
  outside_hours: "closed",
  past_booking_window: "closed",
  beyond_advance_window: "closed",
};
