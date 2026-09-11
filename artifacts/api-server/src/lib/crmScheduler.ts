// ── M2: the CRM reminder engine ─────────────────────────────────────────────
//
// A durable job queue in PostgreSQL. The properties that matter, and why each
// one is here rather than assumed:
//
//  - Fires with the browser closed. Nothing about dispatch involves a client;
//    the worker ticks on the server.
//  - Survives a restart. Jobs are rows, not timers. A process that dies
//    mid-job leaves a `running` row whose lock expires and is reclaimed.
//  - Never double-sends. `dedupe_key` is UNIQUE, and claiming uses
//    `FOR UPDATE SKIP LOCKED` so two workers cannot take the same row.
//  - Timezone-correct. `run_at` is absolute UTC computed from the recipient's
//    IANA zone, so "9am" means 9am where that person actually is.
//  - Cancels and reschedules truthfully. Completing, reassigning or moving a
//    task cancels its pending reminder instead of letting a stale one fire.
//  - Failures are visible. Permanent failures stay queryable rather than
//    vanishing into logs.

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db, crmScheduledJobs, crmNotifications, crmTasks, crmStaff,
  crmProjects, crmProjectMilestones, crmAppointments, crmAppointmentAttendees,
  type CrmScheduledJob,
} from "@workspace/db";
import { trySendStaffMail } from "./staffMail.js";

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/** How long a claimed job may stay locked before another worker reclaims it. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const BATCH_SIZE = 20;
const TICK_MS = 30_000;

export const JOB_KINDS = ["task_reminder", "milestone_reminder", "daily_digest", "appointment_reminder"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

// ── Timezone helpers ────────────────────────────────────────────────────────
//
// Intl is the only correct way to do this without a dependency: it knows the
// real offset for a zone on a given date, including DST transitions, which a
// fixed offset never does.

/** The UTC offset (minutes) that `zone` had at `instant`. */
function zoneOffsetMinutes(zone: string, instant: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"]),
      Number(parts["hour"] === "24" ? "0" : parts["hour"]), Number(parts["minute"]), Number(parts["second"]),
    );
    return (asUtc - instant.getTime()) / 60_000;
  } catch {
    return 0; // unknown zone → treat as UTC rather than throwing
  }
}

export function isValidTimezone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

/**
 * The UTC instant at which it is `hour:minute` local time in `zone`, on the
 * local calendar day of `onDateUtc`.
 *
 * Computed by converging once: the offset is looked up at the approximate
 * answer, which is correct except for instants inside a DST shift, where the
 * second pass settles it.
 */
export function localTimeToUtc(zone: string, onDateUtc: Date, hour: number, minute = 0): Date {
  const local = new Date(onDateUtc.getTime() + zoneOffsetMinutes(zone, onDateUtc) * 60_000);
  const naive = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, 0, 0,
  );
  let guess = new Date(naive - zoneOffsetMinutes(zone, new Date(naive)) * 60_000);
  guess = new Date(naive - zoneOffsetMinutes(zone, guess) * 60_000);
  return guess;
}

/** Calendar-day boundaries in `zone`, returned as absolute UTC instants. */
export function localDayBounds(zone: string, now: Date = new Date()): { start: Date; end: Date } {
  const start = localTimeToUtc(zone, now, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ── Scheduling ──────────────────────────────────────────────────────────────

/**
 * Upserts a job on its dedupe key. Re-scheduling the same logical reminder
 * moves it rather than adding a second one, and a cancelled job is revived
 * rather than duplicated.
 */
export async function scheduleJob(args: {
  kind: JobKind;
  dedupeKey: string;
  runAt: Date;
  payload: Record<string, unknown>;
}): Promise<void> {
  await db.insert(crmScheduledJobs).values({
    kind: args.kind, dedupeKey: args.dedupeKey, runAt: args.runAt, payload: args.payload,
  }).onConflictDoUpdate({
    target: crmScheduledJobs.dedupeKey,
    set: {
      runAt: args.runAt,
      payload: args.payload,
      status: "pending",
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      cancelledAt: null,
      completedAt: null,
      lastError: null,
      updatedAt: new Date(),
    },
  });
}

/** Cancels a pending job. A job already completed is left alone. */
export async function cancelJob(dedupeKey: string): Promise<void> {
  await db.update(crmScheduledJobs)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(crmScheduledJobs.dedupeKey, dedupeKey),
      or(eq(crmScheduledJobs.status, "pending"), eq(crmScheduledJobs.status, "running")),
    ));
}

export const taskReminderKey = (taskId: number) => `task_reminder:${taskId}`;
export const milestoneReminderKey = (id: number) => `milestone_reminder:${id}`;
export const digestKey = (staffId: number, localDate: string) => `daily_digest:${staffId}:${localDate}`;

