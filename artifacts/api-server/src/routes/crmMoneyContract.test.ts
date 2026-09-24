/**
 * One question, one answer: how much money has actually arrived?
 *
 * Three surfaces answer it — the Command Center's money panel, the
 * transactions summary, and the sales forecast — and they disagreed. Every
 * write path stores `"completed"` when a payment lands, but two of the readers
 * filtered on `"received"`, a value that is not even in TRANSACTION_STATUSES
 * and that nothing has ever written. So "Money received" was structurally zero
 * no matter how much the business had been paid, while a revenue figure
 * elsewhere used `"completed"` and was right.
 *
 * A test that only asserted the current number would not have caught that —
 * zero looks like a legitimate answer. These assert that a payment recorded
 * through the real route is visible on every surface that claims to report it.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "money-admin-secret-value";

const STAMP = Date.now();
const OWNER = { email: `money-owner-${STAMP}@example.test`, name: "[CRM-TEST] Money Owner", password: "harbour-trellis-5521" };

const suite = TEST_DB ? describe : describe.skip;

suite("money reported the same way everywhere (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let leadId = 0;
  let dealId = 0;
  let staffId = 0;

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
    const [staff] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffId = staff.id;
    await owner.login(OWNER);

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Money Subject", email: `money-lead-${STAMP}@example.test`, status: "New",
    }).returning();
    leadId = lead.id;

    const [deal] = await db.insert(schema.crmDeals).values({
      leadId, name: "[CRM-TEST] Paid work", value: "10000.00", stage: "Won",
    }).returning();
    dealId = deal.id;
  }, 120_000);

  afterAll(async () => {
    await db.delete(schema.crmTransactions).where(eq(schema.crmTransactions.dealId, dealId));
    await db.delete(schema.crmDeals).where(eq(schema.crmDeals.id, dealId));
    await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  it("uses a status that is actually in the declared vocabulary", () => {
    // The whole defect in one assertion: the readers filtered on "received",
    // which is not one of these. Anything not in this list can never match a
    // row, so a filter on it reports zero forever.
    expect(schema.TRANSACTION_STATUSES).toContain(schema.TRANSACTION_RECEIVED_STATUS);
    expect(schema.TRANSACTION_RECEIVED_STATUS).toBe("completed");
  });

  it("shows a recorded payment on every surface that reports money", async () => {
    const before = await owner.call("GET", "/api/crm/command-center");
    const beforeMoney = before.json["sales"].moneyReceivedAllTime;

    // Through the real route, not a hand-written row — so the status is
    // whatever the application actually writes.
    const paid = await owner.call("POST", `/api/crm/deals/${dealId}/transactions/manual`, {
      amount: "2500.00", method: "manual_transfer",
    });
    expect(paid.status).toBe(200);

    // 1. The Command Center's money panel.
    const cc = await owner.call("GET", "/api/crm/command-center");
    expect(cc.json["sales"].moneyReceivedAllTime).toBe(beforeMoney + 2500);
    // Contracted and received stay different questions.
    expect(cc.json["sales"].moneyReceivedAllTime).not.toBe(cc.json["sales"].contractedValue);

    // 2. The sales forecast.
    const forecast = await owner.call("GET", "/api/crm/sales/forecast");
    expect(forecast.json["moneyReceivedAllTime"]).toBe(cc.json["sales"].moneyReceivedAllTime);

    // 3. The per-contact chain.
    const chain = await owner.call("GET", `/api/crm/sales/chain/${leadId}`);
    expect(chain.json["totals"].received).toBe(2500);
    expect(chain.json["totals"].contracted).toBe(10000);
  }, 90_000);

  it("does not count a payment that has not arrived", async () => {
    const before = await owner.call("GET", "/api/crm/sales/forecast");
    // A Stripe checkout row starts pending: the customer has been shown a
    // payment page, nothing more. Counting that as money would be the
    // overstatement this whole vocabulary exists to prevent.
    await db.insert(schema.crmTransactions).values({
      dealId, leadId, amount: "9999.00", method: "stripe", status: "pending",
    });
    const after = await owner.call("GET", "/api/crm/sales/forecast");
    expect(after.json["moneyReceivedAllTime"]).toBe(before.json["moneyReceivedAllTime"]);

    const chain = await owner.call("GET", `/api/crm/sales/chain/${leadId}`);
    expect(chain.json["totals"].received).toBe(2500);
  }, 90_000);

  it("says what its money figure means", async () => {
    const cc = await owner.call("GET", "/api/crm/command-center");
    const definition = String(cc.json["sales"].definitions.moneyReceived);
    expect(definition).toMatch(/actual cash/i);
    // The definition names the status it actually filters on, so a reader can
    // check the claim rather than trust it.
    expect(definition).toContain("completed");
  }, 60_000);
});
