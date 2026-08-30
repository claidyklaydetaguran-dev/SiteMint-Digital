// Server-side availability calculation — the single source of truth shared
// by both the visual scheduling calendar and (in a later checkpoint) the
// voice assistant. Pure functions only: given a config and a snapshot of
// existing bookings, compute what's actually available. No DB, no network,
// no timers — callers own storage and concurrency.
//
// Checkpoint B: wired to durable, firm-scoped Postgres tables via
// schedulingRepository.ts, which also merges in Google Calendar free/busy
// ranges and manual blocked periods as ordinary `ExistingBooking` entries.
// This file itself never changed to support that — it stays pure.

import { utcToZonedParts, zonedTimeToUtc, zonedDateKey, parseDateKey } from "./zonedTime.js";

export interface DayHours {
  /** "HH:mm" in the business's local timezone. */
  start: string;
  end: string;
}

export interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

export interface AvailabilityConfig {
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  /** Keyed 0 (Sunday) - 6 (Saturday). `null` means closed that day. */
  weeklyHours: Record<number, DayHours | null>;
  appointmentTypes: AppointmentType[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  /** "YYYY-MM-DD", fully closed regardless of weeklyHours (holidays, manual time off). */
  blockedDates: string[];
  /** Slot start granularity, e.g. 30 for on-the-half-hour starts. */
  slotIntervalMin: number;
  /** Optional cap on total appointments per calendar day, across all types. */
  dailyLimit?: number;
}

export interface ExistingBooking {
  startUtc: Date;
  endUtc: Date;
}

export type SlotAvailability = "available" | "unavailable";

export interface AvailableSlot {
  startUtc: Date;
  endUtc: Date;
  availability: "available";
}

export type DayAvailabilityReason =
  | "open"
  | "blocked"
  | "outside_hours"
  | "fully_booked"
  | "past_booking_window"
  | "beyond_advance_window";

export interface DayAvailabilityResult {
  dateKey: string;
  reason: DayAvailabilityReason;
  slots: AvailableSlot[];
}

function timeStringToMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Invalid time string: "${hhmm}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTimeParts(totalMinutes: number): { hour: number; minute: number } {
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

function findAppointmentType(config: AvailabilityConfig, appointmentTypeId: string): AppointmentType | undefined {
  return config.appointmentTypes.find((t) => t.id === appointmentTypeId);
}

function occupiedRange(booking: ExistingBooking, bufferBeforeMin: number, bufferAfterMin: number): { start: number; end: number } {
  return {
    start: booking.startUtc.getTime() - bufferBeforeMin * 60_000,
    end: booking.endUtc.getTime() + bufferAfterMin * 60_000,
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Computes every available slot on one calendar day (in the business's
 * timezone) for one appointment type. Returns an honest `reason` even when
 * `slots` is empty, so the UI never has to guess why a day shows nothing.
 */
export function computeDayAvailability(
  config: AvailabilityConfig,
  existingBookings: readonly ExistingBooking[],
  dateKey: string,
  appointmentTypeId: string,
  now: Date,
): DayAvailabilityResult {
  const type = findAppointmentType(config, appointmentTypeId);
  if (!type) {
    return { dateKey, reason: "outside_hours", slots: [] };
  }

  if (config.blockedDates.includes(dateKey)) {
    return { dateKey, reason: "blocked", slots: [] };
  }

  const { year, month, day } = parseDateKey(dateKey);
  // Determine weekday by asking what a midday instant on that date resolves
  // to in the business timezone — robust to any DST edge case on the date itself.
  const middayUtc = zonedTimeToUtc(config.timezone, year, month, day, 12, 0);
  const weekday = utcToZonedParts(config.timezone, middayUtc).weekday;
  const hours = config.weeklyHours[weekday];
  if (!hours) {
    return { dateKey, reason: "outside_hours", slots: [] };
  }

  const maxAdvanceUtc = new Date(now.getTime() + config.maxAdvanceDays * 24 * 60 * 60_000);
  const minNoticeUtc = new Date(now.getTime() + config.minNoticeHours * 60 * 60_000);

  const openMin = timeStringToMinutes(hours.start);
  const closeMin = timeStringToMinutes(hours.end);

  const dayBookings = existingBookings.filter((b) => zonedDateKey(config.timezone, b.startUtc) === dateKey);
  if (config.dailyLimit !== undefined && dayBookings.length >= config.dailyLimit) {
    return { dateKey, reason: "fully_booked", slots: [] };
  }

  const slots: AvailableSlot[] = [];
  let beyondAdvance = false;
  let pastNotice = false;

  for (let startMin = openMin; startMin + type.durationMin <= closeMin; startMin += config.slotIntervalMin) {
    const { hour, minute } = minutesToTimeParts(startMin);
    const startUtc = zonedTimeToUtc(config.timezone, year, month, day, hour, minute);
    const endUtc = new Date(startUtc.getTime() + type.durationMin * 60_000);

    if (startUtc.getTime() > maxAdvanceUtc.getTime()) {
      beyondAdvance = true;
      continue;
    }
    if (startUtc.getTime() < minNoticeUtc.getTime()) {
      pastNotice = true;
      continue;
    }

    const candidate = occupiedRange({ startUtc, endUtc }, config.bufferBeforeMin, config.bufferAfterMin);
    const conflict = dayBookings.some((booking) => {
      const existing = occupiedRange(booking, config.bufferBeforeMin, config.bufferAfterMin);
      return overlaps(candidate.start, candidate.end, existing.start, existing.end);
    });
    if (conflict) continue;

    slots.push({ startUtc, endUtc, availability: "available" });
  }

  if (slots.length > 0) return { dateKey, reason: "open", slots };
  if (dayBookings.length > 0) return { dateKey, reason: "fully_booked", slots: [] };
  if (beyondAdvance && !pastNotice) return { dateKey, reason: "beyond_advance_window", slots: [] };
  if (pastNotice && !beyondAdvance) return { dateKey, reason: "past_booking_window", slots: [] };
  return { dateKey, reason: "outside_hours", slots: [] };
}

/**
 * Re-derives availability for one specific slot at call time — the
 * authoritative recheck a booking submission must pass before it's
 * accepted, regardless of what the browser previously displayed.
 */
export function isSlotStillAvailable(
  config: AvailabilityConfig,
  existingBookings: readonly ExistingBooking[],
  startUtc: Date,
  appointmentTypeId: string,
  now: Date,
): boolean {
  const dateKey = zonedDateKey(config.timezone, startUtc);
  const day = computeDayAvailability(config, existingBookings, dateKey, appointmentTypeId, now);
  return day.slots.some((slot) => slot.startUtc.getTime() === startUtc.getTime());
}

/** A ready-to-use, clearly-labeled Development sample configuration — never used for a real business without explicit admin configuration. */
export const SAMPLE_DEVELOPMENT_AVAILABILITY_CONFIG: AvailabilityConfig = {
  timezone: "America/Los_Angeles",
  weeklyHours: {
    0: null,
    1: { start: "09:00", end: "17:00" },
    2: { start: "09:00", end: "17:00" },
    3: { start: "09:00", end: "17:00" },
    4: { start: "09:00", end: "17:00" },
    5: { start: "09:00", end: "17:00" },
    6: null,
  },
  appointmentTypes: [
    { id: "consult", name: "Consultation", durationMin: 30 },
    { id: "estimate", name: "On-site estimate", durationMin: 60 },
  ],
  bufferBeforeMin: 10,
  bufferAfterMin: 10,
  minNoticeHours: 4,
  maxAdvanceDays: 30,
  blockedDates: [],
  slotIntervalMin: 30,
  dailyLimit: 12,
};
