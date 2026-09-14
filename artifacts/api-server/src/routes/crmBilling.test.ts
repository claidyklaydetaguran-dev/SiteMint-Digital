/**
 * M5 quotes and invoices, against a real database and the real app.
 *
 * Five properties matter more than the rest of this file, and each one is a
 * thing that has gone wrong in a CRM before:
 *
 *  1. Every figure is computed by the SERVER. A request carrying its own
 *     `total`, `subtotal` and `lineTotal` is not merely overridden — those keys
 *     are never read — and the test proves it by sending absurd ones and
 *     checking what landed.
 *  2. The state machines refuse illegal jumps. A draft quote cannot be
 *     accepted, a draft invoice cannot be paid, and an invoice with money
 *     against it cannot be voided.
 *  3. An invoice payment is visible in the SAME money figures as every other
 *     payment. This is the contract `crmMoneyContract.test.ts` protects, and
 *     the assertions below are deliberately the same four surfaces.
 *  4. The portal stays contact-scoped. Contact A gets 404 on B's quote, and
 *     neither of them can see a draft.
 *  5. An accepted quote is never labelled signed, in any field, on any path.
 *
 * The DB-backed suite is gated on CRM_TEST_DATABASE_URL. The arithmetic block
 * at the top is pure and always runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  computeTotals, formatMoneyMinor, lineTotalMinor, parseMoneyMinor,
  parseQuantityHundredths, percentOfMinor, storedMoneyMinor,
} from "../lib/crmMoney.js";

const TEST_DB = process.env.CRM_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL ?? "postgresql://127.0.0.1:1/never_connected";
process.env.CORS_ALLOWED_ORIGINS ??= "https://example.test";
process.env.ADMIN_PASSWORD = "billing-admin-secret-value";
// Nothing may reach a real mailbox from a test run.
process.env.CRM_EMAIL_TEST_MODE = "true";
process.env.CRM_PUBLIC_BASE_URL = "https://portal.example.test";

const STAMP = Date.now();
const OWNER = {
  email: `billing-owner-${STAMP}@example.test`,
  name: "[CRM-TEST] Billing Owner",
  password: "sandpiper-quarry-7712",
};
const CUSTOMER_PASSWORD = "millstone-antler-9034";

/** Staff-only text that must never appear in any portal response. */
const INTERNAL_QUOTE_NOTE = "INTERNAL-ONLY-their-budget-is-soft-hold-the-discount-back";

// ══════════════════════════════════════════════════════════════════════════
// Arithmetic — pure, no database, always runs
// ══════════════════════════════════════════════════════════════════════════

