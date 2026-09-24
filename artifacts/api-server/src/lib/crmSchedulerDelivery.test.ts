/**
 * What actually happens when an external send goes wrong — tested rather than
 * asserted.
 *
 * `FOR UPDATE SKIP LOCKED` stops two workers running the same job at the same
 * time. It says nothing about external side effects: a worker can hand a
 * message to Resend, be killed before it writes anything down, and have its
 * lock expire — at which point the job is reclaimed and, without a guard,
 * sends a second copy to a real person.
 *
 * The original guard was a marker written BEFORE the request. It suppressed
 * the duplicate and, in doing so, suppressed every legitimate retry too: a
 * 500, a refused connection or a timeout left a marker that said "dispatched"
 * and the reminder was silently lost forever. These tests drive each of those
 * failures and assert the honest outcome — sent once, or visibly unresolved,
 * never silently dropped.
 *
 * WHERE DELIVERY STATE LIVES. It used to be packed into
 * `crm_scheduled_jobs.external_ref` as newline-separated
 * `<state>|<runAt ISO>#<staffId>|<attemptId>|<detail>` text, and these tests
 * read it by parsing that string. It is now a row per (occurrence, recipient)
 * in `crm_reminder_deliveries`, UNIQUE on exactly that, so every assertion
 * here reads a column instead. The packed column is retired but never cleared,
 * and is still READ for legacy rows — which is why the two legacy tests near
 * the end still write to it.
 *
 * This file is the scheduler-side half of the delivery story: the worker, the
 * classifier and the library queries. The operator API half — retry, re-send,
 * acknowledge, paging, the bulk migration — is `src/routes/crmDeliveries.test.ts`,
 * and cases genuinely covered there are deliberately not repeated here.
 *
 * Gated on CRM_TEST_DATABASE_URL, like the other DB-backed suites.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";

type MockOutcome =
  | { sent: true; providerId: string | null }
  | {
      sent: false;
      failure: "not_configured" | "rejected" | "failed" | "uncertain";
      reason: string;
      configured: boolean;
    };

/**
 * Stands in for Resend. Records every attempted send so a second one is
 * visible, answers however the test under way needs, and never touches a
 * network.
 */
const sends: { to: string; subject: string; idempotencyKey?: string }[] = [];
let blockedReason: string | null = null;
let respond: (n: number) => Promise<MockOutcome> = async (n) => ({ sent: true, providerId: `provider-${n}` });

vi.mock("./staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => blockedReason === null,
  staffMailBlockedReason: () => blockedReason,
  trySendStaffMail: async (args: { to: string; subject: string; idempotencyKey?: string }) => {
    sends.push({ to: args.to, subject: args.subject, idempotencyKey: args.idempotencyKey });
    return respond(sends.length);
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

// ── The failure classifier ──────────────────────────────────────────────────
//
// Pure, so it needs no database and runs everywhere. It decides whether a
// retry is safe, which is the single most consequential judgement in the
// delivery path — a transient error misread as "delivered" loses the message,
// and an unknown outcome misread as "failed" duplicates it.

describe("classifying a mail failure", () => {
  let mail: typeof import("./staffMail.js");
  beforeAll(async () => { mail = await vi.importActual<typeof import("./staffMail.js")>("./staffMail.js"); });

  it("treats Resend's 24-hour idempotency window as a fact, not a guarantee", () => {
    // Verified against https://resend.com/docs/dashboard/emails/idempotency-keys.
    // If this ever changes, DELIVERY-GUARANTEE.md is wrong and must be rewritten.
    expect(mail.RESEND_IDEMPOTENCY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("reads a 409 concurrent-idempotent-request as uncertain, never as a failure", () => {
    // An identical request with our key is already in flight, so a message is
    // very probably on its way. Calling this a failure would make us re-send.
    expect(mail.classifyProviderError({
      name: "concurrent_idempotent_requests", statusCode: 409,
      message: "Another request with this idempotency key is in progress.",
    })).toBe("uncertain");
  });

  it("reads a 409 invalid-idempotent-request as a permanent rejection", () => {
    // Our own bug: the key was reused with a different payload. Nothing was
    // sent, and sending the same thing again changes nothing.
    expect(mail.classifyProviderError({
      name: "invalid_idempotent_request", statusCode: 409,
      message: "This idempotency key was used with a different payload.",
    })).toBe("rejected");
  });

  it("reads 5xx and rate limits as staffMail's `failed`, which is NOT permission to retry", () => {
    // `failed` is staffMail's vocabulary and it is NOT the delivery layer's
    // verdict. `classifyDeliveryOutcome` re-reads a `failed` outcome and only
    // treats it as retryable when the reason names a transport code that rules
    // the request out; a bare 5xx becomes `uncertain` and is never retried by a
    // machine. See "leaves a 5xx uncertain..." in the suite below.
    expect(mail.classifyProviderError({ name: "internal_server_error", statusCode: 500 })).toBe("failed");
    expect(mail.classifyProviderError({ name: "application_error", statusCode: 500 })).toBe("failed");
    expect(mail.classifyProviderError({ name: "rate_limit_exceeded", statusCode: 429 })).toBe("failed");
    expect(mail.classifyProviderError({ name: "something_new", statusCode: 503 })).toBe("failed");
  });

  it("reads a validation answer as a permanent rejection", () => {
    expect(mail.classifyProviderError({
      name: "validation_error", statusCode: 422, message: "The from address is not verified.",
    })).toBe("rejected");
  });

  it("reads a connection that never opened as failed, not uncertain", () => {
    // The request never reached Resend, so no message can exist and a retry
    // cannot duplicate.
    expect(mail.classifyThrownMailError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })))
      .toBe("failed");
    expect(mail.classifyThrownMailError(Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
    }))).toBe("failed");
  });

  it("reads a timeout, a reset and anything unrecognised as uncertain", () => {
    // The bytes may already be on Resend's side. Unknown is the honest answer.
    expect(mail.classifyThrownMailError(Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" }),
    }))).toBe("uncertain");
    expect(mail.classifyThrownMailError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })))
      .toBe("uncertain");
    expect(mail.classifyThrownMailError(new Error("something nobody has seen before"))).toBe("uncertain");
  });
});

