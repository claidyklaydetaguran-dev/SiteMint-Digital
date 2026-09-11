/**
 * Sender attribution for SMS and calls (owner-authorized change to phone.ts).
 *
 * The question this answers is the one three people sharing a CRM actually
 * ask: *which of us texted this client?* Before the change there was no answer
 * — `crm_messages` recorded no sender and every activity entry was credited to
 * the literal string "admin".
 *
 * Twilio is mocked. The point is our attribution logic, and a test that
 * reached a real provider would send real messages to real numbers, which is
 * never acceptable during development.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import http from "node:http";
import type { AddressInfo } from "node:net";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "attribution-admin-secret-value";

// Stands in for Twilio. Records what would have been sent and returns
// plausible ids; nothing leaves the process.
const sent: { to: string; body: string }[] = [];
vi.mock("../lib/twilio.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/twilio.js")>();
  return {
    ...actual,
    isTwilioConfigured: () => true,
    getTwilioPhone: () => "+15550002222",
    getForwardPhone: () => "+15550003333",
    getCrmBaseUrl: () => "",
    getTwilio: () => ({
      messages: {
        create: async (args: { to: string; body: string }) => {
          sent.push({ to: args.to, body: args.body });
          return { sid: `SM${sent.length}${Date.now()}`, status: "queued" };
        },
      },
      calls: {
        create: async () => ({ sid: `CA${Date.now()}`, status: "queued" }),
      },
    }),
  };
});

const STAMP = Date.now();
const OWNERS = [
  { key: "shasta", email: `attr-shasta-${STAMP}@example.test`, name: "[CRM-TEST] Shasta Greene", password: "harbour-trellis-5521" },
  { key: "claidy", email: `attr-claidy-${STAMP}@example.test`, name: "[CRM-TEST] Claidy Taguran", password: "lantern-quartz-7734" },
  { key: "saisa", email: `attr-saisa-${STAMP}@example.test`, name: "[CRM-TEST] Saisa Lorraigne", password: "meridian-copper-3312" },
];

const suite = TEST_DB ? describe : describe.skip;

suite("SMS and call sender attribution (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let leadId = 0;
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

  const agents: Record<string, Agent> = {};

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
    for (const who of OWNERS) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.key] = row.id;
      agents[who.key] = new Agent();
      await agents[who.key].login(who);
    }

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Attribution Subject",
      email: `attr-lead-${STAMP}@example.test`,
      phone: "+15550101010",
      status: "New",
      smsConsent: true,
    }).returning();
    leadId = lead.id;
  });

  afterAll(async () => {
    const { inArray } = await import("drizzle-orm");
    const convs = await db.select().from(schema.crmConversations)
      .where(eq(schema.crmConversations.contactId, leadId));
    if (convs.length) {
      await db.delete(schema.crmConversationParticipants)
        .where(inArray(schema.crmConversationParticipants.conversationId, convs.map((c) => c.id)));
    }
    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.leadId, leadId));
    if (convs.length) {
      await db.delete(schema.crmConversations).where(inArray(schema.crmConversations.id, convs.map((c) => c.id)));
    }
    await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("records a distinct sender for each of the three Super Admins", async () => {
    const { inArray } = await import("drizzle-orm");

    for (const who of OWNERS) {
      const r = await agents[who.key].call("POST", `/api/crm/leads/${leadId}/sms`,
        { body: `Message from ${who.name}` });
      expect(r.status).toBe(200);
    }

    const messages = await db.select().from(schema.crmMessages)
      .where(and(eq(schema.crmMessages.leadId, leadId), eq(schema.crmMessages.direction, "outbound")));

    expect(messages).toHaveLength(3);

    // Three messages, three different people — not three rows saying "admin".
    const senderIds = messages.map((m) => m.sentByStaffId).sort();
    expect(new Set(senderIds).size).toBe(3);
    expect(senderIds).toEqual([staffIds["shasta"], staffIds["claidy"], staffIds["saisa"]].sort());

    for (const who of OWNERS) {
      const mine = messages.find((m) => m.sentByStaffId === staffIds[who.key])!;
      expect(mine.sentByLabel).toBe(who.name);
      expect(mine.origin).toBe("staff");
      expect(mine.body).toContain(who.name);
      // The provider id is preserved under both the legacy and general column.
      expect(mine.twilioSid).toBeTruthy();
      expect(mine.providerMessageId).toBe(mine.twilioSid);
      // And each is attached to the contact's conversation.
      expect(mine.conversationId).not.toBeNull();
    }

    // All three landed in ONE conversation with the client, not three.
    expect(new Set(messages.map((m) => m.conversationId)).size).toBe(1);

    // The activity timeline names the person too, rather than "admin".
    const activities = await db.select().from(schema.crmActivities)
      .where(and(eq(schema.crmActivities.leadId, leadId), eq(schema.crmActivities.type, "sms_sent")));
    const creditedTo = new Set(activities.map((a) => a.createdBy));
    expect(creditedTo.has("admin")).toBe(false);
    for (const who of OWNERS) expect(creditedTo.has(who.name)).toBe(true);
  }, 90_000);

  it("labels an inbound message as inbound, with no sender of ours", async () => {
    // Written the way the Twilio webhook writes it. The webhook itself is not
    // invoked here — its signature validation is deliberately untouched — but
    // the shape it produces is what the inbox has to interpret.
    const [inbound] = await db.insert(schema.crmMessages).values({
      leadId, direction: "inbound", channel: "sms", body: "client reply",
      fromNumber: "+15550101010", toNumber: "+15550002222", origin: "inbound",
    }).returning();

    expect(inbound.sentByStaffId).toBeNull();
    expect(inbound.origin).toBe("inbound");

    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.id, inbound.id));
  }, 30_000);

  it("refuses a restricted user, and records nothing when it does", async () => {
    const { hashPassword } = await import("../lib/staffCredentials.js");
    const RESTRICTED = { email: `attr-restricted-${STAMP}@example.test`, password: "verdant-copper-8890" };
    const [row] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: "[CRM-TEST] Restricted",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["communications.send"],
    }).returning();

    const before = sent.length;
    const restricted = new Agent();
    await restricted.login(RESTRICTED);

    const refusedSms = await restricted.call("POST", `/api/crm/leads/${leadId}/sms`, { body: "should not send" });
    expect(refusedSms.status).toBe(403);
    const refusedCall = await restricted.call("POST", `/api/crm/leads/${leadId}/call`, {});
    expect(refusedCall.status).toBe(403);

    // The refusal is real: nothing reached the provider, and no message row
    // was written. A permission check that rejects the response but performs
    // the side effect would be worse than no check.
    expect(sent.length).toBe(before);
    const theirs = await db.select().from(schema.crmMessages)
      .where(and(eq(schema.crmMessages.leadId, leadId), eq(schema.crmMessages.sentByStaffId, row.id)));
    expect(theirs).toHaveLength(0);

    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, row.id));
  }, 60_000);

  it("still refuses to text somebody who sent STOP", async () => {
    await db.update(schema.crmLeads).set({ smsOptOut: true }).where(eq(schema.crmLeads.id, leadId));
    const refused = await agents["shasta"].call("POST", `/api/crm/leads/${leadId}/sms`, { body: "after opt out" });
    expect(refused.status).toBe(400);
    expect(String(refused.json["error"])).toMatch(/opted out/i);
    await db.update(schema.crmLeads).set({ smsOptOut: false }).where(eq(schema.crmLeads.id, leadId));
  }, 30_000);
});

