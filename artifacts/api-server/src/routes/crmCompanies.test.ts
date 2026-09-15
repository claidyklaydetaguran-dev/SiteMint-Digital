/**
 * M7 companies — the record, its people, and everything reached through them.
 *
 * The properties worth testing hardest are the ones a screenshot would hide:
 *
 *   - **A link nobody asked for.** Applying suggestions must link exactly the
 *     contacts the caller listed — never the rest of the group — and applying
 *     the same selection twice must not produce a second company.
 *   - **A half-applied batch.** One bad id in the second group must leave the
 *     first group's company uncreated, not "mostly applied".
 *   - **A figure that is really a failed query.** The company page derives its
 *     deals, projects, tickets, quotes and invoices THROUGH its people, and each
 *     summary states that basis; a record on a contact nobody linked is absent.
 *   - **A refused write that writes anyway.** Every mutating route is called by
 *     somebody without the grant and the database is then checked.
 *   - **A merge that strands money.** Quotes and invoices were not repointed
 *     before M7, so a merge left them on a contact the book stops showing.
 *
 * Gated on CRM_TEST_DATABASE_URL; skipped without it so CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, like, sql } from "drizzle-orm";

// Nothing in this suite may reach a provider.
vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => false,
  staffMailBlockedReason: () => "RESEND_API_KEY is not set in this test run.",
  trySendStaffMail: async () => ({
    sent: false as const, failure: "not_configured" as const, configured: false,
    reason: "RESEND_API_KEY is not set in this test run.",
  }),
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
}));

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "companies-admin-secret-value";
delete process.env.CRM_EMAIL_TEST_MODE;

const STAMP = Date.now();
const OWNER = { email: `companies-owner-${STAMP}@example.test`, name: "[CRM-TEST] Companies Owner", password: "harbour-trellis-7711" };
const OPS = { email: `companies-ops-${STAMP}@example.test`, name: "[CRM-TEST] Companies Ops", password: "lantern-quartz-8822" };
const READONLY = { email: `companies-readonly-${STAMP}@example.test`, name: "[CRM-TEST] Companies Readonly", password: "meridian-basalt-9933" };

/** Every fixture is stamped, because the scratch database is shared with other runs. */
const WORK_DOMAIN = `acme-${STAMP}.test`;
const OTHER_DOMAIN = `globex-${STAMP}.test`;

/**
 * Phone numbers are stamped too, and that is not fussiness.
 *
 * The contact importer matches a row with no email on the LAST TEN DIGITS of
 * its phone number, so a fixture here carrying a tidy "555-0101" is matched by
 * crmContacts.test.ts's CSV and makes that suite fail for a reason that has
 * nothing to do with it. Ten digits derived from this run's stamp cannot
 * collide with another suite's fixtures.
 */
const phone = (n: number) => `+1${String(STAMP).slice(-9)}${n}`;

const suite = TEST_DB ? describe : describe.skip;

class Agent {
  cookie = ""; csrf = "";
  reseed: (() => Promise<void>) | null = null;
  constructor(private baseUrl: () => string, private who: { email: string; password: string } | null = null) {}

  private async raw(method: string, p: string, body?: unknown) {
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
    return { status: res.status, json, text, headers: res.headers };
  }

  async call(method: string, p: string, body?: unknown) {
    const first = await this.raw(method, p, body);
    // Only heal the known external hazard: the account row itself has gone,
    // because neighbouring suites clear crm_staff unqualified.
    if (first.status === 401 && this.reseed && this.who) {
      await this.reseed();
      if (await this.login(this.who) === 200) return this.raw(method, p, body);
    }
    return first;
  }

