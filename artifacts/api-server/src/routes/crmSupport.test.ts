/**
 * M4 Support — tickets, their thread, and the knowledge base.
 *
 * The properties worth testing hardest are the ones that hurt when they are
 * wrong:
 *
 *   - An internal note reaching a customer. Tested against the actual
 *     customer-facing projection, by searching the whole serialised response
 *     for the note's text — not by trusting a field name.
 *   - Attribution. Three different people write on one ticket; each message
 *     must carry the person who wrote it, not whoever happened to be first.
 *   - A refused write that writes anyway. Every mutating route is called by a
 *     user without the grant, and the database is then checked to prove
 *     nothing changed. A 403 that still wrote is worse than no check at all.
 *   - Pagination dropping older tickets. The queue is worked between pages —
 *     exactly what happens in real life — and every ticket must still appear
 *     exactly once.
 *   - A count that disagrees with the list it labels.
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
process.env.ADMIN_PASSWORD = "support-admin-secret-value";

const STAMP = Date.now();
const SHASTA = { email: `support-shasta-${STAMP}@example.test`, name: "[CRM-TEST] Shasta Support", password: "harbour-trellis-5521" };
const CLAIDY = { email: `support-claidy-${STAMP}@example.test`, name: "[CRM-TEST] Claidy Support", password: "lantern-quartz-7734" };
const SAISA = { email: `support-saisa-${STAMP}@example.test`, name: "[CRM-TEST] Saisa Support", password: "meridian-basalt-9911" };
const READER = { email: `support-reader-${STAMP}@example.test`, password: "verdant-copper-8890" };

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

suite("support: tickets, the thread, and the knowledge base (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  let leadId = 0;
  let otherLeadId = 0;
  let projectId = 0;
  let ticketId = 0;
  let articleId = 0;
  const createdTicketIds: number[] = [];

  const shasta = new Agent(() => base);
  const claidy = new Agent(() => base);
  const saisa = new Agent(() => base);
  const reader = new Agent(() => base);

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
    for (const who of [SHASTA, CLAIDY, SAISA]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }
    // Somebody who can reach the CRM and read support, but may not write to it,
    // may not assign, may not reply to customers, and may not touch the KB.
    const [restricted] = await db.insert(schema.crmStaff).values({
      email: READER.email, displayName: "[CRM-TEST] Support Reader",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(READER.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["support.write", "support.assign", "kb.write", "communications.send"],
    }).returning();
    staffIds[READER.email] = restricted.id;

    expect(await shasta.login(SHASTA)).toBe(200);
    expect(await claidy.login(CLAIDY)).toBe(200);
    expect(await saisa.login(SAISA)).toBe(200);
    expect(await reader.login(READER)).toBe(200);

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Support Subject", email: `support-lead-${STAMP}@example.test`, status: "Client",
    }).returning();
    leadId = lead.id;
    const [other] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Support Other", email: `support-other-${STAMP}@example.test`, status: "Client",
    }).returning();
    otherLeadId = other.id;

    const [project] = await db.insert(schema.crmProjects).values({
      name: "[CRM-TEST] Support Project", leadId, stage: "Maintenance",
    }).returning();
    projectId = project.id;
  }, 120_000);

  afterAll(async () => {
    const ids = [...new Set([...createdTicketIds, ticketId].filter(Boolean))];
    if (ids.length) {
      await db.delete(schema.crmSupportMessages).where(inArray(schema.crmSupportMessages.ticketId, ids));
      await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.id, ids));
    }
    await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.leadId, [leadId, otherLeadId]));
    if (articleId) await db.delete(schema.crmKbArticles).where(eq(schema.crmKbArticles.id, articleId));
    await db.delete(schema.crmKbArticles).where(eq(schema.crmKbArticles.slug, `test-reset-password-${STAMP}`));
    if (projectId) await db.delete(schema.crmProjects).where(eq(schema.crmProjects.id, projectId));
    await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, [leadId, otherLeadId]));
    await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, [leadId, otherLeadId]));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Raising work ──────────────────────────────────────────────────────────

  it("raises a ticket against a contact, records who raised it, and keeps the customer's own words in the thread", async () => {
    const created = await shasta.call("POST", "/api/crm/support/tickets", {
      leadId, projectId,
      subject: "[CRM-TEST] Contact form stopped sending",
      description: "Nothing has arrived since Tuesday.",
      priority: "high",
      source: "email",
    });
    expect(created.status).toBe(201);
    ticketId = created.json["ticket"].id;
    createdTicketIds.push(ticketId);

    const t = created.json["ticket"];
    expect(t.status).toBe("new");
    expect(t.priority).toBe("high");
    expect(t.leadId).toBe(leadId);
    expect(t.projectId).toBe(projectId);
    expect(t.openedByStaffId).toBe(staffIds[SHASTA.email]);
    // Derived from the immutable id, so two concurrent creates cannot collide.
    expect(t.reference).toMatch(/^SUP-\d{5}$/);
    // Nobody owns it yet, and the API says so rather than leaving it implied.
    expect(t.assignedToStaffId).toBeNull();
    expect(String(created.json["nextStep"])).toMatch(/assign/i);

    // The customer's description IS the first thing in the thread, recorded as
    // theirs — not as ours, and not only in a column nobody reads.
    const detail = await shasta.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    expect(detail.json["messages"]).toHaveLength(1);
    expect(detail.json["messages"][0].origin).toBe("customer");
    expect(detail.json["messages"][0].visibility).toBe("customer");
    expect(detail.json["messages"][0].sentByStaffId).toBeNull();
  }, 60_000);

  it("refuses a ticket with no contact, and one against a contact that does not exist", async () => {
    const noContact = await shasta.call("POST", "/api/crm/support/tickets", { subject: "[CRM-TEST] orphan" });
    expect(noContact.status).toBe(400);

    const ghost = await shasta.call("POST", "/api/crm/support/tickets", {
      leadId: 999_999_999, subject: "[CRM-TEST] ghost",
    });
    expect(ghost.status).toBe(404);
  }, 60_000);

  it("records a customer service request as a ticket, and demands to know what was asked for", async () => {
    const vague = await claidy.call("POST", "/api/crm/support/service-requests", {
      leadId, subject: "[CRM-TEST] Please change something",
    });
    expect(vague.status).toBe(400);
    expect(Array.isArray(vague.json["accepted"])).toBe(true);

    const madeUp = await claidy.call("POST", "/api/crm/support/service-requests", {
      leadId, subject: "[CRM-TEST] Please change something", requestType: "whatever_i_like",
    });
    expect(madeUp.status).toBe(400);

    const proper = await claidy.call("POST", "/api/crm/support/service-requests", {
      leadId, subject: "[CRM-TEST] New photo on the about page",
      requestType: "content_change",
      description: "Swap the team photo for the new one.",
    });
    expect(proper.status).toBe(201);
    createdTicketIds.push(proper.json["ticket"].id);
    expect(proper.json["ticket"].source).toBe("service_request");
    expect(proper.json["ticket"].requestType).toBe("content_change");
  }, 60_000);

  // ── Ownership ─────────────────────────────────────────────────────────────

  it("puts a ticket in somebody's name, and refuses a disabled account", async () => {
    const assigned = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/assign`,
      { staffId: staffIds[CLAIDY.email] });
    expect(assigned.status).toBe(200);
    expect(assigned.json["ticket"].assignedToStaffId).toBe(staffIds[CLAIDY.email]);
    expect(assigned.json["ticket"].assignedAt).not.toBeNull();

    await db.update(schema.crmStaff).set({ status: "disabled" })
      .where(eq(schema.crmStaff.id, staffIds[SAISA.email]));
    const refused = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/assign`,
      { staffId: staffIds[SAISA.email] });
    expect(refused.status).toBe(409);
    await db.update(schema.crmStaff).set({ status: "active" })
      .where(eq(schema.crmStaff.id, staffIds[SAISA.email]));
    // A disabled account's session is killed by the epoch bump, so sign back in.
    expect(await saisa.login(SAISA)).toBe(200);

    const ghost = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/assign`,
      { staffId: 999_999_999 });
    expect(ghost.status).toBe(404);
  }, 60_000);

  // ── Attribution ───────────────────────────────────────────────────────────

  it("records WHICH of three people wrote each message", async () => {
    const a = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "customer", body: "[CRM-TEST] Looking into it now." });
    expect(a.status).toBe(201);

    const b = await claidy.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "internal", body: "[CRM-TEST] SMTP credentials expired, I think." });
    expect(b.status).toBe(201);

    const c = await saisa.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "customer", body: "[CRM-TEST] Fixed and tested." });
    expect(c.status).toBe(201);

    expect(a.json["message"].sentByStaffId).toBe(staffIds[SHASTA.email]);
    expect(b.json["message"].sentByStaffId).toBe(staffIds[CLAIDY.email]);
    expect(c.json["message"].sentByStaffId).toBe(staffIds[SAISA.email]);
    // Three distinct people, not one repeated.
    expect(new Set([
      a.json["message"].sentByStaffId,
      b.json["message"].sentByStaffId,
      c.json["message"].sentByStaffId,
    ]).size).toBe(3);

    // The label is captured at write time so it survives a rename.
    expect(a.json["message"].sentByLabel).toBe(SHASTA.name);
    expect(b.json["message"].sentByLabel).toBe(CLAIDY.name);
    expect(c.json["message"].sentByLabel).toBe(SAISA.name);
    for (const r of [a, b, c]) expect(r.json["message"].origin).toBe("staff");
  }, 60_000);

  it("says plainly that a recorded reply was not sent to anybody", async () => {
    const sent = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "customer", body: "[CRM-TEST] One more note for the client." });
    expect(sent.status).toBe(201);
    expect(sent.json["delivery"].sent).toBe(false);
    expect(String(sent.json["delivery"].note)).toMatch(/nothing was emailed|not.*sent/i);
  }, 60_000);

  it("starts the first-response clock on a reply to the customer, never on an internal note", async () => {
    const [fresh] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] First response clock", status: "new", priority: "normal", source: "staff",
    }).returning();
    createdTicketIds.push(fresh.id);
    expect(fresh.firstResponseAt).toBeNull();

    await shasta.call("POST", `/api/crm/support/tickets/${fresh.id}/messages`,
      { visibility: "internal", body: "[CRM-TEST] Note to self, not to them." });
    const [afterNote] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, fresh.id));
    // A note to ourselves is not a response to the person waiting.
    expect(afterNote.firstResponseAt).toBeNull();
    expect(afterNote.status).toBe("new");

    const reply = await shasta.call("POST", `/api/crm/support/tickets/${fresh.id}/messages`,
      { visibility: "customer", body: "[CRM-TEST] Hello, we have this." });
    expect(reply.json["statusMovedTo"]).toBe("open");
    const [afterReply] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, fresh.id));
    expect(afterReply.firstResponseAt).not.toBeNull();
    // A replied-to ticket is not "new" any more; the queue must not claim it is.
    expect(afterReply.status).toBe("open");
  }, 60_000);

  // ── The line that must never be crossed ───────────────────────────────────

  it("never lets an internal note reach the customer-facing projection", async () => {
    const secret = `[CRM-TEST] internal-only-${STAMP}-do-not-show`;
    const note = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "internal", body: secret });
    expect(note.status).toBe(201);

    // Staff see it.
    const staffView = await shasta.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(staffView.text).toContain(secret);
    expect(staffView.json["counts"].internalNotes).toBeGreaterThanOrEqual(1);

    // The customer does not — and this is checked against the WHOLE serialised
    // response, not a field we hope is the right one.
    const customerView = await shasta.call("GET", `/api/crm/support/tickets/${ticketId}/customer-view`);
    expect(customerView.status).toBe(200);
    expect(customerView.text).not.toContain(secret);
    expect(customerView.text).not.toContain("internal");

    const shown = customerView.json["messages"] as any[];
    expect(shown.length).toBeGreaterThan(0);
    for (const m of shown) expect(String(m.body)).not.toContain(secret);

    // And the two views agree on the arithmetic: everything the customer sees
    // is exactly the customer-visible half of the staff thread.
    expect(shown.length).toBe(staffView.json["counts"].customerVisible);
    expect(staffView.json["counts"].messages).toBe(
      staffView.json["counts"].customerVisible + staffView.json["counts"].internalNotes,
    );
  }, 60_000);

  it("refuses a message that does not say who it is for", async () => {
    const silent = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { body: "[CRM-TEST] which side is this?" });
    expect(silent.status).toBe(400);
    expect(String(silent.json["error"])).toMatch(/no default/i);
    expect(silent.json["accepted"]).toEqual(["customer", "internal"]);

    const nonsense = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "semi-private", body: "[CRM-TEST] nope" });
    expect(nonsense.status).toBe(400);
  }, 60_000);

  it("keeps a customer's own reply attributed to them, and hands the ball back to us", async () => {
    const [waiting] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] Awaiting the client", status: "waiting_on_customer",
      priority: "normal", source: "staff",
    }).returning();
    createdTicketIds.push(waiting.id);

    const inbound = await shasta.call("POST", `/api/crm/support/tickets/${waiting.id}/customer-messages`,
      { body: "[CRM-TEST] Here is the file you asked for." });
    expect(inbound.status).toBe(201);
    expect(inbound.json["message"].origin).toBe("customer");
    // No staff member is invented as the author of the customer's own words.
    expect(inbound.json["message"].sentByStaffId).toBeNull();
    expect(inbound.json["message"].sentByLabel).toBeNull();
    expect(inbound.json["statusMovedTo"]).toBe("open");
  }, 60_000);

  // ── The state machine ─────────────────────────────────────────────────────

  it("refuses a move the state machine does not allow, and names the ones it does", async () => {
    const [t] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] State machine", status: "new", priority: "low", source: "staff",
    }).returning();
    createdTicketIds.push(t.id);

    const madeUp = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "on_fire" });
    expect(madeUp.status).toBe(400);
    expect(Array.isArray(madeUp.json["accepted"])).toBe(true);

    const sideways = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "new" });
    expect(sideways.status).toBe(409);

    await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "open" });
    // "open" cannot go straight back to "new" — a ticket somebody has picked up
    // has been picked up.
    const backwards = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "new" });
    expect(backwards.status).toBe(409);
    expect(backwards.json["allowed"]).not.toContain("new");
    expect(backwards.json["allowed"]).toContain("resolved");
  }, 60_000);

  it("will not finish a ticket without saying why, and keeps the reason countable", async () => {
    const [t] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] Resolution reason", status: "open", priority: "normal", source: "staff",
    }).returning();
    createdTicketIds.push(t.id);

    const noReason = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "resolved" });
    expect(noReason.status).toBe(400);
    expect(Array.isArray(noReason.json["accepted"])).toBe(true);

    const madeUp = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`,
      { status: "resolved", resolution: "they_gave_up" });
    expect(madeUp.status).toBe(400);

    const proper = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, {
      status: "resolved", resolution: "fixed", resolutionNote: "Renewed the SMTP credentials.",
    });
    expect(proper.status).toBe(200);
    expect(proper.json["ticket"].resolution).toBe("fixed");
    expect(proper.json["ticket"].resolvedAt).not.toBeNull();
    expect(proper.json["ticket"].resolvedByStaffId).toBe(staffIds[SHASTA.email]);

    // Closing an already-resolved ticket carries its reason rather than
    // demanding the same answer twice.
    const closed = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "closed" });
    expect(closed.status).toBe(200);
    expect(closed.json["ticket"].resolution).toBe("fixed");
    expect(closed.json["ticket"].closedAt).not.toBeNull();
  }, 60_000);

  it("reopens onto the SAME ticket, so the history stays in one place", async () => {
    const [t] = await db.insert(schema.crmSupportTickets).values({
      leadId, subject: "[CRM-TEST] Comes back", status: "resolved", priority: "normal", source: "staff",
      resolution: "answered", resolvedAt: new Date(),
    }).returning();
    createdTicketIds.push(t.id);

    const reopened = await shasta.call("POST", `/api/crm/support/tickets/${t.id}/status`, { status: "open" });
    expect(reopened.status).toBe(200);
    expect(reopened.json["reopened"]).toBe(true);
    expect(reopened.json["ticket"].id).toBe(t.id);
    expect(reopened.json["ticket"].status).toBe("open");
    expect(reopened.json["ticket"].reopenCount).toBe(1);
    expect(reopened.json["ticket"].resolvedAt).toBeNull();
    // What we believed last time is kept — it is the most useful thing to read
    // when a ticket comes back.
    expect(reopened.json["ticket"].resolution).toBe("answered");
  }, 60_000);

  it("refuses a priority outside the closed list", async () => {
    const bad = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/priority`, { priority: "VERY URGENT!!" });
    expect(bad.status).toBe(400);
    expect(bad.json["accepted"]).toEqual(["urgent", "high", "normal", "low"]);

    const good = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/priority`, { priority: "urgent" });
    expect(good.status).toBe(200);
    expect(good.json["ticket"].priority).toBe("urgent");
  }, 60_000);

  // ── Paging ────────────────────────────────────────────────────────────────

  it("pages the queue without ever dropping an older ticket, even while it is being worked", async () => {
    const made = await db.insert(schema.crmSupportTickets).values(
      Array.from({ length: 9 }, (_, i) => ({
        leadId: otherLeadId,
        subject: `[CRM-TEST] Paging subject ${i}`,
        status: "open", priority: "normal", source: "staff" as const,
      })),
    ).returning();
    for (const m of made) createdTicketIds.push(m.id);
    const expected = new Set(made.map((m) => m.id));

    const first = await shasta.call("GET", `/api/crm/support/tickets?leadId=${otherLeadId}&limit=4`);
    expect(first.status).toBe(200);
    expect(first.json["tickets"]).toHaveLength(4);
    expect(first.json["counts"].matchingFilters).toBe(9);

    const seen: number[] = first.json["tickets"].map((t: any) => t.id);

    // Between pages, somebody works the queue: the OLDEST ticket is touched.
    // Under "most recently updated first" paging this is the moment a row jumps
    // to the front and the boundary row is never shown again.
    await shasta.call("POST", `/api/crm/support/tickets/${made[0].id}/priority`, { priority: "urgent" });

    let cursor = first.json["nextCursor"];
    let guard = 0;
    while (cursor != null && guard++ < 10) {
      const next = await shasta.call("GET",
        `/api/crm/support/tickets?leadId=${otherLeadId}&limit=4&cursor=${cursor}`);
      expect(next.status).toBe(200);
      for (const t of next.json["tickets"]) seen.push(t.id);
      cursor = next.json["nextCursor"];
    }

    // Every ticket exactly once: none dropped, none repeated.
    expect(seen).toHaveLength(9);
    expect(new Set(seen).size).toBe(9);
    for (const id of expected) expect(seen).toContain(id);
    // Newest first, by the immutable key.
    expect([...seen]).toEqual([...seen].sort((a, b) => b - a));
  }, 90_000);

  it("returns counts that equal the lists they label", async () => {
    const all = await shasta.call("GET", `/api/crm/support/tickets?leadId=${otherLeadId}&limit=100`);
    expect(all.json["tickets"].length).toBe(all.json["counts"].matchingFilters);
    expect(all.json["counts"].returnedOnThisPage).toBe(all.json["tickets"].length);

    // Each status count must equal what selecting that status actually returns.
    const byStatus = all.json["counts"].byStatus as Record<string, number>;
    for (const [status, n] of Object.entries(byStatus)) {
      const scoped = await shasta.call("GET",
        `/api/crm/support/tickets?leadId=${otherLeadId}&status=${status}&limit=100`);
      expect(scoped.json["tickets"].length, `status=${status}`).toBe(n);
      expect(scoped.json["counts"].matchingFilters, `status=${status}`).toBe(n);
    }
  }, 90_000);

  it("finds a ticket by its words and by its reference", async () => {
    const bySubject = await shasta.call("GET",
      `/api/crm/support/tickets?leadId=${otherLeadId}&q=${encodeURIComponent("Paging subject 3")}`);
    expect(bySubject.json["tickets"].length).toBe(1);
    expect(bySubject.json["counts"].matchingFilters).toBe(1);

    const ref = (await shasta.call("GET", `/api/crm/support/tickets/${ticketId}`)).json["ticket"].reference;
    const byRef = await shasta.call("GET", `/api/crm/support/tickets?q=${encodeURIComponent(ref)}`);
    expect((byRef.json["tickets"] as any[]).some((t) => t.id === ticketId)).toBe(true);
  }, 60_000);

  // ── Knowledge base ────────────────────────────────────────────────────────

  it("writes an article, keeps drafts out of the published set, and links it to a ticket", async () => {
    const created = await claidy.call("POST", "/api/crm/support/kb", {
      title: "[CRM-TEST] Reset a password",
      slug: `test-reset-password-${STAMP}`,
      body: "Open Settings, choose Security, then Reset. A link arrives by email within a minute.",
      category: "Accounts",
    });
    expect(created.status).toBe(201);
    articleId = created.json["article"].id;
    expect(created.json["article"].status).toBe("draft");
    expect(created.json["article"].publishedAt).toBeNull();
    expect(created.json["article"].authorStaffId).toBe(staffIds[CLAIDY.email]);

    const clash = await claidy.call("POST", "/api/crm/support/kb", {
      title: "[CRM-TEST] Something else", slug: `test-reset-password-${STAMP}`, body: "x",
    });
    expect(clash.status).toBe(409);

    const draftsHidden = await shasta.call("GET", "/api/crm/support/kb?status=published&limit=100");
    expect((draftsHidden.json["articles"] as any[]).some((a) => a.id === articleId)).toBe(false);

    const published = await claidy.call("POST", `/api/crm/support/kb/${articleId}/publish`, { published: true });
    expect(published.status).toBe(200);
    expect(published.json["article"].status).toBe("published");
    expect(published.json["article"].publishedAt).not.toBeNull();

    const found = await shasta.call("GET", `/api/crm/support/kb?q=${encodeURIComponent("Settings, choose Security")}`);
    expect((found.json["articles"] as any[]).some((a) => a.id === articleId)).toBe(true);
    expect(found.json["counts"].matchingFilters).toBe(found.json["articles"].length);

    const linked = await shasta.call("POST", `/api/crm/support/tickets/${ticketId}/article`, { articleId });
    expect(linked.status).toBe(200);
    expect(linked.json["ticket"].kbArticleId).toBe(articleId);

    // The article knows what it has been used to answer.
    const bySlug = await shasta.call("GET", `/api/crm/support/kb/test-reset-password-${STAMP}`);
    expect(bySlug.status).toBe(200);
    expect((bySlug.json["linkedTickets"] as any[]).some((t) => t.id === ticketId)).toBe(true);

    // The edit records who changed it, which is usually the question.
    const edited = await saisa.call("PATCH", `/api/crm/support/kb/${articleId}`, {
      body: "Open Settings, choose Security, then Reset. The link expires in 15 minutes.",
    });
    expect(edited.status).toBe(200);
    expect(edited.json["article"].updatedByStaffId).toBe(staffIds[SAISA.email]);
    expect(edited.json["article"].authorStaffId).toBe(staffIds[CLAIDY.email]);
  }, 90_000);

  // ── Refusals ──────────────────────────────────────────────────────────────

  it("refuses a restricted user EVERY mutating route, and writes nothing when it does", async () => {
    const before = {
      ticket: (await db.select().from(schema.crmSupportTickets)
        .where(eq(schema.crmSupportTickets.id, ticketId)))[0],
      messages: (await db.select().from(schema.crmSupportMessages)
        .where(eq(schema.crmSupportMessages.ticketId, ticketId))).length,
      tickets: (await db.select().from(schema.crmSupportTickets)
        .where(eq(schema.crmSupportTickets.leadId, leadId))).length,
      articles: (await db.select().from(schema.crmKbArticles)).length,
      article: (await db.select().from(schema.crmKbArticles)
        .where(eq(schema.crmKbArticles.id, articleId)))[0],
    };

    // Reading is allowed — this is a support reader, not a stranger.
    expect((await reader.call("GET", "/api/crm/support/tickets")).status).toBe(200);
    expect((await reader.call("GET", `/api/crm/support/tickets/${ticketId}`)).status).toBe(200);

    const refusals: Array<[string, string, unknown]> = [
      ["POST", "/api/crm/support/tickets", { leadId, subject: "[CRM-TEST] should not exist" }],
      ["POST", "/api/crm/support/service-requests", { leadId, subject: "[CRM-TEST] nope", requestType: "bug_report" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/assign`, { staffId: staffIds[SAISA.email] }],
      ["POST", `/api/crm/support/tickets/${ticketId}/priority`, { priority: "low" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/status`, { status: "closed", resolution: "other" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/messages`, { visibility: "internal", body: "[CRM-TEST] no" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/messages`, { visibility: "customer", body: "[CRM-TEST] no" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/customer-messages`, { body: "[CRM-TEST] no" }],
      ["POST", `/api/crm/support/tickets/${ticketId}/article`, { articleId: null }],
      ["POST", "/api/crm/support/kb", { title: "[CRM-TEST] no", body: "no" }],
      ["PATCH", `/api/crm/support/kb/${articleId}`, { title: "[CRM-TEST] hijacked" }],
      ["POST", `/api/crm/support/kb/${articleId}/publish`, { published: false }],
    ];
    for (const [method, path, body] of refusals) {
      const res = await reader.call(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
    }

    // A 403 that still wrote is worse than no check at all.
    const after = {
      ticket: (await db.select().from(schema.crmSupportTickets)
        .where(eq(schema.crmSupportTickets.id, ticketId)))[0],
      messages: (await db.select().from(schema.crmSupportMessages)
        .where(eq(schema.crmSupportMessages.ticketId, ticketId))).length,
      tickets: (await db.select().from(schema.crmSupportTickets)
        .where(eq(schema.crmSupportTickets.leadId, leadId))).length,
      articles: (await db.select().from(schema.crmKbArticles)).length,
      article: (await db.select().from(schema.crmKbArticles)
        .where(eq(schema.crmKbArticles.id, articleId)))[0],
    };
    expect(after.messages).toBe(before.messages);
    expect(after.tickets).toBe(before.tickets);
    expect(after.articles).toBe(before.articles);
    expect(after.ticket.status).toBe(before.ticket.status);
    expect(after.ticket.priority).toBe(before.ticket.priority);
    expect(after.ticket.assignedToStaffId).toBe(before.ticket.assignedToStaffId);
    expect(after.ticket.kbArticleId).toBe(before.ticket.kbArticleId);
    expect(after.article.title).toBe(before.article.title);
    expect(after.article.status).toBe(before.article.status);
  }, 120_000);

  it("separates replying to a customer from writing a note to ourselves", async () => {
    // This person may work tickets but may not contact clients.
    const [row] = await db.insert(schema.crmStaff).values({
      email: `support-noreply-${STAMP}@example.test`, displayName: "[CRM-TEST] No Contact",
      role: "operations_manager", status: "active",
      passwordHash: await (await import("../lib/staffCredentials.js")).hashPassword("cobalt-thistle-4417"),
      passwordUpdatedAt: new Date(),
      revokedPermissions: ["communications.send"],
    }).returning();

    const quiet = new Agent(() => base);
    expect(await quiet.login({ email: row.email, password: "cobalt-thistle-4417" })).toBe(200);

    const reply = await quiet.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "customer", body: "[CRM-TEST] should be refused" });
    expect(reply.status).toBe(403);
    expect(reply.json["permission"]).toBe("communications.send");

    const note = await quiet.call("POST", `/api/crm/support/tickets/${ticketId}/messages`,
      { visibility: "internal", body: "[CRM-TEST] but a note is fine" });
    expect(note.status).toBe(201);
    expect(note.json["message"].sentByStaffId).toBe(row.id);

    await db.delete(schema.crmSupportMessages).where(eq(schema.crmSupportMessages.id, note.json["message"].id));
    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, row.id));
  }, 90_000);

  it("refuses a signed-out caller everything", async () => {
    const stranger = new Agent(() => base);
    expect((await stranger.call("GET", "/api/crm/support/tickets")).status).toBe(401);
    expect((await stranger.call("POST", "/api/crm/support/tickets", { leadId, subject: "x" })).status).toBe(401);
  }, 60_000);

  // ── Honest numbers ────────────────────────────────────────────────────────

  it("reports the queue without inventing a resolution time", async () => {
    const overview = await shasta.call("GET", "/api/crm/support/overview");
    expect(overview.status).toBe(200);
    expect(typeof overview.json["unassignedActive"]).toBe("number");
    expect(typeof overview.json["awaitingFirstReply"]).toBe("number");
    expect(overview.json["assignedToMe"]).not.toBeNull();
    // The legacy helpdesk returned a hard-coded 4.2 hours here.
    expect(overview.json["avgResolutionHours"]).toBeUndefined();
    expect(String(overview.json["definitions"].resolutionTime)).toMatch(/no history|made-up/i);
    expect(String(overview.json["definitions"].awaitingFirstReply)).toMatch(/internal note does not count/i);
  }, 60_000);

  it("publishes the vocabulary the UI must obey, state machine included", async () => {
    const v = await shasta.call("GET", "/api/crm/support/vocabulary");
    expect(v.status).toBe(200);
    expect(v.json["statuses"]).toEqual(["new", "open", "waiting_on_customer", "resolved", "closed"]);
    expect(v.json["visibilities"]).toEqual(["customer", "internal"]);
    // Finished is not final: a customer coming back must land on the same ticket.
    expect(v.json["transitions"]["closed"]).toContain("open");
    expect(v.json["transitions"]["resolved"]).toContain("open");
  }, 60_000);
});
