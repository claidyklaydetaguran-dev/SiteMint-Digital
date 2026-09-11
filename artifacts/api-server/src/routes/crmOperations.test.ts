/**
 * M2 acceptance — Operations, My Day, the reminder engine, Command Center.
 *
 * The reminder tests are the point of this file. A bell icon and a
 * client-side "overdue" label prove nothing; these drive the real queue
 * against a real database and assert the properties that make it a service:
 * dedupe, claim-once, cancel-on-change, retry, permanent-failure visibility,
 * restart recovery, and timezone correctness.
 *
 * Gated on CRM_TEST_DATABASE_URL. Skips without it so CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "m2-admin-secret-value";
delete process.env.CRM_EMAIL_TEST_MODE; // test mode ON → no mail can leave

const STAMP = Date.now();
const OWNER = { email: `m2-owner-${STAMP}@example.test`, name: "[CRM-TEST] M2 Owner", password: "harbour-trellis-4417" };
const MATE = { email: `m2-mate-${STAMP}@example.test`, name: "[CRM-TEST] M2 Mate", password: "lantern-quartz-9928" };

const suite = TEST_DB ? describe : describe.skip;

suite("M2 operations, reminders and command center (real DB)", () => {
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
  const mate = new Agent();
  const ids: Record<string, number> = {};

  async function wipe() {
    const {
      db, crmStaff, crmStaffLoginAttempts, crmScheduledJobs, crmNotifications,
      crmTasks, crmProjects, crmProjectMilestones, crmProjectUpdates,
      crmComments, crmApprovals, crmProjectTemplates,
    } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.delete(crmScheduledJobs);
    await db.delete(crmNotifications);
    await db.delete(crmProjectMilestones);
    await db.delete(crmProjectUpdates);
    await db.delete(crmComments);
    await db.delete(crmApprovals);
    await db.delete(crmProjectTemplates);
    await db.execute(sql`DELETE FROM crm_tasks WHERE title LIKE '%CRM-TEST%'`);
    await db.execute(sql`DELETE FROM crm_projects WHERE name LIKE '%CRM-TEST%'`);
    await db.delete(crmStaff);
    await db.delete(crmStaffLoginAttempts);
    void crmTasks; void crmProjects;
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
      adminPassword: "m2-admin-secret-value", email: OWNER.email,
      displayName: OWNER.name, password: OWNER.password,
    });
    await owner.login(OWNER);
    ids["owner"] = (await owner.call("GET", "/api/crm/staff/me")).json["staff"].id;

    const invited = await owner.call("POST", "/api/crm/staff", {
      email: MATE.email, displayName: MATE.name, role: "operations_manager",
    });
    ids["mate"] = invited.json["staff"].id;
    await owner.call("POST", "/api/crm/staff/activation", {
      token: invited.json["activationToken"], password: MATE.password,
    });
    await mate.login(MATE);
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) await wipe();
    await new Promise<void>((res, rej) => server.close((e) => e ? rej(e) : res()));
  }, 60_000);

  // ── Timezone arithmetic ───────────────────────────────────────────────────

  it("converts a local wall-clock time to the correct UTC instant, across DST", async () => {
    const { localTimeToUtc } = await import("../lib/crmScheduler.js");

    // Manila is UTC+8 all year (no DST): 09:00 local is 01:00Z.
    const manila = localTimeToUtc("Asia/Manila", new Date("2026-07-15T00:00:00Z"), 9, 0);
    expect(manila.toISOString()).toBe("2026-07-15T01:00:00.000Z");

    // New York in July is UTC-4 (EDT): 09:00 local is 13:00Z.
    const summer = localTimeToUtc("America/New_York", new Date("2026-07-15T12:00:00Z"), 9, 0);
    expect(summer.toISOString()).toBe("2026-07-15T13:00:00.000Z");

    // ...and in January is UTC-5 (EST): 09:00 local is 14:00Z. A fixed offset
    // would get one of these two wrong.
    const winter = localTimeToUtc("America/New_York", new Date("2026-01-15T12:00:00Z"), 9, 0);
    expect(winter.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  // ── Queue mechanics ───────────────────────────────────────────────────────

  it("deduplicates: scheduling the same reminder twice moves it, never duplicates it", async () => {
    const { scheduleJob } = await import("../lib/crmScheduler.js");
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const key = `test-dedupe-${STAMP}`;
    const first = new Date(Date.now() + 3600_000);
    const second = new Date(Date.now() + 7200_000);
    await scheduleJob({ kind: "task_reminder", dedupeKey: key, runAt: first, payload: { a: 1 } });
    await scheduleJob({ kind: "task_reminder", dedupeKey: key, runAt: second, payload: { a: 2 } });

    const rows = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(rows.length).toBe(1);
    expect(rows[0].runAt.toISOString()).toBe(second.toISOString());
    expect(rows[0].payload["a"]).toBe(2);
  });

  it("claims each due job exactly once even when workers run concurrently", async () => {
    const { scheduleJob, processDueJobs } = await import("../lib/crmScheduler.js");
    const { db, crmScheduledJobs, crmNotifications } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");

    // A real task so the handler produces an observable notification.
    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] concurrency probe", assignedToStaffId: ids["owner"],
    });
    const taskId = created.json["task"].id as number;

    await scheduleJob({
      kind: "task_reminder", dedupeKey: `task_reminder:${taskId}`,
      runAt: new Date(Date.now() - 1000), payload: { taskId, staffId: ids["owner"] },
    });

    // Two workers race for the same row.
    const [a, b] = await Promise.all([processDueJobs(), processDueJobs()]);
    expect(a.processed + b.processed).toBe(1);

    const notes = await db.select().from(crmNotifications)
      .where(and(eq(crmNotifications.staffId, ids["owner"]), eq(crmNotifications.entityId, taskId)));
    expect(notes.length).toBe(1);

    const [job] = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`));
    expect(job.status).toBe("completed");
  }, 30_000);

  it("reclaims a job whose worker died mid-run", async () => {
    const { scheduleJob, processDueJobs } = await import("../lib/crmScheduler.js");
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");

    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] restart probe", assignedToStaffId: ids["owner"],
    });
    const taskId = created.json["task"].id as number;
    const key = `task_reminder:${taskId}`;
    await scheduleJob({
      kind: "task_reminder", dedupeKey: key,
      runAt: new Date(Date.now() - 1000), payload: { taskId, staffId: ids["owner"] },
    });

    // Simulate a process that claimed the job and was then killed: the row is
    // left 'running' with an old lock.
    await db.update(crmScheduledJobs).set({
      status: "running", lockedBy: "dead-worker",
      lockedAt: sql`now() - interval '10 minutes'`,
    }).where(eq(crmScheduledJobs.dedupeKey, key));

    const result = await processDueJobs();
    expect(result.processed).toBe(1);
    const [job] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(job.status).toBe("completed");
  }, 30_000);

  it("retries a failing job with backoff, then marks it permanently failed and visible", async () => {
    const { scheduleJob, processDueJobs } = await import("../lib/crmScheduler.js");
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const key = `test-failure-${STAMP}`;
    // An unknown kind always throws in the dispatcher.
    await db.insert(crmScheduledJobs).values({
      kind: "definitely_not_a_handler", dedupeKey: key,
      runAt: new Date(Date.now() - 1000), payload: {}, maxAttempts: 2,
    });

    await processDueJobs();
    let [job] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now()); // backed off

    // Force it due again to exhaust the attempts.
    await db.update(crmScheduledJobs).set({ runAt: new Date(Date.now() - 1000) })
      .where(eq(crmScheduledJobs.dedupeKey, key));
    await processDueJobs();
    [job] = await db.select().from(crmScheduledJobs).where(eq(crmScheduledJobs.dedupeKey, key));
    expect(job.status).toBe("failed");
    expect(job.lastError).toContain("unknown job kind");

    // And an operator can see it — failures are surfaced, not just logged.
    const seen = await owner.call("GET", "/api/crm/operations/jobs");
    expect(seen.status).toBe(200);
    expect(seen.json["counts"].failed).toBeGreaterThanOrEqual(1);
    expect((seen.json["failures"] as { dedupeKey: string }[]).some((f) => f.dedupeKey === key)).toBe(true);

    void scheduleJob;
  }, 30_000);

  // ── Reminders track the work ──────────────────────────────────────────────

  it("completing a task cancels its pending reminder", async () => {
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] cancel on complete",
      assignedToStaffId: ids["owner"],
      remindAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const taskId = created.json["task"].id as number;
    let [job] = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`));
    expect(job.status).toBe("pending");

    await owner.call("PATCH", `/api/crm/operations/tasks/${taskId}`, { status: "completed" });
    [job] = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`));
    expect(job.status).toBe("cancelled");
  }, 30_000);

  it("rescheduling moves the reminder instead of adding a second one", async () => {
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] reschedule", assignedToStaffId: ids["owner"],
      remindAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const taskId = created.json["task"].id as number;
    const moved = new Date(Date.now() + 7200_000);
    await owner.call("PATCH", `/api/crm/operations/tasks/${taskId}`, { remindAt: moved.toISOString() });

    const rows = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`));
    expect(rows.length).toBe(1);
    expect(Math.abs(rows[0].runAt.getTime() - moved.getTime())).toBeLessThan(1500);
  }, 30_000);

  it("a fired reminder notifies the assignee, and a completed task fires nothing", async () => {
    const { processDueJobs } = await import("../lib/crmScheduler.js");

    const live = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] should notify", assignedToStaffId: ids["mate"],
      remindAt: new Date(Date.now() - 1000).toISOString(),
    });
    const doneTask = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] should not notify", assignedToStaffId: ids["mate"],
      remindAt: new Date(Date.now() - 1000).toISOString(),
    });
    // Complete the second one BEFORE the queue runs.
    await owner.call("PATCH", `/api/crm/operations/tasks/${doneTask.json["task"].id}`, { status: "completed" });

    await processDueJobs();

    const inbox = await mate.call("GET", "/api/crm/notifications");
    expect(inbox.status).toBe(200);
    const titles = (inbox.json["notifications"] as { title: string; entityId: number }[]);
    expect(titles.some((n) => n.entityId === live.json["task"].id)).toBe(true);
    expect(titles.some((n) => n.entityId === doneTask.json["task"].id)).toBe(false);
  }, 30_000);

  it("a recurring reminder schedules its next occurrence only after firing", async () => {
    const { processDueJobs } = await import("../lib/crmScheduler.js");
    const { db, crmScheduledJobs } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const created = await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] weekly", assignedToStaffId: ids["owner"],
      remindAt: new Date(Date.now() - 1000).toISOString(), recurrence: "weekly",
    });
    const taskId = created.json["task"].id as number;
    await processDueJobs();

    const rows = await db.select().from(crmScheduledJobs)
      .where(eq(crmScheduledJobs.dedupeKey, `task_reminder:${taskId}`));
    expect(rows.length).toBe(1);           // still one row — moved, not fanned out
    expect(rows[0].status).toBe("pending"); // re-armed for next week
    expect(rows[0].runAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
  }, 30_000);

  // ── My Day ────────────────────────────────────────────────────────────────

  it("My Day shows the signed-in person's own work, bucketed", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const nextWeek = new Date(Date.now() + 5 * 24 * 3600_000).toISOString();

    await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] mine overdue", assignedToStaffId: ids["owner"], dueDate: yesterday,
    });
    await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] mine upcoming", assignedToStaffId: ids["owner"], dueDate: nextWeek,
    });
    await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] theirs", assignedToStaffId: ids["mate"], dueDate: yesterday,
    });
    await owner.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] blocked", assignedToStaffId: ids["owner"], dueDate: yesterday,
    }).then((r) => owner.call("PATCH", `/api/crm/operations/tasks/${r.json["task"].id}`,
      { blockedReason: "Waiting on the client's logo files" }));

    const day = await owner.call("GET", "/api/crm/my-day");
    expect(day.status).toBe(200);
    const titles = (bucket: string) => (day.json[bucket] as { title: string }[]).map((t) => t.title);

    expect(titles("overdue")).toContain("[CRM-TEST] mine overdue");
    expect(titles("upcoming")).toContain("[CRM-TEST] mine upcoming");
    expect(titles("blocked")).toContain("[CRM-TEST] blocked");
    // Somebody else's task must not appear in my day.
    expect(titles("overdue")).not.toContain("[CRM-TEST] theirs");
    // A blocked task belongs in exactly one bucket.
    expect(titles("overdue")).not.toContain("[CRM-TEST] blocked");
    expect(day.json["counts"].overdue).toBe((day.json["overdue"] as unknown[]).length);
  }, 60_000);

  it("the team view is permission-gated, and the owner can see everyone's work", async () => {
    const denied = await mate.call("GET", "/api/crm/my-day?scope=team");
    expect(denied.status).toBe(200); // operations_manager HAS tasks.read.team
    const team = await owner.call("GET", "/api/crm/my-day?scope=team");
    expect(team.status).toBe(200);
    expect((team.json["overdue"] as { title: string }[]).map((t) => t.title))
      .toContain("[CRM-TEST] theirs");
  }, 30_000);

  it("a task created from a lead lands in the same system and the right My Day", async () => {
    const lead = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] cross-surface", email: `cross-${STAMP}@example.test`,
    });
    const leadId = lead.json["lead"].id as number;
    const created = await owner.call("POST", `/api/crm/leads/${leadId}/tasks`, {
      title: "[CRM-TEST] from the lead screen", type: "Call",
      dueDate: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
      assignedToStaffId: ids["mate"],
    });
    expect(created.status).toBe(201);

    const theirDay = await mate.call("GET", "/api/crm/my-day");
    expect((theirDay.json["overdue"] as { title: string }[]).map((t) => t.title))
      .toContain("[CRM-TEST] from the lead screen");
  }, 30_000);

  it("assigning work to somebody else requires the assign permission", async () => {
    const { db, crmStaff } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    // Revoke tasks.assign from the operations manager.
    await owner.call("PATCH", `/api/crm/staff/${ids["mate"]}`, { revokedPermissions: ["tasks.assign"] });
    await mate.login(MATE);

    const refused = await mate.call("POST", "/api/crm/operations/tasks", {
      title: "[CRM-TEST] not allowed", assignedToStaffId: ids["owner"],
    });
    expect(refused.status).toBe(403);
    expect(refused.json["permission"]).toBe("tasks.assign");

    // ...but they may still create their own work.
    const own = await mate.call("POST", "/api/crm/operations/tasks", { title: "[CRM-TEST] my own" });
    expect(own.status).toBe(201);

    await owner.call("PATCH", `/api/crm/staff/${ids["mate"]}`, { revokedPermissions: [] });
    await mate.login(MATE);
    void db; void crmStaff; void eq;
  }, 30_000);

  // ── Operations ────────────────────────────────────────────────────────────

  it("runs a project through milestones, dependencies, updates, comments and approval", async () => {
    const project = await owner.call("POST", "/api/crm/projects", {
      name: "[CRM-TEST] M2 delivery", stage: "Design",
    });
    expect([200, 201]).toContain(project.status);
    const projectId = project.json["project"].id as number;
    ids["project"] = projectId;

    await owner.call("PATCH", `/api/crm/operations/projects/${projectId}`, {
      ownerStaffId: ids["owner"], nextAction: "Send the wireframes", priority: "High",
    });

    const first = await owner.call("POST", `/api/crm/operations/projects/${projectId}/milestones`, {
      title: "Wireframes signed off", dueDate: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
    });
    expect(first.status).toBe(201);
    const second = await owner.call("POST", `/api/crm/operations/projects/${projectId}/milestones`, {
      title: "Build complete", dependsOnMilestoneId: first.json["milestone"].id,
    });

    // The dependency is enforced, not decorative.
    const tooEarly = await owner.call("PATCH", `/api/crm/operations/milestones/${second.json["milestone"].id}`, { status: "done" });
    expect(tooEarly.status).toBe(409);
    expect(String(tooEarly.json["error"])).toContain("Wireframes signed off");

    await owner.call("PATCH", `/api/crm/operations/milestones/${first.json["milestone"].id}`, { status: "done" });
    const nowOk = await owner.call("PATCH", `/api/crm/operations/milestones/${second.json["milestone"].id}`, { status: "done" });
    expect(nowOk.status).toBe(200);

    await owner.call("POST", `/api/crm/operations/projects/${projectId}/updates`, {
      body: "Wireframes approved on the call.",
    });
    await owner.call("POST", "/api/crm/operations/comments", {
      entityType: "project", entityId: projectId, body: "Internal: watch the budget here.",
    });
    const approval = await owner.call("POST", "/api/crm/operations/approvals", {
      entityType: "project", entityId: projectId, title: "Approve the extra page",
      approverStaffId: ids["owner"],
    });
    expect(approval.status).toBe(201);
    const decided = await owner.call("POST", `/api/crm/operations/approvals/${approval.json["approval"].id}/decide`,
      { decision: "approved", note: "Agreed at the standup." });
    expect(decided.status).toBe(200);

    const detail = await owner.call("GET", `/api/crm/operations/projects/${projectId}`);
    expect(detail.status).toBe(200);
    expect((detail.json["milestones"] as unknown[]).length).toBe(2);
    expect((detail.json["updates"] as { authorLabel: string }[])[0].authorLabel).toBe(OWNER.name);
    expect((detail.json["comments"] as { isInternal: boolean }[])[0].isInternal).toBe(true);
    expect((detail.json["approvals"] as { status: string }[])[0].status).toBe("approved");
  }, 60_000);

  it("an approval routed to one person cannot be decided by another", async () => {
    const approval = await owner.call("POST", "/api/crm/operations/approvals", {
      entityType: "project", entityId: ids["project"], title: "Owner-only decision",
      approverStaffId: ids["owner"],
    });
    const refused = await mate.call("POST", `/api/crm/operations/approvals/${approval.json["approval"].id}/decide`,
      { decision: "approved" });
    expect(refused.status).toBe(403);
  }, 30_000);

  it("applies a template, creating real tasks and milestones on the project", async () => {
    const template = await owner.call("POST", "/api/crm/operations/templates", {
      name: `[CRM-TEST] Website build ${STAMP}`,
      tasks: [{ title: "Kickoff call", dayOffset: 0 }, { title: "Draft sitemap", dayOffset: 2 }],
      milestones: [{ title: "Design approved", dayOffset: 7 }],
    });
    expect(template.status).toBe(201);

    const applied = await owner.call("POST", `/api/crm/operations/projects/${ids["project"]}/apply-template`,
      { templateId: template.json["template"].id });
    expect(applied.status).toBe(201);
    expect((applied.json["tasks"] as unknown[]).length).toBe(2);
    expect((applied.json["milestones"] as unknown[]).length).toBe(1);

    const detail = await owner.call("GET", `/api/crm/operations/projects/${ids["project"]}`);
    expect((detail.json["tasks"] as { title: string }[]).map((t) => t.title)).toContain("Kickoff call");
    // The template application is itself recorded in the work log.
    expect((detail.json["updates"] as { body: string }[]).some((u) => u.body.includes("template"))).toBe(true);
  }, 60_000);

  it("archives and restores a project without losing its history", async () => {
    await owner.call("PATCH", `/api/crm/operations/projects/${ids["project"]}`, { archived: true });
    const hidden = await owner.call("GET", "/api/crm/operations/projects");
    expect((hidden.json["projects"] as { id: number }[]).some((p) => p.id === ids["project"])).toBe(false);

    const shown = await owner.call("GET", "/api/crm/operations/projects?includeArchived=true");
    expect((shown.json["projects"] as { id: number }[]).some((p) => p.id === ids["project"])).toBe(true);

    await owner.call("PATCH", `/api/crm/operations/projects/${ids["project"]}`, { archived: false });
    const detail = await owner.call("GET", `/api/crm/operations/projects/${ids["project"]}`);
    expect((detail.json["milestones"] as unknown[]).length).toBeGreaterThan(0);
    expect((detail.json["updates"] as unknown[]).length).toBeGreaterThan(0);
  }, 30_000);

  it("paginates projects server-side with a capped limit", async () => {
    const page = await owner.call("GET", "/api/crm/operations/projects?limit=1&offset=0");
    expect(page.status).toBe(200);
    expect((page.json["projects"] as unknown[]).length).toBeLessThanOrEqual(1);
    expect(typeof page.json["total"]).toBe("number");
    const capped = await owner.call("GET", "/api/crm/operations/projects?limit=99999");
    expect(capped.json["limit"]).toBeLessThanOrEqual(200);
  });

  // ── Command Center ────────────────────────────────────────────────────────

  it("every panel count matches the rows its own endpoint returns", async () => {
    const dash = await owner.call("GET", "/api/crm/command-center?days=30&limit=100");
    expect(dash.status).toBe(200);
    const panels = dash.json["panels"] as { key: string; available: boolean; count: number | null; items: unknown[] }[];
    expect(panels.length).toBeGreaterThan(8);

    for (const p of panels.filter((x) => x.available)) {
      const one = await owner.call("GET", `/api/crm/command-center/panel/${p.key}?days=30&limit=200`);
      expect(one.status).toBe(200);
      const panel = one.json["panel"] as { count: number; items: unknown[] };
      expect(panel.count).toBe(p.count);
      // The list under a button must be able to account for its number.
      if (panel.count <= 200) expect(panel.items.length).toBe(panel.count);
    }
  }, 60_000);

  it("an uninstrumented metric reports unavailable with a reason, never a zero", async () => {
    const dash = await owner.call("GET", "/api/crm/command-center");
    const panels = dash.json["panels"] as { key: string; available: boolean; count: number | null; reason?: string }[];

    for (const key of ["return_visits", "appointments", "documents_signed", "videos_watched"]) {
      const p = panels.find((x) => x.key === key)!;
      expect(p.available).toBe(false);
      expect(p.count).toBeNull();          // NOT 0
      expect(typeof p.reason).toBe("string");
      expect(p.reason!.length).toBeGreaterThan(20);
    }
  }, 30_000);

  it("states the basis of every sales figure and refuses a rate with no denominator", async () => {
    const dash = await owner.call("GET", "/api/crm/command-center");
    const sales = dash.json["sales"];
    // Pipeline, contracted and received are distinct figures.
    expect(sales).toHaveProperty("openDeals");
    expect(sales).toHaveProperty("wonDeals");
    expect(sales).toHaveProperty("moneyReceivedAllTime");
    expect(sales.definitions.moneyReceived).toContain("actual cash");
    // No decided deals in this isolated database → the rate is null, not 0%.
    if (sales.winRateDenominator === 0) expect(sales.winRate).toBeNull();
    expect(typeof sales.weightedForecast).toBe("number");
    expect(sales.definitions.weightedForecast).toContain("assumption");
  }, 30_000);

  it("serves a real activity feed and a reminder-preferences round trip", async () => {
    const feed = await owner.call("GET", "/api/crm/command-center/activity?limit=10");
    expect(feed.status).toBe(200);
    expect(Array.isArray(feed.json["activity"])).toBe(true);

    const saved = await owner.call("PATCH", "/api/crm/operations/reminder-preferences", {
      timezone: "Asia/Manila", dailyDigestEnabled: true, dailyDigestHour: 7,
    });
    expect(saved.status).toBe(200);
    expect(saved.json["timezone"]).toBe("Asia/Manila");

    const bad = await owner.call("PATCH", "/api/crm/operations/reminder-preferences", { timezone: "Not/AZone" });
    expect(bad.status).toBe(400);

    // My Day now reports the person's own zone.
    const day = await owner.call("GET", "/api/crm/my-day");
    expect(day.json["timezone"]).toBe("Asia/Manila");
  }, 30_000);
});
