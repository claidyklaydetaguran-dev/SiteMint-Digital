/**
 * The legacy Discovery Portal's data (`/admin/dashboard`, `/admin/submissions/:id`)
 * and who may reach it.
 *
 * Every one of these routes used to be guarded by the shared-password admin's
 * own gate, so a person signed in as themselves was refused 401 — and the page,
 * reading that as "nothing here", showed zeros. They now run through
 * `requireOperator(permission)`.
 *
 * What is proven here is proven by attempting to cross the line rather than by
 * reading the source:
 *
 *   - a staff session reaches the list, one submission and the form inbox;
 *   - the permission is real: a person whose `leads.read`/`leads.write` was
 *     revoked is refused 403, is TOLD which permission, and nothing was written;
 *   - the CSV export needs `data.export`, which an operations manager does not
 *     hold even though they may read and edit the same records;
 *   - a staff mutation needs a valid CSRF header, the refusal is the
 *     machine-readable one, and the row is untouched;
 *   - the legacy shared bearer still works, with no CSRF header, exactly as
 *     before — and stops the moment CRM_LEGACY_BEARER_ENABLED=false.
 *
 * Gated on CRM_TEST_DATABASE_URL. Every row created here is removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray, like } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "discovery-portal-admin-secret";
// Read at request time, so the suite states it rather than inheriting a shell.
delete process.env.CRM_LEGACY_BEARER_ENABLED;

const STAMP = Date.now();
const OWNER = { email: `discovery-owner-${STAMP}@example.test`, name: "[CRM-TEST] Discovery Owner", password: "harbour-cinder-7741" };
const MANAGER = { email: `discovery-manager-${STAMP}@example.test`, name: "[CRM-TEST] Discovery Manager", password: "lantern-basalt-3319" };
const OUTSIDER = { email: `discovery-outsider-${STAMP}@example.test`, name: "[CRM-TEST] Discovery Outsider", password: "meridian-willow-8827" };

const suite = TEST_DB ? describe : describe.skip;

interface Reply { status: number; json: Record<string, any>; text: string; headers: Headers }

class Agent {
  cookie = ""; csrf = "";
  constructor(private baseUrl: () => string) {}
  async call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h["Cookie"] = this.cookie;
    if (this.csrf && !("x-csrf-token" in h)) h["x-csrf-token"] = this.csrf;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${this.baseUrl()}${p}`, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* CSV, or an HTML error */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  async login(who: { email: string; password: string }): Promise<number> {
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

suite("the Discovery Portal's data answers a signed-in person (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: number[] = [];
  let submissionId = 0;
  let formSubmissionId = 0;

  const owner = new Agent(() => base);
  const manager = new Agent(() => base);
  const outsider = new Agent(() => base);
  const anon = new Agent(() => base);

  const LIST = "/api/admin/submissions";
  const EXPORT = "/api/admin/submissions/export/csv";
  const FORMS = "/api/admin/form-submissions";
  const detail = () => `${LIST}/${submissionId}`;
  const form = () => `${FORMS}/${formSubmissionId}`;

  async function submissionRow() {
    const [row] = await db.select().from(schema.discoverySubmissions)
      .where(eq(schema.discoverySubmissions.id, submissionId));
    return row;
  }

  async function legacyBearer(): Promise<Record<string, string>> {
    const { getSessionToken } = await import("../lib/admin-session.js");
    return { Authorization: `Bearer ${getSessionToken()}` };
  }

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
    // Holds leads.read and leads.write by role, but never data.export.
    await create(MANAGER, "operations_manager");
    // Reaches the workspace; the discovery read and write were taken away.
    await create(OUTSIDER, "operations_manager", { revokedPermissions: ["leads.read", "leads.write"] });

    expect(await owner.login(OWNER)).toBe(200);
    expect(await manager.login(MANAGER)).toBe(200);
    expect(await outsider.login(OUTSIDER)).toBe(200);

    const [submission] = await db.insert(schema.discoverySubmissions).values({
      contactName: "[CRM-TEST] Discovery Contact",
      companyName: "[CRM-TEST] Discovery Co",
      email: `discovery-lead-${STAMP}@example.test`,
      phone: "+15005550007",
      industry: "Legal",
      serviceInterest: "new-website",
      budget: "5k-10k",
      timeline: "30-days",
      leadScore: 9,
      status: "New",
      recommendedPackage: "Growth",
      formData: {
        companyName: "[CRM-TEST] Discovery Co",
        contactName: "[CRM-TEST] Discovery Contact",
        email: `discovery-lead-${STAMP}@example.test`,
        services: ["new-website"],
        projectGoals: ["more-leads"],
        budget: "5k-10k",
        timeline: "30-days",
      },
    }).returning();
    submissionId = submission.id;

    const [formRow] = await db.insert(schema.formSubmissions).values({
      formName: "contact",
      name: "[CRM-TEST] Form Person",
      email: `discovery-form-${STAMP}@example.test`,
      formData: { message: "[CRM-TEST] a message" },
    }).returning();
    formSubmissionId = formRow.id;
  }, 120_000);

  afterAll(async () => {
    if (TEST_DB) {
      if (submissionId) {
        await db.delete(schema.discoverySubmissions).where(eq(schema.discoverySubmissions.id, submissionId));
      }
      if (formSubmissionId) {
        await db.delete(schema.formSubmissions).where(eq(schema.formSubmissions.id, formSubmissionId));
      }
      if (staffIds.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
      await db.delete(schema.crmAdminAuditLog).where(like(schema.crmAdminAuditLog.actor, `%-${STAMP}@example.test`));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  // ── Nobody ────────────────────────────────────────────────────────────────

  it("refuses every Discovery Portal route with no credential at all", async () => {
    for (const path of [LIST, detail(), EXPORT, FORMS]) {
      expect((await anon.call("GET", path)).status, path).toBe(401);
    }
    expect((await anon.call("PATCH", detail(), { status: "Closed Won" })).status).toBe(401);
    expect((await anon.call("POST", `${detail()}/proposal`)).status).toBe(401);
    expect((await anon.call("PATCH", form(), { status: "Closed" })).status).toBe(401);
    expect((await submissionRow()).status, "an unauthenticated write landed").toBe("New");
  });

  // ── A signed-in person ────────────────────────────────────────────────────

  it("a staff session reaches the list and one submission, with no bearer token", async () => {
    const list = await owner.call("GET", LIST);
    expect(list.status).toBe(200);
    const rows = list.json["submissions"] as { id: number; companyName: string }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.some((r) => r.id === submissionId), "the submission that exists is missing from the list").toBe(true);

    const one = await owner.call("GET", detail());
    expect(one.status).toBe(200);
    expect(one.json["submission"].companyName).toBe("[CRM-TEST] Discovery Co");
  });

  it("an operations manager may read and edit a submission, but not export the lot", async () => {
    expect((await manager.call("GET", LIST)).status).toBe(200);
    expect((await manager.call("GET", detail())).status).toBe(200);

    const saved = await manager.call("PATCH", detail(), { status: "Reviewed", internalNotes: "[CRM-TEST] seen" });
    expect(saved.status).toBe(200);
    const row = await submissionRow();
    expect(row.status).toBe("Reviewed");
    expect(row.internalNotes).toBe("[CRM-TEST] seen");

    // Bulk egress of customer data is a separate grant.
    const csv = await manager.call("GET", EXPORT);
    expect(csv.status).toBe(403);
    expect(csv.json["permission"]).toBe("data.export");
  });

  it("lets an owner export the CSV, because an owner holds data.export", async () => {
    const csv = await owner.call("GET", EXPORT);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type") ?? "").toContain("text/csv");
    expect(csv.text).toContain("[CRM-TEST] Discovery Co");
  });

  it("refuses a staff member whose grant was taken away, names it, and writes nothing", async () => {
    const before = await submissionRow();

    for (const path of [LIST, detail(), FORMS]) {
      const r = await outsider.call("GET", path);
      expect(r.status, path).toBe(403);
      expect(r.json["permission"], path).toBe("leads.read");
    }

    const patch = await outsider.call("PATCH", detail(), { status: "Closed Won", internalNotes: "[CRM-TEST] forged" });
    expect(patch.status).toBe(403);
    expect(patch.json["permission"]).toBe("leads.write");

    const proposal = await outsider.call("POST", `${detail()}/proposal`);
    expect(proposal.status).toBe(403);
    expect(proposal.json["permission"]).toBe("leads.write");

    const after = await submissionRow();
    expect(after.status, "a 403 that still wrote the status").toBe(before.status);
    expect(after.internalNotes).toBe(before.internalNotes);
    expect(after.generatedProposal, "a 403 that still generated a proposal").toBe(before.generatedProposal);
  });

  it("lets somebody with leads.write generate a proposal, and stores it", async () => {
    const r = await owner.call("POST", `${detail()}/proposal`);
    expect(r.status, r.text.slice(0, 200)).toBe(200);
    expect(typeof r.json["proposal"]).toBe("string");
    const row = await submissionRow();
    expect(row.generatedProposal).toBeTruthy();
    expect(row.status).toBe("Proposal Generated");
  });

  // ── CSRF ──────────────────────────────────────────────────────────────────

  it("refuses a staff write with no valid CSRF header, says why in a readable way, and writes nothing", async () => {
    const before = await submissionRow();

    const missing = await owner.call("PATCH", detail(), { internalNotes: "[CRM-TEST] no token" }, { "x-csrf-token": "" });
    expect(missing.status).toBe(403);
    expect(missing.json["code"], "the client cannot tell this apart from a permission refusal").toBe("csrf_token_invalid");
    expect(missing.json["permission"], "a CSRF refusal is not a permission refusal").toBeUndefined();
    expect(String(missing.json["error"])).not.toMatch(/refresh/i);

    const wrong = await owner.call("PATCH", detail(), { internalNotes: "[CRM-TEST] wrong token" }, {
      "x-csrf-token": "not-the-token-this-session-was-issued",
    });
    expect(wrong.status).toBe(403);
    expect((await submissionRow()).internalNotes, "a refused write landed anyway").toBe(before.internalNotes);

    // ...and with the session's own token it goes through.
    const ok = await owner.call("PATCH", detail(), { internalNotes: "[CRM-TEST] saved properly" });
    expect(ok.status).toBe(200);
    expect((await submissionRow()).internalNotes).toBe("[CRM-TEST] saved properly");
  });

  // ── The form inbox ────────────────────────────────────────────────────────

  it("answers the form inbox to a staff session, and gates its triage on leads.write", async () => {
    const list = await owner.call("GET", FORMS);
    expect(list.status).toBe(200);
    expect((list.json["submissions"] as { id: number }[]).some((r) => r.id === formSubmissionId)).toBe(true);

    const refused = await outsider.call("PATCH", form(), { status: "Closed" });
    expect(refused.status).toBe(403);
    expect(refused.json["permission"]).toBe("leads.write");

    const triaged = await manager.call("PATCH", form(), { status: "Closed", notes: "[CRM-TEST] handled" });
    expect(triaged.status).toBe(200);
    const [row] = await db.select().from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.id, formSubmissionId));
    expect(row.status).toBe("Closed");
    expect(row.notes).toBe("[CRM-TEST] handled");
  });

  // ── The legacy caller keeps working ───────────────────────────────────────

  it("the legacy shared bearer still reaches every one of these routes, with no CSRF header", async () => {
    const bearer = await legacyBearer();
    const legacy = new Agent(() => base); // no cookies at all

    for (const path of [LIST, detail(), EXPORT, FORMS]) {
      expect((await legacy.call("GET", path, undefined, bearer)).status, path).toBe(200);
    }
    const patch = await legacy.call("PATCH", detail(), { internalNotes: "[CRM-TEST] by the shared admin" }, bearer);
    expect(patch.status).toBe(200);
    expect((await submissionRow()).internalNotes).toBe("[CRM-TEST] by the shared admin");
  });

  it("CRM_LEGACY_BEARER_ENABLED=false retires the shared credential here too", async () => {
    const bearer = await legacyBearer();
    const legacy = new Agent(() => base);

    process.env.CRM_LEGACY_BEARER_ENABLED = "false";
    try {
      for (const path of [LIST, detail(), EXPORT, FORMS]) {
        expect((await legacy.call("GET", path, undefined, bearer)).status, path).toBe(401);
      }
      // A real staff session is unaffected by the cutover flag.
      expect((await owner.call("GET", LIST)).status).toBe(200);
      expect((await owner.call("GET", detail())).status).toBe(200);
    } finally {
      delete process.env.CRM_LEGACY_BEARER_ENABLED;
    }
  });
});
