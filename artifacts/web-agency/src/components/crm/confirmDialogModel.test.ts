import { describe, expect, it } from "vitest";
import {
  CONNECTION_FAILURE_MESSAGE,
  GENERIC_FAILURE_MESSAGE,
  addDaysToDateKey,
  canDismiss,
  confirmReducer,
  describeActionFailure,
  dueDateIso,
  evaluateConfirmInputs,
  formatDateKey,
  initialFocusTarget,
  integerProblem,
  isCalendarDate,
  localDateKey,
  parsePositiveInteger,
  reasonProblem,
  refusalMessage,
  runConfirmAction,
  dateProblem,
  INITIAL_CONFIRM_PHASE,
  type ConfirmPhase,
} from "./confirmDialogModel.js";

describe("reasons", () => {
  it("requires something to be typed", () => {
    expect(reasonProblem("   ", { label: "Why" })).toBe("This is required.");
  });

  it("holds out for the minimum length", () => {
    expect(reasonProblem("no", { label: "Why", minLength: 3 })).toBe("Write at least 3 characters.");
    expect(reasonProblem("  nope  ", { label: "Why", minLength: 3 })).toBeNull();
  });

  it("refuses more than the server would store", () => {
    expect(reasonProblem("x".repeat(11), { label: "Why", maxLength: 10 })).toBe(
      "Keep this to 10 characters or fewer.",
    );
  });
});

