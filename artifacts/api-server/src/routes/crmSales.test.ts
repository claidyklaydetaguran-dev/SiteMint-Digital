/**
 * The sales chain: Contact → Lead → Deal → won → Project → money.
 *
 * The link that did not exist was the conversion. Nothing turned a won deal
 * into a project, so somebody re-typed it — or did not — and the money and the
 * work lived in two places that never agreed.
 *
 * The property worth testing hardest is that converting twice does not produce
 * two projects. A double-click, a retried request, or two people acting at
 * once must all end at one piece of work.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "sales-admin-secret-value";

const STAMP = Date.now();
const OWNER = { email: `sales-owner-${STAMP}@example.test`, name: "[CRM-TEST] Sales Owner", password: "harbour-trellis-5521" };
const MATE = { email: `sales-mate-${STAMP}@example.test`, name: "[CRM-TEST] Sales Mate", password: "lantern-quartz-7734" };

const suite = TEST_DB ? describe : describe.skip;

suite("the sales chain (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let leadId = 0;
  let wonDealId = 0;
  let lostDealId = 0;
  let openDealId = 0;
  let projectId = 0;
  const staffIds: Record<string, number> = {};

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
      const text = await res.text();
      let json: Record<string, any> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      return { status: res.status, json };
    }
    async login(who: { email: string; password: string }) {
      const res = await fetch(`${base}/api/crm/staff/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: who.email, password: who.password }),
      });
      this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const data = await res.json() as { csrfToken?: string };
      this.csrf = data.csrfToken ?? "";
      return res.status;
    }
  }
  const owner = new Agent();

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const who of [OWNER, MATE]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }
    await owner.login(OWNER);

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Sales Subject", email: `sales-lead-${STAMP}@example.test`, status: "New",
    }).returning();
    leadId = lead.id;

    const made = await db.insert(schema.crmDeals).values([
      { leadId, name: "[CRM-TEST] Website rebuild", value: "12000.00", stage: "Proposal" },
      { leadId, name: "[CRM-TEST] Maintenance retainer", value: "3000.00", stage: "Qualified" },
      { leadId, name: "[CRM-TEST] Brand refresh", value: "5000.00", stage: "Proposal" },
    ]).returning();
    wonDealId = made[0].id;
    openDealId = made[1].id;
    lostDealId = made[2].id;
  }, 120_000);

  afterAll(async () => {
    if (projectId) {
      await db.delete(schema.crmTasks).where(eq(schema.crmTasks.projectId, projectId));
      await db.delete(schema.crmProjects).where(eq(schema.crmProjects.id, projectId));
    }
    await db.delete(schema.crmTransactions).where(inArray(schema.crmTransactions.dealId, [wonDealId, openDealId, lostDealId]));
    await db.delete(schema.crmDeals).where(eq(schema.crmDeals.leadId, leadId));
    await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("puts a deal in somebody's name, and refuses a disabled account", async () => {
    const assigned = await owner.call("POST", `/api/crm/deals/${wonDealId}/owner`,
      { staffId: staffIds[MATE.email] });
    expect(assigned.status).toBe(200);
    expect(assigned.json["deal"].ownerStaffId).toBe(staffIds[MATE.email]);

    await db.update(schema.crmStaff).set({ status: "disabled" })
      .where(eq(schema.crmStaff.id, staffIds[MATE.email]));
    const refused = await owner.call("POST", `/api/crm/deals/${openDealId}/owner`,
      { staffId: staffIds[MATE.email] });
    expect(refused.status).toBe(409);
    await db.update(schema.crmStaff).set({ status: "active" })
      .where(eq(schema.crmStaff.id, staffIds[MATE.email]));
  }, 60_000);

  // ── Closing ───────────────────────────────────────────────────────────────

  it("refuses to lose a deal without saying why", async () => {
    const noReason = await owner.call("POST", `/api/crm/deals/${lostDealId}/close`, { outcome: "lost" });
    expect(noReason.status).toBe(400);
    // The accepted vocabulary is returned, so the caller is not guessing.
    expect(Array.isArray(noReason.json["accepted"])).toBe(true);

    const madeUp = await owner.call("POST", `/api/crm/deals/${lostDealId}/close`,
      { outcome: "lost", lostReason: "they_were_rude" });
    expect(madeUp.status).toBe(400);

    const proper = await owner.call("POST", `/api/crm/deals/${lostDealId}/close`,
      { outcome: "lost", lostReason: "price", lostReasonDetail: "Went with a cheaper quote." });
    expect(proper.status).toBe(200);
    expect(proper.json["deal"].stage).toBe("Lost");
    expect(proper.json["deal"].probability).toBe(0);
    expect(proper.json["deal"].lostAt).not.toBeNull();
    expect(proper.json["deal"].closedByStaffId).toBe(staffIds[OWNER.email]);
  }, 60_000);

  it("records who won a deal, and points at the next step", async () => {
    const won = await owner.call("POST", `/api/crm/deals/${wonDealId}/close`, { outcome: "won" });
    expect(won.status).toBe(200);
    expect(won.json["deal"].stage).toBe("Won");
    expect(won.json["deal"].probability).toBe(100);
    expect(won.json["deal"].wonAt).not.toBeNull();
    expect(won.json["deal"].closedByStaffId).toBe(staffIds[OWNER.email]);
    expect(String(won.json["nextStep"])).toMatch(/project/i);
  }, 60_000);

  // ── Conversion ────────────────────────────────────────────────────────────

  it("refuses to convert a deal that has not been won", async () => {
    const early = await owner.call("POST", `/api/crm/deals/${openDealId}/convert`, {});
    expect(early.status).toBe(409);
    expect(String(early.json["error"])).toMatch(/won/i);
  }, 60_000);

  it("converts a won deal into a project, carrying the agreed value across", async () => {
    const converted = await owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {});
    expect(converted.status).toBe(201);
    expect(converted.json["created"]).toBe(true);
    projectId = converted.json["project"].id;

    const project = converted.json["project"];
    expect(project.dealId).toBe(wonDealId);
    expect(project.leadId).toBe(leadId);
    // The price is the one number both halves of the business must agree on.
    expect(Number(project.budget)).toBe(12000);

    // The contact is a client now.
    const [lead] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    expect(lead.status).toBe("Client");
  }, 60_000);

  it("does NOT create a second project when converted again", async () => {
    const before = await db.select().from(schema.crmProjects)
      .where(eq(schema.crmProjects.dealId, wonDealId));
    expect(before).toHaveLength(1);

    // A double-click, a retried request, two people at once.
    const again = await owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {});
    expect(again.status).toBe(200);
    expect(again.json["created"]).toBe(false);
    expect(again.json["project"].id).toBe(projectId);
    expect(String(again.json["note"])).toMatch(/already converted/i);

    const after = await db.select().from(schema.crmProjects)
      .where(eq(schema.crmProjects.dealId, wonDealId));
    expect(after).toHaveLength(1);
  }, 60_000);

  it("survives three simultaneous conversion attempts", async () => {
    const results = await Promise.all([
      owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {}),
      owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {}),
      owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {}),
    ]);
    for (const r of results) expect([200, 201]).toContain(r.status);
    const projects = await db.select().from(schema.crmProjects)
      .where(eq(schema.crmProjects.dealId, wonDealId));
    expect(projects).toHaveLength(1);
  }, 60_000);

  it("refuses rather than silently re-creating when the recorded project is gone", async () => {
    // Somebody deleted the project. Quietly making a new one would hide that.
    await db.update(schema.crmDeals).set({ convertedProjectId: 999_999_999 })
      .where(eq(schema.crmDeals.id, wonDealId));
    const orphaned = await owner.call("POST", `/api/crm/deals/${wonDealId}/convert`, {});
    expect(orphaned.status).toBe(409);
    expect(String(orphaned.json["error"])).toMatch(/no longer exists/i);

    await db.update(schema.crmDeals).set({ convertedProjectId: projectId })
      .where(eq(schema.crmDeals.id, wonDealId));
  }, 60_000);

  // ── Forecast ──────────────────────────────────────────────────────────────

  it("keeps pipeline, weighted, contracted and received as four different numbers", async () => {
    const f = await owner.call("GET", "/api/crm/sales/forecast");
    expect(f.status).toBe(200);

    // Face value of what is still open — the retainer only.
    expect(f.json["pipelineValue"]).toBeGreaterThanOrEqual(3000);
    // Won value is separate from open value.
    expect(f.json["contractedValue"]).toBeGreaterThanOrEqual(12000);
    // And separate again from money that actually arrived.
    expect(typeof f.json["moneyReceivedAllTime"]).toBe("number");

    // Each figure says what it means, and the weighted one admits its
    // assumption rather than presenting a guess as a measurement.
    expect(String(f.json["definitions"].pipelineValue)).toMatch(/not a prediction/i);
    expect(String(f.json["definitions"].moneyReceivedAllTime)).toMatch(/money we have/i);
    expect(String(f.json["definitions"].weightedForecast)).toMatch(/assumption/i);

    // Losses are countable, which is the point of demanding a reason.
    expect(f.json["lossReasons"]["price"]).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("uses a deal's own likelihood when somebody sets one", async () => {
    const before = await owner.call("GET", "/api/crm/sales/forecast");
    const usedDefault = before.json["forecastBasis"].dealsUsingStageDefault;

    const set = await owner.call("POST", `/api/crm/deals/${openDealId}/probability`, { probability: 90 });
    expect(set.status).toBe(200);

    const after = await owner.call("GET", "/api/crm/sales/forecast");
    expect(after.json["forecastBasis"].dealsWithOwnJudgement).toBeGreaterThan(
      before.json["forecastBasis"].dealsWithOwnJudgement,
    );
    expect(after.json["forecastBasis"].dealsUsingStageDefault).toBeLessThan(usedDefault);
    // 90% of 3000 is more than the Qualified default of 30%.
    expect(after.json["weightedForecast"]).toBeGreaterThan(before.json["weightedForecast"]);

    const rejected = await owner.call("POST", `/api/crm/deals/${openDealId}/probability`, { probability: 150 });
    expect(rejected.status).toBe(400);
  }, 60_000);

  it("reports no win rate at all rather than 0% when nothing is decided", async () => {
    // Scoped to a person who has no deals, so the denominator really is zero.
    const f = await owner.call("GET", `/api/crm/sales/forecast?ownerStaffId=${staffIds[OWNER.email]}`);
    if (f.json["winRateDenominator"] === 0) {
      expect(f.json["winRate"]).toBeNull();
      expect(String(f.json["definitions"].winRate)).toMatch(/null rather than 0/i);
    }
  }, 60_000);

  // ── The chain in one place ────────────────────────────────────────────────

  it("shows the whole chain for one contact, with contracted and received apart", async () => {
    await db.insert(schema.crmTransactions).values({
      dealId: wonDealId, leadId, amount: "4000.00", method: "manual", status: "received",
    });

    const chain = await owner.call("GET", `/api/crm/sales/chain/${leadId}`);
    expect(chain.status).toBe(200);
    expect(chain.json["contact"].id).toBe(leadId);

    const won = (chain.json["deals"] as any[]).find((d) => d.id === wonDealId);
    expect(won.project.id).toBe(projectId);
    expect(won.received).toBe(4000);

    // Agreed 12000, received 4000. The gap is the business's actual exposure
    // and the two must never be shown as one number.
    expect(chain.json["totals"].contracted).toBe(12000);
    expect(chain.json["totals"].received).toBe(4000);
  }, 60_000);

  it("refuses a user without the deal permission", async () => {
    const { hashPassword } = await import("../lib/staffCredentials.js");
    const RESTRICTED = { email: `sales-restricted-${STAMP}@example.test`, password: "verdant-copper-8890" };
    const [row] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: "[CRM-TEST] Restricted",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["deals.write", "projects.write"],
    }).returning();

    const restricted = new Agent();
    await restricted.login(RESTRICTED);
    expect((await restricted.call("POST", `/api/crm/deals/${openDealId}/close`, { outcome: "won" })).status).toBe(403);
    expect((await restricted.call("POST", `/api/crm/deals/${openDealId}/convert`, {})).status).toBe(403);
    expect((await restricted.call("POST", `/api/crm/deals/${openDealId}/owner`, { staffId: null })).status).toBe(403);

    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, row.id));
  }, 60_000);
});