/**
 * Brings a task's reminder in line with its current state — the one function
 * every task write calls, so a completed, archived, unassigned or
 * reminder-cleared task can never leave a live reminder behind.
 */
export async function syncTaskReminder(taskId: number): Promise<void> {
  const [task] = await db.select().from(crmTasks).where(eq(crmTasks.id, taskId)).limit(1);
  if (!task) { await cancelJob(taskReminderKey(taskId)); return; }

  // A reminder time that has just passed still fires — somebody setting "remind
  // me at 9am" at 9:05 means now, not never. The 24h floor is what stops a
  // backlog of long-stale reminders from all firing at once after a deploy or
  // an import.
  const STALE_FLOOR_MS = 24 * 60 * 60 * 1000;
  const shouldFire = task.status !== "completed"
    && !task.archivedAt
    && task.assignedToStaffId != null
    && task.remindAt != null
    && task.remindAt.getTime() > Date.now() - STALE_FLOOR_MS;

  if (!shouldFire) { await cancelJob(taskReminderKey(taskId)); return; }

  await scheduleJob({
    kind: "task_reminder",
    dedupeKey: taskReminderKey(taskId),
    runAt: task.remindAt!,
    payload: { taskId, staffId: task.assignedToStaffId },
  });
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function notify(args: {
  staffId: number; kind: string; title: string; body?: string | null;
  href?: string | null; entityType?: string | null; entityId?: number | null;
}): Promise<void> {
  await db.insert(crmNotifications).values({
    staffId: args.staffId, kind: args.kind, title: args.title,
    body: args.body ?? null, href: args.href ?? null,
    entityType: args.entityType ?? null, entityId: args.entityId ?? null,
  });
}

/**
 * Email is opt-in per person and silently skipped when Resend is unconfigured
 * or test mode is on — a reminder must never fail because mail is not set up,
 * and a test run must never reach a real inbox.
 */
/**
 * Sends a reminder email for `job`, at most once per occurrence.
 *
 * Locking a job makes it run once; it does NOT make an external side effect
 * happen once. The dangerous window is: provider accepts → worker is killed →
 * lock expires → job reclaimed → message sent again. Two things close it:
 *
 *  1. `external_dispatched_at` is written and committed BEFORE the send, so a
 *     reclaimed job can see that a message was already handed over.
 *  2. The send carries a provider idempotency key derived from the job's
 *     dedupe key and its scheduled instant — stable across retries of this
 *     occurrence, different for the next one — so even a genuine double-send
 *     is collapsed by Resend rather than delivered twice.
 *
 * Documented limitation: if the provider accepts and the crash happens before
 * (1) commits, the retry re-sends with the same key and Resend still
 * de-duplicates; if Resend's idempotency window has expired by then, a
 * duplicate is possible. In-app notifications have no such window — they are
 * written in the same database as the job.
 */
async function maybeEmail(
  job: CrmScheduledJob, staffId: number, subject: string, text: string,
): Promise<void> {
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff?.reminderEmailEnabled || staff.status !== "active") return;

  const key = `${job.dedupeKey}:${job.runAt.toISOString()}`;
  await db.update(crmScheduledJobs)
    .set({ externalDispatchedAt: new Date() })
    .where(eq(crmScheduledJobs.id, job.id));

  // `trySendStaffMail` never throws and refuses to send while test mode is on.
  // The previous code called getResend() directly, which THROWS when
  // RESEND_API_KEY is unset — turning "this environment has no mail" into a
  // failed job that burned all five retries and then reported a false alarm.
  const outcome = await trySendStaffMail({ to: staff.email, subject, text, idempotencyKey: key });
  if (outcome.sent && outcome.providerId) {
    await db.update(crmScheduledJobs)
      .set({ externalRef: outcome.providerId })
      .where(eq(crmScheduledJobs.id, job.id));
  }
}

