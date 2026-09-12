// Scheduling rules that a business sets and a caller then experiences:
// per-date exceptions, per-type overrides, per-type daily caps, and what
// happens across a DST boundary.
//
// The property under test throughout is that ONE calculation governs all of
// it. `resolveTypeRules` is what the dashboard shows and what the slot search
// obeys; if they were computed separately, a business could set a 2-hour notice
// on a type, see "2 hours" on screen, and still have callers offered a slot
// twenty minutes out. Each case below asserts the displayed value and the
// resulting slots together, so that divergence cannot pass.

import { describe, expect, it } from "vitest";
import {
  computeDayAvailability,
  isSlotStillAvailable,
  resolveTypeRules,
  type AppointmentType,
  type AvailabilityConfig,
  type ExistingBooking,
} from "./availabilityEngine.js";
import { zonedTimeToUtc, zonedDateKey } from "./zonedTime.js";

const TZ = "America/Los_Angeles";

const CONSULT: AppointmentType = { id: "consult", name: "Consultation", durationMin: 30 };

function config(overrides: Partial<AvailabilityConfig> = {}): AvailabilityConfig {
  return {
    timezone: TZ,
    weeklyHours: {
      0: null,
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
      6: null,
    },
    appointmentTypes: [CONSULT],
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeHours: 0,
    maxAdvanceDays: 60,
    blockedDates: [],
    slotIntervalMin: 30,
    ...overrides,
  };
}

/** 2026-03-02 is a Monday; local 08:00 is before the 09:00 open. */
const NOW = zonedTimeToUtc(TZ, 2026, 3, 2, 8, 0);

function at(y: number, m: number, d: number, h: number, min = 0): number {
  return zonedTimeToUtc(TZ, y, m, d, h, min).getTime();
}

function booked(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  durationMin: number,
  appointmentTypeId?: string,
): ExistingBooking {
  const startUtc = zonedTimeToUtc(TZ, y, m, d, h, min);
  return {
    startUtc,
    endUtc: new Date(startUtc.getTime() + durationMin * 60_000),
    ...(appointmentTypeId === undefined ? {} : { appointmentTypeId }),
  };
}

// ── date exceptions ──────────────────────────────────────────────────────────

describe("date exceptions", () => {
  it("closes a normally-open day, and says closed rather than fully booked", () => {
    const result = computeDayAvailability(
      config({ dateExceptions: [{ dateKey: "2026-03-03", closed: true, label: "Staff training" }] }),
      [],
      "2026-03-03",
      "consult",
      NOW,
    );
    // The distinction matters to the caller: "we are closed that day" is a
    // different answer from "that day is full", and only one of them invites
    // them to try a later time on the same day.
    expect(result.reason).toBe("blocked");
    expect(result.slots).toHaveLength(0);
  });

  it("opens a normally-closed day when the exception carries hours", () => {
    const result = computeDayAvailability(
      config({ dateExceptions: [{ dateKey: "2026-03-07", closed: false, hours: { start: "10:00", end: "13:00" } }] }),
      [],
      "2026-03-07", // Saturday: weeklyHours[6] is null
      "consult",
      NOW,
    );
    expect(result.reason).toBe("open");
    expect(result.slots[0]!.startUtc.getTime()).toBe(at(2026, 3, 7, 10, 0));
    expect(result.slots.at(-1)!.endUtc.getTime()).toBeLessThanOrEqual(at(2026, 3, 7, 13, 0));
  });

  it("replaces the weekday's hours rather than narrowing them", () => {
    // Christmas Eve short day: normal hours are 09:00-17:00, the exception says
    // 09:00-12:00, and nothing after noon may be offered.
    const result = computeDayAvailability(
      config({ dateExceptions: [{ dateKey: "2026-12-24", closed: false, hours: { start: "09:00", end: "12:00" } }] }),
      [],
      "2026-12-24",
      "consult",
      zonedTimeToUtc(TZ, 2026, 12, 1, 8, 0),
    );
    expect(result.reason).toBe("open");
    expect(result.slots.every((s) => s.endUtc.getTime() <= at(2026, 12, 24, 12, 0))).toBe(true);
    expect(result.slots).toHaveLength(6); // 9:00, 9:30 … 11:30
  });

  it("applies only to its own date", () => {
    const cfg = config({ dateExceptions: [{ dateKey: "2026-03-03", closed: true }] });
    expect(computeDayAvailability(cfg, [], "2026-03-04", "consult", NOW).reason).toBe("open");
  });

  it("cannot be bypassed by submitting a slot on a closed date", () => {
    const cfg = config({ dateExceptions: [{ dateKey: "2026-03-03", closed: true }] });
    const slot = new Date(at(2026, 3, 3, 10, 0));
    // The browser may well have been showing this slot before the business
    // closed the day. Revalidation is the authority, not the browser.
    expect(isSlotStillAvailable(cfg, [], slot, "consult", NOW)).toBe(false);
  });
});

