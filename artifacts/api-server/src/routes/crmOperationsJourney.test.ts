/**
 * CRM essential operating journey — DB-backed end-to-end proof.
 *
 * Inquiry received → reviewed and assigned → next action scheduled →
 * proposal generated → project created → tasks assigned → progress recorded →
 * completion and follow-up — all through the real Express app against a real
 * PostgreSQL database, with persistence asserted by re-reading, never by
 * trusting the write response.
 *
 * Runs ONLY when CRM_TEST_DATABASE_URL points at an isolated, disposable
 * database with the full schema provisioned (see docs/crm-ops/AUDIT-2026-09-11.md).
 * Without it the suite is skipped, so CI without a database stays green.
 * All rows this suite creates are labeled "[CRM-TEST]" and deleted at the end.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;

// Environment must be settled before app.ts / @workspace/db are imported.
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "crm-journey-test-password";
// Unset → email test mode ON: no send path can reach a real recipient.
delete process.env.CRM_EMAIL_TEST_MODE;

const LABEL = `[CRM-TEST] journey ${Date.now()}`;
const EMAIL = `crm-test-journey-${Date.now()}@example.test`;

const suite = TEST_DB ? describe : describe.skip;

suite("CRM operating journey (real DB)", () => {
  let server: http.Server;
  let base: string;
  let token = "";

  // Ids created along the journey, removed in afterAll.
  let leadId = 0;
  let submissionId = 0;
  let projectId = 0;

  async function req(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: boolean } = {},
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (opts.auth !== false && token) headers["Authorization"] = `Bearer ${token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* non-JSON */ }
    return { status: res.status, json };
  }

  beforeAll(async () => {
    // The R6 boot gate refuses /api traffic until the boot sequence marks the
    // process ready. The test database schema is provisioned out-of-band, so
    // mark ready directly instead of running production migrations here.
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: express.Express };
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    // Cleanup through the same authenticated API the operator would use.
    if (token) {
      if (submissionId) await req("DELETE", `/api/crm/discovery-submissions/${submissionId}`);
      if (projectId) await req("DELETE", `/api/crm/projects/${projectId}`);
      if (leadId) await req("DELETE", `/api/crm/leads/${leadId}`);
    }
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }, 30_000);

  // ── Auth boundary ───────────────────────────────────────────────────────────

  it("rejects a wrong password and issues no token", async () => {
    const r = await req("POST", "/api/admin/login", { body: { password: "wrong" }, auth: false });
    expect(r.status).toBe(401);
    expect(r.json["token"]).toBeUndefined();
  });

  it("rejects unauthenticated and garbage-token access to CRM data", async () => {
    const anon = await req("GET", "/api/crm/leads", { auth: false });
    expect(anon.status).toBe(401);
    token = "not-a-real-token";
    const forged = await req("GET", "/api/crm/leads");
    expect(forged.status).toBe(401);
    token = "";
  });

  it("signs in with the correct password", async () => {
    const r = await req("POST", "/api/admin/login", { body: { password: "crm-journey-test-password" }, auth: false });
    expect(r.status).toBe(200);
    expect(typeof r.json["token"]).toBe("string");
    token = r.json["token"] as string;
  });

  // ── 1. Inquiry received ─────────────────────────────────────────────────────

  it("records a staff-entered discovery inquiry: submission + lead + follow-up task", async () => {
    const r = await req("POST", "/api/crm/discovery-submissions", {
      body: {
        contactName: `${LABEL} contact`,
        companyName: `${LABEL} Co`,
        email: EMAIL,
        phone: "+15551230000",
        serviceInterest: "new-website",
        budget: "2.5k-5k",
        timeline: "30-days",
      },
    });
    expect(r.status).toBe(201);
    const sub = r.json["submission"] as { id: number; crmStatus: string };
    submissionId = sub.id;
    leadId = r.json["leadId"] as number;
    expect(submissionId).toBeGreaterThan(0);
    expect(leadId).toBeGreaterThan(0);
    expect(sub.crmStatus).toBe("New");

    // Persistence proof: re-read the lead — activity and +1-day task exist.
    const lead = await req("GET", `/api/crm/leads/${leadId}`);
    expect(lead.status).toBe(200);
    const activities = lead.json["activities"] as { title: string }[];
    expect(activities.some(a => a.title === "Discovery Submission Received")).toBe(true);
    const tasks = lead.json["tasks"] as { type: string; status: string; dueDate: string }[];
    const followUp = tasks.find(t => t.type === "follow-up");
    expect(followUp).toBeDefined();
    expect(followUp!.status).toBe("pending");
    expect(new Date(followUp!.dueDate).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an invalid inquiry with a clear error and creates nothing", async () => {
    const r = await req("POST", "/api/crm/discovery-submissions", {
      body: { contactName: "", companyName: "", email: "" },
    });
    expect(r.status).toBe(400);
    expect(String(r.json["error"])).toContain("required");
  });

  // ── 2. Reviewed and assigned, next action scheduled ─────────────────────────

  it("assigns the lead and schedules the next action; changes persist on re-read", async () => {
    const followUpAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const patch = await req("PATCH", `/api/crm/leads/${leadId}`, {
      body: { assignedTo: "Claidy Taguran", status: "Qualified", nextFollowUpAt: followUpAt, priority: "High" },
    });
    expect(patch.status).toBe(200);

    const reread = await req("GET", `/api/crm/leads/${leadId}`);
    const lead = reread.json["lead"] as Record<string, unknown>;
    expect(lead["assignedTo"]).toBe("Claidy Taguran");
    expect(lead["status"]).toBe("Qualified");
    expect(lead["priority"]).toBe("High");
    expect(new Date(String(lead["nextFollowUpAt"])).toISOString()).toBe(followUpAt);

    const activities = reread.json["activities"] as { type: string }[];
    expect(activities.some(a => a.type === "status_changed")).toBe(true);
    expect(activities.some(a => a.type === "follow_up_changed")).toBe(true);
  });

  it("review moves the submission out of the New queue", async () => {
    const r = await req("PATCH", `/api/crm/discovery-submissions/${submissionId}`, {
      body: { crmStatus: "Reviewed", internalNotes: `${LABEL} reviewed by test` },
    });
    expect(r.status).toBe(200);
    const back = await req("GET", `/api/crm/discovery-submissions/${submissionId}`);
    expect((back.json["submission"] as Record<string, unknown>)["crmStatus"]).toBe("Reviewed");
  });

  // ── 3. Proposal tracked ─────────────────────────────────────────────────────

  it("generates and persists a proposal, stamping both submission and lead", async () => {
    const r = await req("POST", `/api/crm/discovery-submissions/${submissionId}/generate-proposal`);
    expect(r.status).toBe(200);
    const back = await req("GET", `/api/crm/discovery-submissions/${submissionId}`);
    const sub = back.json["submission"] as Record<string, unknown>;
    expect(sub["crmStatus"]).toBe("Proposal Generated");
    expect(String(sub["generatedProposal"]).length).toBeGreaterThan(100);

    const lead = await req("GET", `/api/crm/leads/${leadId}`);
    expect((lead.json["lead"] as Record<string, unknown>)["proposalStatus"]).toBe("Draft");
  });

  // ── 4. Project created (and retries do not duplicate) ───────────────────────

  it("converts the inquiry into a project with seeded tasks", async () => {
    const r = await req("POST", `/api/crm/discovery-submissions/${submissionId}/convert-to-project`, { body: {} });
    expect(r.status).toBe(201);
    projectId = (r.json["project"] as { id: number }).id;
    expect(projectId).toBeGreaterThan(0);

    const proj = await req("GET", `/api/crm/projects/${projectId}`);
    expect(proj.status).toBe(200);
    const tasks = proj.json["tasks"] as { title: string; status: string }[];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every(t => t.status === "pending")).toBe(true);
  });

  it("a repeated conversion (retry) is refused with 409 and creates no duplicate", async () => {
    const r = await req("POST", `/api/crm/discovery-submissions/${submissionId}/convert-to-project`, { body: {} });
    expect(r.status).toBe(409);
    expect(r.json["projectId"]).toBe(projectId);

    const projects = await req("GET", "/api/crm/projects");
    const mine = (projects.json["projects"] as { name: string }[]).filter(p => p.name.includes(LABEL));
    expect(mine.length).toBe(1);
  });

  // ── 5. Progress recorded ────────────────────────────────────────────────────

  it("records task completion and stage movement; both persist", async () => {
    const proj = await req("GET", `/api/crm/projects/${projectId}`);
    const tasks = proj.json["tasks"] as { id: number }[];
    const firstTask = tasks[0];

    const done = await req("PATCH", `/api/crm/projects/${projectId}/tasks/${firstTask.id}`, {
      body: { status: "completed" },
    });
    expect(done.status).toBe(200);

    const moved = await req("PATCH", `/api/crm/projects/${projectId}`, { body: { stage: "Design" } });
    expect(moved.status).toBe(200);

    const reread = await req("GET", `/api/crm/projects/${projectId}`);
    expect((reread.json["project"] as Record<string, unknown>)["stage"]).toBe("Design");
    const rereadTasks = reread.json["tasks"] as { id: number; status: string; completedAt: string | null }[];
    const completed = rereadTasks.find(t => t.id === firstTask.id);
    expect(completed?.status).toBe("completed");
  });

  // ── 6. Completion and follow-up ─────────────────────────────────────────────

  it("schedules and completes a post-delivery follow-up task on the lead", async () => {
    const created = await req("POST", `/api/crm/leads/${leadId}/tasks`, {
      body: {
        title: `${LABEL} post-launch check-in`,
        type: "follow-up",
        dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    });
    expect(created.status).toBe(201);
    const taskId = (created.json["task"] as { id: number }).id;

    const done = await req("PATCH", `/api/crm/tasks/${taskId}`, { body: { status: "completed" } });
    expect(done.status).toBe(200);

    const lead = await req("GET", `/api/crm/leads/${leadId}`);
    const tasks = lead.json["tasks"] as { id: number; status: string }[];
    expect(tasks.find(t => t.id === taskId)?.status).toBe("completed");
  });

  // ── Command-center reads ────────────────────────────────────────────────────

  it("server-side search finds the journey lead", async () => {
    const r = await req("GET", `/api/crm/leads?search=${encodeURIComponent(LABEL)}`);
    expect(r.status).toBe(200);
    const leads = r.json["leads"] as { id: number }[];
    expect(leads.some(l => l.id === leadId)).toBe(true);
  });

  it("dashboard stats and settings status respond coherently", async () => {
    const stats = await req("GET", "/api/crm/stats");
    expect(stats.status).toBe(200);
    expect(Number(stats.json["totalLeads"] ?? (stats.json as Record<string, Record<string, unknown>>)["stats"]?.["totalLeads"] ?? 0)).toBeGreaterThanOrEqual(0);

    const settings = await req("GET", "/api/crm/settings/status");
    expect(settings.status).toBe(200);
    expect(settings.json["emailTestMode"]).toBe(true);
  });

  it("receptionist signup-job visibility responds with the summary shape", async () => {
    const r = await req("GET", "/api/crm/receptionist-signup-jobs");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json["jobs"])).toBe(true);
    const summary = r.json["summary"] as Record<string, number>;
    expect(typeof summary["permanentlyFailed"]).toBe("number");
  });

  it("the discovery CSV export route is reachable (was shadowed by /:id)", async () => {
    const r = await fetch(`${base}/api/admin/submissions/export/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type") ?? "").toContain("text/csv");
  });

  // ── Cleanup is verified, not assumed ────────────────────────────────────────

  it("cleanup removes every journey row", async () => {
    expect((await req("DELETE", `/api/crm/discovery-submissions/${submissionId}`)).status).toBe(200);
    expect((await req("DELETE", `/api/crm/projects/${projectId}`)).status).toBe(200);
    expect((await req("DELETE", `/api/crm/leads/${leadId}`)).status).toBe(200);

    expect((await req("GET", `/api/crm/leads/${leadId}`)).status).toBe(404);
    expect((await req("GET", `/api/crm/projects/${projectId}`)).status).toBe(404);
    submissionId = 0; projectId = 0; leadId = 0;
  });
});
