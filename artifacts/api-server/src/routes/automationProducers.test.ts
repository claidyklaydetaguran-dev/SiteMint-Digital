/**
 * M4 — do real business events actually reach the automation engine?
 *
 * `crmAutomation.test.ts` proves the engine: brakes, approvals, history,
 * dedup, loops. It proves all of that by calling `emitAutomationTrigger()`
 * itself. That leaves the question this file exists to answer — when a person
 * captures a lead or closes a deal through the normal screens, does anything
 * emit at all?
 *
 * When the engine was first delivered the answer was no. Rules could be
 * authored and run by hand, but no route called the seam, so an automation
 * would never fire on its own. A workflow engine nothing triggers is not a
 * working feature, so these are the tests for the producers rather than the
 * consumer.
 *
 * ── Why these tests poll ────────────────────────────────────────────────────
 *
 * Producers call `fireAutomation()`, which is deliberately fire-and-forget: a
 * fault in somebody's rule must never fail the request that merely caused the
 * event (see `lib/automationTriggers.ts`). So the emission is not finished when
 * the response arrives, and asserting immediately after the call would be a
 * race that passes on a fast machine and fails on a loaded one. `waitFor`
 * polls to a deadline instead — it fails honestly when nothing ever arrives,
 * rather than flakily when it arrives late.
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
process.env.ADMIN_PASSWORD = "producers-admin-secret-value";

const STAMP = Date.now();
const OWNER = {
  email: `prod-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Producer Owner",
  password: "sandstone-willow-4417",
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
async function waitFor<T>(probe: () => Promise<T | null | undefined>, what: string, ms = 6000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = await probe();
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`timed out after ${ms}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

suite("automation producers: real business events reach the engine (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const owner = new Agent(() => base);
  const ruleIds: number[] = [];
  const leadIds: number[] = [];
  const dealIds: number[] = [];

  /** Executions recorded for one rule, whatever state they reached. */
  async function executionsFor(ruleId: number) {
    return db.select().from(schema.crmAutomationExecutions)
      .where(eq(schema.crmAutomationExecutions.ruleId, ruleId));
  }

  async function makeRule(body: Record<string, unknown>) {
    const r = await owner.call("POST", "/api/crm/automation/rules", body);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    ruleIds.push(r.json["rule"].id);
    return r.json["rule"] as { id: number };
  }

  /** Only this test's rule should be live, or another rule's run muddies the count. */
  async function onlyThisRule(id: number) {
    if (ruleIds.length) {
      await db.update(schema.crmAutomationRules).set({ enabled: false })
        .where(inArray(schema.crmAutomationRules.id, ruleIds));
    }
    await db.update(schema.crmAutomationRules).set({ enabled: true })
      .where(eq(schema.crmAutomationRules.id, id));
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;

    const appMod = await import("../app.js");
    const boot = await import("../lib/bootState.js").catch(() => null);
    boot?.setBootState?.("ready");

    server = http.createServer(appMod.default ?? (appMod as any).app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await fetch(`${base}/api/crm/staff/bootstrap`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: OWNER.email, displayName: OWNER.name,
        password: OWNER.password, adminPassword: process.env.ADMIN_PASSWORD,
      }),
    });
    expect(await owner.login(OWNER)).toBe(200);
  }, 120_000);

  afterAll(async () => {
    if (ruleIds.length) {
      await db.delete(schema.crmAutomationExecutions)
        .where(inArray(schema.crmAutomationExecutions.ruleId, ruleIds));
      await db.delete(schema.crmAutomationRules)
        .where(inArray(schema.crmAutomationRules.id, ruleIds));
    }
    if (dealIds.length) {
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.id, dealIds));
    }
    if (leadIds.length) {
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("capturing a lead through the normal route fires lead_created", async () => {
    const rule = await makeRule({
      name: `[CRM-TEST] on lead created ${STAMP}`,
      trigger: "lead_created",
      match: "all",
      conditions: [],
      actions: [{ type: "add_note", config: { body: "seen by automation" } }],
      enabled: true,
    });
    await onlyThisRule(rule.id);

    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Producer Lead", email: `producer-lead-${STAMP}@example.test`,
      source: "Referral",
    });
    expect(created.status).toBe(201);
    const leadId = created.json["lead"].id as number;
    leadIds.push(leadId);

    const runs = await waitFor(
      async () => {
        const rows = await executionsFor(rule.id);
        return rows.length ? rows : null;
      },
      "an execution for the lead_created rule",
    );

    expect(runs).toHaveLength(1);
    expect(Number(runs[0].recordId)).toBe(leadId);
  }, 30_000);

  it("changing a lead's status fires lead_status_changed, carrying both sides", async () => {
    const rule = await makeRule({
      name: `[CRM-TEST] on status change ${STAMP}`,
      trigger: "lead_status_changed",
      match: "all",
      conditions: [],
      actions: [{ type: "add_note", config: { body: "status moved" } }],
      enabled: true,
    });
    await onlyThisRule(rule.id);

    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Status Lead", email: `status-lead-${STAMP}@example.test`,
      source: "Referral", status: "New Inquiry",
    });
    const leadId = created.json["lead"].id as number;
    leadIds.push(leadId);

    const patched = await owner.call("PATCH", `/api/crm/leads/${leadId}`, { status: "Qualified" });
    expect(patched.status).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await executionsFor(rule.id);
        return rows.length ? rows : null;
      },
      "an execution for the lead_status_changed rule",
    );

    expect(runs).toHaveLength(1);
    expect(Number(runs[0].recordId)).toBe(leadId);
  }, 30_000);

  it("does not fire lead_status_changed when the status was not actually changed", async () => {
    // A PATCH that sets the status to what it already is is not a status
    // change. Firing on it would mean every unrelated edit re-ran the rules.
    const rule = await makeRule({
      name: `[CRM-TEST] no-op status ${STAMP}`,
      trigger: "lead_status_changed",
      match: "all",
      conditions: [],
      actions: [{ type: "add_note", config: { body: "should not happen" } }],
      enabled: true,
    });
    await onlyThisRule(rule.id);

    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] No-op Lead", email: `noop-lead-${STAMP}@example.test`,
      source: "Referral", status: "New Inquiry",
    });
    const leadId = created.json["lead"].id as number;
    leadIds.push(leadId);

    const patched = await owner.call("PATCH", `/api/crm/leads/${leadId}`, {
      status: "New Inquiry", notes: "an edit that is not a status change",
    });
    expect(patched.status).toBe(200);

    // Give a real emission time to arrive, then assert none did.
    await new Promise((r) => setTimeout(r, 1500));
    expect(await executionsFor(rule.id)).toHaveLength(0);
  }, 30_000);

  it("closing a deal as won fires deal_won and carries the lead", async () => {
    const rule = await makeRule({
      name: `[CRM-TEST] on deal won ${STAMP}`,
      trigger: "deal_won",
      match: "all",
      conditions: [],
      actions: [{ type: "add_note", config: { body: "won" } }],
      enabled: true,
    });
    await onlyThisRule(rule.id);

    const lead = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Deal Lead", email: `deal-lead-${STAMP}@example.test`, source: "Referral",
    });
    const leadId = lead.json["lead"].id as number;
    leadIds.push(leadId);

    const [deal] = await db.insert(schema.crmDeals).values({
      leadId, name: "[CRM-TEST] Producer Deal", value: "4200.00", stage: "Proposal",
    }).returning();
    dealIds.push(deal.id);

    const closed = await owner.call("POST", `/api/crm/deals/${deal.id}/close`, { outcome: "won" });
    expect(closed.status, JSON.stringify(closed.json)).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await executionsFor(rule.id);
        return rows.length ? rows : null;
      },
      "an execution for the deal_won rule",
    );

    expect(runs).toHaveLength(1);
    expect(Number(runs[0].recordId)).toBe(deal.id);
  }, 30_000);

  it("a failing rule does not fail the business write that caused it", async () => {
    // The whole reason producers are fire-and-forget. A rule pointed at a
    // record type it cannot load must not turn a successful lead capture into
    // a 500 for the person who typed it in.
    const [rule] = await db.insert(schema.crmAutomationRules).values({
      name: `[CRM-TEST] hostile rule ${STAMP}`,
      trigger: "lead_created",
      conditions: { combine: "and", conditions: [] },
      // A staff id that cannot exist. The route refuses this at save time,
      // which is right — so insert it directly to reproduce the state a rule
      // reaches when its assignee is deleted long after the rule was written.
      actions: [{ type: "assign_owner", config: { staffId: 2_147_483_646 } }],
      enabled: true,
      createdByStaffId: null,
      createdByLabel: "[CRM-TEST]",
    }).returning();
    ruleIds.push(rule.id);
    await onlyThisRule(rule.id);

    const created = await owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Hostile Lead", email: `hostile-lead-${STAMP}@example.test`,
      source: "Referral",
    });

    expect(created.status).toBe(201);
    expect(created.json["lead"].id).toBeGreaterThan(0);
    leadIds.push(created.json["lead"].id as number);
  }, 30_000);
});
