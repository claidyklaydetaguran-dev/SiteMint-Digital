/**
 * M4 acceptance — reminder delivery recovery, through the operator API.
 *
 * The properties under test are the ones that decide whether a person gets a
 * message twice, once, or never, so each is driven end to end against a real
 * PostgreSQL database and the real Express app rather than asserted about a
 * helper:
 *
 *  - a retry is the SAME occurrence — it moves nothing but the next attempt;
 *  - a retry cannot duplicate an in-app notification either;
 *  - a deliberate re-send is a different act, needs saying so, and gets a new
 *    idempotency key;
 *  - an unknown outcome can be closed by a person, with a reason, and is never
 *    closed by a machine;
 *  - a 5xx is unknown, not "not sent";
 *  - no unresolved record can be hidden by a display limit;
 *  - a delivery a killed worker left in flight comes back;
 *  - two workers cannot both send the same occurrence to the same person.
 *
 * Gated on CRM_TEST_DATABASE_URL. Skips without it so CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "m4-delivery-admin-secret";

type MockOutcome =
  | { sent: true; providerId: string | null }
  | {
      sent: false;
      failure: "not_configured" | "rejected" | "failed" | "uncertain";
      reason: string;
      configured: boolean;
    };

/**
 * Stands in for Resend. Records every attempted send — which is the only way a
 * duplicate is visible — answers however the test under way needs, and never
 * touches a network.
 */
const sends: { to: string; subject: string; idempotencyKey?: string }[] = [];
let blockedReason: string | null = null;
let respond: (n: number) => Promise<MockOutcome> = async (n) => ({ sent: true, providerId: `provider-${n}` });

