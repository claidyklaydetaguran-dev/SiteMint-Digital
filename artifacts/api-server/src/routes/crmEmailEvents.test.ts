/**
 * Provider delivery and engagement events: one trustworthy intake, and what
 * each event means for the record it belongs to.
 *
 * The failures driven here are the ones that make delivery reporting worse
 * than none at all:
 *
 *   FORGERY AND REPLAY.  The signature is the only authentication this route
 *   has. A tampered body, a stale capture and a replayed delivery each get
 *   their own test, and the replay must be answered 200 with nothing written —
 *   4xx would make the provider keep retrying something we already have.
 *
 *   DOUBLE COUNTING.  One open counted eight times is not a measurement. The
 *   dedupe is driven both ways: the same delivery id again, and the same event
 *   arriving under a NEW delivery id, which is what a dashboard replay looks
 *   like.
 *
 *   AN UNKNOWN OUTCOME READ AS A FAILURE.  `docs/crm-ops/DELIVERY-GUARANTEE.md`
 *   is binding: a send nobody could observe is never retried by a machine and
 *   never recorded as failed. A `delivered` event is the one thing that
 *   resolves it, and only `delivered` — an `opened` or a `sent` must change
 *   nothing, or the guarantee becomes a preference.
 *
 *   A LOST EVENT.  The provider retries a finite number of times and then the
 *   event is gone. Every event is stored before it is interpreted, and an
 *   interpretation that cannot finish yet is retried from the stored row with
 *   no signature involved.
 *
 * Signatures are REAL: the test signs with svix exactly as Resend does.
 * Nothing here reaches a network.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, like, sql } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "email-events-admin-secret-value";

const STAMP = Date.now();
/** A signing secret is "whsec_" + base64. Generated so the test signs with the key the server verifies with. */
const SIGNING_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
process.env.RESEND_WEBHOOK_SECRET = SIGNING_SECRET;
/**
 * A sending domain unique to this run. Engagement evidence is per domain, so
 * this keeps the events this suite writes from deciding what any other suite —
 * or any other run of this one — reports as measured.
 */
const SENDING_DOMAIN = `events-${STAMP}.test`;
process.env.RESEND_FROM_EMAIL = `SiteMint Test <noreply@${SENDING_DOMAIN}>`;

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../../..");
const SQL_FILE = path.join(REPO_ROOT, "docs/crm-ops/schema/M6-email-provider-events.sql");

