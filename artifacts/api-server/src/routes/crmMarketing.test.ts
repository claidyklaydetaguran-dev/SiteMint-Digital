/**
 * Marketing: who gets the email, who does not, and whether the numbers are true.
 *
 * The properties worth testing hardest are the ones whose failure is invisible
 * until a customer complains:
 *
 *   - a suppressed or unsubscribed address being mailed anyway;
 *   - a segment frozen at save time, so a send goes to the audience of a week
 *     ago rather than the audience of today;
 *   - "Hi ," — a merge token with no fallback, rendered for everybody whose
 *     name we never captured;
 *   - a test send reaching a customer;
 *   - Pause that stops at the end of the current batch of fifty rather than now;
 *   - Cancel that implies it recalled mail it cannot recall;
 *   - AI-written copy going out because nothing actually checked the approval;
 *   - a count on a badge that disagrees with the list behind it.
 *
 * Every one of those is driven here rather than asserted about.
 *
 * `lib/staffMail.js` is mocked, as `crmSchedulerDelivery.test.ts` mocks it: the
 * suite must be able to observe sends without a network, and NOTHING in this
 * file may put a message in front of a real mail provider.
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
process.env.ADMIN_PASSWORD = "marketing-admin-secret-value";
// The AI drafting feature must report itself unavailable rather than
// fabricating a suggestion, so the integration is deliberately unconfigured.
delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

// ── The mail provider, replaced ─────────────────────────────────────────────
//
// Records every attempted send so a send that should not have happened is
// visible, and lets a test reach into the middle of a batch.

interface RecordedSend { to: string; subject: string; html?: string; text: string }
const sends: RecordedSend[] = [];
let blockedReason: string | null = null;
/** Runs before each recorded send resolves — how the pause test lands mid-batch. */
let onSend: ((n: number) => Promise<void>) | null = null;

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => blockedReason === null,
  staffMailBlockedReason: () => blockedReason,
  trySendStaffMail: async (args: RecordedSend) => {
    sends.push({ to: args.to, subject: args.subject, html: args.html, text: args.text });
    if (onSend) await onSend(sends.length);
    return { sent: true, providerId: `test-provider-${sends.length}` };
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

const STAMP = Date.now();
const TAG = `mktg-test-${STAMP}`;
const OWNER = { email: `mktg-owner-${STAMP}@example.test`, name: "[CRM-TEST] Marketing Owner", password: "harbour-trellis-5521" };
const RESTRICTED = { email: `mktg-restricted-${STAMP}@example.test`, name: "[CRM-TEST] Marketing Restricted", password: "verdant-copper-8890" };

const suite = TEST_DB ? describe : describe.skip;

suite("marketing: audience, exclusions, sending, and honest numbers (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const leadIds: Record<string, number> = {};
  const addresses: Record<string, string> = {};
  let segmentId = 0;
  let campaignId = 0;   // the lifecycle campaign
  let gateCampaignId = 0; // the merge/AI-gate campaign

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
  const owner = new Agent();

  /** Blocks with a well-formed greeting: every token carries a fallback. */
  const goodBlocks = () => ([
    { id: "h", type: "heading", text: "Hi {{first_name|there}}", level: 1, align: "left" },
    { id: "t", type: "text", text: "We have been working with businesses like {{company|your business}} on their websites.\n\nWould a short call be useful?", align: "left" },
    { id: "c", type: "button", text: "Book a call", url: "https://sitemintdigital.com/contact", align: "left" },
    { id: "d", type: "divider" },
  ]);

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
    const [ownerRow] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffIds["owner"] = ownerRow.id;

    // An operations manager: campaigns.read and campaigns.write by role,
    // campaigns.send NOT granted by the role, and write revoked per-person —
    // so this account can reach the workspace and change nothing.
    const [restrictedRow] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: RESTRICTED.name,
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["campaigns.write"],
    }).returning();
    staffIds["restricted"] = restrictedRow.id;

    await owner.login(OWNER);

    const seed: [string, string, string | null, string, string][] = [
      // key        name             company        email                                status
      ["ok",       "Dana Okafor",   "Okafor Ltd",  `mktg-ok-${STAMP}@example.test`,      "Qualified"],
      ["plain",    "Rune",          null,          `mktg-plain-${STAMP}@example.test`,   "Qualified"],
      ["supp",     "Bounced Bea",   "Bea Co",      `mktg-supp-${STAMP}@example.test`,    "Qualified"],
      ["unsub",    "Gone Gil",      "Gil Co",      `mktg-unsub-${STAMP}@example.test`,   "Qualified"],
      ["noaddr",   "No Address",    "Nowhere",     `not-an-address-${STAMP}`,            "Qualified"],
      ["excl",     "Left Out",      "Out Co",      `mktg-excl-${STAMP}@example.test`,    "Qualified"],
      ["later",    "Late Lou",      "Lou Co",      `mktg-later-${STAMP}@example.test`,   "New Inquiry"],
      ["drift",    "Drift Dee",     "Dee Co",      `mktg-drift-${STAMP}@example.test`,   "Qualified"],
    ];
    for (const [key, name, company, email, status] of seed) {
      const [row] = await db.insert(schema.crmLeads).values({
        name, company, email, status, source: "Manual Entry", tags: [TAG],
      }).returning();
      leadIds[key] = row.id;
      addresses[key] = email.toLowerCase();
    }

    // A hard bounce, recorded the way the provider webhook records one.
    await db.insert(schema.crmEmailSuppressions).values({
      address: addresses["supp"], reason: "bounce", bounceType: "permanent",
      detail: "Mailbox does not exist.", source: "provider",
    }).onConflictDoNothing();
  }, 180_000);

  afterAll(async () => {
    const ids = Object.values(leadIds);
    if (ids.length) {
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, ids));
    }
    for (const id of [campaignId, gateCampaignId]) {
      if (!id) continue;
      await db.delete(schema.crmMarketingRecipients).where(eq(schema.crmMarketingRecipients.campaignId, id));
      await db.delete(schema.crmMarketingExclusions).where(eq(schema.crmMarketingExclusions.campaignId, id));
      await db.delete(schema.crmMarketingCampaigns).where(eq(schema.crmMarketingCampaigns.id, id));
    }
    if (segmentId) await db.delete(schema.crmMarketingSegments).where(eq(schema.crmMarketingSegments.id, segmentId));
    await db.delete(schema.crmEmailSuppressions)
      .where(inArray(schema.crmEmailSuppressions.address, Object.values(addresses)));
    if (ids.length) await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, ids));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── Segments ──────────────────────────────────────────────────────────────

  it("refuses an audience condition the field cannot take, rather than matching nobody", async () => {
    const nonsense = await owner.call("POST", "/api/crm/marketing/segments/preview", {
      definition: { match: "all", conditions: [{ field: "created_at", operator: "has_tag", value: "x" }] },
    });
    expect(nonsense.status).toBe(400);
    expect(String(JSON.stringify(nonsense.json["problems"]))).toMatch(/cannot be tested with/i);

    // An empty definition would silently mean "everybody", which is the most
    // expensive possible default.
    const empty = await owner.call("POST", "/api/crm/marketing/segments/preview", {
      definition: { match: "all", conditions: [] },
    });
    expect(empty.status).toBe(400);
    expect(String(JSON.stringify(empty.json["problems"]))).toMatch(/everybody/i);
  }, 60_000);

  it("counts and previews an audience before it is saved", async () => {
    const preview = await owner.call("POST", "/api/crm/marketing/segments/preview", {
      definition: {
        match: "all",
        conditions: [
          { field: "tag", operator: "has_tag", value: TAG },
          { field: "status", operator: "is", value: "Qualified" },
        ],
      },
    });
    expect(preview.status).toBe(200);
    // Seven tagged contacts are Qualified; "Late Lou" is not, yet.
    expect(preview.json["count"]).toBe(7);
    const sampleIds = (preview.json["sample"] as any[]).map((s) => s.id);
    expect(sampleIds).toContain(leadIds["ok"]);
    expect(sampleIds).not.toContain(leadIds["later"]);

    const saved = await owner.call("POST", "/api/crm/marketing/segments", {
      name: `[CRM-TEST] Qualified ${STAMP}`,
      description: "Qualified contacts carrying the test tag.",
      definition: {
        match: "all",
        conditions: [
          { field: "tag", operator: "has_tag", value: TAG },
          { field: "status", operator: "is", value: "Qualified" },
        ],
      },
    });
    expect(saved.status).toBe(201);
    segmentId = saved.json["segment"].id;
    // The definition is what was stored — not a member list.
    expect(saved.json["segment"].definition.conditions).toHaveLength(2);
    expect(Object.keys(saved.json["segment"])).not.toContain("members");
  }, 60_000);

  // ── Merge fields ──────────────────────────────────────────────────────────

  it("blocks a send whose greeting would render empty, and writes nothing", async () => {
    const created = await owner.call("POST", "/api/crm/marketing/campaigns", {
      name: `[CRM-TEST] Gate ${STAMP}`,
      subject: "A question for {{company|your team}}",
      segmentId,
      // No fallback. This is the "Hi ," defect in source form.
      blocks: [{ id: "h", type: "heading", text: "Hi {{first_name}}", level: 1 }],
    });
    expect(created.status).toBe(201);
    gateCampaignId = created.json["campaign"].id;

    const check = await owner.call("GET", `/api/crm/marketing/campaigns/${gateCampaignId}/preflight`);
    expect(check.status).toBe(200);
    expect(check.json["canSend"]).toBe(false);
    expect(String(JSON.stringify(check.json["blockers"]))).toMatch(/no fallback/i);

    const refused = await owner.call("POST", `/api/crm/marketing/campaigns/${gateCampaignId}/send`, {});
    expect(refused.status).toBe(409);
    expect(String(JSON.stringify(refused.json["blockers"]))).toMatch(/\{\{first_name\}\}/);

    // Refused means refused: no audience was resolved and nothing was mailed.
    const rows = await db.select().from(schema.crmMarketingRecipients)
      .where(eq(schema.crmMarketingRecipients.campaignId, gateCampaignId));
    expect(rows).toHaveLength(0);
    expect(sends).toHaveLength(0);
  }, 60_000);

  it("uses the fallback instead of leaving a blank, and says who it fell back for", async () => {
    await owner.call("PATCH", `/api/crm/marketing/campaigns/${gateCampaignId}`, { blocks: goodBlocks() });

    // "Rune" has a first name but no company.
    const preview = await owner.call("GET", `/api/crm/marketing/campaigns/${gateCampaignId}/preview?leadId=${leadIds["plain"]}`);
    expect(preview.status).toBe(200);
    const html = String(preview.json["html"]);
    expect(html).toContain("Hi Rune");
    expect(html).toContain("your business");
    expect(html).not.toContain("{{");
    // Nobody is ever greeted with an empty name.
    expect(html).not.toMatch(/Hi\s*[,<]/);
    expect(preview.json["fallbacksUsed"]).toContain("company");
    expect(preview.json["fallbacksUsed"]).not.toContain("first_name");

    // And the contact with everything needs no fallback at all.
    const full = await owner.call("GET", `/api/crm/marketing/campaigns/${gateCampaignId}/preview?leadId=${leadIds["ok"]}`);
    expect(String(full.json["html"])).toContain("Hi Dana");
    expect(full.json["fallbacksUsed"]).toHaveLength(0);
  }, 60_000);

  // ── The AI gate ───────────────────────────────────────────────────────────

  it("reports AI drafting unavailable rather than inventing a suggestion", async () => {
    const availability = await owner.call("GET", "/api/crm/marketing/ai/availability");
    expect(availability.status).toBe(200);
    expect(availability.json["available"]).toBe(false);
    // Two audiences, two messages. The operator sentence must be readable by
    // somebody selling websites, so it carries no variable names at all; the
    // administrator detail is where those belong, and the UI keeps it behind a
    // disclosure.
    expect(String(availability.json["reason"])).toMatch(/not switched on|write the email yourself/i);
    expect(String(availability.json["reason"])).not.toMatch(/AI_INTEGRATIONS_OPENAI|process\.env/);
    expect(String(availability.json["adminDetail"])).toMatch(/AI_INTEGRATIONS_OPENAI/);
    // The names of absent variables, never their values.
    expect(String(JSON.stringify(availability.json["missing"]))).toMatch(/AI_INTEGRATIONS_OPENAI/);

    const asked = await owner.call("POST", `/api/crm/marketing/campaigns/${gateCampaignId}/ai-draft`, {
      goal: "Introduce our website audit to qualified contacts.",
    });
    expect(asked.status).toBe(503);
    expect(String(asked.json["note"])).toMatch(/nothing was written/i);

    // Nothing was fabricated into the campaign.
    const [row] = await db.select().from(schema.crmMarketingCampaigns)
      .where(eq(schema.crmMarketingCampaigns.id, gateCampaignId));
    expect(row.aiContentState).toBe("none");
    expect(row.aiDraftedAt).toBeNull();
  }, 60_000);

  it("refuses a drafted claim nothing in the grounding set supports", async () => {
    const { draftCampaign, findUngroundedClaims, findBadMergeTokens } =
      await import("../lib/campaignDrafting.js");

    // The guard is what actually holds. Driven directly, with no model.
    expect(findUngroundedClaims("We can do this for $499 a month.")).not.toHaveLength(0);
    expect(findUngroundedClaims("Our clients see a 40% lift.")).not.toHaveLength(0);
    expect(findUngroundedClaims("We guarantee first-page rankings.")).not.toHaveLength(0);
    expect(findUngroundedClaims("A short call to talk about your website.")).toHaveLength(0);
    expect(findBadMergeTokens("Hi {{first_name}}")).not.toHaveLength(0);
    expect(findBadMergeTokens("Hi {{first_name|there}}")).toHaveLength(0);

    const available = () => ({ available: true, missing: [] as string[], reason: null, adminDetail: null });

    const priced = await draftCampaign({ goal: "sell an audit" }, {
      availability: available,
      complete: async () => JSON.stringify({
        subject: "Website audit", preheader: "A look at your site",
        body: "Hi {{first_name|there}}, we can audit your site for $499.", ctaLabel: "Book a call",
      }),
    });
    expect(priced.ok).toBe(false);
    if (!priced.ok) {
      expect(priced.refusal).toBe("ungrounded");
      expect(priced.claims?.[0]?.rule).toBe("price");
      expect(priced.reason).toMatch(/not been saved/i);
    }

    // A grounded draft is accepted, so the guard is refusing content rather
    // than refusing everything.
    const clean = await draftCampaign({ goal: "sell an audit" }, {
      availability: available,
      complete: async () => JSON.stringify({
        subject: "A look at your website", preheader: "Ten minutes, no pressure",
        body: "Hi {{first_name|there}}, we build and rebuild business websites. Worth a short call?\n\n[Your name]",
        ctaLabel: "Book a call",
      }),
    });
    expect(clean.ok).toBe(true);
    if (clean.ok) {
      // The grounding set is the whole of what the model was given.
      expect(clean.grounding.facts.company).toMatch(/SiteMint/);
      expect(JSON.stringify(clean.grounding)).not.toMatch(/\$\d/);
    }
  }, 60_000);

  it("will not send a campaign carrying unapproved AI copy, and will once approved", async () => {
    // The state a successful draft leaves behind.
    await db.update(schema.crmMarketingCampaigns)
      .set({ aiContentState: "draft", aiDraftedAt: new Date() })
      .where(eq(schema.crmMarketingCampaigns.id, gateCampaignId));

    const blocked = await owner.call("GET", `/api/crm/marketing/campaigns/${gateCampaignId}/preflight`);
    expect(blocked.json["canSend"]).toBe(false);
    expect(String(JSON.stringify(blocked.json["blockers"]))).toMatch(/nobody has approved/i);

    const refused = await owner.call("POST", `/api/crm/marketing/campaigns/${gateCampaignId}/send`, {});
    expect(refused.status).toBe(409);
    expect(sends).toHaveLength(0);
    const rows = await db.select().from(schema.crmMarketingRecipients)
      .where(eq(schema.crmMarketingRecipients.campaignId, gateCampaignId));
    expect(rows).toHaveLength(0);

    const approved = await owner.call("POST", `/api/crm/marketing/campaigns/${gateCampaignId}/ai-draft/approve`, {});
    expect(approved.status).toBe(200);
    // Approval has a name on it.
    expect(approved.json["campaign"].aiApprovedByStaffId).toBe(staffIds["owner"]);
    expect(approved.json["campaign"].aiApprovedAt).not.toBeNull();

    const nowOk = await owner.call("GET", `/api/crm/marketing/campaigns/${gateCampaignId}/preflight`);
    expect(String(JSON.stringify(nowOk.json["blockers"]))).not.toMatch(/approved/i);
  }, 60_000);

  // ── The restricted user ───────────────────────────────────────────────────

  it("refuses a restricted user every mutating route, and writes nothing when it does", async () => {
    const restricted = new Agent();
    expect(await restricted.login(RESTRICTED)).toBe(200);

    const before = {
      segments: (await db.select().from(schema.crmMarketingSegments)).length,
      designs: (await db.select().from(schema.crmMarketingDesigns)).length,
      campaigns: (await db.select().from(schema.crmMarketingCampaigns)).length,
      exclusions: (await db.select().from(schema.crmMarketingExclusions)).length,
      recipients: (await db.select().from(schema.crmMarketingRecipients)).length,
      suppressions: (await db.select().from(schema.crmEmailSuppressions)).length,
    };
    const sendsBefore = sends.length;

    const attempts: [string, string, unknown][] = [
      ["POST", "/api/crm/marketing/segments", { name: `sneak-${STAMP}`, definition: { match: "all", conditions: [{ field: "status", operator: "is", value: "Qualified" }] } }],
      ["PATCH", `/api/crm/marketing/segments/${segmentId}`, { name: "renamed" }],
      ["DELETE", `/api/crm/marketing/segments/${segmentId}`, undefined],
      ["POST", "/api/crm/marketing/designs", { name: `sneak-design-${STAMP}` }],
      ["POST", "/api/crm/marketing/campaigns", { name: `sneak-campaign-${STAMP}` }],
      ["PATCH", `/api/crm/marketing/campaigns/${gateCampaignId}`, { subject: "hijacked" }],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/exclusions`, { leadId: leadIds["ok"] }],
      ["DELETE", `/api/crm/marketing/campaigns/${gateCampaignId}/exclusions/${leadIds["ok"]}`, undefined],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/test-send`, { to: OWNER.email }],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/schedule`, { scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/send`, {}],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/pause`, {}],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/resume`, {}],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/cancel`, {}],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/retry`, {}],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/ai-draft`, { goal: "anything" }],
      ["POST", `/api/crm/marketing/campaigns/${gateCampaignId}/ai-draft/approve`, {}],
      ["POST", "/api/crm/marketing/unsubscribe", { address: `sneak-${STAMP}@example.test` }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await restricted.call(method, path, body);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }

    // A 403 that still wrote a row is not a refusal.
    expect((await db.select().from(schema.crmMarketingSegments)).length).toBe(before.segments);
    expect((await db.select().from(schema.crmMarketingDesigns)).length).toBe(before.designs);
    expect((await db.select().from(schema.crmMarketingCampaigns)).length).toBe(before.campaigns);
    expect((await db.select().from(schema.crmMarketingExclusions)).length).toBe(before.exclusions);
    expect((await db.select().from(schema.crmMarketingRecipients)).length).toBe(before.recipients);
    expect((await db.select().from(schema.crmEmailSuppressions)).length).toBe(before.suppressions);
    expect(sends.length).toBe(sendsBefore);

    // The segment it tried to rename and archive is untouched.
    const [segment] = await db.select().from(schema.crmMarketingSegments)
      .where(eq(schema.crmMarketingSegments.id, segmentId));
    expect(segment.name).toMatch(/Qualified/);
    expect(segment.archivedAt).toBeNull();
  }, 120_000);

  // ── Test sends ────────────────────────────────────────────────────────────

  it("will not send a test to anything but an active staff address", async () => {
    const created = await owner.call("POST", "/api/crm/marketing/campaigns", {
      name: `[CRM-TEST] Broadcast ${STAMP}`,
      subject: "A question for {{company|your team}}",
      preheader: "Ten minutes, no pressure",
      segmentId,
      blocks: goodBlocks(),
    });
    expect(created.status).toBe(201);
    campaignId = created.json["campaign"].id;

    const atCustomer = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/test-send`, {
      to: addresses["ok"],
    });
    expect(atCustomer.status).toBe(400);
    expect(String(atCustomer.json["error"])).toMatch(/never reach a customer/i);
    expect(sends).toHaveLength(0);

    const atStaff = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/test-send`, {
      to: OWNER.email, asLeadId: leadIds["ok"],
    });
    expect(atStaff.status).toBe(200);
    expect(atStaff.json["sent"]).toBe(true);
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe(OWNER.email);
    // Unmistakably a test, in the subject and in the message.
    expect(sends[0].subject.startsWith("[TEST] ")).toBe(true);
    expect(sends[0].html).toMatch(/TEST SEND/);
    // And it never counts as a delivery.
    const [row] = await db.select().from(schema.crmMarketingRecipients)
      .where(eq(schema.crmMarketingRecipients.campaignId, campaignId));
    expect(row.status).toBe("test");
  }, 60_000);

  // ── Exclusions ────────────────────────────────────────────────────────────

  it("records an unsubscribe on the shared suppression list, not a second one", async () => {
    const before = await db.select().from(schema.crmEmailSuppressions);
    const done = await owner.call("POST", "/api/crm/marketing/unsubscribe", {
      address: addresses["unsub"], detail: "Replied asking to stop.",
    });
    expect(done.status).toBe(200);

    // The one list `lib/inboundEmail.ts` already owns.
    const after = await db.select().from(schema.crmEmailSuppressions);
    expect(after.length).toBe(before.length + 1);
    const row = after.find((r) => r.address === addresses["unsub"]);
    expect(row?.reason).toBe("unsubscribe");
    expect(row?.releasedAt).toBeNull();

    // And the existing suppression checker agrees, so one send path cannot
    // honour it while another does not.
    const { isSuppressed } = await import("../lib/inboundEmail.js");
    expect((await isSuppressed(addresses["unsub"])).suppressed).toBe(true);
  }, 60_000);

  it("shows every excluded contact with its own reason before anything is sent", async () => {
    const excluded = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/exclusions`, {
      leadId: leadIds["excl"], reason: "Mid-contract; leave them out of this one.",
    });
    expect(excluded.status).toBe(201);

    const check = await owner.call("GET", `/api/crm/marketing/campaigns/${campaignId}/preflight`);
    expect(check.status).toBe(200);
    expect(check.json["canSend"]).toBe(true);

    const reasons = Object.fromEntries(
      (check.json["excludedByReason"] as any[]).map((b) => [b.reason, b]),
    );
    expect(reasons["suppressed"].count).toBe(1);
    expect(reasons["unsubscribed"].count).toBe(1);
    expect(reasons["campaign_excluded"].count).toBe(1);
    expect(reasons["no_address"].count).toBe(1);

    // A count with no names behind it is the silent drop this exists to stop.
    for (const bucket of check.json["excludedByReason"] as any[]) {
      expect(bucket.contacts).toHaveLength(bucket.count);
      for (const c of bucket.contacts) expect(c.name).toBeTruthy();
    }
    expect(check.json["excluded"]).toBe(
      (check.json["excludedByReason"] as any[]).reduce((s, b) => s + b.count, 0),
    );
    expect(check.json["audienceSize"]).toBe(check.json["sendable"] + check.json["excluded"]);

    // The generic greeting is visible BEFORE the send, not after it.
    const companyWarning = (check.json["fallbackWarnings"] as any[]).find((w) => w.field === "company");
    expect(companyWarning.count).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("mails one inbox once when several contacts share it, and says which contact got it", async () => {
    // Two contact rows for one person is the ordinary state of a CRM before
    // anybody has merged an import — the owner-preview database currently shows
    // one contact five times in the audience picker. Without this, that is five
    // identical emails to a customer and a "delivered" figure five times the
    // number of people reached.
    const shared = `mktg-twin-${STAMP}@example.test`;
    const twins: number[] = [];
    for (const name of ["Twin One", "Twin Two", "Twin Three"]) {
      const [row] = await db.insert(schema.crmLeads).values({
        name: `[CRM-TEST] ${name}`, company: "Twin Co", email: shared,
        status: "Qualified", source: "Manual Entry", tags: [TAG],
      }).returning();
      twins.push(row.id);
    }
    const kept = Math.min(...twins);

    try {
      const created = await owner.call("POST", "/api/crm/marketing/campaigns", {
        name: `[CRM-TEST] Twins ${STAMP}`,
        subject: "One inbox",
        segmentId,
        blocks: goodBlocks(),
      });
      expect(created.status).toBe(201);
      const twinCampaign = created.json["campaign"].id;

      const check = await owner.call("GET", `/api/crm/marketing/campaigns/${twinCampaign}/preflight`);
      expect(check.status).toBe(200);

      const dup = (check.json["excludedByReason"] as any[]).find((b) => b.reason === "duplicate_address");
      expect(dup, "the two extra rows must be excluded as duplicates").toBeTruthy();
      expect(dup.count).toBe(2);
      expect(dup.contacts.map((c: any) => c.id).sort()).toEqual(twins.filter((id) => id !== kept).sort());

      // A silent drop is the failure this exists to prevent: the reason has to
      // name the contact that IS receiving it, so the operator can act on it.
      for (const c of dup.contacts) {
        expect(c.detail).toContain(shared);
        expect(c.detail).toContain(`#${kept}`);
      }
      expect(check.json["audienceSize"]).toBe(check.json["sendable"] + check.json["excluded"]);

      // And the send agrees with the preflight, rather than the two disagreeing.
      sends.length = 0;
      const sent = await owner.call("POST", `/api/crm/marketing/campaigns/${twinCampaign}/send`, { batchSize: 500 });
      expect(sent.status).toBe(200);
      expect(
        sends.filter((s) => s.to === shared),
        "one person, one copy",
      ).toHaveLength(1);

      const ledger = await db.select().from(schema.crmMarketingRecipients)
        .where(eq(schema.crmMarketingRecipients.campaignId, twinCampaign));
      const twinRows = ledger.filter((r) => twins.includes(r.leadId));
      expect(twinRows).toHaveLength(3);
      expect(twinRows.filter((r) => r.status === "excluded").map((r) => r.exclusionReason))
        .toEqual(["duplicate_address", "duplicate_address"]);
    } finally {
      for (const id of twins) {
        await db.delete(schema.crmMarketingRecipients).where(eq(schema.crmMarketingRecipients.leadId, id));
        await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, id));
      }
    }
  }, 120_000);

  it("calls a shared address unsubscribed rather than duplicate, when it has opted out", async () => {
    // Ordering matters for what the operator reads. If the shared address has
    // opted out, every row carrying it should say so — "duplicate" would bury
    // the fact that actually decides the send.
    const shared = `mktg-twin-unsub-${STAMP}@example.test`;
    const twins: number[] = [];
    for (const name of ["Opted One", "Opted Two"]) {
      const [row] = await db.insert(schema.crmLeads).values({
        name: `[CRM-TEST] ${name}`, company: "Opted Co", email: shared,
        status: "Qualified", source: "Manual Entry", tags: [TAG],
      }).returning();
      twins.push(row.id);
    }
    await db.insert(schema.crmEmailSuppressions).values({
      address: shared, reason: "unsubscribe", detail: "Asked to stop.", source: "recipient",
    }).onConflictDoNothing();

    try {
      const created = await owner.call("POST", "/api/crm/marketing/campaigns", {
        name: `[CRM-TEST] Opted twins ${STAMP}`, subject: "One inbox", segmentId, blocks: goodBlocks(),
      });
      const check = await owner.call("GET", `/api/crm/marketing/campaigns/${created.json["campaign"].id}/preflight`);
      const reasons = Object.fromEntries((check.json["excludedByReason"] as any[]).map((b) => [b.reason, b]));
      const unsubIds = reasons["unsubscribed"].contacts.map((c: any) => c.id);
      for (const id of twins) expect(unsubIds).toContain(id);
      const dupIds = (reasons["duplicate_address"]?.contacts ?? []).map((c: any) => c.id);
      for (const id of twins) expect(dupIds).not.toContain(id);
    } finally {
      for (const id of twins) {
        await db.delete(schema.crmMarketingRecipients).where(eq(schema.crmMarketingRecipients.leadId, id));
        await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, id));
      }
      await db.delete(schema.crmEmailSuppressions).where(eq(schema.crmEmailSuppressions.address, shared));
    }
  }, 120_000);

  // ── Segment re-evaluation ─────────────────────────────────────────────────

  it("resolves the audience when the send starts, not when the segment was saved", async () => {
    // Two changes AFTER the segment and the campaign were saved.
    await db.update(schema.crmLeads).set({ status: "Qualified" })
      .where(eq(schema.crmLeads.id, leadIds["later"]));
    await db.update(schema.crmLeads).set({ status: "Lost" })
      .where(eq(schema.crmLeads.id, leadIds["drift"]));

    sends.length = 0;
    const first = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/send`, { batchSize: 1 });
    expect(first.status).toBe(200);
    expect(first.json["campaign"].status).toBe("sending");

    const ledger = await db.select().from(schema.crmMarketingRecipients)
      .where(eq(schema.crmMarketingRecipients.campaignId, campaignId));
    const byLead = new Map(ledger.map((r) => [r.leadId, r]));

    // Newly qualifying: in, and mailable.
    expect(byLead.has(leadIds["later"])).toBe(true);
    // No longer qualifying: not in the audience at all.
    expect(byLead.has(leadIds["drift"])).toBe(false);
    // The earlier test send left a `test` row for this contact; the real
    // audience replaced it rather than inheriting it.
    expect(byLead.get(leadIds["ok"])?.status).not.toBe("test");

    // Exclusions were applied at resolution, each with its reason.
    expect(byLead.get(leadIds["supp"])?.exclusionReason).toBe("suppressed");
    expect(byLead.get(leadIds["unsub"])?.exclusionReason).toBe("unsubscribed");
    expect(byLead.get(leadIds["excl"])?.exclusionReason).toBe("campaign_excluded");
    expect(byLead.get(leadIds["noaddr"])?.exclusionReason).toBe("no_address");

    // One recipient per batch of one, and not to anybody excluded.
    expect(sends).toHaveLength(1);
    const mailed = sends.map((s) => s.to);
    expect(mailed).not.toContain(addresses["supp"]);
    expect(mailed).not.toContain(addresses["unsub"]);
    expect(mailed).not.toContain(addresses["excl"]);
    expect(first.json["remaining"]).toBe(2);
  }, 60_000);

  // ── Pause ─────────────────────────────────────────────────────────────────

  it("stops sending the moment it is paused, not at the end of the batch", async () => {
    const paused = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/pause`, {});
    expect(paused.status).toBe(200);
    expect(paused.json["alreadyDelivered"]).toBe(1);
    expect(paused.json["notYetAttempted"]).toBe(2);

    const sendsWhenPaused = sends.length;
    const refused = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/send`, { batchSize: 50 });
    expect(refused.status).toBe(409);
    expect(String(refused.json["error"])).toMatch(/paused/i);
    expect(sends.length).toBe(sendsWhenPaused);

    // Now the harder case: a pause that lands part-way through a large batch.
    // Without a per-recipient status check the whole batch would go out.
    await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/resume`, {});
    onSend = async () => {
      await db.update(schema.crmMarketingCampaigns)
        .set({ status: "paused", pausedAt: new Date() })
        .where(eq(schema.crmMarketingCampaigns.id, campaignId));
    };
    const midBatch = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/send`, { batchSize: 50 });
    onSend = null;

    expect(midBatch.status).toBe(200);
    expect(midBatch.json["attempted"]).toBe(1);
    expect(midBatch.json["remaining"]).toBe(1);
    expect(String(midBatch.json["stoppedBecause"])).toMatch(/paused/i);
    expect(sends.length).toBe(sendsWhenPaused + 1);
    // A pause that landed mid-batch must not be overwritten by "sent".
    expect(midBatch.json["campaign"].status).toBe("paused");
  }, 60_000);

  // ── Cancel ────────────────────────────────────────────────────────────────

  it("cancels without claiming to un-send what already went out", async () => {
    const cancelled = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.json["campaign"].status).toBe("cancelled");
    expect(cancelled.json["alreadyDelivered"]).toBe(2);
    expect(cancelled.json["neverAttempted"]).toBe(1);
    expect(cancelled.json["unsent"]).toBe(false);
    expect(String(cancelled.json["note"])).toMatch(/cannot recall/i);

    // What was sent stays sent.
    const sent = (await db.select().from(schema.crmMarketingRecipients)
      .where(eq(schema.crmMarketingRecipients.campaignId, campaignId)))
      .filter((r) => r.status === "sent");
    expect(sent).toHaveLength(2);
    for (const r of sent) expect(r.sentAt).not.toBeNull();

    // And it cannot be restarted into a second delivery.
    const restart = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/send`, {});
    expect(restart.status).toBe(409);
    expect(String(restart.json["error"])).toMatch(/not an undo|cannot be restarted/i);
    const resume = await owner.call("POST", `/api/crm/marketing/campaigns/${campaignId}/resume`, {});
    expect(resume.status).toBe(409);
  }, 60_000);

  // ── Results ───────────────────────────────────────────────────────────────

  it("reports counts that equal their lists, and refuses to invent open rates", async () => {
    const results = await owner.call("GET", `/api/crm/marketing/campaigns/${campaignId}/results`);
    expect(results.status).toBe(200);

    const rows = results.json["recipients"] as any[];
    const counts = results.json["counts"];
    const of = (s: string) => rows.filter((r) => r.status === s);

    expect(counts.sent).toBe(of("sent").length);
    expect(counts.failed).toBe(of("failed").length);
    expect(counts.excluded).toBe(of("excluded").length);
    expect(counts.neverAttempted).toBe(of("pending").length);
    expect(counts.audience).toBe(rows.filter((r) => r.status !== "test").length);
    expect(counts.audience).toBe(counts.sent + counts.failed + counts.excluded + counts.neverAttempted);

    // Every excluded contact appears exactly once in exactly one reason bucket.
    const buckets = results.json["excludedByReason"] as any[];
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(counts.excluded);
    for (const b of buckets) expect(b.contacts).toHaveLength(b.count);
    expect(new Set(buckets.flatMap((b) => b.contacts.map((c: any) => c.leadId))).size).toBe(counts.excluded);

    // Nothing tracks opens or clicks, so nothing claims to.
    expect(results.json["engagement"].tracked).toBe(false);
    expect(results.json["engagement"].opens).toBeNull();
    expect(results.json["engagement"].openRate).toBeNull();
    expect(String(results.json["engagement"].why)).toMatch(/no evidence/i);

    // "Sent" is stated as what it is.
    expect(String(results.json["deliverySignal"].meaning)).toMatch(/not a delivery confirmation/i);
  }, 60_000);

  // ── Templates ─────────────────────────────────────────────────────────────

  it("keeps a saved template editable rather than only renderable", async () => {
    const blocks = goodBlocks();
    const created = await owner.call("POST", "/api/crm/marketing/designs", {
      name: `[CRM-TEST] Template ${STAMP}`,
      subject: "Hello from SiteMint",
      blocks,
    });
    expect(created.status).toBe(201);
    const id = created.json["design"].id;

    try {
      // Reopened as structure, with the block kinds intact.
      const list = await owner.call("GET", "/api/crm/marketing/designs");
      const mine = (list.json["designs"] as any[]).find((d) => d.id === id);
      expect(mine.blocks.map((b: any) => b.type)).toEqual(["heading", "text", "button", "divider"]);
      expect(mine.blocks[0].text).toBe("Hi {{first_name|there}}");

      const edited = await owner.call("PATCH", `/api/crm/marketing/designs/${id}`, {
        blocks: [...blocks, { id: "s", type: "spacer", size: 24 }],
      });
      expect(edited.status).toBe(200);
      expect(edited.json["design"].blocks).toHaveLength(5);

      const clash = await owner.call("POST", "/api/crm/marketing/designs", {
        name: `[CRM-TEST] Template ${STAMP}`,
      });
      expect(clash.status).toBe(409);
    } finally {
      await db.delete(schema.crmMarketingDesigns).where(eq(schema.crmMarketingDesigns.id, id));
    }
  }, 60_000);
});
