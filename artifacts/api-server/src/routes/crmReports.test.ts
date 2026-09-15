/**
 * Reporting.
 *
 * The failures worth testing here are the ones that make a dashboard worse
 * than no dashboard:
 *
 *   - A number that disagrees with the list behind it. Every available figure
 *     is asked for its own evidence and must equal it, for every figure, not
 *     for a sample.
 *   - 0% standing in for "we are not measuring this". An untracked figure must
 *     say so, because a zero is a claim to have looked.
 *   - 0% standing in for "nothing has happened yet". A ratio over an empty
 *     denominator is null.
 *   - "Money received" filtering on a status no write path produces — the
 *     defect that made the figure structurally zero on two screens at once.
 *   - A day boundary that quietly means UTC when the business is in Manila.
 *
 * Fixtures live in a long-past window (June 2017) that nothing else in the
 * suite occupies, so exact counts are exactly these rows and not whatever else
 * the shared test database happens to hold.
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
process.env.ADMIN_PASSWORD = "reports-admin-secret-value";
// Email engagement tracking is a webhook that either exists or does not. The
// test pins it to "does not", which is what the untracked-figure assertions
// are about.
delete process.env["RESEND_WEBHOOK_SECRET"];

const STAMP = Date.now();
const OWNER = { email: `reports-owner-${STAMP}@example.test`, name: "[CRM-TEST] Reports Owner", password: "harbour-trellis-5521" };
const MATE = { email: `reports-mate-${STAMP}@example.test`, name: "[CRM-TEST] Reports Mate", password: "lantern-quartz-7734" };
const NOREPORTS = { email: `reports-denied-${STAMP}@example.test`, password: "verdant-copper-8890" };

const suite = TEST_DB ? describe : describe.skip;

const DAY = "2017-06-15";
const EMPTY_FROM = "2016-01-01";
const EMPTY_TO = "2016-01-02";
const BASE = Date.UTC(2017, 5, 15, 12, 0, 0);
const R = (minutes: number) => new Date(BASE + minutes * 60_000);
/** 20:30 UTC on the fixture day — 04:30 the NEXT day in Asia/Manila. */
const LATE_UTC = new Date(Date.UTC(2017, 5, 15, 20, 30, 0));

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

interface Figure {
  key: string; area: string; label: string; unit: string;
  available: boolean; value: number | null;
  definition: string;
  denominator: { label: string; value: number | null } | null;
  sources: string[];
  honoursFilters: string[]; ignoredFilters: string[];
  traceable: boolean; detail: string | null;
  limitations: string[];
  unavailableReason?: string;
  wouldRequire?: string;
}

function flatten(areas: Record<string, Figure[]>): Map<string, Figure> {
  const map = new Map<string, Figure>();
  for (const list of Object.values(areas)) for (const f of list) map.set(f.key, f);
  return map;
}

