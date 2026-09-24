/**
 * M4 Workflow automation — rules, runs, brakes and approvals.
 *
 * The properties worth testing hardest are the ones that hurt when they are
 * wrong, and for automation they are all variations on "it did it twice" or "it
 * never stopped":
 *
 *   - The same event running a rule twice. Fired repeatedly AND concurrently,
 *     because two requests that each "check first" both find nothing — the
 *     UNIQUE index is the only thing that actually decides.
 *   - A condition read from a stale snapshot. Tested in the direction that
 *     hurts: the condition was TRUE when the event fired and FALSE by the time
 *     the rule ran, and the rule must not act.
 *   - A stop condition that only stops a run that has not started. Tested
 *     mid-run, where the first action is the very thing that makes stopping
 *     correct.
 *   - A rule that re-enters itself. Asserted as a bounded number of executions
 *     and, more strongly, as an invariant: no execution past the depth limit is
 *     ever allowed to RUN.
 *   - An action retried after an outcome we do not understand. An `unknown`
 *     outcome must be attempted exactly once, ever.
 *   - A refused write that writes anyway. Every mutating route is called by a
 *     user without the grant and the database is then checked to prove nothing
 *     moved.
 *   - A count that disagrees with the list it labels.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 *
 * ── How the app is booted ───────────────────────────────────────────────────
 *
 * The REAL app, plus the one-line registration the router's owner will add to
 * `src/routes/index.ts`. `crmAutomation.ts` is a new file whose registration
 * belongs to whoever owns that index, so the test performs exactly that
 * registration — `app.use("/api", automationRouter)` — against the real
 * application rather than assembling a stand-in express app. Everything else
 * (CORS, cookie parsing, the boot gate, staff auth, CSRF, the JSON body parser)
 * is the production stack.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "automation-admin-secret-value";

const STAMP = Date.now();
const OWNER = {
  email: `auto-owner-${STAMP}@example.test`, name: "[CRM-TEST] Automation Owner",
  password: "harbour-trellis-5521",
};
const APPROVER = {
  email: `auto-approver-${STAMP}@example.test`, name: "[CRM-TEST] Automation Approver",
  password: "lantern-quartz-7734",
};
const RESTRICTED = {
  email: `auto-restricted-${STAMP}@example.test`, name: "[CRM-TEST] Automation Restricted",
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

suite("workflow automation: rules, brakes, approvals and history (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let engine: typeof import("../lib/automationEngine.js");

  const staffIds: Record<string, number> = {};
  const ruleIds: number[] = [];
  const leadIds: number[] = [];
  let leadId = 0;

  const owner = new Agent(() => base);
  const approver = new Agent(() => base);
  const restricted = new Agent(() => base);

  // A clock the tests own. Retry backoff is computed from it and the job claim
  // compares against it, so "an hour later" is a variable rather than a wait.
  let clockMs = Date.now();
  const clock = () => new Date(clockMs);
  const deps = (executors: Record<string, unknown> = {}) =>
    engine.defaultAutomationDeps({ now: clock, executors: executors as never });

  /** Runs the queue until it is empty, with a hard stop so a runaway rule fails loudly. */
  async function drainAll(d = deps(), maxRounds = 60): Promise<number> {
    let rounds = 0;
    for (; rounds < maxRounds; rounds += 1) {
      const { claimed } = await engine.drainAutomationJobs(d, 20);
      if (claimed === 0) return rounds;
    }
    throw new Error(`the automation queue did not drain in ${maxRounds} rounds — it is looping`);
  }

  /**
   * Switches off every rule this file has created so far.
   *
   * Rules are global by design: a trigger runs EVERY enabled rule listening for
   * it, which is the whole point of the feature and is also why one test's rule
   * would otherwise fire on the next test's records and quietly change what is
   * being measured. Each test therefore starts from "no rules are live" and
   * turns on only the ones it is about. Disabling rather than deleting keeps
   * every test's history intact for the history assertions later on.
   */
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
      name: "[CRM-TEST] Automation Subject",
      email: `auto-lead-${STAMP}-${leadIds.length}@example.test`,
      status: "New Inquiry",
      priority: "Medium",
      ...overrides,
    }).returning();
    leadIds.push(row.id);
    return row.id;
  }

  const executionsFor = (ruleId: number) =>
    db.select().from(schema.crmAutomationExecutions)
      .where(eq(schema.crmAutomationExecutions.ruleId, ruleId));

  const actionRunsFor = (executionId: number) =>
    db.select().from(schema.crmAutomationActionRuns)
      .where(eq(schema.crmAutomationActionRuns.executionId, executionId));

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    engine = await import("../lib/automationEngine.js");

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    // The one-line registration the routes/index.ts owner will make.
    const { default: automationRouter } = await import("./crmAutomation.js");
    app.use("/api", automationRouter);

    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const [who, role] of [
      [OWNER, "owner"], [APPROVER, "owner"], [RESTRICTED, "operations_manager"],
    ] as const) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role, status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }

    await owner.login(OWNER);
    await approver.login(APPROVER);
    await restricted.login(RESTRICTED);

    leadId = await makeLead();
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

  // ── Authoring ─────────────────────────────────────────────────────────────

  it("refuses a rule that could never work, and says exactly why", async () => {
    const noName = await owner.call("POST", "/api/crm/automation/rules", { trigger: "lead_created", actions: [] });
    expect(noName.status).toBe(400);

    const badTrigger = await owner.call("POST", "/api/crm/automation/rules", {
      name: "[CRM-TEST] nonsense", trigger: "the_moon_is_full",
      actions: [{ type: "add_note", config: { body: "hi" } }],
    });
    expect(badTrigger.status).toBe(400);
    expect(String(badTrigger.json["error"])).toMatch(/not a trigger/i);

    // A field that does not exist would sit there looking correct and silently
    // never match. It is refused at save time instead.
    const badField = await owner.call("POST", "/api/crm/automation/rules", {
      name: "[CRM-TEST] bad field", trigger: "lead_created",
      conditions: { combine: "and", conditions: [{ field: "favourite_colour", operator: "equals", value: "teal" }] },
      actions: [{ type: "add_note", config: { body: "hi" } }],
    });
    expect(badField.status).toBe(400);
    expect(String(badField.json["error"])).toMatch(/has no field/i);

    // An automation that can rewrite a customer's email address is data loss,
    // not a workflow.
    const notWritable = await owner.call("POST", "/api/crm/automation/rules", {
      name: "[CRM-TEST] rewrite email", trigger: "lead_created",
      actions: [{ type: "set_field", config: { field: "email", value: "x@y.test" } }],
    });
    expect(notWritable.status).toBe(400);
    expect(String(notWritable.json["error"])).toMatch(/may not set/i);

    const noActions = await owner.call("POST", "/api/crm/automation/rules", {
      name: "[CRM-TEST] does nothing", trigger: "lead_created", actions: [],
    });
    expect(noActions.status).toBe(400);
  }, 60_000);

  it("clamps the loop brakes rather than letting a rule switch them off", async () => {
    const rule = await makeRule({
      name: `[CRM-TEST] brakes ${STAMP}`,
      trigger: "lead_created",
      maxChainDepth: 0, windowCap: 0, maxActionAttempts: 0,
      actions: [{ type: "add_note", config: { body: "noted" } }],
    });
    expect(rule["maxChainDepth"]).toBeGreaterThanOrEqual(1);
    expect(rule["windowCap"]).toBeGreaterThanOrEqual(1);
    expect(rule["maxActionAttempts"]).toBeGreaterThanOrEqual(1);
  }, 60_000);

  // ── Deduplication ─────────────────────────────────────────────────────────

  it("runs a rule exactly once for one event, fired repeatedly AND concurrently", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] dedup ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] dedup task", dueInDays: 1 } }],
    });

    const event = { trigger: "lead_created", payload: { recordId: subject } } as const;

    // Sequentially: a retried request, a double-click.
    for (let i = 0; i < 4; i += 1) await engine.emitAutomationTrigger(event as never, deps());
    // Concurrently: two workers, or two people, at the same instant. This is the
    // case a "check first, then insert" cannot survive.
    await Promise.all(Array.from({ length: 6 }, () => engine.emitAutomationTrigger(event as never, deps())));

    await drainAll();

    const execs = await executionsFor(rule["id"]);
    expect(execs).toHaveLength(1);
    expect(execs[0].status).toBe("completed");

    const tasks = await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject));
    expect(tasks).toHaveLength(1);
  }, 120_000);

  it("keys deduplication on the occurrence, so a LATER change of the same kind still runs", async () => {
    await isolate();
    const subject = await makeLead({ status: "New Inquiry" });
    const rule = await makeRule({
      name: `[CRM-TEST] occurrence ${STAMP}`,
      trigger: "lead_status_changed",
      actions: [{ type: "add_note", config: { body: "status moved" } }],
    });

    await db.update(schema.crmLeads).set({ status: "Qualified", updatedAt: new Date(clockMs) })
      .where(eq(schema.crmLeads.id, subject));
    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: "New Inquiry", to: "Qualified" },
    } as never, deps());
    // Same change, announced twice.
    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: "New Inquiry", to: "Qualified" },
    } as never, deps());

    // A genuinely different change a moment later.
    await db.update(schema.crmLeads).set({ status: "On Hold", updatedAt: new Date(clockMs + 1000) })
      .where(eq(schema.crmLeads.id, subject));
    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: "Qualified", to: "On Hold" },
    } as never, deps());

    await drainAll();

    const execs = await executionsFor(rule["id"]);
    expect(execs).toHaveLength(2);
    expect(new Set(execs.map((e) => e.occurrenceKey)).size).toBe(2);
  }, 120_000);

  // ── Conditions are read fresh ─────────────────────────────────────────────

  it("evaluates conditions against the record as it is NOW, not as it was at trigger time", async () => {
    // Direction 1 — false then, true now: the rule must act.
    await isolate();
    const late = await makeLead({ status: "New Inquiry" });
    const becomesTrue = await makeRule({
      name: `[CRM-TEST] fresh-true ${STAMP}`,
      trigger: "lead_status_changed",
      conditions: { combine: "and", conditions: [{ field: "status", operator: "equals", value: "Qualified" }] },
      actions: [{ type: "add_note", config: { body: "qualified now" } }],
    });
    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: late, from: null, to: "New Inquiry" },
    } as never, deps());
    // Somebody qualifies the lead between the event and the run.
    await db.update(schema.crmLeads).set({ status: "Qualified" }).where(eq(schema.crmLeads.id, late));
    await drainAll();

    const trueExecs = await executionsFor(becomesTrue["id"]);
    expect(trueExecs).toHaveLength(1);
    expect(trueExecs[0].conditionOutcome).toBe("matched");
    expect(trueExecs[0].status).toBe("completed");

    // Direction 2 — true then, false now. This is the one that hurts: acting on
    // a stale snapshot means the CRM confidently does the wrong thing.
    const early = await makeLead({ status: "Qualified" });
    const becomesFalse = await makeRule({
      name: `[CRM-TEST] fresh-false ${STAMP}`,
      trigger: "lead_status_changed",
      conditions: { combine: "and", conditions: [{ field: "status", operator: "equals", value: "Qualified" }] },
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] should never exist" } }],
    });
    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: early, from: "New Inquiry", to: "Qualified" },
    } as never, deps());
    await db.update(schema.crmLeads).set({ status: "Lost" }).where(eq(schema.crmLeads.id, early));
    await drainAll();

    const falseExecs = await executionsFor(becomesFalse["id"]);
    expect(falseExecs).toHaveLength(1);
    expect(falseExecs[0].conditionOutcome).toBe("not_matched");
    expect(falseExecs[0].status).toBe("completed");

    const tasks = await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, early));
    expect(tasks).toHaveLength(0);
    expect(await actionRunsFor(falseExecs[0].id)).toHaveLength(0);
  }, 120_000);

  // ── Stop conditions ───────────────────────────────────────────────────────

  it("halts a rule MID-RUN when a stop condition becomes true", async () => {
    await isolate();
    const subject = await makeLead({ status: "Qualified", priority: "High" });
    const rule = await makeRule({
      name: `[CRM-TEST] stop mid-run ${STAMP}`,
      trigger: "lead_status_changed",
      // The first action is the very thing that makes stopping correct.
      stopConditions: { combine: "or", conditions: [{ field: "priority", operator: "equals", value: "Low" }] },
      actions: [
        { type: "set_field", config: { field: "priority", value: "Low" } },
        { type: "create_task", config: { title: "[CRM-TEST] must not be created" } },
        { type: "add_note", config: { body: "[CRM-TEST] must not be written" } },
      ],
    });

    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: "New Inquiry", to: "Qualified" },
    } as never, deps());
    await drainAll();

    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("stopped");
    expect(execution.stopReason).toBe("stop_condition");
    expect(String(execution.detail)).toMatch(/stop condition/i);

    const runs = (await actionRunsFor(execution.id)).sort((a, b) => a.actionIndex - b.actionIndex);
    expect(runs.map((r) => r.status)).toEqual(["succeeded", "skipped", "skipped"]);

    // And prove it by the side effects, not only by the bookkeeping.
    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(0);
    const notes = await db.select().from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, subject));
    expect(notes.filter((n) => String(n.description).includes("must not be written"))).toHaveLength(0);
  }, 120_000);

  // ── Loop protection ───────────────────────────────────────────────────────

  it("stops a rule whose own action re-triggers it, and the history says why", async () => {
    await isolate();
    const subject = await makeLead({ status: "New Inquiry" });
    // Two set_field steps that flip the status back and forth. Each change
    // emits `lead_status_changed`, which is this rule's own trigger — a
    // genuine self-re-entry built only from the real action vocabulary.
    const rule = await makeRule({
      name: `[CRM-TEST] self loop ${STAMP}`,
      trigger: "lead_status_changed",
      maxChainDepth: 2,
      windowCap: 50,           // so the DEPTH brake is what stops it, not the cap
      actions: [
        { type: "set_field", config: { field: "status", value: "On Hold" } },
        { type: "set_field", config: { field: "status", value: "Qualified" } },
      ],
    });

    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: null, to: "New Inquiry" },
    } as never, deps());

    // It terminates at all — drainAll throws rather than hanging if it does not.
    await drainAll();

    const execs = await executionsFor(rule["id"]);

    // Bounded, not merely finished. Every hop can fan out to at most one new
    // occurrence per changed field, so the ceiling is small and stated.
    expect(execs.length).toBeGreaterThan(1);
    expect(execs.length).toBeLessThanOrEqual(12);

    // The invariant that actually matters: nothing past the limit ever RAN.
    const ranPastLimit = execs.filter(
      (e) => e.chainDepth >= rule["maxChainDepth"] && e.status !== "stopped",
    );
    expect(ranPastLimit).toEqual([]);

    const blocked = execs.filter((e) => e.stopReason === "chain_depth_exceeded");
    expect(blocked.length).toBeGreaterThan(0);
    // The history names the path, not just the fact.
    expect(String(blocked[0].detail)).toMatch(/chain depth/i);
    expect(String(blocked[0].detail)).toMatch(new RegExp(String(rule["id"])));
    expect(blocked[0].chainRuleIds).toContain(rule["id"]);
  }, 180_000);

  it("stops a chain of two rules that trigger each other", async () => {
    await isolate();
    const subject = await makeLead({ status: "Qualified" });
    const a = await makeRule({
      name: `[CRM-TEST] chain A ${STAMP}`,
      trigger: "lead_status_changed",
      maxChainDepth: 2, windowCap: 50,
      conditions: { combine: "and", conditions: [{ field: "status", operator: "equals", value: "Qualified" }] },
      actions: [{ type: "set_field", config: { field: "status", value: "On Hold" } }],
    });
    const b = await makeRule({
      name: `[CRM-TEST] chain B ${STAMP}`,
      trigger: "lead_status_changed",
      maxChainDepth: 2, windowCap: 50,
      conditions: { combine: "and", conditions: [{ field: "status", operator: "equals", value: "On Hold" }] },
      actions: [{ type: "set_field", config: { field: "status", value: "Qualified" } }],
    });

    await engine.emitAutomationTrigger({
      trigger: "lead_status_changed", payload: { recordId: subject, from: "New Inquiry", to: "Qualified" },
    } as never, deps());
    await drainAll();

    const execs = [...await executionsFor(a["id"]), ...await executionsFor(b["id"])];
    expect(execs.length).toBeGreaterThan(1);
    // Two rules, one action each: every hop can create at most two executions
    // (one per rule), so three levels is capped at 2 + 4 + 8.
    expect(execs.length).toBeLessThanOrEqual(14);

    expect(execs.filter((e) => e.chainDepth >= 2 && e.status !== "stopped")).toEqual([]);

    const blocked = execs.filter((e) => e.stopReason === "chain_depth_exceeded");
    expect(blocked.length).toBeGreaterThan(0);
    // The path shows the round trip, which is the thing a person debugging a
    // runaway rule actually needs to see.
    const path = blocked.map((e) => e.chainRuleIds).flat();
    expect(path).toContain(a["id"]);
    expect(path).toContain(b["id"]);
  }, 180_000);

  it("caps how often one rule may run against one record in a window", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] window cap ${STAMP}`,
      trigger: "lead_status_changed",
      windowCap: 3, windowMinutes: 60,
      actions: [{ type: "add_note", config: { body: "capped" } }],
    });

    // Ten separate external events at depth 0 — the case chain depth cannot
    // catch, because each arrives as a fresh event.
    for (let i = 0; i < 10; i += 1) {
      await engine.emitAutomationTrigger({
        trigger: "lead_status_changed",
        payload: { recordId: subject, from: "a", to: `b${i}` },
        occurrenceKey: `[CRM-TEST]-window-${i}`,
      } as never, deps());
    }
    await drainAll();

    const execs = await executionsFor(rule["id"]);
    const ran = execs.filter((e) => e.stopReason !== "rate_cap_exceeded");
    const capped = execs.filter((e) => e.stopReason === "rate_cap_exceeded");

    // Exact: three ran, and the seven refusals collapse into ONE recorded row
    // per window rather than seven — the cap must not become its own flood.
    expect(ran).toHaveLength(3);
    expect(capped).toHaveLength(1);
    expect(String(capped[0].detail)).toMatch(/cap is 3/i);

    const notes = await db.select().from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, subject));
    expect(notes).toHaveLength(3);
  }, 180_000);

  // ── Approvals ─────────────────────────────────────────────────────────────

  it("does not run an action awaiting approval, and runs it once approved", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] approval ${STAMP}`,
      trigger: "lead_created",
      actions: [
        {
          type: "notify",
          config: { staffId: staffIds[OWNER.email], title: "[CRM-TEST] approved notification" },
          approverStaffId: staffIds[APPROVER.email],
        },
      ],
    });

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps());
    await drainAll();

    const [parked] = await executionsFor(rule["id"]);
    expect(parked.status).toBe("awaiting_approval");

    const before = await db.select().from(schema.crmNotifications)
      .where(eq(schema.crmNotifications.staffId, staffIds[OWNER.email]));
    expect(before.filter((n) => n.title.includes("approved notification"))).toHaveLength(0);

    // Draining again must not sneak it through.
    await drainAll();
    const [stillParked] = await executionsFor(rule["id"]);
    expect(stillParked.status).toBe("awaiting_approval");

    const list = await approver.call("GET", "/api/crm/automation/approvals?mine=true");
    expect(list.status).toBe(200);
    const mine = (list.json["approvals"] as any[]).find((a) => a.executionId === parked.id);
    expect(mine).toBeTruthy();
    expect(mine.decidableByMe).toBe(true);

    // Somebody senior is still not the named approver.
    const notMine = await owner.call("POST", `/api/crm/automation/approvals/${mine.id}/decide`,
      { decision: "approve" });
    expect(notMine.status).toBe(403);
    const [afterRefusal] = await db.select().from(schema.crmAutomationApprovals)
      .where(eq(schema.crmAutomationApprovals.id, mine.id));
    expect(afterRefusal.status).toBe("pending");
    expect(afterRefusal.decidedByStaffId).toBeNull();

    const approved = await approver.call("POST", `/api/crm/automation/approvals/${mine.id}/decide`,
      { decision: "approve" });
    expect(approved.status).toBe(200);
    expect(approved.json["approval"].decidedByStaffId).toBe(staffIds[APPROVER.email]);
    expect(approved.json["approval"].decidedAt).not.toBeNull();

    await drainAll();
    const [finished] = await executionsFor(rule["id"]);
    expect(finished.status).toBe("completed");

    const after = await db.select().from(schema.crmNotifications)
      .where(eq(schema.crmNotifications.staffId, staffIds[OWNER.email]));
    expect(after.filter((n) => n.title.includes("approved notification"))).toHaveLength(1);
  }, 180_000);

  it("stops a run when the approver rejects, and records who and why", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] rejection ${STAMP}`,
      trigger: "lead_created",
      actions: [
        {
          type: "create_task",
          config: { title: "[CRM-TEST] rejected task" },
          approverStaffId: staffIds[APPROVER.email],
        },
        { type: "add_note", config: { body: "[CRM-TEST] after the rejected step" } },
      ],
    });

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps());
    await drainAll();

    const [parked] = await executionsFor(rule["id"]);
    const [approval] = await db.select().from(schema.crmAutomationApprovals)
      .where(eq(schema.crmAutomationApprovals.executionId, parked.id));

    // A rejection with no reason teaches nobody anything.
    const noReason = await approver.call("POST", `/api/crm/automation/approvals/${approval.id}/decide`,
      { decision: "reject" });
    expect(noReason.status).toBe(409);
    expect(String(noReason.json["error"])).toMatch(/why/i);

    const rejected = await approver.call("POST", `/api/crm/automation/approvals/${approval.id}/decide`,
      { decision: "reject", reason: "[CRM-TEST] we do not chase clients this way" });
    expect(rejected.status).toBe(200);

    await drainAll();
    const [stopped] = await executionsFor(rule["id"]);
    expect(stopped.status).toBe("stopped");
    expect(stopped.stopReason).toBe("approval_rejected");
    expect(String(stopped.detail)).toMatch(/we do not chase clients this way/);
    expect(String(stopped.detail)).toMatch(new RegExp(String(staffIds[APPROVER.email])));

    const runs = (await actionRunsFor(stopped.id)).sort((a, b) => a.actionIndex - b.actionIndex);
    expect(runs[0].status).toBe("rejected");
    expect(runs[1].status).toBe("skipped");

    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(0);
  }, 180_000);

  // ── Retries ───────────────────────────────────────────────────────────────

  it("retries a definitively-failed action to its budget, then stops visibly", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] retry budget ${STAMP}`,
      trigger: "lead_created",
      maxActionAttempts: 3,
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] never lands" } }],
    });

    let calls = 0;
    const failing = {
      create_task: async () => {
        calls += 1;
        return { result: "failed" as const, detail: "[CRM-TEST] the provider refused it outright" };
      },
    };

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(failing));

    // Each round: drain, then move the clock past the backoff the engine just set.
    for (let round = 0; round < 6; round += 1) {
      await engine.drainAutomationJobs(deps(failing), 20);
      clockMs += 10 * 60_000;
    }

    expect(calls).toBe(3);

    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("failed");
    expect(execution.attempts).toBe(3);
    // "Stays visible" means the reason is on the row, not in a log nobody reads.
    expect(String(execution.detail)).toMatch(/budget/i);
    expect(String(execution.detail)).toMatch(/refused it outright/);

    const [run] = await actionRunsFor(execution.id);
    expect(run.status).toBe("failed");
    expect(run.attempts).toBe(3);

    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(0);
  }, 180_000);

  it("NEVER retries an action whose outcome is unknown", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] unknown outcome ${STAMP}`,
      trigger: "lead_created",
      maxActionAttempts: 5,
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] may or may not exist" } }],
    });

    let calls = 0;
    const ambiguous = {
      create_task: async () => {
        calls += 1;
        return {
          result: "unknown" as const,
          detail: "[CRM-TEST] the write was sent and the answer never came back",
        };
      },
    };

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps(ambiguous));

    for (let round = 0; round < 6; round += 1) {
      await engine.drainAutomationJobs(deps(ambiguous), 20);
      clockMs += 10 * 60_000;
    }

    // Exactly once, ever. A second attempt could create a second task.
    expect(calls).toBe(1);

    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("failed");
    expect(execution.attempts).toBe(0);
    expect(String(execution.detail)).toMatch(/not retried/i);
    expect(String(execution.detail)).toMatch(/may already have happened/i);

    const [run] = await actionRunsFor(execution.id);
    expect(run.status).toBe("unknown");
    expect(run.attempts).toBe(1);
  }, 180_000);

  // ── Permissions ───────────────────────────────────────────────────────────

  it("refuses a restricted user, and writes nothing when it does", async () => {
    const target = ruleIds[0];
    const [before] = await db.select().from(schema.crmAutomationRules)
      .where(eq(schema.crmAutomationRules.id, target));
    const ruleCountBefore = (await db.select().from(schema.crmAutomationRules)).length;
    const execCountBefore = (await executionsFor(target)).length;

    const create = await restricted.call("POST", "/api/crm/automation/rules", {
      name: "[CRM-TEST] should not exist", trigger: "lead_created",
      actions: [{ type: "add_note", config: { body: "no" } }],
    });
    expect(create.status).toBe(403);

    const edit = await restricted.call("PATCH", `/api/crm/automation/rules/${target}`,
      { name: "[CRM-TEST] renamed by somebody who may not", enabled: false });
    expect(edit.status).toBe(403);

    const run = await restricted.call("POST", `/api/crm/automation/rules/${target}/run`,
      { recordId: leadId });
    expect(run.status).toBe(403);

    const remove = await restricted.call("DELETE", `/api/crm/automation/rules/${target}`);
    expect(remove.status).toBe(403);

    // A 403 that still wrote is worse than no check at all.
    const [after] = await db.select().from(schema.crmAutomationRules)
      .where(eq(schema.crmAutomationRules.id, target));
    expect(after.name).toBe(before.name);
    expect(after.enabled).toBe(before.enabled);
    expect(after.archivedAt).toBe(before.archivedAt);
    expect((await db.select().from(schema.crmAutomationRules)).length).toBe(ruleCountBefore);
    expect((await executionsFor(target)).length).toBe(execCountBefore);

    // Reading is a different question from changing, and stays allowed.
    expect((await restricted.call("GET", "/api/crm/automation/rules")).status).toBe(200);
  }, 120_000);

  // ── History ───────────────────────────────────────────────────────────────

  it("answers both 'what has this rule done' and 'what has been done to this record'", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] history ${STAMP}`,
      trigger: "lead_status_changed",
      windowCap: 20,
      actions: [{ type: "add_note", config: { body: "history note" } }],
    });

    for (let i = 0; i < 3; i += 1) {
      await engine.emitAutomationTrigger({
        trigger: "lead_status_changed",
        payload: { recordId: subject, from: "a", to: `b${i}` },
        occurrenceKey: `[CRM-TEST]-history-${i}`,
      } as never, deps());
    }
    await drainAll();

    const byRule = await owner.call("GET", `/api/crm/automation/rules/${rule["id"]}/executions?limit=200`);
    expect(byRule.status).toBe(200);
    expect(byRule.json["executions"]).toHaveLength(3);
    // The count must agree with the list it labels.
    expect(byRule.json["counts"].total).toBe((byRule.json["executions"] as any[]).length);
    expect(byRule.json["counts"].completed).toBe(3);

    const byRecord = await owner.call("GET", `/api/crm/automation/records/lead/${subject}/executions?limit=200`);
    expect(byRecord.status).toBe(200);
    expect(byRecord.json["counts"].total).toBe((byRecord.json["executions"] as any[]).length);
    expect((byRecord.json["executions"] as any[]).every((e) => e.ruleName)).toBe(true);

    const badType = await owner.call("GET", "/api/crm/automation/records/banana/1/executions");
    expect(badType.status).toBe(400);

    // One run in full: which actions it attempted and what each one did.
    const first = (byRule.json["executions"] as any[])[0];
    const detail = await owner.call("GET", `/api/crm/automation/executions/${first.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json["summary"].actionsAttempted).toBe((detail.json["actionRuns"] as any[]).length);
    expect(detail.json["summary"].actionsSucceeded).toBe(1);
    expect(detail.json["actionRuns"][0].affectedRecordType).toBe("lead");
    expect(detail.json["actionRuns"][0].affectedRecordId).toBe(subject);
  }, 180_000);

  it("runs a rule by hand through the same queue, with the brakes still on", async () => {
    await isolate();
    const subject = await makeLead({ status: "Qualified" });
    const rule = await makeRule({
      name: `[CRM-TEST] manual ${STAMP}`,
      trigger: "lead_created",
      windowCap: 1,
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] manual task" } }],
    });

    const ran = await owner.call("POST", `/api/crm/automation/rules/${rule["id"]}/run`, { recordId: subject });
    expect(ran.status).toBe(202);
    expect(ran.json["execution"].status).toBe("completed");
    expect(ran.json["execution"].startedByStaffId).toBe(staffIds[OWNER.email]);
    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(1);

    // The cap is not something "run now" gets to walk past.
    const again = await owner.call("POST", `/api/crm/automation/rules/${rule["id"]}/run`, { recordId: subject });
    expect(again.status).toBe(409);
    expect(String(again.json["error"])).toMatch(/limit/i);
    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(1);

    const missing = await owner.call("POST", `/api/crm/automation/rules/${rule["id"]}/run`,
      { recordId: 999_999_999 });
    expect(missing.status).toBe(409);
  }, 180_000);

  it("stops a queued run whose rule was switched off in the meantime", async () => {
    await isolate();
    const subject = await makeLead();
    const rule = await makeRule({
      name: `[CRM-TEST] disabled mid-flight ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "create_task", config: { title: "[CRM-TEST] cancelled by a switch" } }],
    });

    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps());

    const off = await owner.call("PATCH", `/api/crm/automation/rules/${rule["id"]}`, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.json["rule"].enabled).toBe(false);

    await drainAll();
    const [execution] = await executionsFor(rule["id"]);
    expect(execution.status).toBe("stopped");
    expect(execution.stopReason).toBe("rule_disabled");
    expect(await db.select().from(schema.crmTasks).where(eq(schema.crmTasks.leadId, subject))).toHaveLength(0);
  }, 120_000);

  it("keeps a deleted rule's history and stops matching new events", async () => {
    await isolate();
    const rule = await makeRule({
      name: `[CRM-TEST] deleted ${STAMP}`,
      trigger: "lead_created",
      actions: [{ type: "add_note", config: { body: "before deletion" } }],
    });
    const subject = await makeLead();
    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: subject } } as never, deps());
    await drainAll();
    expect(await executionsFor(rule["id"])).toHaveLength(1);

    const removed = await owner.call("DELETE", `/api/crm/automation/rules/${rule["id"]}`);
    expect(removed.status).toBe(200);

    const after = await makeLead();
    await engine.emitAutomationTrigger(
      { trigger: "lead_created", payload: { recordId: after } } as never, deps());
    await drainAll();

    // No new run, and the old one is still answerable.
    expect(await executionsFor(rule["id"])).toHaveLength(1);
    const history = await owner.call("GET", `/api/crm/automation/rules/${rule["id"]}/executions`);
    expect(history.status).toBe(200);
    expect(history.json["counts"].total).toBe(1);
  }, 120_000);

  it("reports automation health with the two numbers that need a person", async () => {
    const health = await owner.call("GET", "/api/crm/automation/health");
    expect(health.status).toBe(200);
    expect(typeof health.json["enabledRules"]).toBe("number");
    expect(health.json["needsAPerson"]).toBe(
      health.json["executions"]["awaiting_approval"] + health.json["executions"]["failed"],
    );
    expect(health.json["stoppedByLoopProtection"]).toBeGreaterThan(0);
  }, 60_000);
});
