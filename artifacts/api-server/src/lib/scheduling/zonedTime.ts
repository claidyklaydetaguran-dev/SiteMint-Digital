// Dependency-free IANA-timezone math for the scheduling engine. Node ships
// full ICU/tz data, so `Intl.DateTimeFormat` alone gives correct, DST-aware
// offsets for any named zone at any instant — no date-fns-tz/luxon needed.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 (Sunday) - 6 (Saturday), in the target timezone's local calendar day. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
}

/** Breaks a UTC instant into its calendar/clock parts as observed in `timeZone`. */
export function utcToZonedParts(timeZone: string, utcDate: Date): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/**
 * Converts a local wall-clock date/time in `timeZone` to the correct UTC
 * instant, handling DST transitions. Uses a two-pass correction: an initial
 * guess treating the wall time as UTC, then adjusts by the actual offset
 * observed at that guess (and re-checks once more in case the offset itself
 * changes near a DST boundary).
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 2; i++) {
    const observed = utcToZonedParts(timeZone, guess);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0);
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diffMs = wantedAsUtc - observedAsUtc;
    if (diffMs === 0) break;
    guess.setTime(guess.getTime() + diffMs);
  }
  return guess;
}

/** YYYY-MM-DD in the given timezone for a UTC instant. */
export function zonedDateKey(timeZone: string, utcDate: Date): string {
  const p = utcToZonedParts(timeZone, utcDate);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Parses a "YYYY-MM-DD" string into {year, month, day} — throws on anything else. */
export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: "${dateKey}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
