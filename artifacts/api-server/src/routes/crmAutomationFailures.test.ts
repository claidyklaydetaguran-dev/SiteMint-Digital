/**
 * M6 — automation that failed, made visible, with two recovery verbs that are
 * not the same act.
 *
 * `docs/crm-ops/COMPLETENESS-2026-09-14.md` area 10: "No UI surfaces failed
 * automation events — visible only by querying the table." The properties worth
 * testing hardest here are the ones that hurt when they are wrong, and they are
 * all variations on "the button did more than it said":
 *
 *   - A retry that repeats a side effect. Tested in both directions: an event
 *     whose rule ALREADY ran must not produce a second execution or a second
 *     task, and a run whose first step already succeeded must not run that step
 *     again when its second step is retried.
 *   - A retry offered where it cannot be safe. A run whose step came back
 *     `unknown` must be REFUSED, because the write may already have landed —
 *     and the refusal must say so rather than failing silently.
 *   - A retry that walks past a loop brake. Both brakes are asserted: the
 *     stopped run itself cannot be retried at all, and retrying the EVENT
 *     behind it re-enters the brake rather than going around it.
 *   - An acknowledgement that re-runs something. Asserted as an invariant: the
 *     automation row is byte-identical afterwards, including `updated_at`, and
 *     nothing new exists anywhere.
 *   - A refused write that writes anyway. The restricted user is refused and
 *     the database is then checked to prove nothing moved.
 *   - A list that looks complete and is not. Every page is walked and the
 *     collected set is compared with the whole-set count the response labels
 *     itself with.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 *
 * The REAL app, plus the same one-line router registration `crmAutomation.test.ts`
 * performs, so the production stack (CORS, cookies, the boot gate, staff auth,
 * CSRF, the JSON body parser) is what answers.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "automation-failures-admin-secret";

const STAMP = Date.now();
const OWNER = {
  email: `fail-owner-${STAMP}@example.test`, name: "[CRM-TEST] Failure Owner",
  password: "harbour-trellis-5521",
};
const RESTRICTED = {
  email: `fail-restricted-${STAMP}@example.test`, name: "[CRM-TEST] Failure Restricted",
  password: "verdant-copper-8890",
};

const suite = TEST_DB ? describe : describe.skip;

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}
  async call(method: string, p: string, body?: unknown) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["Cookie"] = this.cookie;
    if (this.csrf) headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    return { status: res.status, json, text };
  }
  async login(who: { email: string; password: string }) {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const data = await res.json() as { csrfToken?: string };
    this.csrf = data.csrfToken ?? "";
    return res.status;
  }
}

suite("automation failures: visibility and safe recovery (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let engine: typeof import("../lib/automationEngine.js");
  let sweep: typeof import("../lib/automationSweep.js");

  const staffIds: Record<string, number> = {};
  const ruleIds: number[] = [];
  const leadIds: number[] = [];
  const eventIds: number[] = [];

  const owner = new Agent(() => base);
  const restricted = new Agent(() => base);

  // A clock the tests own. The recovery ROUTES stamp the real clock (they are
  // production code and have no injected deps), so the test clock is pushed
  // past real time after every recovery — otherwise a worker driven by the test
  // clock would refuse to claim a row the route had just armed for "now".
  let clockMs = Date.now();
  const clock = () => new Date(clockMs);
  const advance = (ms = 1_000) => { clockMs = Math.max(clockMs, Date.now()) + ms; };
  const deps = (executors: Record<string, unknown> = {}) =>
    engine.defaultAutomationDeps({ now: clock, executors: executors as never });

  async function drainAll(d = deps(), maxRounds = 40): Promise<void> {
    for (let i = 0; i < maxRounds; i += 1) {
      const { claimed } = await engine.drainAutomationJobs(d, 20);
      if (claimed === 0) return;
    }
    throw new Error("the automation queue did not drain — it is looping");
  }

  /** Rules are global; each test turns off every earlier one before it starts. */
  async function isolate(): Promise<void> {
    if (!ruleIds.length) return;
    await db.update(schema.crmAutomationRules).set({ enabled: false })
      .where(inArray(schema.crmAutomationRules.id, ruleIds));
  }

  async function makeRule(body: Record<string, unknown>): Promise<Record<string, any>> {
    const r = await owner.call("POST", "/api/crm/automation/rules", body);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    ruleIds.push(r.json["rule"].id);
    return r.json["rule"];
  }

  async function makeLead(overrides: Record<string, unknown> = {}): Promise<number> {
    const [row] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Failure Subject",
      email: `fail-lead-${STAMP}-${leadIds.length}@example.test`,
      status: "New Inquiry", priority: "Medium",
      ...overrides,
    }).returning();
    leadIds.push(row.id);
    return row.id;
  }

  /** Records an event and remembers it for cleanup. */
  async function recordEvent(
    trigger: string, recordId: number, occurrenceKey: string,
  ): Promise<typeof schema.crmAutomationEvents.$inferSelect> {
    const recorded = await sweep.recordAutomationEvent({
      trigger, payload: { recordId }, occurrenceKey,
    } as never, { source: "producer", now: clock() });
    expect(recorded).toBeTruthy();
    eventIds.push(recorded!.event.id);
    return recorded!.event;
  }

  /**
   * Forces an event into the state a worker leaves behind when it has used up
   * its budget. The worker path that produces this is covered by
   * `automationSweep.test.ts`; what is under test here is what an operator can
   * then see and do, so the state is set directly rather than by breaking the
   * database to provoke it.
   */
  async function forceEventGaveUp(id: number, error: string): Promise<void> {
    await db.update(schema.crmAutomationEvents).set({
      status: "failed", attempts: 10, maxAttempts: 10, lastError: error,
      lockedAt: null, lockedBy: null,
    }).where(eq(schema.crmAutomationEvents.id, id));
  }

  const executionsFor = (ruleId: number) =>
    db.select().from(schema.crmAutomationExecutions)
      .where(eq(schema.crmAutomationExecutions.ruleId, ruleId));

  /**
   * The notes ONE rule has written on ONE contact.
   *
   * Narrowed to the rule's own title, not just to the contact, because
   * automation rules are global: a stray enabled rule left behind in the shared
   * scratch database by some other suite also writes notes on every new
   * contact, and a bare count would silently absorb it and then fail here as
   * though this code had duplicated something. The columns are named rather
   * than selected wholesale for the same reason — the scratch schema moves
   * under these suites, and a `SELECT *` breaks on a column no assertion here
   * cares about.
   */
  const notesFor = (leadId: number, ruleName: string) =>
    db.select({ id: schema.crmActivities.id, title: schema.crmActivities.title })
      .from(schema.crmActivities).where(and(
        eq(schema.crmActivities.leadId, leadId),
        eq(schema.crmActivities.title, `Automation: ${ruleName}`),
      ));

  const recoveryFor = (kind: string, id: number) =>
    db.select().from(schema.crmAutomationRecoveryActions).where(and(
      eq(schema.crmAutomationRecoveryActions.targetKind, kind),
      eq(schema.crmAutomationRecoveryActions.targetId, id),
    ));

  /** The whole failure list, walked page by page. Returns every row seen. */
  async function walkFailures(query: string, limit = 3): Promise<{
    rows: Record<string, any>[]; pages: number; firstPage: Record<string, any>;
  }> {
    const rows: Record<string, any>[] = [];
    let runCursor: number | null = null;
    let eventCursor: number | null = null;
    let first: Record<string, any> | null = null;
    let pages = 0;

    for (; pages < 60; pages += 1) {
      const p = new URLSearchParams(query);
      p.set("limit", String(limit));
      if (runCursor !== null) p.set("runCursor", String(runCursor));
      if (eventCursor !== null) p.set("eventCursor", String(eventCursor));
      const res = await owner.call("GET", `/api/crm/automation/failures?${p.toString()}`);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      if (!first) first = res.json;
      rows.push(...(res.json["failures"] as Record<string, any>[]));
      if (!res.json["hasMore"]) { pages += 1; break; }
      runCursor = res.json["nextCursor"].run;
      eventCursor = res.json["nextCursor"].event;
    }
    return { rows, pages, firstPage: first! };
  }

  const find = (rows: Record<string, any>[], key: string) => rows.find((r) => r["key"] === key);

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    engine = await import("../lib/automationEngine.js");
    sweep = await import("../lib/automationSweep.js");

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    const { default: automationRouter } = await import("./crmAutomation.js");
    app.use("/api", automationRouter);

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const [who, role] of [[OWNER, "owner"], [RESTRICTED, "operations_manager"]] as const) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role, status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }

    await owner.login(OWNER);
    await restricted.login(RESTRICTED);
  }, 180_000);

  afterAll(async () => {
    if (ruleIds.length) {
      const execs = await db.select({ id: schema.crmAutomationExecutions.id })
        .from(schema.crmAutomationExecutions)
        .where(inArray(schema.crmAutomationExecutions.ruleId, ruleIds));
      const execIds = execs.map((e) => e.id);
      if (execIds.length) {
        await db.delete(schema.crmAutomationRecoveryActions).where(and(
          eq(schema.crmAutomationRecoveryActions.targetKind, "run"),
          inArray(schema.crmAutomationRecoveryActions.targetId, execIds),
        ));
        await db.delete(schema.crmAutomationActionRuns)
          .where(inArray(schema.crmAutomationActionRuns.executionId, execIds));
        await db.delete(schema.crmAutomationApprovals)
          .where(inArray(schema.crmAutomationApprovals.executionId, execIds));
        await db.delete(schema.crmScheduledJobs).where(inArray(
          schema.crmScheduledJobs.dedupeKey, execIds.map((id) => engine.automationJobKey(id)),
        ));
        await db.delete(schema.crmAutomationExecutions)
          .where(inArray(schema.crmAutomationExecutions.id, execIds));
      }
      await db.delete(schema.crmAutomationRules)
        .where(inArray(schema.crmAutomationRules.id, ruleIds));
    }
    if (eventIds.length) {
      await db.delete(schema.crmAutomationRecoveryActions).where(and(
        eq(schema.crmAutomationRecoveryActions.targetKind, "event"),
        inArray(schema.crmAutomationRecoveryActions.targetId, eventIds),
      ));
      await db.delete(schema.crmAutomationEvents)
        .where(inArray(schema.crmAutomationEvents.id, eventIds));
    }
    if (leadIds.length) {
      await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, leadIds));
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    const ids = Object.values(staffIds);
    if (ids.length) {
      await db.delete(schema.crmNotifications).where(inArray(schema.crmNotifications.staffId, ids));
      await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, ids));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── Visibility ────────────────────────────────────────────────────────────

  it("shows an event that gave up, with the error, the attempts and no rule", async () => {
    await isolate();
    const subject = await makeLead();
    const event = await recordEvent("lead_created", subject, `[CRM-TEST]-gaveup-${STAMP}`);
    await forceEventGaveUp(event.id, "[CRM-TEST] the emit threw and kept throwing");

    const { rows, firstPage } = await walkFailures("kind=event", 25);
    const row = find(rows, `event:${event.id}`);
    expect(row, "the failed event must be in the listing").toBeTruthy();

    expect(row!["failure"]).toBe("event_gave_up");
    expect(row!["kind"]).toBe("event");
    expect(row!["trigger"]).toBe("lead_created");
    expect(row!["recordType"]).toBe("lead");
    expect(row!["recordId"]).toBe(subject);
    expect(row!["error"]).toMatch(/kept throwing/);
    expect(row!["attempts"]).toBe(10);
    expect(row!["maxAttempts"]).toBe(10);
    // An event never reached rule evaluation, so claiming a rule fired would be
    // an invention. The absence is the honest answer.
    expect(row!["ruleId"]).toBeNull();
    expect(row!["ruleName"]).toBeNull();
    // "still going to be retried, or given up" must be an answer, not an
    // inference from a null timestamp.
    expect(row!["willRetryAutomatically"]).toBe(false);
    expect(row!["availableActions"]).toEqual(["retry", "acknowledge"]);
    expect(String(row!["guidance"])).toMatch(/never reached rule evaluation/i);
    expect(String(row!["retryMeans"])).toMatch(/one more attempt/i);
    expect(String(firstPage["definitions"]["noAutoRelease"])).toMatch(/never retries/i);
  }, 120_000);

  it("shows an event that is still being retried, and refuses both verbs on it", async () => {
    await isolate();
    const subject = await makeLead();
    const event = await recordEvent("lead_created", subject, `[CRM-TEST]-retrying-${STAMP}`);
    await db.update(schema.crmAutomationEvents).set({
      status: "pending", attempts: 2, lastError: "[CRM-TEST] transient, will try again",
      nextAttemptAt: new Date(clockMs + 600_000),
    }).where(eq(schema.crmAutomationEvents.id, event.id));

    const { rows } = await walkFailures("kind=event", 25);
    const row = find(rows, `event:${event.id}`);
    expect(row).toBeTruthy();
    expect(row!["failure"]).toBe("event_retrying");
    expect(row!["willRetryAutomatically"]).toBe(true);
    expect(row!["availableActions"]).toEqual([]);

    // Retrying something a worker is about to attempt anyway would only race it;
    // acknowledging it would close a case the machine has not closed.
    const retry = await owner.call("POST",
      `/api/crm/automation/failures/event/${event.id}/retry`, { reason: "[CRM-TEST] impatience" });
    expect(retry.status).toBe(409);
    expect(String(retry.json["error"])).toMatch(/has not given up/i);

    const ack = await owner.call("POST",
      `/api/crm/automation/failures/event/${event.id}/acknowledge`, { reason: "[CRM-TEST] premature" });
    expect(ack.status).toBe(409);
    expect(String(ack.json["error"])).toMatch(/has not finished/i);

    expect(await recoveryFor("event", event.id)).toHaveLength(0);
  }, 120_000);

  it("shows a failed run with the rule that fired, the record and each step", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] visible failure ${STAMP}`,
      trigger: "lead_created", maxActionAttempts: 1,
      actions: [
        { type: "add_note", config: { body: "[CRM-TEST] first step" } },
        { type: "create_task", config: { title: "[CRM-TEST] second step" } },
      ],
    });

    const failing = {
      create_task: async () => ({
        result: "failed" as const,
        detail: "[CRM-TEST] refused before any write was attempted",
      }),
    };
    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(failing));
    await drainAll(deps(failing));

    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("failed");

    const detail = await owner.call("GET", `/api/crm/automation/failures/run/${execution.id}`);
    expect(detail.status, JSON.stringify(detail.json)).toBe(200);
    const row = detail.json["failure"];

    expect(row["failure"]).toBe("run_failed_definitively");
    expect(row["ruleId"]).toBe(rule["id"]);
    expect(row["ruleName"]).toBe(rule["name"]);
    expect(row["recordType"]).toBe("lead");
    expect(row["recordId"]).toBe(subject);
    expect(row["attempts"]).toBe(1);
    expect(row["maxAttempts"]).toBe(1);
    expect(String(row["error"])).toMatch(/refused before any write/);
    expect(row["willRetryAutomatically"]).toBe(false);
    expect(row["availableActions"]).toEqual(["retry", "acknowledge"]);
    // The steps are the thing that says WHICH part failed and what it did.
    expect(row["steps"]).toHaveLength(2);
    expect(row["steps"][0]["status"]).toBe("succeeded");
    expect(row["steps"][1]["status"]).toBe("failed");
    expect(detail.json["recoveryActions"]).toEqual([]);
  }, 180_000);

  // ── Retry does not double-apply ───────────────────────────────────────────

  it("retries only the step that failed, and never repeats one that succeeded", async () => {
    await isolate();
    const subject = await makeLead();
    const name = `[CRM-TEST] partial retry ${STAMP}`;
    const rule = await makeRule({
      name,
      trigger: "lead_created", maxActionAttempts: 1,
      actions: [
        // Step 0 uses the REAL executor and writes a real row, so "was it
        // repeated" is answered by the database rather than by a spy.
        { type: "add_note", config: { body: "[CRM-TEST] must happen exactly once" } },
        { type: "create_task", config: { title: "[CRM-TEST] the step that failed" } },
      ],
    });

    // One counter, two behaviours: the step fails, is retried by a person, and
    // then succeeds. The count is how many times the step was ATTEMPTED, which
    // is the number a "did retry re-run the right thing" test is really about.
    let calls = 0;
    const failingStep = {
      create_task: async () => {
        calls += 1;
        return { result: "failed" as const, detail: "[CRM-TEST] refused before any write" };
      },
    };
    const workingStep = {
      create_task: async () => {
        calls += 1;
        return { result: "succeeded" as const, detail: "[CRM-TEST] it worked this time" };
      },
    };

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(failingStep));
    await drainAll(deps(failingStep));

    expect(await notesFor(subject, name)).toHaveLength(1);
    expect(calls).toBe(1);
    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("failed");

    const retry = await owner.call("POST",
      `/api/crm/automation/failures/run/${execution.id}/retry`,
      { reason: "[CRM-TEST] the cause is fixed" });
    expect(retry.status, JSON.stringify(retry.json)).toBe(200);
    expect(retry.json["failure"]["status"]).toBe("queued");
    expect(retry.json["recoveryAction"]["action"]).toBe("retry");
    expect(retry.json["recoveryAction"]["actorStaffId"]).toBe(staffIds[OWNER.email]);
    expect(retry.json["recoveryAction"]["previousStatus"]).toBe("failed");
    expect(retry.json["recoveryAction"]["previousFailure"]).toBe("run_failed_definitively");

    // Nothing ran as a side effect of the button — the queue is still holding
    // it, and the route deliberately does not drain.
    expect(calls).toBe(1);
    expect(await notesFor(subject, name)).toHaveLength(1);

    advance();
    await drainAll(deps(workingStep));

    const [after] = await executionsFor(rule["id"]);
    expect(after.status).toBe("completed");
    // The step that failed was attempted once more; the step that had already
    // succeeded was NOT run again.
    expect(calls).toBe(2);
    expect(await notesFor(subject, name)).toHaveLength(1);
    const steps = await db.select().from(schema.crmAutomationActionRuns)
      .where(eq(schema.crmAutomationActionRuns.executionId, execution.id))
      .orderBy(schema.crmAutomationActionRuns.actionIndex);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded"]);
    expect(steps[0]!.attempts).toBe(1);
    expect(steps[1]!.attempts).toBe(2);
  }, 240_000);

  it("re-emits a given-up event without producing a second execution or a second effect", async () => {
    await isolate();
    const subject = await makeLead();
    const name = `[CRM-TEST] event replay ${STAMP}`;
    const rule = await makeRule({
      name,
      trigger: "lead_created", windowCap: 10,
      actions: [{ type: "add_note", config: { body: "[CRM-TEST] exactly one" } }],
    });

    const event = await recordEvent("lead_created", subject, `[CRM-TEST]-replay-${STAMP}`);
    await sweep.drainAutomationEvents(deps(), 50);
    await drainAll();

    expect(await executionsFor(rule["id"])).toHaveLength(1);
    expect(await notesFor(subject, name)).toHaveLength(1);

    // The event is now forced back to "gave up" — the worst case this retry has
    // to survive: an operator re-running an event whose rules ALREADY ran.
    await forceEventGaveUp(event.id, "[CRM-TEST] gave up after it had already emitted");

    const retry = await owner.call("POST",
      `/api/crm/automation/failures/event/${event.id}/retry`,
      { reason: "[CRM-TEST] operator replay" });
    expect(retry.status, JSON.stringify(retry.json)).toBe(200);

    const [armed] = await db.select().from(schema.crmAutomationEvents)
      .where(eq(schema.crmAutomationEvents.id, event.id));
    expect(armed.status).toBe("pending");
    // The attempt history stays true and the row buys exactly ONE more attempt.
    expect(armed.attempts).toBe(10);
    expect(armed.maxAttempts).toBe(11);
    expect(armed.nextAttemptAt).not.toBeNull();

    advance();
    await sweep.drainAutomationEvents(deps(), 50);
    await drainAll();

    // The occurrence key was frozen on the row, so the unique index refuses the
    // second execution. One run, one note, however many times it is replayed.
    expect(await executionsFor(rule["id"])).toHaveLength(1);
    expect(await notesFor(subject, name)).toHaveLength(1);
  }, 240_000);

  // ── Retry is withheld where it could repeat a side effect ─────────────────

  it("refuses to retry a run whose step came back unknown, and says why", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] unknown outcome ${STAMP}`,
      trigger: "lead_created", maxActionAttempts: 5,
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] may or may not exist" } }],
    });

    const ambiguous = {
      create_task: async () => ({
        result: "unknown" as const,
        detail: "[CRM-TEST] the write went out and the answer never came back",
      }),
    };
    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(ambiguous));
    await drainAll(deps(ambiguous));

    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("failed");

    const detail = await owner.call("GET", `/api/crm/automation/failures/run/${execution.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json["failure"]["failure"]).toBe("run_outcome_unknown");
    expect(detail.json["failure"]["availableActions"]).toEqual(["acknowledge"]);
    expect(String(detail.json["failure"]["retryWithheldReason"])).toMatch(/UNKNOWN/);
    expect(String(detail.json["failure"]["retryWithheldReason"])).toMatch(/second task/i);

    const retry = await owner.call("POST",
      `/api/crm/automation/failures/run/${execution.id}/retry`,
      { reason: "[CRM-TEST] I want it run anyway" });
    expect(retry.status).toBe(409);
    expect(String(retry.json["error"])).toMatch(/UNKNOWN/);

    // A 409 that still queued the work would be worse than no check at all.
    const [after] = await executionsFor(rule["id"]);
    expect(after.status).toBe("failed");
    expect(after.updatedAt.getTime()).toBe(execution.updatedAt.getTime());
    expect(await recoveryFor("run", execution.id)).toHaveLength(0);
    const jobs = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, engine.automationJobKey(execution.id)));
    expect(jobs.every((j) => j.status !== "pending")).toBe(true);
  }, 180_000);

  // ── Loop protection cannot be walked past ─────────────────────────────────

  it("refuses to retry a run a loop brake stopped — both brakes", async () => {
    await isolate();
    const subject = await makeLead();
    const name = `[CRM-TEST] brakes ${STAMP}`;
    const rule = await makeRule({
      name,
      trigger: "lead_created", windowCap: 1, maxChainDepth: 2,
      actions: [{ type: "add_note", config: { body: "[CRM-TEST] capped" } }],
    });

    // Brake 3 — the per-record window cap.
    await engine.emitAutomationTrigger({
      trigger: "lead_created", payload: { recordId: subject },
      occurrenceKey: `[CRM-TEST]-cap-a-${STAMP}`,
    } as never, deps());
    await drainAll();
    await engine.emitAutomationTrigger({
      trigger: "lead_created", payload: { recordId: subject },
      occurrenceKey: `[CRM-TEST]-cap-b-${STAMP}`,
    } as never, deps());

    // Brake 2 — chain depth, arriving already too deep.
    await engine.emitAutomationTrigger({
      trigger: "lead_created", payload: { recordId: subject },
      occurrenceKey: `[CRM-TEST]-depth-${STAMP}`,
      chain: { depth: 5, ruleIds: [rule["id"]] },
    } as never, deps());

    const all = await executionsFor(rule["id"]);
    const capped = all.find((e) => e.stopReason === "rate_cap_exceeded");
    const tooDeep = all.find((e) => e.stopReason === "chain_depth_exceeded");
    expect(capped, "the window cap must have stopped one").toBeTruthy();
    expect(tooDeep, "chain depth must have stopped one").toBeTruthy();

    const { rows } = await walkFailures("kind=run", 25);
    for (const stopped of [capped!, tooDeep!]) {
      const row = find(rows, `run:${stopped.id}`);
      expect(row, `run:${stopped.id} must be visible`).toBeTruthy();
      expect(row!["failure"]).toBe("run_stopped_by_loop_protection");
      // Visible, explained, and NOT retryable. Re-running it is precisely what
      // the brake exists to prevent.
      expect(row!["availableActions"]).toEqual(["acknowledge"]);
      expect(String(row!["retryWithheldReason"])).toMatch(/loop protection/i);

      const retry = await owner.call("POST",
        `/api/crm/automation/failures/run/${stopped.id}/retry`,
        { reason: "[CRM-TEST] trying to walk past the brake" });
      expect(retry.status).toBe(409);
      expect(String(retry.json["error"])).toMatch(/loop protection/i);

      const [after] = await db.select().from(schema.crmAutomationExecutions)
        .where(eq(schema.crmAutomationExecutions.id, stopped.id));
      expect(after.status).toBe("stopped");
      expect(after.stopReason).toBe(stopped.stopReason);
      expect(after.updatedAt.getTime()).toBe(stopped.updatedAt.getTime());
      expect(await recoveryFor("run", stopped.id)).toHaveLength(0);
    }

    // The cap held: one note from the one run that was allowed through.
    await drainAll();
    expect(await notesFor(subject, name)).toHaveLength(1);
  }, 240_000);

  it("re-enters the loop brakes when an EVENT is retried, rather than going round them", async () => {
    await isolate();
    const subject = await makeLead();
    const name = `[CRM-TEST] event replay hits the cap ${STAMP}`;
    const rule = await makeRule({
      name,
      trigger: "lead_created", windowCap: 1,
      actions: [{ type: "add_note", config: { body: "[CRM-TEST] capped replay" } }],
    });

    // One occurrence goes through and uses up the rule's whole window.
    const first = await recordEvent("lead_created", subject, `[CRM-TEST]-cap-first-${STAMP}`);
    await sweep.drainAutomationEvents(deps(), 50);
    await drainAll();
    expect(await notesFor(subject, name)).toHaveLength(1);
    expect(first.status).toBe("pending");

    // A DIFFERENT occurrence of the same trigger, which gave up before emitting.
    const second = await recordEvent("lead_created", subject, `[CRM-TEST]-cap-second-${STAMP}`);
    await forceEventGaveUp(second.id, "[CRM-TEST] never emitted");

    const retry = await owner.call("POST",
      `/api/crm/automation/failures/event/${second.id}/retry`,
      { reason: "[CRM-TEST] replay it" });
    expect(retry.status, JSON.stringify(retry.json)).toBe(200);

    advance();
    await sweep.drainAutomationEvents(deps(), 50);
    await drainAll();

    // The retry went through the ordinary emission path, so the window cap
    // stopped it exactly as it would have stopped an ordinary event. The
    // refusal is recorded rather than silent, and no second note exists.
    const execs = await executionsFor(rule["id"]);
    expect(execs.some((e) => e.stopReason === "rate_cap_exceeded")).toBe(true);
    expect(execs.filter((e) => e.status === "completed")).toHaveLength(1);
    expect(await notesFor(subject, name)).toHaveLength(1);
  }, 240_000);

  // ── Acknowledge re-runs nothing ───────────────────────────────────────────

  it("acknowledges without re-running anything, and records who and when", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] acknowledge ${STAMP}`,
      trigger: "lead_created", maxActionAttempts: 1,
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] ambiguous" } }],
    });

    let calls = 0;
    const ambiguous = {
      create_task: async () => {
        calls += 1;
        return { result: "unknown" as const, detail: "[CRM-TEST] nobody knows" };
      },
    };
    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(ambiguous));
    await drainAll(deps(ambiguous));
    expect(calls).toBe(1);

    const [before] = await executionsFor(rule["id"]);
    expect(before.status).toBe("failed");
    const stepsBefore = await db.select().from(schema.crmAutomationActionRuns)
      .where(eq(schema.crmAutomationActionRuns.executionId, before.id));
    const jobsBefore = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, engine.automationJobKey(before.id)));

    const short = await owner.call("POST",
      `/api/crm/automation/failures/run/${before.id}/acknowledge`, { reason: "ok" });
    expect(short.status, "a recovery with no reason is not a record").toBe(400);

    const ack = await owner.call("POST",
      `/api/crm/automation/failures/run/${before.id}/acknowledge`,
      { reason: "[CRM-TEST] checked the contact — the task is there, nothing more to do" });
    expect(ack.status, JSON.stringify(ack.json)).toBe(200);
    expect(ack.json["failure"]["resolvedAt"]).toBeTruthy();
    expect(ack.json["failure"]["resolvedByLabel"]).toBe(OWNER.name);
    expect(String(ack.json["failure"]["resolutionNote"])).toMatch(/nothing more to do/);
    expect(ack.json["recoveryAction"]["actorStaffId"]).toBe(staffIds[OWNER.email]);
    expect(ack.json["recoveryAction"]["action"]).toBe("acknowledge");

    // THE invariant: acknowledging changed nothing about the automation at all.
    // Not the status, not the attempts, not the steps, not even `updated_at` —
    // so "somebody looked at this" can never be read as "something happened".
    const [after] = await executionsFor(rule["id"]);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(before.attempts);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.nextAttemptAt).toEqual(before.nextAttemptAt);

    const stepsAfter = await db.select().from(schema.crmAutomationActionRuns)
      .where(eq(schema.crmAutomationActionRuns.executionId, before.id));
    expect(stepsAfter.map((s) => `${s.status}:${s.attempts}`))
      .toEqual(stepsBefore.map((s) => `${s.status}:${s.attempts}`));

    const jobsAfter = await db.select().from(schema.crmScheduledJobs)
      .where(eq(schema.crmScheduledJobs.dedupeKey, engine.automationJobKey(before.id)));
    expect(jobsAfter.map((j) => j.status)).toEqual(jobsBefore.map((j) => j.status));

    // Draining afterwards proves it a second way: nothing was left armed, so
    // the step is not attempted again.
    advance();
    await drainAll(deps(ambiguous));
    expect(calls).toBe(1);
    expect(await executionsFor(rule["id"])).toHaveLength(1);

    // It leaves the unresolved queue, and is still findable with scope=all.
    const unresolved = await walkFailures("kind=run", 25);
    expect(find(unresolved.rows, `run:${before.id}`)).toBeFalsy();
    const everything = await walkFailures("kind=run&scope=all", 25);
    const listed = find(everything.rows, `run:${before.id}`);
    expect(listed).toBeTruthy();
    expect(listed!["resolvedByLabel"]).toBe(OWNER.name);
    expect(listed!["availableActions"]).toEqual([]);

    const second = await owner.call("POST",
      `/api/crm/automation/failures/run/${before.id}/acknowledge`,
      { reason: "[CRM-TEST] acknowledging it twice" });
    expect(second.status).toBe(409);
    expect(String(second.json["error"])).toMatch(/already acknowledged/i);

    const detail = await owner.call("GET", `/api/crm/automation/failures/run/${before.id}`);
    expect(detail.json["recoveryActions"]).toHaveLength(1);
    expect(detail.json["recoveryActions"][0]["actorLabel"]).toBe(OWNER.name);
  }, 240_000);

  // ── Permissions ───────────────────────────────────────────────────────────

  it("refuses a restricted user, and writes nothing when it does", async () => {
    await isolate();
    const subject = await makeLead();
    const event = await recordEvent("lead_created", subject, `[CRM-TEST]-perm-${STAMP}`);
    await forceEventGaveUp(event.id, "[CRM-TEST] permission fixture");

    const [before] = await db.select().from(schema.crmAutomationEvents)
      .where(eq(schema.crmAutomationEvents.id, event.id));

    const retry = await restricted.call("POST",
      `/api/crm/automation/failures/event/${event.id}/retry`, { reason: "[CRM-TEST] not allowed" });
    expect(retry.status).toBe(403);

    const ack = await restricted.call("POST",
      `/api/crm/automation/failures/event/${event.id}/acknowledge`, { reason: "[CRM-TEST] not allowed" });
    expect(ack.status).toBe(403);

    // A 403 that still wrote is worse than no check at all.
    const [after] = await db.select().from(schema.crmAutomationEvents)
      .where(eq(schema.crmAutomationEvents.id, event.id));
    expect(after.status).toBe(before.status);
    expect(after.attempts).toBe(before.attempts);
    expect(after.maxAttempts).toBe(before.maxAttempts);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await recoveryFor("event", event.id)).toHaveLength(0);

    // Seeing why an automation did not happen is a different question from
    // making it happen, and stays allowed.
    const list = await restricted.call("GET", "/api/crm/automation/failures?limit=5");
    expect(list.status).toBe(200);
    const one = await restricted.call("GET", `/api/crm/automation/failures/event/${event.id}`);
    expect(one.status).toBe(200);
  }, 180_000);

  // ── Nothing unresolved is hidden by a page size ───────────────────────────

  it("keeps every unresolved failure reachable past the page size, and says it is paging", async () => {
    await isolate();
    const mine: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const subject = await makeLead();
      const event = await recordEvent("lead_created", subject, `[CRM-TEST]-page-${STAMP}-${i}`);
      await forceEventGaveUp(event.id, `[CRM-TEST] page fixture ${i}`);
      mine.push(`event:${event.id}`);
    }

    const small = await owner.call("GET", "/api/crm/automation/failures?kind=event&limit=3");
    expect(small.status).toBe(200);
    expect((small.json["failures"] as unknown[]).length).toBe(3);
    // The response says it is a page rather than letting three look like all.
    expect(small.json["hasMore"]).toBe(true);
    expect(small.json["nextCursor"]["event"]).toBeGreaterThan(0);
    expect(small.json["counts"]["matchingFilters"]).toBeGreaterThanOrEqual(7);
    expect(small.json["counts"]["returnedOnThisPage"]).toBe(3);
    expect(String(small.json["definitions"]["paging"])).toMatch(/hidden by a display limit/i);

    const { rows, pages } = await walkFailures("kind=event", 3);
    expect(pages).toBeGreaterThan(1);

    const seen = new Set(rows.map((r) => r["key"] as string));
    for (const key of mine) expect(seen.has(key), `${key} must be reachable`).toBe(true);
    // The count the first page labels itself with is the count the pages yield.
    expect(seen.size).toBe(Number(small.json["counts"]["matchingFilters"]));
    // And the per-kind tally agrees with it rather than with the page.
    expect(Number(small.json["counts"]["byFailure"]["event_gave_up"]))
      .toBe(rows.filter((r) => r["failure"] === "event_gave_up").length);
  }, 240_000);

  it("refuses an unknown kind and an id that is not a failure", async () => {
    const badKind = await owner.call("GET", "/api/crm/automation/failures/banana/1");
    expect(badKind.status).toBe(400);
    expect(badKind.json["accepted"]).toEqual(["event", "run"]);

    const missing = await owner.call("GET", "/api/crm/automation/failures/run/999999999");
    expect(missing.status).toBe(404);

    const cannotRecover = await owner.call("POST",
      "/api/crm/automation/failures/run/999999999/retry", { reason: "[CRM-TEST] nothing there" });
    expect(cannotRecover.status).toBe(404);
  }, 60_000);
});