// ── per-type overrides ───────────────────────────────────────────────────────

describe("per-type rules", () => {
  it("inherits every unset rule from the business, and an unset rule is not zero", () => {
    const cfg = config({ bufferBeforeMin: 15, bufferAfterMin: 15, minNoticeHours: 4, maxAdvanceDays: 30 });
    const rules = resolveTypeRules(cfg, CONSULT);
    expect(rules).toMatchObject({
      durationMin: 30,
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
      minNoticeHours: 4,
      maxAdvanceDays: 30,
      slotIntervalMin: 30,
      dailyLimit: null,
      typeDailyLimit: null,
    });
  });

  it("treats an explicit zero as a real value, not as 'inherit'", () => {
    const noBuffer: AppointmentType = { ...CONSULT, bufferBeforeMin: 0, bufferAfterMin: 0 };
    const cfg = config({ appointmentTypes: [noBuffer], bufferBeforeMin: 30, bufferAfterMin: 30 });
    expect(resolveTypeRules(cfg, noBuffer)).toMatchObject({ bufferBeforeMin: 0, bufferAfterMin: 0 });

    // And the slot search agrees: back-to-back slots survive.
    const result = computeDayAvailability(cfg, [booked(2026, 3, 3, 9, 0, 30, "consult")], "2026-03-03", "consult", NOW);
    expect(result.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 9, 30))).toBe(true);
  });

  it("enforces a type's own buffer in the slot search, exactly as displayed", () => {
    const padded: AppointmentType = { ...CONSULT, bufferAfterMin: 30 };
    const cfg = config({ appointmentTypes: [padded] });
    expect(resolveTypeRules(cfg, padded).bufferAfterMin).toBe(30);

    const existing = [booked(2026, 3, 3, 9, 0, 30, "consult")];
    const result = computeDayAvailability(cfg, existing, "2026-03-03", "consult", NOW);
    // 9:00-9:30 booked, +30 after, so the hour to 10:00 is occupied. 9:30 is
    // consumed; 10:00 starts exactly as the buffer ends and stays open.
    expect(result.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 9, 30))).toBe(false);
    expect(result.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 10, 0))).toBe(true);

    // And the override is what removed 9:30: with the firm default of 0 the
    // same booking leaves it open. Without this, the case would still pass if
    // the buffer were being ignored and something else blocked the slot.
    const inherited = computeDayAvailability(config(), existing, "2026-03-03", "consult", NOW);
    expect(inherited.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 9, 30))).toBe(true);
  });

  it("enforces a type's own minimum notice", () => {
    const sameDayBlocked: AppointmentType = { ...CONSULT, minNoticeHours: 24 };
    const cfg = config({ appointmentTypes: [sameDayBlocked], minNoticeHours: 0 });
    const result = computeDayAvailability(cfg, [], "2026-03-02", "consult", NOW);
    expect(result.reason).toBe("past_booking_window");
    expect(result.slots).toHaveLength(0);
    // The next day is still reachable, so the rule narrows rather than breaks.
    expect(computeDayAvailability(cfg, [], "2026-03-04", "consult", NOW).reason).toBe("open");
  });

  it("enforces a type's own booking window", () => {
    const nearTerm: AppointmentType = { ...CONSULT, maxAdvanceDays: 7 };
    const cfg = config({ appointmentTypes: [nearTerm], maxAdvanceDays: 365 });
    expect(computeDayAvailability(cfg, [], "2026-03-04", "consult", NOW).reason).toBe("open");
    expect(computeDayAvailability(cfg, [], "2026-04-15", "consult", NOW).reason).toBe("beyond_advance_window");
  });

  it("enforces a type's own slot interval", () => {
    const hourly: AppointmentType = { ...CONSULT, slotIntervalMin: 60 };
    const cfg = config({ appointmentTypes: [hourly] });
    const result = computeDayAvailability(cfg, [], "2026-03-03", "consult", NOW);
    expect(result.slots.every((s) => new Date(s.startUtc).getUTCMinutes() === 0)).toBe(true);
  });
});

// ── daily caps ───────────────────────────────────────────────────────────────

