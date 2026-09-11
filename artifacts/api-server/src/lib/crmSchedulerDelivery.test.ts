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
 * The previous guard was a marker written BEFORE the request. It suppressed
 * the duplicate and, in doing so, suppressed every legitimate retry too: a
 * 500, a refused connection or a timeout left a marker that said "dispatched"
 * and the reminder was silently lost forever. These tests drive each of those
 * failures and assert the honest outcome — sent once, or visibly unresolved,
 * never silently dropped.
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

  it("reads 5xx and rate limits as failed — not accepted, safe to retry", () => {
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
  let staffId: number;
  let taskId: number;
  let jobId: number;
  let dedupeKey: string;
  let staffEmail: string;

  const STAMP = Date.now();

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    scheduler = await import("./crmScheduler.js");

    staffEmail = `delivery-${STAMP}@example.test`;
    const [staff] = await db.insert(schema.crmStaff).values({
      email: staffEmail,
      displayName: "[CRM-TEST] Delivery States",
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
    const { eq } = await import("drizzle-orm");
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
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey)).limit(1);
    return row;
  }

  /** Rewrites the row, then leaves it the way an expired lease leaves it. */
  async function reclaimable(patch: Partial<{
    runAt: Date; externalRef: string | null; externalDispatchedAt: Date | null; lastError: string | null;
  }> = {}) {
    const { eq } = await import("drizzle-orm");
    await db.update(schema.crmScheduledJobs).set({
      status: "pending", lockedAt: null, lockedBy: null, attempts: 0, ...patch,
    }).where(eq(schema.crmScheduledJobs.dedupeKey, dedupeKey));
  }

  /**
   * Parses `external_ref` by hand rather than through the scheduler's own
   * parser, so these assertions also pin the documented on-disk format:
   * newline-separated `<state>|<runAt ISO>#<staffId>|<attemptId>|<detail>`.
   */
  function records(ref: string | null) {
    if (!ref) return [];
    return ref.split("\n").map((line) => {
      const parts = line.split("|");
      const hash = (parts[1] ?? "").lastIndexOf("#");
      return {
        state: parts[0],
        occurrence: hash === -1 ? parts[1] : (parts[1] ?? "").slice(0, hash),
        staffId: hash === -1 ? null : Number((parts[1] ?? "").slice(hash + 1)),
        attemptId: parts[2],
        detail: parts.slice(3).join("|"),
      };
    });
  }
  /** The single record for this suite's staff member. */
  function record(ref: string | null) {
    return records(ref).find((r) => r.staffId === staffId) ?? null;
  }
  /** Builds a record the way the scheduler would write it. */
  const ref = (state: string, runAt: Date, attemptId: string, detail: string, who: number | null = staffId) =>
    `${state}|${runAt.toISOString()}${who === null ? "" : `#${who}`}|${attemptId}|${detail}`;

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
    const row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("accepted");
    expect(r.occurrence).toBe(row.runAt.toISOString());
    expect(r.detail).toBe("provider-1");
    expect(r.attemptId).toMatch(/^1\./);

    // The hand-off instant is still recorded, and still lands at or after this
    // occurrence — but it is no longer evidence of delivery on its own.
    expect(row.externalDispatchedAt!.getTime()).toBeGreaterThanOrEqual(row.runAt.getTime());

    // The key the provider sees is derived from the occurrence, not the clock,
    // so a retry of this same occurrence presents the same key.
    expect(mine()[0].idempotencyKey).toBe(keyFor(row.runAt));

    // A resolved success is not something an operator needs to look at.
    expect(await attentionRow()).toBeUndefined();
  });

  it("does NOT send again when the job is reclaimed after the provider accepted", async () => {
    // Resend said yes, then the worker died before settling, and the lock expired.
    const before = await jobRow();
    await reclaimable();
    const row = await jobRow();
    expect(row.status).toBe("pending");                        // genuinely reclaimable
    expect(record(row.externalRef)!.state).toBe("accepted");    // and it remembers the answer
    expect(row.runAt.getTime()).toBe(before.runAt.getTime());

    await scheduler.processDueJobs();

    // The job ran again — that is what a queue does — but no second message
    // was handed to the provider.
    expect(mine()).toHaveLength(0);
  });

  // ── failing before the provider is ever called ────────────────────────────

  it("writes NOTHING when mail is unconfigured, so the occurrence is not burned", async () => {
    // The regression this whole change exists for. The old code stamped the
    // dispatch marker before discovering that no send was possible, which
    // silently suppressed the reminder forever once mail WAS configured.
    blockedReason = "RESEND_API_KEY is not set on this server, so no mail can be sent.";
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    let row = await jobRow();
    expect(row.externalRef).toBeNull();
    expect(row.externalDispatchedAt).toBeNull();   // no trace at all
    expect(await attentionRow()).toBeUndefined();  // and nothing for an operator to chase

    // Configure mail, run the same occurrence again: it must still go out.
    blockedReason = null;
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("accepted");
  });

  // ── the provider answered: refusal ────────────────────────────────────────

  it("records a provider rejection as permanent, and retries it exactly zero times", async () => {
    respond = async () => ({
      sent: false, failure: "rejected", configured: true,
      reason: "The sending domain is not verified.",
    });
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    await scheduler.processDueJobs();

    // One call. Repeating a deterministic refusal is pure noise.
    expect(mine()).toHaveLength(1);
    const row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("rejected");
    expect(r.detail).toBe("The sending domain is not verified.");
    // Visible where an operator already looks.
    expect(row.lastError).toBe("delivery rejected: The sending domain is not verified.");

    const attention = await attentionRow();
    expect(attention?.state).toBe("rejected");
    expect(attention?.guidance).toMatch(/refused/i);
  });

  // ── the provider answered, and we never heard it ──────────────────────────

  it("records a lost response as uncertain, and never auto-retries it", async () => {
    // Resend accepted the message; the connection died before we read the
    // answer. A retry might duplicate, so the machine refuses to guess.
    respond = async () => ({
      sent: false, failure: "uncertain", configured: true, reason: "socket hang up",
    });
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    let row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("uncertain");
    expect(row.lastError).toBe("delivery uncertain: socket hang up");

    // Reclaim it as many times as you like: it stays put rather than sending a
    // second copy of something that may already have arrived.
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    await reclaimable();
    await scheduler.processDueJobs();
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);   // still only the original attempt
    row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("uncertain");

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.jobStatus).toBe("completed");  // the JOB succeeded; the DELIVERY did not
  });

  // ── the worker died mid-call ──────────────────────────────────────────────

  it("promotes an attempt that never resolved to uncertain instead of resending", async () => {
    // Exactly the crash window: the marker says a request went out, and no
    // answer was ever written down, because the process was killed between the
    // two. We cannot know whether a message exists.
    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("attempting", runAt, "1.abcdef", ""),
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);   // no second copy
    const row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("uncertain");
    expect(r.attemptId).toBe("1.abcdef");          // the same attempt, resolved honestly
    expect(r.detail).toMatch(/never resolved/i);
    expect(row.lastError).toMatch(/^delivery uncertain:/);

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
  });

  // ── transient failures, which are the ones that were being lost ───────────

  it("retries a transient failure in place and succeeds, reusing one idempotency key", async () => {
    // A 500 twice, then a yes. The old code sent nothing at all here: the
    // marker was already committed, so the reminder was lost in silence.
    let call = 0;
    respond = async (n) => {
      call += 1;
      if (call <= 2) {
        return { sent: false, failure: "failed", configured: true, reason: "Resend returned 500." };
      }
      return { sent: true, providerId: `provider-${n}` };
    };
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    await scheduler.processDueJobs();

    const attempts = mine();
    expect(attempts).toHaveLength(3);
    // Every attempt carried the SAME key, so if one of the "failures" had in
    // fact been accepted, Resend collapses the rest into it.
    expect(new Set(attempts.map((a) => a.idempotencyKey)).size).toBe(1);

    const row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("accepted");
    expect(r.attemptId).toMatch(/^3\./);
    expect(row.lastError).toBeNull();     // the earlier failures no longer stand
    expect(await attentionRow()).toBeUndefined();
  });

  it("leaves an exhausted transient failure visible, and retries it after a restart", async () => {
    respond = async () => ({
      sent: false, failure: "failed", configured: true, reason: "Resend returned 500.",
    });
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(3);            // bounded, not infinite
    let row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("failed");
    expect(row.lastError).toBe("delivery failed: Resend returned 500.");
    const attention = await attentionRow();
    expect(attention?.state).toBe("failed");
    expect(attention?.guidance).toMatch(/cannot duplicate/i);

    // A restart, or an operator re-running the job. `failed` means the provider
    // demonstrably never took the message, so attempting again is correct and
    // cannot duplicate.
    sends.length = 0;
    respond = async (n) => ({ sent: true, providerId: `provider-${n}` });
    await reclaimable();
    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("accepted");
    expect(r.attemptId).toMatch(/^4\./);       // attempt numbering continues
  });

  // ── two workers on the same row ───────────────────────────────────────────

  it("does not double-send when a lease expires while a send is in flight", async () => {
    // The hard case. Worker A is talking to Resend; its five-minute lease
    // expires; worker B reclaims the row and finds an unresolved attempt.
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

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

    // Worker B saw an in-flight attempt and refused to send a second copy.
    expect(mine()).toHaveLength(1);

    const row = await jobRow();
    const r = record(row.externalRef)!;
    // Worker B could only guess, and guessed "uncertain". Worker A then came
    // back with the actual answer and was allowed to improve its OWN attempt's
    // record — which is the truth, and better than the guess.
    expect(r.state).toBe("accepted");
    expect(r.detail).toBe("provider-A");
    expect(await attentionRow()).toBeUndefined();
  });

  it("stands down when it loses the claim race during a retry pause", async () => {
    // The one window where a worker holds a stale view of the row: it has
    // resolved a transient failure and is pausing before its next attempt. Its
    // lease expires in that pause and a second worker takes the occurrence
    // over. The first worker must notice it no longer owns the claim — if it
    // simply attempted anyway, both workers would be sending at once, which is
    // the double-send that the compare-and-set on `external_ref` prevents.
    await reclaimable({ externalRef: null, externalDispatchedAt: null, lastError: null });

    let interference: Promise<void> | null = null;
    respond = async (n) => {
      if (n === 1) {
        // Started, not awaited: it runs DURING this worker's 250 ms pause.
        // The 60 ms head start puts it after this attempt is written down and
        // well before the pause ends.
        interference = (async () => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          await reclaimable();
          await scheduler.processDueJobs();
        })();
        return { sent: false, failure: "failed", configured: true, reason: "Resend returned 500." };
      }
      return { sent: true, providerId: `provider-${n}` };
    };

    await scheduler.processDueJobs();
    await interference;

    // One failed attempt by the first worker, one successful attempt by the
    // second. A third would mean the first worker attempted on a claim it had
    // already lost.
    expect(mine()).toHaveLength(2);

    const r = record((await jobRow()).externalRef)!;
    expect(r.state).toBe("accepted");
    expect(r.detail).toBe("provider-2");
    expect(r.attemptId).toMatch(/^2\./);   // the second worker's attempt, not the first's
  });

  // ── the 24-hour horizon ───────────────────────────────────────────────────

  it("never auto-retries an uncertain occurrence, and says so once the 24h window closes", async () => {
    // The honest answer to "what happens past the idempotency window": the
    // automatic path does not go there at all, because an uncertain delivery is
    // never retried by a machine. What changes past 24h is what a HUMAN retry
    // would cost, and the operator view says so.
    const runAt = new Date(Date.now() - 48 * 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("uncertain", runAt, "1.oldone", "socket hang up"),
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    const row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("uncertain");

    const attention = await attentionRow();
    expect(attention?.state).toBe("uncertain");
    expect(attention?.idempotencyProtected).toBe(false);
    expect(attention?.guidance).toMatch(/second copy/i);
    expect(attention?.guidance).toMatch(/24-hour/i);
  });

  it("reports an uncertain delivery inside the window as still protected", async () => {
    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("uncertain", runAt, "1.recent", "socket hang up"),
      externalDispatchedAt: new Date(Date.now() - 60_000),
      lastError: null,
    });

    const attention = await attentionRow();
    expect(attention?.idempotencyProtected).toBe(true);
    expect(attention?.guidance).toMatch(/collapses it into the original send/i);
  });

  it("still retries a 48-hour-old FAILED occurrence, because nothing was ever delivered", async () => {
    // The window is irrelevant here, and this is the point of separating
    // `failed` from `uncertain`: the provider is known not to hold a copy, so
    // age cannot turn a retry into a duplicate.
    const runAt = new Date(Date.now() - 48 * 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("failed", runAt, "1.oldfail", "Resend returned 500."),
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    expect(mine()[0].idempotencyKey).toBe(keyFor(runAt));
    const row = await jobRow();
    expect(record(row.externalRef)!.state).toBe("accepted");
  });

  // ── rows written before this scheme existed ───────────────────────────────

  it("reads a legacy marker WITH a provider id as delivered", async () => {
    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: "re_legacy_123",                        // a bare provider id
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);
    expect((await jobRow()).externalRef).toBe("re_legacy_123");
  });

  it("reads a legacy marker WITHOUT a provider id as uncertain, not as delivered", async () => {
    // The old code's blind spot, preserved honestly: the marker only ever meant
    // "a request was started". Treating it as proof of delivery is what lost
    // messages, so it is promoted to a real uncertain record instead.
    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: null,
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    // It is visible as needing attention even before the worker touches it.
    expect((await attentionRow())?.state).toBe("uncertain");

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);                 // still no guessing
    const row = await jobRow();
    const all = records(row.externalRef);
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("uncertain");
    expect(all[0].occurrence).toBe(runAt.toISOString());
    // Written UNATTRIBUTED: the old marker never said who it was for, so it
    // covers every recipient of this occurrence rather than only the first one
    // the worker happened to process.
    expect(all[0].staffId).toBeNull();
    expect((await attentionRow())?.state).toBe("uncertain");
    expect((await attentionRow())?.staffId).toBeNull();
  });

  // ── recurrence, and the blast radius of the guard ─────────────────────────

  it("still sends for the next occurrence of a recurring job", async () => {
    // A daily reminder's second occurrence is a different occurrence, and the
    // first one's record must not suppress it — the opposite failure, where a
    // recurring reminder fires exactly once, ever.
    const previousRunAt = new Date(Date.now() - 2 * 3_600_000);
    const nextRunAt = new Date(Date.now() - 3_600_000);

    await reclaimable({
      runAt: nextRunAt,
      externalRef: ref("accepted", previousRunAt, "1.yesterday", "provider-yesterday"),
      externalDispatchedAt: previousRunAt,
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(1);
    // A different occurrence presents a different key, so the provider does
    // not collapse it into the previous send.
    expect(mine()[0].idempotencyKey).toBe(keyFor(nextRunAt));

    const row = await jobRow();
    const r = record(row.externalRef)!;
    expect(r.state).toBe("accepted");
    expect(r.occurrence).toBe(nextRunAt.toISOString());
  });

  it("suppresses only the email, never the in-app notification", async () => {
    // The in-app record is written in the same database as the job, so it has
    // no crash window and must not inherit the email's guard.
    const { eq, and } = await import("drizzle-orm");
    const count = async () => (await db.select().from(schema.crmNotifications).where(and(
      eq(schema.crmNotifications.staffId, staffId),
      eq(schema.crmNotifications.kind, "task_reminder"),
    ))).length;
    const before = await count();

    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("accepted", runAt, "1.already", "provider-earlier"),
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: null,
    });

    await scheduler.processDueJobs();

    expect(mine()).toHaveLength(0);                    // email withheld
    expect(await count()).toBeGreaterThan(before);     // notification still written
  });

  // ── one job row, several recipients ───────────────────────────────────────

  it("emails every attendee of one appointment, and records each separately", async () => {
    // An appointment reminder is ONE job row that emails every staff attendee.
    // A delivery record per occurrence would let attendee one's success
    // suppress attendee two's message — the same silent loss, wearing a
    // different hat. Records are therefore per recipient.
    const { eq } = await import("drizzle-orm");
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

      const [row] = await db.select().from(schema.crmScheduledJobs)
        .where(eq(schema.crmScheduledJobs.dedupeKey, apptKey)).limit(1);
      const all = records(row.externalRef);
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.staffId).sort()).toEqual([staffId, second.id].sort());
      expect(all.every((r) => r.state === "accepted")).toBe(true);

      // And one recipient's unresolved delivery does not disturb the other's.
      await db.update(schema.crmScheduledJobs).set({
        status: "pending", lockedAt: null, lockedBy: null, attempts: 0,
        externalRef: [
          ref("accepted", apptRunAt, "1.first", "provider-1", staffId),
          ref("failed", apptRunAt, "1.second", "Resend returned 500.", second.id),
        ].join("\n"),
      }).where(eq(schema.crmScheduledJobs.dedupeKey, apptKey));

      sends.length = 0;
      await scheduler.processDueJobs();

      expect(sends.filter((s) => s.to === staffEmail)).toHaveLength(0);   // settled, left alone
      expect(sends.filter((s) => s.to === secondEmail)).toHaveLength(1);  // retried, as it should be
    } finally {
      await db.delete(schema.crmScheduledJobs).where(eq(schema.crmScheduledJobs.dedupeKey, apptKey));
      await db.delete(schema.crmAppointmentAttendees)
        .where(eq(schema.crmAppointmentAttendees.appointmentId, appt.id));
      await db.delete(schema.crmAppointments).where(eq(schema.crmAppointments.id, appt.id));
      await db.delete(schema.crmNotifications).where(eq(schema.crmNotifications.staffId, second.id));
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, second.id));
    }
  });

  // ── the operator's question ───────────────────────────────────────────────

  it("answers 'which reminders are in an unknown delivery state?'", async () => {
    const runAt = new Date(Date.now() - 3_600_000);
    await reclaimable({
      runAt,
      externalRef: ref("uncertain", runAt, "2.query", "socket hang up"),
      externalDispatchedAt: new Date(runAt.getTime() + 1_000),
      lastError: "delivery uncertain: socket hang up",
    });

    const unknown = (await scheduler.listDeliveriesNeedingAttention(500))
      .filter((r) => r.state === "uncertain");
    const ours = unknown.find((r) => r.jobId === jobId);

    expect(ours).toBeDefined();
    expect(ours!.dedupeKey).toBe(dedupeKey);
    expect(ours!.kind).toBe("task_reminder");
    expect(ours!.attempt).toBe(2);
    expect(ours!.detail).toBe("socket hang up");
    expect(await scheduler.countDeliveriesNeedingAttention()).toBeGreaterThan(0);

    // And a human can close it, which is the only thing that ever should.
    await reclaimable({
      externalRef: ref("acknowledged", runAt, "2.query", "resent by hand, recipient confirmed"),
    });
    expect(await attentionRow()).toBeUndefined();

    await scheduler.processDueJobs();
    expect(mine()).toHaveLength(0);   // an acknowledged occurrence is settled
  });
});
