/**
 * The tasks page counted what it could not show.
 *
 * Measured in a browser on 2026-09-16 against 22 real tasks: the header read
 * "22 active tasks" while the tabs held Today 0, Overdue 0, Future 2,
 * Completed 0. Twenty tasks — a project template's checklist, created with no
 * due date — matched no tab at all. They were counted in the header and
 * openable from nowhere.
 *
 * The property that prevents it recurring is the one the inline version never
 * had: EVERY task lands in exactly one bucket, and every bucket has a tab. The
 * first test states that directly; the rest pin the boundaries that made the
 * old `isLate` careful, so fixing the counting cannot quietly undo them.
 *
 * `now` is injected rather than read from the clock so 00:01 and 23:59 are
 * testable at any time of day.
 */
import { describe, expect, it } from "vitest";
import {
  TASK_TABS,
  TASK_TAB_LABELS,
  activeTaskCount,
  bucketCounts,
  bucketOf,
  isLate,
  tasksInTab,
  type BucketableTask,
} from "./taskBuckets.js";

const NOW = new Date(2026, 8, 16, 13, 0, 0); // 2026-09-16, 13:00 local
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).toISOString();

const task = (over: Partial<BucketableTask> = {}): BucketableTask =>
  ({ status: "pending", dueDate: null, dueKind: "date", ...over });

describe("every task is in exactly one bucket", () => {
  it("puts an undated task somewhere reachable instead of nowhere", () => {
    // The defect itself: twenty of twenty-two tasks looked like this.
    expect(bucketOf(task({ dueDate: null }), NOW)).toBe("undated");
  });

  it("assigns a bucket to every shape of task, so none can be counted but unreachable", () => {
    const everyShape: BucketableTask[] = [
      task({ dueDate: null }),
      task({ dueDate: null, status: "completed" }),
      task({ dueDate: at(2026, 8, 16, 9, 0) }),
      task({ dueDate: at(2026, 8, 16, 16, 0), dueKind: "time" }),
      task({ dueDate: at(2026, 8, 15) }),
      task({ dueDate: at(2026, 8, 20) }),
      task({ dueDate: at(2026, 8, 20), status: "completed" }),
      task({ dueDate: undefined }),
    ];
    for (const t of everyShape) {
      expect(TASK_TABS).toContain(bucketOf(t, NOW));
    }
    // And the buckets partition the set: the counts sum to the whole.
    const counts = bucketCounts(everyShape, NOW);
    const summed = TASK_TABS.reduce((n, tab) => n + counts[tab], 0);
    expect(summed).toBe(everyShape.length);
  });

  it("every bucket has a label, so a bucket can never exist without a tab to open it", () => {
    for (const tab of TASK_TABS) {
      expect(TASK_TAB_LABELS[tab]).toBeTruthy();
    }
  });
});

describe("the header figure equals what the tabs can reach", () => {
  it("counts the undated tasks that the old header counted and the old tabs hid", () => {
    const tasks = [
      ...Array.from({ length: 20 }, () => task({ dueDate: null })),
      task({ dueDate: at(2026, 8, 18) }),
      task({ dueDate: at(2026, 8, 20) }),
    ];
    // The old page said 22 and could show 2. Now the figure and the tabs agree.
    expect(activeTaskCount(tasks, NOW)).toBe(22);
    const reachable = TASK_TABS.filter((t) => t !== "completed")
      .reduce((n, tab) => n + tasksInTab(tasks, tab, NOW).length, 0);
    expect(reachable).toBe(22);
  });

  it("excludes completed tasks from the active figure but still lets them be opened", () => {
    const tasks = [task({ status: "completed" }), task({ dueDate: null })];
    expect(activeTaskCount(tasks, NOW)).toBe(1);
    expect(tasksInTab(tasks, "completed", NOW)).toHaveLength(1);
  });
});

describe("the deadline boundaries the old code got right, kept right", () => {
  it("a day-deadline earlier today is not overdue all morning", () => {
    const t = task({ dueDate: at(2026, 8, 16, 9, 0), dueKind: "date" });
    expect(isLate(t, NOW)).toBe(false);
    expect(bucketOf(t, NOW)).toBe("due-today");
  });

  it("a timed deadline that has passed today IS overdue", () => {
    const t = task({ dueDate: at(2026, 8, 16, 11, 0), dueKind: "time" });
    expect(isLate(t, NOW)).toBe(true);
    expect(bucketOf(t, NOW)).toBe("overdue");
  });

  it("a timed deadline later today is not overdue yet", () => {
    const t = task({ dueDate: at(2026, 8, 16, 16, 0), dueKind: "time" });
    expect(isLate(t, NOW)).toBe(false);
    expect(bucketOf(t, NOW)).toBe("due-today");
  });

  it("a task due at 00:01 today is not overdue at 00:01", () => {
    const justAfterMidnight = new Date(2026, 8, 16, 0, 1, 0);
    const t = task({ dueDate: at(2026, 8, 16, 0, 1), dueKind: "time" });
    expect(isLate(t, justAfterMidnight)).toBe(false);
    expect(bucketOf(t, justAfterMidnight)).toBe("due-today");
  });

  it("yesterday's day-deadline is overdue", () => {
    const t = task({ dueDate: at(2026, 8, 15) });
    expect(isLate(t, NOW)).toBe(true);
    expect(bucketOf(t, NOW)).toBe("overdue");
  });

  it("a completed task is never overdue, however old its deadline", () => {
    const t = task({ dueDate: at(2025, 0, 1), status: "completed" });
    expect(isLate(t, NOW)).toBe(false);
    expect(bucketOf(t, NOW)).toBe("completed");
  });

  it("an undated task is never overdue, and never silently dropped", () => {
    const t = task({ dueDate: null });
    expect(isLate(t, NOW)).toBe(false);
    expect(bucketOf(t, NOW)).toBe("undated");
  });
});