const suite = TEST_DB ? describe : describe.skip;

suite("external delivery state across every way a send can go wrong (real DB)", () => {
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let scheduler: typeof import("./crmScheduler.js");
  let orm: typeof import("drizzle-orm");
  let staffId: number;
  let taskId: number;
  let jobId: number;
  let dedupeKey: string;
  let staffEmail: string;

  const STAMP = Date.now();
  const ACTOR = "[CRM-TEST] Delivery States";

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    scheduler = await import("./crmScheduler.js");
    orm = await import("drizzle-orm");

    staffEmail = `delivery-${STAMP}@example.test`;
    const [staff] = await db.insert(schema.crmStaff).values({
      email: staffEmail,
      displayName: ACTOR,
      role: "owner",
      status: "active",
      passwordHash: "not-used-in-this-suite",
      // The email path only runs for somebody who asked for reminder email.
      reminderEmailEnabled: true,
      timezone: "UTC",
    }).returning();
    staffId = staff.id;

    const [task] = await db.insert(schema.crmTasks).values({
      title: "[CRM-TEST] reminder that must arrive, or visibly not",
      status: "pending",
      assignedToStaffId: staffId,
      remindAt: new Date(Date.now() - 60_000),
    }).returning();
    taskId = task.id;

    dedupeKey = scheduler.taskReminderKey(taskId);
    await scheduler.syncTaskReminder(taskId);
    jobId = (await jobRow()).id;
  });

  afterAll(async () => {
    const { eq } = orm;
    // The delivery records cascade with the job they belong to.
    await db.delete(schema.crmScheduledJobs).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
    await db.delete(schema.crmNotifications).where(eq(schema.crmNotifications.staffId, staffId));
    await db.delete(schema.crmTasks).where(eq(schema.crmTasks.id, taskId));
    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
  });

  beforeEach(() => {
    sends.length = 0;
    blockedReason = null;
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  async function jobRow() {
    const { eq } = orm;
    const [row] = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey)).limit(1);
    return row;
  }

  /** Rewrites the row, then leaves it the way an expired lease leaves it. */
  async function reclaimable(patch: Partial<{
    runAt: Date; externalRef: string | null; externalDispatchedAt: Date | null; lastError: string | null;
  }> = {}) {
    const { eq } = orm;
    await db.update(schema.crmScheduledJobs).set({
      status: "pending", lockedAt: null, lockedBy: null, attempts: 0, ...patch,
    }).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
  }

  /** Every delivery record a job owns, oldest first. */
  async function deliveryRows(forJob: number = jobId) {
    const { asc, eq } = orm;
    return db.select().from(schema.crmReminderDeliveries)
      .where(eq(schema.crmReminderDeliveries.jobId, forJob))
      .orderBy(asc(schema.crmReminderDeliveries.id));
  }

  /**
   * The record covering this suite's staff member at the job's CURRENT
   * occurrence — this person's own row, or an inherited unattributed one,
   * which is the same preference order the worker uses.
   */
  async function delivery() {
    const job = await jobRow();
    const rows = (await deliveryRows()).filter((r) => r.occurrenceAt.getTime() === job.runAt.getTime());
    return rows.find((r) => r.recipientStaffId === staffId)
      ?? rows.find((r) => r.recipientStaffId === null && r.recipientAddress === null)
      ?? null;
  }

  /**
   * Moves the job to `runAt` with NO delivery history at all, so a test starts
   * from a genuinely untouched occurrence rather than the previous test's.
   */
  async function freshOccurrence(runAt: Date, patch: Partial<{
    externalRef: string | null; externalDispatchedAt: Date | null;
  }> = {}) {
    const { eq } = orm;
    await db.delete(schema.crmReminderDeliveries).where(eq(schema.crmReminderDeliveries.jobId, jobId));
    await reclaimable({
      runAt, externalRef: null, externalDispatchedAt: null, lastError: null, ...patch,
    });
  }

  /**
   * A fresh occurrence carrying one delivery record in whatever state the test
   * needs. This is what replaced writing a packed `external_ref` line by hand:
   * delivery state is a row, so a test sets up a row.
   */
  async function seedDelivery(
    runAt: Date,
    patch: Partial<typeof schema.crmReminderDeliveries.$inferInsert>,
  ) {
    await freshOccurrence(runAt);
    const [row] = await db.insert(schema.crmReminderDeliveries).values({
      jobId,
      occurrenceAt: runAt,
      recipientStaffId: staffId,
      subject: "Reminder: [CRM-TEST] reminder that must arrive, or visibly not",
      body: "seeded by the delivery-state suite",
      idempotencyKey: keyFor(runAt),
      ...patch,
    }).returning();
    return row;
  }

  /**
   * Winds a scheduled automatic attempt's durable clock to now.
   *
   * The backoff between automatic attempts is a timestamp in the row, not an
   * in-process sleep, so a test moves the clock instead of waiting 30 seconds.
   */
  async function dueNow() {
    const { and, eq, isNotNull } = orm;
    await db.update(schema.crmReminderDeliveries)
      .set({ nextAttemptAt: new Date() })
      .where(and(
        eq(schema.crmReminderDeliveries.jobId, jobId),
        isNotNull(schema.crmReminderDeliveries.nextAttemptAt),
      ));
  }

  /** The key a send for `runAt` must carry — per occurrence AND per recipient. */
  const keyFor = (runAt: Date, who: number = staffId) => `${dedupeKey}:${runAt.toISOString()}:${who}`;

  /** Only this suite's sends — `processDueJobs` claims every due job there is. */
  const mine = () => sends.filter((s) => s.to === staffEmail);

  async function attentionRow() {
    const rows = await scheduler.listDeliveriesNeedingAttention(500);
    return rows.find((r) => r.jobId === jobId);
  }

  // ── the happy path, and the one state that may suppress a retry ───────────

  it("sends once and resolves the attempt to accepted", async () => {
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    const job = await jobRow();
    const d = (await delivery())!;
    expect(d.state).toBe("accepted");
    expect(d.attempt).toBe(1);
    expect(d.providerRef).toBe("provider-1");
    expect(d.origin).toBe("live");
    // The record is against the OCCURRENCE and the PERSON, which is what keeps
    // yesterday's send from suppressing today's and one attendee's from
    // suppressing another's.
    expect(d.occurrenceAt.getTime()).toBe(job.runAt.getTime());
    expect(d.recipientStaffId).toBe(staffId);
    // Settled: nothing scheduled, nothing outstanding.
    expect(d.nextAttemptAt).toBeNull();
    expect(d.failureReason).toBeNull();
    expect(d.attemptWorker).toBeNull();

    // The key the provider sees is derived from the occurrence, not the clock,
    // so a retry of this same occurrence presents the same key.
    expect(d.idempotencyKey).toBe(keyFor(job.runAt));
    expect(mine()[0].idempotencyKey).toBe(keyFor(job.runAt));

    // A resolved success is not something an operator needs to look at.
    expect(await attentionRow()).toBeUndefined();
  });

  it("does NOT send again when the job is reclaimed after the provider accepted", async () => {
    // Resend said yes, then the worker died before settling, and the lock expired.
    const before = await jobRow();
    await reclaimable();
    const job = await jobRow();
    expect(job.status).toBe("pending");                   // genuinely reclaimable
    expect((await delivery())!.state).toBe("accepted");   // and it remembers the answer
    expect(job.runAt.getTime()).toBe(before.runAt.getTime());

    await scheduler.processDueJobs();

    // The job ran again — that is what a queue does — but no second message
    // was handed to the provider, and the record was not disturbed.
    expect(mine()).toHaveLength(0);
    const after = (await delivery())!;
    expect(after.state).toBe("accepted");
    expect(after.attempt).toBe(1);
  });

  // ── failing before the provider is ever called ────────────────────────────

  it("writes NOTHING when mail is unconfigured, so the occurrence is not burned", async () => {
    // The regression this whole change exists for. The old code stamped the
    // dispatch marker before discovering that no send was possible, which
    // silently suppressed the reminder forever once mail WAS configured. A
    // delivery ROW here would do exactly the same thing, so there must not be
    // one: this is the "failed before the provider call" case and it has to
    // leave no trace at all.
    const runAt = new Date(Date.now() - 2 * 3_600_000);
    await freshOccurrence(runAt);
    blockedReason = "RESEND_API_KEY is not set on this server, so no mail can be sent.";

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    expect(await deliveryRows()).toHaveLength(0);   // no trace at all
    expect(await attentionRow()).toBeUndefined();   // and nothing for an operator to chase

    // Configure mail, run the same occurrence again: it must still go out.
    blockedReason = null;
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    const d = (await delivery())!;
    expect(d.state).toBe("accepted");
    expect(d.occurrenceAt.getTime()).toBe(runAt.getTime());
  });

  // ── the provider answered: refusal ────────────────────────────────────────

  it("records a provider rejection as permanent, and retries it exactly zero times", async () => {
    respond = async () => ({
      sent: false, failure: "rejected", configured: true,
      reason: "The sending domain is not verified.",
    });
    await freshOccurrence(new Date(Date.now() - 3 * 3_600_000));

    await scheduler.processDueJobs();

    // One call. Repeating a deterministic refusal is pure noise.
    expect(mine()).toHaveLength(1);
    const d = (await delivery())!;
    expect(d.state).toBe("refused");
    expect(d.failureReason).toBe("provider_refused");
    expect(d.failureDetail).toBe("The sending domain is not verified.");
    expect(d.nextAttemptAt).toBeNull();      // no machine will pick it up again

    // Visible where an operator already looks.
    expect((await jobRow()).lastError).toBe("delivery refused: The sending domain is not verified.");

    const attention = await attentionRow();
    expect(attention?.state).toBe("refused");
    expect(attention?.guidance).toMatch(/refused/i);

    // Exactly zero retries, however many passes run and however willing the
    // provider becomes.
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    await reclaimable();
    await scheduler.processDueJobs();
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    expect((await delivery())!.attempt).toBe(1);
  });

  // ── the provider answered, and we never heard it ──────────────────────────

  it("records a lost response as uncertain, and never auto-retries it", async () => {
    // Resend accepted the message; the connection died before we read the
    // answer. A retry might duplicate, so the machine refuses to guess.
    respond = async () => ({
      sent: false, failure: "uncertain", configured: true, reason: "socket hang up",
    });
    await freshOccurrence(new Date(Date.now() - 4 * 3_600_000));

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    let d = (await delivery())!;
    expect(d.state).toBe("uncertain");
    expect(d.failureReason).toBe("no_answer_from_provider");
    expect(d.nextAttemptAt).toBeNull();
    expect((await jobRow()).lastError).toBe("delivery uncertain: socket hang up");

    // Reclaim it as many times as you like: it stays put rather than sending a
    // second copy of something that may already have arrived.
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    await reclaimable();
    await scheduler.processDueJobs();
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);   // still only the original attempt
    d = (await delivery())!;
    expect(d.state).toBe("uncertain");
    expect(d.attempt).toBe(1);

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.jobStatus).toBe("completed");  // the JOB succeeded; the DELIVERY did not
  });

  // ── transient failures, which are the ones that were being lost ───────────
  //
  // DELETED ON PURPOSE — do not reinstate:
  //   "retries a transient failure in place and succeeds, reusing one
  //    idempotency key"
  // It drove two Resend 500s followed by a success, asserted THREE sends inside
  // one scheduler pass, and asserted the delivery ended `accepted`. Its safety
  // argument was that all three attempts carried a single idempotency key, so a
  // "failure" that had in fact been accepted would be collapsed by the provider.
  //
  // That argument is wrong twice over. A 5xx is an ANSWER from a server that had
  // already received the request, so "it did not go" is a guess, not a fact —
  // and the key only collapses duplicates for as long as Resend retains it,
  // which is 24 hours (RESEND_IDEMPOTENCY_WINDOW_MS), a limit the old test never
  // acknowledged. A 5xx is therefore classified `uncertain` and never retried by
  // a machine. The two tests below pin what is true now: unknown is left alone,
  // and only the one failure class that PROVES nothing was sent is retried — a
  // bounded number of times, on a durable clock.

  it("leaves a 5xx uncertain, attempts it exactly once, and never auto-retries it", async () => {
    respond = async () => ({
      sent: false, failure: "failed", configured: true,
      reason: "Resend returned 500 internal_server_error.",
    });
    await freshOccurrence(new Date(Date.now() - 5 * 3_600_000));

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    const first = (await delivery())!;
    // The provider answered, which means it had already received the request.
    expect(first.state).toBe("uncertain");
    expect(first.failureReason).toBe("provider_answered_but_outcome_unknown");
    expect(first.attempt).toBe(1);
    expect(first.nextAttemptAt).toBeNull();   // nothing is scheduled, by design

    // However many passes run, through either clock, and however willing the
    // provider now is.
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    for (let i = 0; i < 4; i += 1) {
      await reclaimable();
      await scheduler.processDueJobs();
      await scheduler.processDueDeliveries();
    }

    expect(mine()).toHaveLength(1);
    const after = (await delivery())!;
    expect(after.state).toBe("uncertain");
    expect(after.attempt).toBe(1);

    // Not silently dropped either: it stays in front of a person, who is the
    // only thing allowed to decide what happens to an unknown outcome.
    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.availableActions).toContain("acknowledge");
    expect(attention?.availableActions).toContain("resend");
  });

  it("bounds automatic retries of a provably-unsent failure, then waits for a person", async () => {
    // A connection that never opened is the ONE failure class that proves no
    // message exists, so it is the only one a machine may retry by itself.
    const runAt = new Date(Date.now() - 6 * 3_600_000);
    respond = async () => ({
      sent: false, failure: "failed", configured: true,
      reason: "connect ECONNREFUSED 10.255.255.1:443",
    });
    await freshOccurrence(runAt);

    await scheduler.processDueJobs();

    // ONE attempt, not three: the next one is scheduled on the row, not slept
    // through in the worker, so a process that dies between attempts loses
    // nothing and no job handler is held open.
    expect(mine()).toHaveLength(1);
    let d = (await delivery())!;
    expect(d.state).toBe("pending");
    expect(d.failureReason).toBe("never_left_this_server");
    expect(d.attempt).toBe(1);
    expect(d.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    await dueNow(); await scheduler.processDueDeliveries();
    await dueNow(); await scheduler.processDueDeliveries();

    expect(mine()).toHaveLength(3);        // bounded, not infinite
    d = (await delivery())!;
    expect(d.attempt).toBe(3);
    expect(d.nextAttemptAt).toBeNull();    // the machine has stopped trying

    // Still visible, and still honest about what it means.
    const attention = await attentionRow();
    expect(attention?.state).toBe("pending");
    expect(attention?.guidance).toMatch(/cannot duplicate/i);

    // Re-running the JOB does not restart it. An exhausted delivery waits for a
    // person — which is what stops a broken provider being hammered forever,
    // and is the part of this that changed: the old scheme retried in place.
    await reclaimable();
    await scheduler.processDueJobs();
    expect(mine()).toHaveLength(3);

    // A person is what restarts it, and then it goes.
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    const recovered = await scheduler.recoverDelivery({
      deliveryId: d.id, action: "retry",
      reason: "The mail host is reachable again.",
      actorStaffId: staffId, actorLabel: ACTOR,
    });
    expect(recovered.ok).toBe(true);
    await scheduler.processDueDeliveries();

    expect(mine()).toHaveLength(4);
    d = (await delivery())!;
    expect(d.state).toBe("accepted");
    expect(d.attempt).toBe(4);             // attempt numbering continues
    // Every attempt, automatic and human, carried the SAME key — which is what
    // makes retrying this class safe at all.
    expect(new Set(mine().map((s) => s.idempotencyKey)).size).toBe(1);
    expect(mine()[3].idempotencyKey).toBe(keyFor(runAt));
    // ...and a retry a person asked for, which then worked, closes the case in
    // their name rather than anonymously.
    expect(d.resolution).toBe("accepted");
    expect(d.resolvedByStaffId).toBe(staffId);
  });

  // ── two workers on the same row ───────────────────────────────────────────

  it("does not double-send when a lease expires while a send is in flight", async () => {
    // The hard case. Worker A is talking to Resend; its five-minute lease
    // expires; worker B reclaims the JOB and finds an attempt already in flight.
    await freshOccurrence(new Date(Date.now() - 7 * 3_600_000));

    let raced = false;
    respond = async () => {
      if (!raced) {
        raced = true;
        // ...the lease expires and a second worker takes the row, WHILE this
        // request is still open.
        await reclaimable();
        await scheduler.processDueJobs();
      }
      return { sent: true, providerId: "provider-A" };
    };

    await scheduler.processDueJobs();

    // Worker B found an `attempting` record and sent nothing. Claiming is one
    // conditional UPDATE on `state = 'pending'`, so there is no window between
    // checking and taking it.
    expect(mine()).toHaveLength(1);

    const d = (await delivery())!;
    expect(d.state).toBe("accepted");
    expect(d.providerRef).toBe("provider-A");
    expect(d.attempt).toBe(1);             // one claim, therefore one attempt
    expect(d.attemptWorker).toBeNull();
    expect(await attentionRow()).toBeUndefined();
  });

  // ── the 24-hour horizon ───────────────────────────────────────────────────

  it("never auto-retries an uncertain occurrence, and says so once the 24h window closes", async () => {
    // The honest answer to "what happens past the idempotency window": the
    // automatic path does not go there at all, because an uncertain delivery is
    // never retried by a machine. What changes past 24h is what a HUMAN retry
    // would cost, and the operator view says so.
    const { eq, sql } = orm;
    const runAt = new Date(Date.now() - 48 * 3_600_000);
    const seeded = await seedDelivery(runAt, {
      state: "uncertain", attempt: 1,
      failureReason: "no_answer_from_provider", failureDetail: "socket hang up",
    });
    // Age it past Resend's key retention. `updatedAt` is what the protection
    // check reads once a finished attempt has been cleared down.
    await db.update(schema.crmReminderDeliveries).set({
      attemptStartedAt: sql`now() - interval '48 hours'`,
      updatedAt: sql`now() - interval '48 hours'`,
    }).where(eq(schema.crmReminderDeliveries.id, seeded.id));

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    const d = (await delivery())!;
    expect(d.state).toBe("uncertain");
    expect(d.attempt).toBe(1);             // age does not unlock the machine

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.idempotencyProtected).toBe(false);
    // Retry is withdrawn exactly where it would stop being unable to duplicate,
    // leaving only the action that says "second copy" out loud.
    expect(attention?.availableActions).not.toContain("retry");
    expect(attention?.availableActions).toContain("resend");
    expect(attention?.guidance).toMatch(/24-hour/i);
  });

  it("reports an uncertain delivery inside the window as still protected", async () => {
    const runAt = new Date(Date.now() - 8 * 3_600_000);
    await seedDelivery(runAt, {
      state: "uncertain", attempt: 1,
      failureReason: "no_answer_from_provider", failureDetail: "socket hang up",
    });

    const attention = await attentionRow();
    expect(attention?.idempotencyProtected).toBe(true);
    expect(attention?.guidance).toMatch(/collapses it into the original/i);
    // ...so the cheap, safe action is still on the table.
    expect(attention?.availableActions).toContain("retry");
  });

  it("still retries a 48-hour-old FAILED occurrence, because nothing was ever delivered", async () => {
    // The window is irrelevant here, and this is the point of separating a
    // provably-unsent failure from an unknown one: the provider is known not to
    // hold a copy, so age cannot turn a retry into a duplicate.
    //
    // Note the reason. A 5xx used to qualify for this and deliberately no longer
    // does — only a transport code that rules the request out proves anything.
    const runAt = new Date(Date.now() - 47 * 3_600_000);
    await seedDelivery(runAt, {
      state: "pending", attempt: 1, nextAttemptAt: new Date(),
      failureReason: "never_left_this_server",
      failureDetail: "connect ECONNREFUSED 10.255.255.1:443",
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    expect(mine()[0].idempotencyKey).toBe(keyFor(runAt));
    const d = (await delivery())!;
    expect(d.state).toBe("accepted");
    expect(d.attempt).toBe(2);
    expect(d.occurrenceAt.getTime()).toBe(runAt.getTime());   // the occurrence never moved
  });

  // ── rows written before this scheme existed ───────────────────────────────
  //
  // `external_ref` is retired but never cleared, and is still read to seed a
  // record the first time an old occurrence is touched. These two cases are the
  // whole reason that reading still happens.

  it("reads a legacy marker WITH a provider id as delivered", async () => {
    const runAt = new Date(Date.now() - 9 * 3_600_000);
    await freshOccurrence(runAt, {
      externalRef: "re_legacy_123",                        // a bare provider id
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    // The source column survives, so the history outlives even a rollback.
    expect((await jobRow()).externalRef).toBe("re_legacy_123");

    // ...and it is now a real record, rather than text re-parsed on every pass.
    const rows = await deliveryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(rows[0].providerRef).toBe("re_legacy_123");
    expect(rows[0].origin).toBe("migrated_unattributed");
    expect(rows[0].legacyRaw).toBe("re_legacy_123");
    expect(await attentionRow()).toBeUndefined();   // delivered is nobody's problem
  });

  it("reads a legacy marker WITHOUT a provider id as uncertain, not as delivered", async () => {
    // The old code's blind spot, preserved honestly: the marker only ever meant
    // "a request was started". Treating it as proof of delivery is what lost
    // messages, so it is promoted to a real uncertain record instead.
    const runAt = new Date(Date.now() - 10 * 3_600_000);
    await freshOccurrence(runAt, {
      externalRef: null,
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);                 // still no guessing
    const rows = await deliveryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("uncertain");
    expect(rows[0].occurrenceAt.getTime()).toBe(runAt.getTime());
    expect(rows[0].failureReason).toBe("pre_2026_09_dispatch_marker");
    // Written UNATTRIBUTED: the old marker never said who it was for, so it
    // covers every recipient of this occurrence rather than only the first one
    // the worker happened to process.
    expect(rows[0].recipientStaffId).toBeNull();
    expect(rows[0].recipientAddress).toBeNull();
    expect(rows[0].origin).toBe("migrated_unattributed");

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.staffId).toBeNull();
  });

  // ── recurrence, and the blast radius of the guard ─────────────────────────

  it("still sends for the next occurrence of a recurring job", async () => {
    // A daily reminder's second occurrence is a different occurrence, and the
    // first one's record must not suppress it — the opposite failure, where a
    // recurring reminder fires exactly once, ever.
    const previousRunAt = new Date(Date.now() - 12 * 3_600_000);
    const nextRunAt = new Date(Date.now() - 11 * 3_600_000);

    // Yesterday's occurrence, delivered...
    await seedDelivery(previousRunAt, {
      state: "accepted", attempt: 1, providerRef: "provider-yesterday",
    });
    // ...and the job now sitting on today's.
    await reclaimable({ runAt: nextRunAt });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    // A different occurrence presents a different key, so the provider does
    // not collapse it into the previous send.
    expect(mine()[0].idempotencyKey).toBe(keyFor(nextRunAt));
    expect(mine()[0].idempotencyKey).not.toBe(keyFor(previousRunAt));

    // One record per occurrence, and yesterday's is untouched.
    const rows = await deliveryRows();
    expect(rows).toHaveLength(2);
    const yesterday = rows.find((r) => r.occurrenceAt.getTime() === previousRunAt.getTime())!;
    const today = rows.find((r) => r.occurrenceAt.getTime() === nextRunAt.getTime())!;
    expect(yesterday.providerRef).toBe("provider-yesterday");
    expect(yesterday.attempt).toBe(1);
    expect(today.state).toBe("accepted");
    expect(today.idempotencyKey).toBe(keyFor(nextRunAt));
  });

  it("suppresses only the email, never the in-app notification", async () => {
    // The in-app record is written in the same database as the job, so it has
    // no crash window and must not inherit the email's guard.
    const { eq, and } = orm;
    const count = async () => (await db.select().from(schema.crmNotifications).where(and(
      eq(schema.crmNotifications.staffId, staffId),
      eq(schema.crmNotifications.kind, "task_reminder"),
    ))).length;
    const before = await count();

    await seedDelivery(new Date(Date.now() - 13 * 3_600_000), {
      state: "accepted", attempt: 1, providerRef: "provider-earlier",
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);                    // email withheld
    expect(await count()).toBeGreaterThan(before);     // notification still written
  });

  // ── the operator's question ───────────────────────────────────────────────

  it("answers 'which reminders are in an unknown delivery state?'", async () => {
    const { eq } = orm;
    const runAt = new Date(Date.now() - 14 * 3_600_000);
    const seeded = await seedDelivery(runAt, {
      state: "uncertain", attempt: 2,
      failureReason: "no_answer_from_provider", failureDetail: "socket hang up",
    });
    await reclaimable({ lastError: "delivery uncertain: socket hang up" });

    const unknown = (await scheduler.listDeliveriesNeedingAttention(500))
      .filter((r) => r.state === "uncertain");
    const ours = unknown.find((r) => r.jobId === jobId);

    expect(ours).toBeDefined();
    expect(ours!.deliveryId).toBe(seeded.id);
    expect(ours!.dedupeKey).toBe(dedupeKey);
    expect(ours!.kind).toBe("task_reminder");
    expect(ours!.staffId).toBe(staffId);
    expect(ours!.occurrence).toBe(runAt.toISOString());
    expect(ours!.attempt).toBe(2);
    expect(ours!.detail).toBe("socket hang up");
    expect(await scheduler.countDeliveriesNeedingAttention()).toBeGreaterThan(0);

    // And a human can close it, which is the only thing that ever should.
    const closed = await scheduler.recoverDelivery({
      deliveryId: seeded.id, action: "acknowledge",
      reason: "resent by hand, recipient confirmed",
      actorStaffId: staffId, actorLabel: ACTOR,
    });
    expect(closed.ok).toBe(true);
    expect(await attentionRow()).toBeUndefined();

    // Closing is a record of its own — who, why, and what it was before.
    const audit = await db.select().from(schema.crmDeliveryRecoveryActions)
      .where(eq(schema.crmDeliveryRecoveryActions.deliveryId, seeded.id));
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("acknowledge");
    expect(audit[0].reason).toBe("resent by hand, recipient confirmed");
    expect(audit[0].actorStaffId).toBe(staffId);
    expect(audit[0].previousState).toBe("uncertain");

    // The FACT is unchanged — we still do not know — but the case is shut, and
    // nothing is scheduled that would tell an operator otherwise.
    const d = (await delivery())!;
    expect(d.state).toBe("uncertain");
    expect(d.resolution).toBe("acknowledged");
    expect(d.nextAttemptAt).toBeNull();

    await scheduler.processDueJobs();
    expect(mine()).toHaveLength(0);   // an acknowledged occurrence is settled
  });

  // ── one job row, several recipients ───────────────────────────────────────

  it("emails every attendee of one appointment, and records each separately", async () => {
    // An appointment reminder is ONE job row that emails every staff attendee.
    // A delivery record per occurrence would let attendee one's success
    // suppress attendee two's message — the same silent loss, wearing a
    // different hat. The UNIQUE index is therefore (job, occurrence, RECIPIENT).
    const { eq } = orm;

    // Park this suite's own reminder: a worker pass claims every due job there
    // is, and this test counts sends per recipient.
    await db.update(schema.crmScheduledJobs)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
    await db.delete(schema.crmReminderDeliveries).where(eq(schema.crmReminderDeliveries.jobId, jobId));

    const secondEmail = `delivery-second-${STAMP}@example.test`;
    const [second] = await db.insert(schema.crmStaff).values({
      email: secondEmail,
      displayName: "[CRM-TEST] Second Attendee",
      role: "owner", status: "active",
      passwordHash: "not-used-in-this-suite",
      reminderEmailEnabled: true, timezone: "UTC",
    }).returning();

    const startAt = new Date(Date.now() + 3_600_000);
    const [appt] = await db.insert(schema.crmAppointments).values({
      title: "[CRM-TEST] two attendees", startAt, endAt: new Date(startAt.getTime() + 1_800_000),
      status: "scheduled", createdByLabel: "[CRM-TEST]", timezone: "UTC",
    }).returning();
    await db.insert(schema.crmAppointmentAttendees).values([
      { appointmentId: appt.id, staffId },
      { appointmentId: appt.id, staffId: second.id },
    ]);

    const apptKey = `appointment_reminder:${appt.id}:${STAMP}`;
    const apptRunAt = new Date(Date.now() - 60_000);
    await scheduler.scheduleJob({
      kind: "appointment_reminder", dedupeKey: apptKey,
      runAt: apptRunAt, payload: { appointmentId: appt.id },
    });

    try {
      await scheduler.processDueJobs();

      // Both people were emailed, each with their OWN idempotency key — reusing
      // one key across different recipients is a different payload under the
      // same key, which Resend answers with `invalid_idempotent_request`.
      const toFirst = sends.filter((s) => s.to === staffEmail);
      const toSecond = sends.filter((s) => s.to === secondEmail);
      expect(toFirst).toHaveLength(1);
      expect(toSecond).toHaveLength(1);
      expect(toFirst[0].idempotencyKey).toBe(`${apptKey}:${apptRunAt.toISOString()}:${staffId}`);
      expect(toSecond[0].idempotencyKey).toBe(`${apptKey}:${apptRunAt.toISOString()}:${second.id}`);

      const [job] = await db.select().from(schema.crmScheduledJobs)
        .where(eq(schema.crmScheduledJobs.dedupeKey, apptKey)).limit(1);

      // Two records for one occurrence of one job — which the old
      // (job, occurrence) identity could not represent at all.
      const rows = await deliveryRows(job.id);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.recipientStaffId).sort((a, b) => (a ?? 0) - (b ?? 0)))
        .toEqual([staffId, second.id].sort((a, b) => a - b));
      expect(rows.every((r) => r.state === "accepted")).toBe(true);
      expect(rows.every((r) => r.occurrenceAt.getTime() === apptRunAt.getTime())).toBe(true);
      expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(2);

      // And one recipient's unresolved delivery does not disturb the other's.
      const ours = rows.find((r) => r.recipientStaffId === staffId)!;
      const theirs = rows.find((r) => r.recipientStaffId === second.id)!;
      await db.update(schema.crmReminderDeliveries).set({
        state: "pending", attempt: 1, nextAttemptAt: new Date(), providerRef: null,
        failureReason: "never_left_this_server",
        failureDetail: "connect ECONNREFUSED 10.255.255.1:443",
      }).where(eq(schema.crmReminderDeliveries.id, theirs.id));

      sends.length = 0;
      await scheduler.processDueDeliveries();

      expect(sends.filter((s) => s.to === staffEmail)).toHaveLength(0);   // settled, left alone
      expect(sends.filter((s) => s.to === secondEmail)).toHaveLength(1);  // retried, as it should be

      const [oursAfter] = await db.select().from(schema.crmReminderDeliveries)
        .where(eq(schema.crmReminderDeliveries.id, ours.id));
      expect(oursAfter.state).toBe("accepted");
      expect(oursAfter.attempt).toBe(1);            // not touched at all
      const [theirsAfter] = await db.select().from(schema.crmReminderDeliveries)
        .where(eq(schema.crmReminderDeliveries.id, theirs.id));
      expect(theirsAfter.state).toBe("accepted");
      expect(theirsAfter.attempt).toBe(2);
    } finally {
      await db.delete(schema.crmScheduledJobs).where(eq(schema.crmScheduledJobs.dedupeKey, apptKey));
      await db.delete(schema.crmAppointmentAttendees)
        .where(eq(schema.crmAppointmentAttendees.appointmentId, appt.id));
      await db.delete(schema.crmAppointments).where(eq(schema.crmAppointments.id, appt.id));
      await db.delete(schema.crmNotifications).where(eq(schema.crmNotifications.staffId, second.id));
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, second.id));
    }
  });
});
