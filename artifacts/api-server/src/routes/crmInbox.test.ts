/**
 * Unread state for the shared customer inbox.
 *
 * The thing being replaced tracked unread in a React `Set`: it reset on every
 * page refresh, it lived in one browser, and the server number it sat next to
 * was the count of every inbound message in the thread rather than anything to
 * do with reading. For three people working one inbox that is worse than no
 * badge — it makes two of them think a message is unhandled.
 *
 * So these tests assert the three properties the old version could not have:
 * it survives a reload, it is per person, and it counts only what arrived
 * after that person last looked.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "inbox-admin-secret-value";

const STAMP = Date.now();
const ALPHA = { email: `inbox-a-${STAMP}@example.test`, name: "[CRM-TEST] Inbox Alpha", password: "harbour-trellis-5521" };
const BETA = { email: `inbox-b-${STAMP}@example.test`, name: "[CRM-TEST] Inbox Beta", password: "lantern-quartz-7734" };

const suite = TEST_DB ? describe : describe.skip;

suite("inbox unread state is real, persistent and per person (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let leadId: number;
  let otherLeadId: number;
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
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body */ }
      return { status: res.status, json };
    }
    async login(who: { email: string; password: string }) {
      const res = await fetch(`${base}/api/crm/staff/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: who.email, password: who.password }),
      });
      const setCookie = res.headers.getSetCookie();
      this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
      const data = await res.json() as { csrfToken?: string };
      this.csrf = data.csrfToken ?? "";
      return res.status;
    }
  }

  const alpha = new Agent();
  const beta = new Agent();

  /** A fresh browser session for the same person — no carried-over state. */
  function reloadedBrowserFor(agent: Agent): Agent {
    const next = new Agent();
    next.cookie = agent.cookie;
    next.csrf = agent.csrf;
    return next;
  }

  async function inbound(lead: number, bodyText: string, at?: Date) {
    await db.insert(schema.crmMessages).values({
      leadId: lead, direction: "inbound", channel: "sms",
      body: bodyText, fromNumber: "+15550001111", toNumber: "+15550002222",
      ...(at ? { createdAt: at } : {}),
    });
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    // The R6 boot gate 503s /api until the server declares itself ready, so a
    // test that boots the real app has to say so before making requests.
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    for (const who of [ALPHA, BETA]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Inbox Subject", email: `inbox-lead-${STAMP}@example.test`, status: "New",
    }).returning();
    leadId = lead.id;
    const [other] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Inbox Other", email: `inbox-other-${STAMP}@example.test`, status: "New",
    }).returning();
    otherLeadId = other.id;

    // Three inbound messages arrive before anybody looks.
    const t0 = new Date(Date.now() - 3 * 3_600_000);
    await inbound(leadId, "first", t0);
    await inbound(leadId, "second", new Date(t0.getTime() + 60_000));
    await inbound(leadId, "third", new Date(t0.getTime() + 120_000));
    await inbound(otherLeadId, "unrelated", t0);

    // An outbound message must never count as something to read.
    await db.insert(schema.crmMessages).values({
      leadId, direction: "outbound", channel: "sms", body: "our reply",
      fromNumber: "+15550002222", toNumber: "+15550001111",
    });

    await alpha.login(ALPHA);
    await beta.login(BETA);
  });

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    await db.delete(schema.crmThreadReads).where(inArray(schema.crmThreadReads.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, [leadId, otherLeadId]));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  });

  function unreadFor(payload: Record<string, unknown>, lead: number): number {
    const threads = payload["threads"] as { leadId: number; unread: number }[];
    return threads.find((t) => t.leadId === lead)?.unread ?? 0;
  }

  it("counts every inbound message in a conversation nobody has opened", async () => {
    const res = await alpha.call("GET", "/api/crm/inbox/unread");
    expect(res.status).toBe(200);
    expect(res.json["available"]).toBe(true);
    // Three inbound. The outbound reply is not something to read.
    expect(unreadFor(res.json, leadId)).toBe(3);
  });

  it("drops to zero once opened, and stays there across a page reload", async () => {
    expect((await alpha.call("POST", `/api/crm/inbox/threads/${leadId}/read`)).status).toBe(200);
    expect(unreadFor((await alpha.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(0);

    // The whole point: a fresh browser with no client state gets the same
    // answer. The version this replaces reset to "all unread" here.
    const reloaded = reloadedBrowserFor(alpha);
    expect(unreadFor((await reloaded.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(0);
  });

  it("does not mark it read for anybody else", async () => {
    // Alpha reading a thread must not clear Beta's badge — otherwise the first
    // person to glance at the inbox silently marks it handled for the team.
    expect(unreadFor((await beta.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(3);
  });

  it("counts only what arrived after you last looked", async () => {
    await inbound(leadId, "fourth, arriving after Alpha read the thread");

    expect(unreadFor((await alpha.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(1);
    // Beta still has not looked, so Beta sees all four.
    expect(unreadFor((await beta.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(4);
  });

  it("can be put back on your pile", async () => {
    await alpha.call("POST", `/api/crm/inbox/threads/${leadId}/read`);
    expect(unreadFor((await alpha.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(0);

    expect((await alpha.call("POST", `/api/crm/inbox/threads/${leadId}/unread`)).status).toBe(200);
    expect(unreadFor((await alpha.call("GET", "/api/crm/inbox/unread")).json, leadId)).toBe(4);
  });

  it("marks several conversations read in one request", async () => {
    const res = await alpha.call("POST", "/api/crm/inbox/read", { leadIds: [leadId, otherLeadId] });
    expect(res.status).toBe(200);
    expect(res.json["marked"]).toBe(2);

    const after = await alpha.call("GET", "/api/crm/inbox/unread");
    expect(unreadFor(after.json, leadId)).toBe(0);
    expect(unreadFor(after.json, otherLeadId)).toBe(0);
    // Not asserting the overall total: it spans every conversation this person
    // can see, and other suites in the same database leave their own inbound
    // messages behind. The two conversations under test are the claim here.
    const threads = after.json["threads"] as { leadId: number }[];
    expect(threads.some((t) => t.leadId === leadId || t.leadId === otherLeadId)).toBe(false);

    // Reading twice moves the timestamp rather than piling up rows — the
    // unique constraint is what the upsert targets.
    await alpha.call("POST", "/api/crm/inbox/read", { leadIds: [leadId] });
    const { and, eq } = await import("drizzle-orm");
    const rows = await db.select().from(schema.crmThreadReads).where(and(
      eq(schema.crmThreadReads.staffId, staffIds[ALPHA.email]),
      eq(schema.crmThreadReads.leadId, leadId),
    ));
    expect(rows).toHaveLength(1);
  });

  it("refuses an empty or oversized batch rather than doing something surprising", async () => {
    expect((await alpha.call("POST", "/api/crm/inbox/read", { leadIds: [] })).status).toBe(400);
    expect((await alpha.call("POST", "/api/crm/inbox/read", {
      leadIds: Array.from({ length: 501 }, (_, i) => i + 1),
    })).status).toBe(413);
  });

  it("shows who else on the team has already been in the conversation", async () => {
    await beta.call("POST", `/api/crm/inbox/threads/${leadId}/read`);
    const res = await alpha.call("GET", `/api/crm/inbox/threads/${leadId}/readers`);
    expect(res.status).toBe(200);
    const readers = res.json["readers"] as { name: string; lastReadAt: string }[];
    const names = readers.map((r) => r.name);
    expect(names).toContain(BETA.name);
    expect(names).toContain(ALPHA.name);
    // This is what lets somebody see a colleague is already handling it,
    // which the session-state version could never report.
    expect(readers.every((r) => typeof r.lastReadAt === "string")).toBe(true);
  });
});
