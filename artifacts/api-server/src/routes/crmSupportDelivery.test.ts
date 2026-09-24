/**
 * M5 Support delivery — a customer reply that actually reaches the customer.
 *
 * Support could record a reply and never send one. These tests drive the whole
 * path against a real PostgreSQL database and the real Express app, because
 * every property here is about what a client does or does not receive, and
 * none of them can be settled by asserting about a helper in isolation:
 *
 *  - a customer reply really passes through pending → attempting → accepted,
 *    observed FROM INSIDE the provider call rather than inferred from the end
 *    state;
 *  - an internal note produces no delivery at all, is never handed to the
 *    provider, and the database itself refuses to let one become deliverable;
 *  - a refused send leaves the message visibly refused — never quietly "sent";
 *  - a 5xx is UNKNOWN and is never retried by a machine, while a connection
 *    that never opened is retried, because only that one proves nothing went;
 *  - a client's emailed reply lands on the ticket it answers, correlated on the
 *    unforgeable reply token;
 *  - a message whose token does not match is never guessed onto a ticket, even
 *    when it comes from the client's own address;
 *  - a refused write writes nothing;
 *  - the customer-facing projection still contains zero internal notes, checked
 *    by searching the whole serialised response rather than trusting a field.
 *
 * Gated on CRM_TEST_DATABASE_URL. Skips without it so CI stays green.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "support-delivery-admin-secret";
// The reply domain is what makes a Reply-To identify a ticket. Set here so the
// token path is exercised; no MX record exists and none is needed, because the
// inbound pipeline is driven directly rather than over the network.
process.env.CRM_INBOUND_EMAIL_DOMAIN = "reply.example.test";

type MockOutcome =
  | { sent: true; providerId: string | null }
  | {
      sent: false;
      failure: "not_configured" | "rejected" | "failed" | "uncertain";
      reason: string;
      configured: boolean;
    };

/**
 * Stands in for Resend. Records every attempted send — the only way a
 * duplicate is visible — answers however the test under way needs, and never
 * touches a network.
 *
 * `duringSend` runs while the request is notionally in flight, which is the
 * only moment the `attempting` state exists. Asserting from there is the
 * difference between testing that the state machine passes through a state and
 * assuming it did.
 */
const sends: { to: string; subject: string; text: string; idempotencyKey?: string }[] = [];
let blockedReason: string | null = null;
let respond: (n: number) => Promise<MockOutcome> = async (n) => ({ sent: true, providerId: `provider-${n}` });
let duringSend: (() => Promise<void>) | null = null;

vi.mock("../lib/staffMail.js", () => ({
  RESEND_IDEMPOTENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
  staffMailConfigured: () => blockedReason === null,
  staffMailBlockedReason: () => blockedReason,
  trySendStaffMail: async (args: { to: string; subject: string; text: string; idempotencyKey?: string }) => {
    sends.push({ to: args.to, subject: args.subject, text: args.text, idempotencyKey: args.idempotencyKey });
    if (duringSend) await duringSend();
    return respond(sends.length);
  },
  classifyProviderError: () => "rejected",
  classifyThrownMailError: () => "uncertain",
  inviteMessage: () => ({ subject: "", text: "" }),
  resetMessage: () => ({ subject: "", text: "" }),
  activationUrl: () => null,
}));

/** Answers that put a delivery into each interesting state. */
const ANSWERS = {
  accepted: async (n: number): Promise<MockOutcome> => ({ sent: true, providerId: `provider-${n}` }),
  refused: async (): Promise<MockOutcome> => ({
    sent: false, failure: "rejected", configured: true,
    reason: "The recipient domain does not exist.",
  }),
  serverError: async (): Promise<MockOutcome> => ({
    // staffMail calls a 5xx `failed`. The delivery layer must NOT read that as
    // "not sent" — the request was written, so the provider had a chance to
    // take it.
    sent: false, failure: "failed", configured: true,
    reason: "Resend returned 500 internal_server_error.",
  }),
  neverConnected: async (): Promise<MockOutcome> => ({
    sent: false, failure: "failed", configured: true,
    reason: "connect ECONNREFUSED 10.255.255.1:443",
  }),
  lostResponse: async (): Promise<MockOutcome> => ({
    sent: false, failure: "uncertain", configured: true, reason: "socket hang up",
  }),
};

