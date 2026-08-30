import { describe, expect, it } from "vitest";
import { zonedTimeToUtc, utcToZonedParts, zonedDateKey } from "./zonedTime.js";

describe("zonedTimeToUtc / utcToZonedParts", () => {
  it("round-trips a plain winter date in America/Los_Angeles (UTC-8)", () => {
    const utc = zonedTimeToUtc("America/Los_Angeles", 2026, 1, 15, 9, 0);
    expect(utc.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    const parts = utcToZonedParts("America/Los_Angeles", utc);
    expect(parts).toMatchObject({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 });
  });

  it("round-trips a summer date in America/Los_Angeles (UTC-7, daylight saving)", () => {
    const utc = zonedTimeToUtc("America/Los_Angeles", 2026, 7, 15, 9, 0);
    expect(utc.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("handles the DST spring-forward transition correctly (2026-03-08 in the US)", () => {
    const beforeDst = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 1, 9, 0);
    const afterDst = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 15, 9, 0);
    // Same local wall time, but the UTC offset shifted by one hour across the boundary.
    expect(beforeDst.getUTCHours()).toBe(17); // UTC-8
    expect(afterDst.getUTCHours()).toBe(16); // UTC-7
  });

  it("computes the correct weekday for a given business-local date", () => {
    // 2026-03-15 is a Sunday.
    const utc = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 15, 12, 0);
    expect(utcToZonedParts("America/Los_Angeles", utc).weekday).toBe(0);
    // 2026-03-16 is a Monday.
    const utc2 = zonedTimeToUtc("America/Los_Angeles", 2026, 3, 16, 12, 0);
    expect(utcToZonedParts("America/Los_Angeles", utc2).weekday).toBe(1);
  });

  it("works correctly for a non-US timezone with no DST (Asia/Manila, UTC+8)", () => {
    const utc = zonedTimeToUtc("Asia/Manila", 2026, 6, 1, 14, 0);
    expect(utc.toISOString()).toBe("2026-06-01T06:00:00.000Z");
  });
});

describe("zonedDateKey", () => {
  it("returns the business-local calendar date, which can differ from the UTC date near midnight", () => {
    // 2026-01-15T09:00Z is still 2026-01-15 01:00 local in Los Angeles (UTC-8) — same day here,
    // but 2026-01-15T02:00Z is 2026-01-14 18:00 local — the previous local day.
    expect(zonedDateKey("America/Los_Angeles", new Date("2026-01-15T02:00:00Z"))).toBe("2026-01-14");
    expect(zonedDateKey("America/Los_Angeles", new Date("2026-01-15T20:00:00Z"))).toBe("2026-01-15");
  });
});