describe("money is integer arithmetic, not floating point", () => {
  it("does not drift the way a float sum does", () => {
    // The drift this exists to prevent, stated first so the assertion below is
    // obviously about something real rather than about nothing.
    expect(0.1 + 0.2).not.toBe(0.3);

    const totals = computeTotals(
      [
        { description: "a", quantityHundredths: 100, unitPriceMinor: 10 },
        { description: "b", quantityHundredths: 100, unitPriceMinor: 20 },
      ],
      { type: "none" },
    );
    expect(totals.subtotalMinor).toBe(30);
    expect(formatMoneyMinor(totals.subtotalMinor)).toBe("0.30");
  });

  it("refuses a figure that was itself computed in floating point", () => {
    // 0.1 + 0.2 stringifies to "0.30000000000000004". A caller that arrives
    // with that has already lost precision; rounding it silently would hide
    // where the error came from.
    expect(parseMoneyMinor(0.1 + 0.2)).toBeNull();
    expect(parseMoneyMinor("1,200.00")).toBeNull();
    expect(parseMoneyMinor("")).toBeNull();
    expect(parseMoneyMinor("12abc")).toBeNull();
    expect(parseMoneyMinor("-5.00")).toBeNull();
    expect(parseMoneyMinor("1.005")).toBeNull();
    expect(parseMoneyMinor("1e3")).toBeNull();
    expect(parseMoneyMinor(Infinity)).toBeNull();
  });

  it("reads the forms a person actually types", () => {
    expect(parseMoneyMinor("1234.56")).toBe(123456);
    expect(parseMoneyMinor("1234.5")).toBe(123450);
    expect(parseMoneyMinor("1234")).toBe(123400);
    expect(parseMoneyMinor(1234.56)).toBe(123456);
    expect(parseMoneyMinor("0")).toBe(0);
    expect(formatMoneyMinor(123456)).toBe("1234.56");
    expect(formatMoneyMinor(5)).toBe("0.05");
    expect(formatMoneyMinor(0)).toBe("0.00");
    expect(storedMoneyMinor("9000.00")).toBe(900000);
    expect(parseQuantityHundredths("0")).toBeNull();
    expect(parseQuantityHundredths("2.5")).toBe(250);
  });

  it("rounds half away from zero, once, in one place", () => {
    // 2.5 × 133.33 = 333.325 exactly. Half-up makes that 333.33.
    expect(lineTotalMinor(250, 13333)).toBe(33333);
    // 12.5% of 0.05 is 0.00625 — the half-up case at the smallest scale.
    expect(percentOfMinor(5, 1250)).toBe(1);
    // 33.33% of 100.00.
    expect(percentOfMinor(10000, 3333)).toBe(3333);
  });

  it("clamps a discount larger than the subtotal rather than going negative", () => {
    const totals = computeTotals(
      [{ description: "a", quantityHundredths: 100, unitPriceMinor: 10000 }],
      { type: "amount", valueMinor: 50000 },
    );
    expect(totals.subtotalMinor).toBe(10000);
    expect(totals.discountAmountMinor).toBe(10000);
    expect(totals.totalMinor).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The real routes, against the real database
// ══════════════════════════════════════════════════════════════════════════

const suite = TEST_DB ? describe : describe.skip;

suite("quotes and invoices (real DB)", () => {
  let server: http.Server;
  let base: string;
  let db: typeof import("@workspace/db").db;
  let schema: typeof import("@workspace/db");

  let ownerStaffId = 0;

  interface Customer { leadId: number; email: string; dealId: number }
  let A: Customer;
  let B: Customer;

  const quoteIds: number[] = [];
  const invoiceIds: number[] = [];

  interface Reply { status: number; json: Record<string, any>; text: string; headers: Headers }

  async function call(
    method: string, path: string,
    opts: { cookie?: string; csrfHeader?: string; csrf?: string; body?: unknown } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers["Cookie"] = opts.cookie;
    if (opts.csrf && opts.csrfHeader) headers[opts.csrfHeader] = opts.csrf;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method, headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let json: Record<string, any> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (a file) */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  class StaffAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-csrf-token", csrf: this.csrf, body });
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

  class PortalAgent {
    cookie = ""; csrf = "";
    call(method: string, path: string, body?: unknown) {
      return call(method, path, { cookie: this.cookie, csrfHeader: "x-portal-csrf", csrf: this.csrf, body });
    }
  }

  const staff = new StaffAgent();
  const portalA = new PortalAgent();
  const portalB = new PortalAgent();

  async function inviteAndAccept(leadId: number): Promise<PortalAgent> {
    const invited = await staff.call("POST", "/api/crm/portal/invitations", { leadId });
    expect(invited.status, JSON.stringify(invited.json)).toBe(201);
    const res = await fetch(`${base}/api/portal/invitations/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: invited.json["inviteToken"], password: CUSTOMER_PASSWORD }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { csrfToken: string };
    const agent = new PortalAgent();
    agent.cookie = res.headers.getSetCookie()
      .map((c) => c.split(";")[0])
      .filter((c) => c.startsWith("crm_portal_session="))
      .join("; ");
    agent.csrf = data.csrfToken;
    return agent;
  }

  /** Creates a quote through the real route and remembers it for cleanup. */
  async function createQuote(body: Record<string, unknown>): Promise<Reply> {
    const res = await staff.call("POST", "/api/crm/quotes", body);
    if (res.status === 201) quoteIds.push(res.json["quote"].id as number);
    return res;
  }

  async function createInvoice(body: Record<string, unknown>): Promise<Reply> {
    const res = await staff.call("POST", "/api/crm/invoices", body);
    if (res.status === 201) invoiceIds.push(res.json["invoice"].id as number);
    return res;
  }

  async function buildCustomer(tag: string): Promise<Customer> {
    const [lead] = await db.insert(schema.crmLeads).values({
      name: `[CRM-TEST] Billing ${tag}`,
      email: `billing-${tag}-${STAMP}@example.test`,
      status: "Client",
    }).returning();
    const [deal] = await db.insert(schema.crmDeals).values({
      leadId: lead.id, name: `[CRM-TEST] ${tag} rebuild`, value: "9000.00", stage: "Proposal",
    }).returning();
    return { leadId: lead.id, email: lead.email, dealId: deal.id };
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

    // The attempt ledger is shared with staff auth and is not truncated by a
    // focused run, so consecutive runs would otherwise accumulate into the
    // portal's IP bucket and start answering 429.
    await db.delete(schema.crmStaffLoginAttempts)
      .where(sql`${schema.crmStaffLoginAttempts.subject} LIKE 'portal-%'`);

    const { hashPassword } = await import("../lib/staffCredentials.js");
    const [row] = await db.insert(schema.crmStaff).values({
      email: OWNER.email, displayName: OWNER.name, role: "owner", status: "active",
      passwordHash: await hashPassword(OWNER.password), passwordUpdatedAt: new Date(),
    }).returning();
    ownerStaffId = row.id;
    expect(await staff.login(OWNER)).toBe(200);

    A = await buildCustomer("AAA");
    B = await buildCustomer("BBB");

    const a = await inviteAndAccept(A.leadId);
    portalA.cookie = a.cookie; portalA.csrf = a.csrf;
    const b = await inviteAndAccept(B.leadId);
    portalB.cookie = b.cookie; portalB.csrf = b.csrf;
  }, 180_000);

  afterAll(async () => {
    const leadIds = [A?.leadId, B?.leadId].filter((n): n is number => typeof n === "number");
    if (quoteIds.length) {
      await db.delete(schema.crmQuoteLineItems).where(inArray(schema.crmQuoteLineItems.quoteId, quoteIds));
      await db.delete(schema.crmQuotes).where(inArray(schema.crmQuotes.id, quoteIds));
    }
    if (invoiceIds.length) {
      await db.delete(schema.crmInvoiceLineItems).where(inArray(schema.crmInvoiceLineItems.invoiceId, invoiceIds));
      await db.delete(schema.crmInvoices).where(inArray(schema.crmInvoices.id, invoiceIds));
    }
    if (leadIds.length) {
      // `entityType` matters as much as the id: attachment ids are scoped by
      // the PAIR, so filtering on the id alone would delete another suite's
      // project or deal attachment that happened to share a number.
      const attachments = await db.select({ id: schema.crmAttachments.id })
        .from(schema.crmAttachments)
        .where(and(
          eq(schema.crmAttachments.entityType, "lead"),
          inArray(schema.crmAttachments.entityId, leadIds),
        ));
      const attachmentIds = attachments.map((a) => a.id);
      const accounts = await db.select({ id: schema.crmPortalAccounts.id })
        .from(schema.crmPortalAccounts).where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      if (accounts.length) {
        await db.delete(schema.crmPortalSessions)
          .where(inArray(schema.crmPortalSessions.portalAccountId, accounts.map((a) => a.id)));
      }
      await db.delete(schema.crmPortalDocumentGrants)
        .where(inArray(schema.crmPortalDocumentGrants.leadId, leadIds));
      await db.delete(schema.crmPortalInvitations)
        .where(inArray(schema.crmPortalInvitations.leadId, leadIds));
      await db.delete(schema.crmPortalAccounts)
        .where(inArray(schema.crmPortalAccounts.leadId, leadIds));
      if (attachmentIds.length) {
        await db.delete(schema.crmAttachmentBlobs)
          .where(inArray(schema.crmAttachmentBlobs.attachmentId, attachmentIds));
        await db.delete(schema.crmAttachments)
          .where(inArray(schema.crmAttachments.id, attachmentIds));
      }
      await db.delete(schema.crmTransactions).where(inArray(schema.crmTransactions.leadId, leadIds));
      await db.delete(schema.crmDeals).where(inArray(schema.crmDeals.leadId, leadIds));
      await db.delete(schema.crmActivities).where(inArray(schema.crmActivities.leadId, leadIds));
      await db.delete(schema.crmLeads).where(inArray(schema.crmLeads.id, leadIds));
    }
    if (ownerStaffId) {
      await db.delete(schema.crmStaff).where(eq(schema.crmStaff.id, ownerStaffId));
    }
    await new Promise<void>((r) => server.close(() => r()));
  }, 180_000);

  // ── 1. Totals are the server's, and only the server's ─────────────────────

  it("computes every figure itself and ignores a tampered client total", async () => {
    const created = await createQuote({
      leadId: A.leadId,
      dealId: A.dealId,
      title: "[CRM-TEST] Site rebuild",
      // Every one of these is a lie, and none of them is read.
      subtotal: "1.00",
      total: "1.00",
      discountAmount: "9999.00",
      amountPaid: "5000.00",
      discountType: "percent",
      discountValue: "10.00",
      internalNotes: INTERNAL_QUOTE_NOTE,
      lineItems: [
        { description: "Design", quantity: "1", unitPrice: "2500.00", lineTotal: "1.00" },
        // 2.5 × 133.33 = 333.325, which must round half-up to 333.33.
        { description: "Copywriting", quantity: "2.5", unitPrice: "133.33", lineTotal: "0.01" },
        { description: "Build", quantity: "3", unitPrice: "1200.00", lineTotal: "0.00" },
      ],
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);

    const quote = created.json["quote"];
    // 2500.00 + 333.33 + 3600.00 = 6433.33; 10% of that is 643.33 (half-up
    // from 643.333); 6433.33 - 643.33 = 5790.00.
    expect(quote.subtotal).toBe(6433.33);
    expect(quote.discountAmount).toBe(643.33);
    expect(quote.total).toBe(5790);
    expect(quote.lineItems.map((l: any) => l.lineTotal)).toEqual([2500, 333.33, 3600]);
    expect(quote.reference).toMatch(/^QUO-\d{5}$/);

    // And the same is true of what is actually stored, not merely of what the
    // route echoed back.
    const [stored] = await db.select().from(schema.crmQuotes)
      .where(eq(schema.crmQuotes.id, quote.id));
    expect(stored.subtotal).toBe("6433.33");
    expect(stored.total).toBe("5790.00");
    expect(stored.discountAmount).toBe("643.33");

    // Editing a draft recomputes rather than trusting.
    const edited = await staff.call("PATCH", `/api/crm/quotes/${quote.id}`, {
      total: "0.01",
      lineItems: [{ description: "Design only", quantity: "1", unitPrice: "2500.00" }],
    });
    expect(edited.status).toBe(200);
    expect(edited.json["quote"].subtotal).toBe(2500);
    expect(edited.json["quote"].discountAmount).toBe(250);
    expect(edited.json["quote"].total).toBe(2250);
  }, 120_000);

  it("refuses a line item whose numbers are not numbers", async () => {
    for (const bad of [
      { description: "x", quantity: "0", unitPrice: "10.00" },
      { description: "x", quantity: "-1", unitPrice: "10.00" },
      { description: "x", quantity: "1", unitPrice: "10.005" },
      { description: "x", quantity: "1", unitPrice: "1,000.00" },
      { description: "", quantity: "1", unitPrice: "10.00" },
    ]) {
      const res = await staff.call("POST", "/api/crm/quotes", {
        leadId: A.leadId, title: "[CRM-TEST] bad line", lineItems: [bad],
      });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const badPercent = await staff.call("POST", "/api/crm/quotes", {
      leadId: A.leadId, title: "[CRM-TEST] bad discount",
      discountType: "percent", discountValue: "150.00",
      lineItems: [{ description: "x", quantity: "1", unitPrice: "10.00" }],
    });
    expect(badPercent.status).toBe(400);
  }, 120_000);

  // ── 2. The state machines refuse illegal jumps ────────────────────────────

  it("refuses every quote transition the declared machine does not allow", async () => {
    const created = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Transitions",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "1000.00" }],
    });
    const id = created.json["quote"].id as number;
    expect(created.json["quote"].status).toBe("draft");
    expect(created.json["quote"].allowedNextStatuses).toEqual(["sent"]);

    // draft → accepted / declined / expired are all refused.
    for (const next of ["accepted", "declined", "expired"]) {
      const jump = await staff.call("POST", `/api/crm/quotes/${id}/status`, { status: next });
      expect(jump.status, `draft → ${next} was allowed`).toBe(409);
      expect(String(jump.json["error"])).toContain("draft");
    }
    // And nothing moved.
    expect((await staff.call("GET", `/api/crm/quotes/${id}`)).json["quote"].status).toBe("draft");

    const sent = await staff.call("POST", `/api/crm/quotes/${id}/send`, {});
    expect(sent.status, JSON.stringify(sent.json)).toBe(200);
    expect(sent.json["quote"].status).toBe("sent");

    // sent → sent is not a transition either.
    expect((await staff.call("POST", `/api/crm/quotes/${id}/send`, {})).status).toBe(409);

    const accepted = await staff.call("POST", `/api/crm/quotes/${id}/status`, { status: "accepted" });
    expect(accepted.status).toBe(200);
    expect(accepted.json["quote"].acceptedDealId).toBe(A.dealId);

    // accepted is terminal in every direction.
    for (const next of ["sent", "declined", "expired", "accepted"]) {
      const after = await staff.call("POST", `/api/crm/quotes/${id}/status`, { status: next });
      expect(after.status, `accepted → ${next} was allowed`).toBe(409);
    }
  }, 180_000);

  it("will not send a quote with no line items", async () => {
    const empty = await createQuote({ leadId: A.leadId, title: "[CRM-TEST] Nothing in it" });
    expect(empty.status).toBe(201);
    const res = await staff.call("POST", `/api/crm/quotes/${empty.json["quote"].id}/send`, {});
    expect(res.status).toBe(409);
    expect(String(res.json["error"])).toMatch(/no line items/i);
  }, 120_000);

  it("refuses to accept a quote that is not bound to a deal", async () => {
    const created = await createQuote({
      leadId: A.leadId, title: "[CRM-TEST] No deal",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "100.00" }],
    });
    const id = created.json["quote"].id as number;
    // The quote was created with no dealId, and the lead's deal is not assumed.
    expect(created.json["quote"].dealId).toBeNull();
    expect((await staff.call("POST", `/api/crm/quotes/${id}/send`, {})).status).toBe(200);

    const bare = await staff.call("POST", `/api/crm/quotes/${id}/status`, { status: "accepted" });
    expect(bare.status).toBe(409);
    expect(String(bare.json["error"])).toMatch(/linked to the deal/i);

    // Naming the deal is what makes it legal, and the link is recorded.
    const withDeal = await staff.call("POST", `/api/crm/quotes/${id}/status`, {
      status: "accepted", dealId: A.dealId,
    });
    expect(withDeal.status).toBe(200);
    const [stored] = await db.select().from(schema.crmQuotes).where(eq(schema.crmQuotes.id, id));
    expect(stored.acceptedDealId).toBe(A.dealId);
    expect(stored.dealId).toBe(A.dealId);

    // Somebody else's deal is refused outright.
    const other = await createQuote({
      leadId: A.leadId, title: "[CRM-TEST] Wrong deal",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "100.00" }],
    });
    await staff.call("POST", `/api/crm/quotes/${other.json["quote"].id}/send`, {});
    const crossed = await staff.call("POST", `/api/crm/quotes/${other.json["quote"].id}/status`, {
      status: "accepted", dealId: B.dealId,
    });
    expect(crossed.status).toBe(409);
    expect(String(crossed.json["error"])).toMatch(/different contact/i);
  }, 180_000);

  it("refuses every invoice transition the declared machine does not allow", async () => {
    const created = await createInvoice({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Invoice transitions",
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "1000.00" }],
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const id = created.json["invoice"].id as number;
    expect(created.json["invoice"].status).toBe("draft");
    expect(created.json["invoice"].allowedNextStatuses).toEqual(["issued", "void"]);

    // A draft cannot take a payment: nobody has been asked to pay it.
    const early = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "100.00", method: "manual_transfer",
    });
    expect(early.status).toBe(409);
    expect(String(early.json["error"])).toMatch(/not been issued/i);

    expect((await staff.call("POST", `/api/crm/invoices/${id}/issue`, {})).status).toBe(200);
    // issued → issued is not a transition.
    expect((await staff.call("POST", `/api/crm/invoices/${id}/issue`, {})).status).toBe(409);
    // An issued invoice is frozen: its figures are what the customer was asked
    // to pay.
    const edit = await staff.call("PATCH", `/api/crm/invoices/${id}`, { title: "[CRM-TEST] renamed" });
    expect(edit.status).toBe(409);
    expect(String(edit.json["error"])).toMatch(/only a draft/i);

    // Part-pay it, then prove it can no longer be voided.
    const part = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "400.00", method: "manual_transfer",
    });
    expect(part.status, JSON.stringify(part.json)).toBe(201);
    expect(part.json["invoice"].status).toBe("part_paid");
    expect(part.json["invoice"].amountOutstanding).toBe(600);

    const voided = await staff.call("POST", `/api/crm/invoices/${id}/void`, { reason: "changed our mind" });
    expect(voided.status).toBe(409);
    expect(String(voided.json["error"])).toMatch(/recorded against it/i);

    // More than the balance is refused rather than overstating money received.
    const tooMuch = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "601.00", method: "manual_transfer",
    });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.json["outstanding"]).toBe(600);

    const rest = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "600.00", method: "manual_transfer",
    });
    expect(rest.status).toBe(201);
    expect(rest.json["invoice"].status).toBe("paid");
    expect(rest.json["invoice"].amountOutstanding).toBe(0);

    // Paid is terminal.
    const after = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "1.00", method: "manual_transfer",
    });
    expect(after.status).toBe(409);
    expect((await staff.call("POST", `/api/crm/invoices/${id}/void`, {})).status).toBe(409);
  }, 180_000);

  it("will not issue an invoice with no due date, and voids an unpaid one", async () => {
    const noDue = await createInvoice({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] No due date",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "50.00" }],
    });
    const res = await staff.call("POST", `/api/crm/invoices/${noDue.json["invoice"].id}/issue`, {});
    expect(res.status).toBe(400);
    expect(String(res.json["error"])).toMatch(/due date/i);

    const voided = await staff.call("POST", `/api/crm/invoices/${noDue.json["invoice"].id}/void`,
      { reason: "raised in error" });
    expect(voided.status).toBe(200);
    expect(voided.json["invoice"].status).toBe("void");
  }, 120_000);

  // ── 3. An invoice payment reconciles with the existing money model ────────

  it("shows an invoice payment on every surface that reports money", async () => {
    const quote = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Money quote",
      lineItems: [{ description: "Retainer", quantity: "1", unitPrice: "1500.00" }],
    });
    const quoteId = quote.json["quote"].id as number;
    await staff.call("POST", `/api/crm/quotes/${quoteId}/send`, {});
    await staff.call("POST", `/api/crm/quotes/${quoteId}/status`, { status: "accepted" });

    // Raised FROM the accepted quote: the line items carry across rather than
    // being retyped, which is how the two come to disagree.
    const invoice = await createInvoice({
      quoteId,
      dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expect(invoice.status, JSON.stringify(invoice.json)).toBe(201);
    expect(invoice.json["fromQuoteId"]).toBe(quoteId);
    expect(invoice.json["invoice"].total).toBe(1500);
    expect(invoice.json["invoice"].lineItems).toHaveLength(1);
    expect(invoice.json["invoice"].lineItems[0].description).toBe("Retainer");
    expect(invoice.json["invoice"].dealId).toBe(A.dealId);
    const invoiceId = invoice.json["invoice"].id as number;

    expect((await staff.call("POST", `/api/crm/invoices/${invoiceId}/issue`, {})).status).toBe(200);

    // Everything measured BEFORE the payment, so the assertions are deltas and
    // cannot be satisfied by a number that was already right.
    const ccBefore = await staff.call("GET", "/api/crm/command-center");
    const forecastBefore = await staff.call("GET", "/api/crm/sales/forecast");
    const chainBefore = await staff.call("GET", `/api/crm/sales/chain/${A.leadId}`);
    const portalBefore = await portalA.call("GET", "/api/portal/invoices");

    const paid = await staff.call("POST", `/api/crm/invoices/${invoiceId}/payments`, {
      amount: "1500.00", method: "manual_transfer",
    });
    expect(paid.status, JSON.stringify(paid.json)).toBe(201);
    expect(paid.json["invoice"].status).toBe("paid");

    // It is an ordinary transaction row, with the status every other payment
    // path writes — imported rather than spelled out.
    const [transaction] = await db.select().from(schema.crmTransactions)
      .where(eq(schema.crmTransactions.id, paid.json["transactionId"] as number));
    expect(transaction.status).toBe(schema.TRANSACTION_RECEIVED_STATUS);
    expect(schema.TRANSACTION_STATUSES).toContain(transaction.status);
    expect(transaction.amount).toBe("1500.00");
    expect(transaction.invoiceId).toBe(invoiceId);
    expect(transaction.dealId).toBe(A.dealId);

    // 1. The Command Center's money panel.
    const cc = await staff.call("GET", "/api/crm/command-center");
    expect(cc.json["sales"].moneyReceivedAllTime)
      .toBe(ccBefore.json["sales"].moneyReceivedAllTime + 1500);

    // 2. The sales forecast, which must agree with it exactly.
    const forecast = await staff.call("GET", "/api/crm/sales/forecast");
    expect(forecast.json["moneyReceivedAllTime"])
      .toBe(forecastBefore.json["moneyReceivedAllTime"] + 1500);
    expect(forecast.json["moneyReceivedAllTime"]).toBe(cc.json["sales"].moneyReceivedAllTime);

    // 3. The per-contact chain.
    const chain = await staff.call("GET", `/api/crm/sales/chain/${A.leadId}`);
    expect(chain.json["totals"].received).toBe(chainBefore.json["totals"].received + 1500);

    // 4. The customer's own view of what they have paid.
    const portal = await portalA.call("GET", "/api/portal/invoices");
    expect(portal.json["totals"].paidToDate)
      .toBe(portalBefore.json["totals"].paidToDate + 1500);
    expect(portal.json["payments"].some((p: any) => p.id === transaction.id)).toBe(true);

    // And the invoice's own cached figure agrees with the transactions it was
    // computed from, rather than being an independently incremented number.
    const [storedInvoice] = await db.select().from(schema.crmInvoices)
      .where(eq(schema.crmInvoices.id, invoiceId));
    const settled = await db.select().from(schema.crmTransactions)
      .where(eq(schema.crmTransactions.invoiceId, invoiceId));
    const summed = settled
      .filter((t) => t.status === schema.TRANSACTION_RECEIVED_STATUS)
      .reduce((sum, t) => sum + storedMoneyMinor(t.amount), 0);
    expect(storedMoneyMinor(storedInvoice.amountPaid)).toBe(summed);
  }, 240_000);

  it("refuses to bill for a quote the customer has not accepted", async () => {
    const draft = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Unaccepted",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "100.00" }],
    });
    const res = await staff.call("POST", "/api/crm/invoices", {
      quoteId: draft.json["quote"].id,
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(res.status).toBe(409);
    expect(String(res.json["error"])).toMatch(/not agreed to|ACCEPTED/i);
  }, 120_000);

  it("says plainly that a standalone invoice needs a deal before it can take money", async () => {
    const standalone = await createInvoice({
      leadId: A.leadId, title: "[CRM-TEST] Standalone",
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      lineItems: [{ description: "Ad-hoc support", quantity: "2", unitPrice: "125.00" }],
    });
    expect(standalone.status).toBe(201);
    expect(standalone.json["invoice"].total).toBe(250);
    expect(standalone.json["invoice"].dealId).toBeNull();
    expect(standalone.json["invoice"].paymentNeedsDeal).toBe(true);
    const id = standalone.json["invoice"].id as number;
    expect((await staff.call("POST", `/api/crm/invoices/${id}/issue`, {})).status).toBe(200);

    const blocked = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "250.00", method: "manual_cash",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json["needsDeal"]).toBe(true);

    // Naming a deal at payment time attaches it and settles the invoice, so a
    // standalone invoice is not a dead end.
    const settled = await staff.call("POST", `/api/crm/invoices/${id}/payments`, {
      amount: "250.00", method: "manual_cash", dealId: A.dealId,
    });
    expect(settled.status, JSON.stringify(settled.json)).toBe(201);
    expect(settled.json["invoice"].status).toBe("paid");
    expect(settled.json["invoice"].dealId).toBe(A.dealId);

    // Another contact's deal is refused.
    const second = await createInvoice({
      leadId: A.leadId, title: "[CRM-TEST] Standalone two",
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      lineItems: [{ description: "Support", quantity: "1", unitPrice: "10.00" }],
    });
    await staff.call("POST", `/api/crm/invoices/${second.json["invoice"].id}/issue`, {});
    const crossed = await staff.call("POST", `/api/crm/invoices/${second.json["invoice"].id}/payments`, {
      amount: "10.00", method: "manual_cash", dealId: B.dealId,
    });
    expect(crossed.status).toBe(409);
    expect(String(crossed.json["error"])).toMatch(/different contact/i);
  }, 180_000);

  // ── 4. Documents, and the portal ──────────────────────────────────────────

  it("renders a sent quote and an issued invoice into the documents the customer can see", async () => {
    const quote = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Rendered quote",
      notes: "Prices hold for 30 days.",
      internalNotes: INTERNAL_QUOTE_NOTE,
      lineItems: [{ description: "Discovery workshop", quantity: "1", unitPrice: "800.00" }],
    });
    const quoteId = quote.json["quote"].id as number;
    const sent = await staff.call("POST", `/api/crm/quotes/${quoteId}/send`, {});
    expect(sent.status).toBe(200);
    const attachmentId = sent.json["documentAttachmentId"] as number;
    expect(typeof attachmentId).toBe("number");

    // 1. It is in the staff Documents surface, against the contact.
    const staffDocs = await staff.call("GET",
      `/api/crm/documents?entityType=lead&entityId=${A.leadId}`);
    expect(staffDocs.status).toBe(200);
    const listed = (staffDocs.json["documents"] as any[]).find((d) => d.id === attachmentId);
    expect(listed, "the rendered quote is missing from the staff Documents list").toBeTruthy();
    expect(listed.filename).toBe(`Quote-${schema.quoteReference(quoteId)}.txt`);
    // The existing store's own honesty marker, unchanged.
    expect(listed.signatureStatus).toBe("not_a_signature");

    // 2. The customer can see it, because a grant was written in the same act.
    const portalDocs = await portalA.call("GET", "/api/portal/documents");
    expect((portalDocs.json["documents"] as any[]).map((d) => d.id)).toContain(attachmentId);

    // 3. And can download it. The bytes are the quote, and the staff-only note
    //    is not in them.
    const download = await portalA.call("GET", `/api/portal/documents/${attachmentId}/download`);
    expect(download.status).toBe(200);
    expect(download.text).toContain("Discovery workshop");
    expect(download.text).toContain("800.00");
    expect(download.text).toContain("Prices hold for 30 days.");
    expect(download.text).not.toContain(INTERNAL_QUOTE_NOTE);
    expect(download.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");

    // 4. Nobody else can.
    expect((await portalB.call("GET", `/api/portal/documents/${attachmentId}/download`)).status).toBe(404);

    // The same for an invoice.
    const invoice = await createInvoice({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Rendered invoice",
      dueDate: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      internalNotes: INTERNAL_QUOTE_NOTE,
      lineItems: [{ description: "Sprint one", quantity: "1", unitPrice: "2000.00" }],
    });
    const issued = await staff.call("POST", `/api/crm/invoices/${invoice.json["invoice"].id}/issue`, {});
    expect(issued.status).toBe(200);
    const invoiceDoc = issued.json["documentAttachmentId"] as number;
    const invoiceDownload = await portalA.call("GET", `/api/portal/documents/${invoiceDoc}/download`);
    expect(invoiceDownload.status).toBe(200);
    expect(invoiceDownload.text).toContain("Sprint one");
    expect(invoiceDownload.text).not.toContain(INTERNAL_QUOTE_NOTE);
  }, 240_000);

  it("keeps one contact's quotes and invoices away from another, and hides drafts from both", async () => {
    // A live quote for A, and a draft for A that nobody should ever see.
    const live = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] A live quote",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "700.00" }],
    });
    const liveId = live.json["quote"].id as number;
    await staff.call("POST", `/api/crm/quotes/${liveId}/send`, {});

    const draft = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] A DRAFT nobody may see",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "70000.00" }],
    });
    const draftId = draft.json["quote"].id as number;

    const draftInvoice = await createInvoice({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] A DRAFT INVOICE nobody may see",
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "70000.00" }],
    });

    // Contact B sees neither the live quote nor the draft.
    const theirProposals = await portalB.call("GET", "/api/portal/proposals");
    expect(theirProposals.status).toBe(200);
    expect((theirProposals.json["quotes"] as any[]).map((q) => q.id)).not.toContain(liveId);
    expect(theirProposals.text).not.toContain("A live quote");

    const theirInvoices = await portalB.call("GET", "/api/portal/invoices");
    expect(theirInvoices.text).not.toContain("DRAFT INVOICE");

    // Cross-contact acceptance is 404 — never 403, which would confirm the
    // quote exists and that the number was worth guessing.
    const trespass = await portalB.call("POST", `/api/portal/quotes/${liveId}/accept`,
      { typedName: "B Person" });
    expect(trespass.status).toBe(404);
    expect(trespass.status).not.toBe(403);

    // A's own draft answers identically: a draft is invisible even to the
    // contact it was written for, because the figures are not agreed yet.
    const ownDraft = await portalA.call("POST", `/api/portal/quotes/${draftId}/accept`,
      { typedName: "A Person" });
    expect(ownDraft.status).toBe(404);

    const mine = await portalA.call("GET", "/api/portal/proposals");
    const ids = (mine.json["quotes"] as any[]).map((q) => q.id);
    expect(ids).toContain(liveId);
    expect(ids).not.toContain(draftId);
    expect(mine.text).not.toContain("DRAFT nobody may see");
    // The staff-only note never travels, on any surface.
    expect(mine.text).not.toContain(INTERNAL_QUOTE_NOTE);

    const myInvoices = await portalA.call("GET", "/api/portal/invoices");
    expect((myInvoices.json["invoices"] as any[]).map((i) => i.id))
      .not.toContain(draftInvoice.json["invoice"].id);
    expect(myInvoices.text).not.toContain(INTERNAL_QUOTE_NOTE);

    // Nothing landed on the draft.
    const [stillDraft] = await db.select().from(schema.crmQuotes)
      .where(eq(schema.crmQuotes.id, draftId));
    expect(stillDraft.status).toBe("draft");
    expect(stillDraft.acceptedAt).toBeNull();
  }, 240_000);

  it("never leaks an internal note or a draft through the overview", async () => {
    for (const path of ["/api/portal/overview", "/api/portal/proposals", "/api/portal/invoices", "/api/portal/documents"]) {
      const res = await portalA.call("GET", path);
      expect(res.status, path).toBe(200);
      expect(res.text, `${path} leaked the internal note`).not.toContain(INTERNAL_QUOTE_NOTE);
      expect(res.text, `${path} leaked a draft`).not.toContain("DRAFT nobody may see");
    }
  }, 120_000);

  // ── 5. An acceptance is never a signature ─────────────────────────────────

  it("records a customer accepting a quote, and never calls it signed", async () => {
    const created = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Acceptance",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "4200.00" }],
    });
    const id = created.json["quote"].id as number;
    expect((await staff.call("POST", `/api/crm/quotes/${id}/send`, {})).status).toBe(200);

    const before = await portalA.call("GET", "/api/portal/proposals");
    const mine = (before.json["quotes"] as any[]).find((q) => q.id === id);
    expect(mine.canAccept).toBe(true);
    expect(mine.acceptance).toBeNull();
    expect(mine.total).toBe(4200);

    const accepted = await portalA.call("POST", `/api/portal/quotes/${id}/accept`,
      { typedName: "A. Customer" });
    expect(accepted.status, JSON.stringify(accepted.json)).toBe(201);
    expect(accepted.json["acceptance"].signatureStatus).toBe("not_a_signature");
    expect(accepted.json["acceptance"].label).toBe("Accepted by customer");
    expect(accepted.json["acceptance"].dealId).toBe(A.dealId);

    const after = await portalA.call("GET", "/api/portal/proposals");

    // The word family, read in context, must always be one of the approved
    // forms. This is the same gate crmPortal.test.ts applies to proposals, and
    // it now covers the quote payloads too.
    for (const body of [accepted.text, after.text]) {
      expect(body).toMatch(/not_a_signature/);
      expect(body).not.toMatch(/"signed/i);
      expect(body).not.toMatch(/\bsignedAt\b/);
      expect(body).not.toMatch(/\besignature\b/i);
      expect(body).not.toMatch(/signedBy|isSigned/i);
      for (const hit of body.match(/.{0,40}sign(ed|ature)[a-z]*.{0,40}/gi) ?? []) {
        expect(hit, `a portal payload described something as signed: ${hit}`)
          .toMatch(/not_a_signature|acceptanceIsNotASignature|signatureStatus|not an electronic signature/i);
      }
    }

    // The rendered document says the same thing, in the customer's own words.
    const [quoteRow] = await db.select().from(schema.crmQuotes).where(eq(schema.crmQuotes.id, id));
    const doc = await portalA.call("GET",
      `/api/portal/documents/${quoteRow.documentAttachmentId}/download`);
    expect(doc.text).toMatch(/not an electronic signature/i);
    expect(doc.text).not.toMatch(/\bsigned by\b/i);

    // Accepting does not close the deal. That stays a staff act with its own
    // route, permission and audit entry.
    const [deal] = await db.select().from(schema.crmDeals).where(eq(schema.crmDeals.id, A.dealId));
    expect(deal.stage).toBe("Proposal");
    expect(deal.wonAt).toBeNull();

    // A double-click is not two agreements.
    const again = await portalA.call("POST", `/api/portal/quotes/${id}/accept`,
      { typedName: "Somebody Else Entirely" });
    expect(again.status).toBe(200);
    expect(again.json["created"]).toBe(false);
    // The second click reports the FIRST acceptance. A repeat must not be able
    // to overwrite who agreed.
    expect(again.json["acceptance"].typedName).toBe("A. Customer");

    // And the acceptance is bound to a deal in the database, not only in the
    // payload — the check constraint makes an unbound one unstorable.
    const [stored] = await db.select().from(schema.crmQuotes).where(eq(schema.crmQuotes.id, id));
    expect(stored.status).toBe("accepted");
    expect(stored.acceptedTypedName).toBe("A. Customer");
    expect(stored.acceptedDealId).toBe(A.dealId);
    expect(stored.acceptedByPortalAccountId).not.toBeNull();
  }, 240_000);

  it("refuses an acceptance with no typed name, and one on an expired quote", async () => {
    const created = await createQuote({
      leadId: A.leadId, dealId: A.dealId, title: "[CRM-TEST] Expiry",
      lineItems: [{ description: "Work", quantity: "1", unitPrice: "100.00" }],
    });
    const id = created.json["quote"].id as number;
    await staff.call("POST", `/api/crm/quotes/${id}/send`, {});

    const bare = await portalA.call("POST", `/api/portal/quotes/${id}/accept`, { typedName: "" });
    expect(bare.status).toBe(400);

    await db.update(schema.crmQuotes)
      .set({ validUntil: new Date(Date.now() - 86_400_000) })
      .where(eq(schema.crmQuotes.id, id));

    const list = await portalA.call("GET", "/api/portal/proposals");
    const shown = (list.json["quotes"] as any[]).find((q) => q.id === id);
    expect(shown.canAccept).toBe(false);
    expect(shown.expired).toBe(true);

    const late = await portalA.call("POST", `/api/portal/quotes/${id}/accept`,
      { typedName: "A. Customer" });
    expect(late.status).toBe(409);
    expect(String(late.json["error"])).toMatch(/expiry|expired/i);
  }, 180_000);

  // ── Auth boundaries ───────────────────────────────────────────────────────

  it("keeps the staff billing routes out of a portal session's reach", async () => {
    for (const [method, path, body] of [
      ["GET", "/api/crm/quotes", undefined],
      ["GET", "/api/crm/invoices", undefined],
      ["POST", "/api/crm/quotes", { leadId: B.leadId, title: "trespass" }],
      ["POST", "/api/crm/invoices", { leadId: B.leadId, title: "trespass" }],
    ] as Array<[string, string, unknown]>) {
      // Proven to be a live staff route first, so the assertion below cannot
      // pass on a 404 from a route that does not exist.
      if (method === "GET") {
        expect((await staff.call(method, path)).status, `${path} is not a live staff route`).toBe(200);
      }
      const res = await portalA.call(method, path, body);
      expect([401, 403], `${method} ${path} answered ${res.status}`).toContain(res.status);
    }

    // And a staff cookie is not a portal cookie.
    const asPortal = await call("POST", `/api/portal/quotes/${quoteIds[0]}/accept`, {
      cookie: staff.cookie, csrfHeader: "x-portal-csrf", csrf: staff.csrf,
      body: { typedName: "Staff pretending" },
    });
    expect(asPortal.status).toBe(401);
  }, 180_000);
});
