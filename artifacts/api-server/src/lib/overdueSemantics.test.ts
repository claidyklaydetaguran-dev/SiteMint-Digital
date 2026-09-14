/**
 * What "overdue" means, pinned.
 *
 * The owner challenged a claim in an earlier report — "a task due 09:00 isn't
 * overdue that afternoon" — and was right to. `crm_tasks.due_date` is a
 * `timestamp with time zone`, the composer collects a time with a
 * `datetime-local` input, and My Day displays that time back ("Today 14:30").
 * Comparing calendar days only meant somebody who deliberately set 09:00 was
 * told their task was fine all afternoon, while its own row showed the time
 * they had chosen. The explanation offered for that behaviour described a
 * design nobody had picked; it was a limitation dressed as an intention.
 *
 * The opposite rule is not simply right either. A bare date entered through a
 * datetime input is stored at local midnight, so `dueAt < now` would make every
 * date-only task overdue one minute into the day it is due — the louder and
 * more annoying of the two failures.
 *
 * So: midnight local means date-only (the day must end); any other local time
 * means timed (the instant must pass). These tests hold both halves, and the
 * daylight-saving cases, because a rule about time that has never been run
 * across a transition is a guess.
 *
 * Pure — no database, no clock mocking.
 */
import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgresql://127.0.0.1:1/never_connected";

const { isOverdueInZone, localClockTime, localCalendarDay } =
  await import("./automationSweep.js");

const LONDON = "Europe/London";
const MANILA = "Asia/Manila";
const LA = "America/Los_Angeles";

describe("timed deadlines", () => {
  it("is overdue once the chosen time has passed, not at the end of the day", () => {
    // The case the owner questioned. 09:00 London, checked at 14:00 London.
    const due = new Date("2026-09-14T09:00:00+01:00");
    const afternoon = new Date("2026-09-14T14:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, afternoon)).toBe(true);
  });

  it("is not overdue one minute before the chosen time", () => {
    const due = new Date("2026-09-14T09:00:00+01:00");
    const justBefore = new Date("2026-09-14T08:59:00+01:00");
    expect(isOverdueInZone(LONDON, due, justBefore)).toBe(false);
  });
});

describe("date-only deadlines", () => {
  it("is NOT overdue during the day it is due", () => {
    // Stored at local midnight — what a bare date looks like through a
    // datetime input. Overdue at 00:01 would be a false alarm on the very day
    // the person has to do it.
    const due = new Date("2026-09-14T00:00:00+01:00");
    const duringTheDay = new Date("2026-09-14T16:30:00+01:00");
    expect(isOverdueInZone(LONDON, due, duringTheDay)).toBe(false);
  });

  it("is overdue once the day has ended", () => {
    const due = new Date("2026-09-14T00:00:00+01:00");
    const nextMorning = new Date("2026-09-15T08:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, nextMorning)).toBe(true);
  });
});

describe("the zone that decides is the person's own", () => {
  it("reads midnight in the assignee's zone, not UTC", () => {
    // 2026-09-14T00:00+08:00 in Manila is 2026-09-13T16:00Z. Judged in UTC it
    // would look like a 16:00 timed deadline and be treated as timed; judged in
    // Manila it is midnight and therefore date-only.
    const due = new Date("2026-09-14T00:00:00+08:00");
    expect(localClockTime(MANILA, due)).toBe("00:00");
    expect(localClockTime("UTC", due)).toBe("16:00");

    const duringTheDay = new Date("2026-09-14T15:00:00+08:00");
    expect(isOverdueInZone(MANILA, due, duringTheDay)).toBe(false);
  });

  it("can treat one stored instant as date-only for one person and timed for another", () => {
    // A real wrinkle of the midnight heuristic, worth pinning rather than
    // leaving to be discovered: "is this a date-only deadline" is answered in
    // the viewer's zone, so the same row can be both.
    //
    // 2026-09-14T00:00+08:00 is midnight in Manila and 09:00 the previous
    // morning in Los Angeles.
    const due = new Date("2026-09-14T00:00:00+08:00");
    expect(localClockTime(MANILA, due)).toBe("00:00");   // date-only here
    expect(localClockTime(LA, due)).toBe("09:00");       // timed here

    const instant = new Date("2026-09-14T10:00:00Z");
    // Manila: still the 14th, and the day has not ended → not overdue.
    expect(isOverdueInZone(MANILA, due, instant)).toBe(false);
    // Los Angeles: a 09:00 deadline that passed yesterday → overdue.
    expect(isOverdueInZone(LA, due, instant)).toBe(true);

    // This is coherent rather than arbitrary: a task has one assignee, and the
    // question being answered is "is this overdue for the person responsible",
    // which is decided in that person's zone throughout.
  });
});

describe("daylight saving", () => {
  it("handles the spring-forward day, which has no 02:00 in London", () => {
    // 2026-03-29 is the UK transition. A task due 09:00 that morning is a real
    // instant regardless, and the afternoon comparison is instant-to-instant.
    const due = new Date("2026-03-29T09:00:00+01:00");
    const afternoon = new Date("2026-03-29T15:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, afternoon)).toBe(true);
  });

  it("does not let a transition shift which calendar day a date-only task belongs to", () => {
    // The autumn transition repeats 01:30. A date-only deadline on that day
    // must still be "the 25th", not the 24th or 26th.
    const due = new Date("2026-10-25T00:00:00+01:00");
    expect(localCalendarDay(LONDON, due)).toBe("2026-10-25");
    const sameDayLater = new Date("2026-10-25T20:00:00Z");
    expect(isOverdueInZone(LONDON, due, sameDayLater)).toBe(false);
    const nextDay = new Date("2026-10-26T09:00:00Z");
    expect(isOverdueInZone(LONDON, due, nextDay)).toBe(true);
  });

  it("falls back to a usable zone rather than throwing on a bad one", () => {
    const due = new Date("2026-09-14T09:00:00Z");
    const later = new Date("2026-09-14T14:00:00Z");
    expect(() => isOverdueInZone("Not/AZone", due, later)).not.toThrow();
    expect(isOverdueInZone("Not/AZone", due, later)).toBe(true);
  });
});
