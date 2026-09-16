/**
 * Which tab a task belongs to, and how many are in each.
 *
 * This was inline in `CrmTasks.tsx` and it counted what it could not show.
 * Measured in a browser on 2026-09-16 against 22 real tasks: the header read
 * "22 active tasks" while the four tabs held Today 0, Overdue 0, Future 2,
 * Completed 0. Twenty tasks were counted and reachable from nowhere.
 *
 * The cause was that every tab required a due date — `due-today` and `upcoming`
 * both test `due && ...`, `overdue` tests `isLate` which returns false without
 * one, and `completed` tests the status — while the header counted every task
 * that was not completed. A task with no due date (a project template's
 * checklist, which is how twenty of those twenty-two were created) matched no
 * tab at all.
 *
 * The fix is a fifth bucket rather than a smaller number. The tasks are real and
 * somebody has to be able to open them; shrinking the header to match the tabs
 * would have made the figure honest by hiding the work, which is the same
 * dishonesty pointed the other way.
 *
 * Pure, and over a `now` passed in rather than read from the clock, so the
 * boundary cases (a deadline at 00:01, one at 23:59, one with no date at all)
 * are testable without waiting for a particular time of day.
 */

export interface BucketableTask {
  dueDate?: string | null;
  dueKind?: string | null;
  status: string;
}

export const TASK_TABS = ["due-today", "overdue", "upcoming", "undated", "completed"] as const;
export type TaskTab = (typeof TASK_TABS)[number];

export const TASK_TAB_LABELS: Record<TaskTab, string> = {
  "due-today": "Today's Tasks",
  overdue: "Overdue",
  upcoming: "Future",
  undated: "No date",
  completed: "Completed",
};

/**
 * What the deadline means, from the task's own `dueKind` — never guessed from
 * its clock time. Anything but the word "time" is a day, matching the server's
 * fallback for rows written before the column existed.
 */
export const isTimedDue = (t: BucketableTask): boolean => t.dueKind === "time";

/**
 * Late by the task's own kind: a moment is late once it has passed, a day is
 * late only once the day has ended. Comparing every deadline to the start of
 * today called a task due at 16:00 today "overdue" all morning; comparing every
 * deadline to this instant called a task due "today" overdue at 00:01.
 */
export function isLate(t: BucketableTask, now: Date): boolean {
  const due = t.dueDate ? new Date(t.dueDate) : null;
  if (!due || t.status === "completed") return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return isTimedDue(t) ? due < now : due < todayStart;
}

/**
 * The one bucket a task belongs to. Every task lands in exactly one, which is
 * the property the old inline version lacked: `undated` catches what the four
 * dated tabs cannot, so no task is countable without being openable.
 */
export function bucketOf(t: BucketableTask, now: Date): TaskTab {
  if (t.status === "completed") return "completed";
  const due = t.dueDate ? new Date(t.dueDate) : null;
  if (!due) return "undated";
  if (isLate(t, now)) return "overdue";
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  if (due >= todayStart && due < todayEnd) return "due-today";
  return "upcoming";
}

export function tasksInTab<T extends BucketableTask>(tasks: readonly T[], tab: TaskTab, now: Date): T[] {
  return tasks.filter((t) => bucketOf(t, now) === tab);
}

export function bucketCounts(tasks: readonly BucketableTask[], now: Date): Record<TaskTab, number> {
  const counts = { "due-today": 0, overdue: 0, upcoming: 0, undated: 0, completed: 0 } as Record<TaskTab, number>;
  for (const t of tasks) counts[bucketOf(t, now)] += 1;
  return counts;
}

/**
 * The header figure, defined as "what the tabs can reach between them" rather
 * than as an independent count of the array. Stated this way the header cannot
 * drift from the tabs again: if a task is counted here it is in some bucket, and
 * every bucket has a tab.
 */
export function activeTaskCount(tasks: readonly BucketableTask[], now: Date): number {
  return tasks.filter((t) => bucketOf(t, now) !== "completed").length;
}
