/**
 * What "overdue" means, pinned.
 *
 * ── Why this file changed ───────────────────────────────────────────────────
 *
 * It used to pin a heuristic: local midnight meant "date-only, the day must
 * end", any other local time meant "timed, the instant must pass". The owner
 * rejected that, correctly, on two counts.
 *
 * First, it could not represent an explicit midnight deadline. Somebody who
 * genuinely means "by 00:00 Friday" was silently given until Friday ended,
 * because their deadline was indistinguishable from a bare date. There was no
 * way to say the thing, so the system decided it could not have been meant.
 *
 * Second — and this file used to have a test CELEBRATING it, under the name
 * "can treat one stored instant as date-only for one person and timed for
 * another" — the classification was answered in the READER's timezone. The
 * same row was a date in Manila and a time in California. That test is gone,
 * and its replacement ("one stored instant means the same thing to everyone")
 * asserts the opposite, because the old behaviour was the defect. The comment
 * defending it — "this is coherent rather than arbitrary" — was true only of
 * the narrow case where a task has exactly one assignee, and was doing the work
 * of excusing a representation that could not hold an intention.
 *
 * So intent is STORED: `crm_tasks.due_kind` is "date" or "time", chosen by
 * whoever set the deadline, and `isOverdueInZone` reads it instead of guessing.
 * A kind that is missing or unrecognised resolves through the one named
 * fallback, `CRM_TASK_DUE_KIND_FALLBACK` — "date", which is how every row
 * written before the column behaved.
 *
 * The daylight-saving cases stay, unchanged in intent: a rule about time that
 * has never been run across a transition is a guess.
 *
 * Pure — no database, no clock mocking.
 */
import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgresql://127.0.0.1:1/never_connected";

const { isOverdueInZone, localClockTime, localCalendarDay } =
  await import("./automationSweep.js");
const { CRM_TASK_DUE_KIND_FALLBACK, resolveCrmTaskDueKind } =
  await import("@workspace/db");

const LONDON = "Europe/London";
const MANILA = "Asia/Manila";
const LA = "America/Los_Angeles";

describe("an explicit midnight deadline — the case the old rule could not hold", () => {
  it("is overdue at 00:01 on its own day", () => {
    // The owner's example, and the whole reason the column exists. "By 00:00
    // Friday" is a real thing to ask for. Under the midnight heuristic this
    // task was indistinguishable from "due Friday" and stayed comfortable all
    // day; now it is late one minute in, which is what was asked for.
    const due = new Date("2026-09-18T00:00:00+01:00");
    const oneMinuteLater = new Date("2026-09-18T00:01:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", oneMinuteLater)).toBe(true);
  });

  it("is not overdue one minute before it", () => {
    const due = new Date("2026-09-18T00:00:00+01:00");
    const justBefore = new Date("2026-09-17T23:59:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", justBefore)).toBe(false);
  });

  it("is a different answer from a date-only deadline on the same instant", () => {
    // One instant, two intentions, two answers. This pair is the feature.
    const due = new Date("2026-09-18T00:00:00+01:00");
    const thatAfternoon = new Date("2026-09-18T16:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", thatAfternoon)).toBe(true);
    expect(isOverdueInZone(LONDON, due, "date", thatAfternoon)).toBe(false);
  });
});

describe("timed deadlines", () => {
  it("is overdue once the chosen time has passed, not at the end of the day", () => {
    // 09:00 London, checked at 14:00 London.
    const due = new Date("2026-09-14T09:00:00+01:00");
    const afternoon = new Date("2026-09-14T14:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", afternoon)).toBe(true);
  });

  it("is not overdue one minute before the chosen time", () => {
    const due = new Date("2026-09-14T09:00:00+01:00");
    const justBefore = new Date("2026-09-14T08:59:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", justBefore)).toBe(false);
  });
});