const OWNER = {
  email: `events-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Events Owner",
  password: "harbour-trellis-5521",
};

const suite = TEST_DB ? describe : describe.skip;

suite("provider delivery and engagement events (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let events: typeof import("../lib/emailProviderEvents.js");

  let staffId = 0;
  let leadId = 0;
  const createdLeadIds: number[] = [];
  const createdCampaignIds: number[] = [];
  const createdMarketingCampaignIds: number[] = [];
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
      try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
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

  // ── The provider, as it actually posts ────────────────────────────────────

  const providerId = (tag: string) => `re_${tag}_${STAMP}`;

  /** A payload in Resend's documented shape. */
  function payloadFor(type: string, over: {
    emailId?: string; ref?: string | null; to?: string; at?: Date; link?: string;
    bounce?: Record<string, string>; failed?: Record<string, string>; from?: string;
  } = {}): Record<string, unknown> {
    const at = over.at ?? new Date();
    const data: Record<string, unknown> = {
      created_at: new Date(at.getTime() - 60_000).toISOString(),
      email_id: over.emailId ?? providerId("generic"),
      from: over.from ?? `SiteMint Test <noreply@${SENDING_DOMAIN}>`,
      to: [over.to ?? `someone-${STAMP}@example.test`],
      subject: "A message from the CRM",
      // A tag only when the event is about a record of ours. `null` and an
      // absent ref both mean an untagged message — what every send made
      // before tagging existed looks like.
      ...(typeof over.ref === "string" && over.ref.length > 0 ? { tags: { crm_ref: over.ref } } : {}),
      ...(over.link ? { click: { link: over.link, timestamp: at.toISOString(), ipAddress: "203.0.113.4", userAgent: "Mozilla/5.0" } } : {}),
      ...(over.bounce ? { bounce: over.bounce } : {}),
      ...(over.failed ? { failed: over.failed } : {}),
    };
    return { type, created_at: at.toISOString(), data };
  }

  /** Posts a payload, signed the way Resend signs it. */
  async function deliver(payload: Record<string, unknown>, opts: {
    svixId?: string; corrupt?: boolean; timestamp?: Date; extraSignature?: boolean; secret?: string;
  } = {}) {
    const { Webhook } = await import("svix");
    const wh = new Webhook(opts.secret ?? SIGNING_SECRET);
    const svixId = opts.svixId ?? `msg_${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = opts.timestamp ?? new Date();
    const body = JSON.stringify(payload);
    let signature = wh.sign(svixId, timestamp, body);
    if (opts.extraSignature) {
      // A rotation: an older key's signature arrives alongside the current one.
      const other = new Webhook(`whsec_${crypto.randomBytes(24).toString("base64")}`);
      signature = `${other.sign(svixId, timestamp, body)} ${signature}`;
    }
    const res = await fetch(`${base}/api/crm/webhooks/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": opts.corrupt ? "v1,bm90LWEtcmVhbC1zaWduYXR1cmU=" : signature,
      },
      body,
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    return { status: res.status, json, svixId };
  }

  /** The provider delivery this record's own id or tag resolves to. */
  async function deliveryOf(args: { providerId?: string | null; ref?: string | null }) {
    const lookup = await events.loadProviderDeliveries({
      providerIds: [args.providerId], refs: [args.ref],
    });
    return events.deliveryFor(lookup, args.providerId ?? null, args.ref ?? null);
  }

  // ── Fixtures ──────────────────────────────────────────────────────────────

  async function makeLead(tag: string): Promise<number> {
    const [row] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] events ${tag}`,
      email: `events-${tag}-${STAMP}@example.test`,
    }).returning({ id: schema.crmLeads.id });
    createdLeadIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    // The table this whole feature writes to, created exactly as the reviewed
    // file creates it in a real environment.
    const requireFromDb = createRequire(path.join(REPO_ROOT, "lib/db/package.json"));
    const pg = requireFromDb("pg") as { Client: new (c: { connectionString: string }) => any };
    const client = new pg.Client({ connectionString: String(TEST_DB) });
    await client.connect();
    try { await client.query(readFileSync(SQL_FILE, "utf8")); } finally { await client.end(); }

    schema = await import("@workspace/db");
    db = schema.db;
    events = await import("../lib/emailProviderEvents.js");

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [staff] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffId = staff.id;
    expect(await owner.login(OWNER)).toBe(200);

    leadId = await makeLead("lead");
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.crmEmailProviderEvents)
      .where(eq(schema.crmEmailProviderEvents.senderDomain, SENDING_DOMAIN));
    await db.delete(schema.crmEmailProviderEvents)
      .where(like(schema.crmEmailProviderEvents.crmRef, `%-${STAMP}%`));
    if (suppressedAddresses.length) {
      await db.delete(schema.crmEmailSuppressions)
        .where(inArray(schema.crmEmailSuppressions.address, suppressedAddresses));
    }
    if (createdCampaignIds.length) {
      await db.delete(schema.crmCampaigns).where(inArray(schema.crmCampaigns.id, createdCampaignIds));
    }
    if (createdMarketingCampaignIds.length) {
      await db.delete(schema.crmMarketingRecipients)
        .where(inArray(schema.crmMarketingRecipients.campaignId, createdMarketingCampaignIds));
      await db.delete(schema.crmMarketingCampaigns)
        .where(inArray(schema.crmMarketingCampaigns.id, createdMarketingCampaignIds));
    }
    if (createdLeadIds.length) {
      await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.leadId, createdLeadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, createdLeadIds));
    }
    if (staffId) await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
    await new Promise<void>((r) => server?.close(() => r()));
  }, 120_000);

  // ── 1. The intake ─────────────────────────────────────────────────────────

  describe("the intake", () => {
    it("accepts a genuine event, stores it, and interprets it", async () => {
      const emailId = providerId("intake");
      const res = await deliver(payloadFor("email.delivered", { emailId }));
      expect(res.status).toBe(200);
      expect(res.json["ok"]).toBe(true);
      expect(res.json["processing"]).toBe("processed");

      const [row] = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.svixId, res.svixId)).limit(1);
      expect(row).toBeTruthy();
      expect(row.eventType).toBe("email.delivered");
      expect(row.providerEmailId).toBe(emailId);
      expect(row.senderDomain).toBe(SENDING_DOMAIN);
      expect(row.state).toBe("processed");
      // It reached nothing of ours, which is a normal answer and not an error.
      expect(row.matchStatus).toBe("unmatched");
    });

    it("refuses a body changed after signing, and stores nothing", async () => {
      const before = await countEvents();
      const res = await deliver(payloadFor("email.delivered"), { corrupt: true });
      expect(res.status).toBe(400);
      expect(String(res.json["error"])).toMatch(/signature/i);
      expect(await countEvents()).toBe(before);
    });

    it("refuses a captured request replayed later", async () => {
      const before = await countEvents();
      const sixMinutesAgo = new Date(Date.now() - 6 * 60_000);
      const res = await deliver(payloadFor("email.delivered"), { timestamp: sixMinutesAgo });
      expect(res.status).toBe(400);
      expect(res.json["reason"]).toBe("stale");
      expect(await countEvents()).toBe(before);
    });

    it("accepts when one of several signatures matches, so a rotation is not an outage", async () => {
      const res = await deliver(payloadFor("email.delivered", { emailId: providerId("rotation") }), { extraSignature: true });
      expect(res.status).toBe(200);
    });

    it("answers a provider retry with 200 and writes one row, not two", async () => {
      const payload = payloadFor("email.opened", { emailId: providerId("retry") });
      const svixId = `msg_${crypto.randomBytes(8).toString("hex")}`;

      const first = await deliver(payload, { svixId });
      expect(first.status).toBe(200);
      expect(first.json["duplicate"]).toBeUndefined();

      const retry = await deliver(payload, { svixId });
      expect(retry.status).toBe(200);
      expect(retry.json["duplicate"]).toBe(true);

      const rows = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.svixId, svixId));
      expect(rows).toHaveLength(1);
    });

    it("catches the same event replayed under a NEW delivery id", async () => {
      // A dashboard replay reuses the payload but not the delivery id, so the
      // unique key cannot see it. Counting it again would double an open.
      const payload = payloadFor("email.opened", { emailId: providerId("replayed") });
      const first = await deliver(payload);
      expect(first.json["duplicate"]).toBeUndefined();

      const replay = await deliver(payload);
      expect(replay.status).toBe(200);
      expect(replay.json["duplicate"]).toBe(true);
      expect(String(replay.json["reason"])).toMatch(/already recorded/i);

      const rows = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.providerEmailId, providerId("replayed")));
      expect(rows).toHaveLength(1);
    });

    it("keeps two genuine clicks on different links apart", async () => {
      const emailId = providerId("twolinks");
      const at = new Date();
      await deliver(payloadFor("email.clicked", { emailId, at, link: "https://example.test/a" }));
      await deliver(payloadFor("email.clicked", { emailId, at, link: "https://example.test/b" }));
      const rows = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.providerEmailId, emailId));
      expect(rows).toHaveLength(2);
    });

    it("stores an event it does not act on rather than discarding it", async () => {
      const res = await deliver({ type: "contact.created", created_at: new Date().toISOString(), data: { id: "c_1" } });
      expect(res.status).toBe(200);
      expect(res.json["ignored"]).toBe(true);
      const [row] = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.svixId, res.svixId)).limit(1);
      expect(row.state).toBe("ignored");
      expect(row.matchStatus).toBe("not_applicable");
    });

    it("says so when an inbound event was subscribed to the wrong endpoint", async () => {
      const res = await deliver(payloadFor("email.received", { emailId: providerId("misrouted") }));
      expect(res.status).toBe(200);
      expect(String(res.json["reason"])).toMatch(/inbound endpoint/i);
    });

    it("answers 503, not a refusal, when no secret is configured", async () => {
      const saved = process.env.RESEND_WEBHOOK_SECRET;
      delete process.env.RESEND_WEBHOOK_SECRET;
      try {
        const res = await deliver(payloadFor("email.delivered"));
        // 503 keeps the provider retrying: its window is about a day, so an
        // endpoint configured within it still receives everything it missed.
        expect(res.status).toBe(503);
        expect(res.json["variable"]).toBe("RESEND_WEBHOOK_SECRET");
      } finally {
        process.env.RESEND_WEBHOOK_SECRET = saved;
      }
    });

    async function countEvents(): Promise<number> {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmEmailProviderEvents);
      return Number(row?.n ?? 0);
    }
  });

  // ── 2. Delivery state, derived from the events ────────────────────────────

  describe("the state the events support", () => {
    it("does not change when a late `sent` arrives after `delivered`", async () => {
      const emailId = providerId("late_sent");
      const deliveredAt = new Date(Date.now() - 60_000);
      const sentAt = new Date(Date.now() - 120_000);

      await deliver(payloadFor("email.delivered", { emailId, at: deliveredAt }));
      expect((await deliveryOf({ providerId: emailId }))?.state).toBe("delivered");

      await deliver(payloadFor("email.sent", { emailId, at: sentAt }));
      const after = await deliveryOf({ providerId: emailId });
      expect(after?.state).toBe("delivered");
      expect(after?.sentAt?.toISOString()).toBe(sentAt.toISOString());
    });

    it("lets a bounce override a delivery, and stays bounced afterwards", async () => {
      const emailId = providerId("late_bounce");
      const to = `bouncer-${STAMP}@example.test`;
      suppressedAddresses.push(to);

      await deliver(payloadFor("email.delivered", { emailId, to, at: new Date(Date.now() - 120_000) }));
      await deliver(payloadFor("email.bounced", {
        emailId, to, at: new Date(Date.now() - 60_000),
        bounce: { type: "Permanent", subType: "Suppressed", message: "on the suppression list" },
      }));

      const summary = await deliveryOf({ providerId: emailId });
      expect(summary?.state).toBe("bounced");
      expect(summary?.label).toBe("Bounced");
      expect(summary?.detail).toContain("Permanent");

      // A stray `delayed` afterwards cannot un-bounce it.
      await deliver(payloadFor("email.delivery_delayed", { emailId, to }));
      expect((await deliveryOf({ providerId: emailId }))?.state).toBe("bounced");
    });

    it("suppresses an address on a bounce, whatever record it belonged to", async () => {
      const to = `hardbounce-${STAMP}@example.test`;
      suppressedAddresses.push(to);
      await deliver(payloadFor("email.bounced", {
        emailId: providerId("suppress"), to,
        bounce: { type: "Permanent", subType: "General", message: "mailbox does not exist" },
      }));

      const { isSuppressed } = await import("../lib/inboundEmail.js");
      const verdict = await isSuppressed(to);
      expect(verdict.suppressed).toBe(true);
    });

    it("counts opens and clicks, and the links they were on", async () => {
      const emailId = providerId("engagement");
      await deliver(payloadFor("email.opened", { emailId, at: new Date(Date.now() - 300_000) }));
      await deliver(payloadFor("email.opened", { emailId, at: new Date(Date.now() - 200_000) }));
      await deliver(payloadFor("email.clicked", { emailId, at: new Date(Date.now() - 100_000), link: "https://sitemintdigital.com/pricing" }));

      const summary = await deliveryOf({ providerId: emailId });
      expect(summary).toBeTruthy();
      const engagement = summary!;
      expect(engagement.opens).toBe(2);
      expect(engagement.clicks).toBe(1);
      expect(engagement.firstOpenedAt!.getTime()).toBeLessThan(engagement.lastOpenedAt!.getTime());

      const links = await events.clickedLinks([emailId]);
      expect(links).toEqual([{ url: "https://sitemintdigital.com/pricing", clicks: 1, recipients: 1 }]);
    });
  });

  // ── 3. Every record type a CRM email can belong to ────────────────────────

  describe("the record an event belongs to", () => {
    it("upgrades an unconfirmed one-off email when the provider says it was delivered", async () => {
      const [message] = await db.insert(schema.crmMessages).values({
        leadId, direction: "outbound", channel: "email", subject: "Hello",
        body: "An unconfirmed send", status: "uncertain", origin: "staff",
      }).returning();
      const ref = `message-${message.id}`;
      const emailId = providerId("message");

      // Neither of these is evidence of arrival, and neither may change it.
      await deliver(payloadFor("email.sent", { emailId, ref }));
      await deliver(payloadFor("email.opened", { emailId, ref }));
      let [after] = await db.select().from(schema.crmMessages).where(eq(schema.crmMessages.id, message.id));
      expect(after.status).toBe("uncertain");

      const res = await deliver(payloadFor("email.delivered", { emailId, ref }));
      expect(res.json["match"]).toBe("matched");
      [after] = await db.select().from(schema.crmMessages).where(eq(schema.crmMessages.id, message.id));
      expect(after.status).toBe("sent");
      expect(after.providerMessageId).toBe(emailId);
      expect((after.metadata as Record<string, unknown>)["upgradedFrom"]).toBe("uncertain");
    });

    it("upgrades an unconfirmed marketing recipient, and leaves a refused one refused", async () => {
      const [campaign] = await db.insert(schema.crmMarketingCampaigns).values({
        name: `[CRM-TEST] events ${STAMP}`, subject: "Subject",
        createdByStaffId: staffId, createdByLabel: OWNER.name, status: "sent",
      }).returning();
      createdMarketingCampaignIds.push(campaign.id);

      const unconfirmedLead = await makeLead("mk-unconfirmed");
      const refusedLead = await makeLead("mk-refused");
      const [unconfirmed] = await db.insert(schema.crmMarketingRecipients).values({
        campaignId: campaign.id, leadId: unconfirmedLead, address: `mk-unconfirmed-${STAMP}@example.test`,
        status: "failed", lastError: "uncertain: no answer from the mail provider",
      }).returning();
      const [refused] = await db.insert(schema.crmMarketingRecipients).values({
        campaignId: campaign.id, leadId: refusedLead, address: `mk-refused-${STAMP}@example.test`,
        status: "failed", lastError: "rejected: invalid recipient",
      }).returning();

      await deliver(payloadFor("email.delivered", {
        emailId: providerId("mk_unconfirmed"), ref: `marketing_recipient-${unconfirmed.id}`,
      }));
      await deliver(payloadFor("email.delivered", {
        emailId: providerId("mk_refused"), ref: `marketing_recipient-${refused.id}`,
      }));

      const [afterUnconfirmed] = await db.select().from(schema.crmMarketingRecipients)
        .where(eq(schema.crmMarketingRecipients.id, unconfirmed.id));
      expect(afterUnconfirmed.status).toBe("sent");
      expect(afterUnconfirmed.lastError).toBeNull();
      expect(afterUnconfirmed.providerMessageId).toBe(providerId("mk_unconfirmed"));

      // A refusal is a decision the provider made about the message. Evidence
      // that a DIFFERENT message arrived does not overturn it.
      const [afterRefused] = await db.select().from(schema.crmMarketingRecipients)
        .where(eq(schema.crmMarketingRecipients.id, refused.id));
      expect(afterRefused.status).toBe("failed");
      expect(afterRefused.lastError).toBe("rejected: invalid recipient");
    });

    it("waits for a send that is still in flight instead of racing it", async () => {
      const [campaign] = await db.select().from(schema.crmMarketingCampaigns)
        .where(inArray(schema.crmMarketingCampaigns.id, createdMarketingCampaignIds)).limit(1);
      const inFlightLead = await makeLead("mk-inflight");
      const [recipient] = await db.insert(schema.crmMarketingRecipients).values({
        campaignId: campaign.id, leadId: inFlightLead, address: `mk-inflight-${STAMP}@example.test`,
        status: "failed",
        // The marker the marketing sender writes BEFORE it asks the provider.
        lastError: `uncertain: attempt ${crypto.randomBytes(4).toString("hex")} started ${new Date().toISOString()} and no answer from the mail provider was recorded`,
      }).returning();
      const ref = `marketing_recipient-${recipient.id}`;

      const res = await deliver(payloadFor("email.delivered", { emailId: providerId("mk_inflight"), ref }));
      expect(res.status).toBe(200);
      // Stored, and deliberately not applied yet.
      expect(res.json["processing"]).toBe("received");

      const [event] = await db.select().from(schema.crmEmailProviderEvents)
        .where(eq(schema.crmEmailProviderEvents.svixId, res.svixId)).limit(1);
      expect(event.state).toBe("received");
      expect(event.nextAttemptAt).toBeTruthy();
      expect(String(event.lastError)).toMatch(/in flight/);

      // The send settles as unknown, and the stored event is interpreted again
      // from its payload — no signature, nothing asked of the provider.
      await db.update(schema.crmMarketingRecipients)
        .set({ lastError: "uncertain: the provider never answered" })
        .where(eq(schema.crmMarketingRecipients.id, recipient.id));

      const retry = await owner.call("POST", `/api/crm/email/events/${event.id}/retry`);
      expect(retry.status).toBe(200);
      expect(retry.json["state"]).toBe("processed");

      const [after] = await db.select().from(schema.crmMarketingRecipients)
        .where(eq(schema.crmMarketingRecipients.id, recipient.id));
      expect(after.status).toBe("sent");
    });

    it("upgrades a support reply, a reminder delivery and a portal invitation", async () => {
      // Support reply.
      const [ticket] = await db.insert(schema.crmSupportTickets).values({
        subject: `[CRM-TEST] support ${STAMP}`, leadId,
        openedByStaffId: staffId, openedByLabel: OWNER.name, status: "open",
      }).returning();
      const [reply] = await db.insert(schema.crmSupportMessages).values({
        ticketId: ticket.id, visibility: "customer", body: "We are on it.", origin: "staff",
        sentByStaffId: staffId, sentByLabel: OWNER.name,
        deliveryState: "uncertain", deliveryAttempt: 1, deliveredTo: `client-${STAMP}@example.test`,
        deliveryIdempotencyKey: `support-${STAMP}`,
      }).returning();

      // Reminder delivery.
      const [job] = await db.insert(schema.crmScheduledJobs).values({
        kind: "task_reminder", dedupeKey: `task_reminder:events-${STAMP}`,
        runAt: new Date(), payload: { staffId }, status: "completed",
      }).returning();
      const occurrenceAt = new Date();
      const [delivery] = await db.insert(schema.crmReminderDeliveries).values({
        jobId: job.id, occurrenceAt, recipientStaffId: staffId,
        subject: "Reminder", body: "Body", idempotencyKey: `reminder-${STAMP}`,
        state: "uncertain", attempt: 1,
        failureReason: "no_answer_from_provider", failureDetail: "socket hang up",
      }).returning();

      // Portal invitation.
      const [invitation] = await db.insert(schema.crmPortalInvitations).values({
        leadId, email: `portal-${STAMP}@example.test`, tokenHash: crypto.randomBytes(16).toString("hex"),
        createdByStaffId: staffId, createdByLabel: OWNER.name,
        expiresAt: new Date(Date.now() + 86_400_000), deliveryState: "uncertain",
      }).returning();

      await deliver(payloadFor("email.delivered", { emailId: providerId("support"), ref: `support_message-${reply.id}` }));
      await deliver(payloadFor("email.delivered", { emailId: providerId("reminder"), ref: `reminder_delivery-${delivery.id}` }));
      await deliver(payloadFor("email.delivered", { emailId: providerId("portal"), ref: `portal_invitation-${invitation.id}` }));

      const [afterReply] = await db.select().from(schema.crmSupportMessages)
        .where(eq(schema.crmSupportMessages.id, reply.id));
      expect(afterReply.deliveryState).toBe("accepted");
      expect(afterReply.deliveryProviderRef).toBe(providerId("support"));

      const [afterDelivery] = await db.select().from(schema.crmReminderDeliveries)
        .where(eq(schema.crmReminderDeliveries.id, delivery.id));
      expect(afterDelivery.state).toBe("accepted");
      expect(afterDelivery.providerRef).toBe(providerId("reminder"));
      expect(afterDelivery.failureDetail).toBeNull();

      const [afterInvitation] = await db.select().from(schema.crmPortalInvitations)
        .where(eq(schema.crmPortalInvitations.id, invitation.id));
      expect(afterInvitation.deliveryState).toBe("sent");

      // Clean-up of rows this test owns.
      await db.delete(schema.crmSupportMessages).where(eq(schema.crmSupportMessages.id, reply.id));
      await db.delete(schema.crmSupportTickets).where(eq(schema.crmSupportTickets.id, ticket.id));
      await db.delete(schema.crmReminderDeliveries).where(eq(schema.crmReminderDeliveries.id, delivery.id));
      await db.delete(schema.crmScheduledJobs).where(eq(schema.crmScheduledJobs.id, job.id));
      await db.delete(schema.crmPortalInvitations).where(eq(schema.crmPortalInvitations.id, invitation.id));
    });

    it("proves a staff invitation reached the mailbox it was sent to", async () => {
      const [token] = await db.insert(schema.crmStaffTokens).values({
        staffId, kind: "invite", tokenHash: crypto.randomBytes(16).toString("hex"),
        delivery: "manual", expiresAt: new Date(Date.now() + 3_600_000),
      }).returning();

      await deliver(payloadFor("email.delivered", { emailId: providerId("token"), ref: `staff_token-${token.id}` }));

      const [after] = await db.select().from(schema.crmStaffTokens)
        .where(eq(schema.crmStaffTokens.id, token.id));
      // Only a link the SERVER emailed to an address demonstrates control of
      // that address, so this is the field that decides what consuming the
      // token proves.
      expect(after.delivery).toBe("email");
      await db.delete(schema.crmStaffTokens).where(eq(schema.crmStaffTokens.id, token.id));
    });

    it("does not read an old invitation's event as news about the current one", async () => {
      const [appointment] = await db.insert(schema.crmAppointments).values({
        title: "Kickoff", startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 90_000_000),
        createdByLabel: OWNER.name, organizerStaffId: staffId, icalSequence: 1,
      }).returning();
      const [attendee] = await db.insert(schema.crmAppointmentAttendees).values({
        appointmentId: appointment.id, externalEmail: `attendee-${STAMP}@example.test`,
        invitationOutcome: "uncertain", invitationMethod: "REQUEST", invitationSequence: 1,
      }).returning();

      // Evidence about revision 0, while the row is at revision 1.
      await deliver(payloadFor("email.delivered", {
        emailId: providerId("invite_stale"), ref: `appointment_attendee-${attendee.id}-REQUEST-0`,
      }));
      let [after] = await db.select().from(schema.crmAppointmentAttendees)
        .where(eq(schema.crmAppointmentAttendees.id, attendee.id));
      expect(after.invitationOutcome).toBe("uncertain");

      // Evidence about the revision the row actually holds.
      await deliver(payloadFor("email.delivered", {
        emailId: providerId("invite_current"), ref: `appointment_attendee-${attendee.id}-REQUEST-1`,
      }));
      [after] = await db.select().from(schema.crmAppointmentAttendees)
        .where(eq(schema.crmAppointmentAttendees.id, attendee.id));
      expect(after.invitationOutcome).toBe("sent");
      expect(after.invitationProviderId).toBe(providerId("invite_current"));

      await db.delete(schema.crmAppointmentAttendees).where(eq(schema.crmAppointmentAttendees.id, attendee.id));
      await db.delete(schema.crmAppointments).where(eq(schema.crmAppointments.id, appointment.id));
    });

    it("matches a legacy campaign recipient by its stored provider id, with no tag at all", async () => {
      const [campaign] = await db.insert(schema.crmCampaigns).values({
        name: `[CRM-TEST] legacy ${STAMP}`, subject: "Legacy", body: "Body", status: "ready",
      }).returning();
      createdCampaignIds.push(campaign.id);
      const recipientLead = await makeLead("legacy");
      const emailId = providerId("legacy");
      const [recipient] = await db.insert(schema.crmCampaignRecipients).values({
        campaignId: campaign.id, leadId: recipientLead, status: "sent",
        sentAt: new Date(), resendEmailId: emailId, enrollmentStatus: "active",
      }).returning();

      // An open, then a bounce — no `crm_ref` anywhere, exactly as messages
      // sent before tagging existed.
      await deliver(payloadFor("email.opened", { emailId, ref: null }));
      const to = `legacy-bounce-${STAMP}@example.test`;
      suppressedAddresses.push(to);
      await deliver(payloadFor("email.bounced", {
        emailId, to, ref: null,
        bounce: { type: "Permanent", subType: "General", message: "no such mailbox" },
      }));

      const legacyEvents = await db.select().from(schema.crmCampaignEvents)
        .where(eq(schema.crmCampaignEvents.campaignRecipientId, recipient.id));
      expect(legacyEvents.map((e) => e.eventType).sort()).toEqual(["bounced", "opened"]);

      const [after] = await db.select().from(schema.crmCampaignRecipients)
        .where(eq(schema.crmCampaignRecipients.id, recipient.id));
      expect(after.status).toBe("failed");
      expect(String(after.lastError)).toMatch(/no such mailbox/);
    });

    it("stops every active sequence for a contact that reports spam", async () => {
      const [campaign] = await db.insert(schema.crmCampaigns).values({
        name: `[CRM-TEST] complaint ${STAMP}`, subject: "Seq", body: "Body", status: "ready", type: "nurture",
      }).returning();
      createdCampaignIds.push(campaign.id);
      const complainerLead = await makeLead("complainer");
      const emailId = providerId("complaint");
      const [recipient] = await db.insert(schema.crmCampaignRecipients).values({
        campaignId: campaign.id, leadId: complainerLead, status: "sent",
        sentAt: new Date(), resendEmailId: emailId, enrollmentStatus: "active",
      }).returning();

      const to = `complainer-${STAMP}@example.test`;
      suppressedAddresses.push(to);
      await deliver(payloadFor("email.complained", { emailId, to, ref: null }));

      const [after] = await db.select().from(schema.crmCampaignRecipients)
        .where(eq(schema.crmCampaignRecipients.id, recipient.id));
      expect(after.enrollmentStatus).toBe("stopped");

      const { isSuppressed } = await import("../lib/inboundEmail.js");
      expect((await isSuppressed(to)).reason).toMatch(/spam/i);
    });

    it("files an event that reached nothing as unmatched rather than as an error", async () => {
      const res = await deliver(payloadFor("email.delivered", {
        emailId: providerId("orphan"), ref: `message-99999999`,
      }));
      expect(res.status).toBe(200);
      expect(res.json["match"]).toBe("unmatched");

      const list = await owner.call("GET", "/api/crm/email/events?unmatched=true&limit=5");
      expect(list.status).toBe(200);
      expect((list.json["events"] as unknown[]).length).toBeGreaterThan(0);
    });
  });

  // ── 4. Operator surfaces and the schema itself ────────────────────────────

  describe("what an operator can see", () => {
    it("reports that events are arriving, and what tracking evidence exists", async () => {
      const status = await owner.call("GET", "/api/crm/email/events/status");
      expect(status.status).toBe(200);
      expect(status.json["configured"]).toBe(true);
      expect(status.json["sendingDomain"]).toBe(SENDING_DOMAIN);
      expect(Number(status.json["eventsReceived"])).toBeGreaterThan(0);
      const tracking = status.json["tracking"] as Record<string, string | null>;
      // Opens have been recorded for this domain in this run, so engagement is
      // measurable; that is evidence, not configuration.
      expect(tracking["opensMeasuredSince"]).toBeTruthy();
    });

    it("refuses the operator surfaces to a caller with no session", async () => {
      const anonymous = new Agent();
      expect((await anonymous.call("GET", "/api/crm/email/events/status")).status).toBe(401);
      expect((await anonymous.call("POST", "/api/crm/email/events/1/retry")).status).toBe(401);
    });

    it("has the columns, constraints and indexes the reviewed SQL file creates", async () => {
      const { getTableConfig } = await import("drizzle-orm/pg-core");
      const table = getTableConfig(schema.crmEmailProviderEvents);

      const columns = await db.execute(sql`
        SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'crm_email_provider_events'`);
      const actual = new Map((columns.rows as unknown as Array<{ column_name: string; is_nullable: string }>)
        .map((r) => [r.column_name, r.is_nullable === "YES"]));

      for (const column of table.columns) {
        expect(actual.has(column.name), `missing column ${column.name}`).toBe(true);
        expect(actual.get(column.name), `nullability of ${column.name}`).toBe(!column.notNull);
      }
      expect(actual.size, "the file creates no column the schema does not declare").toBe(table.columns.length);

      const named = await db.execute(sql`
        SELECT conname AS name FROM pg_constraint
         WHERE conrelid = 'public.crm_email_provider_events'::regclass
        UNION ALL
        SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'crm_email_provider_events'`);
      const names = new Set((named.rows as unknown as Array<{ name: string }>).map((r) => r.name));
      for (const expected of [
        "uq_crm_email_provider_events_svix",
        "ck_crm_email_provider_events_state",
        "ck_crm_email_provider_events_match",
        "ck_crm_email_provider_events_attempts",
        "ix_crm_email_provider_events_email",
        "ix_crm_email_provider_events_ref",
        "ix_crm_email_provider_events_type_occurred",
        "ix_crm_email_provider_events_work",
        "ix_crm_email_provider_events_domain",
      ]) expect(names.has(expected), `missing ${expected}`).toBe(true);
    });

    it("refuses a state the vocabulary does not contain", async () => {
      await expect(db.execute(sql`
        INSERT INTO crm_email_provider_events (svix_id, event_type, occurred_at, payload, state)
        VALUES (${`msg_bad_${STAMP}`}, 'email.delivered', now(), '{}'::jsonb, 'invented')`))
        .rejects.toThrow();
    });
  });
});
