/**
 * The CRM's core routes enforce their permission, not merely a session.
 *
 * Measured in a browser on 2026-09-16, before this was fixed: with `leads.read`
 * revoked on a signed-in account, `GET /api/crm/leads` still returned every
 * contact, and so did `/crm/deals` and `/crm/staff`. Fifty-six routes in
 * `routes/crm.ts` shared one gate that asked only "is this a staff session" —
 * so a restricted new hire could read every contact and deal, record money
 * against a deal, and send a sequence's test email.
 *
 * These tests prove the lines by attempting to cross them, rather than by
 * reading the source: each refusal must be a 403 that NAMES the permission, and
 * a refused write must leave the table as it was. The positive cases matter just
 * as much — an operations manager must keep doing their job, so the same routes
 * answer 200 for the role that legitimately holds the permission.
 *
 * Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { inArray, sql } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "crm-permission-enforcement-secret";
delete process.env.CRM_LEGACY_BEARER_ENABLED;

const STAMP = Date.now();
const OWNER = { email: `perm-owner-${STAMP}@example.test`, name: "[CRM-TEST] Permission Owner", password: "harbour-cinder-7741" };
const MANAGER = { email: `perm-manager-${STAMP}@example.test`, name: "[CRM-TEST] Permission Manager", password: "lantern-basalt-3319" };
const RESTRICTED = { email: `perm-restricted-${STAMP}@example.test`, name: "[CRM-TEST] Permission Restricted", password: "meridian-willow-8827" };

const suite = TEST_DB ? describe : describe.skip;

interface Reply { status: number; json: Record<string, any> }

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}
  async call(method: string, path: string, body?: unknown): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers["Cookie"] = this.cookie;
    if (this.csrf) headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    return { status: res.status, json };
  }
  async login(who: { email: string; password: string }): Promise<number> {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    this.csrf = ((await res.json()) as { csrfToken?: string }).csrfToken ?? "";
    return res.status;
  }
}

suite("CRM routes enforce their permission, not just a session (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  const staffIds: number[] = [];

  const owner = new Agent(() => base);
  const manager = new Agent(() => base);
  const restricted = new Agent(() => base);

  const leadCount = async () =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(schema.crmLeads))[0].n);

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const create = async (
      who: { email: string; name: string; password: string },
      role: "owner" | "operations_manager",
      extra: Record<string, unknown> = {},
    ) => {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role, status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
        ...extra,
      }).returning();
      staffIds.push(row.id);
    };

    await create(OWNER, "owner");
    // By role: leads.read/write, deals.read/write, tasks.read.team — but never
    // campaigns.send, which is the line this role deliberately does not cross.
    await create(MANAGER, "operations_manager");
    // The same role with the sales permissions taken away for this one person.
    await create(RESTRICTED, "operations_manager", {
      revokedPermissions: ["leads.read", "leads.write", "deals.read", "deals.write", "tasks.read.team"],
    });

    expect(await owner.login(OWNER)).toBe(200);
    expect(await manager.login(MANAGER)).toBe(200);
    expect(await restricted.login(RESTRICTED)).toBe(200);
  }, 60_000);

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
    await new Promise<void>((r) => server?.close(() => r()));
  });

  it("refuses a read to somebody whose read was revoked, and names the permission", async () => {
    for (const [path, permission] of [
      ["/api/crm/leads", "leads.read"],
      ["/api/crm/pipeline", "leads.read"],
      ["/api/crm/stats", "leads.read"],
      ["/api/crm/deals", "deals.read"],
      ["/api/crm/tasks", "tasks.read.team"],
    ] as const) {
      const reply = await restricted.call("GET", path);
      expect({ path, status: reply.status, permission: reply.json.permission })
        .toEqual({ path, status: 403, permission });
    }
  });

  it("still lets the role that holds those permissions do its job", async () => {
    for (const path of ["/api/crm/leads", "/api/crm/pipeline", "/api/crm/stats", "/api/crm/deals", "/api/crm/tasks"]) {
      const reply = await manager.call("GET", path);
      expect({ path, status: reply.status }).toEqual({ path, status: 200 });
    }
  });

  it("refuses a write, and writes nothing", async () => {
    const before = await leadCount();
    const reply = await restricted.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Should Not Exist", email: `perm-blocked-${STAMP}@example.test`,
    });
    expect(reply.status).toBe(403);
    expect(reply.json.permission).toBe("leads.write");
    expect(await leadCount()).toBe(before);
  });

  it("keeps bulk contact behind campaigns.send, which the operations role does not hold", async () => {
    // The gate runs before the handler, so a non-existent id is enough to prove
    // the line — and proves it without sending anything to anybody.
    for (const path of [
      "/api/crm/campaigns/999999/test-send",
      "/api/crm/campaigns/queue/999999/send-now",
      "/api/crm/campaigns/scheduler/run",
    ]) {
      const reply = await manager.call("POST", path, {});
      expect({ path, status: reply.status, permission: reply.json.permission })
        .toEqual({ path, status: 403, permission: "campaigns.send" });
    }
  });

  it("keeps money against a deal behind deals.write", async () => {
    for (const path of [
      "/api/crm/deals/999999/transactions/manual",
      "/api/crm/deals/999999/transactions/stripe-checkout",
    ]) {
      const reply = await restricted.call("POST", path, { amount: "1.00" });
      expect({ path, status: reply.status, permission: reply.json.permission })
        .toEqual({ path, status: 403, permission: "deals.write" });
    }
  });

  it("the legacy shared credential walks through every permission until it is retired", async () => {
    // Stated rather than implied, because production depends on it: the shared
    // admin credential carries no identity, so `requireCrmAuth`'s fallback has
    // no permissions to check and calls through. While CRM_LEGACY_BEARER_ENABLED
    // allows it, the permission model above is advisory for anyone holding that
    // one password. Retiring it is what makes the model binding — so the
    // retirement itself is pinned here.
    const { getSessionToken } = await import("../lib/admin-session.js");
    const legacy = { Authorization: `Bearer ${getSessionToken()}` };

    const during = await fetch(`${base}/api/crm/leads`, { headers: legacy });
    expect(during.status).toBe(200);

    process.env.CRM_LEGACY_BEARER_ENABLED = "false";
    try {
      const after = await fetch(`${base}/api/crm/leads`, { headers: legacy });
      expect(after.status).toBe(401);
      // The per-person session is unaffected by the retirement.
      expect((await manager.call("GET", "/api/crm/leads")).status).toBe(200);
    } finally {
      delete process.env.CRM_LEGACY_BEARER_ENABLED;
    }
  });

  it("an owner is refused none of it", async () => {
    for (const path of ["/api/crm/leads", "/api/crm/deals", "/api/crm/tasks", "/api/crm/pipeline"]) {
      const reply = await owner.call("GET", path);
      expect({ path, status: reply.status }).toEqual({ path, status: 200 });
    }
  });
});