suite("reporting: definitions, denominators and evidence (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  const staffIds: Record<string, number> = {};
  const leadIds: number[] = [];
  const dealIds: number[] = [];
  const appointmentIds: number[] = [];
  const ticketIds: number[] = [];
  let campaignId = 0;
  let conversationId = 0;

  const owner = new Agent(() => base);
  const denied = new Agent(() => base);

  /** The whole summary for the fixture day, in the given zone. */
  async function summary(params = ""): Promise<Map<string, Figure>> {
    const r = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=UTC${params}`);
    expect(r.status).toBe(200);
    return flatten(r.json["areas"] as Record<string, Figure[]>);
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
    for (const who of [OWNER, MATE]) {
      const [row] = await db.insert(schema.crmStaff).values({
        email: who.email, displayName: who.name, role: "owner", status: "active",
        passwordHash: await hashPassword(who.password), passwordUpdatedAt: new Date(),
      }).returning();
      staffIds[who.email] = row.id;
    }
    const [nope] = await db.insert(schema.crmStaff).values({
      email: NOREPORTS.email, displayName: "[CRM-TEST] No Reports",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(NOREPORTS.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["reports.read"],
    }).returning();
    staffIds[NOREPORTS.email] = nope.id;

    expect(await owner.login(OWNER)).toBe(200);
    expect(await denied.login(NOREPORTS)).toBe(200);

    // ── Contacts ──────────────────────────────────────────────────────────
    const leads = await db.insert(schema.crmLeads).values([
      {
        name: "[CRM-TEST] Reports Referral", email: `reports-a-${STAMP}@example.test`,
        source: "Referral", status: "New Inquiry", createdAt: R(0), updatedAt: R(0),
      },
      {
        name: "[CRM-TEST] Reports Web", email: `reports-b-${STAMP}@example.test`,
        source: "Website Form", status: "New Inquiry", createdAt: R(10), updatedAt: R(10),
      },
    ]).returning();
    for (const l of leads) leadIds.push(l.id);

    await db.insert(schema.crmActivities).values({
      leadId: leadIds[0], type: "status_changed", title: "Status changed to Qualified",
      description: "From: New Inquiry → To: Qualified",
      metadata: { from: "New Inquiry", to: "Qualified" },
      createdBy: "admin", createdAt: R(15),
    });

    // ── Deals ─────────────────────────────────────────────────────────────
    const deals = await db.insert(schema.crmDeals).values([
      {
        leadId: leadIds[0], name: "[CRM-TEST] Won deal", value: "5000.00", stage: "Won",
        ownerStaffId: staffIds[OWNER.email], closedByStaffId: staffIds[OWNER.email],
        wonAt: R(30), createdAt: R(20), updatedAt: R(30),
      },
      {
        leadId: leadIds[0], name: "[CRM-TEST] Lost deal", value: "2000.00", stage: "Lost",
        ownerStaffId: staffIds[OWNER.email], closedByStaffId: staffIds[OWNER.email],
        lostAt: R(35), lostReason: "price", createdAt: R(25), updatedAt: R(35),
      },
      {
        leadId: leadIds[1], name: "[CRM-TEST] Open deal", value: "7000.00", stage: "Proposal",
        ownerStaffId: staffIds[MATE.email], createdAt: R(40), updatedAt: R(40),
      },
    ]).returning();
    for (const d of deals) dealIds.push(d.id);

    // ── Money ─────────────────────────────────────────────────────────────
    await db.insert(schema.crmTransactions).values([
      {
        dealId: dealIds[0], leadId: leadIds[0], amount: "1500.00", method: "manual_transfer",
        status: schema.TRANSACTION_RECEIVED_STATUS, receivedAt: R(50),
        createdAt: R(45), updatedAt: R(50),
      },
      {
        dealId: dealIds[0], leadId: leadIds[0], amount: "500.00", method: "stripe",
        status: "pending", createdAt: R(55), updatedAt: R(55),
      },
      {
        dealId: dealIds[1], leadId: leadIds[0], amount: "300.00", method: "stripe",
        status: "refunded", receivedAt: R(60), createdAt: R(58), updatedAt: R(60),
      },
      // Received, but with no record of WHEN. Dated by created_at, and counted
      // by the data-quality figure that exists to make that visible.
      {
        dealId: dealIds[0], leadId: leadIds[0], amount: "250.00", method: "manual_cash",
        status: schema.TRANSACTION_RECEIVED_STATUS, createdAt: R(62), updatedAt: R(62),
      },
      // 20:30 UTC — the same money falls on a DIFFERENT day in Manila.
      {
        dealId: dealIds[0], leadId: leadIds[0], amount: "111.00", method: "manual_cash",
        status: schema.TRANSACTION_RECEIVED_STATUS, receivedAt: LATE_UTC,
        createdAt: LATE_UTC, updatedAt: LATE_UTC,
      },
    ]);

    // ── Tasks ─────────────────────────────────────────────────────────────
    await db.insert(schema.crmTasks).values([
      {
        leadId: leadIds[0], title: "[CRM-TEST] Reports task done", status: "completed",
        assignedToStaffId: staffIds[OWNER.email], completedByStaffId: staffIds[OWNER.email],
        createdBy: "admin", createdAt: R(70), completedAt: R(75), updatedAt: R(75),
      },
      {
        leadId: leadIds[0], title: "[CRM-TEST] Reports task open", status: "pending",
        assignedToStaffId: staffIds[OWNER.email],
        createdBy: "admin", createdAt: R(72), updatedAt: R(72),
      },
    ]);

    // ── Meetings ──────────────────────────────────────────────────────────
    const appts = await db.insert(schema.crmAppointments).values([
      {
        title: "[CRM-TEST] Reports meeting", leadId: leadIds[0],
        startAt: R(80), endAt: R(110), timezone: "UTC", status: "completed",
        organizerStaffId: staffIds[OWNER.email],
        createdByStaffId: staffIds[OWNER.email], createdByLabel: OWNER.name,
        completedAt: R(110), createdAt: R(78), updatedAt: R(110),
      },
      {
        title: "[CRM-TEST] Reports meeting cancelled", leadId: leadIds[0],
        startAt: R(85), endAt: R(115), timezone: "UTC", status: "cancelled",
        organizerStaffId: staffIds[OWNER.email],
        createdByStaffId: staffIds[OWNER.email], createdByLabel: OWNER.name,
        cancelledAt: R(87), createdAt: R(79), updatedAt: R(87),
      },
    ]).returning();
    for (const a of appts) appointmentIds.push(a.id);

    // ── Support ───────────────────────────────────────────────────────────
    const tickets = await db.insert(schema.crmSupportTickets).values([
      {
        leadId: leadIds[0], subject: "[CRM-TEST] Reports ticket resolved",
        status: "resolved", priority: "normal", source: "email",
        assignedToStaffId: staffIds[OWNER.email],
        firstResponseAt: R(95), resolution: "fixed", resolvedAt: R(100),
        resolvedByStaffId: staffIds[OWNER.email],
        createdAt: R(90), updatedAt: R(100),
      },
      {
        leadId: leadIds[1], subject: "[CRM-TEST] Reports ticket still waiting",
        status: "new", priority: "normal", source: "email",
        assignedToStaffId: staffIds[OWNER.email],
        createdAt: R(92), updatedAt: R(92),
      },
    ]).returning();
    for (const t of tickets) ticketIds.push(t.id);

    // ── Communications ────────────────────────────────────────────────────
    const [conversation] = await db.insert(schema.crmConversations).values({
      channel: "phone", identityKey: `phone:reports:${STAMP}`,
      contactId: leadIds[0], externalAddress: `+1555${String(STAMP).slice(-7)}`,
      status: "resolved", resolvedAt: R(120), resolvedByStaffId: staffIds[OWNER.email],
      assignedToStaffId: staffIds[OWNER.email],
      createdAt: R(100), updatedAt: R(120),
    }).returning();
    conversationId = conversation.id;

    await db.insert(schema.crmMessages).values([
      {
        leadId: leadIds[0], direction: "inbound", channel: "sms",
        body: "[CRM-TEST] inbound", origin: "inbound", createdAt: R(125),
      },
      {
        leadId: leadIds[0], direction: "outbound", channel: "sms",
        body: "[CRM-TEST] delivered", origin: "staff",
        sentByStaffId: staffIds[OWNER.email], status: "delivered", createdAt: R(126),
      },
      {
        leadId: leadIds[0], direction: "outbound", channel: "sms",
        body: "[CRM-TEST] failed", origin: "staff",
        sentByStaffId: staffIds[OWNER.email], status: "failed", createdAt: R(127),
      },
      // No provider status at all — excluded from BOTH halves of the delivery
      // rate rather than counted as a failure.
      {
        leadId: leadIds[0], direction: "outbound", channel: "sms",
        body: "[CRM-TEST] no status", origin: "staff",
        sentByStaffId: staffIds[OWNER.email], createdAt: R(128),
      },
    ]);

    // ── Campaigns ─────────────────────────────────────────────────────────
    const [campaign] = await db.insert(schema.crmCampaigns).values({
      name: `[CRM-TEST] Reports campaign ${STAMP}`, subject: "Hello",
      body: "Body", status: "ready", createdAt: R(130), updatedAt: R(130),
    }).returning();
    campaignId = campaign.id;

    await db.insert(schema.crmCampaignRecipients).values([
      {
        campaignId, leadId: leadIds[0], status: "sent",
        sentAt: R(135), createdAt: R(132),
      },
      {
        campaignId, leadId: leadIds[1], status: "failed",
        lastError: "mailbox full", createdAt: R(133),
      },
    ]);
  }, 180_000);

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.crmCampaignRecipients).where(eq(schema.crmCampaignRecipients.campaignId, campaignId));
    await db.delete(schema.crmCampaigns).where(eq(schema.crmCampaigns.id, campaignId));
    await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.leadId, leadIds));
    await db.delete(schema.crmConversations).where(eq(schema.crmConversations.id, conversationId));
    if (ticketIds.length) {
      await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.id, ticketIds));
    }
    if (appointmentIds.length) {
      await db.delete(schema.crmAppointments).where(inArray(schema.crmAppointments.id, appointmentIds));
    }
    await db.delete(schema.crmTasks).where(inArray(schema.crmTasks.leadId, leadIds));
    if (dealIds.length) {
      await db.delete(schema.crmTransactions).where(inArray(schema.crmTransactions.dealId, dealIds));
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.id, dealIds));
    }
    await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
    await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── Definitions and denominators ──────────────────────────────────────────

  it("states the window, the timezone, and what each figure means", async () => {
    const r = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=UTC`);
    expect(r.status).toBe(200);

    expect(r.json["window"].timezone).toBe("UTC");
    expect(String(r.json["window"].definition)).toMatch(/counted in UTC/i);
    // The end of the window is INCLUSIVE as a day, which is the part that gets
    // silently wrong and drops an evening's work.
    expect(String(r.json["window"].definition)).toMatch(/INCLUDED/);

    const figures = flatten(r.json["areas"] as Record<string, Figure[]>);
    expect(figures.size).toBeGreaterThan(20);
    for (const f of figures.values()) {
      expect(f.definition.length, `${f.key} has no definition`).toBeGreaterThan(20);
      expect(Array.isArray(f.sources), `${f.key} has no sources`).toBe(true);
      expect(f.sources.length, `${f.key} names no source table`).toBeGreaterThan(0);
    }
  }, 120_000);

  it("says which filters a figure could not honour instead of pretending it did", async () => {
    const figures = await summary("&ownerStaffId=1&source=Referral");
    // The pipeline snapshot cannot honour a date range — nothing records what
    // the pipeline looked like last March.
    expect(figures.get("openPipelineValue")!.ignoredFilters).toContain("dateRange");
    expect(figures.get("openPipelineValue")!.limitations.join(" ")).toMatch(/snapshot/i);
    // Messages are not owned by anybody, so an owner filter does nothing there.
    expect(figures.get("messagesSent")!.ignoredFilters).toContain("ownerStaffId");
    // Deals genuinely do honour both.
    expect(figures.get("dealsWon")!.honoursFilters).toContain("ownerStaffId");
    expect(figures.get("dealsWon")!.honoursFilters).toContain("source");
  }, 120_000);

  // ── Traceability ──────────────────────────────────────────────────────────

  it("hands back the exact rows behind every figure, and the count equals the list", async () => {
    const catalogue = await owner.call("GET", "/api/crm/reports/figures");
    expect(catalogue.status).toBe(200);
    const kinds = new Map<string, string>(
      (catalogue.json["figures"] as { key: string; kind: string }[]).map((f) => [f.key, f.kind]),
    );

    const figures = await summary();
    let checked = 0;

    for (const figure of figures.values()) {
      if (!figure.available || kinds.get(figure.key) !== "counted") continue;
      expect(figure.detail, `${figure.key} has no evidence handle`).toBeTruthy();
      expect(figure.traceable, `${figure.key} claims it cannot be traced`).toBe(true);

      const d = await owner.call("GET", figure.detail!);
      expect(d.status, `${figure.key} detail failed`).toBe(200);

      // The contract, for every figure and not for a sample.
      expect(d.json["count"], `${figure.key}: count ≠ rows.length`).toBe((d.json["rows"] as unknown[]).length);
      expect(d.json["truncated"]).toBe(false);

      if (figure.unit === "count") {
        expect(figure.value, `${figure.key}: summary ≠ evidence`).toBe((d.json["rows"] as unknown[]).length);
      } else if (figure.unit === "currency") {
        expect(figure.value, `${figure.key}: summary sum ≠ evidence sum`).toBe(d.json["sum"]);
      } else {
        expect(figure.value, `${figure.key}: summary ≠ evidence median`).toBe(d.json["median"]);
      }
      checked += 1;
    }

    expect(checked, "no figures were actually traced").toBeGreaterThan(12);
  }, 180_000);

  it("refuses to hand back rows for a ratio, and names its parts instead", async () => {
    const r = await owner.call("GET", `/api/crm/reports/detail/winRate?from=${DAY}&to=${DAY}`);
    expect(r.status).toBe(409);
    expect(r.json["numerator"]).toBe("dealsWon");
    expect(r.json["denominators"]).toEqual(["dealsWon", "dealsLost"]);
  }, 60_000);

  it("404s an unknown figure and lists the ones it does have", async () => {
    const r = await owner.call("GET", "/api/crm/reports/detail/vanityMetric");
    expect(r.status).toBe(404);
    expect((r.json["known"] as string[]).length).toBeGreaterThan(20);
  }, 60_000);

  // ── The numbers themselves ────────────────────────────────────────────────

  it("counts acquisition, sales and operations exactly", async () => {
    const f = await summary();

    expect(f.get("leadsCreated")!.value).toBe(2);
    expect(f.get("dealsOpened")!.value).toBe(3);
    expect(f.get("dealsWon")!.value).toBe(1);
    expect(f.get("dealsLost")!.value).toBe(1);
    expect(f.get("contractedValue")!.value).toBe(5000);

    expect(f.get("tasksCreated")!.value).toBe(2);
    expect(f.get("tasksCompleted")!.value).toBe(1);
    expect(f.get("appointmentsScheduled")!.value).toBe(2);
    expect(f.get("appointmentsCancelled")!.value).toBe(1);

    expect(f.get("ticketsOpened")!.value).toBe(2);
    expect(f.get("ticketsResolved")!.value).toBe(1);
    expect(f.get("medianFirstResponseMinutes")!.value).toBe(5);
    // The tickets still waiting are EXCLUDED from that median, and the figure
    // admits it rather than quietly flattering itself.
    expect(f.get("medianFirstResponseMinutes")!.denominator!.value).toBe(1);
    expect(f.get("medianFirstResponseMinutes")!.limitations.join(" ")).toMatch(/EXCLUDED/);

    expect(f.get("messagesSent")!.value).toBe(3);
    expect(f.get("messagesReceived")!.value).toBe(1);
    expect(f.get("conversationsResolved")!.value).toBe(1);
    expect(f.get("campaignEmailsSent")!.value).toBe(1);
    expect(f.get("campaignSendFailures")!.value).toBe(1);
  }, 120_000);

  it("states the denominator of every rate, and gets the rate right", async () => {
    const f = await summary();

    const winRate = f.get("winRate")!;
    expect(winRate.value).toBe(50);
    expect(winRate.denominator!.value).toBe(2);
    expect(winRate.denominator!.label).toMatch(/won plus deals lost/i);

    expect(f.get("meetingCancellationRate")!.value).toBe(50);
    expect(f.get("meetingCancellationRate")!.denominator!.value).toBe(2);

    expect(f.get("ticketResolutionRate")!.value).toBe(50);
    expect(f.get("taskThroughput")!.value).toBe(50);

    // One delivered, one failed, one with no status at all. The one with no
    // status is in neither half — "the callback never arrived" is not "the
    // phone never rang".
    expect(f.get("outboundSmsWithProviderStatus")!.value).toBe(2);
    expect(f.get("outboundSmsDelivered")!.value).toBe(1);
    expect(f.get("smsDeliveryRate")!.value).toBe(50);
    expect(f.get("smsDeliveryRate")!.denominator!.value).toBe(2);
  }, 120_000);

  it("reports no rate at all, rather than 0%, when the denominator is empty", async () => {
    const r = await owner.call("GET", `/api/crm/reports/summary?from=${EMPTY_FROM}&to=${EMPTY_TO}&timezone=UTC`);
    expect(r.status).toBe(200);
    const f = flatten(r.json["areas"] as Record<string, Figure[]>);

    for (const key of ["winRate", "meetingCancellationRate", "ticketResolutionRate", "smsDeliveryRate", "taskThroughput"]) {
      const figure = f.get(key)!;
      expect(figure.denominator!.value, `${key} should have an empty denominator here`).toBe(0);
      expect(figure.value, `${key} reported a rate over nothing`).toBeNull();
      expect(figure.definition, `${key} does not explain the null`).toMatch(/null rather than 0%/);
    }
    // The counts in that window are genuinely zero, which IS a measurement.
    expect(f.get("dealsWon")!.value).toBe(0);
    expect(f.get("dealsWon")!.available).toBe(true);
  }, 120_000);

  // ── Honest gaps ───────────────────────────────────────────────────────────

  it("reports an untracked figure as unavailable rather than as zero", async () => {
    const r = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=UTC`);
    const f = flatten(r.json["areas"] as Record<string, Figure[]>);

    // Nothing links money to the campaign that produced it.
    const attributed = f.get("campaignAttributedRevenue")!;
    expect(attributed.available).toBe(false);
    expect(attributed.value).toBeNull();
    expect(attributed.unavailableReason).toMatch(/attribution/i);
    expect(attributed.wouldRequire).toBeTruthy();

    // crm_conversations records only the LAST inbound and outbound instants,
    // so the first reply to the first message is not recoverable.
    const firstReply = f.get("medianMinutesToFirstReply")!;
    expect(firstReply.available).toBe(false);
    expect(firstReply.value).toBeNull();
    expect(firstReply.unavailableReason).toMatch(/first_response_at/);

    // Open/click tracking is a webhook that is not configured here. 0% would
    // claim we measured and nobody opened anything.
    for (const key of ["campaignEmailsOpened", "campaignEmailsClicked", "campaignOpenRate", "campaignClickRate"]) {
      const figure = f.get(key)!;
      expect(figure.available, `${key} claimed to be tracked`).toBe(false);
      expect(figure.value, `${key} reported a number it cannot have`).toBeNull();
      expect(figure.unavailableReason).toMatch(/RESEND_WEBHOOK_SECRET/);
    }

    const unavailable = r.json["unavailable"] as { key: string }[];
    expect(unavailable.map((u) => u.key)).toContain("campaignOpenRate");
  }, 120_000);

  it("refuses to invent evidence for an untracked figure", async () => {
    const gap = await owner.call("GET", "/api/crm/reports/detail/campaignAttributedRevenue");
    expect(gap.status).toBe(409);
    expect(String(gap.json["reason"])).toMatch(/attribution/i);

    const ungated = await owner.call("GET", `/api/crm/reports/detail/campaignEmailsOpened?from=${DAY}&to=${DAY}`);
    expect(ungated.status).toBe(409);
    expect(String(ungated.json["reason"])).toMatch(/RESEND_WEBHOOK_SECRET/);
  }, 60_000);

  // ── Money ─────────────────────────────────────────────────────────────────

  it("counts money using TRANSACTION_RECEIVED_STATUS, and keeps pending money apart", async () => {
    const f = await summary();

    // 1500 received with a timestamp, 250 received without one, 111 late in the
    // UTC day. Pending and refunded are NOT in here.
    expect(f.get("moneyReceived")!.value).toBe(1861);
    expect(f.get("paymentsReceived")!.value).toBe(3);
    expect(f.get("moneyPending")!.value).toBe(500);
    expect(f.get("moneyRefunded")!.value).toBe(300);

    // The definition names the constant rather than a hand-typed status.
    expect(f.get("moneyReceived")!.definition).toContain(schema.TRANSACTION_RECEIVED_STATUS);
    expect(f.get("moneyReceived")!.limitations.join(" ")).toMatch(/TRANSACTION_RECEIVED_STATUS/);

    // The evidence agrees with the number.
    const d = await owner.call("GET", f.get("moneyReceived")!.detail!);
    expect(d.json["sum"]).toBe(1861);
    expect((d.json["rows"] as unknown[]).length).toBe(3);

    // And the approximation is declared, not hidden.
    expect(f.get("completedPaymentsMissingReceivedAt")!.value).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("counts a day in the timezone it says it counted it in", async () => {
    const utc = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=UTC`);
    const manila = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=Asia/Manila`);
    expect(utc.status).toBe(200);
    expect(manila.status).toBe(200);

    // The 20:30 UTC payment is 04:30 the NEXT morning in Manila, so it belongs
    // to a different day there. Same rows, same question, different answer —
    // which is exactly why the zone is stated.
    expect(flatten(utc.json["areas"] as Record<string, Figure[]>).get("moneyReceived")!.value).toBe(1861);
    expect(flatten(manila.json["areas"] as Record<string, Figure[]>).get("moneyReceived")!.value).toBe(1750);

    expect(manila.json["window"].timezone).toBe("Asia/Manila");
    expect(String(manila.json["window"].definition)).toMatch(/Asia\/Manila/);
  }, 120_000);

  it("names a bad timezone instead of failing quietly", async () => {
    const r = await owner.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}&timezone=Mars/Olympus`);
    expect(r.status).toBe(400);
    expect(String(r.json["error"])).toMatch(/IANA/);
  }, 60_000);

  it("rejects a window that ends before it starts", async () => {
    const r = await owner.call("GET", "/api/crm/reports/summary?from=2017-06-20&to=2017-06-10");
    expect(r.status).toBe(400);
  }, 60_000);

  // ── Permissions ───────────────────────────────────────────────────────────

  it("refuses a user without the reports grant", async () => {
    expect((await denied.call("GET", `/api/crm/reports/summary?from=${DAY}&to=${DAY}`)).status).toBe(403);
    expect((await denied.call("GET", `/api/crm/reports/detail/dealsWon?from=${DAY}&to=${DAY}`)).status).toBe(403);
    expect((await denied.call("GET", "/api/crm/reports/figures")).status).toBe(403);

    const anon = new Agent(() => base);
    expect((await anon.call("GET", "/api/crm/reports/summary")).status).toBe(401);
  }, 120_000);
});