describe("daily caps", () => {
  const capped: AppointmentType = { ...CONSULT, dailyLimit: 2 };

  it("counts only appointments of that type toward the type's cap", () => {
    const cfg = config({ appointmentTypes: [capped] });
    const twoOfType = [booked(2026, 3, 3, 9, 0, 30, "consult"), booked(2026, 3, 3, 11, 0, 30, "consult")];
    expect(computeDayAvailability(cfg, twoOfType, "2026-03-03", "consult", NOW).reason).toBe("fully_booked");

    const oneOfTypePlusOther = [booked(2026, 3, 3, 9, 0, 30, "consult"), booked(2026, 3, 3, 11, 0, 30, "estimate")];
    expect(computeDayAvailability(cfg, oneOfTypePlusOther, "2026-03-03", "consult", NOW).reason).toBe("open");
  });

  it("never lets an external busy range consume a type's quota", () => {
    // A calendar block belongs to no appointment type. It must still block the
    // time it covers, but it must not count as one of the day's two slots — a
    // lunch entry on the owner's calendar is not a customer appointment.
    const cfg = config({ appointmentTypes: [capped] });
    const external = [booked(2026, 3, 3, 12, 0, 60), booked(2026, 3, 3, 14, 0, 60)];
    const result = computeDayAvailability(cfg, external, "2026-03-03", "consult", NOW);
    expect(result.reason).toBe("open");
    expect(result.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 12, 0))).toBe(false);
    expect(result.slots.some((s) => s.startUtc.getTime() === at(2026, 3, 3, 9, 0))).toBe(true);
  });

  it("still applies the firm-wide cap across all types", () => {
    const cfg = config({ dailyLimit: 2 });
    const mixed = [booked(2026, 3, 3, 9, 0, 30, "consult"), booked(2026, 3, 3, 11, 0, 30, "estimate")];
    expect(computeDayAvailability(cfg, mixed, "2026-03-03", "consult", NOW).reason).toBe("fully_booked");
  });
});

// ── daylight saving ──────────────────────────────────────────────────────────

describe("daylight saving", () => {
  // US DST 2026: forward 2026-03-08, back 2026-11-01. Both are Sundays, so the
  // days that matter here are the ones on either side of the change.
  it("keeps local business hours fixed across spring-forward", () => {
    const before = computeDayAvailability(config(), [], "2026-03-06", "consult", NOW); // Fri, PST
    const after = computeDayAvailability(config(), [], "2026-03-09", "consult", NOW); // Mon, PDT
    expect(before.slots[0]!.startUtc.getTime()).toBe(at(2026, 3, 6, 9, 0));
    expect(after.slots[0]!.startUtc.getTime()).toBe(at(2026, 3, 9, 9, 0));
    // Same wall-clock open, one hour apart in UTC — which is the whole point.
    expect(after.slots[0]!.startUtc.getUTCHours() - before.slots[0]!.startUtc.getUTCHours()).toBe(-1);
    expect(before.slots).toHaveLength(after.slots.length);
  });

  it("keeps local business hours fixed across fall-back", () => {
    const now = zonedTimeToUtc(TZ, 2026, 10, 1, 8, 0);
    const before = computeDayAvailability(config(), [], "2026-10-30", "consult", now); // Fri, PDT
    const after = computeDayAvailability(config(), [], "2026-11-02", "consult", now); // Mon, PST
    expect(before.slots[0]!.startUtc.getTime()).toBe(at(2026, 10, 30, 9, 0));
    expect(after.slots[0]!.startUtc.getTime()).toBe(at(2026, 11, 2, 9, 0));
    expect(after.slots[0]!.startUtc.getUTCHours() - before.slots[0]!.startUtc.getUTCHours()).toBe(1);
  });

  it("attributes a booking to the local date it falls on, not the UTC date", () => {
    // 17:00 Pacific is the next day in UTC. A daily cap that counted UTC dates
    // would charge the evening appointment to tomorrow and let today overbook.
    const eveningUtc = zonedTimeToUtc(TZ, 2026, 3, 3, 16, 30);
    expect(zonedDateKey(TZ, eveningUtc)).toBe("2026-03-03");
    expect(eveningUtc.getUTCDate()).toBe(4);

    const cfg = config({ dailyLimit: 1 });
    const result = computeDayAvailability(cfg, [{ startUtc: eveningUtc, endUtc: new Date(eveningUtc.getTime() + 1_800_000) }], "2026-03-03", "consult", NOW);
    expect(result.reason).toBe("fully_booked");
  });
});
