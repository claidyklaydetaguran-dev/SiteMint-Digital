/**
 * M5 — the two automation gaps: time-based triggers, and events that got lost.
 *
 * `crmAutomation.test.ts` proves the engine and `automationProducers.test.ts`
 * proves that business routes reach it. Both of those assume an event arrives.
 * This file is about the two cases where one did not:
 *
 *   1. `task_overdue` and `no_activity_for_days` were declared triggers with no
 *      producer. A rule using either could be written, saved, enabled — and
 *      would never run, for ever, with nothing to show for it. Nobody "does" an
 *      overdue task, so there is no route to hang a producer on; it is produced
 *      by a periodic sweep over record state.
 *
 *   2. Business events were handed to the engine in memory by a fire-and-forget
 *      call. A process that died between the business write and the emit lost
 *      the event AND lost the fact that it had lost it.
 *
 * ── What is tested hardest, and why ─────────────────────────────────────────
 *
 * A periodic sweep's characteristic failure is doing the same thing every time
 * it runs. So the first-class assertions here are all "exactly once":
 *
 *   - one overdue task, many ticks, ONE execution — the occurrence key must
 *     name the real occurrence rather than the moment it was noticed;
 *   - two workers sweeping at the same instant, ONE execution — asserted on the
 *     event row as well as the execution, because a check-then-insert passes
 *     the second assertion and fails the first;
 *   - a state that stopped being true between the sweep and the run must be
 *     CALLED OFF, not fired late. That is the difference between an automation
 *     that helps and one that tells somebody off for work they just finished.
 *
 * And for the durable-event property, the test that actually means something:
 * record the event, DO NOT process it — the process died — and prove a fresh
 * worker still runs the rule.
 *
 * ── A clock the test owns ───────────────────────────────────────────────────
 *
 * Day boundaries are the whole point of the first gap, so "it is now 04:00 UTC
 * on the 11th" has to be a variable rather than a wait. Every worker in this
 * path takes its `now` from injected deps, and the event rows are stamped from
 * the same clock, so a test can sit at an instant where a task is overdue in
 * Manila and is not overdue in California.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, sql } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "sweep-admin-secret-value";

const STAMP = Date.now();
const OWNER = {
  email: `sweep-owner-${STAMP}@example.test`, name: `[CRM-TEST] Sweep Owner ${STAMP}`,
  password: "cinnabar-thicket-3391", timezone: "UTC",
};
/** UTC+8, no daylight saving — the zone that is already tomorrow. */
const MANILA = {
  email: `sweep-manila-${STAMP}@example.test`, name: `[CRM-TEST] Sweep Manila ${STAMP}`,
  password: "meridian-saltbox-7712", timezone: "Asia/Manila",
};
/** UTC-7 in September — the zone that is still yesterday. */
const PACIFIC = {
  email: `sweep-pacific-${STAMP}@example.test`, name: `[CRM-TEST] Sweep Pacific ${STAMP}`,
  password: "driftwood-lantern-8820", timezone: "America/Los_Angeles",
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

/** Polls until `probe` returns something truthy, or the deadline passes. */
async function waitFor<T>(probe: () => Promise<T | null | undefined>, what: string, ms = 8000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = await probe();
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`timed out after ${ms}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const DAY_MS = 86_400_000;

suite("automation sweep and durable events (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let engine: typeof import("../lib/automationEngine.js");
  let sweep: typeof import("../lib/automationSweep.js");

  const owner = new Agent(() => base);
  const staffIds: Record<string, number> = {};
  const ruleIds: number[] = [];
  const leadIds: number[] = [];
  const taskIds: number[] = [];

  /**
   * The instant the workers believe it is.
   *
   * 2026-09-11T04:00:00Z is chosen deliberately and is the pivot of the
   * timezone test: it is already the 11th in Manila (12:00) and still the 10th
   * in California (21:00 PDT).
   */
  const PIVOT = Date.parse("2026-09-11T04:00:00.000Z");
  let clockMs = PIVOT;
  const clock = () => new Date(clockMs);
  const deps = () => engine.defaultAutomationDeps({ now: clock });

  /** One full worker pass: notice, record, emit, run. */
  async function tick(): Promise<void> {
    const d = deps();
    await sweep.runAutomationSweep(d);
    await sweep.drainAutomationEvents(d);
    // The engine's own queue, drained to empty so an execution's retry does not
    // leave work behind and make the next assertion depend on ordering.
    for (let i = 0; i < 20; i += 1) {
      const { claimed } = await engine.drainAutomationJobs(d, 20);
      if (claimed === 0) break;
    }
  }

  async function makeRule(body: Record<string, unknown>): Promise<Record<string, any>> {
    const r = await owner.call("POST", "/api/crm/automation/rules", body);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    ruleIds.push(r.json["rule"].id);
    return r.json["rule"];
  }

  /**
   * Rules are global: every enabled rule listening for a trigger runs on every
   * occurrence of it. Each test therefore starts from "none of this file's
   * rules are live" and switches on only the ones it is about. Assertions are
   * scoped by rule id as well, so a rule left behind by another suite can add
   * noise but cannot change an answer.
   */
  async function isolate(): Promise<void> {
    if (!ruleIds.length) return;
    await db.update(schema.crmAutomationRules).set({ enabled: false })
      .where(inArray(schema.crmAutomationRules.id, ruleIds));
  }

  async function enableOnly(id: number): Promise<void> {
    await isolate();
    await db.update(schema.crmAutomationRules).set({ enabled: true })
      .where(eq(schema.crmAutomationRules.id, id));
  }

  async function makeLead(overrides: Record<string, unknown> = {}): Promise<number> {
    const [row] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Sweep Subject",
      email: `sweep-lead-${STAMP}-${leadIds.length}@example.test`,
      status: "New Inquiry", priority: "Medium",
      ...overrides,
    }).returning();
    leadIds.push(row.id);
    return row.id;
  }

  async function makeTask(values: Record<string, unknown>): Promise<number> {
    const [row] = await db.insert(schema.crmTasks).values({
      title: "[CRM-TEST] Sweep Task", type: "Follow Up", status: "pending",
      createdBy: "[CRM-TEST]",
      ...values,
    } as never).returning();
    taskIds.push(row.id);
    return row.id;
  }

  const executionsFor = (ruleId: number) =>
    db.select().from(schema.crmAutomationExecutions)
      .where(eq(schema.crmAutomationExecutions.ruleId, ruleId));

  const eventsFor = (recordType: string, recordId: number) =>
    db.select().from(schema.crmAutomationEvents).where(and(
      eq(schema.crmAutomationEvents.recordType, recordType),
      eq(schema.crmAutomationEvents.recordId, recordId),
    ));

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    engine = await import("../lib/automationEngine.js");
    sweep = await import("../lib/automationSweep.js");

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const who of [OWNER, MANILA, PACIFIC]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        timezone: who.timezone,
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }

    expect(await owner.login(OWNER)).toBe(200);
  }, 180_000);

  afterAll(async () => {
    if (ruleIds.length) {
      const execs = await db.select({ id: schema.crmAutomationExecutions.id })
        .from(schema.crmAutomationExecutions)
        .where(inArray(schema.crmAutomationExecutions.ruleId, ruleIds));
      const execIds = execs.map((e) => e.id);
      if (execIds.length) {
        await db.delete(schema.crmAutomationActionRuns)
          .where(inArray(schema.crmAutomationActionRuns.executionId, execIds));
        await db.delete(schema.crmScheduledJobs).where(inArray(
          schema.crmScheduledJobs.dedupeKey, execIds.map((id) => engine.automationJobKey(id)),
        ));
        await db.delete(schema.crmAutomationExecutions)
          .where(inArray(schema.crmAutomationExecutions.id, execIds));
      }
      await db.delete(schema.crmAutomationRules)
        .where(inArray(schema.crmAutomationRules.id, ruleIds));
    }
    if (taskIds.length) {
      await db.delete(schema.crmAutomationEvents).where(and(
        eq(schema.crmAutomationEvents.recordType, "task"),
        inArray(schema.crmAutomationEvents.recordId, taskIds),
      ));
      await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.id, taskIds));
    }
    if (leadIds.length) {
      await db.delete(schema.crmAutomationEvents).where(and(
        eq(schema.crmAutomationEvents.recordType, "lead"),
        inArray(schema.crmAutomationEvents.recordId, leadIds),
      ));
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

  // ── Gap 1: task_overdue ───────────────────────────────────────────────────

  it("fires an overdue task's rule exactly once, however many ticks run", async () => {
    clockMs = PIVOT;
    const rule = await makeRule({
      name: `[CRM-TEST] overdue once ${STAMP}`,
      trigger: "task_overdue",
      actions: [{ type: "add_note", config: { body: "this task is late" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();
    const taskId = await makeTask({
      leadId, title: "[CRM-TEST] overdue once",
      dueDate: new Date(clockMs - 3 * DAY_MS),
      assignedToStaffId: staffIds[OWNER.email],
    });

    // Eight passes across forty minutes. A sweep whose occurrence key names the
    // moment it noticed rather than the occurrence itself fires eight times.
    for (let i = 0; i < 8; i += 1) {
      await tick();
      clockMs += 5 * 60_000;
    }

    const events = await eventsFor("task", taskId);
    expect(events, "one occurrence, one recorded event").toHaveLength(1);
    expect(events[0].status).toBe("processed");
    expect(events[0].source).toBe("sweep");

    const runs = await executionsFor(rule["id"]);
    expect(runs, "one occurrence, one execution").toHaveLength(1);
    expect(runs[0].recordId).toBe(taskId);
    expect(runs[0].status).toBe("completed");

    // The action really ran: the note is on the contact.
    const notes = await db.select().from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, leadId));
    expect(notes.filter((n) => n.type === "note_added")).toHaveLength(1);
  }, 120_000);

  it("never fires for a task that was completed before the sweep saw it", async () => {
    clockMs = PIVOT;
    const rule = await makeRule({
      name: `[CRM-TEST] overdue completed ${STAMP}`,
      trigger: "task_overdue",
      actions: [{ type: "add_note", config: { body: "should never be written" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();
    const taskId = await makeTask({
      leadId, title: "[CRM-TEST] already done",
      dueDate: new Date(clockMs - 3 * DAY_MS),
      assignedToStaffId: staffIds[OWNER.email],
      status: "completed", completedAt: new Date(clockMs - DAY_MS),
    });

    await tick();
    await tick();

    expect(await eventsFor("task", taskId), "nothing to announce").toHaveLength(0);
    expect(await executionsFor(rule["id"])).toHaveLength(0);
  }, 120_000);

  it("calls off a pending overdue event when the task is completed before it runs", async () => {
    // The case the sweep's own filter cannot catch: it was genuinely overdue
    // when noticed, and somebody finished it in the seconds before the worker
    // got to it. Firing then would be the automation telling a person off for
    // work they have just done.
    clockMs = PIVOT;
    const rule = await makeRule({
      name: `[CRM-TEST] overdue cancelled ${STAMP}`,
      trigger: "task_overdue",
      actions: [{ type: "add_note", config: { body: "should never be written" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();
    const taskId = await makeTask({
      leadId, title: "[CRM-TEST] finished in the gap",
      dueDate: new Date(clockMs - 3 * DAY_MS),
      assignedToStaffId: staffIds[OWNER.email],
    });

    // Notice it, but do not act on it yet.
    await sweep.runAutomationSweep(deps());
    const recorded = await eventsFor("task", taskId);
    expect(recorded, "the sweep noticed it").toHaveLength(1);
    expect(recorded[0].status).toBe("pending");

    await db.update(schema.crmTasks)
      .set({ status: "completed", completedAt: new Date(clockMs) })
      .where(eq(schema.crmTasks.id, taskId));

    await sweep.drainAutomationEvents(deps());

    const after = await eventsFor("task", taskId);
    expect(after[0].status).toBe("cancelled");
    expect(String(after[0].cancelledReason)).toMatch(/completed/i);
    expect(await executionsFor(rule["id"]), "nothing ran").toHaveLength(0);
  }, 120_000);

  it("decides 'overdue' in the assignee's timezone, not the server's", async () => {
    // Two people each set "due on the 10th" in their own zone — which is what
    // a bare date through a datetime input stores: local midnight. Those are
    // DIFFERENT instants, and that is the point: at 04:00Z on the 11th the 10th
    // is over in Manila and still running in California.
    //
    // This test used to use one shared 12:00Z instant, which is not midnight in
    // either zone. Under the corrected rule that is a TIMED deadline and is
    // overdue for everybody once it passes, so it no longer demonstrates
    // anything about zones. Date-only deadlines are the case where the zone
    // actually decides.
    clockMs = PIVOT;
    const dueManila = new Date(Date.parse("2026-09-10T00:00:00.000+08:00"));
    const duePacific = new Date(Date.parse("2026-09-10T00:00:00.000-07:00"));

    const rule = await makeRule({
      name: `[CRM-TEST] overdue zones ${STAMP}`,
      trigger: "task_overdue",
      actions: [{ type: "add_note", config: { body: "late where you are" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();
    const manilaTask = await makeTask({
      leadId, title: "[CRM-TEST] due in Manila", dueDate: dueManila,
      assignedToStaffId: staffIds[MANILA.email],
    });
    const pacificTask = await makeTask({
      leadId, title: "[CRM-TEST] due in California", dueDate: duePacific,
      assignedToStaffId: staffIds[PACIFIC.email],
    });

    // The helper says it plainly, before any of the machinery is involved.
    expect(sweep.isOverdueInZone("Asia/Manila", dueManila, clock())).toBe(true);
    expect(sweep.isOverdueInZone("America/Los_Angeles", duePacific, clock())).toBe(false);

    await tick();

    expect(await eventsFor("task", manilaTask), "the day has ended in Manila").toHaveLength(1);
    expect(await eventsFor("task", pacificTask), "California still has the day").toHaveLength(0);

    // Scoped to this test's two tasks: the sweep also picks up any other
    // overdue task in the shared database, which is correct behaviour and not
    // what is being measured here.
    const mineOnly = (r: { recordId: number }) => r.recordId === manilaTask || r.recordId === pacificTask;
    const runs = (await executionsFor(rule["id"])).filter(mineOnly);
    expect(runs).toHaveLength(1);
    expect(runs[0].recordId).toBe(manilaTask);

    // Nine hours later it is the 11th in California too, and only then does it
    // become overdue there. The same task, the same rule, a different day.
    clockMs = Date.parse("2026-09-11T13:00:00.000Z");
    await tick();

    expect(await eventsFor("task", pacificTask), "now it is the 11th there too").toHaveLength(1);
    const later = (await executionsFor(rule["id"])).filter(mineOnly);
    expect(later).toHaveLength(2);
    expect(later.map((r) => r.recordId).sort()).toEqual([manilaTask, pacificTask].sort());
  }, 120_000);

  // ── Gap 1: no_activity_for_days ───────────────────────────────────────────

  it("fires no_activity_for_days only after its own window, and only for its own window", async () => {
    clockMs = Date.now();

    const sevenDay = await makeRule({
      name: `[CRM-TEST] quiet 7 ${STAMP}`,
      trigger: "no_activity_for_days",
      actions: [{ type: "add_note", config: { body: "quiet for a week" } }],
    });
    const thirtyDay = await makeRule({
      name: `[CRM-TEST] quiet 30 ${STAMP}`,
      trigger: "no_activity_for_days",
      actions: [{ type: "add_note", config: { body: "quiet for a month" } }],
    });
    // `inactivityDays` is a new column and the rules route does not accept it
    // yet — see the integration note in the handoff. Set directly so the two
    // windows are genuinely different.
    await db.update(schema.crmAutomationRules).set({ inactivityDays: 7 })
      .where(eq(schema.crmAutomationRules.id, sevenDay["id"]));
    await db.update(schema.crmAutomationRules).set({ inactivityDays: 30 })
      .where(eq(schema.crmAutomationRules.id, thirtyDay["id"]));

    await isolate();
    await db.update(schema.crmAutomationRules).set({ enabled: true })
      .where(inArray(schema.crmAutomationRules.id, [sevenDay["id"], thirtyDay["id"]]));

    const fresh = await makeLead({ createdAt: new Date(clockMs - 3 * DAY_MS) });
    const quiet = await makeLead({ createdAt: new Date(clockMs - 10 * DAY_MS) });

    await tick();

    expect(await eventsFor("lead", fresh), "three days is not seven").toHaveLength(0);

    const announced = await eventsFor("lead", quiet);
    expect(announced, "ten days of silence, one event").toHaveLength(1);
    expect(Number(announced[0].payload["days"])).toBe(7);
    expect(announced[0].targetRuleIds).toEqual([sevenDay["id"]]);

    // The event names the rules it is for, so the thirty-day rule does not fire
    // on a seven-day silence.
    expect(await executionsFor(sevenDay["id"])).toHaveLength(1);
    expect(await executionsFor(thirtyDay["id"]),
      "a contact quiet for ten days is not an occurrence for a thirty-day rule").toHaveLength(0);
  }, 120_000);

  it("lets activity on a contact call off a silence that was already noticed", async () => {
    clockMs = Date.now();
    const rule = await makeRule({
      name: `[CRM-TEST] quiet reset ${STAMP}`,
      trigger: "no_activity_for_days",
      actions: [{ type: "add_note", config: { body: "should never be written" } }],
    });
    await db.update(schema.crmAutomationRules).set({ inactivityDays: 7 })
      .where(eq(schema.crmAutomationRules.id, rule["id"]));
    await enableOnly(rule["id"]);

    const leadId = await makeLead({ createdAt: new Date(clockMs - 12 * DAY_MS) });

    await sweep.runAutomationSweep(deps());
    const noticed = await eventsFor("lead", leadId);
    expect(noticed, "the silence was noticed").toHaveLength(1);
    expect(noticed[0].status).toBe("pending");

    // Somebody logs a call. `crm_activities` is one of the named activity
    // sources, so this ends the silence the event was about.
    await db.insert(schema.crmActivities).values({
      leadId, type: "note_added", title: "[CRM-TEST] we spoke",
      description: "called them back", createdBy: "[CRM-TEST]",
      createdAt: new Date(clockMs),
    });

    await sweep.drainAutomationEvents(deps());

    const after = await eventsFor("lead", leadId);
    expect(after[0].status).toBe("cancelled");
    expect(String(after[0].cancelledReason)).toMatch(/activity arrived/i);
    expect(await executionsFor(rule["id"]), "nothing ran").toHaveLength(0);

    // And the contact is no longer a candidate at all.
    await tick();
    expect(await eventsFor("lead", leadId)).toHaveLength(1);
    expect(await executionsFor(rule["id"])).toHaveLength(0);
  }, 120_000);

  // ── Concurrency ───────────────────────────────────────────────────────────

  it("produces one execution when two workers sweep and drain at the same instant", async () => {
    clockMs = PIVOT;
    const rule = await makeRule({
      name: `[CRM-TEST] two workers ${STAMP}`,
      trigger: "task_overdue",
      actions: [{ type: "add_note", config: { body: "once, not twice" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();
    const taskId = await makeTask({
      leadId, title: "[CRM-TEST] contested",
      dueDate: new Date(clockMs - 2 * DAY_MS),
      assignedToStaffId: staffIds[OWNER.email],
    });

    // Both workers notice it in the same instant. A check-then-insert passes
    // the execution assertion below and fails this one.
    await Promise.all([
      sweep.runAutomationSweep(deps()),
      sweep.runAutomationSweep(deps()),
    ]);
    expect(await eventsFor("task", taskId), "one occurrence, one row").toHaveLength(1);

    await Promise.all([
      sweep.drainAutomationEvents(deps()),
      sweep.drainAutomationEvents(deps()),
    ]);
    for (let i = 0; i < 10; i += 1) {
      const { claimed } = await engine.drainAutomationJobs(deps(), 20);
      if (claimed === 0) break;
    }

    // Scoped to the contested task rather than to every execution of the rule.
    // The sweep legitimately picks up any other overdue task in the database,
    // and this test is about one occurrence not running twice — not about the
    // rule being the only thing that ever fired.
    const mine = (await executionsFor(rule["id"])).filter((r) => r.recordId === taskId);
    expect(mine, "one occurrence, one execution").toHaveLength(1);
    const notes = await db.select().from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, leadId));
    expect(notes, "the action ran once").toHaveLength(1);
  }, 120_000);

  // ── Gap 2: the durable event ──────────────────────────────────────────────

  it("still runs the rule when the process dies between the business write and rule evaluation", async () => {
    // The exact failure the old in-memory hop could not survive. The business
    // write happened and the event was recorded; then the process was gone
    // before anything evaluated a single rule.
    clockMs = Date.now();
    const rule = await makeRule({
      name: `[CRM-TEST] durable event ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "add_note", config: { body: "survived a restart" } }],
    });
    await enableOnly(rule["id"]);

    const leadId = await makeLead();

    const recorded = await sweep.recordAutomationEvent(
      { trigger: "lead_created", payload: { recordId: leadId } },
      { source: "producer", now: clock() },
    );
    expect(recorded?.created).toBe(true);

    // ── the process dies here ──
    expect(await executionsFor(rule["id"]), "nothing has evaluated a rule yet").toHaveLength(0);

    // A different worker, later, finds the work still waiting.
    const drained = await sweep.drainAutomationEvents(deps());
    expect(drained.processed).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 10; i += 1) {
      const { claimed } = await engine.drainAutomationJobs(deps(), 20);
      if (claimed === 0) break;
    }

    const runs = await executionsFor(rule["id"]);
    expect(runs, "the rule ran after the restart").toHaveLength(1);
    expect(runs[0].recordId).toBe(leadId);

    // And it is at-least-once with harmless repeats, not exactly-once: draining
    // again must not produce a second execution.
    await sweep.drainAutomationEvents(deps());
    await sweep.processAutomationEvent(recorded!.event.id, deps());
    expect(await executionsFor(rule["id"])).toHaveLength(1);
  }, 120_000);

  it("keeps the business write working when rule evaluation is broken, and runs the rule once it is fixed", async () => {
    // "Broken" as a database fault rather than a mocked throw: a CHECK that
    // refuses any execution row for this rule, which is what a real constraint
    // problem, a lock timeout or a bad migration looks like from here.
    clockMs = Date.now();
    const rule = await makeRule({
      name: `[CRM-TEST] broken evaluation ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "add_note", config: { body: "ran after the fault was fixed" } }],
    });
    await enableOnly(rule["id"]);

    // DDL takes no bind parameters, so the whole statement is raw. The only
    // interpolated value is this rule's own integer id.
    const guard = `tmp_crm_test_break_rule_${rule["id"]}`;
    await db.execute(sql.raw(
      `ALTER TABLE crm_automation_executions ADD CONSTRAINT ${guard} CHECK (rule_id <> ${Number(rule["id"])})`,
    ));

    let createdLeadId = 0;
    try {
      const created = await owner.call("POST", "/api/crm/leads", {
        name: "[CRM-TEST] Broken Rule Lead",
        email: `broken-rule-${STAMP}@example.test`,
        source: "Referral",
      });
      // THE assertion: capturing a lead cannot fail because somebody's rule is
      // unrunnable.
      expect(created.status, JSON.stringify(created.json)).toBe(201);
      createdLeadId = created.json["lead"].id as number;
      leadIds.push(createdLeadId);

      // The event was recorded even though evaluating it failed, and it says so
      // rather than disappearing into a log line.
      const stuck = await waitFor(
        async () => {
          const rows = await eventsFor("lead", createdLeadId);
          return rows.length && rows[0].attempts > 0 ? rows : null;
        },
        "a recorded event that failed to evaluate",
      );
      expect(stuck[0].status).toBe("pending");
      // The recorded reason names the fault, not just the statement — an
      // operator reading this column needs "violates check constraint".
      expect(String(stuck[0].lastError)).toMatch(/violates check constraint/i);
      expect(String(stuck[0].lastError)).toMatch(/tmp_crm_test_break_rule/i);
      expect(await executionsFor(rule["id"])).toHaveLength(0);
    } finally {
      await db.execute(sql.raw(
        `ALTER TABLE crm_automation_executions DROP CONSTRAINT IF EXISTS ${guard}`,
      ));
    }

    // Fixed. The recorded event is retried and the rule finally runs — nothing
    // was lost, it was only late.
    await db.update(schema.crmAutomationEvents)
      .set({ nextAttemptAt: new Date(clockMs) })
      .where(and(
        eq(schema.crmAutomationEvents.recordType, "lead"),
        eq(schema.crmAutomationEvents.recordId, createdLeadId),
      ));
    await sweep.drainAutomationEvents(deps());
    for (let i = 0; i < 10; i += 1) {
      const { claimed } = await engine.drainAutomationJobs(deps(), 20);
      if (claimed === 0) break;
    }

    const runs = await executionsFor(rule["id"]);
    expect(runs, "the event was retried, not lost").toHaveLength(1);
    expect(runs[0].recordId).toBe(createdLeadId);
  }, 120_000);

  it("records a business event durably on the normal producer path", async () => {
    // The producers keep their fire-and-forget contract, and the event is a row
    // before anything evaluates it.
    clockMs = Date.now();
    const rule = await makeRule({
      name: `[CRM-TEST] producer durability ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "add_note", config: { body: "recorded first" } }],
    });
    await enableOnly(rule["id"]);

    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Durable Producer Lead",
      email: `durable-producer-${STAMP}@example.test`,
      source: "Referral",
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const leadId = created.json["lead"].id as number;
    leadIds.push(leadId);

    const rows = await waitFor(
      async () => {
        const found = await eventsFor("lead", leadId);
        return found.length ? found : null;
      },
      "a durable event row for the captured lead",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("producer");
    expect(rows[0].trigger).toBe("lead_created");

    await waitFor(
      async () => {
        const runs = await executionsFor(rule["id"]);
        return runs.length ? runs : null;
      },
      "the rule to run from the recorded event",
    );
    expect(await executionsFor(rule["id"])).toHaveLength(1);
  }, 120_000);
});