  async login(who: { email: string; password: string }) {
    const res = await fetch(`${this.baseUrl()}/api/crm/staff/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who.email, password: who.password }),
    });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const data = await res.json().catch(() => ({})) as { csrfToken?: string };
    this.csrf = data.csrfToken ?? "";
    return res.status;
  }
}

suite("companies: the record, its people and its figures (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const owner = new Agent(() => base, OWNER);
  const ops = new Agent(() => base, OPS);
  const readonly = new Agent(() => base, READONLY);

  /** Everything this suite creates, removed in afterAll. */
  const leadIds = new Set<number>();
  const companyIds = new Set<number>();

  async function makeLead(fields: { name: string; email: string; company?: string | null; phone?: string | null }): Promise<number> {
    const [row] = await db.insert(schema.crmLeads).values({
      name: fields.name, email: fields.email,
      company: fields.company ?? undefined, phone: fields.phone ?? undefined,
    }).returning({ id: schema.crmLeads.id });
    leadIds.add(row.id);
    return row.id;
  }

  async function makeCompany(body: Record<string, unknown>): Promise<Record<string, any>> {
    const r = await owner.call("POST", "/api/crm/companies", body);
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    companyIds.add(r.json["company"].id);
    return r.json["company"];
  }

  async function leadRow(id: number) {
    const [row] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, id));
    return row;
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
    const seeds: Array<{ who: typeof OWNER; role: string; revoked?: string[] }> = [
      { who: OWNER, role: "owner" },
      // May read and write contacts and companies; may NOT delete one —
      // `leads.delete` is OWNER_ONLY.
      { who: OPS, role: "operations_manager" },
      // May look at companies and change nothing.
      { who: READONLY, role: "operations_manager", revoked: ["leads.write"] },
    ];

    async function seedStaff(): Promise<void> {
      for (const s of seeds) {
        const [present] = await db.select({ id: schema.crmStaff.id }).from(schema.crmStaff)
          .where(eq(schema.crmStaff.email, s.who.email)).limit(1);
        if (present) { staffIds[s.who.email] = present.id; continue; }
        const [row] = await db.insert(schema.crmStaff).values({
          email: s.who.email, displayName: s.who.name,
          role: s.role as "owner", status: "active",
          passwordHash: await hashPassword(s.who.password), passwordUpdatedAt: new Date(),
          ...(s.revoked ? { revokedPermissions: s.revoked } : {}),
        }).returning();
        staffIds[s.who.email] = row.id;
      }
    }

    await seedStaff();
    for (const agent of [owner, ops, readonly]) agent.reseed = seedStaff;

    expect(await owner.login(OWNER)).toBe(200);
    expect(await ops.login(OPS)).toBe(200);
    expect(await readonly.login(READONLY)).toBe(200);
  }, 120_000);

  afterAll(async () => {
    const ids = [...leadIds];
    if (ids.length) {
      await db.delete(schema.crmQuotes).where(inArray(schema.crmQuotes.leadId, ids));
      await db.delete(schema.crmInvoices).where(inArray(schema.crmInvoices.leadId, ids));
      await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.leadId, ids));
      await db.delete(schema.crmProjects).where(inArray(schema.crmProjects.leadId, ids));
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.leadId, ids));
      await db.delete(schema.crmContactMerges).where(inArray(schema.crmContactMerges.primaryLeadId, ids));
      await db.delete(schema.crmContactMerges).where(inArray(schema.crmContactMerges.mergedLeadId, ids));
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, ids));
      await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, ids));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
    }
    if (companyIds.size) {
      await db.delete(schema.crmCompanies).where(inArray(schema.crmCompanies.id, [...companyIds]));
    }
    await db.delete(schema.crmCompanies).where(like(schema.crmCompanies.name, `%${STAMP}%`));
    await db.delete(schema.crmAdminAuditLog).where(like(schema.crmAdminAuditLog.actor, `%-${STAMP}@example.test`));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Creating a company ────────────────────────────────────────────────────

  let acme: Record<string, any>;

  it("creates a company, normalising the domain and taking it from the website when none is given", async () => {
    acme = await makeCompany({
      name: `  Acme   Widgets ${STAMP} `,
      website: `https://www.${WORK_DOMAIN}/about`,
      industry: "Manufacturing",
      city: "Leeds",
      ownerStaffId: staffIds[OWNER.email],
    });
    expect(acme.name).toBe(`Acme Widgets ${STAMP}`);
    expect(acme.domain).toBe(WORK_DOMAIN);
    expect(acme.peopleCount).toBe(0);
    expect(acme.owner).toMatchObject({ id: staffIds[OWNER.email], displayName: OWNER.name });
    expect(acme.archivedAt).toBeNull();

    const [stored] = await db.select().from(schema.crmCompanies).where(eq(schema.crmCompanies.id, acme.id));
    expect(stored.normalizedName).toBe(`acme widgets ${STAMP}`.toLowerCase());
    expect(stored.createdByStaffId).toBe(staffIds[OWNER.email]);

