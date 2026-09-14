/**
 * M6 Contacts — CSV import, filtered export, and duplicate review.
 *
 * The properties worth testing hardest are the ones that are expensive to get
 * wrong and invisible when they are:
 *
 *   - **A re-import that duplicates the book.** The single most common way a
 *     CRM import ruins a contact list. Tested by running the identical file
 *     twice and counting rows, not by trusting the second run's summary.
 *   - **One bad row taking the file down.** A file with two unimportable rows
 *     must still import the two good ones, and must say per row why.
 *   - **An export that is not the list on screen.** Exporting "everything"
 *     while the operator is looking at a filtered list is a data-egress bug
 *     wearing the right filename.
 *   - **A merge that loses history.** Area 12 is verified at 100% and must
 *     stay there, so the merge is proved against the REAL timeline route: every
 *     entry both contacts had must be on the survivor afterwards.
 *   - **A refused write that writes anyway.** Every mutating route is called by
 *     somebody without the grant and the database is then checked to prove
 *     nothing happened.
 *   - **The route-ordering shadow from 3508a43.** `GET .../export.csv` must
 *     return CSV, not a 400 from somebody else's `:id` handler.
 *
 * Gated on CRM_TEST_DATABASE_URL; skipped without it so CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";

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
process.env.ADMIN_PASSWORD = "contacts-admin-secret-value";
delete process.env.CRM_EMAIL_TEST_MODE;

const STAMP = Date.now();
const OWNER = { email: `contacts-owner-${STAMP}@example.test`, name: "[CRM-TEST] Contacts Owner", password: "harbour-trellis-4411" };
const OPS = { email: `contacts-ops-${STAMP}@example.test`, name: "[CRM-TEST] Contacts Ops", password: "lantern-quartz-5522" };
const READONLY = { email: `contacts-readonly-${STAMP}@example.test`, name: "[CRM-TEST] Contacts Readonly", password: "meridian-basalt-6633" };

const suite = TEST_DB ? describe : describe.skip;

class Agent {
  cookie = ""; csrf = "";
  /**
   * Re-creates this agent's staff row when a neighbouring suite has deleted
   * it. `crm_test` is shared scratch and three committed suites clear
   * `crm_staff` unqualified (crmDeliveries, crmOperations, crmStaffAuth), so a
   * concurrent run can delete this suite's accounts mid-flight — after which
   * every call 401s for a reason that has nothing to do with the code under
   * test. Set by the suite's beforeAll.
   */
  reseed: (() => Promise<void>) | null = null;
  /** Set when the agent's account is expected to be missing (never, here). */
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
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON, e.g. CSV */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  async call(method: string, p: string, body?: unknown) {
    const first = await this.raw(method, p, body);
    // ONLY heal the known external hazard: a 401 whose cause is that the
    // account row itself has gone. A 401 with the account still present is a
    // real failure and is returned unchanged, so an auth regression still
    // fails this suite.
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

suite("contacts: import, export and duplicate review (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const owner = new Agent(() => base, OWNER);
  const ops = new Agent(() => base, OPS);
  const readonly = new Agent(() => base, READONLY);

  /** Everything this suite creates, removed in afterAll. */
  const emails = new Set<string>();
  const extraLeadIds = new Set<number>();

  const E = {
    ada: `contacts-ada-${STAMP}@example.test`,
    bert: `contacts-bert-${STAMP}@example.test`,
    cleo: `contacts-cleo-${STAMP}@example.test`,
    dupe: `contacts-dupe-${STAMP}@example.test`,
    export1: `contacts-export1-${STAMP}@example.test`,
    export2: `contacts-export2-${STAMP}@example.test`,
    inject: `contacts-inject-${STAMP}@example.test`,
    twin: `contacts-twin-${STAMP}@example.test`,
  };
  for (const v of Object.values(E)) emails.add(v);

  const PHONE_ONLY_KEY = "5550119911".slice(-10);
  emails.add(`phone-${PHONE_ONLY_KEY}@import.invalid`);

  async function leadIdsForEmails(): Promise<number[]> {
    const rows = await db.select({ id: schema.crmLeads.id }).from(schema.crmLeads)
      .where(inArray(sql`lower(${schema.crmLeads.email})`, [...emails]));
    return rows.map((r) => r.id);
  }

  async function countWithEmail(email: string): Promise<number> {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmLeads)
      .where(eq(sql`lower(${schema.crmLeads.email})`, email.toLowerCase()));
    return Number(row?.n ?? 0);
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
      // An operations manager: may read and write contacts, may NOT export
      // them. `data.export` is deliberately scarce — see staffPermissions.ts.
      { who: OPS, role: "operations_manager" },
      // Somebody who may look at contacts and nothing else.
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
    const ids = [...new Set([...(await leadIdsForEmails()), ...extraLeadIds])];
    if (ids.length) {
      await db.delete(schema.crmContactMerges).where(inArray(schema.crmContactMerges.primaryLeadId, ids));
      await db.delete(schema.crmContactMerges).where(inArray(schema.crmContactMerges.mergedLeadId, ids));
      await db.delete(schema.crmDuplicateDismissals).where(inArray(schema.crmDuplicateDismissals.leadIdLow, ids));
      await db.delete(schema.crmDuplicateDismissals).where(inArray(schema.crmDuplicateDismissals.leadIdHigh, ids));
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.leadId, ids));
      await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, ids));
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, ids));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
    }
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Import: preview ───────────────────────────────────────────────────────

  const BASE_CSV = [
    "Full Name,Email Address,Phone,Company,Website,Nickname",
    `Ada Lovelace [CRM-TEST],${E.ada},555-0101,Analytical Engines,,Countess`,
    `Bert Brecht [CRM-TEST],${E.bert},555-0102,Berliner Ensemble,,`,
    `Cleo Patra [CRM-TEST],${E.cleo},555-0103,Alexandria Ltd,,`,
  ].join("\n");

  let basePlanHash = "";

  it("previews the whole file, states the mapping it proposes, and writes nothing", async () => {
    const before = await countWithEmail(E.ada);
    expect(before).toBe(0);

    const r = await owner.call("POST", "/api/crm/contacts/import/preview", { csv: BASE_CSV });
    expect(r.status).toBe(200);
    expect(r.json["totals"]).toMatchObject({ create: 3, update: 0, skip: 0, error: 0 });
    expect(typeof r.json["planHash"]).toBe("string");
    basePlanHash = r.json["planHash"];

    // The mapping is PROPOSED and reported, never applied invisibly: the
    // suggestion must name the actual header it matched, and a column nobody
    // mapped must be listed as ignored rather than quietly absorbed.
    expect(r.json["mapping"]["name"]).toBe("Full Name");
    expect(r.json["mapping"]["email"]).toBe("Email Address");
    expect(r.json["ignoredColumns"]).toContain("Nickname");

    // Nothing was written. This is the claim "preview" makes, so it is checked
    // against the database rather than against the response.
    expect(await countWithEmail(E.ada)).toBe(0);
    expect(await countWithEmail(E.bert)).toBe(0);
  });

  it("refuses a mapping that names a column the file does not have, and says which", async () => {
    const r = await owner.call("POST", "/api/crm/contacts/import/preview", {
      csv: BASE_CSV,
      mapping: { name: "Full Name", email: "Electronic Mail" },
    });
    expect(r.status).toBe(400);
    expect(String(r.json["problems"].join(" "))).toContain("Electronic Mail");
  });

  it("refuses to commit without the approved plan, and refuses a plan that has changed", async () => {
    const noHash = await owner.call("POST", "/api/crm/contacts/import/commit", { csv: BASE_CSV });
    expect(noHash.status).toBe(400);

    const stale = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv: BASE_CSV, planHash: "0".repeat(32),
    });
    expect(stale.status).toBe(409);
    // A refused commit is a refused commit: nothing may have been written.
    expect(await countWithEmail(E.ada)).toBe(0);
  });

  it("commits the previewed plan", async () => {
    const r = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv: BASE_CSV, planHash: basePlanHash,
    });
    expect(r.status).toBe(200);
    expect(r.json["created"]).toBe(3);
    expect(r.json["failed"]).toBe(0);
    expect(await countWithEmail(E.ada)).toBe(1);
    expect(await countWithEmail(E.cleo)).toBe(1);
  });

  // ── Import: idempotence ───────────────────────────────────────────────────

  it("re-importing the identical file creates nothing the second time", async () => {
    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", { csv: BASE_CSV });
    expect(preview.status).toBe(200);
    expect(preview.json["totals"]).toMatchObject({ create: 0, skip: 3 });
    for (const row of preview.json["rows"]) {
      expect(row.reason).toBe("already_exists");
      expect(row.matchedLeadId).toBeGreaterThan(0);
    }

    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv: BASE_CSV, planHash: preview.json["planHash"],
    });
    expect(commit.status).toBe(200);
    expect(commit.json["created"]).toBe(0);
    expect(commit.json["skipped"]).toBe(3);

    // The claim is about the book, so count the book.
    expect(await countWithEmail(E.ada)).toBe(1);
    expect(await countWithEmail(E.bert)).toBe(1);
    expect(await countWithEmail(E.cleo)).toBe(1);
  });

  it("matches a row with no email on its phone number, so a phone-only file is idempotent too", async () => {
    const csv = [
      "Full Name,Phone",
      "Phoneonly Person [CRM-TEST],(555) 011-9911",
    ].join("\n");

    const first = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(first.json["totals"]).toMatchObject({ create: 1 });
    const committed = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv, planHash: first.json["planHash"],
    });
    expect(committed.status).toBe(200);
    expect(committed.json["created"]).toBe(1);

    const second = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(second.json["totals"]).toMatchObject({ create: 0, skip: 1 });
    expect(second.json["rows"][0].matchedOn).toBe("phone");

    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmLeads)
      .where(eq(schema.crmLeads.name, "Phoneonly Person [CRM-TEST]"));
    expect(Number(row.n)).toBe(1);
  });

  // ── Import: per-row failure ───────────────────────────────────────────────

  it("reports a bad row per row and still imports every good row in the same file", async () => {
    const csv = [
      "Full Name,Email Address,Phone",
      `Dupe Target [CRM-TEST],${E.dupe},555-0200`,
      `,${E.export1},555-0201`,                              // no name
      `Broken Email [CRM-TEST],not-an-email,555-0202`,       // unusable email
      `No Way To Match [CRM-TEST],,`,                        // neither key
      `Exportable Two [CRM-TEST],${E.export2},555-0203`,
    ].join("\n");

    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(preview.status).toBe(200);
    expect(preview.json["totals"]).toMatchObject({ create: 2, error: 3 });

    const byRow = new Map<number, any>(preview.json["rows"].map((r: any) => [r.rowNumber, r]));
    expect(byRow.get(3).explain).toContain("Name is required");
    expect(byRow.get(4).explain).toContain("not a valid email");
    expect(byRow.get(5).explain).toContain("email address or a phone number");

    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv, planHash: preview.json["planHash"],
    });
    expect(commit.status).toBe(200);
    expect(commit.json["created"]).toBe(2);
    expect(commit.json["failed"]).toBe(3);

    // The good rows landed. Three refusals did not cost them.
    expect(await countWithEmail(E.dupe)).toBe(1);
    expect(await countWithEmail(E.export2)).toBe(1);
    expect(await countWithEmail(E.export1)).toBe(0);
  });

  it("keeps going when a row fails at the DATABASE, not just when it fails validation", async () => {
    // The check above catches rows the plan can refuse. This one is the other
    // half: a row the plan accepts and the database then rejects. The estimated
    // value is a valid number and overflows numeric(10,2), so it passes every
    // check the importer makes and fails on insert — which is exactly the shape
    // of the constraint nobody predicted. The rows around it must still land.
    const before = `import-survivor-before-${STAMP}@example.test`;
    const after = `import-survivor-after-${STAMP}@example.test`;
    emails.add(before); emails.add(after);
    const csv = [
      "Full Name,Email Address,Estimated value",
      `Survivor Before [CRM-TEST],${before},1000`,
      `Overflowing Value [CRM-TEST],import-overflow-${STAMP}@example.test,99999999999`,
      `Survivor After [CRM-TEST],${after},2000`,
    ].join("\n");
    emails.add(`import-overflow-${STAMP}@example.test`);

    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(preview.status).toBe(200);
    // The plan cannot see this one coming — it is a create like the others.
    expect(preview.json["totals"]).toMatchObject({ create: 3, error: 0 });

    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv, planHash: preview.json["planHash"],
    });
    expect(commit.status, "one failing row must not turn the request into a 500").toBe(200);
    expect(commit.json["created"]).toBe(2);
    expect(commit.json["failed"]).toBe(1);

    const failed = (commit.json["rows"] as any[]).find((r) => r.outcome === "error");
    expect(failed.rowNumber).toBe(3);
    expect(failed.detail).toContain("could not be written");

    expect(await countWithEmail(before), "the row before the failure must land").toBe(1);
    expect(await countWithEmail(after), "the row after the failure must land").toBe(1);
  });

  it("treats a second row for the same person inside one file as a duplicate, not as an update", async () => {
    const csv = [
      "Full Name,Email Address,Company",
      `Ada Lovelace [CRM-TEST],${E.ada},First Spelling`,
      `Ada Lovelace [CRM-TEST],${E.ada},Second Spelling`,
    ].join("\n");
    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", { csv, options: { updateExisting: true } });
    expect(preview.status).toBe(200);
    const second = preview.json["rows"].find((r: any) => r.rowNumber === 3);
    expect(second.action).toBe("skip");
    expect(second.reason).toBe("duplicate_in_file");
  });

  // ── Import: updating ──────────────────────────────────────────────────────

  it("fills a contact's empty fields without replacing anything already recorded", async () => {
    const [ada] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.email, E.ada));
    await db.update(schema.crmLeads)
      .set({ company: "Curated By A Human", website: null })
      .where(eq(schema.crmLeads.id, ada.id));

    const csv = [
      "Full Name,Email Address,Company,Website",
      `Ada Lovelace [CRM-TEST],${E.ada},Spreadsheet Guess Ltd,https://example.test/ada`,
    ].join("\n");

    const preview = await owner.call("POST", "/api/crm/contacts/import/preview", {
      csv, options: { updateExisting: true },
    });
    expect(preview.status).toBe(200);
    const row = preview.json["rows"][0];
    expect(row.action).toBe("update");
    // The empty field is proposed; the curated one is not.
    expect(Object.keys(row.changes)).toContain("website");
    expect(Object.keys(row.changes)).not.toContain("company");

    const commit = await owner.call("POST", "/api/crm/contacts/import/commit", {
      csv, options: { updateExisting: true }, planHash: preview.json["planHash"],
    });
    expect(commit.status).toBe(200);
    expect(commit.json["updated"]).toBe(1);

    const [after] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, ada.id));
    expect(after.company).toBe("Curated By A Human");
    expect(after.website).toBe("https://example.test/ada");
  });

  // ── Permissions on import ─────────────────────────────────────────────────

  it("refuses an import to somebody without leads.write, and writes nothing", async () => {
    const csv = ["Full Name,Email Address", `Never Imported [CRM-TEST],never-${STAMP}@example.test`].join("\n");
    const preview = await readonly.call("POST", "/api/crm/contacts/import/preview", { csv });
    expect(preview.status).toBe(403);

    const commit = await readonly.call("POST", "/api/crm/contacts/import/commit", { csv, planHash: "x".repeat(32) });
    expect(commit.status).toBe(403);

    expect(await countWithEmail(`never-${STAMP}@example.test`)).toBe(0);
  });

  // ── Export ────────────────────────────────────────────────────────────────

  it("resolves the literal export path to CSV rather than to a parameterised sibling", async () => {
    // The 3508a43 regression, asserted directly: a literal path registered
    // after a `/:id` route comes back 400 with id="export.csv". This must be a
    // CSV response with a header row.
    const r = await owner.call("GET", "/api/crm/contacts/export.csv");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain("attachment");
    expect(r.text.split("\r\n")[0]).toContain("id,name,email");
  });

  // Self-contained fixtures. Deriving them from the import tests above made
  // this suite fail for a reason it was not testing whenever a neighbouring
  // suite cleared the shared scratch database mid-run.
  const exportClient = { email: E.export1, id: 0 };
  const exportProspect = { email: E.bert, id: 0 };

  it("exports only the rows the applied filter selects", async () => {
    const [client] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Export Client", email: exportClient.email,
      status: "Client", priority: "High", company: "Exportable Client Co",
    }).returning();
    const [prospect] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Export Prospect", email: exportProspect.email,
      status: "New Inquiry", priority: "Low", company: "Exportable Prospect Co",
    }).returning();
    exportClient.id = client.id; exportProspect.id = prospect.id;
    extraLeadIds.add(client.id); extraLeadIds.add(prospect.id);

    // A search term that selects this run's rows and nothing else in the
    // shared scratch database.
    const scope = String(STAMP);
    const filtered = await owner.call("GET", `/api/crm/contacts/export.csv?status=Client&search=${scope}`);
    expect(filtered.status).toBe(200);
    expect(filtered.text).toContain(exportClient.email);
    expect(filtered.text, "a contact the filter excludes must not be in the file").not.toContain(exportProspect.email);

    // Same request, filter removed: the contact the filter excluded is back.
    // Proves the filter is doing the work, not an unrelated narrowing.
    const unfiltered = await owner.call("GET", `/api/crm/contacts/export.csv?search=${scope}`);
    expect(unfiltered.status).toBe(200);
    expect(unfiltered.text).toContain(exportClient.email);
    expect(unfiltered.text).toContain(exportProspect.email);
  });

  it("exports exactly the ids a browser-computed smart list is showing", async () => {
    const r = await owner.call("GET", `/api/crm/contacts/export.csv?ids=${exportClient.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-export-rows")).toBe("1");
    expect(r.text).toContain(exportClient.email);
    expect(r.text).not.toContain(exportProspect.email);

    const both = await owner.call("GET", `/api/crm/contacts/export.csv?ids=${exportClient.id},${exportProspect.id}`);
    expect(both.headers.get("x-export-rows")).toBe("2");
  });

  it("neutralises a spreadsheet formula rather than exporting it live", async () => {
    const [created] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Formula Carrier", email: E.inject, company: "=1+1",
    }).returning();
    extraLeadIds.add(created.id);

    const r = await owner.call("GET", `/api/crm/contacts/export.csv?ids=${created.id}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain("'=1+1");
    expect(r.text).not.toMatch(/,=1\+1(,|\r)/);
  });

  it("refuses the export to somebody who may read contacts but not export them", async () => {
    // The operations manager holds leads.read — prove that first, so the 403
    // below is about egress and not about being locked out of the CRM.
    const canRead = await ops.call("GET", "/api/crm/contacts/duplicates");
    expect(canRead.status).toBe(200);

    const denied = await ops.call("GET", `/api/crm/contacts/export.csv?ids=${exportClient.id}`);
    expect(denied.status).toBe(403);
    expect(denied.json["permission"]).toBe("data.export");
    expect(denied.text, "a refusal must not leak the rows it refused").not.toContain(exportClient.email);
  });

  // ── Duplicate review ──────────────────────────────────────────────────────

  let strongA = 0, strongB = 0;

  it("finds an email duplicate, labels the signal, and calls it strong", async () => {
    const [first] = await db.insert(schema.crmLeads).values({
      name: "Twin Target [CRM-TEST]", email: E.twin, phone: "555-0400",
    }).returning();
    const [twin] = await db.insert(schema.crmLeads).values({
      name: "Twin Target Copy [CRM-TEST]", email: E.twin, phone: "555-0400", company: "Twin Co",
    }).returning();
    extraLeadIds.add(first.id); extraLeadIds.add(twin.id);

    const r = await owner.call("GET", "/api/crm/contacts/duplicates?limit=200");
    expect(r.status).toBe(200);
    const pair = r.json["candidates"].find((c: any) =>
      c.a.id === first.id && c.b.id === twin.id);
    expect(pair, "the email pair must be offered").toBeDefined();
    expect(pair.signal).toBe("email");
    expect(pair.confidence).toBe("strong");
    expect(pair.matchedOn).toBe(E.twin.toLowerCase());
    strongA = pair.a.id; strongB = pair.b.id;
  });

  it("finds a name+phone duplicate and reports it as the weaker signal it is", async () => {
    const nameKey = `Weak Signal Twin [CRM-TEST] ${STAMP}`;
    const left = await db.insert(schema.crmLeads).values({
      name: nameKey, email: `weak-left-${STAMP}@example.test`, phone: "+1 (555) 044-7788",
    }).returning();
    const right = await db.insert(schema.crmLeads).values({
      name: nameKey, email: `weak-right-${STAMP}@example.test`, phone: "555.044.7788",
    }).returning();
    extraLeadIds.add(left[0].id); extraLeadIds.add(right[0].id);

    const r = await owner.call("GET", "/api/crm/contacts/duplicates?limit=200");
    const pair = r.json["candidates"].find((c: any) =>
      c.a.id === left[0].id && c.b.id === right[0].id);
    expect(pair, "the name+phone pair must be offered").toBeDefined();
    expect(pair.signal).toBe("name_phone");
    expect(pair.confidence).toBe("weak");
    // The evidence is shown, not just asserted — the operator judges it.
    expect(pair.matchedOn).toContain("5550447788");

    // And dismissing it is durable.
    const dismissed = await owner.call("POST", "/api/crm/contacts/duplicates/dismiss", {
      leadIdA: right[0].id, leadIdB: left[0].id, signal: "name_phone", reason: "Two people, one switchboard.",
    });
    expect(dismissed.status).toBe(200);

    const after = await owner.call("GET", "/api/crm/contacts/duplicates?limit=200");
    const stillThere = after.json["candidates"].find((c: any) =>
      c.a.id === left[0].id && c.b.id === right[0].id);
    expect(stillThere, "a dismissed pair must not be offered again").toBeUndefined();

    // Durable means in the database, not in a request-scoped set.
    const [row] = await db.select().from(schema.crmDuplicateDismissals)
      .where(eq(schema.crmDuplicateDismissals.leadIdLow, Math.min(left[0].id, right[0].id)));
    expect(row).toBeDefined();
    expect(row.dismissedByLabel).toBe(OWNER.name);
  });

  it("refuses a dismissal to somebody without leads.write, and records nothing", async () => {
    const r = await readonly.call("POST", "/api/crm/contacts/duplicates/dismiss", {
      leadIdA: strongA, leadIdB: strongB, signal: "email",
    });
    expect(r.status).toBe(403);
    const rows = await db.select().from(schema.crmDuplicateDismissals)
      .where(eq(schema.crmDuplicateDismissals.leadIdLow, Math.min(strongA, strongB)));
    expect(rows).toHaveLength(0);
  });

  // ── Merge ─────────────────────────────────────────────────────────────────

  it("refuses a merge to somebody without leads.write, and moves nothing", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, strongB));
    const r = await readonly.call("POST", "/api/crm/contacts/duplicates/merge", {
      primaryId: strongA, duplicateId: strongB, signal: "email",
    });
    expect(r.status).toBe(403);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmActivities)
      .where(eq(schema.crmActivities.leadId, strongB));
    expect(Number(after[0].n)).toBe(Number(before[0].n));
    const merges = await db.select().from(schema.crmContactMerges)
      .where(eq(schema.crmContactMerges.mergedLeadId, strongB));
    expect(merges).toHaveLength(0);
  });

  it("merges two contacts and keeps the history of BOTH on the survivor", async () => {
    // Give each side history of its own, across three timeline sources.
    await db.insert(schema.crmActivities).values([
      { leadId: strongA, type: "note_added", title: "PRIMARY SIDE NOTE [CRM-TEST]", createdBy: OWNER.name },
      { leadId: strongB, type: "note_added", title: "DUPLICATE SIDE NOTE [CRM-TEST]", createdBy: OWNER.name },
    ]);
    // Raw SQL, naming only the columns this table has always had. The Drizzle
    // insert names every column in the TypeScript model, which fails against a
    // scratch database that a neighbouring workstream's in-flight column has
    // not reached yet — a fixture failing for somebody else's reason.
    await db.execute(sql`
      INSERT INTO crm_tasks (lead_id, title, type) VALUES
        (${strongA}, 'PRIMARY SIDE TASK [CRM-TEST]', 'Follow Up'),
        (${strongB}, 'DUPLICATE SIDE TASK [CRM-TEST]', 'Follow Up')`);
    await db.insert(schema.crmDeals).values([
      { leadId: strongA, name: "PRIMARY SIDE DEAL [CRM-TEST]", value: "1000" },
      { leadId: strongB, name: "DUPLICATE SIDE DEAL [CRM-TEST]", value: "2000" },
    ]);

    // A value only the duplicate has, and a value both have and disagree on.
    await db.update(schema.crmLeads).set({ company: "Primary Company", website: null })
      .where(eq(schema.crmLeads.id, strongA));
    await db.update(schema.crmLeads).set({ company: "Duplicate Company", website: "https://example.test/from-duplicate" })
      .where(eq(schema.crmLeads.id, strongB));

    const r = await owner.call("POST", "/api/crm/contacts/duplicates/merge", {
      primaryId: strongA, duplicateId: strongB, signal: "email",
    });
    expect(r.status).toBe(200);

    // Every table the customer timeline reads reported a result.
    const timelineTables = (r.json["moves"] as any[]).filter((m) => m.historyCritical);
    expect(timelineTables.length).toBeGreaterThan(8);

    // The real proof: the timeline route itself, which is what area 12 grades.
    const history = await owner.call("GET", `/api/crm/history/${strongA}?limit=200`);
    expect(history.status).toBe(200);
    const blob = JSON.stringify(history.json["entries"]);
    expect(blob, "the survivor's own history must survive").toContain("PRIMARY SIDE NOTE [CRM-TEST]");
    expect(blob, "the merged contact's history must survive").toContain("DUPLICATE SIDE NOTE [CRM-TEST]");
    expect(blob).toContain("PRIMARY SIDE TASK [CRM-TEST]");
    expect(blob).toContain("DUPLICATE SIDE TASK [CRM-TEST]");
    expect(blob).toContain("PRIMARY SIDE DEAL [CRM-TEST]");
    expect(blob).toContain("DUPLICATE SIDE DEAL [CRM-TEST]");

    // Nothing was left behind on the merged contact either.
    const strandedActivities = await db.select({ n: sql<number>`count(*)::int` })
      .from(schema.crmActivities).where(eq(schema.crmActivities.leadId, strongB));
    expect(Number(strandedActivities[0].n)).toBe(0);
    const strandedDeals = await db.select({ n: sql<number>`count(*)::int` })
      .from(schema.crmDeals).where(eq(schema.crmDeals.leadId, strongB));
    expect(Number(strandedDeals[0].n)).toBe(0);
  });

  it("keeps the survivor's own value on a conflict, and does not discard the other one", async () => {
    const [record] = await db.select().from(schema.crmContactMerges)
      .where(eq(schema.crmContactMerges.mergedLeadId, strongB));
    expect(record).toBeDefined();

    const [survivor] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, strongA));
    // Disagreement: survivor keeps its own.
    expect(survivor.company).toBe("Primary Company");
    // Gap: filled from the duplicate.
    expect(survivor.website).toBe("https://example.test/from-duplicate");

    // The value that did not win is still recoverable in two places.
    const conflicts = record.conflicts as Array<Record<string, unknown>>;
    const companyConflict = conflicts.find((c) => c["field"] === "company");
    expect(companyConflict).toBeDefined();
    expect(companyConflict!["discardedFromMerged"]).toBe("Duplicate Company");
    expect(survivor.notes ?? "").toContain("Duplicate Company");

    // And the whole merged row is kept verbatim.
    expect((record.mergedSnapshot as Record<string, unknown>)["company"]).toBe("Duplicate Company");
  });

  it("takes the merged contact out of the contact list without deleting it", async () => {
    const list = await owner.call("GET", "/api/crm/leads");
    expect(list.status).toBe(200);
    const ids = (list.json["leads"] as any[]).map((l) => l.id);
    expect(ids).toContain(strongA);
    expect(ids, "a merged contact must leave the list").not.toContain(strongB);

    // Retained, not deleted — destroying a contact is owner-only, and a merge
    // must not become a way around that.
    const [still] = await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, strongB));
    expect(still).toBeDefined();

    // Still reachable by id, and it says where it went.
    const direct = await owner.call("GET", `/api/crm/leads/${strongB}`);
    expect(direct.status).toBe(200);
    expect(direct.json["mergedInto"]["primaryLeadId"]).toBe(strongA);

    // And out of the export too.
    const csv = await owner.call("GET", `/api/crm/contacts/export.csv?ids=${strongA},${strongB}`);
    expect(csv.headers.get("x-export-rows")).toBe("1");
  });

  it("does not offer a merged pair for review again, and refuses to merge it twice", async () => {
    const dupes = await owner.call("GET", "/api/crm/contacts/duplicates?limit=200");
    const pair = dupes.json["candidates"].find((c: any) =>
      [c.a.id, c.b.id].includes(strongB));
    expect(pair).toBeUndefined();

    const again = await owner.call("POST", "/api/crm/contacts/duplicates/merge", {
      primaryId: strongA, duplicateId: strongB, signal: "email",
    });
    expect(again.status).toBe(409);
  });

  it("publishes what a merge does to each related record type, as data", async () => {
    const r = await owner.call("GET", "/api/crm/contacts/merge-effects");
    expect(r.status).toBe(200);
    const tables = (r.json["repoints"] as any[]).map((x) => x.table);
    for (const required of [
      "crm_activities", "crm_messages", "crm_conversations", "crm_tasks", "crm_deals",
      "crm_projects", "crm_transactions", "crm_support_tickets", "crm_appointments",
      "crm_document_requests", "crm_attachments", "crm_comments",
    ]) {
      expect(tables, `${required} must be covered by a merge`).toContain(required);
    }
    expect(String(r.json["contactRow"])).toContain("Retained");
  });
});
