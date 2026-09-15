/**
 * Marketing delivery: one eligibility rule, and never a second copy.
 *
 * Two families of failure are driven here, and both are invisible until a
 * customer notices them:
 *
 *   ELIGIBILITY  The audience preview, the preflight and the ledger the send
 *                reads each used to apply the exclusion rules in their own
 *                loop. Three loops is three places for one rule to drift, and
 *                the one that drifts is found by somebody who unsubscribed
 *                receiving the email anyway. The first test runs all three over
 *                one fixture — suppression, unsubscribes, a per-campaign
 *                exclusion, missing and broken addresses, and duplicate inboxes
 *                — and requires the same answer, reason for reason.
 *
 *   DELIVERY     "Failed" covered both "the provider refused it" and "the
 *                provider never answered". A retry built on the first reading
 *                re-sends the second; a crash between the provider accepting a
 *                message and the row saying so left it `pending`, and the next
 *                resume mailed that person again. The rest of this file drives
 *                each of those — retry, an unknown outcome, pause mid-batch,
 *                cancel, a crash — through the real routes.
 *
 * `lib/staffMail.js` is mocked exactly as the other marketing suites mock it:
 * each address can be told what the provider says, and NOTHING here reaches a
 * real mail provider.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "marketing-delivery-admin-secret-value";
// Off unless a test turns it on and puts it back.
delete process.env.CRM_MARKETING_AUTOSEND_ENABLED;
delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

const AUTOSEND = "CRM_MARKETING_AUTOSEND_ENABLED";

// ── The mail provider, replaced ─────────────────────────────────────────────

type Failure = "not_configured" | "rejected" | "failed" | "uncertain";
interface RecordedSend { to: string; subject: string; html?: string; text: string; idempotencyKey?: string }

const sends: RecordedSend[] = [];
/** What the provider says for an address. Absent means it accepts the message. */
const answers = new Map<string, Failure | "crash" | "answered_5xx">();
/** Runs while a send is in flight — how a test lands a pause mid-batch. */
let during: ((to: string) => Promise<void>) | null = null;

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => true,
  staffMailBlockedReason: () => null,
  trySendStaffMail: async (args: RecordedSend) => {
    sends.push({
      to: args.to, subject: args.subject, html: args.html, text: args.text, idempotencyKey: args.idempotencyKey,
    });
    if (during) await during(args.to);
    const answer = answers.get(args.to);
    if (answer === "crash") {
      // The provider has the message — it was recorded above — and the process
      // dies before anything writes that down. The real `trySendStaffMail`
      // never throws, so a crash is the only way a send ends like this.
      throw new Error("simulated crash after the provider accepted the message");
    }
    if (answer === "answered_5xx") {
      // The provider received the request and answered with a server error. The
      // real staffMail files this under `failed`; nothing proves it did not go.
      return { sent: false, failure: "failed", reason: "internal_server_error: simulated 500 from the provider", configured: true };
    }
    if (answer === "failed") {
      // A connection that never opened — the one `failed` that proves nothing was sent.
      return { sent: false, failure: "failed", reason: "simulated failed: connect ECONNREFUSED 127.0.0.1:443", configured: true };
    }
    if (answer) {
      return { sent: false, failure: answer, reason: `simulated ${answer}`, configured: answer !== "not_configured" };
    }
    return { sent: true, providerId: `delivery-provider-${sends.length}` };
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

const STAMP = Date.now();
const TAG = `mktg-delivery-${STAMP}`;
const OWNER = {
  email: `mktg-delivery-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Delivery Owner",
  password: "lantern-harbour-6612",
};

const suite = TEST_DB ? describe : describe.skip;

suite("marketing delivery: one eligibility rule, and never a second copy (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let startDueCampaigns: typeof import("./crmMarketing.js").startDueCampaigns;

  const staffIds: number[] = [];
  const leadIds: number[] = [];
  const campaignIds: number[] = [];
  const suppressedAddresses: string[] = [];

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

  const goodBlocks = () => ([
    { id: "h", type: "heading", text: "Hi {{first_name|there}}", level: 1, align: "left" },
    { id: "t", type: "text", text: "A short note for {{company|your team}} about your website.", align: "left" },
    { id: "c", type: "button", text: "Book a call", url: "https://sitemintdigital.com/contact", align: "left" },
  ]);

  /** A contact, remembered for cleanup. `email` is stored exactly as given. */
  const lead = async (name: string, email: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db.insert(schema.crmLeads).values({
      name, email, company: null, status: "Qualified", source: "Manual Entry", tags: [TAG], ...extra,
    }).returning();
    leadIds.push(row.id);
    return row;
  };

  const address = (local: string) => `${local}-${STAMP}@example.test`;

  /** A draft campaign, remembered for cleanup. */
  const campaign = async (body: Record<string, unknown>) => {
    const r = await owner.call("POST", "/api/crm/marketing/campaigns", {
      subject: "A note for {{company|your team}}", blocks: goodBlocks(), ...body,
    });
    expect(r.status).toBe(201);
    const id = r.json["campaign"].id as number;
    campaignIds.push(id);
    return id;
  };

  const path = (id: number, action = "") => `/api/crm/marketing/campaigns/${id}${action ? `/${action}` : ""}`;

  const ledger = async (campaignId: number) =>
    db.select().from(schema.crmMarketingRecipients).where(eq(schema.crmMarketingRecipients.campaignId, campaignId));

  const byLead = <T extends { leadId: number }>(rows: T[]) => new Map(rows.map((r) => [r.leadId, r]));

  const sendsTo = (to: string) => sends.filter((s) => s.to === to);

  /** Runs `fn` with automatic sending set to `value`, and always puts it back. */
  const withAutosend = async <T>(value: string | undefined, fn: () => Promise<T>): Promise<T> => {
    const before = process.env[AUTOSEND];
    if (value === undefined) delete process.env[AUTOSEND]; else process.env[AUTOSEND] = value;
    try {
      return await fn();
    } finally {
      if (before === undefined) delete process.env[AUTOSEND]; else process.env[AUTOSEND] = before;
    }
  };

  /**
   * For a test that can stop part-way: nothing it started is left `sending` for
   * the scheduler tests after it to pick up, and no simulated provider answer
   * outlives it. Without this, one failure here presents as three.
   */
  const leaveNothingRunning = async (campaignId: number, simulated: string[]) => {
    for (const to of simulated) answers.delete(to);
    await db.update(schema.crmMarketingCampaigns)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(
        eq(schema.crmMarketingCampaigns.id, campaignId),
        inArray(schema.crmMarketingCampaigns.status, ["sending", "scheduled"]),
      ));
  };

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    ({ startDueCampaigns } = await import("./crmMarketing.js"));
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [ownerRow] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffIds.push(ownerRow.id);
    expect(await owner.login(OWNER)).toBe(200);
  }, 180_000);

  afterAll(async () => {
    delete process.env[AUTOSEND];
    if (campaignIds.length) {
      await db.delete(schema.crmMarketingRecipients).where(inArray(schema.crmMarketingRecipients.campaignId, campaignIds));
      await db.delete(schema.crmMarketingExclusions).where(inArray(schema.crmMarketingExclusions.campaignId, campaignIds));
      await db.delete(schema.crmMarketingCampaigns).where(inArray(schema.crmMarketingCampaigns.id, campaignIds));
    }
    if (suppressedAddresses.length) {
      await db.delete(schema.crmEmailSuppressions)
        .where(inArray(schema.crmEmailSuppressions.address, suppressedAddresses));
    }
    if (leadIds.length) {
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    for (const id of staffIds) await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── One eligibility rule ──────────────────────────────────────────────────

  it("gives the same people, for the same reasons, from the audience preview, the preflight and the send's own ledger", async () => {
    const group = `${TAG}-eligibility`;
    const member = (name: string, email: string) => lead(name, email, { tags: [TAG, group] });

    const ok = await member("Ana Able", address("ana"));
    const bounced = await member("Ben Bounce", address("ben"));
    const unsubscribed = await member("Una Unsub", address("una"));
    const excluded = await member("Eli Excluded", address("eli"));
    const noAddress = await member("Nia Nothing", "");
    const brokenAddress = await member("Bo Broken", `not-an-address-${STAMP}`);
    // One inbox, three records, three spellings of it. The oldest is kept.
    const twinInbox = address("twin");
    const twin1 = await member("Tess Twin One", twinInbox.toUpperCase());
    const twin2 = await member("Tess Twin Two", ` ${twinInbox} `);
    const twin3 = await member("Tess Twin Three", twinInbox);
    // A shared inbox that opted out: suppression is judged before duplicates,
    // so every row says "unsubscribed" and none says "duplicate".
    const optedInbox = address("opted");
    const opted1 = await member("Olu Opted One", optedInbox);
    const opted2 = await member("Olu Opted Two", optedInbox);
    // A shared inbox whose OLDEST record was deliberately left out of this
    // campaign. That person reads the inbox, so nobody at it is sent this.
    const heldInbox = address("held");
    const held1 = await member("Hal Held One", heldInbox);
    const held2 = await member("Hal Held Two", heldInbox);

    await db.insert(schema.crmEmailSuppressions).values([
      { address: address("ben"), reason: "bounce", bounceType: "permanent", detail: "Mailbox does not exist.", source: "provider" },
      { address: address("una"), reason: "unsubscribe", detail: "Asked to stop.", source: "staff" },
      { address: optedInbox, reason: "unsubscribe", detail: "Asked to stop.", source: "recipient" },
    ]).onConflictDoNothing();
    suppressedAddresses.push(address("ben"), address("una"), optedInbox);

    const definition = { match: "all", conditions: [{ field: "tag", operator: "has_tag", value: group }] };
    const id = await campaign({ name: `[CRM-TEST] One rule ${STAMP}`, audienceMode: "filter", audienceDefinition: definition });
    for (const who of [excluded, held1]) {
      const r = await owner.call("POST", path(id, "exclusions"), { leadId: who.id, reason: "Left out on purpose." });
      expect(r.status).toBe(201);
    }

    const audience = [
      ok, bounced, unsubscribed, excluded, noAddress, brokenAddress,
      twin1, twin2, twin3, opted1, opted2, held1, held2,
    ].map((l) => l.id);

    type Buckets = { reason: string; contacts: { id?: number; leadId?: number; detail?: string | null }[] }[];
    /** Every contact → its exclusion reason (null when mailed) and the words given. */
    const view = (eligibleIds: number[], buckets: Buckets) => {
      const reasons: Record<number, string | null> = {};
      const details: Record<number, string | null> = {};
      for (const leadId of audience) {
        if (eligibleIds.includes(leadId)) { reasons[leadId] = null; details[leadId] = null; continue; }
        const bucket = buckets.find((b) => b.contacts.some((c) => (c.id ?? c.leadId) === leadId));
        const contact = bucket?.contacts.find((c) => (c.id ?? c.leadId) === leadId);
        // A contact in neither list is the silent drop; it must fail loudly.
        reasons[leadId] = bucket?.reason ?? "MISSING FROM THIS ANSWER";
        details[leadId] = contact?.detail ?? null;
      }
      return { reasons, details };
    };

    // 1. The audience preview the builder shows.
    const preview = await owner.call("POST", "/api/crm/marketing/audience/preview", {
      audienceMode: "filter", audienceDefinition: definition, campaignId: id,
    });
    expect(preview.status).toBe(200);
    expect(preview.json["audienceSize"]).toBe(audience.length);
    expect(preview.json["eligibleShown"]).toBe(preview.json["eligibleCount"]);
    const fromPreview = view((preview.json["eligible"] as any[]).map((c) => c.id), preview.json["excludedByReason"]);

    // 2. The preflight in front of the Send button.
    const check = await owner.call("GET", path(id, "preflight"));
    expect(check.status).toBe(200);
    expect(check.json["audienceSize"]).toBe(audience.length);
    const preflightBuckets = check.json["excludedByReason"] as Buckets;
    const preflightExcluded = new Set(preflightBuckets.flatMap((b) => b.contacts.map((c) => c.id)));
    const preflightEligible = audience.filter((leadId) => !preflightExcluded.has(leadId));
    expect(check.json["sendable"]).toBe(preflightEligible.length);
    const fromPreflight = view(preflightEligible, preflightBuckets);

    // 3. The ledger the send itself reads.
    const before = sends.length;
    const sent = await owner.call("POST", path(id, "send"), { batchSize: 200 });
    expect(sent.status).toBe(200);
    const rows = await ledger(id);
    expect(rows.map((r) => r.leadId).sort((a, b) => a - b)).toEqual([...audience].sort((a, b) => a - b));
    const fromLedger = {
      reasons: Object.fromEntries(rows.map((r) => [r.leadId, r.status === "excluded" ? r.exclusionReason : null])),
      details: Object.fromEntries(rows.map((r) => [r.leadId, r.status === "excluded" ? r.exclusionDetail : null])),
    };

    // The same people, the same reasons and the same words, from all three.
    expect(fromPreflight.reasons).toEqual(fromPreview.reasons);
    expect(fromLedger.reasons).toEqual(fromPreview.reasons);
    expect(fromPreflight.details).toEqual(fromPreview.details);
    expect(fromLedger.details).toEqual(fromPreview.details);

    // And the answer they agree on is the rule as written.
    expect(fromLedger.reasons).toEqual({
      [ok.id]: null,
      [bounced.id]: "suppressed",
      [unsubscribed.id]: "unsubscribed",
      [excluded.id]: "campaign_excluded",
      [noAddress.id]: "no_address",
      [brokenAddress.id]: "no_address",
      [twin1.id]: null,
      [twin2.id]: "duplicate_address",
      [twin3.id]: "duplicate_address",
      [opted1.id]: "unsubscribed",
      [opted2.id]: "unsubscribed",
      [held1.id]: "campaign_excluded",
      [held2.id]: "duplicate_address",
    });
    // A duplicate names the contact that decided it.
    expect(fromLedger.details[twin2.id]).toContain(twinInbox);
    expect(fromLedger.details[twin2.id]).toContain(`#${twin1.id}`);
    expect(fromLedger.details[held2.id]).toContain(`#${held1.id}`);
    expect(fromLedger.details[held2.id]).toMatch(/Nobody at this address/i);

    // One copy per inbox that may be mailed, and nothing to anybody else.
    expect(sends.slice(before).map((s) => s.to).sort()).toEqual([address("ana"), twinInbox].sort());
  }, 180_000);

  // ── What the provider said, and what a retry may do about it ──────────────

  const outcomeLeads: Record<string, { id: number; email: string }> = {};
  let outcomeCampaign = 0;

  it("records what the provider said for each person, and says which ones may have arrived", async () => {
    for (const key of ["accepted", "rejected", "failed", "not_configured", "uncertain", "answered_5xx"]) {
      outcomeLeads[key] = await lead(`Outcome ${key}`, address(`outcome-${key.replace("_", "-")}`));
    }
    for (const key of ["rejected", "failed", "not_configured", "uncertain", "answered_5xx"] as const) {
      answers.set(outcomeLeads[key].email, key);
    }

    outcomeCampaign = await campaign({
      name: `[CRM-TEST] Outcomes ${STAMP}`,
      audienceMode: "list", audienceLeadIds: Object.values(outcomeLeads).map((l) => l.id),
    });
    const sent = await owner.call("POST", path(outcomeCampaign, "send"), { batchSize: 50 });
    expect(sent.status).toBe(200);
    expect(sent.json).toMatchObject({ attempted: 6, sent: 1, failed: 5, notDelivered: 3, unconfirmed: 2, finished: true });

    const results = await owner.call("GET", path(outcomeCampaign, "results"));
    expect(results.status).toBe(200);
    const buckets = Object.fromEntries((results.json["failedByOutcome"] as any[]).map((b) => [b.outcome, b]));
    expect(Object.keys(buckets).sort()).toEqual(["failed", "not_configured", "rejected", "uncertain"]);
    for (const key of ["rejected", "failed", "not_configured"]) {
      expect(buckets[key]).toMatchObject({ count: 1, arrived: "no", retryable: true });
      expect(buckets[key].contacts[0].leadId).toBe(outcomeLeads[key].id);
    }
    // The two that must never read as "it did not arrive": no answer at all, and
    // a 5xx — an answer from a server that already had the request. staffMail
    // files the 5xx under `failed`; it is stored and reported as unknown.
    expect(buckets["uncertain"]).toMatchObject({ count: 2, arrived: "unknown", retryable: false });
    expect(buckets["uncertain"].contacts.map((c: any) => c.leadId).sort()).toEqual(
      [outcomeLeads["uncertain"].id, outcomeLeads["answered_5xx"].id].sort(),
    );
    const [fiveXX] = await db.select().from(schema.crmMarketingRecipients).where(and(
      eq(schema.crmMarketingRecipients.campaignId, outcomeCampaign),
      eq(schema.crmMarketingRecipients.leadId, outcomeLeads["answered_5xx"].id),
    ));
    expect(fiveXX?.lastError).toMatch(/^uncertain: /);
    expect(results.json["deliverySignal"]).toMatchObject({ notDelivered: 3, unconfirmed: 2, retryable: 3 });
    expect(String(results.json["deliverySignal"].unconfirmedNote)).toMatch(/whether it arrived is unknown/i);
    expect(String(results.json["deliverySignal"].unconfirmedNote)).toMatch(/sent again automatically/i);
  }, 120_000);

  it("tries again once for each person the provider refused or did not take, under the same key — and never for an unknown outcome", async () => {
    const firstKeys = new Map(
      sends.filter((s) => Object.values(outcomeLeads).some((l) => l.email === s.to)).map((s) => [s.to, s.idempotencyKey]),
    );
    // The provider would now accept every one of them — including the unknown
    // one, which is exactly why "it would work now" must not be what decides.
    for (const l of Object.values(outcomeLeads)) answers.delete(l.email);

    const before = sends.length;
    const retry = await owner.call("POST", path(outcomeCampaign, "retry"), {});
    expect(retry.status).toBe(200);
    expect(retry.json).toMatchObject({ attempted: 3, sent: 3, failed: 0, remaining: 0, finished: true, unconfirmedLeftOut: 2 });
    expect(retry.json["campaign"].status).toBe("sent");

    const retried = sends.slice(before);
    expect(retried.map((s) => s.to).sort()).toEqual(
      [outcomeLeads["rejected"].email, outcomeLeads["failed"].email, outcomeLeads["not_configured"].email].sort(),
    );
    // The same key as the first attempt, so the provider can collapse a repeat.
    for (const s of retried) expect(s.idempotencyKey).toBe(firstKeys.get(s.to));

    // A second press finds nothing left to try, and sends nothing.
    const again = await owner.call("POST", path(outcomeCampaign, "retry"), {});
    expect(again.status).toBe(200);
    expect(again.json["attempted"]).toBe(0);
    expect(sends.length).toBe(before + 3);

    // The accepted one and the two unknown ones were each attempted once, ever.
    expect(sendsTo(outcomeLeads["accepted"].email)).toHaveLength(1);
    expect(sendsTo(outcomeLeads["uncertain"].email)).toHaveLength(1);
    expect(sendsTo(outcomeLeads["answered_5xx"].email)).toHaveLength(1);
    const results = await owner.call("GET", path(outcomeCampaign, "results"));
    expect(results.json["counts"].sent).toBe(4);
    expect(results.json["deliverySignal"]).toMatchObject({ unconfirmed: 2, notDelivered: 0, retryable: 0 });
  }, 120_000);

  it("sends each message once when two people press Try again at the same moment", async () => {
    const a = await lead("Race A", address("race-a"));
    const b = await lead("Race B", address("race-b"));
    answers.set(a.email, "failed");
    answers.set(b.email, "failed");
    const id = await campaign({ name: `[CRM-TEST] Race ${STAMP}`, audienceMode: "list", audienceLeadIds: [a.id, b.id] });
    const first = await owner.call("POST", path(id, "send"), {});
    expect(first.json["notDelivered"]).toBe(2);
    answers.delete(a.email);
    answers.delete(b.email);

    // Each provider call is held open, so both requests are inside the loop
    // together and both have read the same two rows.
    during = () => new Promise((resolve) => setTimeout(resolve, 150));
    const before = sends.length;
    try {
      const [one, two] = await Promise.all([
        owner.call("POST", path(id, "retry"), {}),
        owner.call("POST", path(id, "retry"), {}),
      ]);
      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(one.json["attempted"] + two.json["attempted"]).toBe(2);
    } finally {
      during = null;
    }
    expect(sends.slice(before).filter((s) => s.to === a.email)).toHaveLength(1);
    expect(sends.slice(before).filter((s) => s.to === b.email)).toHaveLength(1);
  }, 120_000);

  it("never sends an unknown outcome again by itself — not from the scheduler, not on resume, not on retry", async () => {
    const unknown = await lead("Unknown First", address("unknown-first"));
    const waiting = await lead("Waiting Second", address("waiting-second"));
    answers.set(unknown.email, "uncertain");
    const id = await campaign({
      name: `[CRM-TEST] Unknown ${STAMP}`, audienceMode: "list", audienceLeadIds: [unknown.id, waiting.id],
    });
    try {
      const first = await owner.call("POST", path(id, "send"), { batchSize: 1 });
      expect(first.json).toMatchObject({ attempted: 1, unconfirmed: 1, remaining: 1 });
      expect(first.json["campaign"].status).toBe("sending");
      answers.delete(unknown.email);

      // The scheduler advances a send that is under way. It takes the person who
      // was never attempted, and leaves the unknown one alone.
      const advanced = await withAutosend("true", () => startDueCampaigns(new Date(), 50));
      expect(advanced.find((r) => r.campaignId === id)).toMatchObject({ started: true, sent: 1, unconfirmed: 0, remaining: 0 });

      expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
      expect((await owner.call("POST", path(id, "retry"), {})).json["attempted"]).toBe(0);

      expect(sendsTo(unknown.email)).toHaveLength(1);
      expect(sendsTo(waiting.email)).toHaveLength(1);
      const row = byLead(await ledger(id)).get(unknown.id);
      expect(row?.status).toBe("failed");
      expect(String(row?.lastError)).toMatch(/^uncertain:/);
    } finally {
      await leaveNothingRunning(id, [unknown.email]);
    }
  }, 120_000);

  it("stops the moment it is paused: nobody after that point is claimed, attempted or sent to", async () => {
    const people = [];
    for (const key of ["one", "two", "three"]) people.push(await lead(`Pause ${key}`, address(`pause-${key}`)));
    const id = await campaign({ name: `[CRM-TEST] Pause ${STAMP}`, audienceMode: "list", audienceLeadIds: people.map((p) => p.id) });

    const pause: { status?: number } = {};
    during = async () => {
      during = null; // the first send only
      pause.status = (await owner.call("POST", path(id, "pause"), {})).status;
    };
    const before = sends.length;
    let run: { status: number; json: Record<string, any> };
    try {
      run = await owner.call("POST", path(id, "send"), { batchSize: 50 });
    } finally {
      during = null;
    }
    expect(pause.status).toBe(200);
    expect(run.status).toBe(200);
    expect(run.json).toMatchObject({ attempted: 1, sent: 1, remaining: 2 });
    expect(String(run.json["stoppedBecause"])).toMatch(/paused/i);
    expect(run.json["campaign"].status).toBe("paused");
    expect(sends.length).toBe(before + 1);

    // The two after the pause are untouched — not claimed, not marked unknown.
    const rows = await ledger(id);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(2);
    expect(rows.filter((r) => r.status === "pending").every((r) => r.lastError === null)).toBe(true);

    // Paused means stop, for every route that could send.
    expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
    expect((await owner.call("POST", path(id, "retry"), {})).status).toBe(409);
    expect(sends.length).toBe(before + 1);

    // Resuming carries on with the two never attempted, and nobody else.
    expect((await owner.call("POST", path(id, "resume"), {})).status).toBe(200);
    const rest = await owner.call("POST", path(id, "send"), { batchSize: 50 });
    expect(rest.json).toMatchObject({ attempted: 2, sent: 2, finished: true });
    for (const p of people) expect(sendsTo(p.email)).toHaveLength(1);
  }, 120_000);

  it("cancels without claiming anything was un-sent, and never calls an unknown outcome 'nobody received it'", async () => {
    const unknown = await lead("Cancel Unknown", address("cancel-unknown"));
    const waiting = await lead("Cancel Waiting", address("cancel-waiting"));
    answers.set(unknown.email, "uncertain");
    const id = await campaign({
      name: `[CRM-TEST] Cancel ${STAMP}`, audienceMode: "list", audienceLeadIds: [unknown.id, waiting.id],
    });
    expect((await owner.call("POST", path(id, "send"), { batchSize: 1 })).json["unconfirmed"]).toBe(1);

    const cancelled = await owner.call("POST", path(id, "cancel"), {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.json).toMatchObject({ unsent: false, alreadyDelivered: 0, unconfirmed: 1, neverAttempted: 1 });
    expect(String(cancelled.json["note"])).toMatch(/may or may not have arrived/i);
    expect(String(cancelled.json["note"])).not.toMatch(/nobody received/i);

    // Cancelling rewrites no history.
    const rows = byLead(await ledger(id));
    expect(rows.get(unknown.id)?.status).toBe("failed");
    expect(String(rows.get(unknown.id)?.lastError)).toMatch(/^uncertain:/);
    expect(rows.get(waiting.id)?.status).toBe("pending");

    expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
    expect((await owner.call("POST", path(id, "retry"), {})).status).toBe(409);
    expect(sendsTo(unknown.email)).toHaveLength(1);
    expect(sendsTo(waiting.email)).toHaveLength(0);
    answers.delete(unknown.email);
  }, 120_000);

  it("resumes a crashed send without sending anybody a second copy", async () => {
    const a = await lead("Crash A", address("crash-a"));
    const b = await lead("Crash B", address("crash-b"));
    const c = await lead("Crash C", address("crash-c"));
    answers.set(b.email, "crash");
    const id = await campaign({ name: `[CRM-TEST] Crash ${STAMP}`, audienceMode: "list", audienceLeadIds: [a.id, b.id, c.id] });

    try {
      const crashed = await owner.call("POST", path(id, "send"), { batchSize: 50 });
      expect(crashed.status).toBeGreaterThanOrEqual(500);

      const mid = byLead(await ledger(id));
      expect(mid.get(a.id)?.status).toBe("sent");
      // The person the process died on is NOT back to pending, where the next
      // resume would mail them again. It is recorded as unknown.
      expect(mid.get(b.id)?.status).toBe("failed");
      expect(String(mid.get(b.id)?.lastError)).toMatch(/^uncertain:/);
      expect(mid.get(c.id)?.status).toBe("pending");
      expect((await db.select().from(schema.crmMarketingCampaigns).where(eq(schema.crmMarketingCampaigns.id, id)))[0].status)
        .toBe("sending");

      answers.delete(b.email);
      const resumed = await owner.call("POST", path(id, "send"), { batchSize: 50 });
      expect(resumed.status).toBe(200);
      expect(resumed.json).toMatchObject({ attempted: 1, sent: 1, finished: true });

      expect(sendsTo(a.email)).toHaveLength(1);
      expect(sendsTo(b.email)).toHaveLength(1);
      expect(sendsTo(c.email)).toHaveLength(1);

      const results = await owner.call("GET", path(id, "results"));
      const unknownBucket = (results.json["failedByOutcome"] as any[]).find((x) => x.outcome === "uncertain");
      expect(unknownBucket.contacts.map((x: any) => x.leadId)).toEqual([b.id]);
      expect((await owner.call("POST", path(id, "retry"), {})).json["attempted"]).toBe(0);
      expect(sendsTo(b.email)).toHaveLength(1);
    } finally {
      await leaveNothingRunning(id, [b.email]);
    }
  }, 120_000);

  // ── Approvals, scheduling, cancellation ───────────────────────────────────

  it("will not schedule or send AI copy nobody approved — including a copy of a campaign that was approved", async () => {
    const reader = await lead("Approval Reader", address("approval"));
    const id = await campaign({ name: `[CRM-TEST] AI gate ${STAMP}`, audienceMode: "list", audienceLeadIds: [reader.id] });
    await db.update(schema.crmMarketingCampaigns)
      .set({ aiContentState: "draft", aiDraftedAt: new Date() })
      .where(eq(schema.crmMarketingCampaigns.id, id));

    const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const schedule = await owner.call("POST", path(id, "schedule"), { scheduledAt: later, timezone: "UTC" });
    expect(schedule.status).toBe(409);
    expect(JSON.stringify(schedule.json["blockers"])).toMatch(/nobody has approved/i);
    expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
    expect(await ledger(id)).toHaveLength(0);

    expect((await owner.call("POST", path(id, "ai-draft/approve"), {})).status).toBe(200);

    // A copy carries the AI-written text. It does not carry anybody's approval.
    const copy = await owner.call("POST", path(id, "duplicate"), {});
    expect(copy.status).toBe(201);
    const copyId = copy.json["campaign"].id as number;
    campaignIds.push(copyId);
    expect(copy.json["campaign"].aiContentState).toBe("draft");
    expect(copy.json["campaign"].aiApprovedAt).toBeNull();
    const copyCheck = await owner.call("GET", path(copyId, "preflight"));
    expect(copyCheck.json["canSend"]).toBe(false);
    expect(JSON.stringify(copyCheck.json["blockers"])).toMatch(/nobody has approved/i);
    expect((await owner.call("POST", path(copyId, "send"), {})).status).toBe(409);
    expect((await owner.call("POST", path(copyId, "schedule"), { scheduledAt: later })).status).toBe(409);

    // The original, approved by a named person, can now be scheduled.
    expect((await owner.call("POST", path(id, "schedule"), { scheduledAt: later, timezone: "UTC" })).status).toBe(200);
    expect((await owner.call("POST", path(id, "schedule"), { scheduledAt: null })).status).toBe(200);
    expect(sendsTo(reader.email)).toHaveLength(0);
  }, 120_000);

  it("cancels a scheduled campaign before it starts, and nothing starts it afterwards", async () => {
    const reader = await lead("Scheduled Then Cancelled", address("scheduled-cancelled"));
    const id = await campaign({ name: `[CRM-TEST] Cancel before start ${STAMP}`, audienceMode: "list", audienceLeadIds: [reader.id] });
    const due = new Date(Date.now() - 60_000).toISOString();
    expect((await owner.call("POST", path(id, "schedule"), { scheduledAt: due, timezone: "UTC" })).status).toBe(200);

    const cancelled = await owner.call("POST", path(id, "cancel"), {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.json["campaign"].status).toBe("cancelled");
    expect(String(cancelled.json["note"])).toMatch(/nobody received this campaign/i);

    const started = await withAutosend("true", () => startDueCampaigns(new Date(), 50));
    expect(started.some((r) => r.campaignId === id)).toBe(false);
    expect(await ledger(id)).toHaveLength(0);
    expect(sendsTo(reader.email)).toHaveLength(0);
    expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
  }, 120_000);

  it("starts a due scheduled campaign on its own only when the switch is exactly \"true\", and never one needing approval", async () => {
    const goReader = await lead("Autosend Go", address("autosend-go"));
    const heldReader = await lead("Autosend Held", address("autosend-held"));
    const due = new Date(Date.now() - 60_000).toISOString();

    const go = await campaign({ name: `[CRM-TEST] Autosend go ${STAMP}`, audienceMode: "list", audienceLeadIds: [goReader.id] });
    expect((await owner.call("POST", path(go, "schedule"), { scheduledAt: due, timezone: "UTC" })).status).toBe(200);
    const held = await campaign({ name: `[CRM-TEST] Autosend held ${STAMP}`, audienceMode: "list", audienceLeadIds: [heldReader.id] });
    expect((await owner.call("POST", path(held, "schedule"), { scheduledAt: due, timezone: "UTC" })).status).toBe(200);
    // AI copy arrives AFTER it was scheduled: readiness is re-checked at start.
    await db.update(schema.crmMarketingCampaigns)
      .set({ aiContentState: "draft", aiDraftedAt: new Date() })
      .where(eq(schema.crmMarketingCampaigns.id, held));

    const statusOf = async (campaignId: number) =>
      (await db.select().from(schema.crmMarketingCampaigns).where(eq(schema.crmMarketingCampaigns.id, campaignId)))[0].status;

    try {
      for (const value of [undefined, "", "1", "TRUE", "yes", " true"]) {
        expect(await withAutosend(value, () => startDueCampaigns(new Date(), 50)), `${JSON.stringify(value)} must not start anything`)
          .toEqual([]);
      }
      expect(await statusOf(go)).toBe("scheduled");
      expect(await ledger(go)).toHaveLength(0);
      expect(sendsTo(goReader.email)).toHaveLength(0);

      const started = await withAutosend("true", () => startDueCampaigns(new Date(), 50));
      const byId = new Map(started.map((r) => [r.campaignId, r]));
      expect(byId.get(go)).toMatchObject({ started: true, sent: 1, remaining: 0 });
      expect(byId.get(held)?.started).toBe(false);
      expect(String(byId.get(held)?.reason)).toMatch(/approved/i);

      expect(await statusOf(go)).toBe("sent");
      expect(sendsTo(goReader.email)).toHaveLength(1);
      expect(await statusOf(held)).toBe("scheduled");
      expect(await ledger(held)).toHaveLength(0);
      expect(sendsTo(heldReader.email)).toHaveLength(0);
    } finally {
      // Never leave a due campaign behind for a later run to find.
      await owner.call("POST", path(held, "schedule"), { scheduledAt: null });
    }
  }, 120_000);

  // ── Personalisation ───────────────────────────────────────────────────────

  it("renders the preview exactly as it is sent — merge fields, fallbacks and branding included — and warns before sending", async () => {
    const full = await lead("Dana Okafor", address("render-full"), { company: "Okafor Ltd" });
    const sparse = await lead("Rune", address("render-sparse"));
    const id = await campaign({
      name: `[CRM-TEST] Render ${STAMP}`,
      audienceMode: "list", audienceLeadIds: [full.id, sparse.id],
      subject: "A note for {{company|your team}}",
      preheader: "Hi {{first_name|there}}, ten minutes?",
      blocks: [
        { id: "h", type: "heading", text: "Hi {{first_name|there}}", level: 1, align: "left" },
        { id: "t", type: "text", text: "We work with businesses like {{company|yours}}.", align: "left" },
        { id: "c", type: "button", text: "Book a call", url: "https://sitemintdigital.com/contact", align: "left" },
      ],
    });

    // Warned about BEFORE anything is sent: no ledger exists yet.
    const check = await owner.call("GET", path(id, "preflight"));
    expect(check.json["canSend"]).toBe(true);
    expect(await ledger(id)).toHaveLength(0);
    expect((check.json["fallbackWarnings"] as any[]).find((w) => w.field === "company")).toMatchObject({ count: 1, share: 50 });

    const previews = new Map<string, Record<string, any>>();
    for (const who of [full, sparse]) {
      const p = await owner.call("GET", `${path(id, "preview")}?leadId=${who.id}`);
      expect(p.status).toBe(200);
      previews.set(who.email, p.json);
    }
    expect(previews.get(full.email)?.["subject"]).toBe("A note for Okafor Ltd");
    expect(previews.get(sparse.email)?.["subject"]).toBe("A note for your team");
    expect(String(previews.get(sparse.email)?.["html"])).toContain("Hi Rune");
    expect(previews.get(sparse.email)?.["fallbacksUsed"]).toEqual(["company"]);

    const before = sends.length;
    const sent = await owner.call("POST", path(id, "send"), {});
    expect(sent.json["sent"]).toBe(2);
    const rows = byLead(await ledger(id));

    for (const who of [full, sparse]) {
      const preview = previews.get(who.email)!;
      const delivered = sends.slice(before).filter((s) => s.to === who.email);
      expect(delivered).toHaveLength(1);
      // Byte for byte: what was approved is what went out, and what is recorded.
      expect(delivered[0].subject).toBe(preview["subject"]);
      expect(delivered[0].html).toBe(preview["html"]);
      expect(delivered[0].text).toBe(preview["text"]);
      expect(rows.get(who.id)?.renderedSubject).toBe(preview["subject"]);
      expect(rows.get(who.id)?.renderedHtml).toBe(preview["html"]);
      // Branded, with a way out, and no raw token left in it.
      expect(delivered[0].html).toContain("SiteMint");
      expect(delivered[0].html).toMatch(/unsubscribe/i);
      expect(delivered[0].html).not.toContain("{{");
    }
  }, 120_000);

  it("refuses, before anything is sent, a merge token with no fallback or a field that does not exist", async () => {
    const reader = await lead("Cy Token", address("token-gate"));
    const id = await campaign({
      name: `[CRM-TEST] Token gate ${STAMP}`, audienceMode: "list", audienceLeadIds: [reader.id],
      subject: "Hello {{frist_name|there}}",
      blocks: [{ id: "h", type: "heading", text: "Hi {{company}}", level: 1, align: "left" }],
    });
    const check = await owner.call("GET", path(id, "preflight"));
    expect(check.json["canSend"]).toBe(false);
    const blockers = JSON.stringify(check.json["blockers"]);
    expect(blockers).toMatch(/frist_name.*is not a merge field/i);
    expect(blockers).toMatch(/company.*has no fallback/i);
    expect((await owner.call("POST", path(id, "send"), {})).status).toBe(409);
    expect(await ledger(id)).toHaveLength(0);
    expect(sendsTo(reader.email)).toHaveLength(0);
  }, 60_000);

  // ── Honest reporting ──────────────────────────────────────────────────────

  it("reports counts equal to their lists, splits failures by what is known, and shows no open rate", async () => {
    const people: Record<string, { id: number; email: string }> = {};
    for (const key of ["sent1", "sent2", "refused", "unknown", "waiting", "left-out"]) {
      people[key] = await lead(`Report ${key}`, address(`report-${key}`));
    }
    answers.set(people["refused"].email, "rejected");
    answers.set(people["unknown"].email, "uncertain");
    const id = await campaign({
      name: `[CRM-TEST] Report ${STAMP}`, audienceMode: "list", audienceLeadIds: Object.values(people).map((p) => p.id),
    });
    await owner.call("POST", path(id, "exclusions"), { leadId: people["left-out"].id, reason: "Not this one." });
    // Four attempted, one never reached, one left out.
    expect((await owner.call("POST", path(id, "send"), { batchSize: 4 })).json["remaining"]).toBe(1);
    const cancelled = await owner.call("POST", path(id, "cancel"), {});
    expect(cancelled.status).toBe(200);
    answers.delete(people["refused"].email);
    answers.delete(people["unknown"].email);

    const results = await owner.call("GET", path(id, "results"));
    expect(results.status).toBe(200);
    const r = results.json;
    const rows = r["recipients"] as any[];
    const of = (s: string) => rows.filter((x) => x.status === s);

    expect(r["counts"]).toMatchObject({ sent: 2, failed: 2, excluded: 1, neverAttempted: 1, audience: 6 });
    expect(r["counts"].sent).toBe(of("sent").length);
    expect(r["counts"].failed).toBe(of("failed").length);
    expect(r["counts"].excluded).toBe(of("excluded").length);
    expect(r["counts"].neverAttempted).toBe(of("pending").length);
    expect(r["counts"].audience).toBe(r["counts"].sent + r["counts"].failed + r["counts"].excluded + r["counts"].neverAttempted);

    // Every failed row is in exactly one outcome bucket, and the buckets add up.
    const buckets = r["failedByOutcome"] as any[];
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(r["counts"].failed);
    for (const b of buckets) expect(b.contacts).toHaveLength(b.count);
    expect(buckets.flatMap((b) => b.contacts.map((c: any) => c.id)).sort()).toEqual(of("failed").map((x) => x.id).sort());
    expect(r["deliverySignal"].unconfirmed + r["deliverySignal"].notDelivered).toBe(r["counts"].failed);
    expect(r["deliverySignal"]).toMatchObject({ unconfirmed: 1, notDelivered: 1 });

    // The counts the cancel route took in SQL agree with the rows read here.
    expect(cancelled.json).toMatchObject({
      alreadyDelivered: r["counts"].sent,
      neverAttempted: r["counts"].neverAttempted,
      unconfirmed: r["deliverySignal"].unconfirmed,
      notDelivered: r["deliverySignal"].notDelivered,
    });

    // Nothing tracks opens or clicks, so nothing reports a number for them.
    expect(r["engagement"]).toMatchObject({ tracked: false, opens: null, clicks: null, openRate: null, clickRate: null });
    expect(String(r["engagement"].unavailableReason)).toMatch(/tracking domain/i);
    expect(String(r["engagement"].why)).toMatch(/no custom tracking domain/i);
    expect(String(r["engagement"].why)).toMatch(/never proof that a person read/i);
    expect(String(r["deliverySignal"].meaning)).toMatch(/not a delivery confirmation/i);
  }, 120_000);
});
