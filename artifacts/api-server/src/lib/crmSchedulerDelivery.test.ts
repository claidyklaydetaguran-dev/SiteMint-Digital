/**
 * The crash window between "the provider accepted" and "we recorded that it
 * did", tested rather than asserted.
 *
 * `FOR UPDATE SKIP LOCKED` stops two workers running the same job at the same
 * time. It says nothing about external side effects: a worker can hand a
 * message to Resend, be killed before it writes anything down, and have its
 * lock expire — at which point the job is reclaimed and, without a guard,
 * sends a second copy to a real person.
 *
 * These tests kill the worker in exactly that window and assert the message is
 * not sent twice, while a genuinely new occurrence of a recurring job still
 * sends.
 *
 * Gated on CRM_TEST_DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";

// Stand in for Resend. Records every attempted send so a second one is
// visible, and never touches the network.
const sends: { to: string; subject: string; idempotencyKey?: string }[] = [];
vi.mock("./staffMail.js", () => ({
  staffMailConfigured: () => true,
  staffMailBlockedReason: () => null,
  trySendStaffMail: async (args: { to: string; subject: string; idempotencyKey?: string }) => {
    sends.push({ to: args.to, subject: args.subject, idempotencyKey: args.idempotencyKey });
    return { sent: true, providerId: `provider-${sends.length}` };
  },
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

const suite = TEST_DB ? describe : describe.skip;

suite("exactly-once external delivery across a worker crash (real DB)", () => {
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let scheduler: typeof import("./crmScheduler.js");
  let staffId: number;
  let taskId: number;
  let dedupeKey: string;

  const STAMP = Date.now();

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    scheduler = await import("./crmScheduler.js");

    const [staff] = await db.insert(schema.crmStaff).values({
      email: `crash-window-${STAMP}@example.test`,
      displayName: "[CRM-TEST] Crash Window",
      role: "owner",
      status: "active",
      passwordHash: "not-used-in-this-suite",
      // The email path only runs for somebody who asked for reminder email.
      reminderEmailEnabled: true,
      timezone: "UTC",
    }).returning();
    staffId = staff.id;

    const [task] = await db.insert(schema.crmTasks).values({
      title: "[CRM-TEST] reminder that must arrive once",
      status: "pending",
      assignedToStaffId: staffId,
      remindAt: new Date(Date.now() - 60_000),
    }).returning();
    taskId = task.id;

    dedupeKey = scheduler.taskReminderKey(taskId);
    await scheduler.syncTaskReminder(taskId);
  });

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.crmScheduledJobs).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
    await db.delete(schema.crmNotifications).where(eq(schema.crmNotifications.staffId, staffId));
    await db.delete(schema.crmTasks).where(eq(schema.crmTasks.id, taskId));
    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
  });

  beforeEach(() => { sends.length = 0; });

  /** Puts the job back the way an expired lock leaves it, keeping run_at. */
  async function simulateWorkerDeath(): Promise<Date> {
    const { eq } = await import("drizzle-orm");
    const [before] = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey)).limit(1);
    await db.update(schema.crmScheduledJobs).set({
      status: "pending", lockedAt: null, lockedBy: null,
    }).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
    return before.runAt;
  }

  async function jobRow() {
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey)).limit(1);
    return row;
  }

  it("sends the reminder once, stamping the dispatch marker and the provider id", async () => {
    await scheduler.processDueJobs();

    expect(sends).toHaveLength(1);
    const row = await jobRow();
    expect(row.externalDispatchedAt).not.toBeNull();
    expect(row.externalRef).toBe("provider-1");

    // The marker is at or after this occurrence's run_at, which is what makes
    // it attributable to this occurrence rather than an earlier one.
    expect(row.externalDispatchedAt!.getTime()).toBeGreaterThanOrEqual(row.runAt.getTime());

    // The key the provider sees is derived from the occurrence, not the clock,
    // so a retry of this same occurrence presents the same key.
    expect(sends[0].idempotencyKey).toBe(`${dedupeKey}:${row.runAt.toISOString()}`);
  });

  it("does NOT send again when the job is reclaimed after the provider accepted", async () => {
    // The exact failure the owner asked about: Resend said yes, then the
    // worker died before recording success, and the lock expired.
    const runAt = await simulateWorkerDeath();
    const row = await jobRow();
    expect(row.status).toBe("pending");            // genuinely reclaimable
    expect(row.externalDispatchedAt).not.toBeNull(); // and it remembers the hand-off
    expect(row.runAt.getTime()).toBe(runAt.getTime());

    await scheduler.processDueJobs();

    // The job ran again — that is what a queue does — but no second message
    // was handed to the provider.
    expect(sends).toHaveLength(0);
  });

  it("still sends for the next occurrence of a recurring job", async () => {
    // A daily reminder's second occurrence has a later run_at than the first
    // occurrence's dispatch. Suppressing it would mean a recurring reminder
    // fires exactly once, ever — the opposite failure.
    const { eq } = await import("drizzle-orm");

    // Both instants are in the past, because a job is only claimed once its
    // run_at has passed. The previous occurrence was dispatched two hours ago;
    // this one came due an hour ago, which is after it.
    const previousDispatch = new Date(Date.now() - 2 * 3_600_000);
    const nextRunAt = new Date(Date.now() - 3_600_000);

    await db.update(schema.crmScheduledJobs).set({
      status: "pending", lockedAt: null, lockedBy: null,
      runAt: nextRunAt, attempts: 0,
      externalDispatchedAt: previousDispatch,
    }).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));

    await scheduler.processDueJobs();

    expect(sends).toHaveLength(1);
    // A different occurrence presents a different key, so the provider does
    // not collapse it into the previous send.
    expect(sends[0].idempotencyKey).toBe(`${dedupeKey}:${nextRunAt.toISOString()}`);

    const row = await jobRow();
    expect(row.externalDispatchedAt!.getTime()).toBeGreaterThanOrEqual(nextRunAt.getTime());
  });

  it("suppresses only the email, never the in-app notification", async () => {
    // The in-app record is written in the same database as the job, so it has
    // no crash window and must not inherit the email's guard.
    const { eq, and } = await import("drizzle-orm");
    const before = await db.select().from(schema.crmNotifications)
      .where(and(
        eq(schema.crmNotifications.staffId, staffId),
        eq(schema.crmNotifications.kind, "task_reminder"),
      ));

    // Due an hour ago, already dispatched a second after it fell due — so the
    // job is claimable and the email guard applies.
    const runAt = new Date(Date.now() - 3_600_000);
    await db.update(schema.crmScheduledJobs).set({
      status: "pending", lockedAt: null, lockedBy: null,
      runAt, attempts: 0,
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
    }).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));

    await scheduler.processDueJobs();

    const after = await db.select().from(schema.crmNotifications)
      .where(and(
        eq(schema.crmNotifications.staffId, staffId),
        eq(schema.crmNotifications.kind, "task_reminder"),
      ));

    expect(sends).toHaveLength(0);              // email withheld
    expect(after.length).toBeGreaterThan(before.length); // notification still written
  });
});