async function runTaskReminder(job: CrmScheduledJob): Promise<void> {
  const taskId = Number(job.payload["taskId"]);
  const [task] = await db.select().from(crmTasks).where(eq(crmTasks.id, taskId)).limit(1);
  // The task may have been completed or reassigned between scheduling and now.
  if (!task || task.status === "completed" || task.archivedAt || task.assignedToStaffId == null) return;

  const due = task.dueDate ? ` (due ${task.dueDate.toISOString().slice(0, 10)})` : "";
  await notify({
    staffId: task.assignedToStaffId,
    kind: "task_reminder",
    title: task.title,
    body: `Reminder for your task${due}.`,
    href: "/admin/crm/my-day",
    entityType: "task", entityId: task.id,
  });
  await maybeEmail(job, task.assignedToStaffId, `Reminder: ${task.title}`,
    `This is your SiteMint CRM reminder for "${task.title}"${due}.`);

  // A recurring task schedules its next occurrence only after this one fires,
  // so a paused or completed series cannot run away.
  if (task.recurrence && task.recurrence !== "none" && task.remindAt) {
    const next = new Date(task.remindAt);
    if (task.recurrence === "daily") next.setUTCDate(next.getUTCDate() + 1);
    else if (task.recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
    else if (task.recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else return;
    await db.update(crmTasks).set({ remindAt: next, updatedAt: new Date() }).where(eq(crmTasks.id, task.id));
    await scheduleJob({
      kind: "task_reminder", dedupeKey: taskReminderKey(task.id),
      runAt: next, payload: { taskId: task.id, staffId: task.assignedToStaffId },
    });
  }
}

async function runMilestoneReminder(job: CrmScheduledJob): Promise<void> {
  const milestoneId = Number(job.payload["milestoneId"]);
  const [m] = await db.select().from(crmProjectMilestones)
    .where(eq(crmProjectMilestones.id, milestoneId)).limit(1);
  if (!m || m.status === "done") return;
  const [project] = await db.select().from(crmProjects).where(eq(crmProjects.id, m.projectId)).limit(1);
  const staffId = project?.ownerStaffId;
  if (!staffId) return;
  await notify({
    staffId, kind: "milestone_reminder", title: `Milestone due: ${m.title}`,
    body: project ? `On ${project.name}.` : null,
    href: "/admin/crm/operations", entityType: "project", entityId: m.projectId,
  });
}

async function runDailyDigest(job: CrmScheduledJob): Promise<void> {
  const staffId = Number(job.payload["staffId"]);
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff || staff.status !== "active" || !staff.dailyDigestEnabled) return;

  const { end } = localDayBounds(staff.timezone);
  const open = await db.select().from(crmTasks).where(and(
    eq(crmTasks.assignedToStaffId, staffId),
    sql`${crmTasks.status} <> 'completed'`,
    isNull(crmTasks.archivedAt),
    lte(crmTasks.dueDate, end),
  ));
  if (open.length === 0) return;

  const overdue = open.filter((t) => t.dueDate && t.dueDate.getTime() < Date.now()).length;
  await notify({
    staffId, kind: "daily_digest",
    title: `${open.length} task${open.length === 1 ? "" : "s"} for today`,
    body: overdue > 0 ? `${overdue} overdue.` : "Nothing overdue.",
    href: "/admin/crm/my-day",
  });
  await maybeEmail(job, staffId, "Your SiteMint CRM day",
    `${open.length} task(s) due today or earlier${overdue > 0 ? `, ${overdue} overdue` : ""}.`);

  // Tomorrow's digest is scheduled once today's has run, so the chain cannot
  // fan out if the worker restarts.
  await scheduleDailyDigest(staffId);
}

export async function scheduleDailyDigest(staffId: number): Promise<void> {
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, staffId)).limit(1);
  if (!staff) return;
  if (!staff.dailyDigestEnabled || staff.status !== "active") {
    // Cancel any outstanding digest rather than leaving it to fire.
    await db.update(crmScheduledJobs)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(
        eq(crmScheduledJobs.kind, "daily_digest"),
        eq(crmScheduledJobs.status, "pending"),
        sql`${crmScheduledJobs.payload} ->> 'staffId' = ${String(staffId)}`,
      ));
    return;
  }
  const now = new Date();
  let runAt = localTimeToUtc(staff.timezone, now, staff.dailyDigestHour, 0);
  if (runAt.getTime() <= now.getTime()) {
    runAt = localTimeToUtc(staff.timezone, new Date(now.getTime() + 24 * 3600_000), staff.dailyDigestHour, 0);
  }
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: staff.timezone }).format(runAt);
  await scheduleJob({
    kind: "daily_digest", dedupeKey: digestKey(staffId, localDate),
    runAt, payload: { staffId },
  });
}

async function runAppointmentReminder(job: CrmScheduledJob): Promise<void> {
  const appointmentId = Number(job.payload["appointmentId"]);
  const [appt] = await db.select().from(crmAppointments)
    .where(eq(crmAppointments.id, appointmentId)).limit(1);
  // It may have been cancelled or completed between scheduling and now.
  if (!appt || appt.status !== "scheduled") return;

  const attendees = await db.select().from(crmAppointmentAttendees)
    .where(eq(crmAppointmentAttendees.appointmentId, appointmentId));
  const staffIds = [...new Set(attendees.map((a) => a.staffId).filter((v): v is number => v != null))];
  const when = appt.startAt.toISOString().slice(11, 16);

  for (const staffId of staffIds) {
    await notify({
      staffId, kind: "appointment_reminder", title: appt.title,
      body: `Starts at ${when} UTC${appt.location ? ` · ${appt.location}` : ""}.`,
      href: "/admin/crm/calendar", entityType: "appointment", entityId: appt.id,
    });
    await maybeEmail(job, staffId, `Reminder: ${appt.title}`,
      `${appt.title} starts at ${when} UTC.${appt.location ? ` Location: ${appt.location}.` : ""}`);
  }
}

