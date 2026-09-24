import { describe, expect, it } from "vitest";
import {
  computeDayAvailability,
  isSlotStillAvailable,
  SAMPLE_DEVELOPMENT_AVAILABILITY_CONFIG,
  type AvailabilityConfig,
  type ExistingBooking,
} from "./availabilityEngine.js";
import { zonedTimeToUtc } from "./zonedTime.js";

const CONFIG: AvailabilityConfig = SAMPLE_DEVELOPMENT_AVAILABILITY_CONFIG;
const NOW = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 2, 8, 0); // a Monday, 8am local

function booking(dateY: number, dateM: number, dateD: number, h: number, m: number, durationMin: number): ExistingBooking {
  const startUtc = zonedTimeToUtc(CONFIG.timezone, dateY, dateM, dateD, h, m);
  return { startUtc, endUtc: new Date(startUtc.getTime() + durationMin * 60_000) };
}

describe("computeDayAvailability", () => {
  it("returns slots within business hours on an open weekday", () => {
    const result = computeDayAvailability(CONFIG, [], "2026-03-03", "consult", NOW); // Tuesday
    expect(result.reason).toBe("open");
    expect(result.slots.length).toBeGreaterThan(0);
    // First slot should be at business open (09:00 local).
    const first = result.slots[0]!;
    expect(first.startUtc.getTime()).toBe(zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 9, 0).getTime());
  });

  it("marks a closed weekday as outside_hours with zero slots (Sunday)", () => {
    const result = computeDayAvailability(CONFIG, [], "2026-03-01", "consult", NOW); // Sunday
    expect(result.reason).toBe("outside_hours");
    expect(result.slots).toHaveLength(0);
  });

  it("marks a blocked date (holiday/manual time off) as blocked even on an otherwise-open weekday", () => {
    const config = { ...CONFIG, blockedDates: ["2026-03-03"] };
    const result = computeDayAvailability(config, [], "2026-03-03", "consult", NOW);
    expect(result.reason).toBe("blocked");
    expect(result.slots).toHaveLength(0);
  });

  it("excludes a slot that would overlap an existing booking's buffer window", () => {
    const existing = [booking(2026, 3, 3, 9, 0, 30)]; // 9:00-9:30, +/-10min buffer => 8:50-9:40 occupied
    const result = computeDayAvailability(CONFIG, existing, "2026-03-03", "consult", NOW);
    const nineAm = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 9, 0).getTime();
    const nineThirty = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 9, 30).getTime();
    expect(result.slots.some((s) => s.startUtc.getTime() === nineAm)).toBe(false);
    expect(result.slots.some((s) => s.startUtc.getTime() === nineThirty)).toBe(false);
    // 10:00 is outside the buffered range (9:40 buffer end) and should remain available.
    const tenAm = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 10, 0).getTime();
    expect(result.slots.some((s) => s.startUtc.getTime() === tenAm)).toBe(true);
  });

  it("respects minimum scheduling notice — no slots sooner than minNoticeHours from now", () => {
    const today = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 2, 8, 0); // Monday 8am, minNotice=4h -> earliest 12pm
    const result = computeDayAvailability(CONFIG, [], "2026-03-02", "consult", today);
    const before = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 2, 11, 0).getTime();
    expect(result.slots.some((s) => s.startUtc.getTime() === before)).toBe(false);
    const after = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 2, 12, 30).getTime();
    expect(result.slots.some((s) => s.startUtc.getTime() === after)).toBe(true);
  });

  it("respects the maximum advance-booking window — nothing beyond maxAdvanceDays from now", () => {
    const farDateKey = "2026-05-01"; // well beyond 30 days from NOW (2026-03-02)
    const result = computeDayAvailability(CONFIG, [], farDateKey, "consult", NOW);
    expect(result.reason).toBe("beyond_advance_window");
    expect(result.slots).toHaveLength(0);
  });

  it("reports fully_booked when the configured daily limit is reached", () => {
    const config = { ...CONFIG, dailyLimit: 1 };
    const existing = [booking(2026, 3, 3, 9, 0, 30)];
    const result = computeDayAvailability(config, existing, "2026-03-03", "consult", NOW);
    expect(result.reason).toBe("fully_booked");
    expect(result.slots).toHaveLength(0);
  });

  it("reports fully_booked (not outside_hours) when every remaining slot is individually taken", () => {
    // Tiny business day: 09:00-10:00 only, one 30-min type, single existing booking covers the whole window with buffers.
    const config: AvailabilityConfig = {
      ...CONFIG,
      weeklyHours: { ...CONFIG.weeklyHours, 2: { start: "09:00", end: "10:00" } },
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    };
    const existing = [booking(2026, 3, 3, 9, 0, 60)];
    const result = computeDayAvailability(config, existing, "2026-03-03", "consult", NOW);
    expect(result.reason).toBe("fully_booked");
    expect(result.slots).toHaveLength(0);
  });

  it("uses the appointment type's own duration when placing slots", () => {
    const result = computeDayAvailability(CONFIG, [], "2026-03-03", "estimate", NOW); // 60 min type
    for (const slot of result.slots) {
      expect(slot.endUtc.getTime() - slot.startUtc.getTime()).toBe(60 * 60_000);
    }
  });

  it("never returns a slot for an unknown appointment type", () => {
    const result = computeDayAvailability(CONFIG, [], "2026-03-03", "does-not-exist", NOW);
    expect(result.slots).toHaveLength(0);
  });

  it("correctly places business hours across a DST spring-forward boundary", () => {
    // 2026-03-08 is the US spring-forward date; business hours must still resolve to 9am local.
    const result = computeDayAvailability(CONFIG, [], "2026-03-09", "consult", NOW); // Monday after DST
    expect(result.reason).toBe("open");
    const nineAmLocal = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 9, 9, 0).getTime();
    expect(result.slots[0]!.startUtc.getTime()).toBe(nineAmLocal);
  });
});

describe("isSlotStillAvailable (server-side revalidation before booking)", () => {
  it("returns true for a genuinely open slot", () => {
    const slot = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 9, 0);
    expect(isSlotStillAvailable(CONFIG, [], slot, "consult", NOW)).toBe(true);
  });

  it("returns false once another booking has taken the slot in the interim (double-booking prevention)", () => {
    const slot = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 9, 0);
    const existing = [booking(2026, 3, 3, 9, 0, 30)];
    // The client that displayed this slot as available did so from a stale
    // snapshot; the authoritative recheck against current bookings rejects it.
    expect(isSlotStillAvailable(CONFIG, existing, slot, "consult", NOW)).toBe(false);
  });

  it("never returns true for a slot outside business hours, regardless of what the browser submits", () => {
    const midnight = zonedTimeToUtc(CONFIG.timezone, 2026, 3, 3, 0, 0);
    expect(isSlotStillAvailable(CONFIG, [], midnight, "consult", NOW)).toBe(false);
  });
});
