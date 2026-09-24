/**
 * The customer portal, against a real database and the real app.
 *
 * One property matters more than every other test in this file combined: a
 * signed-in customer sees their own records and nothing else. So the fixture
 * builds TWO complete customers — each with a project, a deal, a payment, a
 * support ticket carrying an internal note, a granted document and an open
 * document request — and most of what follows is contact A trying, and
 * failing, to reach contact B's file.
 *
 * The refusals are asserted as 404 rather than 403 throughout. A 403 on
 * somebody else's invoice confirms the invoice exists and that the number was
 * worth guessing; 404 says nothing at all.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "portal-admin-secret-value";
// Nothing may reach a real mailbox from a test run. `trySendStaffMail` hands
// the provider nothing at all unless this is the exact string "false".
process.env.CRM_EMAIL_TEST_MODE = "true";
process.env.CRM_PUBLIC_BASE_URL = "https://portal.example.test";

const STAMP = Date.now();
const OWNER = {
  email: `portal-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Portal Owner",
  password: "cardamom-lantern-4417",
};

/** The password both customers set when they accept their invitation. */
const CUSTOMER_PASSWORD = "riverbank-thimble-8823";

/** Text that must never appear in any portal response, in any field. */
const INTERNAL_NOTE_A = "INTERNAL-ONLY-A-margin-is-thin-do-not-discount-further";
const INTERNAL_NOTE_B = "INTERNAL-ONLY-B-chase-their-accounts-payable-again";

const suite = TEST_DB ? describe : describe.skip;

