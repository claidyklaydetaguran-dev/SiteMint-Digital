/**
 * M5 — the campaign flow: can one person send one email without first inventing
 * a reusable audience, and does the screen ever say something untrue?
 *
 * The properties driven here are the ones the M5 rebuild exists to hold, and
 * each is a failure somebody actually hit:
 *
 *   - A campaign could only point at a SAVED segment, so "email these eleven
 *     customers" began by asking for a uniquely-named reusable audience. The
 *     dead end is the defect; a campaign-local filter and a hand-picked list are
 *     the fix, and both must reach a real send.
 *
 *   - A hand-picked list must NOT be a way around suppression. Choosing
 *     somebody by hand is a statement about intent, not about their mailbox: a
 *     contact who unsubscribed is still excluded, with the same reason as
 *     everywhere else.
 *
 *   - A campaign-local filter is a DEFINITION, so it is re-evaluated at send
 *     time. A person who stops matching between writing and sending is left out
 *     without anybody editing anything.
 *
 *   - Nothing is ever pre-selected. A new campaign has no audience, and says so
 *     rather than defaulting to everybody.
 *
 *   - Two people editing one campaign must not silently overwrite each other.
 *     The refusal names who moved it.
 *
 *   - Saving a draft, duplicating, and asking for an AI draft must launch
 *     NOTHING. No recipient rows, no status change, no mail.
 *
 *   - "Scheduled" on a server where nothing starts a scheduled send must be
 *     reported as exactly that, with the blocker named.
 *
 * `lib/staffMail.js` is mocked, as the M4 suite mocks it: NOTHING in this file
 * may put a message in front of a real mail provider.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "marketing-flow-admin-secret-value";
// Autosend stays off for this suite, which is the state the flow has to be
// honest about: a scheduled campaign that nothing will start.
delete process.env.CRM_MARKETING_AUTOSEND_ENABLED;
delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

interface RecordedSend { to: string; subject: string; html?: string; text: string }
const sends: RecordedSend[] = [];

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => false,
  staffMailBlockedReason: () => "Email test mode is on, so mail is simulated rather than sent.",
  trySendStaffMail: async (args: RecordedSend) => {
    sends.push({ to: args.to, subject: args.subject, html: args.html, text: args.text });
    return { sent: true, providerId: `flow-provider-${sends.length}` };
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

const STAMP = Date.now();
const TAG = `flow-test-${STAMP}`;
const ALICE = { email: `flow-alice-${STAMP}@example.test`, name: "[CRM-TEST] Alice Flow", password: "harbour-lantern-7712" };
const BRUNO = { email: `flow-bruno-${STAMP}@example.test`, name: "[CRM-TEST] Bruno Flow", password: "copper-meadow-3318" };

const suite = TEST_DB ? describe : describe.skip;

suite("marketing flow: one email, no segment required (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const leadIds: Record<string, number> = {};
  const addresses: Record<string, string> = {};
  const campaignIds: number[] = [];

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
  const alice = new Agent();
  const bruno = new Agent();

  /** Well-formed copy: every merge token carries a fallback. */
  const goodBlocks = () => ([
    { id: "h", type: "heading", text: "Hi {{first_name|there}}", level: 1, align: "left" },
    { id: "t", type: "text", text: "A short note for {{company|your team}} about your website.", align: "left" },
    { id: "c", type: "button", text: "Book a call", url: "https://sitemintdigital.com/contact", align: "left" },
  ]);

  /** Creates a draft and remembers it for cleanup. */
  const newCampaign = async (body: Record<string, unknown>) => {
    const r = await alice.call("POST", "/api/crm/marketing/campaigns", body);
    if (r.status === 201) campaignIds.push(r.json["campaign"].id);
    return r;
  };

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
    for (const [key, who] of [["alice", ALICE], ["bruno", BRUNO]] as const) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[key] = row.id;
    }
    await alice.login(ALICE);
    await bruno.login(BRUNO);

    const seed: [string, string, string | null, string, string][] = [
      // key     name            company        email                             status
      ["one",   "Ada Lovelace", "Analytic Ltd", `flow-one-${STAMP}@example.test`,   "Qualified"],
      ["two",   "Bo Nakamura",  null,           `flow-two-${STAMP}@example.test`,   "Qualified"],
      ["gone",  "Gil Unsub",    "Gil Co",       `flow-gone-${STAMP}@example.test`,  "Qualified"],
      ["cold",  "Cy Cold",      "Cold Co",      `flow-cold-${STAMP}@example.test`,  "New Inquiry"],
    ];
    for (const [key, name, company, email, status] of seed) {
      const [row] = await db.insert(schema.crmLeads).values({
        name, company, email, status, source: "Manual Entry", tags: [TAG],
      }).returning();
      leadIds[key] = row.id;
      addresses[key] = email.toLowerCase();
    }

    // Gil asked to stop. Choosing him by hand must not undo that.
    await db.insert(schema.crmEmailSuppressions).values({
      address: addresses["gone"], reason: "unsubscribe",
      detail: "Asked to be taken off the list.", source: "staff",
    }).onConflictDoNothing();
  }, 180_000);

  afterAll(async () => {
    const ids = Object.values(leadIds);
    if (ids.length) {
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, ids));
    }
    for (const id of campaignIds) {
      await db.delete(schema.crmMarketingRecipients).where(eq(schema.crmMarketingRecipients.campaignId, id));
      await db.delete(schema.crmMarketingExclusions).where(eq(schema.crmMarketingExclusions.campaignId, id));
      await db.delete(schema.crmMarketingCampaigns).where(eq(schema.crmMarketingCampaigns.id, id));
    }
    await db.delete(schema.crmEmailSuppressions)
      .where(inArray(schema.crmEmailSuppressions.address, Object.values(addresses)));
    if (ids.length) await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── What the screen is allowed to claim ───────────────────────────────────

  it("tells the screen what this server will actually do, in words and without variable names", async () => {
    const r = await alice.call("GET", "/api/crm/marketing/settings");
    expect(r.status).toBe(200);

    // Autosend is off in this suite, and the operator sentence has to say so
    // without naming an environment variable — that detail belongs to whoever
    // administers the server.
    expect(r.json["autosend"].enabled).toBe(false);
    expect(r.json["autosend"].operatorNote).toMatch(/somebody has to open the campaign and press Send/i);
    expect(r.json["autosend"].operatorNote).not.toMatch(/CRM_MARKETING_AUTOSEND_ENABLED/);
    // …and the administrator's version names it exactly.
    expect(r.json["autosend"].adminNote).toMatch(/CRM_MARKETING_AUTOSEND_ENABLED/);
    expect(r.json["autosend"].envVar).toBe("CRM_MARKETING_AUTOSEND_ENABLED");

    expect(r.json["delivery"].configured).toBe(false);
    expect(r.json["delivery"].operatorNote).not.toMatch(/[A-Z_]{6,}/);

    // The addresses a test send may actually reach, rather than a free-text box
    // that refuses whatever is typed into it.
    const emails = (r.json["testAddresses"] as any[]).map((s) => s.email);
    expect(emails).toContain(ALICE.email);
    expect(emails).toContain(BRUNO.email);
  }, 60_000);

  // ── A new campaign has no audience, and never everybody ───────────────────

  it("starts a campaign with nobody selected and says so", async () => {
    const created = await newCampaign({ name: `[CRM-TEST] Empty ${STAMP}`, subject: "Hello" });
    expect(created.status).toBe(201);
    const id = created.json["campaign"].id;

    expect(created.json["campaign"].audienceMode).toBe("segment");
    expect(created.json["campaign"].segmentId).toBeNull();
    expect(created.json["campaign"].audienceLeadIds).toBeNull();

    const check = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/preflight`);
    expect(check.status).toBe(200);
    expect(check.json["audienceSize"]).toBe(0);
    expect(check.json["sendable"]).toBe(0);
    expect(check.json["canSend"]).toBe(false);
    // The refusal offers the three real ways forward rather than demanding a
    // segment, which is the dead end this milestone removed.
    expect(String(JSON.stringify(check.json["blockers"]))).toMatch(/Pick contacts, choose a saved audience, or build a filter/i);
  }, 60_000);

  // ── A hand-picked list, with no segment anywhere ──────────────────────────

  it("sends to contacts chosen by hand, without a saved segment existing", async () => {
    const before = await db.select().from(schema.crmMarketingSegments);
    const created = await newCampaign({
      name: `[CRM-TEST] Hand-picked ${STAMP}`,
      subject: "A question for {{company|your team}}",
      blocks: goodBlocks(),
      audienceMode: "list",
      // Ada and Bo are mailable; Gil unsubscribed and must be excluded even
      // though a person deliberately chose him.
      audienceLeadIds: [leadIds["one"], leadIds["two"], leadIds["gone"]],
    });
    expect(created.status).toBe(201);
    const id = created.json["campaign"].id;
    expect(created.json["campaign"].audienceMode).toBe("list");

    const preview = await alice.call("POST", "/api/crm/marketing/audience/preview", {
      audienceMode: "list",
      audienceLeadIds: [leadIds["one"], leadIds["two"], leadIds["gone"]],
      campaignId: id,
    });
    expect(preview.status).toBe(200);
    expect(preview.json["audienceSize"]).toBe(3);
    expect(preview.json["eligibleCount"]).toBe(2);
    expect(preview.json["excludedCount"]).toBe(1);
    const unsub = (preview.json["excludedByReason"] as any[]).find((b) => b.reason === "unsubscribed");
    expect(unsub.contacts[0].name).toBe("Gil Unsub");
    // A hand-picked list is the one audience that is frozen, and the screen is
    // told so rather than inheriting the segment wording.
    expect(preview.json["reevaluated"]).toBe(false);

    const check = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/preflight`);
    expect(check.json["canSend"]).toBe(true);
    expect(check.json["sendable"]).toBe(2);
    expect(check.json["audience"].mode).toBe("list");

    const sentBefore = sends.length;
    const send = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/send`, {});
    expect(send.status).toBe(200);
    expect(send.json["sent"]).toBe(2);
    expect(send.json["finished"]).toBe(true);
    expect(send.json["campaign"].status).toBe("sent");

    // Gil was chosen by a person and still not mailed.
    const mailed = sends.slice(sentBefore).map((s) => s.to);
    expect(mailed).toContain(addresses["one"]);
    expect(mailed).toContain(addresses["two"]);
    expect(mailed).not.toContain(addresses["gone"]);

    const results = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/results`);
    expect(results.json["counts"].sent).toBe(2);
    expect(results.json["counts"].excluded).toBe(1);
    const reasons = (results.json["excludedByReason"] as any[]).map((b) => b.reason);
    expect(reasons).toEqual(["unsubscribed"]);

    // And the whole journey happened with no segment created.
    const after = await db.select().from(schema.crmMarketingSegments);
    expect(after.length).toBe(before.length);
  }, 120_000);

  // ── A campaign-local filter, re-evaluated at send time ────────────────────

  it("accepts a filter written on the campaign, and re-evaluates it when the send starts", async () => {
    const definition = {
      match: "all",
      conditions: [
        { field: "tag", operator: "has_tag", value: TAG },
        { field: "status", operator: "is", value: "Qualified" },
      ],
    };

    const created = await newCampaign({
      name: `[CRM-TEST] Filter ${STAMP}`,
      subject: "Still worth a look",
      blocks: goodBlocks(),
      audienceMode: "filter",
      audienceDefinition: definition,
    });
    expect(created.status).toBe(201);
    const id = created.json["campaign"].id;

    // Three are Qualified right now: Ada, Bo and Gil.
    const first = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/preflight`);
    expect(first.json["audienceSize"]).toBe(3);
    expect(first.json["sendable"]).toBe(2);
    expect(first.json["audience"].label).toMatch(/Filter — 2 conditions/);

    // Bo stops qualifying between writing and sending. Nobody edits the
    // campaign; the audience is a definition, so it simply resolves differently.
    await db.update(schema.crmLeads).set({ status: "Lost" })
      .where(eq(schema.crmLeads.id, leadIds["two"]));

    const sentBefore = sends.length;
    const send = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/send`, {});
    expect(send.status).toBe(200);
    expect(send.json["sent"]).toBe(1);
    const mailed = sends.slice(sentBefore).map((s) => s.to);
    expect(mailed).toEqual([addresses["one"]]);

    await db.update(schema.crmLeads).set({ status: "Qualified" })
      .where(eq(schema.crmLeads.id, leadIds["two"]));
  }, 120_000);

  it("refuses a filter that is not finished, instead of storing one that matches nobody", async () => {
    const created = await newCampaign({ name: `[CRM-TEST] Bad filter ${STAMP}`, subject: "x" });
    const id = created.json["campaign"].id;

    const bad = await alice.call("PATCH", `/api/crm/marketing/campaigns/${id}`, {
      audienceMode: "filter",
      audienceDefinition: { match: "all", conditions: [{ field: "created_at", operator: "has_tag", value: "x" }] },
    });
    expect(bad.status).toBe(400);
    expect(String(bad.json["error"])).toMatch(/cannot be tested with/i);

    const row = await alice.call("GET", `/api/crm/marketing/campaigns/${id}`);
    expect(row.json["campaign"].audienceDefinition).toBeNull();
  }, 60_000);

  // ── Two people, one campaign ──────────────────────────────────────────────

  it("refuses a save built on a version somebody else has already moved, and names them", async () => {
    const created = await newCampaign({ name: `[CRM-TEST] Shared ${STAMP}`, subject: "First" });
    const id = created.json["campaign"].id;
    const opened = created.json["campaign"].updatedAt;

    // Bruno saves first, from the version both of them opened.
    const brunoSave = await bruno.call("PATCH", `/api/crm/marketing/campaigns/${id}`, {
      subject: "Bruno's subject", expectedUpdatedAt: opened,
    });
    expect(brunoSave.status).toBe(200);

    // Alice is still holding the old stamp.
    const aliceSave = await alice.call("PATCH", `/api/crm/marketing/campaigns/${id}`, {
      subject: "Alice's subject", expectedUpdatedAt: opened,
    });
    expect(aliceSave.status).toBe(409);
    expect(String(aliceSave.json["error"])).toContain(BRUNO.name);
    expect(aliceSave.json["conflict"].by).toBe(BRUNO.name);
    // The refusal carries their version, so the browser can show both.
    expect(aliceSave.json["campaign"].subject).toBe("Bruno's subject");

    // And the refusal wrote nothing.
    const row = await alice.call("GET", `/api/crm/marketing/campaigns/${id}`);
    expect(row.json["campaign"].subject).toBe("Bruno's subject");

    // With the current stamp, the same save goes through.
    const retry = await alice.call("PATCH", `/api/crm/marketing/campaigns/${id}`, {
      subject: "Alice's subject", expectedUpdatedAt: row.json["campaign"].updatedAt,
    });
    expect(retry.status).toBe(200);
    expect(retry.json["campaign"].updatedByLabel).toBe(ALICE.name);
  }, 60_000);

  it("saves one field without resetting another", async () => {
    const created = await newCampaign({
      name: `[CRM-TEST] Partial ${STAMP}`,
      audienceMode: "list",
      audienceLeadIds: [leadIds["one"]],
    });
    const id = created.json["campaign"].id;

    const saved = await alice.call("PATCH", `/api/crm/marketing/campaigns/${id}`, { subject: "Only the subject" });
    expect(saved.status).toBe(200);
    // The audience is untouched by a save that never mentioned it — the bug
    // where autosaving one field silently empties another.
    expect(saved.json["campaign"].audienceMode).toBe("list");
    expect(saved.json["campaign"].audienceLeadIds).toEqual([leadIds["one"]]);
  }, 60_000);

  // ── Nothing launches by accident ──────────────────────────────────────────

  it("launches nothing when a draft is saved, duplicated, or handed to the AI", async () => {
    const created = await newCampaign({
      name: `[CRM-TEST] Quiet ${STAMP}`,
      subject: "Quiet",
      blocks: goodBlocks(),
      audienceMode: "list",
      audienceLeadIds: [leadIds["one"], leadIds["two"]],
    });
    const id = created.json["campaign"].id;
    const sentBefore = sends.length;

    await alice.call("PATCH", `/api/crm/marketing/campaigns/${id}`, { subject: "Quieter" });

    // AI drafting is deliberately unconfigured here, so this is the "not
    // available" path — which must also send nothing and change no status.
    const ai = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/ai-draft`, {
      purpose: "Tell past customers about a new service",
      keyMessage: "We now build booking systems",
      action: "Reply to this email",
    });
    expect([503, 422]).toContain(ai.status);
    expect(String(ai.json["note"] ?? "")).toMatch(/Nothing was written/i);

    const copy = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/duplicate`, {});
    expect(copy.status).toBe(201);
    campaignIds.push(copy.json["campaign"].id);
    expect(copy.json["campaign"].status).toBe("draft");
    expect(copy.json["campaign"].scheduledAt).toBeNull();
    expect(copy.json["campaign"].aiContentState).toBe("none");
    // The copy inherits the audience — that is the point of duplicating.
    expect(copy.json["campaign"].audienceLeadIds).toEqual([leadIds["one"], leadIds["two"]]);

    expect(sends.length).toBe(sentBefore);
    const rows = await db.select().from(schema.crmMarketingRecipients)
      .where(inArray(schema.crmMarketingRecipients.campaignId, [id, copy.json["campaign"].id]));
    expect(rows).toHaveLength(0);

    const after = await alice.call("GET", `/api/crm/marketing/campaigns/${id}`);
    expect(after.json["campaign"].status).toBe("draft");
  }, 60_000);

  // ── Scheduled, on a server that will not start it ─────────────────────────

  it("schedules with an explicit timezone and refuses to imply it will go on its own", async () => {
    const created = await newCampaign({
      name: `[CRM-TEST] Scheduled ${STAMP}`,
      subject: "Next week",
      blocks: goodBlocks(),
      audienceMode: "list",
      audienceLeadIds: [leadIds["one"]],
    });
    const id = created.json["campaign"].id;

    const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const scheduled = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/schedule`, {
      scheduledAt: when, timezone: "America/Los_Angeles",
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.json["campaign"].status).toBe("scheduled");
    expect(scheduled.json["campaign"].scheduledTimezone).toBe("America/Los_Angeles");

    // The honest part: it is scheduled, and nothing on this server will start
    // it. The response says so and names the switch for whoever can change it.
    expect(scheduled.json["autoStarts"]).toBe(false);
    expect(String(scheduled.json["note"])).toMatch(/somebody has to open the campaign and press Send/i);
    expect(scheduled.json["autosendEnvVar"]).toBe("CRM_MARKETING_AUTOSEND_ENABLED");

    // And the list carries the same fact, so a row can be shown as needing
    // attention rather than as a quiet success.
    const list = await alice.call("GET", "/api/crm/marketing/campaigns");
    expect(list.json["autosendEnabled"]).toBe(false);
    const row = (list.json["campaigns"] as any[]).find((c) => c.id === id);
    expect(row.status).toBe("scheduled");
    expect(row.audienceLabel).toBe("1 chosen contact");

    // Unscheduling puts it back to a draft and sends nothing.
    const sentBefore = sends.length;
    const back = await alice.call("POST", `/api/crm/marketing/campaigns/${id}/schedule`, { scheduledAt: null });
    expect(back.status).toBe(200);
    expect(back.json["campaign"].status).toBe("draft");
    expect(sends.length).toBe(sentBefore);
  }, 60_000);

  // ── The contact picker ────────────────────────────────────────────────────

  it("searches contacts and marks the ones a send would drop, with the same reason", async () => {
    const r = await alice.call("GET", `/api/crm/marketing/contacts?search=${encodeURIComponent("flow-")}&limit=50`);
    expect(r.status).toBe(200);
    const byName = new Map((r.json["contacts"] as any[]).map((c) => [c.name, c]));

    expect(byName.get("Ada Lovelace").eligible).toBe(true);
    expect(byName.get("Gil Unsub").eligible).toBe(false);
    expect(byName.get("Gil Unsub").exclusionReason).toBe("unsubscribed");
    expect(String(byName.get("Gil Unsub").exclusionLabel)).toMatch(/asked to stop/i);
  }, 60_000);

  it("names a saved audience when one is used, without making it a prerequisite", async () => {
    const saved = await alice.call("POST", "/api/crm/marketing/segments", {
      name: `[CRM-TEST] Flow segment ${STAMP}`,
      definition: { match: "all", conditions: [{ field: "tag", operator: "has_tag", value: TAG }] },
    });
    expect(saved.status).toBe(201);
    const segmentId = saved.json["segment"].id;

    const created = await newCampaign({
      name: `[CRM-TEST] Segment-mode ${STAMP}`,
      subject: "Hello",
      blocks: goodBlocks(),
      audienceMode: "segment",
      segmentId,
    });
    const id = created.json["campaign"].id;

    const check = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/preflight`);
    expect(check.json["audience"].mode).toBe("segment");
    expect(check.json["audience"].label).toContain("Flow segment");
    expect(check.json["audienceSize"]).toBe(4);

    await db.delete(schema.crmMarketingSegments).where(eq(schema.crmMarketingSegments.id, segmentId));

    // A deleted audience is named as the problem rather than silently
    // resolving to nobody.
    const after = await alice.call("GET", `/api/crm/marketing/campaigns/${id}/preflight`);
    expect(after.json["canSend"]).toBe(false);
    expect(String(JSON.stringify(after.json["blockers"]))).toMatch(/no longer exists/i);
  }, 60_000);
});
