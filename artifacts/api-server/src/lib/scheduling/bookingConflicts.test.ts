// J3: the two ways a caller could be booked into a time that was already
// taken — the connected Google Calendar ignored on the voice path, and two
// overlapping requests with different start times both succeeding.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import { advisoryLockKeys, BOOKING_LOCK_NAMESPACE } from "./schedulingRepository.js";

const at = (iso: string) => new Date(iso);

describe("one booking lock per business", () => {
  it("overlapping requests with different starts take the same lock", () => {
    expect(advisoryLockKeys(2, at("2026-10-01T17:00:00Z"))).toEqual(advisoryLockKeys(2, at("2026-10-01T17:30:00Z")));
  });

  it("different businesses never wait on each other", () => {
    expect(advisoryLockKeys(2, at("2026-10-01T17:00:00Z"))).not.toEqual(advisoryLockKeys(3, at("2026-10-01T17:00:00Z")));
  });

  it("the key is a valid two-int4 pair with a fixed namespace", () => {
    const [firm, ns] = advisoryLockKeys(7, at("2026-10-01T17:00:00Z"));
    expect(firm).toBe(7);
    expect(ns).toBe(BOOKING_LOCK_NAMESPACE);
    expect(Number.isInteger(ns) && ns >= -(2 ** 31) && ns < 2 ** 31).toBe(true);
  });
});

describe("the voice booking path reads the connected calendar", () => {
  const dispatcher = readFileSync(new URL("../voice/tools/toolDispatcher.ts", import.meta.url), "utf8");
  const defaults = dispatcher.slice(dispatcher.indexOf("async function defaultDeps("), dispatcher.indexOf("async function defaultDeps(") + 3000);

  it("offers times only after merging the calendar's busy ranges", () => {
    expect(defaults).toContain("getFreeBusyProvider()");
    expect(defaults).toMatch(/repo\.getDayAvailability\(firmId, dateKey, typeId, now, freeBusy\)/);
  });

  it("re-checks the calendar inside the booking lock", () => {
    expect(defaults).toMatch(/"ai_receptionist", now, freeBusy, toolCallId, providerCallId/);
  });
});

describe("the day window covers every timezone", () => {
  const repo = readFileSync(new URL("./schedulingRepository.ts", import.meta.url), "utf8");
  it("starts the day before the date's UTC midnight", () => {
    const fn = repo.slice(repo.indexOf("export async function getDayAvailability("), repo.indexOf("export async function getDayAvailability(") + 1500);
    expect(fn).toMatch(/setUTCDate\(dayUtc\.getUTCDate\(\) - 1\)/);
  });
});
