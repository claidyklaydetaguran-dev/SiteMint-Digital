/**
 * Inbound email: ingestion, deduplication, correlation, and the two things a
 * business inbox must never do — drop a client's message, or mail somebody who
 * told a provider we were spamming them.
 *
 * Every Resend call is mocked. The point is our handling; a test that reached
 * the provider would consume real quota and could mail real people.
 *
 * Signatures are REAL: the test signs payloads with svix exactly as Resend
 * does, so verification is genuinely exercised rather than stubbed past.
 *
 * Gated on CRM_TEST_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, like } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "inbound-admin-secret-value";

// A valid svix signing secret is "whsec_" + base64. Generated here so the test
// signs with the same key the server verifies with.
const SIGNING_SECRET = `whsec_${Buffer.from(crypto.randomBytes(24)).toString("base64")}`;
process.env.RESEND_INBOUND_WEBHOOK_SECRET = SIGNING_SECRET;
process.env.RESEND_API_KEY = "re_test_key_not_used_network_is_mocked";
process.env.RESEND_RECEIVING_API_KEY = "re_test_receiving_key_not_used_network_is_mocked";
process.env.CRM_INBOUND_EMAIL_DOMAIN = "reply.sitemint.test";

const STAMP = Date.now();
const OWNER = { email: `inbound-owner-${STAMP}@example.test`, name: "[CRM-TEST] Inbound Owner", password: "harbour-trellis-5521" };

const suite = TEST_DB ? describe : describe.skip;

suite("inbound email (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let inbound: typeof import("../lib/inboundEmail.js");
  let staffId = 0;
  let leadId = 0;
  let conversationId = 0;
  let replyToken = "";
  const clientAddress = `client-${STAMP}@clientdomain.test`;

  /** The body Resend would fetch in phase two. Swapped per test. */
  let fetched: import("../lib/inboundEmail.js").FetchedEmail = { text: "hello", headers: {} };
  let fetchShouldThrow: string | null = null;
  const fetcher = async () => {
    if (fetchShouldThrow) throw new Error(fetchShouldThrow);
    return fetched;
  };

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

  /** Posts a payload to the webhook, signed the way Resend signs. */
  async function deliver(payload: Record<string, unknown>, opts: { svixId?: string; corrupt?: boolean } = {}) {
    const { Webhook } = await import("svix");
    const wh = new Webhook(SIGNING_SECRET);
    const svixId = opts.svixId ?? `msg_${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = new Date();
    const body = JSON.stringify(payload);
    const signature = wh.sign(svixId, timestamp, body);
    const res = await fetch(`${base}/api/crm/webhooks/resend/inbound`, {
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
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    return { status: res.status, json, svixId };
  }

  const receivedPayload = (over: Record<string, unknown> = {}) => ({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: `em_${crypto.randomBytes(8).toString("hex")}`,
      from: clientAddress,
      to: ["hello@sitemint.test"],
      cc: [], bcc: [],
      subject: "Re: your proposal",
      message_id: `<${crypto.randomBytes(6).toString("hex")}@clientdomain.test>`,
      attachments: [],
      ...over,
    },
  });

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    inbound = await import("../lib/inboundEmail.js");
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
    await owner.login(OWNER);

    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Inbound Client", email: clientAddress, status: "New",
    }).returning();
    leadId = lead.id;

    const conv = await (await import("../lib/conversations.js")).ensureConversation({
      channel: "email", provider: "resend", contactId: leadId,
      externalAddress: clientAddress, subject: "Your proposal",
    });
    conversationId = conv!.id;
    replyToken = (await inbound.replyTokenFor(conversationId))!;

    // One throwaway call so the first real assertion is not also paying for
    // the dynamic import of svix and the first connection to this route.
    await deliver({ type: "email.delivered", data: {} }).catch(() => undefined);
  }, 120_000);

  afterAll(async () => {
    // Unqualified below: whole tables. Against the owner preview that would
    // delete real staff accounts, so ask the database what it is rather than
    // trusting an environment variable.
    {
      const { assertDisposableDatabase } = await import("../lib/disposableDatabase.js");
      await assertDisposableDatabase("crmEmailInbound.test.ts cleanup");
    }
    await db.delete(schema.crmInboundEmailEvents);
    await db.delete(schema.crmUnmatchedEmails);
    await db.delete(schema.crmEmailSuppressions);
    await db.delete(schema.crmEmailSendCounters);
    const convs = await db.select().from(schema.crmConversations)
      .where(eq(schema.crmConversations.contactId, leadId));
    const ids = convs.map((c) => c.id);
    if (ids.length) {
      await db.delete(schema.crmConversationParticipants)
        .where(inArray(schema.crmConversationParticipants.conversationId, ids));
      await db.delete(schema.crmMessages).where(inArray(schema.crmMessages.conversationId, ids));
      await db.delete(schema.crmConversations).where(inArray(schema.crmConversations.id, ids));
    }
    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, staffId));
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  beforeEach(() => {
    fetched = { text: "hello", headers: {} };
    fetchShouldThrow = null;
  });

  // ── The signature is the authentication ────────────────────────────────────

  it("refuses a payload whose signature does not verify", async () => {
    const before = await db.select().from(schema.crmInboundEmailEvents);
    const r = await deliver(receivedPayload(), { corrupt: true });
    expect(r.status).toBe(400);
    // Nothing was recorded. An unverified payload is not evidence of anything.
    const after = await db.select().from(schema.crmInboundEmailEvents);
    expect(after.length).toBe(before.length);
  }, 30_000);

  it("accepts a correctly signed payload", async () => {
    const r = await deliver(receivedPayload());
    expect(r.status).toBe(200);
    expect(r.json["ok"]).toBe(true);
    expect(typeof r.json["eventId"]).toBe("number");
  }, 30_000);

  it("ignores event types that are not inbound mail", async () => {
    const r = await deliver({ type: "email.delivered", data: { email_id: "em_other" } });
    expect(r.status).toBe(200);
    expect(r.json["ignored"]).toBe(true);
  }, 30_000);

  // ── Deduplication ──────────────────────────────────────────────────────────

  it("treats a retried delivery as a duplicate, not a second email", async () => {
    const payload = receivedPayload();
    const svixId = `msg_${crypto.randomBytes(8).toString("hex")}`;

    const first = await deliver(payload, { svixId });
    expect(first.json["ok"]).toBe(true);
    expect(first.json["duplicate"]).toBeUndefined();

    // Resend retrying the same delivery.
    const retry = await deliver(payload, { svixId });
    expect(retry.status).toBe(200);   // 200, so Resend stops retrying
    expect(retry.json["duplicate"]).toBe(true);
  }, 30_000);

  it("catches an operator replay, which reuses the payload under a NEW delivery id", async () => {
    const payload = receivedPayload();
    await deliver(payload);
    // A dashboard replay is a fresh delivery attempt of the same message. The
    // svix id differs, so only the email id can catch it — and it must, or a
    // real client email is duplicated in their thread.
    const replay = await deliver(payload);
    expect(replay.status).toBe(200);
    expect(replay.json["duplicate"]).toBe(true);
  }, 30_000);

  // ── Correlation ────────────────────────────────────────────────────────────

  it("matches a reply by our own token, which a sender cannot forge", async () => {
    const payload = receivedPayload({
      // Somebody else's address entirely — the token is what identifies it.
      from: "someone-else@elsewhere.test",
      to: [`c-${replyToken}@reply.sitemint.test`],
    });
    const r = await deliver(payload);
    const result = await inbound.processInboundEvent(r.json["eventId"], { fetcher });

    expect(result.state).toBe("stored");
    expect(result.conversationId).toBe(conversationId);

    const [msg] = await db.select().from(schema.crmMessages)
      .where(eq(schema.crmMessages.id, result.messageId!));
    expect(msg.direction).toBe("inbound");
    expect(msg.channel).toBe("email");
    expect(msg.origin).toBe("inbound");
    expect(msg.sentByStaffId).toBeNull();
    expect((msg.metadata as any).matchedBy).toBe("reply-token");
    // The provider gives no authentication verdict, so the record says the
    // sender is unverified rather than implying it was checked.
    expect((msg.metadata as any).senderAuthenticated).toBe(false);
  }, 30_000);

  it("reads a reply token without folding its case", () => {
    // The token is base64url, so "aB" and "Ab" are different secrets.
    // Lowercasing the local part here silently broke every reply match.
    const mixed = "c-AbCdEfGhIjKlMnOpQrSt@reply.sitemint.test";
    expect(inbound.tokenFromRecipients([mixed])).toBe("AbCdEfGhIjKlMnOpQrSt");
    expect(inbound.tokenFromRecipients(["Dana <c-XyZ123@reply.sitemint.test>"])).toBe("XyZ123");
    expect(inbound.tokenFromRecipients(["hello@sitemint.test"])).toBeNull();
    // Address comparison still folds case, because mailboxes do.
    expect(inbound.extractAddress("Dana <Dana@Example.COM>")).toBe("dana@example.com");
  });

  it("falls back to the sender address when there is no token", async () => {
    const r = await deliver(receivedPayload({ to: ["hello@sitemint.test"] }));
    const result = await inbound.processInboundEvent(r.json["eventId"], { fetcher });
    expect(result.state).toBe("stored");
    // Same client, so it joins their existing conversation rather than making
    // a second one.
    expect(result.conversationId).toBe(conversationId);
    const [msg] = await db.select().from(schema.crmMessages)
      .where(eq(schema.crmMessages.id, result.messageId!));
    expect((msg.metadata as any).matchedBy).toBe("sender-address");
  }, 30_000);

  it("keeps mail it cannot place instead of discarding it", async () => {
    const r = await deliver(receivedPayload({ from: "", to: ["hello@sitemint.test"] }));
    const result = await inbound.processInboundEvent(r.json["eventId"], { fetcher });
    expect(result.state).toBe("stored");
    expect(result.reason).toBe("unmatched");

    const queue = await owner.call("GET", "/api/crm/email/unmatched");
    expect(queue.status).toBe(200);
    expect((queue.json["unmatched"] as any[]).length).toBeGreaterThan(0);
    // The body is kept, not a pointer to it — the provider discards content
    // after 30 days and this must survive that.
    expect((queue.json["unmatched"] as any[])[0].bodyText).toBe("hello");
    expect(String(queue.json["definition"])).toMatch(/must not vanish/i);
  }, 30_000);

  it("lets a person file unmatched mail against a contact", async () => {
    const pending = await owner.call("GET", "/api/crm/email/unmatched");
    const item = (pending.json["unmatched"] as any[])[0];
    const attached = await owner.call("POST", `/api/crm/email/unmatched/${item.id}/attach`, { contactId: leadId });
    expect(attached.status).toBe(200);
    expect(attached.json["conversation"].contactId).toBe(leadId);

    const after = await owner.call("GET", "/api/crm/email/unmatched");
    expect((after.json["unmatched"] as any[]).some((u) => u.id === item.id)).toBe(false);
  }, 30_000);

  // ── Content fetch failures ─────────────────────────────────────────────────

  it("leaves a failed content fetch visible rather than losing the message", async () => {
    const r = await deliver(receivedPayload());
    fetchShouldThrow = "Resend returned 503 fetching the message body";
    const result = await inbound.processInboundEvent(r.json["eventId"], { fetcher });
    expect(result.state).toBe("failed");

    const failures = await owner.call("GET", "/api/crm/email/inbound/failures");
    expect(failures.status).toBe(200);
    const stuck = (failures.json["failures"] as any[]).find((f) => f.id === r.json["eventId"]);
    expect(stuck).toBeTruthy();
    expect(String(stuck.lastError)).toMatch(/503/);

    // ...and it can be retried once the provider recovers.
    fetchShouldThrow = null;
    fetched = { text: "recovered body", headers: {} };
    const retried = await inbound.processInboundEvent(r.json["eventId"], { fetcher });
    expect(retried.state).toBe("stored");
  }, 30_000);

  // ── Automation detection ───────────────────────────────────────────────────

  it("recognises an auto-reply from its headers", () => {
    expect(inbound.looksAutomated({ "Auto-Submitted": "auto-replied" })).toBe(true);
    expect(inbound.looksAutomated({ Precedence: "bulk" })).toBe(true);
    expect(inbound.looksAutomated({ "List-Unsubscribe": "<mailto:x@y.z>" })).toBe(true);
    // A person writing "auto-submitted: no" is not an auto-reply.
    expect(inbound.looksAutomated({ "Auto-Submitted": "no" })).toBe(false);
    expect(inbound.looksAutomated({ Subject: "hello" })).toBe(false);
    expect(inbound.looksAutomated(null)).toBe(false);
  });

  it("stops a conversation that is looping", async () => {
    let last = { allowed: true, sentInWindow: 0 } as { allowed: boolean; sentInWindow: number; reason?: string };
    for (let i = 0; i < 12; i++) last = await inbound.recordOutboundForLoopControl(conversationId);
    expect(last.allowed).toBe(false);
    expect(String(last.reason)).toMatch(/reply loop/i);

    // The brake being on is recorded, not silent.
    const [counter] = await db.select().from(schema.crmEmailSendCounters)
      .where(eq(schema.crmEmailSendCounters.conversationId, conversationId));
    expect(counter.haltedAt).not.toBeNull();
    expect(String(counter.haltReason)).toMatch(/reply loop/i);
  }, 30_000);

  // ── Suppression ────────────────────────────────────────────────────────────

  it("suppresses a hard bounce but not a soft one", async () => {
    await inbound.suppressAddress({ address: "hard@bounce.test", reason: "bounce", bounceType: "Permanent" });
    await inbound.suppressAddress({ address: "soft@bounce.test", reason: "bounce", bounceType: "Transient" });

    expect((await inbound.isSuppressed("hard@bounce.test")).suppressed).toBe(true);
    // A full mailbox empties. Refusing to write to somebody forever because of
    // a temporary failure would lose real business.
    expect((await inbound.isSuppressed("soft@bounce.test")).suppressed).toBe(false);

    const complaint = "complained@spam.test";
    await inbound.suppressAddress({ address: complaint, reason: "complaint" });
    const check = await inbound.isSuppressed(complaint);
    expect(check.suppressed).toBe(true);
    expect(String(check.reason)).toMatch(/deliverability/i);
  }, 30_000);

  it("warns when releasing an address that had complained", async () => {
    const list = await owner.call("GET", "/api/crm/email/suppressions");
    expect(list.status).toBe(200);
    expect((list.json["suppressions"] as any[]).some((s) => s.address === "complained@spam.test")).toBe(true);

    const released = await owner.call("POST", "/api/crm/email/suppressions/release", { address: "complained@spam.test" });
    expect(released.status).toBe(200);
    expect(String(released.json["warning"])).toMatch(/deliverability/i);

    expect((await inbound.isSuppressed("complained@spam.test")).suppressed).toBe(false);
  }, 30_000);

  it("normalises an address so case cannot slip past suppression", async () => {
    await inbound.suppressAddress({ address: "MixedCase@Bounce.Test", reason: "bounce", bounceType: "Permanent" });
    expect((await inbound.isSuppressed("mixedcase@bounce.test")).suppressed).toBe(true);
    expect((await inbound.isSuppressed("MIXEDCASE@BOUNCE.TEST")).suppressed).toBe(true);
  }, 30_000);

  // ── Status and permissions ─────────────────────────────────────────────────

  it("reports its own configuration honestly", async () => {
    const status = await owner.call("GET", "/api/crm/email/inbound/status");
    expect(status.status).toBe(200);
    expect(status.json["configured"]).toBe(true);
    expect(status.json["replyDomain"]).toBe("reply.sitemint.test");
    expect(status.json["reason"]).toBeNull();
  }, 30_000);

  it("names exactly what is missing when it is not configured", () => {
    expect(inbound.inboundBlockedReason({} as NodeJS.ProcessEnv)).toMatch(/RESEND_RECEIVING_API_KEY/);
    // A sending key alone is NOT enough and must not read as configured: it is
    // exactly the state in which every fetch of a received message is refused.
    expect(inbound.inboundBlockedReason({ RESEND_API_KEY: "x" } as NodeJS.ProcessEnv)).toMatch(/RESEND_RECEIVING_API_KEY/);
    expect(inbound.inboundConfigured({
      RESEND_API_KEY: "x", RESEND_WEBHOOK_SECRET: "y", CRM_INBOUND_EMAIL_DOMAIN: "reply.sitemint.test",
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(inbound.inboundBlockedReason({ RESEND_RECEIVING_API_KEY: "x" } as NodeJS.ProcessEnv)).toMatch(/WEBHOOK_SECRET/);
    expect(inbound.inboundBlockedReason({
      RESEND_RECEIVING_API_KEY: "x", RESEND_WEBHOOK_SECRET: "y",
    } as NodeJS.ProcessEnv)).toMatch(/CRM_INBOUND_EMAIL_DOMAIN/);
  });

  it("explains a refused receiving key as a scope problem, not a bare status", () => {
    expect(inbound.describeReceivingFailure(401)).toMatch(/full-access/);
    expect(inbound.describeReceivingFailure(403)).toMatch(/sending-only key cannot read received mail/);
    expect(inbound.describeReceivingFailure(404)).toMatch(/no received message/);
    expect(inbound.describeReceivingFailure(500)).toMatch(/500/);
  });

  it("refuses a restricted user on every operator surface", async () => {
    const { hashPassword } = await import("../lib/staffCredentials.js");
    const RESTRICTED = { email: `inbound-restricted-${STAMP}@example.test`, password: "verdant-copper-8890" };
    const [row] = await db.insert(schema.crmStaff).values({
      email: RESTRICTED.email, displayName: "[CRM-TEST] Restricted",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(RESTRICTED.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["communications.read", "communications.send"],
    }).returning();

    const restricted = new Agent();
    await restricted.login(RESTRICTED);
    expect((await restricted.call("GET", "/api/crm/email/unmatched")).status).toBe(403);
    expect((await restricted.call("GET", "/api/crm/email/suppressions")).status).toBe(403);
    expect((await restricted.call("GET", "/api/crm/email/inbound/status")).status).toBe(403);
    // Releasing a suppression is owner-gated even beyond communications —
    // it risks every other client's deliverability.
    expect((await restricted.call("POST", "/api/crm/email/suppressions/release", { address: "x@y.test" })).status).toBe(403);

    await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, row.id));
  }, 60_000);
});
