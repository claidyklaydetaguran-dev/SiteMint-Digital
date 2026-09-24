/**
 * Unified customer history.
 *
 * Four properties, and each one is a thing that has actually gone wrong in a
 * CRM somewhere:
 *
 *   - Older history quietly disappearing while you page through it. Tested by
 *     recovering a known set across many small pages WITH a new event landing
 *     mid-walk, which is what happens in real life and what offset paging
 *     cannot survive.
 *   - A private staff note reaching a customer. Tested against the actual
 *     customer projection by searching the whole serialised response for the
 *     note's text — not by trusting that a field called `visibility` was
 *     filtered on somewhere.
 *   - A historical row being credited to whoever happens to be signed in.
 *     `crm_activities.created_by` defaults to the literal 'admin', so a
 *     thousand rows claim an author that never existed; they must read as
 *     unattributed and must not carry any real staff member's name.
 *   - A short timeline that looks like a quiet client but is really a
 *     permission boundary. Tested by taking grants away and requiring the
 *     response to SAY what it did not read.
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
process.env.ADMIN_PASSWORD = "history-admin-secret-value";

const STAMP = Date.now();
const OWNER = { email: `history-owner-${STAMP}@example.test`, name: "[CRM-TEST] History Owner", password: "harbour-trellis-5521" };
const MATE = { email: `history-mate-${STAMP}@example.test`, name: "[CRM-TEST] History Mate", password: "lantern-quartz-7734" };
const NARROW = { email: `history-narrow-${STAMP}@example.test`, password: "verdant-copper-8890" };

// Secret strings planted in internal-only rows. If any of these ever appears
// in the customer projection, the projection leaked — and searching the whole
// serialised body is the only check that cannot be fooled by a rename.
const INTERNAL_SECRETS = {
  comment: `INTERNAL-COMMENT-${STAMP}-do-not-show-the-client`,
  supportNote: `INTERNAL-SUPPORT-NOTE-${STAMP}-chase-the-invoice`,
  lostReason: `INTERNAL-LOST-DETAIL-${STAMP}-they-thought-we-were-expensive`,
  projectNote: `INTERNAL-PROJECT-UPDATE-${STAMP}-the-build-is-behind`,
  activity: `INTERNAL-ACTIVITY-${STAMP}-difficult-on-the-phone`,
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

/** A fixed, long-past instant, offset in minutes — so ordering is deterministic. */
const BASE = Date.UTC(2019, 2, 11, 12, 0, 0);
const T = (minutes: number) => new Date(BASE + minutes * 60_000);

interface Entry {
  id: string; occurredAt: string; source: string; kind: string;
  visibility: string; summary: string; detail: string | null;
  actor: { kind: string; staffId: number | null; label: string; note: string | null };
  record: { type: string; id: number; href: string };
}