const HANDLERS: Record<string, (job: CrmScheduledJob) => Promise<void>> = {
  appointment_reminder: runAppointmentReminder,
  task_reminder: runTaskReminder,
  milestone_reminder: runMilestoneReminder,
  daily_digest: runDailyDigest,
};

// ── The worker ──────────────────────────────────────────────────────────────

/**
 * Claims a batch of due jobs. `FOR UPDATE SKIP LOCKED` is what makes several
 * workers safe: a row another worker is claiming is skipped rather than waited
 * for, so no job is handed out twice and no worker blocks.
 *
 * A `running` row whose lock is older than LOCK_TIMEOUT_MS is reclaimable —
 * that is how a job survives the process that was running it being killed.
 */
async function claimDueJobs(limit = BATCH_SIZE): Promise<CrmScheduledJob[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(crmScheduledJobs)
      .where(and(
        lte(crmScheduledJobs.runAt, now),
        isNull(crmScheduledJobs.cancelledAt),
        or(
          eq(crmScheduledJobs.status, "pending"),
          and(eq(crmScheduledJobs.status, "running"), lte(crmScheduledJobs.lockedAt, staleBefore)),
        ),
      ))
      .orderBy(asc(crmScheduledJobs.runAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.update(crmScheduledJobs)
      .set({ status: "running", lockedAt: now, lockedBy: WORKER_ID, updatedAt: now })
      .where(inArray(crmScheduledJobs.id, ids));
    return rows;
  });
}

async function settle(job: CrmScheduledJob, error?: unknown): Promise<void> {
  const now = new Date();
  if (!error) {
    // Guarded on the runAt we claimed. A recurring handler re-arms the SAME
    // row for its next occurrence, and that write moves runAt — so this update
    // matches nothing and correctly leaves the job pending instead of marking
    // the series finished.
    await db.update(crmScheduledJobs)
      .set({ status: "completed", completedAt: now, lockedAt: null, lockedBy: null, updatedAt: now })
      .where(and(eq(crmScheduledJobs.id, job.id), eq(crmScheduledJobs.runAt, job.runAt)));
    return;
  }
  const attempts = job.attempts + 1;
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  if (attempts >= job.maxAttempts) {
    // Permanently failed jobs stay queryable — see GET /crm/ops/jobs/failures.
    await db.update(crmScheduledJobs)
      .set({ status: "failed", attempts, lastError: message, lockedAt: null, lockedBy: null, updatedAt: now })
      .where(eq(crmScheduledJobs.id, job.id));
    return;
  }
  const backoffMs = Math.min(30_000 * 2 ** (attempts - 1), 60 * 60_000);
  await db.update(crmScheduledJobs)
    .set({
      status: "pending", attempts, lastError: message,
      runAt: new Date(now.getTime() + backoffMs),
      lockedAt: null, lockedBy: null, updatedAt: now,
    })
    .where(eq(crmScheduledJobs.id, job.id));
}

/** One pass. Exported so tests can drive the queue deterministically. */
export async function processDueJobs(): Promise<{ processed: number; failed: number }> {
  const jobs = await claimDueJobs();
  let failed = 0;
  for (const job of jobs) {
    const handler = HANDLERS[job.kind];
    if (!handler) { await settle(job, new Error(`unknown job kind: ${job.kind}`)); failed++; continue; }
    try {
      await handler(job);
      await settle(job);
    } catch (err) {
      failed++;
      await settle(job, err);
    }
  }
  return { processed: jobs.length, failed };
}

let timer: NodeJS.Timeout | undefined;
const status = { lastTickAt: null as Date | null, lastError: null as string | null, processed: 0 };

export function getSchedulerStatus() {
  return { ...status, running: timer !== undefined, workerId: WORKER_ID, tickMs: TICK_MS };
}

export function startCrmScheduler(intervalMs = TICK_MS): void {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await processDueJobs();
      status.processed += r.processed;
      status.lastError = null;
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      status.lastTickAt = new Date();
    }
  };
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
}

export function stopCrmScheduler(): void {
  if (timer) { clearInterval(timer); timer = undefined; }
}