vi.mock("../lib/staffMail.js", () => ({
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

const STAMP = Date.now();
const OWNER = {
  email: `m4-delivery-${STAMP}@example.test`,
  name: "[CRM-TEST] M4 Delivery Owner",
  password: "kingfisher-lantern-7741",
};

/** Answers that put a delivery into each interesting state. */
const ANSWERS = {
  accepted: async (n: number): Promise<MockOutcome> => ({ sent: true, providerId: `provider-${n}` }),
  lostResponse: async (): Promise<MockOutcome> => ({
    sent: false, failure: "uncertain", configured: true, reason: "socket hang up",
  }),
  serverError: async (): Promise<MockOutcome> => ({
    // staffMail classifies a 5xx as `failed`. The delivery layer does NOT read
    // that as "not sent" — see the test that pins it.
    sent: false, failure: "failed", configured: true, reason: "Resend returned 500 internal_server_error.",
  }),
  neverConnected: async (): Promise<MockOutcome> => ({
    sent: false, failure: "failed", configured: true,
    reason: "connect ECONNREFUSED 10.255.255.1:443",
  }),
  refused: async (): Promise<MockOutcome> => ({
    sent: false, failure: "rejected", configured: true, reason: "The sending domain is not verified.",
  }),
};

const suite = TEST_DB ? describe : describe.skip;

suite("M4 reminder delivery recovery (real DB)", () => {
  let server: http.Server;
  let base: string;

  class Agent {
    cookie = ""; csrf = "";
    async call(method: string, p: string, body?: unknown) {
      const headers: Record<string, string> = {};
      if (this.cookie) headers["Cookie"] = this.cookie;
      if (this.csrf) headers["x-csrf-token"] = this.csrf;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${base}${p}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const pair = c.split(";")[0];
        if (pair.startsWith("crm_staff_session=")) this.cookie = pair.endsWith("=") ? "" : pair;
      }
      const text = await res.text();
      let json: Record<string, any> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      return { status: res.status, json };
    }
    async login(who: { email: string; password: string }) {
      const r = await this.call("POST", "/api/crm/staff/login", { email: who.email, password: who.password });
      if (typeof r.json["csrfToken"] === "string") this.csrf = r.json["csrfToken"];
      return r;
    }
  }

  const owner = new Agent();
  let ownerId = 0;
  let ownerEmail = "";

  async function wipe() {
    const {
      db, crmStaff, crmStaffLoginAttempts, crmScheduledJobs, crmNotifications,
      crmReminderDeliveries, crmDeliveryRecoveryActions,
    } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.delete(crmDeliveryRecoveryActions);
    await db.delete(crmReminderDeliveries);
    await db.delete(crmScheduledJobs);
    await db.delete(crmNotifications);
    await db.execute(sql`DELETE FROM crm_tasks WHERE title LIKE '%CRM-TEST%'`);
    await db.delete(crmStaff);
    await db.delete(crmStaffLoginAttempts);
  }

  beforeAll(async () => {
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: express.Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await wipe();
    await owner.call("POST", "/api/crm/staff/bootstrap", {
      adminPassword: "m4-delivery-admin-secret", email: OWNER.email,
      displayName: OWNER.name, password: OWNER.password,
    });
    await owner.login(OWNER);
    const me = await owner.call("GET", "/api/crm/staff/me");
    ownerId = me.json["staff"].id;
    ownerEmail = me.json["staff"].email;

    // The email path only runs for somebody who asked for reminder email.
    const prefs = await owner.call("PATCH", "/api/crm/operations/reminder-preferences", {
      reminderEmailEnabled: true, timezone: "UTC",
    });
    expect(prefs.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) await wipe();
    await new Promise<void>((res, rej) => server.close((e) => e ? rej(e) : res()));
  }, 60_000);

  beforeEach(() => {
    sends.length = 0;
    blockedReason = null;
    respond = ANSWERS.accepted;
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Only this suite's sends — a worker pass claims every due job there is. */
  const mine = () => sends.filter((s) => s.to === ownerEmail);

  /**
   * Creates a task whose reminder is already due and runs the queue once, so
   * exactly one delivery exists in whatever state `respond` produces.
   */
  async function fireReminder(title: string): Promise<{ taskId: number; delivery: any }> {
    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: `[CRM-TEST] ${title}`,
      assignedToStaffId: ownerId,
      remindAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(created.status).toBe(201);
    const taskId = created.json["task"].id as number;

    const { processDueJobs } = await import("../lib/crmScheduler.js");
    await processDueJobs();

    return { taskId, delivery: await deliveryForTask(taskId) };
  }

  async function deliveryForTask(taskId: number) {
    const { db, crmReminderDeliveries, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [job] = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`)).limit(1);
    const [row] = await db.select().from(crmReminderDeliveries)
      .where(eq(crmReminderDeliveries.jobId, job.id)).limit(1);
    return row;
  }

  async function jobForTask(taskId: number) {
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [job] = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`)).limit(1);
    return job;
  }

  async function notificationsFor(taskId: number) {
    const { db, crmNotifications } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    return db.select().from(crmNotifications).where(and(
      eq(crmNotifications.staffId, ownerId),
      eq(crmNotifications.entityType, "task"),
      eq(crmNotifications.entityId, taskId),
    ));
  }

  // ── 1. A retry is the same occurrence ─────────────────────────────────────

  it("retrying preserves the occurrence, recipient, message and idempotency key, and moves only the next attempt", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("retry keeps its identity");

    expect(mine()).toHaveLength(1);
    expect(delivery.state).toBe("uncertain");
    expect(delivery.nextAttemptAt).toBeNull();     // never retried by a machine

    const jobBefore = await jobForTask(taskId);
    const before = {
      occurrenceAt: delivery.occurrenceAt.toISOString(),
      recipientStaffId: delivery.recipientStaffId,
      subject: delivery.subject,
      body: delivery.body,
      idempotencyKey: delivery.idempotencyKey,
    };

    const retried = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/retry`, {
      reason: "The recipient says nothing arrived and the attempt was minutes ago.",
    });
    expect(retried.status).toBe(200);

    const after = await deliveryForTask(taskId);
    expect(after.occurrenceAt.toISOString()).toBe(before.occurrenceAt);
    expect(after.recipientStaffId).toBe(before.recipientStaffId);
    expect(after.subject).toBe(before.subject);
    expect(after.body).toBe(before.body);
    expect(after.idempotencyKey).toBe(before.idempotencyKey);
    // The ONE thing that moved.
    expect(after.state).toBe("pending");
    expect(after.nextAttemptAt).not.toBeNull();

    // And the job's own occurrence is untouched — this is the defect the old
    // `run_at = now()` retry introduced.
    const jobAfter = await jobForTask(taskId);
    expect(jobAfter.runAt.toISOString()).toBe(jobBefore.runAt.toISOString());
    expect(after.occurrenceAt.toISOString()).toBe(jobAfter.runAt.toISOString());

    // The actual retry carries the SAME key, so the provider collapses it.
    respond = ANSWERS.accepted;
    const { processDueDeliveries } = await import("../lib/crmScheduler.js");
    await processDueDeliveries();

    expect(mine()).toHaveLength(2);
    expect(mine()[1].idempotencyKey).toBe(before.idempotencyKey);
    const settled = await deliveryForTask(taskId);
    expect(settled.state).toBe("accepted");
    // A recovery a person asked for, which then worked, closes the case in
    // their name rather than anonymously.
    expect(settled.resolution).toBe("accepted");
    expect(settled.resolvedByStaffId).toBe(ownerId);
  }, 60_000);

  // ── 2. A retry does not duplicate the in-app notification ─────────────────

  it("does not write a second in-app notification when the same occurrence runs again", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("one notification per occurrence");
    expect(await notificationsFor(taskId)).toHaveLength(1);

    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { processDueJobs, processDueDeliveries } = await import("../lib/crmScheduler.js");

    // Exactly what a reclaimed lease, or an operator re-queueing the job,
    // leaves behind: the same occurrence, ready to run again.
    await db.update(crmScheduledJobs)
      .set({ status: "pending", lockedAt: null, lockedBy: null, attempts: 0 })
      .where(eq(crmScheduledJobs.id, delivery.jobId));
    await processDueJobs();
    expect(await notificationsFor(taskId)).toHaveLength(1);

    // ...and neither does a delivery retry, which runs the send but not the
    // handler.
    await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/retry`, {
      reason: "Checking that a retry does not notify twice.",
    });
    respond = ANSWERS.accepted;
    await processDueDeliveries();
    expect(await notificationsFor(taskId)).toHaveLength(1);

    // The reminder itself still went out again, so this is a dedupe of the
    // notification and not of the work.
    expect(mine().length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  // ── 3. A re-send is a different act ───────────────────────────────────────

  it("refuses a re-send without explicit confirmation, then issues a NEW idempotency key", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("resend is deliberate");
    const originalKey = delivery.idempotencyKey;

    const unconfirmed = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/resend`, {
      reason: "They say it never arrived.",
    });
    expect(unconfirmed.status).toBe(400);
    expect(String(unconfirmed.json["error"])).toMatch(/confirmDuplicateRisk/);
    // The refusal has to EXPLAIN the risk, not merely mention a flag.
    expect(String(unconfirmed.json["duplicateRisk"])).toMatch(/second copy|two/i);

    // A truthy-but-not-true value must not be able to agree on somebody's behalf.
    const sloppy = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/resend`, {
      reason: "They say it never arrived.", confirmDuplicateRisk: "yes",
    });
    expect(sloppy.status).toBe(400);

    const confirmed = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/resend`, {
      reason: "Spoke to them; they never got it and accept a possible duplicate.",
      confirmDuplicateRisk: true,
    });
    expect(confirmed.status).toBe(200);

    const after = await deliveryForTask(taskId);
    expect(after.idempotencyKey).not.toBe(originalKey);
    expect(after.resendCount).toBe(1);
    // Same occurrence and recipient — a re-send is a second copy of THIS
    // message, not a different message.
    expect(after.occurrenceAt.toISOString()).toBe(delivery.occurrenceAt.toISOString());
    expect(after.recipientStaffId).toBe(delivery.recipientStaffId);

    respond = ANSWERS.accepted;
    const { processDueDeliveries } = await import("../lib/crmScheduler.js");
    await processDueDeliveries();
    expect(mine()).toHaveLength(2);
    expect(mine()[1].idempotencyKey).toBe(after.idempotencyKey);
    expect(mine()[1].idempotencyKey).not.toBe(originalKey);

    // And the duplicate risk the operator was shown is recorded against it.
    const detail = await owner.call("GET", `/api/crm/operations/deliveries/${delivery.id}`);
    const actions = detail.json["recoveryActions"] as {
      action: string; duplicateRisk: string | null; newIdempotencyKey: string | null;
    }[];
    const resend = actions.find((a) => a.action === "resend")!;
    expect(resend.duplicateRisk).toBeTruthy();
    expect(resend.newIdempotencyKey).toBe(after.idempotencyKey);
  }, 60_000);

  // ── 4. A person can close an unknown outcome ──────────────────────────────

  it("acknowledges an unknown delivery through the API, recording who and why", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("acknowledge closes it");
    expect(delivery.state).toBe("uncertain");

    // A recovery with no reason is not a record.
    const noReason = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/acknowledge`, {});
    expect(noReason.status).toBe(400);

    const reason = "Called them; the reminder did arrive. Closing without sending anything.";
    const ok = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/acknowledge`, { reason });
    expect(ok.status).toBe(200);

    const after = await deliveryForTask(taskId);
    expect(after.resolution).toBe("acknowledged");
    expect(after.resolvedByStaffId).toBe(ownerId);
    expect(after.resolutionNote).toBe(reason);
    expect(after.resolvedAt).not.toBeNull();
    // The FACT is unchanged — we still do not know. Only the case is closed.
    expect(after.state).toBe("uncertain");

    const detail = await owner.call("GET", `/api/crm/operations/deliveries/${delivery.id}`);
    const actions = detail.json["recoveryActions"] as {
      action: string; reason: string; actorStaffId: number | null; actorLabel: string; createdAt: string;
    }[];
    const ack = actions.find((a) => a.action === "acknowledge")!;
    expect(ack.reason).toBe(reason);
    expect(ack.actorStaffId).toBe(ownerId);
    expect(ack.actorLabel).toBe(OWNER.name);
    expect(Number.isFinite(Date.parse(ack.createdAt))).toBe(true);

    // Acknowledging nothing twice is not a thing.
    const again = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/acknowledge`, { reason });
    expect(again.status).toBe(409);

    // It drops off the unresolved list, and acknowledging it never sent anything.
    const list = await owner.call("GET", "/api/crm/operations/deliveries?limit=100");
    expect((list.json["deliveries"] as { deliveryId: number }[])
      .some((d) => d.deliveryId === delivery.id)).toBe(false);
    expect(mine()).toHaveLength(1);
  }, 60_000);

  it("clears a scheduled attempt when a person closes the case", async () => {
    // Found by running it: acknowledging a row that was still queued for an
    // automatic attempt left `next_attempt_at` set. The worker skips a resolved
    // row, so nothing would have been sent — but the operator view was telling
    // a person an attempt was coming that never would. "No time set" is what
    // "nothing is scheduled" means in this schema, and closing a case has to
    // make it true.
    respond = ANSWERS.neverConnected;
    const { taskId } = await fireReminder("acknowledge clears the schedule");

    const scheduled = await deliveryForTask(taskId);
    expect(scheduled.state).toBe("pending");
    expect(scheduled.nextAttemptAt).not.toBeNull();

    const closed = await owner.call(
      "POST", `/api/crm/operations/deliveries/${scheduled.id}/acknowledge`,
      { reason: "Handled out of band; stop trying." },
    );
    expect(closed.status).toBe(200);

    const after = await deliveryForTask(taskId);
    expect(after.resolution).toBe("acknowledged");
    expect(after.nextAttemptAt).toBeNull();

    // And it is genuinely inert: a worker pass neither sends nor re-opens it.
    const sentSoFar = mine().length;
    const { processDueDeliveries } = await import("../lib/crmScheduler.js");
    await processDueDeliveries();
    expect(mine()).toHaveLength(sentSoFar);
  }, 60_000);

  // ── 5. An unknown outcome is never retried by a machine ───────────────────

  it("never auto-retries an unknown delivery, no matter how many passes run", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("unknown stays put");
    expect(mine()).toHaveLength(1);

    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { processDueJobs, processDueDeliveries } = await import("../lib/crmScheduler.js");

    respond = ANSWERS.accepted;   // it WOULD succeed, if anything tried
    for (let i = 0; i < 3; i += 1) {
      await db.update(crmScheduledJobs)
        .set({ status: "pending", lockedAt: null, lockedBy: null, attempts: 0 })
        .where(eq(crmScheduledJobs.id, delivery.jobId));
      await processDueJobs();
      await processDueDeliveries();
    }

    expect(mine()).toHaveLength(1);   // still the original attempt, and only it
    const after = await deliveryForTask(taskId);
    expect(after.state).toBe("uncertain");
    expect(after.nextAttemptAt).toBeNull();
    expect(after.attempt).toBe(1);
  }, 60_000);

  // ── 6. A 5xx is unknown, not "not sent" ───────────────────────────────────

  it("reads a 5xx as an unknown outcome, and a refused connection as provably unsent", async () => {
    respond = ANSWERS.serverError;
    const { taskId } = await fireReminder("a 500 proves nothing");

    const afterFiveHundred = await deliveryForTask(taskId);
    // The provider ANSWERED, which means it had already received the request.
    // "It did not go" is a guess, and guessing it is how duplicates happen.
    expect(afterFiveHundred.state).toBe("uncertain");
    expect(afterFiveHundred.failureReason).toBe("provider_answered_but_outcome_unknown");
    expect(afterFiveHundred.nextAttemptAt).toBeNull();   // and therefore not auto-retried

    // A connection that never opened is a different fact entirely: the request
    // was never written, so nothing can exist and a retry cannot duplicate.
    respond = ANSWERS.neverConnected;
    const other = await fireReminder("a refused connection is unsent");
    const afterRefusedConnection = await deliveryForTask(other.taskId);
    expect(afterRefusedConnection.state).toBe("pending");
    expect(afterRefusedConnection.failureReason).toBe("never_left_this_server");
    expect(afterRefusedConnection.nextAttemptAt).not.toBeNull();   // it WILL try again

    // A refusal from the provider is a third thing: it looked and said no.
    respond = ANSWERS.refused;
    const third = await fireReminder("a refusal is a refusal");
    const afterRefusal = await deliveryForTask(third.taskId);
    expect(afterRefusal.state).toBe("refused");
    expect(afterRefusal.nextAttemptAt).toBeNull();
  }, 90_000);

  // ── 7. Nothing unresolved is hidden by a display limit ────────────────────

  it("keeps every unresolved delivery reachable past the display limit", async () => {
    const { processDueJobs } = await import("../lib/crmScheduler.js");
    respond = ANSWERS.lostResponse;

    const HOW_MANY = 12;
    const PAGE = 5;    // deliberately smaller, so the set cannot fit in one page
    const taskIds: number[] = [];
    for (let i = 0; i < HOW_MANY; i += 1) {
      const created = await owner.call("POST", "/api/crm/operations/tasks", {
        title: `[CRM-TEST] paging probe ${i}`,
        assignedToStaffId: ownerId,
        remindAt: new Date(Date.now() - 60_000).toISOString(),
      });
      taskIds.push(created.json["task"].id as number);
    }
    await processDueJobs();

    const expected = new Set<number>();
    for (const taskId of taskIds) expected.add((await deliveryForTask(taskId)).id);
    expect(expected.size).toBe(HOW_MANY);

    // Walk every page on the cursor and prove the set is complete.
    const seen = new Set<number>();
    let cursor: number | null = null;
    let pages = 0;
    do {
      const url = `/api/crm/operations/deliveries?limit=${PAGE}${cursor === null ? "" : `&cursor=${cursor}`}`;
      const page: { status: number; json: Record<string, any> } = await owner.call("GET", url);
      expect(page.status).toBe(200);
      const rows = page.json["deliveries"] as { deliveryId: number }[];
      expect(rows.length).toBeLessThanOrEqual(PAGE);
      for (const r of rows) seen.add(r.deliveryId);
      cursor = page.json["nextCursor"] as number | null;
      pages += 1;
      expect(pages).toBeLessThan(50);   // a cursor that does not advance is a bug
    } while (cursor !== null);

    for (const id of expected) expect(seen.has(id)).toBe(true);
    expect(pages).toBeGreaterThan(HOW_MANY / PAGE);

    // The count describes the whole filtered set, not the visible page.
    const first = await owner.call("GET", `/api/crm/operations/deliveries?limit=${PAGE}`);
    expect(first.json["counts"].matchingFilters).toBeGreaterThanOrEqual(HOW_MANY);
    expect((first.json["deliveries"] as unknown[]).length).toBe(PAGE);

    // ...and the jobs screen's preview says how many there really are, so a
    // capped list cannot read as a complete one.
    const jobs = await owner.call("GET", "/api/crm/operations/jobs?limit=3");
    expect(jobs.json["deliveriesNeedingAttentionTotal"]).toBeGreaterThanOrEqual(HOW_MANY);
    expect(String(jobs.json["deliveryNote"])).toMatch(/pages through every one/i);

    // Filtering by state is over the same set.
    const unknownOnly = await owner.call("GET", "/api/crm/operations/deliveries?state=uncertain&limit=100");
    expect((unknownOnly.json["deliveries"] as { state: string }[]).every((d) => d.state === "uncertain")).toBe(true);
  }, 120_000);

  // ── 8. A killed worker loses nothing ──────────────────────────────────────

  it("recovers a delivery a killed worker left in flight, without sending a second copy", async () => {
    respond = ANSWERS.accepted;
    const { taskId, delivery } = await fireReminder("worker restart");
    expect(mine()).toHaveLength(1);

    const { db, crmReminderDeliveries } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    const { processDueJobs } = await import("../lib/crmScheduler.js");

    // Exactly what a process killed between handing the message over and
    // writing down the answer leaves behind.
    await db.update(crmReminderDeliveries).set({
      state: "attempting", providerRef: null, resolution: null, resolvedAt: null,
      attemptWorker: "dead-worker", attemptStartedAt: sql`now() - interval '10 minutes'`,
      nextAttemptAt: null,
    }).where(eq(crmReminderDeliveries.id, delivery.id));

    sends.length = 0;
    await processDueJobs();

    const after = await deliveryForTask(taskId);
    // Not re-sent — we do not know whether a message exists...
    expect(mine()).toHaveLength(0);
    // ...and not lost either: it is a visible, actionable fact.
    expect(after.state).toBe("uncertain");
    expect(after.failureReason).toBe("worker_lost_mid_send");
    expect(after.attemptWorker).toBeNull();

    const list = await owner.call("GET", "/api/crm/operations/deliveries?limit=100");
    const row = (list.json["deliveries"] as { deliveryId: number; availableActions: string[] }[])
      .find((d) => d.deliveryId === delivery.id);
    expect(row).toBeDefined();
    expect(row!.availableActions).toContain("acknowledge");
    expect(row!.availableActions).toContain("resend");
  }, 60_000);

  // ── 9. Two workers, one message ───────────────────────────────────────────

  it("never lets two workers send the same occurrence to the same person", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("one message, two workers");

    await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/retry`, {
      reason: "Racing two workers at this on purpose.",
    });

    sends.length = 0;
    respond = ANSWERS.accepted;
    const { processDueDeliveries } = await import("../lib/crmScheduler.js");

    // Two passes genuinely interleaved: the claim is one conditional UPDATE, so
    // the loser matches no row rather than sending a second copy.
    const [a, b] = await Promise.all([processDueDeliveries(), processDueDeliveries()]);
    expect(a.attempted + b.attempted).toBe(1);
    expect(mine()).toHaveLength(1);

    const after = await deliveryForTask(taskId);
    expect(after.state).toBe("accepted");
    expect(after.attempt).toBe(2);   // the original, plus exactly one retry
  }, 60_000);

  // ── 9b. The job-level retry keeps the occurrence too ──────────────────────

  it("re-queues a failed job at its original run time rather than inventing a new occurrence", async () => {
    respond = ANSWERS.lostResponse;
    const { taskId, delivery } = await fireReminder("job retry keeps run_at");

    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const before = await jobForTask(taskId);

    // What the queue leaves behind when a job exhausts its attempts.
    await db.update(crmScheduledJobs)
      .set({ status: "failed", attempts: 5, lastError: "something went wrong in the handler" })
      .where(eq(crmScheduledJobs.id, delivery.jobId));

    const requeued = await owner.call("POST", `/api/crm/operations/jobs/${delivery.jobId}/retry`);
    expect(requeued.status).toBe(200);
    expect(requeued.json["job"].status).toBe("pending");

    const after = await jobForTask(taskId);
    // `run_at = now()` would make this a DIFFERENT occurrence: a new
    // idempotency identity, no prior delivery record, and therefore no
    // protection at all from the provider.
    expect(after.runAt.toISOString()).toBe(before.runAt.toISOString());
    expect(after.lastError).toBeNull();
    expect(after.attempts).toBe(0);

    // The existing delivery record still belongs to this occurrence, so
    // re-running the job cannot create a second, unprotected one.
    const { processDueJobs } = await import("../lib/crmScheduler.js");
    respond = ANSWERS.accepted;
    await processDueJobs();

    const rows = await db.select().from((await import("@workspace/db")).crmReminderDeliveries)
      .where(eq((await import("@workspace/db")).crmReminderDeliveries.jobId, delivery.jobId));
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrenceAt.toISOString()).toBe(before.runAt.toISOString());
    // ...and the unknown outcome was still not retried by a machine.
    expect(rows[0].state).toBe("uncertain");
    expect(mine()).toHaveLength(1);
  }, 60_000);

  // ── 10. The old packed records survive the move ───────────────────────────

  it("migrates the packed external_ref column without guessing at or dropping anything", async () => {
    const { db, crmScheduledJobs, crmReminderDeliveries } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { migratePackedDeliveryRecords } = await import("../lib/crmScheduler.js");

    const runAt = new Date("2026-08-01T09:00:00.000Z");
    const dedupeKey = `legacy-packed-${STAMP}`;
    const garbage = "this line is not a delivery record at all";
    const [job] = await db.insert(crmScheduledJobs).values({
      kind: "task_reminder", dedupeKey, runAt, payload: {}, status: "completed",
      externalDispatchedAt: new Date(runAt.getTime() + 1000),
      externalRef: [
        `accepted|${runAt.toISOString()}#${ownerId}|1.aaaaaa|provider-legacy-1`,
        `uncertain|${runAt.toISOString()}#${ownerId + 1}|2.bbbbbb|socket hang up`,
        `failed|${runAt.toISOString()}#${ownerId + 2}|1.cccccc|Resend returned 500.`,
        `failed|${runAt.toISOString()}#${ownerId + 3}|1.dddddd|connect ECONNREFUSED 10.0.0.1:443`,
        garbage,
      ].join("\n"),
    }).returning();

    const first = await migratePackedDeliveryRecords();
    expect(first.migrated).toBeGreaterThanOrEqual(5);
    expect(first.unparsed).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(crmReminderDeliveries)
      .where(eq(crmReminderDeliveries.jobId, job.id));
    expect(rows).toHaveLength(5);

    const byStaff = (id: number | null) => rows.find((r) => r.recipientStaffId === id)!;
    expect(byStaff(ownerId).state).toBe("accepted");
    expect(byStaff(ownerId).providerRef).toBe("provider-legacy-1");
    expect(byStaff(ownerId + 1).state).toBe("uncertain");

    // A legacy `failed` is re-read under the CURRENT rule rather than trusted:
    // a 5xx becomes unknown, and a connection that never opened stays unsent.
    expect(byStaff(ownerId + 2).state).toBe("uncertain");
    expect(byStaff(ownerId + 2).failureReason).toBe("provider_answered_but_outcome_unknown");
    expect(byStaff(ownerId + 3).state).toBe("pending");
    expect(byStaff(ownerId + 3).failureReason).toBe("never_left_this_server");

    // The line nobody could read was NOT dropped and NOT guessed at.
    const unreadable = rows.find((r) => r.origin === "migrated_unparsed")!;
    expect(unreadable).toBeDefined();
    expect(unreadable.legacyRaw).toBe(garbage);
    expect(unreadable.state).toBe("uncertain");
    expect(unreadable.failureReason).toBe("unparsed_legacy_record");

    // The source column is not cleared, so the history survives even a rollback.
    const [reread] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.id, job.id));
    expect(reread.externalRef).toContain(garbage);

    // Re-running changes nothing.
    const second = await migratePackedDeliveryRecords();
    expect(second.migrated).toBe(0);
    const after = await db.select().from(crmReminderDeliveries)
      .where(eq(crmReminderDeliveries.jobId, job.id));
    expect(after).toHaveLength(5);

    // Every unresolved one is on the operator list, which is the point of
    // migrating them at all.
    const list = await owner.call("GET", "/api/crm/operations/deliveries?limit=100");
    const ids = new Set((list.json["deliveries"] as { deliveryId: number }[]).map((d) => d.deliveryId));
    for (const row of after.filter((r) => r.state !== "accepted")) {
      expect(ids.has(row.id)).toBe(true);
    }
  }, 60_000);

  // ── The shape an operator actually reads ──────────────────────────────────

  it("shows the operator the recipient, occurrence, attempt, provider reference, outcome and reason", async () => {
    respond = ANSWERS.lostResponse;
    const { delivery } = await fireReminder("operator row");

    const list = await owner.call("GET", "/api/crm/operations/deliveries?limit=100");
    expect(list.status).toBe(200);
    const row = (list.json["deliveries"] as any[]).find((d) => d.deliveryId === delivery.id)!;

    expect(row.recipientName).toBe(OWNER.name);
    expect(row.recipientEmail).toBe(ownerEmail);
    expect(row.occurrence).toBe(delivery.occurrenceAt.toISOString());
    expect(row.attempt).toBe(1);
    expect(row.providerRef).toBeNull();
    expect(row.state).toBe("uncertain");
    expect(row.failureDetail).toBe("socket hang up");
    expect(typeof row.guidance).toBe("string");
    expect(row.guidance.length).toBeGreaterThan(20);
    expect(Array.isArray(row.availableActions)).toBe(true);
    expect(typeof row.resendDuplicateRisk).toBe("string");

    // The definitions travel with the figures, so a number on screen cannot
    // mean something different from what it says.
    const defs = list.json["definitions"] as Record<string, string>;
    expect(defs["occurrence"]).toMatch(/never changes/i);
    expect(defs["unknown"]).toMatch(/never retried automatically/i);
    expect(defs["paging"]).toMatch(/cursor/i);
  }, 60_000);

  it("withdraws retry once the idempotency window has closed, leaving only a deliberate re-send", async () => {
    respond = ANSWERS.lostResponse;
    const { delivery } = await fireReminder("stale unknown");

    const { db, crmReminderDeliveries } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    // Age the attempt past Resend's 24-hour key retention.
    await db.update(crmReminderDeliveries).set({
      attemptStartedAt: sql`now() - interval '30 hours'`,
      updatedAt: sql`now() - interval '30 hours'`,
    }).where(eq(crmReminderDeliveries.id, delivery.id));

    const list = await owner.call("GET", "/api/crm/operations/deliveries?limit=100");
    const row = (list.json["deliveries"] as any[]).find((d) => d.deliveryId === delivery.id)!;
    expect(row.idempotencyProtected).toBe(false);
    // "Retry cannot duplicate" stays true because retry is withdrawn exactly
    // where it would stop being true.
    expect(row.availableActions).not.toContain("retry");
    expect(row.availableActions).toContain("resend");
    expect(row.guidance).toMatch(/24-hour/i);

    const refused = await owner.call("POST", `/api/crm/operations/deliveries/${delivery.id}/retry`, {
      reason: "Trying to retry something that is no longer protected.",
    });
    expect(refused.status).toBe(409);
    expect(String(refused.json["error"])).toMatch(/second copy|Re-send/i);
    expect(mine()).toHaveLength(1);
  }, 60_000);
});