const STAMP = Date.now();
const OWNER = {
  email: `supdel-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Delivery Owner",
  password: "harbour-trellis-5521",
};
const READER = {
  email: `supdel-reader-${STAMP}@example.test`,
  password: "verdant-copper-8890",
};

const suite = TEST_DB ? describe : describe.skip;

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

suite("M5 support delivery: a reply that reaches the customer (real DB)", () => {
  let server: http.Server;
  let base = "";
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");
  let inbound: typeof import("../lib/inboundEmail.js");
  let delivery: typeof import("../lib/supportDelivery.js");

  const staffIds: Record<string, number> = {};
  let leadId = 0;
  let contactEmail = "";
  const createdTicketIds: number[] = [];
  const createdEventIds: number[] = [];

  const owner = new Agent(() => base);
  const reader = new Agent(() => base);

  beforeAll(async () => {
    schema = await import("@workspace/db");
    db = schema.db;
    inbound = await import("../lib/inboundEmail.js");
    delivery = await import("../lib/supportDelivery.js");

    const { setBootState } = await import("../lib/bootState.js");
    setBootState("ready");
    const { default: app } = await import("../app.js") as { default: import("express").Express };
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [ownerRow] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    staffIds[OWNER.email] = ownerRow.id;

    // Somebody who can read and work tickets but may NOT contact a customer.
    const [restricted] = await db.insert(schema.crmStaff).values({
      email: READER.email, displayName: "[CRM-TEST] No Comms",
      role: "operations_manager", status: "active",
      passwordHash: await hashPassword(READER.password), passwordUpdatedAt: new Date(),
      revokedPermissions: ["communications.send"],
    }).returning();
    staffIds[READER.email] = restricted.id;

    expect(await owner.login(OWNER)).toBe(200);
    expect(await reader.login(READER)).toBe(200);

    contactEmail = `supdel-client-${STAMP}@example.test`;
    const [lead] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] Delivery Client", email: contactEmail, status: "Client",
    }).returning();
    leadId = lead.id;
  }, 120_000);

  afterAll(async () => {
    if (!TEST_DB) return;
    const ids = [...new Set(createdTicketIds)];
    const conversationIds = ids.length
      ? (await db.select({ id: schema.crmSupportTickets.conversationId })
          .from(schema.crmSupportTickets)
          .where(inArray(schema.crmSupportTickets.id, ids)))
          .map((r) => r.id).filter((v): v is number => v != null)
      : [];
    if (ids.length) {
      await db.delete(schema.crmSupportMessages).where(inArray(schema.crmSupportMessages.ticketId, ids));
      await db.delete(schema.crmSupportTickets).where(inArray(schema.crmSupportTickets.id, ids));
    }
    if (createdEventIds.length) {
      await db.delete(schema.crmInboundEmailEvents)
        .where(inArray(schema.crmInboundEmailEvents.id, createdEventIds));
    }
    await db.delete(schema.crmMessages).where(eq(schema.crmMessages.leadId, leadId));
    const leadConversations = await db.select({ id: schema.crmConversations.id })
      .from(schema.crmConversations).where(eq(schema.crmConversations.contactId, leadId));
    const allConversations = [...new Set([...conversationIds, ...leadConversations.map((c) => c.id)])];
    if (allConversations.length) {
      await db.delete(schema.crmMessages)
        .where(inArray(schema.crmMessages.conversationId, allConversations));
      await db.delete(schema.crmConversationParticipants)
        .where(inArray(schema.crmConversationParticipants.conversationId, allConversations));
      await db.delete(schema.crmEmailSendCounters)
        .where(inArray(schema.crmEmailSendCounters.conversationId, allConversations));
      await db.delete(schema.crmConversations)
        .where(inArray(schema.crmConversations.id, allConversations));
    }
    await db.delete(schema.crmUnmatchedEmails)
      .where(eq(schema.crmUnmatchedEmails.fromAddress, contactEmail));
    await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, leadId));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
    for (const id of Object.values(staffIds)) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, id));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 120_000);

  beforeEach(() => {
    sends.length = 0;
    blockedReason = null;
    duringSend = null;
    respond = ANSWERS.accepted;
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Only this suite's sends — other suites share the process. */
  const mine = () => sends.filter((s) => s.to === contactEmail);

  async function newTicket(subject: string): Promise<number> {
    const created = await owner.call("POST", "/api/crm/support/tickets", {
      leadId, subject: `[CRM-TEST] ${subject}`, priority: "normal",
    });
    expect(created.status).toBe(201);
    const id = created.json["ticket"].id as number;
    createdTicketIds.push(id);
    return id;
  }

  async function reply(ticketId: number, body: string) {
    return owner.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "customer", body,
    });
  }

  async function messageRow(id: number) {
    const [row] = await db.select().from(schema.crmSupportMessages)
      .where(eq(schema.crmSupportMessages.id, id)).limit(1);
    return row;
  }

  /**
   * Drives the REAL inbound pipeline for one received email, with the body
   * fetch stubbed. Correlation itself is untouched: `processInboundEvent`
   * decides which conversation this belongs to, exactly as it does in
   * production.
   */
  async function receiveEmail(args: { to: string[]; text: string; subject?: string }) {
    const emailId = `email-${STAMP}-${Math.random().toString(36).slice(2, 10)}`;
    const intake = await inbound.recordInboundEvent({
      svixId: `svix-${emailId}`,
      payload: {
        type: "email.received",
        data: {
          email_id: emailId,
          from: `Delivery Client <${contactEmail}>`,
          to: args.to,
          subject: args.subject ?? "Re: a support ticket",
          message_id: `<${emailId}@mail.example.test>`,
        },
      },
    });
    expect(intake.status).toBe("accepted");
    if (intake.eventId) createdEventIds.push(intake.eventId);
    return inbound.processInboundEvent(intake.eventId!, {
      fetcher: async () => ({ text: args.text, html: null, headers: {} }),
    });
  }

  // ── The reply actually goes ───────────────────────────────────────────────

  it("sends a customer reply, passing through pending → attempting → accepted, and never calls it \"sent\"", async () => {
    const ticketId = await newTicket("The contact form is down");

    // Observed from inside the provider call: this is the only instant the
    // `attempting` state exists, and it is the state that makes a killed
    // worker recoverable rather than invisible.
    let inFlight: { state: string | null; worker: string | null; attempt: number | null } | null = null;
    duringSend = async () => {
      const [row] = await db.select().from(schema.crmSupportMessages)
        .where(and(
          eq(schema.crmSupportMessages.ticketId, ticketId),
          eq(schema.crmSupportMessages.visibility, "customer"),
        )).limit(1);
      inFlight = row
        ? { state: row.deliveryState, worker: row.attemptWorker, attempt: row.deliveryAttempt }
        : null;
    };

    const sent = await reply(ticketId, "We have found it and it is fixed.");
    expect(sent.status).toBe(201);

    expect(inFlight).not.toBeNull();
    expect(inFlight!.state).toBe("attempting");
    expect(inFlight!.attempt).toBe(1);
    // A claimed row names the worker holding it, which is what lets a lost
    // attempt be recovered without a machine re-sending it.
    expect(inFlight!.worker).toBeTruthy();

    // One send, to the client, carrying the message and a stable key.
    expect(mine()).toHaveLength(1);
    const messageId = sent.json["message"].id as number;
    expect(mine()[0].idempotencyKey).toBe(`support:${ticketId}:${messageId}`);
    expect(mine()[0].text).toContain("We have found it and it is fixed.");
    expect(mine()[0].subject).toContain(`SUP-${String(ticketId).padStart(5, "0")}`);

    const view = sent.json["delivery"];
    expect(view.state).toBe("accepted");
    // The honesty rule. "Accepted" is the strongest claim available and the
    // word "Sent" is not used for it anywhere on this response.
    expect(view.label).toBe("Accepted by the mail provider");
    expect(String(view.label)).not.toMatch(/^sent$/i);
    expect(String(view.explanation)).toMatch(/not the same as the client receiving it/i);
    expect(view.needsAttention).toBe(false);

    const row = await messageRow(messageId);
    expect(row.deliveryState).toBe("accepted");
    expect(row.deliveredTo).toBe(contactEmail);
    expect(row.deliveryProviderRef).toBeTruthy();
    expect(row.nextAttemptAt).toBeNull();
    expect(row.attemptWorker).toBeNull();
  }, 60_000);

  it("puts a Reply-To on the message that identifies this ticket, and no other", async () => {
    const first = await newTicket("Reply addressing one");
    const second = await newTicket("Reply addressing two");
    await reply(first, "Answer one.");
    await reply(second, "Answer two.");

    const [t1] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, first)).limit(1);
    const [t2] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, second)).limit(1);

    // Per TICKET, not per contact. On `email:lead:<id>` both tickets would
    // share one token and a reply could not say which ticket it answered.
    expect(t1.conversationId).toBeTruthy();
    expect(t2.conversationId).toBeTruthy();
    expect(t1.conversationId).not.toBe(t2.conversationId);

    const a1 = await inbound.replyToAddress(t1.conversationId!);
    const a2 = await inbound.replyToAddress(t2.conversationId!);
    expect(a1).toMatch(/^c-.+@reply\.example\.test$/);
    expect(a2).not.toBe(a1);
    expect(mine()[0].text).toContain(`SUP-${String(first).padStart(5, "0")}`);
  }, 60_000);

  // ── An internal note is not a delivery ────────────────────────────────────

  it("gives an internal note no delivery state at all, and hands nothing to the provider", async () => {
    const ticketId = await newTicket("Internal note only");

    const noted = await owner.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "internal", body: "[CRM-TEST] The client is on the old plan — do not mention the discount.",
    });
    expect(noted.status).toBe(201);

    // Nothing was handed over, at all.
    expect(mine()).toHaveLength(0);

    // No delivery EXISTS — not a "pending" one, not an "n/a" one. Null is the
    // only honest answer for something that is never sent.
    expect(noted.json["message"].delivery).toBeNull();
    const row = await messageRow(noted.json["message"].id);
    expect(row.deliveryState).toBeNull();
    expect(row.deliveryIdempotencyKey).toBeNull();
    expect(row.deliveredTo).toBeNull();
    expect(row.nextAttemptAt).toBeNull();

    // And it cannot be recovered into a send either.
    const recovery = await owner.call("POST", `/api/crm/support/messages/${row.id}/delivery-recovery`, {
      action: "resend", reason: "trying to force this private note out",
    });
    expect(recovery.status).toBe(409);
    expect(mine()).toHaveLength(0);
  }, 60_000);

  it("refuses at the DATABASE to make an internal note deliverable, whatever the route does", async () => {
    const ticketId = await newTicket("Constraint proof");
    const noted = await owner.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "internal", body: "[CRM-TEST] private",
    });
    const id = noted.json["message"].id as number;

    // The guarantee has to survive a future route that forgets its branch, so
    // it is the database that refuses — not a branch that could be deleted.
    // Drizzle wraps the driver error, so the constraint name is read off the
    // cause rather than the wrapper's message.
    let refusal: unknown = null;
    try {
      await db.update(schema.crmSupportMessages)
        .set({ deliveryState: "pending", deliveredTo: contactEmail, nextAttemptAt: new Date() })
        .where(eq(schema.crmSupportMessages.id, id));
    } catch (err) { refusal = err; }

    expect(refusal).not.toBeNull();
    const named = JSON.stringify({
      message: (refusal as Error).message,
      constraint: ((refusal as { cause?: { constraint?: string } }).cause)?.constraint,
      causeMessage: ((refusal as { cause?: { message?: string } }).cause)?.message,
    });
    expect(named).toContain("ck_crm_support_messages_internal_never_sent");

    const row = await messageRow(id);
    expect(row.deliveryState).toBeNull();
  }, 60_000);

  it("keeps the customer projection free of internal notes, searched over the whole response", async () => {
    const ticketId = await newTicket("Projection check");
    const secret = `[CRM-TEST] never-show-this-${STAMP}`;
    await owner.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "internal", body: secret,
    });
    await reply(ticketId, "Here is the answer you asked for.");

    const view = await owner.call("GET", `/api/crm/support/tickets/${ticketId}/customer-view`);
    expect(view.status).toBe(200);
    // The whole serialised body, not a named field: a projection that leaked
    // the note into a preview, a count or a definition would still be a leak.
    expect(view.text).not.toContain(secret);
    expect(view.text).not.toContain("never-show-this");
    // Delivery internals are ours, not the client's.
    expect(view.text).not.toContain("idempotency");
    expect(view.text).not.toContain("deliveryState");
    expect(view.json["messages"]).toHaveLength(1);
  }, 60_000);

  // ── Failure is visible, and never mistaken for success ────────────────────

  it("leaves a refused send visibly refused, not silently sent", async () => {
    respond = ANSWERS.refused;
    const ticketId = await newTicket("Refused send");
    const sent = await reply(ticketId, "This one will be refused.");
    expect(sent.status).toBe(201);

    const view = sent.json["delivery"];
    expect(view.state).toBe("refused");
    expect(String(view.label)).toMatch(/did not get this/i);
    expect(view.needsAttention).toBe(true);
    expect(String(view.explanation)).toContain("The recipient domain does not exist.");
    // Nothing on this response claims acceptance or a provider reference.
    expect(view.providerRef).toBeNull();
    expect(sent.text).not.toContain("Accepted by the mail provider");

    const row = await messageRow(sent.json["message"].id);
    expect(row.deliveryState).toBe("refused");
    expect(row.deliveryFailureReason).toBe("provider_refused");
    expect(row.nextAttemptAt).toBeNull();

    // And it is on the list a person works, counted over every open row.
    const list = await owner.call("GET", "/api/crm/support/deliveries");
    expect(list.status).toBe(200);
    const found = list.json["deliveries"].find((d: any) => d.messageId === row.id);
    expect(found).toBeTruthy();
    expect(found.delivery.needsAttention).toBe(true);
    expect(list.json["counts"].open).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("treats a 5xx as UNKNOWN and never retries it automatically", async () => {
    respond = ANSWERS.serverError;
    const ticketId = await newTicket("Server error");
    const sent = await reply(ticketId, "This one gets a 500.");
    const messageId = sent.json["message"].id as number;

    const view = sent.json["delivery"];
    // The consequential judgement: the request WAS written, so "it did not go"
    // is a guess. Reading it as "not sent" is how a client gets two copies.
    expect(view.state).toBe("uncertain");
    expect(String(view.label)).toMatch(/unknown/i);
    expect(view.needsAttention).toBe(true);

    const row = await messageRow(messageId);
    expect(row.deliveryState).toBe("uncertain");
    expect(row.deliveryFailureReason).toBe("provider_answered_but_outcome_unknown");
    // No automatic attempt is scheduled — the check constraint would refuse
    // one on a non-pending row anyway, which is the point of that constraint.
    expect(row.nextAttemptAt).toBeNull();

    const before = mine().length;
    respond = ANSWERS.accepted;
    const pass = await owner.call("POST", "/api/crm/support/deliveries/process", {});
    expect(pass.status).toBe(200);
    // The worker saw nothing to do. A machine does not decide this one.
    expect(mine()).toHaveLength(before);
    expect((await messageRow(messageId)).deliveryState).toBe("uncertain");
  }, 60_000);

  it("does retry the one failure that proves nothing was sent, and settles it", async () => {
    respond = ANSWERS.neverConnected;
    const ticketId = await newTicket("Never connected");
    const sent = await reply(ticketId, "The socket never opened.");
    const messageId = sent.json["message"].id as number;

    const row = await messageRow(messageId);
    // A connection that never opened is the only class where "nothing was
    // taken" is a fact rather than a hope, so it is the only one a machine may
    // repeat.
    expect(row.deliveryState).toBe("pending");
    expect(row.deliveryFailureReason).toBe("never_left_this_server");
    expect(row.nextAttemptAt).not.toBeNull();
    expect(sent.json["delivery"].state).toBe("pending");
    expect(sent.json["delivery"].label).toBe("Queued to send");

    // Bring the scheduled attempt forward and let the worker have it.
    await db.update(schema.crmSupportMessages)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(schema.crmSupportMessages.id, messageId));
    respond = ANSWERS.accepted;
    const pass = await owner.call("POST", "/api/crm/support/deliveries/process", {});
    expect(pass.json["attempted"]).toBeGreaterThanOrEqual(1);

    const after = await messageRow(messageId);
    expect(after.deliveryState).toBe("accepted");
    expect(after.deliveryAttempt).toBe(2);
    // Same key across the retry, so the provider collapses a repeat rather
    // than sending the client a second copy.
    expect(mine()[0].idempotencyKey).toBe(mine()[1].idempotencyKey);
  }, 60_000);

  it("records a reply the server cannot send as visibly not sent, rather than pretending or dropping it", async () => {
    blockedReason = "Email test mode is on (CRM_EMAIL_TEST_MODE is not \"false\"), so mail is simulated rather than sent.";
    const ticketId = await newTicket("No mail configured");
    const sent = await reply(ticketId, "Nobody can send this right now.");

    expect(mine()).toHaveLength(0);
    const view = sent.json["delivery"];
    expect(view.state).toBe("pending");
    expect(view.label).toBe("Waiting — not sent");
    // Waiting on a PERSON, not on a timer that would never help.
    expect(view.nextAttemptAt).toBeNull();
    expect(view.needsAttention).toBe(true);
    expect(String(view.explanation)).toMatch(/test mode/i);

    const row = await messageRow(sent.json["message"].id);
    expect(row.deliveryFailureReason).toBe("mail_not_configured");

    // Once mail works, a person can retry it and it goes.
    blockedReason = null;
    const recovered = await owner.call("POST", `/api/crm/support/messages/${row.id}/delivery-recovery`, {
      action: "retry", reason: "mail is configured now",
    });
    expect(recovered.status).toBe(200);
    expect(recovered.json["delivery"].state).toBe("accepted");
    expect(mine()).toHaveLength(1);
  }, 60_000);

  it("refuses a reply to a contact with no address, and says so instead of queueing forever", async () => {
    const [addressless] = await db.insert(schema.crmLeads).values({
      name: "[CRM-TEST] No Address", email: "", status: "Client",
    }).returning();
    const created = await owner.call("POST", "/api/crm/support/tickets", {
      leadId: addressless.id, subject: "[CRM-TEST] Nowhere to send",
    });
    const ticketId = created.json["ticket"].id as number;
    createdTicketIds.push(ticketId);

    const sent = await reply(ticketId, "There is nowhere for this to go.");
    expect(sends.some((s) => s.to === "")).toBe(false);
    expect(sent.json["delivery"].state).toBe("refused");
    expect(sent.json["delivery"].failureReason).toBe("recipient_unavailable");

    await db.delete(schema.crmSupportMessages).where(eq(schema.crmSupportMessages.ticketId, ticketId));
    await db.delete(schema.crmSupportTickets).where(eq(schema.crmSupportTickets.id, ticketId));
    await db.delete(schema.crmActivities).where(eq(schema.crmActivities.leadId, addressless.id));
    await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, addressless.id));
  }, 60_000);

  // ── Recovery is a person's decision ───────────────────────────────────────

  it("gives a re-send a NEW idempotency key, and a retry the original one", async () => {
    respond = ANSWERS.lostResponse;
    const ticketId = await newTicket("Recovery keys");
    const sent = await reply(ticketId, "The answer never came back.");
    const messageId = sent.json["message"].id as number;
    expect((await messageRow(messageId)).deliveryState).toBe("uncertain");
    const originalKey = mine()[0].idempotencyKey;

    respond = ANSWERS.accepted;
    const resent = await owner.call("POST", `/api/crm/support/messages/${messageId}/delivery-recovery`, {
      action: "resend", reason: "the client rang and never received it",
    });
    expect(resent.status).toBe(200);
    // A re-send is a deliberate SECOND copy. Reusing the key would have the
    // provider collapse it into the first send and do nothing at all.
    expect(mine()[1].idempotencyKey).not.toBe(originalKey);
    expect(mine()[1].idempotencyKey).toContain("resend");

    const row = await messageRow(messageId);
    expect(row.deliveryState).toBe("accepted");
    expect(row.deliveryResolution).toBe("resent");
    expect(row.deliveryResolvedByStaffId).toBe(staffIds[OWNER.email]);
    expect(row.deliveryResolutionNote).toBeTruthy();
  }, 60_000);

  it("demands a reason for a recovery, and refuses one nobody may take", async () => {
    respond = ANSWERS.refused;
    const ticketId = await newTicket("Recovery gates");
    const sent = await reply(ticketId, "Refused again.");
    const messageId = sent.json["message"].id as number;

    const noReason = await owner.call("POST", `/api/crm/support/messages/${messageId}/delivery-recovery`, {
      action: "acknowledge",
    });
    expect(noReason.status).toBe(400);

    // Closing a case that says a client never got their answer is a decision
    // about the client, so it needs the customer-contact grant.
    const refusedUser = await reader.call("POST", `/api/crm/support/messages/${messageId}/delivery-recovery`, {
      action: "acknowledge", reason: "not my place",
    });
    expect(refusedUser.status).toBe(403);
    expect((await messageRow(messageId)).deliveryResolvedAt).toBeNull();

    const done = await owner.call("POST", `/api/crm/support/messages/${messageId}/delivery-recovery`, {
      action: "acknowledge", reason: "rang the client and read it to them",
    });
    expect(done.status).toBe(200);
    const row = await messageRow(messageId);
    expect(row.deliveryResolution).toBe("acknowledged");
    // Acknowledging closes the CASE. It does not rewrite what happened.
    expect(row.deliveryState).toBe("refused");
    expect(row.deliveryResolutionNote).toContain("rang the client");
  }, 60_000);

  // ── The reply comes back ──────────────────────────────────────────────────

  it("lands a client's emailed reply on the ticket it answers, matched on the reply token", async () => {
    const ticketId = await newTicket("Inbound correlation");
    await reply(ticketId, "Can you confirm which page it is?");

    const [ticket] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, ticketId)).limit(1);
    const replyTo = await inbound.replyToAddress(ticket.conversationId!);
    expect(replyTo).toBeTruthy();

    const answer = `[CRM-TEST] It is the contact page, ${STAMP}.`;
    const processed = await receiveEmail({ to: [replyTo!], text: answer });
    expect(processed.state).toBe("stored");
    // The inbound pipeline matched it on OUR token, not on the sender.
    expect(processed.conversationId).toBe(ticket.conversationId);

    // Opening the ticket files it onto the thread.
    const detail = await owner.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(detail.status).toBe(200);
    const landed = detail.json["messages"].find((m: any) => String(m.body).includes(answer));
    expect(landed).toBeTruthy();
    expect(landed.origin).toBe("customer");
    expect(landed.visibility).toBe("customer");
    expect(landed.arrivedByEmail).toBe(true);
    // The client's own words are not something we deliver back to them.
    expect(landed.delivery).toBeNull();

    // Filing it twice would post the client's reply into their ticket twice.
    const again = await owner.call("POST", "/api/crm/support/inbound/ingest", { ticketId });
    expect(again.status).toBe(200);
    expect(again.json["filed"]).toBe(0);
    const second = await owner.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(second.json["messages"].filter((m: any) => String(m.body).includes(answer))).toHaveLength(1);

    // And the client sees their own message on the customer projection.
    const customerView = await owner.call("GET", `/api/crm/support/tickets/${ticketId}/customer-view`);
    expect(customerView.text).toContain(answer);
  }, 60_000);

  it("moves a ticket back to us when the client answers, without reopening one somebody deliberately finished", async () => {
    const ticketId = await newTicket("Waiting then answered");
    await reply(ticketId, "Let us know when you have tried it.");
    const parked = await owner.call("POST", `/api/crm/support/tickets/${ticketId}/status`, {
      status: "waiting_on_customer",
    });
    expect(parked.status).toBe(200);

    const [ticket] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, ticketId)).limit(1);
    const replyTo = await inbound.replyToAddress(ticket.conversationId!);
    await receiveEmail({ to: [replyTo!], text: `[CRM-TEST] Tried it, still broken ${STAMP}.` });

    const detail = await owner.call("GET", `/api/crm/support/tickets/${ticketId}`);
    // The ball is ours again.
    expect(detail.json["ticket"].status).toBe("open");
    expect(detail.json["ticket"].lastCustomerMessageAt).toBeTruthy();
  }, 60_000);

  it("never guesses an unmatched message onto a ticket, even from the client's own address", async () => {
    const ticketId = await newTicket("Unforgeable correlation");
    await reply(ticketId, "Here is the answer.");
    const [ticket] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, ticketId)).limit(1);

    const beforeCount = (await owner.call("GET", `/api/crm/support/tickets/${ticketId}`))
      .json["messages"].length;

    // Same client, same mailbox — and a token that is simply wrong. `from` is
    // an unauthenticated claim, so being the right person is not evidence of
    // answering a particular ticket.
    const spoofed = `[CRM-TEST] injected-${STAMP}`;
    const processed = await receiveEmail({
      to: [`c-notarealtokenatall${STAMP}@reply.example.test`],
      text: spoofed,
    });
    expect(processed.state).toBe("stored");
    // It fell back to the sender address, which lands on the contact's own
    // inbox conversation — a conversation no ticket owns.
    expect(processed.conversationId).not.toBe(ticket.conversationId);

    const swept = await owner.call("POST", "/api/crm/support/inbound/ingest", {});
    expect(swept.status).toBe(200);

    const after = await owner.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(after.json["messages"]).toHaveLength(beforeCount);
    expect(after.text).not.toContain(spoofed);

    // Nor onto any other ticket in the system.
    for (const id of createdTicketIds) {
      const t = await owner.call("GET", `/api/crm/support/tickets/${id}`);
      if (t.status === 200) expect(t.text).not.toContain(spoofed);
    }
  }, 60_000);

  it("ignores a message on a ticket's own conversation that the token did not match", async () => {
    const ticketId = await newTicket("Token proof required");
    await reply(ticketId, "Answering.");
    const [ticket] = await db.select().from(schema.crmSupportTickets)
      .where(eq(schema.crmSupportTickets.id, ticketId)).limit(1);

    // Planted directly on the ticket's conversation, exactly as a
    // sender-address match would leave it — with `matchedBy` saying so. The
    // ingest must require the token's proof, not merely the right thread.
    const sneaky = `[CRM-TEST] address-matched-${STAMP}`;
    await db.insert(schema.crmMessages).values({
      leadId, conversationId: ticket.conversationId!,
      direction: "inbound", channel: "email", body: sneaky,
      origin: "inbound", status: "received",
      metadata: { matchedBy: "sender-address", senderAuthenticated: false },
    });

    const swept = await owner.call("POST", "/api/crm/support/inbound/ingest", { ticketId });
    expect(swept.json["filed"]).toBe(0);
    const detail = await owner.call("GET", `/api/crm/support/tickets/${ticketId}`);
    expect(detail.text).not.toContain(sneaky);
  }, 60_000);

  // ── A refused write writes nothing ────────────────────────────────────────

  it("refuses a customer reply from somebody without the grant, and writes nothing at all", async () => {
    const ticketId = await newTicket("Permission boundary");

    const before = await db.select().from(schema.crmSupportMessages)
      .where(eq(schema.crmSupportMessages.ticketId, ticketId));

    const refused = await reader.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "customer", body: "[CRM-TEST] should never exist or be sent",
    });
    expect(refused.status).toBe(403);
    expect(refused.json["permission"]).toBe("communications.send");

    // A 403 that still wrote — or still sent — is worse than no check at all.
    const after = await db.select().from(schema.crmSupportMessages)
      .where(eq(schema.crmSupportMessages.ticketId, ticketId));
    expect(after).toHaveLength(before.length);
    expect(mine()).toHaveLength(0);

    // The same person may still take a private note, which is the whole point
    // of the line being where it is.
    const noted = await reader.call("POST", `/api/crm/support/tickets/${ticketId}/messages`, {
      visibility: "internal", body: "[CRM-TEST] flagged for somebody who can reply",
    });
    expect(noted.status).toBe(201);
    expect(mine()).toHaveLength(0);
  }, 60_000);

  it("reports what delivery can and cannot do, in words an operator can act on", async () => {
    const status = await owner.call("GET", "/api/crm/support/delivery/status");
    expect(status.status).toBe(200);
    expect(status.json["canSend"]).toBe(true);
    expect(status.json["replyDomain"]).toBe("reply.example.test");
    expect(String(status.json["inboundNote"])).toMatch(/MX record/i);

    blockedReason = "RESEND_API_KEY is not set on this server, so no mail can be sent.";
    const blocked = await owner.call("GET", "/api/crm/support/delivery/status");
    expect(blocked.json["canSend"]).toBe(false);
    expect(String(blocked.json["blockedReason"])).toContain("RESEND_API_KEY");
  }, 60_000);

  it("counts undelivered replies on the overview, so nobody has to go looking", async () => {
    respond = ANSWERS.refused;
    const ticketId = await newTicket("Overview count");
    await reply(ticketId, "This will not arrive.");

    const overview = await owner.call("GET", "/api/crm/support/overview");
    expect(overview.status).toBe(200);
    expect(overview.json["deliveriesNeedingAttention"]).toBeGreaterThanOrEqual(1);
    expect(String(overview.json["definitions"].deliveriesNeedingAttention))
      .toMatch(/still waiting/i);
  }, 60_000);
});
