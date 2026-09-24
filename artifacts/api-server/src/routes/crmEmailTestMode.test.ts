/**
 * Which paths can reach a real mailbox, and what a send carries.
 *
 * Three failures are driven here, and the first one was live:
 *
 *   THE BYPASS. Six routes and the sequence worker called the provider client
 *   directly, so `CRM_EMAIL_TEST_MODE` only stopped the ones that happened to
 *   check it themselves — and the contact composer checked a flag from the
 *   REQUEST BODY, so `{"testMode": false}` reached a customer's inbox from a
 *   server whose test mode was on. Every one of them now goes through
 *   `lib/staffMail.ts`, which hands nothing to the provider while test mode is
 *   anything but the exact string "false". The provider client is replaced
 *   here, so anything that got past the seam would be recorded and fail these
 *   tests rather than reaching a person.
 *
 *   THE UNKNOWN OUTCOME. A timeout is not a failure to send: the message may
 *   be in somebody's inbox. It is recorded as unknown, never as "not sent",
 *   and the answer says so instead of inviting a second copy.
 *
 *   THE BURST. The sequence worker had no idea how overdue a message was, so
 *   its first tick against an existing database — a restored copy, or a
 *   deployment that was down — would mail the whole backlog at thirty a
 *   minute. Anything more than a day overdue is now held for a person.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "test-mode-admin-secret-value";
// A key IS present. Test mode is the only thing standing between these routes
// and a real mailbox, which is exactly the arrangement being tested.
process.env.RESEND_API_KEY = "re_test_key_the_client_is_replaced";
delete process.env.CRM_EMAIL_TEST_MODE;
delete process.env.RESEND_WEBHOOK_SECRET;

// ── The provider client, replaced ───────────────────────────────────────────

interface RecordedSend {
  to: unknown;
  subject?: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
}

const sends: RecordedSend[] = [];
let answer: "ok" | "timeout" | "refused" = "ok";

vi.mock("../lib/email.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getResend: () => ({
      emails: {
        send: async (payload: RecordedSend, options?: { idempotencyKey?: string }) => {
          sends.push({ ...payload, idempotencyKey: options?.idempotencyKey });
          if (answer === "timeout") {
            // What an unanswered request looks like: the bytes went out.
            throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
          }
          if (answer === "refused") {
            return { data: null, error: { name: "validation_error", message: "Invalid `to` field", statusCode: 422 } };
          }
          return { data: { id: `re_fake_${sends.length}` }, error: null };
        },
      },
    }),
  };
});

const STAMP = Date.now();
const OWNER = {
  email: `testmode-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Test Mode Owner",
  password: "harbour-trellis-5521",
};

const suite = TEST_DB ? describe : describe.skip;

suite("what can reach a real mailbox (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let scheduler: typeof import("../lib/campaignScheduler.js");

  let staffId = 0;
  let leadId = 0;
  let campaignId = 0;
  let recipientId = 0;
  let stepId = 0;
  const messageIds: number[] = [];

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

  /** Mail is live for the body of this call, and off again afterwards. */
  async function withMailLive<T>(run: () => Promise<T>): Promise<T> {
    process.env.CRM_EMAIL_TEST_MODE = "false";
    try { return await run(); } finally { delete process.env.CRM_EMAIL_TEST_MODE; }
  }

  const tagOf = (send: RecordedSend | undefined) =>
    send?.tags?.find((t) => t.name === "crm_ref")?.value ?? null;

  /**
   * One scheduled sequence message, due at `dueAt`.
   *
   * The enrolment is re-activated with it: the worker marks a recipient
   * `completed` once nothing is left scheduled for them, and the scheduler
   * only ever looks at active enrolments — so without this, every message
   * after the first successful one would be invisible to it.
   */
  async function queueMessage(dueAt: Date): Promise<number> {
    await db.update(schema.crmCampaignRecipients)
      .set({ enrollmentStatus: "active" })
      .where(eq(schema.crmCampaignRecipients.id, recipientId));
    const [msg] = await db.insert(schema.crmCampaignScheduledMessages).values({
      campaignId, recipientId, stepId, leadId,
      channel: "email", subject: `Queued ${STAMP}`, body: "Body of a queued message",
      status: "scheduled", scheduledAt: dueAt,
    }).returning();
    messageIds.push(msg.id);
    return msg.id;
  }

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    scheduler = await import("../lib/campaignScheduler.js");

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

    const [lead] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] test mode ${STAMP}`,
      email: `testmode-lead-${STAMP}@example.test`,
    }).returning();
    leadId = lead.id;

    const [campaign] = await db.insert(schema.crmCampaigns).values({
      name: `[CRM-TEST] test mode ${STAMP}`, subject: "Campaign subject", body: "Campaign body",
      status: "ready", type: "nurture", autoSend: true, stopOnReply: false,
    }).returning();
    campaignId = campaign.id;

    const [step] = await db.insert(schema.crmCampaignSteps).values({
      campaignId, stepNumber: 1, dayOffset: 0, channel: "email",
      subject: "Step subject", body: "Step body", sendTime: "immediate", businessDaysOnly: false,
    }).returning();
    stepId = step.id;

    const [recipient] = await db.insert(schema.crmCampaignRecipients).values({
      campaignId, leadId, status: "selected", enrollmentStatus: "active",
      enrolledAt: new Date(), currentStep: 0,
    }).returning();
    recipientId = recipient.id;
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.crmCampaignScheduledMessages).where(eq(schema.crmCampaignScheduledMessages.campaignId, campaignId));
    await db.delete(schema.crmCampaignEvents).where(eq(schema.crmCampaignEvents.campaignRecipientId, recipientId));
    await db.delete(schema.crmCampaigns).where(eq(schema.crmCampaigns.id, campaignId));
    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    if (staffId) await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
    await new Promise<void>((r) => server?.close(() => r()));
  }, 120_000);

  beforeEach(() => {
    sends.length = 0;
    answer = "ok";
  });

  // ── 1. Nothing reaches the provider while test mode is on ─────────────────

  describe("test mode", () => {
    it("is the server's decision, not the caller's — `testMode: false` in a request changes nothing", async () => {
      const res = await owner.call("POST", `/api/crm/leads/${leadId}/email`, {
        subject: `Composer ${STAMP}`, body: "Written by a person.", testMode: false,
      });

      expect(res.status).toBe(200);
      expect(res.json["testMode"]).toBe(true);
      // The one that mattered: the old rule let this body reach a real mailbox.
      expect(sends).toHaveLength(0);

      const [message] = await db.select().from(schema.crmMessages)
        .where(eq(schema.crmMessages.id, Number(res.json["messageId"])));
      expect(message.status).toBe("test_mode");
      expect(message.providerMessageId).toBeNull();
    }, 60_000);

    it("stops the legacy campaign send, the single resend and both test sends", async () => {
      const send = await owner.call("POST", `/api/crm/campaigns/${campaignId}/send`, {});
      expect(send.status).toBe(200);
      expect(send.json["testMode"]).toBe(true);
      expect(send.json["sent"]).toBe(1);

      const resend = await owner.call("POST", `/api/crm/campaigns/${campaignId}/recipients/${recipientId}/resend`, {});
      expect(resend.status).toBe(200);
      expect(resend.json["testMode"]).toBe(true);

      const campaignTest = await owner.call("POST", `/api/crm/campaigns/${campaignId}/test-send`, {
        to: `staff-${STAMP}@example.test`,
      });
      expect(campaignTest.status).toBe(200);
      expect(campaignTest.json["testMode"]).toBe(true);

      const adhocTest = await owner.call("POST", "/api/crm/campaigns/test-send", {
        to: `staff-${STAMP}@example.test`, subject: "Ad-hoc", body: "Body",
      });
      expect(adhocTest.status).toBe(200);
      expect(adhocTest.json["testMode"]).toBe(true);

      // Four routes that each used to call the provider directly.
      expect(sends).toHaveLength(0);

      // A simulated send records no provider id: "sent" here means simulated,
      // and a null id is what says so.
      const [recipient] = await db.select().from(schema.crmCampaignRecipients)
        .where(eq(schema.crmCampaignRecipients.id, recipientId));
      expect(recipient.status).toBe("sent");
      expect(recipient.resendEmailId).toBeNull();
    }, 60_000);

    it("stops Send Now on a queued message", async () => {
      const id = await queueMessage(new Date(Date.now() - 60_000));
      const res = await owner.call("POST", `/api/crm/campaigns/queue/${id}/send-now`, {});
      expect(res.status).toBe(200);
      expect(res.json["testMode"]).toBe(true);
      expect(sends).toHaveLength(0);
    }, 60_000);

    it("leaves a due sequence message alone rather than consuming it", async () => {
      const id = await queueMessage(new Date(Date.now() - 60_000));
      const run = await scheduler.processScheduledMessages();

      expect(sends).toHaveLength(0);
      expect(run.heldForMail).toBeGreaterThan(0);

      // Untouched and still due: a failure recorded here would claim the
      // message had been handled, and it would never go out once mail works.
      const [message] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, id));
      expect(message.status).toBe("scheduled");
      expect(message.lastError).toBeNull();
    }, 60_000);
  });

  // ── 2. With mail live, every send names the record it belongs to ──────────

  describe("a live send", () => {
    it("carries the tag that lets a delivery event find the message", async () => {
      const res = await withMailLive(() => owner.call("POST", `/api/crm/leads/${leadId}/email`, {
        subject: `Live ${STAMP}`, body: "Hello there.",
        cc: `cc-${STAMP}@example.test`, bcc: `bcc-${STAMP}@example.test`,
      }));

      expect(res.status).toBe(200);
      expect(res.json["testMode"]).toBe(false);
      expect(sends).toHaveLength(1);

      const messageId = Number(res.json["messageId"]);
      expect(tagOf(sends[0])).toBe(`message-${messageId}`);
      // The copies the composer collected are actually on the message.
      expect(sends[0].cc).toEqual([`cc-${STAMP}@example.test`]);
      expect(sends[0].bcc).toEqual([`bcc-${STAMP}@example.test`]);

      const [message] = await db.select().from(schema.crmMessages)
        .where(eq(schema.crmMessages.id, messageId));
      expect(message.status).toBe("sent");
      expect(message.providerMessageId).toBe("re_fake_1");
    }, 60_000);

    it("records an unanswered send as unknown, never as a failure", async () => {
      answer = "timeout";
      const res = await withMailLive(() => owner.call("POST", `/api/crm/leads/${leadId}/email`, {
        subject: `Unanswered ${STAMP}`, body: "Did this arrive?",
      }));

      expect(sends).toHaveLength(1);
      expect(res.status).toBe(502);
      expect(res.json["uncertain"]).toBe(true);
      expect(String(res.json["error"])).toMatch(/unknown/i);
      // The words that stop somebody sending a second copy.
      expect(String(res.json["error"])).toMatch(/second copy/i);

      const [message] = await db.select().from(schema.crmMessages)
        .where(eq(schema.crmMessages.id, Number(res.json["messageId"])));
      expect(message.status).toBe("uncertain");
      expect(message.status).not.toBe("failed");
    }, 60_000);

    it("tags a campaign send and a sequence send with their own ledger rows", async () => {
      await db.update(schema.crmCampaignRecipients)
        .set({ status: "selected", sentAt: null, resendEmailId: null })
        .where(eq(schema.crmCampaignRecipients.id, recipientId));

      await withMailLive(() => owner.call("POST", `/api/crm/campaigns/${campaignId}/send`, {}));
      expect(tagOf(sends[0])).toBe(`campaign_recipient-${recipientId}`);

      sends.length = 0;
      const queuedId = await queueMessage(new Date(Date.now() - 60_000));
      await withMailLive(() => scheduler.processScheduledMessages());

      // Any message still queued from an earlier test goes out in the same
      // tick, so this asks whether THIS one's tag is among them rather than
      // assuming it is the only one.
      expect(sends.map((s) => tagOf(s))).toContain(`sequence_message-${queuedId}`);

      const [message] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, queuedId));
      expect(message.status).toBe("sent");
      expect(message.resendEmailId).toBeTruthy();
    }, 60_000);
  });

  // ── 3. A backlog is not a schedule ────────────────────────────────────────

  describe("a long-overdue message", () => {
    it("is held for a person instead of being mailed in a burst", async () => {
      const stale = await queueMessage(new Date(Date.now() - 3 * 24 * 3600_000));
      const fresh = await queueMessage(new Date(Date.now() - 60_000));

      const run = await withMailLive(() => scheduler.processScheduledMessages());
      expect(run.held).toBeGreaterThan(0);

      const [heldRow] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, stale));
      expect(heldRow.status).toBe("held");
      expect(String(heldRow.lastError)).toMatch(/held for review/i);
      // Held, not cancelled: cancelling would decide it is unwanted.
      expect(heldRow.status).not.toBe("canceled");

      // The message that is merely due still goes out — the guard is about
      // staleness, not about stopping the queue.
      const [freshRow] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, fresh));
      expect(freshRow.status).toBe("sent");
      expect(sends.map((s) => tagOf(s))).toContain(`sequence_message-${fresh}`);
      expect(sends.map((s) => tagOf(s))).not.toContain(`sequence_message-${stale}`);
    }, 60_000);

    it("goes out once a person releases it, and is not held a second time", async () => {
      const stale = await queueMessage(new Date(Date.now() - 5 * 24 * 3600_000));
      await withMailLive(() => scheduler.processScheduledMessages());

      const released = await owner.call("PATCH", `/api/crm/campaigns/queue/${stale}`, { status: "scheduled" });
      expect(released.status).toBe(200);

      const [afterRelease] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, stale));
      expect(afterRelease.status).toBe("scheduled");
      expect((afterRelease.metadata as Record<string, unknown>)["releasedFromHoldAt"]).toBeTruthy();

      sends.length = 0;
      await withMailLive(() => scheduler.processScheduledMessages());

      const [afterRun] = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(eq(schema.crmCampaignScheduledMessages.id, stale));
      // Released once means released: holding it again would make the button
      // appear to do nothing.
      expect(afterRun.status).toBe("sent");
      expect(sends.map((s) => tagOf(s))).toContain(`sequence_message-${stale}`);
    }, 60_000);

    it("can also be sent straight from the queue, which is the same review", async () => {
      const stale = await queueMessage(new Date(Date.now() - 4 * 24 * 3600_000));
      await withMailLive(() => scheduler.processScheduledMessages());

      sends.length = 0;
      const sent = await withMailLive(() => owner.call("POST", `/api/crm/campaigns/queue/${stale}/send-now`, {}));
      expect(sent.status).toBe(200);
      expect(sends).toHaveLength(1);
      expect(tagOf(sends[0])).toBe(`sequence_message-${stale}`);
    }, 60_000);

    it("leaves everything else in the queue untouched", async () => {
      const rows = await db.select().from(schema.crmCampaignScheduledMessages)
        .where(inArray(schema.crmCampaignScheduledMessages.id, messageIds));
      // Nothing was cancelled or skipped by any of the above: every row is in a
      // state somebody can act on or that records what happened.
      for (const row of rows) {
        expect(["scheduled", "held", "sent", "failed"], `message ${row.id}`).toContain(row.status);
      }
    }, 60_000);
  });
});