suite("unified customer history (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  let leadId = 0;
  let otherLeadId = 0;
  let wonDealId = 0;
  let lostDealId = 0;
  let projectId = 0;
  let ticketId = 0;
  let conversationId = 0;
  const appointmentIds: number[] = [];

  const owner = new Agent(() => base);
  const mate = new Agent(() => base);
  const narrow = new Agent(() => base);

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
    // Somebody who may read contacts but not deals, money, documents,
    // conversations or support.
    const [restricted] = await db.insert(schema.crmStaff).values({
      email: NARROW.email, displayName: "[CRM-TEST] Narrow Reader",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(NARROW.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["deals.read", "documents.read", "support.read", "communications.read", "projects.read"],
    }).returning();
    staffIds[NARROW.email] = restricted.id;

    expect(await owner.login(OWNER)).toBe(200);
    expect(await mate.login(MATE)).toBe(200);
    expect(await narrow.login(NARROW)).toBe(200);

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] History Subject", email: `history-lead-${STAMP}@example.test`,
      status: "New Inquiry", source: "Referral", createdAt: T(-60), updatedAt: T(-60),
    }).returning();
    leadId = lead.id;

    const [other] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] History Bystander", email: `history-other-${STAMP}@example.test`,
      status: "New Inquiry", createdAt: T(-60), updatedAt: T(-60),
    }).returning();
    otherLeadId = other.id;

    // ── Communications ────────────────────────────────────────────────────
    const [conversation] = await db.insert(schema.crmConversations).values({
      channel: "phone", identityKey: `phone:lead:${leadId}:${STAMP}`,
      contactId: leadId, externalAddress: `+1555${String(STAMP).slice(-7)}`,
      status: "resolved", resolvedAt: T(110), resolvedByStaffId: staffIds[OWNER.email],
      firstMessageAt: T(0), lastMessageAt: T(5), messageCount: 3,
      createdAt: T(0), updatedAt: T(110),
    }).returning();
    conversationId = conversation.id;

    await db.insert(schema.crmMessages).values([
      {
        leadId, conversationId, direction: "inbound", channel: "sms",
        body: "Hello, can you quote for a rebuild?", origin: "inbound", createdAt: T(0),
      },
      {
        leadId, conversationId, direction: "outbound", channel: "sms",
        body: "Of course — sending something over today.",
        origin: "staff", sentByStaffId: staffIds[MATE.email], sentByLabel: MATE.name,
        status: "delivered", createdAt: T(5),
      },
      // Predates attribution entirely: no origin, no staff id, no label.
      {
        leadId, conversationId, direction: "outbound", channel: "sms",
        body: "An older message nobody signed.", origin: "legacy", createdAt: T(7),
      },
    ]);

    // ── The activity log ──────────────────────────────────────────────────
    await db.insert(schema.crmActivities).values([
      // The column default. Thousands of real rows look exactly like this.
      {
        leadId, type: "note_added", title: "Historical note",
        description: INTERNAL_SECRETS.activity, createdBy: "admin", createdAt: T(10),
      },
      {
        leadId, type: "note_added", title: "Note from a named person",
        description: "Spoke to them about timing.", createdBy: MATE.name, createdAt: T(12),
      },
    ]);

    // ── Notes ─────────────────────────────────────────────────────────────
    await db.insert(schema.crmComments).values([
      {
        entityType: "lead", entityId: leadId, body: INTERNAL_SECRETS.comment,
        isInternal: true, authorStaffId: staffIds[OWNER.email], authorLabel: OWNER.name,
        createdAt: T(15),
      },
      {
        entityType: "lead", entityId: leadId, body: "Shared with the client: revised scope agreed.",
        isInternal: false, authorStaffId: staffIds[OWNER.email], authorLabel: OWNER.name,
        createdAt: T(17),
      },
    ]);

    // ── Tasks ─────────────────────────────────────────────────────────────
    await db.insert(schema.crmTasks).values({
      leadId, type: "Follow Up", title: "[CRM-TEST] Send the proposal",
      status: "completed", createdBy: "admin",
      completedByStaffId: staffIds[MATE.email],
      createdAt: T(20), completedAt: T(25), updatedAt: T(25),
    });

    // ── Meetings ──────────────────────────────────────────────────────────
    const appts = await db.insert(schema.crmAppointments).values([
      {
        title: "[CRM-TEST] Kick-off call", leadId,
        startAt: T(30), endAt: T(60), timezone: "UTC", status: "completed",
        createdByStaffId: staffIds[OWNER.email], createdByLabel: OWNER.name,
        organizerStaffId: staffIds[MATE.email],
        completedAt: T(35), createdAt: T(28), updatedAt: T(35),
      },
      {
        title: "[CRM-TEST] Follow-up that did not happen", leadId,
        startAt: T(40), endAt: T(70), timezone: "UTC", status: "cancelled",
        createdByStaffId: staffIds[OWNER.email], createdByLabel: OWNER.name,
        cancelledAt: T(42), cancelledByStaffId: staffIds[OWNER.email],
        cancelReason: "Client rescheduled.", createdAt: T(38), updatedAt: T(42),
      },
    ]).returning();
    for (const a of appts) appointmentIds.push(a.id);

    // ── Documents ─────────────────────────────────────────────────────────
    await db.insert(schema.crmDocumentRequests).values({
      entityType: "lead", entityId: leadId, title: "[CRM-TEST] Signed contract",
      status: "received", requestedAt: T(45), receivedAt: T(50),
      requestedByStaffId: staffIds[OWNER.email], requestedByLabel: OWNER.name,
      createdAt: T(45), updatedAt: T(50),
    });
    await db.insert(schema.crmAttachments).values({
      entityType: "lead", entityId: leadId, filename: `[CRM-TEST] brief-${STAMP}.pdf`,
      mimeType: "application/pdf", sizeBytes: 1024, storageKey: `test/${STAMP}.pdf`,
      uploadedByStaffId: staffIds[MATE.email], uploadedByLabel: MATE.name,
      createdAt: T(55),
    });

    // ── The sales chain ───────────────────────────────────────────────────
    const deals = await db.insert(schema.crmDeals).values([
      {
        leadId, name: "[CRM-TEST] Website rebuild", value: "12000.00", stage: "Won",
        ownerStaffId: staffIds[MATE.email], closedByStaffId: staffIds[OWNER.email],
        wonAt: T(65), createdAt: T(60), updatedAt: T(70),
      },
      {
        leadId, name: "[CRM-TEST] Retainer", value: "3000.00", stage: "Lost",
        ownerStaffId: staffIds[MATE.email], closedByStaffId: staffIds[MATE.email],
        lostAt: T(75), lostReason: "price", lostReasonDetail: INTERNAL_SECRETS.lostReason,
        createdAt: T(72), updatedAt: T(75),
      },
    ]).returning();
    wonDealId = deals[0].id;
    lostDealId = deals[1].id;

    const [project] = await db.insert(schema.crmProjects).values({
      leadId, dealId: wonDealId, name: "[CRM-TEST] Rebuild delivery",
      stage: "Design", budget: "12000.00", createdAt: T(80), updatedAt: T(80),
    }).returning();
    projectId = project.id;

    await db.update(schema.crmDeals)
      .set({ convertedProjectId: projectId, convertedAt: T(70) })
      .where(eq(schema.crmDeals.id, wonDealId));

    await db.insert(schema.crmProjectUpdates).values({
      projectId, body: INTERNAL_SECRETS.projectNote, stageAtUpdate: "Design",
      authorStaffId: staffIds[MATE.email], authorLabel: MATE.name, createdAt: T(85),
    });

    // ── Money ─────────────────────────────────────────────────────────────
    await db.insert(schema.crmTransactions).values({
      dealId: wonDealId, leadId, amount: "4000.00", method: "manual_transfer",
      // The status the application actually writes. Seeding a literal here
      // would be seeding a value no write path produces.
      status: schema.TRANSACTION_RECEIVED_STATUS,
      receivedAt: T(95), createdAt: T(90), updatedAt: T(95),
    });

    // ── Support ───────────────────────────────────────────────────────────
    const [ticket] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] Contact form is broken",
      description: "The form does not send.", status: "resolved", priority: "high",
      source: "email", resolution: "fixed", resolutionNote: "Redeployed the handler.",
      resolvedAt: T(105), resolvedByStaffId: staffIds[MATE.email],
      openedByLabel: null, createdAt: T(100), updatedAt: T(105),
    }).returning();
    ticketId = ticket.id;

    await db.insert(schema.crmSupportMessages).values([
      {
        ticketId, visibility: "internal", body: INTERNAL_SECRETS.supportNote,
        origin: "staff", sentByStaffId: staffIds[OWNER.email], sentByLabel: OWNER.name,
        createdAt: T(102),
      },
      {
        ticketId, visibility: "customer", body: "Fixed — please try again.",
        origin: "staff", sentByStaffId: staffIds[MATE.email], sentByLabel: MATE.name,
        createdAt: T(103),
      },
    ]);

    // A bystander's history, to prove scoping.
    await db.insert(schema.crmActivities).values({
      leadId: otherLeadId, type: "note_added", title: "[CRM-TEST] Somebody else's note",
      createdBy: "admin", createdAt: T(50),
    });
  }, 180_000);

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.crmSupportMessages).where(eq(schema.crmSupportMessages.ticketId, ticketId));
    await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmTransactions).where(inArray(schema.crmTransactions.dealId, [wonDealId, lostDealId]));
    await db.delete(schema.crmProjectUpdates).where(eq(schema.crmProjectUpdates.projectId, projectId));
    await db.delete(schema.crmProjects).where(eq(schema.crmProjects.id, projectId));
    await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.leadId, [leadId, otherLeadId]));
    if (appointmentIds.length) {
      await db.delete(schema.crmAppointments).where(inArray(schema.crmAppointments.id, appointmentIds));
    }
    await db.delete(schema.crmAttachments).where(inArray(schema.crmAttachments.entityId, [leadId]));
    await db.delete(schema.crmDocumentRequests).where(inArray(schema.crmDocumentRequests.entityId, [leadId]));
    await db.delete(schema.crmComments).where(inArray(schema.crmComments.entityId, [leadId]));
    await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmConversations).where(eq(schema.crmConversations.id, conversationId));
    await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, [leadId, otherLeadId]));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── The merge ─────────────────────────────────────────────────────────────

  it("merges every stream into one chronological history", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    expect(r.status).toBe(200);
    const entries = r.json["entries"] as Entry[];

    // Every source that has a fixture is present. This is the whole point:
    // four streams that could not see each other, in one list.
    const sources = new Set(entries.map((e) => e.source));
    for (const expected of [
      "message", "conversation_resolved", "activity", "comment",
      "task_created", "task_completed",
      "appointment_scheduled", "appointment_completed", "appointment_cancelled",
      "document_requested", "document_received", "document_uploaded",
      "deal_opened", "deal_won", "deal_lost", "deal_converted",
      "project_started", "project_update",
      "payment_recorded", "payment_received",
      "ticket_opened", "ticket_resolved", "support_message",
    ]) {
      expect(sources.has(expected), `missing source: ${expected}`).toBe(true);
    }

    // Newest first, with no exceptions.
    const times = entries.map((e) => Date.parse(e.occurredAt));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]!, `entry ${i} is out of order`).toBeLessThanOrEqual(times[i - 1]!);
    }

    // Scoping: the bystander's note is not in this contact's history.
    expect(r.text).not.toContain("Somebody else's note");

    // Each entry is followable and says what kind of thing it is.
    for (const e of entries) {
      expect(typeof e.summary).toBe("string");
      expect(e.summary.length).toBeGreaterThan(0);
      expect(["internal", "customer"]).toContain(e.visibility);
      expect(e.record.href.startsWith("/admin/crm/")).toBe(true);
    }
  }, 120_000);

  it("orders on (occurred_at, source, id) and says so", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    expect(r.json["paging"].sortKey).toBe("(occurred_at, source, id)");
    expect(String(r.json["definitions"].paging)).toMatch(/cursor/i);
    // No total is claimed, deliberately.
    expect(String(r.json["paging"].totalNote)).toMatch(/no total/i);
  }, 60_000);

  // ── Paging ────────────────────────────────────────────────────────────────

  it("recovers the whole history across small pages, exactly once each", async () => {
    const whole = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    const expected = (whole.json["entries"] as Entry[]).map((e) => e.id);
    expect(expected.length).toBeGreaterThan(10);
    expect(whole.json["nextCursor"]).toBeNull();

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const url: string = `/api/crm/history/${leadId}?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r: { status: number; json: Record<string, any> } = await owner.call("GET", url);
      expect(r.status).toBe(200);
      seen.push(...(r.json["entries"] as Entry[]).map((e) => e.id));
      cursor = r.json["nextCursor"] as string | null;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(new Set(seen).size, "an entry was returned twice").toBe(seen.length);
    expect(seen).toEqual(expected);
  }, 120_000);

  it("does not drop or duplicate anything when a new event lands mid-walk", async () => {
    const whole = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    const before = (whole.json["entries"] as Entry[]).map((e) => e.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let injected = false;

    for (let page = 0; page < 50; page += 1) {
      const url: string = `/api/crm/history/${leadId}?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r: { status: number; json: Record<string, any> } = await owner.call("GET", url);
      seen.push(...(r.json["entries"] as Entry[]).map((e) => e.id));
      cursor = r.json["nextCursor"] as string | null;

      // After the first page, the customer texts. Under offset paging this is
      // exactly where an older entry slides past the boundary and vanishes.
      if (!injected) {
        injected = true;
        await db.insert(schema.crmActivities).values({
          leadId, type: "note_added", title: "[CRM-TEST] Landed mid-pagination",
          createdBy: "admin", createdAt: new Date(),
        });
      }
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(new Set(seen).size, "an entry was returned twice").toBe(seen.length);
    // The new entry is NEWER than where we already were, so it correctly does
    // not appear in the remaining pages — and every original entry still does.
    expect(seen).toEqual(before);

    const after = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    const ids = (after.json["entries"] as Entry[]).map((e) => e.id);
    expect(ids.length).toBe(before.length + 1);
    for (const id of before) expect(ids).toContain(id);
  }, 120_000);

  it("refuses a cursor it did not issue rather than silently starting over", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?cursor=not-a-real-cursor`);
    expect(r.status).toBe(400);
  }, 60_000);

  // ── Visibility ────────────────────────────────────────────────────────────

  it("gives the customer projection zero internal entries", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}/customer?limit=200`);
    expect(r.status).toBe(200);

    const entries = r.json["entries"] as Entry[];
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.visibility).toBe("customer");
    expect(r.json["guarantee"].internalEntriesReturned).toBe(0);

    // The real check: not one internal body anywhere in the response, however
    // it might have been nested or renamed.
    for (const [name, secret] of Object.entries(INTERNAL_SECRETS)) {
      expect(r.text.includes(secret), `customer projection leaked ${name}`).toBe(false);
    }

    // And the things a customer legitimately has: their own messages, the
    // meeting they attended, the money they paid.
    const sources = new Set(entries.map((e) => e.source));
    expect(sources.has("message")).toBe(true);
    expect(sources.has("payment_received")).toBe(true);
    expect(sources.has("appointment_scheduled")).toBe(true);
    // ...and none of the things they do not.
    expect(sources.has("activity")).toBe(false);
    expect(sources.has("deal_lost")).toBe(false);
    expect(sources.has("project_update")).toBe(false);
  }, 120_000);

  it("keeps the internal notes visible to staff, so nothing was merely deleted", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?limit=200&visibility=internal`);
    expect(r.status).toBe(200);
    for (const e of r.json["entries"] as Entry[]) expect(e.visibility).toBe("internal");
    expect(r.text).toContain(INTERNAL_SECRETS.comment);
    expect(r.text).toContain(INTERNAL_SECRETS.supportNote);
  }, 60_000);

  it("filters by kind", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?limit=200&kind=payment,support`);
    expect(r.status).toBe(200);
    const kinds = new Set((r.json["entries"] as Entry[]).map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["payment", "support"]);
  }, 60_000);

  // ── Attribution ───────────────────────────────────────────────────────────

  it("never credits an unattributed historical row to anybody", async () => {
    const r = await owner.call("GET", `/api/crm/history/${leadId}?limit=200`);
    const entries = r.json["entries"] as Entry[];

    // The row whose author is the literal column default 'admin'.
    const historical = entries.find((e) => e.summary.includes("Historical note"));
    expect(historical, "fixture missing").toBeTruthy();
    expect(historical!.actor.kind).toBe("unattributed");
    expect(historical!.actor.staffId).toBeNull();
    expect(historical!.actor.label).toBe("Unattributed");
    expect(String(historical!.actor.note)).toMatch(/not credited to anybody/i);
    // And emphatically not either real person.
    expect(historical!.actor.label).not.toBe(OWNER.name);
    expect(historical!.actor.label).not.toBe(MATE.name);

    // A message with origin 'legacy' and no sender is the same case.
    const legacy = entries.find((e) => e.detail === "An older message nobody signed.");
    expect(legacy, "fixture missing").toBeTruthy();
    expect(legacy!.actor.kind).toBe("unattributed");

    // The one that IS attributable carries the real person, from the id.
    const attributed = entries.find((e) => e.detail === "Of course — sending something over today.");
    expect(attributed!.actor.kind).toBe("staff");
    expect(attributed!.actor.staffId).toBe(staffIds[MATE.email]);
    expect(attributed!.actor.label).toBe(MATE.name);

    // The customer's own message is the customer's, not ours.
    const inbound = entries.find((e) => e.detail === "Hello, can you quote for a rebuild?");
    expect(inbound!.actor.kind).toBe("customer");

    // A free-text name that predates staff accounts is shown, and flagged as
    // not being a real account rather than quietly promoted into one.
    const named = entries.find((e) => e.summary.includes("Note from a named person"));
    expect(named!.actor.staffId).toBeNull();
    expect(named!.actor.label).toBe(MATE.name);
    expect(String(named!.actor.note)).toMatch(/not linked/i);
  }, 120_000);

  // ── Permissions ───────────────────────────────────────────────────────────

  it("shows a restricted reader only what their grants allow, and says what it withheld", async () => {
    const r = await narrow.call("GET", `/api/crm/history/${leadId}?limit=200`);
    expect(r.status).toBe(200);

    const sources = new Set((r.json["entries"] as Entry[]).map((e) => e.source));
    for (const forbidden of [
      "message", "conversation_resolved", "deal_opened", "deal_won", "deal_lost",
      "payment_recorded", "payment_received", "document_uploaded", "document_requested",
      "ticket_opened", "support_message", "project_started", "project_update",
    ]) {
      expect(sources.has(forbidden), `restricted reader saw ${forbidden}`).toBe(false);
    }
    // They do keep the contact-level history their role is for.
    expect(sources.has("activity")).toBe(true);

    // Nothing they cannot see leaked through the body either.
    expect(r.text).not.toContain(INTERNAL_SECRETS.supportNote);
    expect(r.text).not.toContain(INTERNAL_SECRETS.projectNote);

    // A short timeline because of a permission boundary must not look like a
    // quiet client.
    const omitted = r.json["sources"].omitted as { source: string; needs: string }[];
    expect(omitted.length).toBeGreaterThan(0);
    expect(omitted.find((o) => o.source === "payment_received")?.needs).toBe("deals.read");
    expect(String(r.json["sources"].note)).toMatch(/incomplete/i);
  }, 120_000);

  it("404s an unknown contact rather than returning an empty history", async () => {
    const r = await owner.call("GET", "/api/crm/history/999999999");
    expect(r.status).toBe(404);
  }, 60_000);

  it("refuses a caller with no session", async () => {
    const anon = new Agent(() => base);
    expect((await anon.call("GET", `/api/crm/history/${leadId}`)).status).toBe(401);
    expect((await anon.call("GET", `/api/crm/history/${leadId}/customer`)).status).toBe(401);
  }, 60_000);
});
