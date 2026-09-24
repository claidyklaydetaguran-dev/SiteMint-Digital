/**
 * The LEGACY helpdesk routes (routes/helpdesk.ts) — authorization and
 * attribution.
 *
 * These routes predate M4 Support. Their four tables are empty and no screen
 * in this repo calls them, but `router.use(helpdeskRouter)` in routes/index.ts
 * means all twelve are mounted and live. An empty table is not an
 * access-control boundary, so they are tested as if they were busy.
 *
 * Until 2026-09-12 the entire router shared one `requireCrmAuth()` with NO
 * permission — "somebody is signed in" was the whole check — and the author of
 * a thread message came from the request BODY. The properties below are the
 * two holes that closed, plus the ones that would have made closing them
 * pointless:
 *
 *   - Unauthenticated reach. Every mounted route, no credential, 401.
 *   - A refused write that writes anyway. A restricted account calls every
 *     mutating route and the three tables are compared byte-for-byte before
 *     and after. A 403 that still wrote is worse than no check at all.
 *   - Attribution. Three people write on one ticket; each message must carry
 *     the person who wrote it.
 *   - Forged attribution. A body naming somebody else as the author is
 *     ignored, asserted on the row that actually landed in Postgres — not on
 *     the response, which is easier to make look right than the table.
 *   - Customer isolation. Two contacts, two tickets; neither thread may be
 *     reachable through the other's ticket.
 *   - Identity-derived counts. "My queue" and "assigned to me" follow the
 *     session rather than the hardcoded agent 1 / literal 3 they used to.
 *
 * Gated on CRM_TEST_DATABASE_URL. Every row it creates is removed in
 * afterAll — the legacy tables must be left empty, as they were found.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "helpdesk-admin-secret-value";

const STAMP = Date.now();

// The three real owner identities, spelled as the CRM spells them.
const SHASTA = { email: `helpdesk-shasta-${STAMP}@example.test`, name: "Shasta Greene", password: "harbour-trellis-5521" };
const CLAIDY = { email: `helpdesk-claidy-${STAMP}@example.test`, name: "Claidy Taguran", password: "lantern-quartz-7734" };
const SAISA = { email: `helpdesk-saisa-${STAMP}@example.test`, name: "Saisa Lorraigne", password: "meridian-basalt-9911" };

// Can read support, and nothing else. Everything a write needs is revoked.
const READER = { email: `helpdesk-reader-${STAMP}@example.test`, password: "verdant-copper-8890" };
// May work a ticket but may not decide who owns it, and may not talk to a
// customer — the two second-level grants.
const WORKER = { email: `helpdesk-worker-${STAMP}@example.test`, password: "cinnabar-thistle-4417" };
// Signed in, active, and holds no support permission at all.
const OUTSIDER = { email: `helpdesk-outsider-${STAMP}@example.test`, password: "obsidian-marram-6628" };

/**
 * The id used to probe for a record that does not exist. It is also what a
 * BROKEN guard would write against, so cleanup has to sweep it explicitly:
 * without that, running this suite against a regressed build leaves an orphan
 * row behind and the next run fails for the previous run's reason.
 */
const GHOST = 999999999;

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