    const audit = await db.select().from(schema.crmAdminAuditLog)
      .where(and(eq(schema.crmAdminAuditLog.action, "company.created"),
        like(schema.crmAdminAuditLog.target, `company:${acme.id}%`)));
    expect(audit.length, "creating a company is audited").toBeGreaterThan(0);
  });

  it("refuses a name-less company and an unusable domain, and says which field", async () => {
    const noName = await owner.call("POST", "/api/crm/companies", { name: "  " });
    expect(noName.status).toBe(400);
    expect(noName.json["field"]).toBe("name");

    const badDomain = await owner.call("POST", "/api/crm/companies", { name: `Bad Domain ${STAMP}`, domain: "not a domain" });
    expect(badDomain.status).toBe(400);
    expect(badDomain.json["field"]).toBe("domain");

    const scripted = await owner.call("POST", "/api/crm/companies", { name: `Scripted ${STAMP}`, website: "javascript:alert(1)" });
    expect(scripted.status).toBe(400);
    expect(scripted.json["field"]).toBe("website");
  });

  it("warns about a company that already matches, and creates it anyway on confirmation", async () => {
    const clash = await owner.call("POST", "/api/crm/companies", { name: `acme widgets ${STAMP}` });
    expect(clash.status).toBe(409);
    expect(clash.json["code"]).toBe("possible_duplicate");
    expect(clash.json["created"]).toBe(false);
    expect(clash.json["candidates"][0]).toMatchObject({ id: acme.id, matchedOn: ["name"] });

    const byDomain = await owner.call("POST", "/api/crm/companies", { name: `Different Name ${STAMP}`, domain: WORK_DOMAIN });
    expect(byDomain.status).toBe(409);
    expect(byDomain.json["candidates"][0].matchedOn).toEqual(["domain"]);

    // The refusal wrote nothing.
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmCompanies)
      .where(like(schema.crmCompanies.name, `%${STAMP}%`));
    expect(Number(before[0].n)).toBe(1);

    const confirmed = await owner.call("POST", "/api/crm/companies", { name: `acme widgets ${STAMP}`, confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
    companyIds.add(confirmed.json["company"].id);
    expect(confirmed.json["createdDespiteDuplicates"][0].id).toBe(acme.id);

    // Tidy up: this twin is only here to prove the override works.
    const gone = await owner.call("DELETE", `/api/crm/companies/${confirmed.json["company"].id}`);
    expect(gone.status).toBe(200);
  });

  it("refuses every write to somebody without leads.write, and changes nothing", async () => {
    const created = await readonly.call("POST", "/api/crm/companies", { name: `Never Created ${STAMP}` });
    expect(created.status).toBe(403);
    expect(created.json["permission"]).toBe("leads.write");

    const patched = await readonly.call("PATCH", `/api/crm/companies/${acme.id}`, { industry: "Changed By Readonly" });
    expect(patched.status).toBe(403);
    const archived = await readonly.call("POST", `/api/crm/companies/${acme.id}/archive`);
    expect(archived.status).toBe(403);
    const applied = await readonly.call("POST", "/api/crm/companies/suggestions/apply", {
      groups: [{ action: "link", contactIds: [1], companyId: acme.id }],
    });
    expect(applied.status).toBe(403);

    // Reading is still allowed, so the refusals above are about writing.
    const read = await readonly.call("GET", "/api/crm/companies");
    expect(read.status).toBe(200);

    const [stored] = await db.select().from(schema.crmCompanies).where(eq(schema.crmCompanies.id, acme.id));
    expect(stored.industry).toBe("Manufacturing");
    expect(stored.archivedAt).toBeNull();
    const [none] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmCompanies)
      .where(eq(schema.crmCompanies.name, `Never Created ${STAMP}`));
    expect(Number(none.n)).toBe(0);
  });

  // ── Linking people ────────────────────────────────────────────────────────

  const ada = { id: 0, email: `ada-${STAMP}@${WORK_DOMAIN}` };
  const bert = { id: 0, email: `bert-${STAMP}@${WORK_DOMAIN}` };
  const cleo = { id: 0, email: `cleo-${STAMP}@gmail.com` };

  it("links a contact to a company through the contact, and records it on both trails", async () => {
    ada.id = await makeLead({ name: `Ada ${STAMP}`, email: ada.email, company: `Acme Widgets ${STAMP}`, phone: phone(1) });

    const linked = await owner.call("PATCH", `/api/crm/leads/${ada.id}`, { companyId: acme.id });
    expect(linked.status).toBe(200);
    expect(linked.json["lead"].companyId).toBe(acme.id);
    // The typed text is untouched by linking.
    expect(linked.json["lead"].company).toBe(`Acme Widgets ${STAMP}`);

    const detail = await owner.call("GET", `/api/crm/leads/${ada.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json["linkedCompany"]).toMatchObject({ id: acme.id, name: acme.name, domain: WORK_DOMAIN });
    expect(detail.json["lead"].companyName).toBe(acme.name);

    const timeline = (detail.json["activities"] as any[]).map((a) => a.type);
    expect(timeline, "the link is on the contact's own timeline").toContain("company_linked");

    const audit = await db.select().from(schema.crmAdminAuditLog)
      .where(and(eq(schema.crmAdminAuditLog.action, "contact.company.linked"),
        like(schema.crmAdminAuditLog.target, `lead:${ada.id} %`)));
    expect(audit.length).toBeGreaterThan(0);
  });

  it("shows the linked company in the contact list and filters by it", async () => {
    const list = await owner.call("GET", `/api/crm/leads?search=${STAMP}`);
    expect(list.status).toBe(200);
    const row = (list.json["leads"] as any[]).find((l) => l.id === ada.id);
    expect(row.companyName).toBe(acme.name);

    const filtered = await owner.call("GET", `/api/crm/leads?companyId=${acme.id}`);
    expect((filtered.json["leads"] as any[]).map((l) => l.id)).toContain(ada.id);

    bert.id = await makeLead({ name: `Bert ${STAMP}`, email: bert.email, company: `Acme Widgets ${STAMP}` });
    const unlinked = await owner.call("GET", `/api/crm/leads?companyId=none&search=${STAMP}`);
    const unlinkedIds = (unlinked.json["leads"] as any[]).map((l) => l.id);
    expect(unlinkedIds).toContain(bert.id);
    expect(unlinkedIds).not.toContain(ada.id);

    const nonsense = await owner.call("GET", "/api/crm/leads?companyId=acme");
    expect(nonsense.status, "a filter that cannot be read must be refused, not ignored").toBe(400);
  });

  it("finds a contact by the company it is linked to, even when its own text is blank", async () => {
    const blank = await makeLead({ name: `Blank Text ${STAMP}`, email: `blank-${STAMP}@${WORK_DOMAIN}`, company: null });
    await owner.call("PATCH", `/api/crm/leads/${blank}`, { companyId: acme.id });
    const found = await owner.call("GET", `/api/crm/leads?search=${encodeURIComponent(acme.name)}`);
    expect((found.json["leads"] as any[]).map((l) => l.id)).toContain(blank);
    await owner.call("PATCH", `/api/crm/leads/${blank}`, { companyId: null });
  });

  it("refuses a link that names nothing, and a value that is not an id", async () => {
    const missing = await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: 2_000_000_001 });
    expect(missing.status).toBe(400);
    expect(missing.json["field"]).toBe("companyId");

    const rubbish = await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: "acme" });
    expect(rubbish.status).toBe(400);

    expect((await leadRow(bert.id)).companyId, "a refused link must not unlink anybody").toBeNull();
  });

  it("refuses a company change to somebody without leads.write, and leaves the contact alone", async () => {
    const refused = await readonly.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: acme.id });
    expect(refused.status).toBe(403);
    expect(refused.json["permission"]).toBe("leads.write");
    expect((await leadRow(bert.id)).companyId).toBeNull();
  });

  it("unlinks a contact and says so on the timeline", async () => {
    await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: acme.id });
    const unlinked = await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.json["lead"].companyId).toBeNull();

    const detail = await owner.call("GET", `/api/crm/leads/${bert.id}`);
    expect((detail.json["activities"] as any[]).map((a) => a.type)).toContain("company_unlinked");
    expect(detail.json["linkedCompany"]).toBeNull();
  });

  // ── The company record ────────────────────────────────────────────────────

  it("counts only the people who are actually linked, and never a merged-away one", async () => {
    const list = await owner.call("GET", `/api/crm/companies?search=${encodeURIComponent(acme.name)}`);
    expect(list.status).toBe(200);
    const row = (list.json["companies"] as any[]).find((c) => c.id === acme.id);
    expect(row.peopleCount).toBe(1);
    expect(list.json["total"]).toBeGreaterThanOrEqual(1);

    const byDomain = await owner.call("GET", `/api/crm/companies?search=${WORK_DOMAIN}`);
    expect((byDomain.json["companies"] as any[]).map((c) => c.id)).toContain(acme.id);

    const byOwner = await owner.call("GET", `/api/crm/companies?ownerStaffId=${staffIds[OWNER.email]}`);
    expect((byOwner.json["companies"] as any[]).map((c) => c.id)).toContain(acme.id);
    const unowned = await owner.call("GET", "/api/crm/companies?ownerStaffId=none");
    expect((unowned.json["companies"] as any[]).map((c) => c.id)).not.toContain(acme.id);
    const badOwner = await owner.call("GET", "/api/crm/companies?ownerStaffId=me");
    expect(badOwner.status).toBe(400);
  });

  it("derives deals, projects, tickets, quotes and invoices through its people, and states that basis", async () => {
    // Records on a linked contact…
    await db.insert(schema.crmDeals).values({ leadId: ada.id, name: `Acme rebuild ${STAMP}`, value: "4000", stage: "Proposal" });
    await db.insert(schema.crmProjects).values({ leadId: ada.id, name: `Acme site ${STAMP}`, stage: "Design" });
    await db.insert(schema.crmSupportTickets).values({ leadId: ada.id, subject: `Acme cannot log in ${STAMP}`, status: "open" });
    await db.execute(sql`INSERT INTO crm_quotes (lead_id, title, status, total, created_by_label) VALUES (${ada.id}, ${`Acme quote ${STAMP}`}, 'sent', 4000, 'test')`);
    await db.execute(sql`INSERT INTO crm_invoices (lead_id, title, status, total, amount_paid, created_by_label) VALUES (${ada.id}, ${`Acme invoice ${STAMP}`}, 'issued', 1000, 250, 'test')`);
    // …and one on a contact nobody has linked, which must NOT be counted.
    await db.insert(schema.crmDeals).values({ leadId: bert.id, name: `Unlinked deal ${STAMP}`, value: "9999", stage: "Proposal" });

    const r = await owner.call("GET", `/api/crm/companies/${acme.id}`);
    expect(r.status).toBe(200);
    expect((r.json["people"] as any[]).map((p) => p.id)).toEqual([ada.id]);

    const s = r.json["summaries"];
    expect(s.deals.items.map((d: any) => d.name)).toEqual([`Acme rebuild ${STAMP}`]);
    expect(s.deals.items[0].leadName).toBe(`Ada ${STAMP}`);
    expect(s.deals.totals.open).toBe(1);
    expect(Number(s.deals.totals.openValue)).toBe(4000);
    expect(s.projects.items[0].name).toBe(`Acme site ${STAMP}`);
    expect(s.supportTickets.count).toBe(1);
    expect(s.supportTickets.items[0].reference).toMatch(/^TKT|^[A-Z]/);
    expect(s.quotes.items[0].title).toBe(`Acme quote ${STAMP}`);
    expect(s.invoices.items[0].title).toBe(`Acme invoice ${STAMP}`);
    expect(s.invoices.outstandingByCurrency[0]).toMatchObject({ currency: "USD" });
    expect(Number(s.invoices.outstandingByCurrency[0].amount)).toBe(750);
    expect(s.activities.items.length).toBeGreaterThan(0);

    // Every summary says what it is derived from, so a zero can be read.
    for (const key of ["deals", "projects", "supportTickets", "quotes", "invoices", "activities"]) {
      expect(String(s[key].basis).length, key).toBeGreaterThan(20);
      expect(String(s[key].basis), key).toContain("linked to this company");
    }
    // The unlinked contact's deal is somebody else's; it is not this company's.
    expect(JSON.stringify(s.deals.items)).not.toContain(`Unlinked deal ${STAMP}`);
  });

  it("edits a company, and records only what changed", async () => {
    const r = await owner.call("PATCH", `/api/crm/companies/${acme.id}`, { industry: "Widgets", notes: `Checked ${STAMP}` });
    expect(r.status).toBe(200);
    expect(r.json["changed"].sort()).toEqual(["industry", "notes"]);
    expect(r.json["company"].industry).toBe("Widgets");

    const unchanged = await owner.call("PATCH", `/api/crm/companies/${acme.id}`, { industry: "Widgets" });
    expect(unchanged.status).toBe(200);
    expect(unchanged.json["changed"], "an edit that changes nothing is not a change").toEqual([]);

    const notFound = await owner.call("PATCH", "/api/crm/companies/2000000002", { industry: "x" });
    expect(notFound.status).toBe(404);
  });

  // ── Archiving ─────────────────────────────────────────────────────────────

  it("archives a company, hides it from the list by default, and refuses new links to it", async () => {
    const spare = await makeCompany({ name: `Spare Co ${STAMP}` });

    const archived = await owner.call("POST", `/api/crm/companies/${spare.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.json["company"].archivedAt).toBeTruthy();

    const listed = await owner.call("GET", `/api/crm/companies?search=${encodeURIComponent(`Spare Co ${STAMP}`)}`);
    expect((listed.json["companies"] as any[]).map((c) => c.id)).not.toContain(spare.id);
    const withArchived = await owner.call("GET", `/api/crm/companies?search=${encodeURIComponent(`Spare Co ${STAMP}`)}&includeArchived=true`);
    expect((withArchived.json["companies"] as any[]).map((c) => c.id)).toContain(spare.id);

    const refused = await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: spare.id });
    expect(refused.status).toBe(409);
    expect(refused.json["code"]).toBe("company_archived");
    expect((await leadRow(bert.id)).companyId).toBeNull();

    const restored = await owner.call("POST", `/api/crm/companies/${spare.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.json["company"].archivedAt).toBeNull();

    const linked = await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: spare.id });
    expect(linked.status).toBe(200);
    await owner.call("PATCH", `/api/crm/leads/${bert.id}`, { companyId: null });
    await owner.call("DELETE", `/api/crm/companies/${spare.id}`);
  });

  // ── Deleting ──────────────────────────────────────────────────────────────

  it("refuses to delete a company that still has people, and refuses the delete to a non-owner", async () => {
    const forOps = await makeCompany({ name: `Ops Cannot Delete ${STAMP}` });
    const opsTry = await ops.call("DELETE", `/api/crm/companies/${forOps.id}`);
    expect(opsTry.status, "leads.delete is owner-only").toBe(403);
    expect(opsTry.json["permission"]).toBe("leads.delete");

    const withPeople = await owner.call("DELETE", `/api/crm/companies/${acme.id}`);
    expect(withPeople.status).toBe(409);
    expect(withPeople.json["code"]).toBe("has_people");
    expect(withPeople.json["people"]).toBe(1);

    const [still] = await db.select().from(schema.crmCompanies).where(eq(schema.crmCompanies.id, acme.id));
    expect(still, "a refused delete must not delete").toBeDefined();

    const empty = await owner.call("DELETE", `/api/crm/companies/${forOps.id}`);
    expect(empty.status).toBe(200);
    const [gone] = await db.select().from(schema.crmCompanies).where(eq(schema.crmCompanies.id, forOps.id));
    expect(gone).toBeUndefined();
  });

  // ── Suggestions ───────────────────────────────────────────────────────────

  it("groups unlinked contacts by company text and by work email domain, and excludes free mail", async () => {
    cleo.id = await makeLead({ name: `Cleo ${STAMP}`, email: cleo.email, company: `Globex ${STAMP}` });
    const dan = await makeLead({ name: `Dan ${STAMP}`, email: `dan-${STAMP}@${OTHER_DOMAIN}`, company: `Globex ${STAMP}` });
    leadIds.add(dan);

    const r = await owner.call("GET", "/api/crm/companies/suggestions");
    expect(r.status).toBe(200);

    const byName = (r.json["byCompanyName"] as any[]).find((g) => g.label === `Globex ${STAMP}`);
    expect(byName, "two contacts with the same company text are one group").toBeDefined();
    expect(byName.contacts.map((c: any) => c.id).sort()).toEqual([cleo.id, dan].sort());
    expect(byName.companyExists).toBe(false);

    const byDomain = (r.json["byEmailDomain"] as any[]).find((g) => g.label === OTHER_DOMAIN);
    expect(byDomain.contacts.map((c: any) => c.id)).toEqual([dan]);
    expect((r.json["byEmailDomain"] as any[]).some((g) => String(g.label).includes("gmail.com")))
      .toBe(false);

    // A contact already linked is not offered again, in either list.
    const everyContactId = [...(r.json["byCompanyName"] as any[]), ...(r.json["byEmailDomain"] as any[])]
      .flatMap((g) => g.contacts.map((c: any) => c.id));
    expect(everyContactId).not.toContain(ada.id);

    // An existing company is reported against the group that matches it.
    const acmeGroup = (r.json["byEmailDomain"] as any[]).find((g) => g.label === WORK_DOMAIN);
    if (acmeGroup) expect(acmeGroup.matches.map((m: any) => m.id)).toContain(acme.id);
  });

  it("links exactly the contacts the caller listed, and nobody else in the group", async () => {
    const r = await owner.call("POST", "/api/crm/companies/suggestions/apply", {
      groups: [{ action: "create", contactIds: [cleo.id], company: { name: `Globex ${STAMP}`, domain: OTHER_DOMAIN } }],
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const created = r.json["results"][0];
    expect(created.created).toBe(true);
    companyIds.add(created.company.id);
    expect(created.linked.map((l: any) => l.id)).toEqual([cleo.id]);

    expect((await leadRow(cleo.id)).companyId).toBe(created.company.id);
    // Dan was in the same suggestion and was NOT listed, so Dan is untouched.
    const dan = (await db.select().from(schema.crmLeads)
      .where(eq(schema.crmLeads.email, `dan-${STAMP}@${OTHER_DOMAIN}`)))[0];
    expect(dan.companyId, "a contact the caller did not list must not be linked").toBeNull();

    const timeline = await db.select().from(schema.crmActivities)
      .where(and(eq(schema.crmActivities.leadId, cleo.id), eq(schema.crmActivities.type, "company_linked")));
    expect(timeline.length).toBe(1);
  });

  it("applying the same selection twice creates nothing the second time", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmCompanies)
      .where(eq(schema.crmCompanies.name, `Globex ${STAMP}`));

    const again = await owner.call("POST", "/api/crm/companies/suggestions/apply", {
      groups: [{ action: "create", contactIds: [cleo.id], company: { name: `Globex ${STAMP}`, domain: OTHER_DOMAIN } }],
    });
    expect(again.status).toBe(200);
    const result = again.json["results"][0];
    expect(result.created).toBe(false);
    expect(result.linked).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ id: cleo.id, reason: "already_linked" });

    const after = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmCompanies)
      .where(eq(schema.crmCompanies.name, `Globex ${STAMP}`));
    expect(Number(after[0].n), "no second company").toBe(Number(before[0].n));
  });

  it("rolls the whole request back when one group names something that does not exist", async () => {
    const dan = (await db.select().from(schema.crmLeads)
      .where(eq(schema.crmLeads.email, `dan-${STAMP}@${OTHER_DOMAIN}`)))[0];

    const r = await owner.call("POST", "/api/crm/companies/suggestions/apply", {
      groups: [
        { action: "create", contactIds: [dan.id], company: { name: `Rolled Back Co ${STAMP}` } },
        { action: "link", contactIds: [dan.id], companyId: 2_000_000_003 },
      ],
    });
    expect(r.status).toBe(404);
    expect(r.json["applied"]).toBe(false);
    expect(r.json["groupIndex"]).toBe(1);

    const [none] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmCompanies)
      .where(eq(schema.crmCompanies.name, `Rolled Back Co ${STAMP}`));
    expect(Number(none.n), "the first group's company must not survive the second group's refusal").toBe(0);
    expect((await leadRow(dan.id)).companyId).toBeNull();
  });

  it("links a whole group to a company that already exists", async () => {
    const dan = (await db.select().from(schema.crmLeads)
      .where(eq(schema.crmLeads.email, `dan-${STAMP}@${OTHER_DOMAIN}`)))[0];
    const [globex] = await db.select().from(schema.crmCompanies)
      .where(eq(schema.crmCompanies.name, `Globex ${STAMP}`));

    const r = await owner.call("POST", "/api/crm/companies/suggestions/apply", {
      groups: [{ action: "link", contactIds: [dan.id, cleo.id], companyId: globex.id }],
    });
    expect(r.status).toBe(200);
    const result = r.json["results"][0];
    expect(result.linked.map((l: any) => l.id)).toEqual([dan.id]);
    expect(result.skipped.map((s: any) => s.id)).toEqual([cleo.id]);
    expect((await leadRow(dan.id)).companyId).toBe(globex.id);
    expect(r.json["totals"]).toMatchObject({ companiesCreated: 0, contactsLinked: 1, contactsSkipped: 1 });
  });

  // ── Merging contacts ──────────────────────────────────────────────────────

  it("carries the company link through a merge, and moves the quotes and invoices with it", async () => {
    const survivor = await makeLead({ name: `Twin Survivor ${STAMP}`, email: `twin-a-${STAMP}@${WORK_DOMAIN}`, phone: phone(9) });
    const duplicate = await makeLead({ name: `Twin Duplicate ${STAMP}`, email: `twin-b-${STAMP}@${WORK_DOMAIN}`, phone: phone(9) });
    await owner.call("PATCH", `/api/crm/leads/${duplicate}`, { companyId: acme.id });
    await db.execute(sql`INSERT INTO crm_quotes (lead_id, title, status, total, created_by_label) VALUES (${duplicate}, ${`Merged quote ${STAMP}`}, 'sent', 2500, 'test')`);
    await db.execute(sql`INSERT INTO crm_invoices (lead_id, title, status, total, created_by_label) VALUES (${duplicate}, ${`Merged invoice ${STAMP}`}, 'issued', 2500, 'test')`);

    const merged = await owner.call("POST", "/api/crm/contacts/duplicates/merge", {
      primaryId: survivor, duplicateId: duplicate, signal: "name_phone",
    });
    expect(merged.status, JSON.stringify(merged.json)).toBe(200);

    // The survivor had no company; the duplicate's link is carried, like every
    // other field the survivor had left empty.
    expect((await leadRow(survivor)).companyId).toBe(acme.id);

    const quote = await db.execute(sql`SELECT lead_id FROM crm_quotes WHERE title = ${`Merged quote ${STAMP}`}`);
    const quoteRows = (Array.isArray(quote) ? quote : (quote as { rows?: any[] }).rows ?? []) as Array<{ lead_id: number }>;
    expect(Number(quoteRows[0].lead_id), "a merge must not strand a quote").toBe(survivor);

    const invoice = await db.execute(sql`SELECT lead_id FROM crm_invoices WHERE title = ${`Merged invoice ${STAMP}`}`);
    const invoiceRows = (Array.isArray(invoice) ? invoice : (invoice as { rows?: any[] }).rows ?? []) as Array<{ lead_id: number }>;
    expect(Number(invoiceRows[0].lead_id), "a merge must not strand an invoice").toBe(survivor);

    // The merged-away contact is no longer one of the company's people.
    const company = await owner.call("GET", `/api/crm/companies/${acme.id}`);
    const peopleIds = (company.json["people"] as any[]).map((p) => p.id);
    expect(peopleIds).toContain(survivor);
    expect(peopleIds).not.toContain(duplicate);

    const moved = (merged.json["moves"] as any[]).map((m) => m.table);
    expect(moved).toContain("crm_quotes");
    expect(moved).toContain("crm_invoices");
  });

  // ── The signup pipeline's contract is untouched ───────────────────────────

  it("still creates a receptionist signup contact exactly as the pipeline does", async () => {
    // The receptionist signup pipeline inserts these columns and dedupes on
    // lower(email); M7 adds a nullable column and must not disturb it.
    const email = `Signup-${STAMP}@Example.test`;
    const [row] = await db.insert(schema.crmLeads).values({
      name: `Signup Person ${STAMP}`,
      company: `Signup Firm ${STAMP}`,
      phone: phone(7),
      email: email.toLowerCase(),
      source: "AI Receptionist Signup",
      serviceInterest: "AI Receptionist",
      status: "New Inquiry",
      priority: "High",
      tags: ["AI Receptionist"],
      notes: "Signed up for the AI Receptionist.",
    }).returning();
    leadIds.add(row.id);
    expect(row.companyId, "a new contact starts life linked to no company").toBeNull();

    const found = await db.select({ id: schema.crmLeads.id }).from(schema.crmLeads)
      .where(eq(sql`lower(${schema.crmLeads.email})`, email.toLowerCase()));
    expect(found).toHaveLength(1);
  });
});