suite("the customer portal (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  let ownerStaffId = 0;

  /** Everything belonging to one customer, so a test can name B's ids. */
  interface Fixture {
    leadId: number;
    email: string;
    projectId: number;
    dealId: number;
    transactionId: number;
    ticketId: number;
    attachmentId: number;
    grantId: number;
    requestId: number;
  }
  let A: Fixture;
  let B: Fixture;

  const attachmentIds: number[] = [];

  // ── Callers ───────────────────────────────────────────────────────────────

  interface Reply { status: number; json: Record<string, any>; text: string; headers: Headers }

  async function call(
    method: string, path: string,
    opts: { cookie?: string; csrfHeader?: string; csrf?: string; body?: unknown } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    if (opts.csrf && opts.csrfHeader) headers[opts.csrfHeader] = opts.csrf;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (a file) */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  /** A CRM staff member: `crm_staff_session` + `x-csrf-token`. */
  class StaffAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-csrf-token", csrf: this.csrf, body });
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

  /** A customer: `crm_portal_session` + `x-portal-csrf`. Nothing shared. */
  class PortalAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-portal-csrf", csrf: this.csrf, body });
    }
    take(res: Response | Headers, csrfToken?: string) {
      const headers = res instanceof Headers ? res : res.headers;
      const set = headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => c.startsWith("crm_portal_session="));
      if (set.length) this.cookie = set.join("; ");
      if (csrfToken) this.csrf = csrfToken;
    }
  }

  const staff = new StaffAgent();
  const portalA = new PortalAgent();
  const portalB = new PortalAgent();

  /** Invite a contact and redeem the token, returning a signed-in caller. */
  async function inviteAndAccept(leadId: number): Promise<PortalAgent> {
    const invited = await staff.call("POST", "/api/crm/portal/invitations", { leadId });
    expect(invited.status, JSON.stringify(invited.json)).toBe(201);
    const token = invited.json["inviteToken"] as string;
    const res = await fetch(`${base}/api/portal/invitations/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: CUSTOMER_PASSWORD }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { csrfToken: string };
    const agent = new PortalAgent();
    agent.take(res.headers, data.csrfToken);
    return agent;
  }

  // ── Fixture ───────────────────────────────────────────────────────────────

  async function buildCustomer(tag: string, internalNote: string): Promise<Fixture> {
    const [lead] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] Portal ${tag}`,
      email: `portal-${tag}-${STAMP}@example.test`,
      status: "Client",
    }).returning();

    const [deal] = await db.insert(schema.crmDeals).values({
      leadId: lead.id, name: `[CRM-TEST] ${tag} rebuild`, value: "9000.00", stage: "Proposal",
    }).returning();

    const [project] = await db.insert(schema.crmProjects).values({
      leadId: lead.id, dealId: deal.id, name: `[CRM-TEST] ${tag} website`,
      stage: "Development", budget: "9000.00",
      // Staff-only fields. None of these may appear in a portal payload.
      nextAction: `INTERNAL-NEXTACTION-${tag}`,
      blockedReason: `INTERNAL-BLOCKED-${tag}`,
      notes: `INTERNAL-NOTES-${tag}`,
    }).returning();

    const [transaction] = await db.insert(schema.crmTransactions).values({
      dealId: deal.id, leadId: lead.id, amount: "3000.00", method: "manual_transfer",
      status: schema.TRANSACTION_RECEIVED_STATUS,
    }).returning();

    const [ticket] = await db.insert(schema.crmSupportTickets).values({
      subject: `[CRM-TEST] ${tag} cannot log in`,
      description: `${tag} says the login page loops.`,
      status: "open", priority: "normal", source: "email",
      leadId: lead.id, projectId: project.id,
      openedByLabel: "[CRM-TEST] importer",
    }).returning();

    await db.insert(schema.crmSupportMessages).values([
      {
        ticketId: ticket.id, visibility: "customer",
        body: `Thanks for letting us know, ${tag}. Looking now.`,
        sentByStaffId: ownerStaffId, sentByLabel: OWNER.name, origin: "staff",
      },
      {
        // The row this whole file exists to keep away from a customer.
        ticketId: ticket.id, visibility: "internal",
        body: internalNote,
        sentByStaffId: ownerStaffId, sentByLabel: OWNER.name, origin: "staff",
      },
    ]);

    const bytes = Buffer.from(`${tag} statement of work — not a signature\n`);
    const [attachment] = await db.insert(schema.crmAttachments).values({
      entityType: "lead", entityId: lead.id,
      filename: `${tag}-scope.txt`, mimeType: "text/plain",
      sizeBytes: bytes.length, storageKey: "db:crm_attachment_blobs",
      uploadedByStaffId: ownerStaffId, uploadedByLabel: OWNER.name,
    }).returning();
    attachmentIds.push(attachment.id);
    await db.insert(schema.crmAttachmentBlobs).values({ attachmentId: attachment.id, bytes });

    const [grant] = await db.insert(schema.crmPortalDocumentGrants).values({
      leadId: lead.id, attachmentId: attachment.id,
      grantedByStaffId: ownerStaffId, grantedByLabel: OWNER.name,
    }).returning();

    const [request] = await db.insert(schema.crmDocumentRequests).values({
      entityType: "lead", entityId: lead.id,
      title: `${tag}: send us your logo files`,
      requestedByStaffId: ownerStaffId, requestedByLabel: OWNER.name,
    }).returning();

    return {
      leadId: lead.id, email: lead.email,
      projectId: project.id, dealId: deal.id, transactionId: transaction.id,
      ticketId: ticket.id, attachmentId: attachment.id, grantId: grant.id,
      requestId: request.id,
    };
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

    // The attempt ledger is shared with staff auth and is NOT truncated by a
    // focused run of this file, so consecutive runs would otherwise accumulate
    // failures into the portal's IP bucket and start answering 429. Only the
    // portal's own namespaced rows are removed.
    await db.delete(schema.crmStaffLoginAttempts)
      .where(sql`${schema.crmStaffLoginAttempts.subject} LIKE 'portal-%'`);

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [row] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    ownerStaffId = row.id;
    expect(await staff.login(OWNER)).toBe(200);

    A = await buildCustomer("AAA", INTERNAL_NOTE_A);
    B = await buildCustomer("BBB", INTERNAL_NOTE_B);
  }, 180_000);

  afterAll(async () => {
    const leadIds = [A?.leadId, B?.leadId].filter((n): n is number => typeof n === "number");
    if (leadIds.length) {
      const tickets = await db.select({ id: schema.crmSupportTickets.id })
        .from(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.leadId, leadIds));
      const ticketIds = tickets.map((t) => t.id);
      if (ticketIds.length) {
        await db.delete(schema.crmSupportMessages).where(inArray(schema.crmSupportMessages.ticketId, ticketIds));
        await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.id, ticketIds));
      }
      const accounts = await db.select({ id: schema.crmPortalAccounts.id })
        .from(schema.crmPortalAccounts).where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      if (accounts.length) {
        await db.delete(schema.crmPortalSessions)
          .where(inArray(schema.crmPortalSessions.portalAccountId, accounts.map((a) => a.id)));
      }
      await db.delete(schema.crmPortalProposalAcceptances)
        .where(inArray(schema.crmPortalProposalAcceptances.leadId, leadIds));
      await db.delete(schema.crmPortalDocumentGrants)
        .where(inArray(schema.crmPortalDocumentGrants.leadId, leadIds));
      await db.delete(schema.crmPortalInvitations)
        .where(inArray(schema.crmPortalInvitations.leadId, leadIds));
      await db.delete(schema.crmPortalAccounts)
        .where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      await db.delete(schema.crmDocumentRequests)
        .where(inArray(schema.crmDocumentRequests.entityId, leadIds));
      if (attachmentIds.length) {
        await db.delete(schema.crmAttachmentBlobs)
          .where(inArray(schema.crmAttachmentBlobs.attachmentId, attachmentIds));
        await db.delete(schema.crmAttachments)
          .where(inArray(schema.crmAttachments.id, attachmentIds));
      }
      await db.delete(schema.crmTransactions).where(inArray(schema.crmTransactions.leadId, leadIds));
      await db.delete(schema.crmProjects).where(inArray(schema.crmProjects.leadId, leadIds));
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.leadId, leadIds));
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    if (ownerStaffId) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, ownerStaffId));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── Invitations ───────────────────────────────────────────────────────────

  it("lets a staff member invite a contact, and the customer redeem it once", async () => {
    const invited = await staff.call("POST", "/api/crm/portal/invitations", { leadId: A.leadId });
    expect(invited.status).toBe(201);
    const token = invited.json["inviteToken"] as string;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    // Nothing was handed to a mail provider, and the route says so rather than
    // pretending it sent.
    expect(invited.json["invitation"].delivery).not.toBe("sent");

    // Only the digest is stored — the raw token cannot be recovered from a row.
    const [row] = await db.select().from(schema.crmPortalInvitations)
      .where(eq(schema.crmPortalInvitations.id, invited.json["invitation"].id));
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);

    const first = await call("POST", "/api/portal/invitations/accept",
      { body: { token, password: CUSTOMER_PASSWORD } });
    expect(first.status).toBe(201);
    portalA.take(first.headers, first.json["csrfToken"]);
    expect(first.json["contact"].email).toBe(A.email);

    // Single use. The second attempt is refused, and refused identically to a
    // token that never existed.
    const second = await call("POST", "/api/portal/invitations/accept",
      { body: { token, password: CUSTOMER_PASSWORD } });
    const bogus = await call("POST", "/api/portal/invitations/accept",
      { body: { token: "x".repeat(43), password: CUSTOMER_PASSWORD } });
    expect(second.status).toBe(404);
    expect(bogus.status).toBe(404);
    expect(second.text).toBe(bogus.text);
  }, 120_000);

  it("answers a revoked invitation exactly as it answers a made-up one", async () => {
    const invited = await staff.call("POST", "/api/crm/portal/invitations", { leadId: B.leadId });
    expect(invited.status).toBe(201);
    const token = invited.json["inviteToken"] as string;

    const revoked = await staff.call("POST",
      `/api/crm/portal/invitations/${invited.json["invitation"].id}/revoke`, {});
    expect(revoked.status).toBe(200);

    const used = await call("POST", "/api/portal/invitations/accept",
      { body: { token, password: CUSTOMER_PASSWORD } });
    const bogus = await call("POST", "/api/portal/invitations/accept",
      { body: { token: "z".repeat(43), password: CUSTOMER_PASSWORD } });
    expect(used.status).toBe(404);
    expect(used.status).toBe(bogus.status);
    expect(used.text).toBe(bogus.text);
  }, 120_000);

  it("refuses an expired invitation", async () => {
    const invited = await staff.call("POST", "/api/crm/portal/invitations", { leadId: B.leadId });
    const token = invited.json["inviteToken"] as string;
    await db.update(schema.crmPortalInvitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.crmPortalInvitations.id, invited.json["invitation"].id));

    const expired = await call("POST", "/api/portal/invitations/accept",
      { body: { token, password: CUSTOMER_PASSWORD } });
    expect(expired.status).toBe(404);
  }, 120_000);

  it("signs contact B in, so the isolation tests have two real customers", async () => {
    const agent = await inviteAndAccept(B.leadId);
    portalB.cookie = agent.cookie;
    portalB.csrf = agent.csrf;
    const me = await portalB.call("GET", "/api/portal/me");
    expect(me.status).toBe(200);
    expect(me.json["contact"].email).toBe(B.email);
  }, 120_000);

  // ── The two systems never meet ────────────────────────────────────────────

  it("a portal session cannot reach ANY /api/crm/* staff route", async () => {
    // Reads as well as writes: a 401 on a GET is the proof that the portal
    // cookie is not merely unprivileged but invisible to the staff gate.
    const reads = [
      "/api/crm/leads",
      "/api/crm/projects",
      "/api/crm/support/tickets",
      "/api/crm/documents?entityType=lead&entityId=1",
      `/api/crm/portal/invitations?leadId=${A.leadId}`,
      `/api/crm/portal/document-grants?leadId=${A.leadId}`,
      "/api/crm/my-day",
      "/api/crm/operations/projects",
      "/api/crm/notifications",
      "/api/crm/sales/forecast",
    ];
    for (const path of reads) {
      // Each path is proven to be a REAL staff route first. Without this, a
      // typo would make the assertion below pass on a 404 from a route that
      // does not exist, and the test would be asserting nothing.
      const asStaff = await staff.call("GET", path);
      expect(asStaff.status, `${path} is not a live staff route`).toBe(200);

      const res = await portalA.call("GET", path);
      expect([401, 403], `${path} answered ${res.status}`).toContain(res.status);
      expect(res.text, `${path} returned data to a customer`).not.toContain("[CRM-TEST] Portal BBB");
    }

    const writes: Array<[string, string, unknown]> = [
      ["POST", "/api/crm/portal/invitations", { leadId: B.leadId }],
      ["POST", "/api/crm/portal/document-grants", { leadId: A.leadId, attachmentId: B.attachmentId }],
      ["POST", `/api/crm/portal/accounts/${B.leadId}/revoke`, {}],
      ["POST", "/api/crm/support/tickets", { leadId: B.leadId, subject: "x", description: "y" }],
      ["POST", `/api/crm/support/tickets/${B.ticketId}/messages`, { body: "x", visibility: "internal" }],
      ["POST", `/api/crm/deals/${B.dealId}/close`, { outcome: "won" }],
      ["DELETE", `/api/crm/leads/${B.leadId}`, undefined],
    ];
    for (const [method, path, body] of writes) {
      const res = await portalA.call(method, path, body);
      expect([401, 403], `${method} ${path} answered ${res.status}`).toContain(res.status);
    }

    // And the records are untouched.
    const [stillThere] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, B.leadId));
    expect(stillThere).toBeDefined();
  }, 120_000);

  it("a CRM staff session cannot be used as a portal session", async () => {
    const asPortal = {
      cookie: staff.cookie, csrfHeader: "x-portal-csrf", csrf: staff.csrf,
    };
    for (const path of ["/api/portal/me", "/api/portal/overview", "/api/portal/tickets", "/api/portal/invoices"]) {
      const res = await call("GET", path, asPortal);
      expect(res.status, `${path} accepted a staff cookie`).toBe(401);
    }
    const write = await call("POST", "/api/portal/tickets", {
      ...asPortal, body: { subject: "staff pretending", body: "should not work" },
    });
    expect(write.status).toBe(401);

    // The staff session itself still works — nothing above weakened it.
    expect((await staff.call("GET", `/api/crm/portal/invitations?leadId=${A.leadId}`)).status).toBe(200);
  }, 120_000);

  it("refuses a portal mutation with no CSRF header, and one carrying the staff token", async () => {
    const bare = await call("POST", "/api/portal/tickets",
      { cookie: portalA.cookie, body: { subject: "no csrf", body: "should fail" } });
    expect(bare.status).toBe(403);

    const wrongToken = await call("POST", "/api/portal/tickets", {
      cookie: portalA.cookie, csrfHeader: "x-portal-csrf", csrf: staff.csrf,
      body: { subject: "staff csrf", body: "should fail" },
    });
    expect(wrongToken.status).toBe(403);
  }, 120_000);

  // ── Record isolation ──────────────────────────────────────────────────────

  it("contact A cannot read contact B's project, document, invoice or ticket — and gets 404", async () => {
    const cross = [
      `/api/portal/projects/${B.projectId}`,
      `/api/portal/documents/${B.attachmentId}/download`,
      `/api/portal/tickets/${B.ticketId}`,
    ];
    for (const path of cross) {
      const res = await portalA.call("GET", path);
      expect(res.status, `${path} answered ${res.status}`).toBe(404);
      // 403 would confirm the record exists. It must not be the answer.
      expect(res.status).not.toBe(403);
    }

    // Invoices have no per-id route by design, so the leak would be in the
    // list: B's payment must be absent from A's.
    const invoices = await portalA.call("GET", "/api/portal/invoices");
    expect(invoices.status).toBe(200);
    const ids = (invoices.json["payments"] as any[]).map((p) => p.id);
    expect(ids).not.toContain(B.transactionId);
    expect(ids).toContain(A.transactionId);

    // The same for every list surface.
    const projects = await portalA.call("GET", "/api/portal/projects");
    expect((projects.json["projects"] as any[]).map((p) => p.id)).not.toContain(B.projectId);
    const documents = await portalA.call("GET", "/api/portal/documents");
    expect((documents.json["documents"] as any[]).map((d) => d.id)).not.toContain(B.attachmentId);
    const tickets = await portalA.call("GET", "/api/portal/tickets");
    expect((tickets.json["tickets"] as any[]).map((t) => t.id)).not.toContain(B.ticketId);
    const proposals = await portalA.call("GET", "/api/portal/proposals");
    expect((proposals.json["proposals"] as any[]).map((p) => p.id)).not.toContain(B.dealId);
  }, 120_000);

  it("cannot be made to write against another contact's records", async () => {
    // A reply on B's ticket.
    const reply = await portalA.call("POST", `/api/portal/tickets/${B.ticketId}/messages`, { body: "hello" });
    expect(reply.status).toBe(404);

    // An upload answering B's document request.
    const upload = await portalA.call("POST", "/api/portal/documents", {
      documentRequestId: B.requestId,
      filename: "trespass.txt", mimeType: "text/plain",
      contentBase64: Buffer.from("nope").toString("base64"),
    });
    expect(upload.status).toBe(404);

    // Accepting B's proposal.
    const accept = await portalA.call("POST", `/api/portal/proposals/${B.dealId}/accept`, { typedName: "A Person" });
    expect(accept.status).toBe(404);

    // A ticket filed against B's project — which would otherwise confirm the
    // project exists from whether the create succeeded.
    const filed = await portalA.call("POST", "/api/portal/tickets", {
      subject: "against someone else's project", body: "should not work", projectId: B.projectId,
    });
    expect(filed.status).toBe(404);

    // Nothing landed.
    const bMessages = await db.select().from(schema.crmSupportMessages)
      .where(eq(schema.crmSupportMessages.ticketId, B.ticketId));
    expect(bMessages.filter((m) => m.body === "hello")).toHaveLength(0);
    const [bRequest] = await db.select().from(schema.crmDocumentRequests)
      .where(eq(schema.crmDocumentRequests.id, B.requestId));
    expect(bRequest.status).toBe("pending");
  }, 120_000);

  it("stops working the moment staff revoke the account", async () => {
    const agent = await inviteAndAccept(A.leadId);
    expect((await agent.call("GET", "/api/portal/me")).status).toBe(200);

    const revoked = await staff.call("POST", `/api/crm/portal/accounts/${A.leadId}/revoke`, {});
    expect(revoked.status).toBe(200);
    expect((await agent.call("GET", "/api/portal/me")).status).toBe(401);
    // A password they still know does not get them back in either.
    const relogin = await call("POST", "/api/portal/login",
      { body: { email: A.email, password: CUSTOMER_PASSWORD } });
    expect(relogin.status).toBe(401);

    // Restore A for the remaining tests.
    const fresh = await inviteAndAccept(A.leadId);
    portalA.cookie = fresh.cookie;
    portalA.csrf = fresh.csrf;
    expect((await portalA.call("GET", "/api/portal/me")).status).toBe(200);
  }, 180_000);

  // ── Internal notes ────────────────────────────────────────────────────────

  it("never exposes an internal support note through ANY portal response", async () => {
    // Every portal surface that touches a ticket, plus the ones that do not —
    // the whole serialised body is searched, not one field, because a leak
    // through a count, a preview or an error message is still a leak.
    const surfaces = [
      "/api/portal/overview",
      "/api/portal/tickets",
      `/api/portal/tickets/${A.ticketId}`,
      "/api/portal/projects",
      "/api/portal/documents",
      "/api/portal/invoices",
      "/api/portal/proposals",
      "/api/portal/me",
    ];
    for (const path of surfaces) {
      const res = await portalA.call("GET", path);
      expect(res.status, path).toBe(200);
      expect(res.text, `${path} leaked A's internal note`).not.toContain(INTERNAL_NOTE_A);
      expect(res.text, `${path} leaked B's internal note`).not.toContain(INTERNAL_NOTE_B);
      // Staff-only project fields travel the same way if they travel at all.
      expect(res.text, `${path} leaked a staff-only project field`).not.toContain("INTERNAL-NEXTACTION");
      expect(res.text, `${path} leaked a staff-only project field`).not.toContain("INTERNAL-BLOCKED");
      expect(res.text, `${path} leaked a staff-only project field`).not.toContain("INTERNAL-NOTES");
    }

    // The customer-visible half of the same thread IS there, so the absence
    // above is a filter and not an empty response.
    const thread = await portalA.call("GET", `/api/portal/tickets/${A.ticketId}`);
    expect(thread.text).toContain("Looking now.");
    expect((thread.json["messages"] as any[]).length).toBe(1);

    // And the count exposed alongside it counts only what the customer can see.
    const list = await portalA.call("GET", "/api/portal/tickets");
    const mine = (list.json["tickets"] as any[]).find((t) => t.id === A.ticketId);
    expect(mine.messageCount).toBe(1);
  }, 120_000);

  it("keeps internal notes out of a ticket a customer raises and replies to", async () => {
    const raised = await portalA.call("POST", "/api/portal/tickets", {
      subject: "[CRM-TEST] please change the hero copy",
      body: "The headline should read differently.",
      requestType: "content_change",
      projectId: A.projectId,
    });
    expect(raised.status).toBe(201);
    const ticketId = raised.json["ticket"].id as number;
    expect(raised.json["ticket"].reference).toMatch(/^SUP-\d{5}$/);

    // Staff add a note nobody outside the office may read.
    await db.insert(schema.crmSupportMessages).values({
      ticketId, visibility: "internal", body: INTERNAL_NOTE_A,
      sentByStaffId: ownerStaffId, sentByLabel: OWNER.name, origin: "staff",
    });

    const view = await portalA.call("GET", `/api/portal/tickets/${ticketId}`);
    expect(view.status).toBe(200);
    expect(view.text).not.toContain(INTERNAL_NOTE_A);
    expect(view.text).toContain("The headline should read differently.");

    const replied = await portalA.call("POST", `/api/portal/tickets/${ticketId}/messages`,
      { body: "Any news on this?" });
    expect(replied.status).toBe(201);

    // A customer's message is recorded as the customer's, and as customer-
    // visible. The database check constraint forbids the other combination.
    const rows = await db.select().from(schema.crmSupportMessages)
      .where(eq(schema.crmSupportMessages.ticketId, ticketId));
    const reply = rows.find((r) => r.body === "Any news on this?");
    expect(reply?.origin).toBe("customer");
    expect(reply?.visibility).toBe("customer");
    expect(reply?.sentByStaffId).toBeNull();

    const after = await portalA.call("GET", `/api/portal/tickets/${ticketId}`);
    expect(after.text).not.toContain(INTERNAL_NOTE_A);

    await db.delete(schema.crmSupportMessages).where(eq(schema.crmSupportMessages.ticketId, ticketId));
    await db.delete(schema.crmSupportTickets).where(eq(schema.crmSupportTickets.id, ticketId));
  }, 120_000);

  // ── Documents ─────────────────────────────────────────────────────────────

  it("lands an upload against the right contact and the right request", async () => {
    const content = "our logo, as requested\n";
    const uploaded = await portalA.call("POST", "/api/portal/documents", {
      documentRequestId: A.requestId,
      filename: "logo-pack.txt", mimeType: "text/plain",
      contentBase64: Buffer.from(content).toString("base64"),
    });
    expect(uploaded.status, JSON.stringify(uploaded.json)).toBe(201);
    const id = uploaded.json["document"].id as number;
    attachmentIds.push(id);
    expect(uploaded.json["satisfiedRequestId"]).toBe(A.requestId);
    expect(uploaded.json["document"].from).toBe("You");

    const [row] = await db.select().from(schema.crmAttachments)
      .where(eq(schema.crmAttachments.id, id));
    expect(row.entityType).toBe("lead");
    expect(row.entityId).toBe(A.leadId);
    // A file from a customer must never read as a file from us.
    expect(row.uploadedByStaffId).toBeNull();
    expect(row.uploadedByLabel).toContain("Customer:");

    const [request] = await db.select().from(schema.crmDocumentRequests)
      .where(eq(schema.crmDocumentRequests.id, A.requestId));
    expect(request.status).toBe("received");
    expect(request.receivedAttachmentId).toBe(id);

    // It is visible to A and to nobody else, because a grant was written.
    const mine = await portalA.call("GET", "/api/portal/documents");
    expect((mine.json["documents"] as any[]).map((d) => d.id)).toContain(id);
    const theirs = await portalB.call("GET", "/api/portal/documents");
    expect((theirs.json["documents"] as any[]).map((d) => d.id)).not.toContain(id);
    expect((await portalB.call("GET", `/api/portal/documents/${id}/download`)).status).toBe(404);
  }, 120_000);

  it("refuses an upload that answers nothing, an oversized one, and an executable type", async () => {
    const noRequest = await portalA.call("POST", "/api/portal/documents", {
      filename: "stray.txt", mimeType: "text/plain",
      contentBase64: Buffer.from("x").toString("base64"),
    });
    expect(noRequest.status).toBe(400);

    const [open] = await db.insert(schema.crmDocumentRequests).values({
      entityType: "lead", entityId: A.leadId, title: "another thing",
      requestedByStaffId: ownerStaffId, requestedByLabel: OWNER.name,
    }).returning();

    const svg = await portalA.call("POST", "/api/portal/documents", {
      documentRequestId: open.id, filename: "x.svg", mimeType: "image/svg+xml",
      contentBase64: Buffer.from("<svg/>").toString("base64"),
    });
    expect(svg.status).toBe(415);

    const huge = await portalA.call("POST", "/api/portal/documents", {
      documentRequestId: open.id, filename: "big.txt", mimeType: "text/plain",
      contentBase64: Buffer.alloc(70 * 1024, 0x61).toString("base64"),
    });
    // Either this route's own cap or the global JSON body limit ahead of it.
    expect([413, 400]).toContain(huge.status);

    await db.delete(schema.crmDocumentRequests).where(eq(schema.crmDocumentRequests.id, open.id));
  }, 120_000);

  it("serves portal downloads as attachments the browser will not execute", async () => {
    const res = await fetch(`${base}/api/portal/documents/${A.attachmentId}/download`, {
      headers: { Cookie: portalA.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toContain("not a signature");
  }, 120_000);

  // ── Proposals ─────────────────────────────────────────────────────────────

  it("records an acceptance and never calls it signed", async () => {
    const before = await portalA.call("GET", "/api/portal/proposals");
    expect(before.status).toBe(200);
    const mine = (before.json["proposals"] as any[]).find((p) => p.id === A.dealId);
    expect(mine.canAccept).toBe(true);
    expect(mine.acceptance).toBeNull();

    const accepted = await portalA.call("POST", `/api/portal/proposals/${A.dealId}/accept`,
      { typedName: "A. Customer" });
    expect(accepted.status).toBe(201);
    expect(accepted.json["acceptance"].signatureStatus).toBe("not_a_signature");
    expect(accepted.json["acceptance"].label).toBe("Accepted by customer");

    // The word "signed" (and its family) must not appear anywhere in any
    // proposal payload, in any field, at any point in the flow.
    const after = await portalA.call("GET", "/api/portal/proposals");
    for (const body of [accepted.text, after.text]) {
      expect(body).toMatch(/not_a_signature/);
      expect(body).not.toMatch(/"signed/i);
      expect(body).not.toMatch(/\bsignedAt\b/);
      expect(body).not.toMatch(/\besignature\b/i);
      expect(body).not.toMatch(/signedBy|isSigned/i);
      // Every occurrence of the word family, read in context, must be one of
      // the three approved forms: the `not_a_signature` value, the
      // `acceptanceIsNotASignature` flag, the `signatureStatus` key that
      // carries them, or a sentence denying that a signature took place.
      for (const hit of body.match(/.{0,40}sign(ed|ature)[a-z]*.{0,40}/gi) ?? []) {
        expect(hit, `a portal payload described something as signed: ${hit}`)
          .toMatch(/not_a_signature|acceptanceIsNotASignature|signatureStatus|not an electronic signature/i);
      }
    }

    // Accepting does not close the deal. That stays a staff act.
    const [deal] = await db.select().from(schema.crmDeals).where(eq(schema.crmDeals.id, A.dealId));
    expect(deal.stage).toBe("Proposal");
    expect(deal.wonAt).toBeNull();

    // A double-click is not two agreements.
    const again = await portalA.call("POST", `/api/portal/proposals/${A.dealId}/accept`,
      { typedName: "A. Customer" });
    expect(again.status).toBe(200);
    expect(again.json["created"]).toBe(false);
    const rows = await db.select().from(schema.crmPortalProposalAcceptances)
      .where(eq(schema.crmPortalProposalAcceptances.dealId, A.dealId));
    expect(rows).toHaveLength(1);
    // The figure agreed to is copied, not referenced.
    expect(Number(rows[0].dealValueAtAcceptance)).toBe(9000);
  }, 120_000);

  it("does not describe an uploaded file as a signature either", async () => {
    const documents = await portalA.call("GET", "/api/portal/documents");
    for (const doc of documents.json["documents"] as any[]) {
      expect(doc.signatureStatus).toBe("not_a_signature");
    }
    expect(documents.text).not.toMatch(/"signed/i);
  }, 120_000);

  // ── Money ─────────────────────────────────────────────────────────────────

  it("shows money received without inventing a balance", async () => {
    const invoices = await portalA.call("GET", "/api/portal/invoices");
    expect(invoices.status).toBe(200);
    expect(invoices.json["totals"].paidToDate).toBe(3000);
    const payment = (invoices.json["payments"] as any[]).find((p) => p.id === A.transactionId);
    expect(payment.settled).toBe(true);
    expect(payment.status).toBe(schema.TRANSACTION_RECEIVED_STATUS);
    expect(String(invoices.json["definitions"].pending)).toMatch(/not a balance owed/i);
  }, 120_000);

  // ── Login ─────────────────────────────────────────────────────────────────

  it("signs a customer back in with their password, and refuses a wrong one identically to an unknown address", async () => {
    const ok = await call("POST", "/api/portal/login",
      { body: { email: A.email, password: CUSTOMER_PASSWORD } });
    expect(ok.status).toBe(200);
    expect(typeof ok.json["csrfToken"]).toBe("string");

    const wrong = await call("POST", "/api/portal/login",
      { body: { email: A.email, password: "not-the-password-at-all" } });
    const unknown = await call("POST", "/api/portal/login",
      { body: { email: `nobody-${STAMP}@example.test`, password: CUSTOMER_PASSWORD } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.text).toBe(unknown.text);
  }, 120_000);

  it("throttles guesses at ONE account without locking out the whole customer base", async () => {
    // The account bucket is what protects a password, and it stays tight.
    const victim = A.email;
    let sawThrottle = false;
    for (let i = 0; i < 10; i++) {
      const res = await call("POST", "/api/portal/login",
        { body: { email: victim, password: `wrong-guess-number-${i}` } });
      if (res.status === 429) { sawThrottle = true; break; }
      expect(res.status).toBe(401);
    }
    expect(sawThrottle, "guessing one password is never throttled").toBe(true);

    // ...and a DIFFERENT customer, from the same address, is unaffected. The
    // staff IP limit of 20 would already have locked this out; behind a proxy
    // every customer shares one address, so that limit would be an outage.
    const other = await call("POST", "/api/portal/login",
      { body: { email: B.email, password: CUSTOMER_PASSWORD } });
    expect(other.status, "one account's failures locked out another customer").toBe(200);

    await db.delete(schema.crmStaffLoginAttempts)
      .where(sql`${schema.crmStaffLoginAttempts.subject} LIKE 'portal-%'`);
  }, 180_000);

  it("ends the session on logout", async () => {
    const agent = await inviteAndAccept(B.leadId);
    expect((await agent.call("GET", "/api/portal/me")).status).toBe(200);
    expect((await agent.call("POST", "/api/portal/logout", {})).status).toBe(200);
    expect((await agent.call("GET", "/api/portal/me")).status).toBe(401);

    // Restore B for anything that runs after this.
    const fresh = await inviteAndAccept(B.leadId);
    portalB.cookie = fresh.cookie;
    portalB.csrf = fresh.csrf;
  }, 180_000);
});
