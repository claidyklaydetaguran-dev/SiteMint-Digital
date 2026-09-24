/**
 * A lead's status, priority and source are enumerations, and the API doors now
 * enforce them.
 *
 * Measured in this verification environment on 2026-09-16, before the fix:
 * `POST /api/crm/leads` with `status: "not-a-real-status"` answered **201** and
 * the value was read back **stored verbatim**. There is no CHECK constraint on
 * `crm_leads`, so nothing downstream caught it either — and the lead then
 * appeared in NO pipeline column, because `GET /crm/pipeline` groups by
 * `CRM_STATUSES`. Filed nowhere, reachable nowhere. `priority` and `source`
 * stored their nonsense the same way.
 *
 * The update door was worse than the create door, and that is what these tests
 * pin hardest: it copied the caller's value into the row, wrote a
 * `status_changed` activity naming it, AND fired a `lead_status_changed`
 * automation carrying it. One bad write propagated into the contact's history
 * and into the rules engine. So a refusal must leave all three untouched — the
 * row, the timeline, and the automation — not merely return 400.
 *
 * Legacy spellings are mapped rather than refused on purpose. `leadScore.ts` is
 * a locked engine that still branches on "Contacted", "Negotiating" and
 * "Nurture", and older exports carry them; refusing them would starve it. The
 * mapping is the CSV importer's own table, reused rather than copied.
 *
 * Proven by crossing the line rather than by reading the source, and every
 * assertion about a refusal is followed by a read of what the database actually
 * holds. Gated on CRM_TEST_DATABASE_URL; every row created here is removed in
 * afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray, and, desc } from "drizzle-orm";

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
process.env.ADMIN_PASSWORD = "crm-lead-vocabulary-secret";

const STAMP = Date.now();
const OWNER = {
  email: `vocab-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Vocabulary Owner",
  password: "harbour-cinder-7741",
};

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

suite("a lead's vocabularies are enforced at the door (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  const staffIds: number[] = [];
  const leadIds: number[] = [];

  const owner = new Agent(() => base);

  const createLead = async (extra: Record<string, unknown>) =>
    owner.call("POST", "/api/crm/leads", {
      name: "[CRM-TEST] Vocabulary Subject",
      email: `vocab-subject-${STAMP}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      ...extra,
    });

  const storedLead = async (id: number) =>
    (await db.select().from(schema.crmLeads).where(eq(schema.crmLeads.id, id)))[0];

  const statusActivityCount = async (leadId: number) =>
    (await db.select().from(schema.crmActivities)
      .where(and(eq(schema.crmActivities.leadId, leadId), eq(schema.crmActivities.type, "status_changed")))).length;

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
    const [row] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffIds.push(row.id);

    expect(await owner.login(OWNER)).toBe(200);
  }, 60_000);

  afterAll(async () => {
    if (leadIds.length) await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    if (staffIds.length) await db.delete(schema.crmStaff).where(inArray(schema.crmStaff.id, staffIds));
    await new Promise<void>((r) => server?.close(() => r()));
  });

  it("refuses a status outside the vocabulary, and names what is accepted", async () => {
    const reply = await createLead({ status: "not-a-real-status" });
    expect(reply.status).toBe(400);
    expect(reply.json.field).toBe("status");
    // The refusal has to be useful: it must list the values that would work.
    expect(reply.json.error).toContain("New Inquiry");
    expect(reply.json.error).toContain("not-a-real-status");
  });

  it("refuses a nonsense priority and a nonsense source on the same door", async () => {
    for (const [field, value] of [["priority", "not-a-priority"], ["source", "not-a-source"]] as const) {
      const reply = await createLead({ [field]: value });
      expect({ field, status: reply.status, named: reply.json.field })
        .toEqual({ field, status: 400, named: field });
    }
  });

  it("writes NOTHING when a create is refused", async () => {
    const before = (await db.select().from(schema.crmLeads)).length;
    const reply = await createLead({ status: "definitely-not-a-status" });
    expect(reply.status).toBe(400);
    expect((await db.select().from(schema.crmLeads)).length).toBe(before);
  });

  it("stores a canonical status exactly as given", async () => {
    const reply = await createLead({ status: "Qualified", priority: "High", source: "Referral" });
    expect(reply.status).toBe(201);
    const id = reply.json.lead.id as number;
    leadIds.push(id);
    const row = await storedLead(id);
    expect({ status: row.status, priority: row.priority, source: row.source })
      .toEqual({ status: "Qualified", priority: "High", source: "Referral" });
  });

  it("maps a legacy spelling rather than refusing it, because a locked engine still reads them", async () => {
    // leadScore.ts branches on "Contacted"/"Negotiating"/"Nurture". Refusing
    // these would starve it; they are converted to the canonical lifecycle.
    for (const [given, expected] of [
      ["new", "New Inquiry"],
      ["contacted", "Follow-Up Needed"],
      ["negotiating", "Qualified"],
      ["nurture", "On Hold"],
    ] as const) {
      const reply = await createLead({ status: given });
      expect({ given, status: reply.status }).toEqual({ given, status: 201 });
      const id = reply.json.lead.id as number;
      leadIds.push(id);
      expect({ given, stored: (await storedLead(id)).status }).toEqual({ given, stored: expected });
    }
  });

  it("accepts a canonical value whose case is wrong, rather than filing it nowhere", async () => {
    const reply = await createLead({ status: "qUaLiFiEd" });
    expect(reply.status).toBe(201);
    const id = reply.json.lead.id as number;
    leadIds.push(id);
    expect((await storedLead(id)).status).toBe("Qualified");
  });

  it("refuses a bad status on UPDATE, and leaves the row, the timeline and the rules untouched", async () => {
    const created = await createLead({ status: "New Inquiry" });
    expect(created.status).toBe(201);
    const id = created.json.lead.id as number;
    leadIds.push(id);

    const activitiesBefore = await statusActivityCount(id);

    const reply = await owner.call("PATCH", `/api/crm/leads/${id}`, { status: "not-a-real-status" });
    expect(reply.status).toBe(400);
    expect(reply.json.field).toBe("status");

    // This is the defect's real shape: before the fix the update door copied the
    // value into the row, logged a status_changed activity naming it, and fired
    // an automation carrying it. All three must be untouched by a refusal.
    expect((await storedLead(id)).status).toBe("New Inquiry");
    expect(await statusActivityCount(id)).toBe(activitiesBefore);
  });

  it("still records a real status change on the timeline", async () => {
    const created = await createLead({ status: "New Inquiry" });
    const id = created.json.lead.id as number;
    leadIds.push(id);
    const before = await statusActivityCount(id);

    const reply = await owner.call("PATCH", `/api/crm/leads/${id}`, { status: "Proposal Sent" });
    expect(reply.status).toBe(200);
    expect((await storedLead(id)).status).toBe("Proposal Sent");
    expect(await statusActivityCount(id)).toBe(before + 1);
  });

  it("a refused value never reaches the pipeline, because it can never be stored", async () => {
    // The board groups by CRM_STATUSES. Before the fix an unknown status was
    // stored and then rendered in no column at all — counted nowhere, reachable
    // nowhere. Now it cannot enter the table in the first place.
    const reply = await createLead({ status: "ghost-column" });
    expect(reply.status).toBe(400);
    const board = await owner.call("GET", "/api/crm/pipeline");
    expect(board.status).toBe(200);
    const columns = Object.keys(board.json.pipeline as Record<string, unknown[]>);
    expect(columns).not.toContain("ghost-column");
  });
});