suite("legacy helpdesk: authorization and attribution (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const createdTicketIds: number[] = [];
  const createdContactIds: number[] = [];
  const createdAgentIds: number[] = [];

  // Two separate customers, each with their own ticket.
  let contactA = 0;
  let contactB = 0;
  let ticketA = 0;
  let ticketB = 0;
  let shastaAgentId = 0;

  const shasta = new Agent(() => base);
  const claidy = new Agent(() => base);
  const saisa = new Agent(() => base);
  const reader = new Agent(() => base);
  const worker = new Agent(() => base);
  const outsider = new Agent(() => base);
  const anonymous = new Agent(() => base);

  /**
   * Every mounted route in routes/helpdesk.ts, with a body good enough to
   * reach the handler. The list is the inventory: if a route is added to that
   * router and not added here, the unauthenticated sweep stops covering it.
   */
  const everyRoute = () => [
    { method: "GET", path: "/api/helpdesk/tickets", body: undefined, write: false },
    { method: "POST", path: "/api/helpdesk/tickets", write: true,
      body: { subject: "[CRM-TEST] refused", contactId: contactA, channel: "email", priority: "normal" } },
    { method: "GET", path: `/api/helpdesk/tickets/${ticketA}`, body: undefined, write: false },
    { method: "PATCH", path: `/api/helpdesk/tickets/${ticketA}`, write: true, body: { status: "closed" } },
    { method: "GET", path: `/api/helpdesk/tickets/${ticketA}/messages`, body: undefined, write: false },
    { method: "POST", path: `/api/helpdesk/tickets/${ticketA}/messages`, write: true,
      body: { body: "[CRM-TEST] refused", authorType: "agent", authorName: "Nobody", isInternalNote: true } },
    { method: "GET", path: "/api/helpdesk/contacts", body: undefined, write: false },
    { method: "POST", path: "/api/helpdesk/contacts", write: true,
      body: { name: "[CRM-TEST] Refused Contact", email: `refused-${STAMP}@example.test` } },
    { method: "GET", path: `/api/helpdesk/contacts/${contactA}`, body: undefined, write: false },
    { method: "PATCH", path: `/api/helpdesk/contacts/${contactA}`, write: true, body: { company: "[CRM-TEST] Forged Ltd" } },
    { method: "GET", path: "/api/helpdesk/agents", body: undefined, write: false },
    { method: "GET", path: "/api/helpdesk/stats", body: undefined, write: false },
  ];

  /** Every row in the three legacy tables, serialised, for before/after. */
  async function snapshot(): Promise<string> {
    const [tickets, messages, contacts] = await Promise.all([
      db.select().from(schema.helpdeskTicketsTable).orderBy(schema.helpdeskTicketsTable.id),
      db.select().from(schema.helpdeskMessagesTable).orderBy(schema.helpdeskMessagesTable.id),
      db.select().from(schema.helpdeskContactsTable).orderBy(schema.helpdeskContactsTable.id),
    ]);
    return JSON.stringify({ tickets, messages, contacts });
  }

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

    const restricted: Array<[typeof READER, string, string[]]> = [
      [READER, "[CRM-TEST] Helpdesk Reader", ["support.write", "support.assign", "communications.send"]],
      [WORKER, "[CRM-TEST] Helpdesk Worker", ["support.assign", "communications.send"]],
      [OUTSIDER, "[CRM-TEST] Helpdesk Outsider",
        ["support.read", "support.write", "support.assign", "communications.send"]],
    ];
    for (const [who, name, revoked] of restricted) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: name, role: "operations_manager", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
        revokedPermissions: revoked,
      }).returning();
      staffIds[who.email] = row.id;
    }

    expect(await shasta.login(SHASTA)).toBe(200);
    expect(await claidy.login(CLAIDY)).toBe(200);
    expect(await saisa.login(SAISA)).toBe(200);
    expect(await reader.login(READER)).toBe(200);
    expect(await worker.login(WORKER)).toBe(200);
    expect(await outsider.login(OUTSIDER)).toBe(200);

    // An agent row whose email matches Shasta's staff account — the only way
    // helpdesk_agents and crm_staff can be related, since there is no FK.
    const [agent] = await db.insert(schema.helpdeskAgentsTable).values({
      name: "[CRM-TEST] Shasta Agent", email: SHASTA.email, initials: "SG",
    }).returning();
    shastaAgentId = agent.id;
    createdAgentIds.push(agent.id);

    for (const [label, slot] of [["A", "a"], ["B", "b"]] as const) {
      const [contact] = await db.insert(schema.helpdeskContactsTable).values({
        name: `[CRM-TEST] Customer ${label}`,
        email: `helpdesk-customer-${slot}-${STAMP}@example.test`,
        initials: `C${label}`,
      }).returning();
      createdContactIds.push(contact.id);
      const [ticket] = await db.insert(schema.helpdeskTicketsTable).values({
        ticketNumber: `#T${label}${STAMP % 1000}`,
        subject: `[CRM-TEST] Customer ${label} cannot log in`,
        contactId: contact.id,
        status: "open",
      }).returning();
      createdTicketIds.push(ticket.id);
      if (label === "A") { contactA = contact.id; ticketA = ticket.id; }
      else { contactB = contact.id; ticketB = ticket.id; }
    }
  }, 120_000);

  afterAll(async () => {
    // The ghost ids first: if a guard has regressed, the probes above wrote
    // rows against records that do not exist, and those rows belong to nobody
    // and would survive an id-scoped sweep.
    await db.delete(schema.helpdeskMessagesTable)
      .where(eq(schema.helpdeskMessagesTable.ticketId, GHOST));
    await db.delete(schema.helpdeskTicketsTable)
      .where(eq(schema.helpdeskTicketsTable.contactId, GHOST));

    if (createdTicketIds.length) {
      await db.delete(schema.helpdeskMessagesTable)
        .where(inArray(schema.helpdeskMessagesTable.ticketId, createdTicketIds));
      await db.delete(schema.helpdeskTicketsTable)
        .where(inArray(schema.helpdeskTicketsTable.id, createdTicketIds));
    }
    if (createdContactIds.length) {
      await db.delete(schema.helpdeskTicketsTable)
        .where(inArray(schema.helpdeskTicketsTable.contactId, createdContactIds));
      await db.delete(schema.helpdeskContactsTable)
        .where(inArray(schema.helpdeskContactsTable.id, createdContactIds));
    }
    if (createdAgentIds.length) {
      await db.delete(schema.helpdeskAgentsTable)
        .where(inArray(schema.helpdeskAgentsTable.id, createdAgentIds));
    }
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── 1. Unauthenticated reach ──────────────────────────────────────────────

  it("refuses an unauthenticated caller on every mounted legacy route", async () => {
    const results: Array<[string, number]> = [];
    for (const r of everyRoute()) {
      const res = await anonymous.call(r.method, r.path, r.body);
      results.push([`${r.method} ${r.path}`, res.status]);
    }
    expect(results).toHaveLength(12);
    for (const [route, status] of results) {
      expect(status, `${route} let an unauthenticated caller through`).toBe(401);
    }
  }, 60_000);

  // ── 2. A restricted account, and proof that a refusal wrote nothing ───────

  it("refuses a support-less account on every route, reads included", async () => {
    for (const r of everyRoute()) {
      const res = await outsider.call(r.method, r.path, r.body);
      expect(res.status, `${r.method} ${r.path} was reachable without any support grant`).toBe(403);
    }
  }, 60_000);

  it("refuses a read-only account every write, and the database is unchanged", async () => {
    const before = await snapshot();

    for (const r of everyRoute().filter((x) => x.write)) {
      const res = await reader.call(r.method, r.path, r.body);
      expect(res.status, `${r.method} ${r.path} was writable by a read-only account`).toBe(403);
    }
    // The same account may still read — the refusal is about writing, not
    // about reaching the surface at all.
    expect((await reader.call("GET", "/api/helpdesk/tickets")).status).toBe(200);
    expect((await reader.call("GET", `/api/helpdesk/tickets/${ticketA}`)).status).toBe(200);

    const after = await snapshot();
    expect(after, "a refused write still changed the database").toBe(before);
  }, 60_000);

  it("separates working a ticket from deciding who owns it, and writes nothing when it refuses", async () => {
    const before = await snapshot();

    // Assignment on update.
    const patch = await worker.call("PATCH", `/api/helpdesk/tickets/${ticketA}`, { assigneeId: shastaAgentId });
    expect(patch.status).toBe(403);
    expect(patch.json["permission"]).toBe("support.assign");

    // Creation must not be a way around the same check.
    const create = await worker.call("POST", "/api/helpdesk/tickets", {
      subject: "[CRM-TEST] assigned on the way in", contactId: contactA,
      channel: "email", priority: "normal", assigneeId: shastaAgentId,
    });
    expect(create.status).toBe(403);
    expect(create.json["permission"]).toBe("support.assign");

    expect(await snapshot(), "a refused assignment still changed the database").toBe(before);

    // The same person may still do the part they are allowed to do.
    const allowed = await worker.call("PATCH", `/api/helpdesk/tickets/${ticketA}`, { priority: "high" });
    expect(allowed.status).toBe(200);
    expect(allowed.json["priority"]).toBe("high");
  }, 60_000);

  it("separates an internal note from a customer-visible reply", async () => {
    const before = await snapshot();

    const reply = await worker.call("POST", `/api/helpdesk/tickets/${ticketA}/messages`, {
      body: "[CRM-TEST] a reply the worker may not send",
      authorType: "agent", authorName: "Worker", isInternalNote: false,
    });
    expect(reply.status).toBe(403);
    expect(reply.json["permission"]).toBe("communications.send");
    expect(await snapshot(), "a refused customer reply was still recorded").toBe(before);

    // An internal note needs only support.write, which this account has.
    const note = await worker.call("POST", `/api/helpdesk/tickets/${ticketA}/messages`, {
      body: "[CRM-TEST] an internal note the worker may write",
      authorType: "agent", authorName: "Worker", isInternalNote: true,
    });
    expect(note.status).toBe(201);
    expect(note.json["isInternalNote"]).toBe(true);

    // An internal note is not contact with the customer, so it must not move
    // the "last contacted" clock or become the customer-facing snippet.
    const [contact] = await db.select().from(schema.helpdeskContactsTable)
      .where(eq(schema.helpdeskContactsTable.id, contactA));
    expect(contact.lastContactedAt, "an internal note claimed we contacted the customer").toBeNull();
    const [ticket] = await db.select().from(schema.helpdeskTicketsTable)
      .where(eq(schema.helpdeskTicketsTable.id, ticketA));
    expect(
      ticket.snippetText ?? "",
      "an internal note became the ticket's customer-facing snippet",
    ).not.toContain("an internal note the worker may write");
  }, 60_000);

  // ── 3. Attribution ────────────────────────────────────────────────────────

  it("attributes each message to the owner who wrote it, not to whoever was first", async () => {
    for (const [who, agent] of [[SHASTA, shasta], [CLAIDY, claidy], [SAISA, saisa]] as const) {
      const res = await agent.call("POST", `/api/helpdesk/tickets/${ticketB}/messages`, {
        body: `[CRM-TEST] note from ${who.name}`,
        authorType: "agent", authorName: who.name, isInternalNote: true,
      });
      expect(res.status).toBe(201);
    }

    const rows = await db.select().from(schema.helpdeskMessagesTable)
      .where(eq(schema.helpdeskMessagesTable.ticketId, ticketB))
      .orderBy(schema.helpdeskMessagesTable.id);

    const authors = rows.map((r) => r.authorName);
    expect(authors).toEqual(["Shasta Greene", "Claidy Taguran", "Saisa Lorraigne"]);
    // Three people, three different names — not one name repeated.
    expect(new Set(authors).size).toBe(3);
    expect(rows.map((r) => r.authorInitials)).toEqual(["SG", "CT", "SL"]);
  }, 60_000);

  it("ignores a request body that names somebody else as the author", async () => {
    const res = await claidy.call("POST", `/api/helpdesk/tickets/${ticketA}/messages`, {
      body: "[CRM-TEST] forged attribution attempt",
      // Claidy is signed in. The body claims Shasta wrote it, and claims the
      // CUSTOMER did — both must be ignored.
      authorType: "customer",
      authorName: "Shasta Greene",
      isInternalNote: true,
    });
    expect(res.status).toBe(201);

    // Asserted on the row Postgres actually holds, not on the response.
    const [row] = await db.select().from(schema.helpdeskMessagesTable)
      .where(eq(schema.helpdeskMessagesTable.id, res.json["id"]));
    expect(row.authorName, "the body's authorName was believed").toBe("Claidy Taguran");
    expect(row.authorInitials).toBe("CT");
    expect(row.authorType, "the body forged a customer statement into a support record").toBe("agent");

    // And nothing anywhere in the stored thread claims Shasta said this.
    const thread = await db.select().from(schema.helpdeskMessagesTable)
      .where(eq(schema.helpdeskMessagesTable.ticketId, ticketA));
    const forged = thread.filter(
      (m) => m.body.includes("forged attribution") && m.authorName === "Shasta Greene"
    );
    expect(forged).toEqual([]);
  }, 60_000);

  // ── 4. Customer isolation ─────────────────────────────────────────────────

  it("keeps one customer's thread out of another customer's ticket", async () => {
    const secret = `[CRM-TEST] customer B only ${STAMP}`;
    const written = await shasta.call("POST", `/api/helpdesk/tickets/${ticketB}/messages`, {
      body: secret, authorType: "agent", authorName: "Shasta Greene", isInternalNote: true,
    });
    expect(written.status).toBe(201);

    // Customer A's thread, read two ways, must not contain it — searched over
    // the whole serialised response rather than one field name.
    const listA = await shasta.call("GET", `/api/helpdesk/tickets/${ticketA}/messages`);
    expect(listA.status).toBe(200);
    expect(listA.text).not.toContain(secret);

    const detailA = await shasta.call("GET", `/api/helpdesk/tickets/${ticketA}`);
    expect(detailA.status).toBe(200);
    expect(detailA.text).not.toContain(secret);
    // Ticket A's detail carries customer A, and no trace of customer B.
    expect(detailA.json["ticket"].contactId).toBe(contactA);
    expect(detailA.text).not.toContain(`helpdesk-customer-b-${STAMP}@example.test`);

    // And it IS on customer B's ticket, so the assertion above is about
    // isolation rather than about the message never being written.
    const listB = await shasta.call("GET", `/api/helpdesk/tickets/${ticketB}/messages`);
    expect(listB.text).toContain(secret);

    // One contact's record does not answer for the other's.
    const contactRes = await shasta.call("GET", `/api/helpdesk/contacts/${contactA}`);
    expect(contactRes.json["id"]).toBe(contactA);
    expect(contactRes.text).not.toContain(`helpdesk-customer-b-${STAMP}@example.test`);
  }, 60_000);

  it("refuses a thread read or write against a ticket that does not exist", async () => {
    expect((await shasta.call("GET", `/api/helpdesk/tickets/${GHOST}/messages`)).status).toBe(404);

    const orphan = await shasta.call("POST", `/api/helpdesk/tickets/${GHOST}/messages`, {
      body: "[CRM-TEST] orphan", authorType: "agent", authorName: "Shasta Greene", isInternalNote: true,
    });
    expect(orphan.status).toBe(404);
    const orphans = await db.select().from(schema.helpdeskMessagesTable)
      .where(eq(schema.helpdeskMessagesTable.ticketId, GHOST));
    expect(orphans, "a message was written against a ticket that does not exist").toEqual([]);

    // A ticket about a contact that does not exist is the same defect, one
    // table over — it used to also bump a non-existent contact's counters.
    const ghost = await shasta.call("POST", "/api/helpdesk/tickets", {
      subject: "[CRM-TEST] ghost", contactId: GHOST, channel: "email", priority: "normal",
    });
    expect(ghost.status).toBe(404);
    const ghosts = await db.select().from(schema.helpdeskTicketsTable)
      .where(eq(schema.helpdeskTicketsTable.contactId, GHOST));
    expect(ghosts, "a ticket was raised about a contact that does not exist").toEqual([]);
  }, 60_000);

  // ── 5. Identity-derived views and counts ─────────────────────────────────

  it("resolves 'my queue' and 'assigned to me' from the session, not a hardcoded agent", async () => {
    const assigned = await shasta.call("PATCH", `/api/helpdesk/tickets/${ticketB}`, {
      assigneeId: shastaAgentId, status: "open",
    });
    expect(assigned.status).toBe(200);

    // Shasta has an agent row, so the ticket is hers.
    const mine = await shasta.call("GET", "/api/helpdesk/tickets?view=mine");
    expect(mine.status).toBe(200);
    expect(mine.json as unknown as any[]).toHaveLength(1);
    expect((mine.json as unknown as any[])[0].id).toBe(ticketB);
    expect((await shasta.call("GET", "/api/helpdesk/stats")).json["assignedToMe"]).toBe(1);

    // Claidy has no agent row, so her queue is empty and her count is zero —
    // not Shasta's ticket, and not the literal 3 this used to return.
    const hers = await claidy.call("GET", "/api/helpdesk/tickets?view=mine");
    expect(hers.status).toBe(200);
    expect(hers.json as unknown as any[]).toEqual([]);
    expect((await claidy.call("GET", "/api/helpdesk/stats")).json["assignedToMe"]).toBe(0);
  }, 60_000);
});