describe("calendar dates", () => {
  it("accepts a real date and rejects one that only looks real", () => {
    expect(isCalendarDate("2026-09-30")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-9-30")).toBe(false);
    expect(isCalendarDate("30/09/2026")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });

  it("reads today from the person's own clock", () => {
    expect(localDateKey(new Date(2026, 8, 16, 23, 30))).toBe("2026-09-16");
  });

  it("adds days across months and years", () => {
    expect(addDaysToDateKey("2026-09-16", 14)).toBe("2026-09-30");
    expect(addDaysToDateKey("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDaysToDateKey("2028-02-15", 14)).toBe("2028-02-29");
  });

  it("says what is wrong with a date rather than refusing silently", () => {
    const spec = { kind: "date", label: "Due date", min: "2026-09-16" } as const;
    expect(dateProblem("", spec)).toBe("Pick a due date.");
    expect(dateProblem("2026-02-30", spec)).toBe("Enter a real date, like 2026-09-30.");
    expect(dateProblem("2026-09-15", spec)).toBe(`Pick a date on or after ${formatDateKey("2026-09-16")}.`);
    expect(dateProblem("2026-09-16", spec)).toBeNull();
  });

  it("formats a date the way the message reads it", () => {
    expect(formatDateKey("2026-09-30", "en-US")).toBe("Sep 30, 2026");
  });

  it("turns a due date into an instant, and a bad one into null instead of throwing", () => {
    const iso = dueDateIso("2026-09-30");
    expect(iso).not.toBeNull();
    expect(new Date(String(iso)).getHours()).toBe(17);
    // The defect this replaces: `new Date("nonsense").toISOString()` threw.
    expect(dueDateIso("nonsense")).toBeNull();
    expect(dueDateIso("2026-02-30")).toBeNull();
    expect(dueDateIso("")).toBeNull();
  });
});

describe("record ids", () => {
  const spec = { kind: "integer", label: "Lead id" } as const;

  it("insists on a positive whole number", () => {
    expect(integerProblem("", spec)).toBe("Enter the lead id.");
    expect(integerProblem("abc", spec)).toBe("Use digits only — a whole number, like 42.");
    expect(integerProblem("1.5", spec)).toBe("Use digits only — a whole number, like 42.");
    expect(integerProblem("-3", spec)).toBe("Use digits only — a whole number, like 42.");
    expect(integerProblem("0", spec)).toBe("Ids start at 1.");
    expect(integerProblem("9999999999", spec)).toBe("That number is too large to be a record id.");
    expect(integerProblem(" 42 ", spec)).toBeNull();
  });

  it("parses only what it accepted", () => {
    expect(parsePositiveInteger(" 42 ")).toBe(42);
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("4e2")).toBeNull();
    // `Number("")` is 0 and `Number(" ")` is 0 — the bug the old prompt had.
    expect(parsePositiveInteger("")).toBeNull();
  });
});

describe("what unlocks Confirm", () => {
  const state = { reason: "", acknowledged: false, value: "" };

  it("is unlocked when nothing was asked for", () => {
    expect(evaluateConfirmInputs({}, state).ok).toBe(true);
  });

  it("stays locked until the reason is long enough", () => {
    const spec = { reason: { label: "Why", minLength: 3 } };
    expect(evaluateConfirmInputs(spec, state).ok).toBe(false);
    expect(evaluateConfirmInputs(spec, { ...state, reason: "ok" }).ok).toBe(false);
    expect(evaluateConfirmInputs(spec, { ...state, reason: "because" }).ok).toBe(true);
  });

  it("stays locked until the box is ticked", () => {
    const spec = { acknowledgement: "I understand" };
    const verdict = evaluateConfirmInputs(spec, state);
    expect(verdict.ok).toBe(false);
    expect(verdict.acknowledgementMissing).toBe(true);
    expect(evaluateConfirmInputs(spec, { ...state, acknowledged: true }).ok).toBe(true);
  });

  it("requires every part that was asked for", () => {
    const spec = {
      reason: { label: "Why", minLength: 3 },
      acknowledgement: "I understand",
      field: { kind: "integer", label: "Lead id" } as const,
    };
    expect(evaluateConfirmInputs(spec, { reason: "because", acknowledged: true, value: "" }).ok).toBe(false);
    expect(evaluateConfirmInputs(spec, { reason: "because", acknowledged: true, value: "7" }).ok).toBe(true);
  });
});

describe("initialFocusTarget", () => {
  it("focuses what it asks for, and otherwise the least destructive button", () => {
    expect(initialFocusTarget({ field: { kind: "date", label: "Due date" } })).toBe("field");
    expect(initialFocusTarget({ reason: { label: "Why" } })).toBe("reason");
    expect(initialFocusTarget({})).toBe("cancel");
    expect(initialFocusTarget({ acknowledgement: "I understand" })).toBe("cancel");
  });
});

describe("the dialog's phases", () => {
  const working: ConfirmPhase = { kind: "working" };

  it("cannot be dismissed while the action is in flight", () => {
    expect(canDismiss(INITIAL_CONFIRM_PHASE)).toBe(true);
    expect(canDismiss(working)).toBe(false);
    expect(confirmReducer(working, { type: "dismiss" })).toBe(working);
  });

  it("ignores a second submit while the first is running", () => {
    expect(confirmReducer(working, { type: "submit" })).toBe(working);
  });

  it("keeps the dialog open and shows why when the action fails", () => {
    const after = confirmReducer(working, { type: "failed", message: "The deal could not be deleted." });
    expect(after).toEqual({ kind: "ready", error: "The deal could not be deleted." });
  });

  it("closes as confirmed only on success", () => {
    expect(confirmReducer(working, { type: "succeeded" })).toEqual({ kind: "finished", confirmed: true });
    expect(confirmReducer(INITIAL_CONFIRM_PHASE, { type: "dismiss" })).toEqual({
      kind: "finished",
      confirmed: false,
    });
  });

  it("clears a stale error once something is edited", () => {
    const failed: ConfirmPhase = { kind: "ready", error: "Nope." };
    expect(confirmReducer(failed, { type: "edited" })).toEqual({ kind: "ready", error: null });
    // No pointless new object when there is nothing to clear.
    expect(confirmReducer(INITIAL_CONFIRM_PHASE, { type: "edited" })).toBe(INITIAL_CONFIRM_PHASE);
  });
});

describe("running the action", () => {
  const input = { reason: "", value: "" };

  it("reports success", async () => {
    expect(await runConfirmAction(async () => undefined, input)).toEqual({ ok: true });
  });

  it("shows the message an action threw on purpose", async () => {
    const action = () => {
      throw new Error("That quote is \"draft\".");
    };
    expect(await runConfirmAction(action, input)).toEqual({
      ok: false,
      message: 'That quote is "draft".',
    });
  });

  it("explains a dropped connection in those terms", async () => {
    const action = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await runConfirmAction(action, input)).toEqual({
      ok: false,
      message: CONNECTION_FAILURE_MESSAGE,
    });
  });

  it("does not put a programming fault in front of a person", async () => {
    expect(describeActionFailure(new TypeError("x.map is not a function"))).toBe(GENERIC_FAILURE_MESSAGE);
    expect(describeActionFailure(new RangeError("Invalid time value"))).toBe(GENERIC_FAILURE_MESSAGE);
    expect(describeActionFailure({ nope: true })).toBe(GENERIC_FAILURE_MESSAGE);
  });

  it("keeps the API client's own wording", () => {
    class AdminApiError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "AdminApiError";
      }
    }
    expect(describeActionFailure(new AdminApiError("Your session has ended."))).toBe(
      "Your session has ended.",
    );
  });
});

describe("refusalMessage", () => {
  it("prefers the server's sentence", async () => {
    const response = { status: 409, json: async () => ({ error: "Only a paused campaign can be resumed." }) };
    expect(await refusalMessage(response, "It could not be resumed.")).toBe(
      "Only a paused campaign can be resumed.",
    );
  });

  it("falls back with the status when the body says nothing useful", async () => {
    expect(await refusalMessage({ status: 500, json: async () => ({}) }, "It failed.")).toBe("It failed. (500)");
    expect(
      await refusalMessage({ status: 502, json: () => Promise.reject(new Error("no body")) }, "It failed."),
    ).toBe("It failed. (502)");
  });
});