describe("date-only deadlines", () => {
  it("is NOT overdue during the day it is due", () => {
    const due = new Date("2026-09-14T00:00:00+01:00");
    const duringTheDay = new Date("2026-09-14T16:30:00+01:00");
    expect(isOverdueInZone(LONDON, due, "date", duringTheDay)).toBe(false);
  });

  it("is overdue once the day has ended", () => {
    const due = new Date("2026-09-14T00:00:00+01:00");
    const nextMorning = new Date("2026-09-15T08:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, "date", nextMorning)).toBe(true);
  });

  it("ignores the clock time it happens to carry", () => {
    // A day-shaped deadline that landed on 14:30 — because a generator stored
    // "three days from now" — is still about the day. The old rule read that
    // clock time and called it a 14:30 appointment nobody made.
    const due = new Date("2026-09-14T14:30:00+01:00");
    const laterThatDay = new Date("2026-09-14T23:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, "date", laterThatDay)).toBe(false);
    expect(isOverdueInZone(LONDON, due, "date", new Date("2026-09-15T00:30:00+01:00"))).toBe(true);
  });
});

describe("one stored instant means the same thing to everyone", () => {
  it("does not flip between date-only and timed with the viewer's zone", () => {
    // REPLACES "can treat one stored instant as date-only for one person and
    // timed for another", which asserted the bug.
    //
    // 2026-09-14T00:00+08:00 is midnight in Manila and 09:00 the previous
    // morning in Los Angeles, so the old heuristic read it as two different
    // KINDS of deadline depending on who asked. The clock times still differ —
    // that is arithmetic, not opinion — but the kind no longer follows them.
    const due = new Date("2026-09-14T00:00:00+08:00");
    expect(localClockTime(MANILA, due)).toBe("00:00");
    expect(localClockTime(LA, due)).toBe("09:00");

    // Stored as a moment, it is a moment for both of them: it passed, so it is
    // late, and the two agree.
    const instant = new Date("2026-09-14T10:00:00Z");
    expect(isOverdueInZone(MANILA, due, "time", instant)).toBe(true);
    expect(isOverdueInZone(LA, due, "time", instant)).toBe(true);
  });

  it("still resolves a date-only deadline in the assignee's own day", () => {
    // Zone handling is KEPT, and this is where it belongs: a day is a local
    // thing, so "has the day ended" is asked where the person responsible is.
    // At 10:00Z on the 14th it is still the 14th in Manila (18:00) and the
    // evening of the 13th in California — so the Manila deadline has not run
    // out and the Californian one has not started.
    const dueManila = new Date("2026-09-14T00:00:00+08:00");
    const duePacific = new Date("2026-09-14T00:00:00-07:00");
    const instant = new Date("2026-09-14T10:00:00Z");

    expect(isOverdueInZone(MANILA, dueManila, "date", instant)).toBe(false);
    expect(isOverdueInZone(LA, duePacific, "date", instant)).toBe(false);

    // Nine hours on, Manila's 14th is over and California's has barely begun.
    const later = new Date("2026-09-14T19:00:00Z");
    expect(isOverdueInZone(MANILA, dueManila, "date", later)).toBe(true);
    expect(isOverdueInZone(LA, duePacific, "date", later)).toBe(false);
  });

  it("consults no zone at all for a timed deadline", () => {
    // An instant is the same everywhere, so the zone cannot change the answer.
    // Asserted rather than assumed, because "it also takes a zone" is exactly
    // the kind of parameter that quietly grows a meaning.
    const due = new Date("2026-09-14T09:00:00Z");
    const after = new Date("2026-09-14T09:01:00Z");
    for (const zone of [LONDON, MANILA, LA, "UTC", "Pacific/Kiritimati"]) {
      expect(isOverdueInZone(zone, due, "time", after), zone).toBe(true);
    }
  });
});

describe("the fallback for a kind nobody set", () => {
  it("is 'date', and it is named rather than accidental", () => {
    expect(CRM_TASK_DUE_KIND_FALLBACK).toBe("date");
    for (const unset of [null, undefined, "", "datetime", "DATE", 7, {}]) {
      expect(resolveCrmTaskDueKind(unset), String(unset)).toBe("date");
    }
    expect(resolveCrmTaskDueKind("date")).toBe("date");
    expect(resolveCrmTaskDueKind("time")).toBe("time");
  });

  it("makes a legacy row behave the way it behaved before the column existed", () => {
    // A row written at local midnight was date-only under the old rule, and is
    // date-only under the new one without anybody touching it. That is the
    // property the backfill leans on: nothing silently becomes late.
    const due = new Date("2026-09-14T00:00:00+01:00");
    const duringTheDay = new Date("2026-09-14T16:30:00+01:00");
    expect(isOverdueInZone(LONDON, due, null, duringTheDay)).toBe(false);
    expect(isOverdueInZone(LONDON, due, undefined, duringTheDay)).toBe(false);
  });
});

describe("daylight saving", () => {
  it("handles the spring-forward day, which has no 02:00 in London", () => {
    // 2026-03-29 is the UK transition. A task due 09:00 that morning is a real
    // instant regardless, and the comparison is instant-to-instant.
    const due = new Date("2026-03-29T09:00:00+01:00");
    const afternoon = new Date("2026-03-29T15:00:00+01:00");
    expect(isOverdueInZone(LONDON, due, "time", afternoon)).toBe(true);
  });

  it("does not shorten the spring-forward day for a date-only deadline", () => {
    // The 29th is 23 hours long in London. A deadline of "the 29th" must still
    // last until the 30th begins, not run out an hour early.
    const due = new Date("2026-03-29T00:00:00Z");
    expect(localCalendarDay(LONDON, due)).toBe("2026-03-29");
    expect(isOverdueInZone(LONDON, due, "date", new Date("2026-03-29T22:30:00Z"))).toBe(false);
    expect(isOverdueInZone(LONDON, due, "date", new Date("2026-03-29T23:30:00Z"))).toBe(true);
  });

  it("does not let the autumn transition shift which day a date-only task belongs to", () => {
    // The autumn transition repeats 01:30, making the 25th 25 hours long. A
    // date-only deadline on that day must still be "the 25th".
    const due = new Date("2026-10-25T00:00:00+01:00");
    expect(localCalendarDay(LONDON, due)).toBe("2026-10-25");
    expect(isOverdueInZone(LONDON, due, "date", new Date("2026-10-25T20:00:00Z"))).toBe(false);
    expect(isOverdueInZone(LONDON, due, "date", new Date("2026-10-26T09:00:00Z"))).toBe(true);
  });

  it("is unaffected by a transition when the deadline is a moment", () => {
    // 01:30 on the 25th happens twice in London. Whichever of the two the
    // person meant, it is a single stored instant and passing it is passing it.
    const firstPass = new Date("2026-10-25T00:30:00Z");   // 01:30 BST
    const secondPass = new Date("2026-10-25T01:30:00Z");  // 01:30 GMT
    expect(isOverdueInZone(LONDON, firstPass, "time", secondPass)).toBe(true);
    expect(isOverdueInZone(LONDON, secondPass, "time", firstPass)).toBe(false);
  });

  it("falls back to a usable zone rather than throwing on a bad one", () => {
    const due = new Date("2026-09-14T00:00:00Z");
    const nextDay = new Date("2026-09-15T14:00:00Z");
    expect(() => isOverdueInZone("Not/AZone", due, "date", nextDay)).not.toThrow();
    expect(isOverdueInZone("Not/AZone", due, "date", nextDay)).toBe(true);
  });
});
