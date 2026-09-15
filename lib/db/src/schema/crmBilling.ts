import {
  pgTable, serial, text, integer, timestamp, decimal, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── M5: quotes and invoices ─────────────────────────────────────────────────
//
// PUSH-MODE tables (shared barrel), additive only. Reviewed DDL lives in
// docs/crm-ops/schema/M5-billing.sql.
//
// ── Where these sit in the chain that already exists ────────────────────────
//
//   Contact → Deal → QUOTE → accepted → INVOICE → payment → crm_transactions
//
// Both new records hang off `crm_leads` (the customer, and the portal's only
// tenant key) and optionally off `crm_deals`. Neither is a second money model:
// a payment against an invoice is written to `crm_transactions` with
// `TRANSACTION_RECEIVED_STATUS`, which is the one table every "money received"
// figure in this system already reads. `crm_invoices.amount_paid` is a cached
// roll-up of those rows, never an independent truth — it is recomputed from
// the transactions on every payment.
//
// ── Money ───────────────────────────────────────────────────────────────────
//
// `decimal(10, 2)`, exactly like `crm_transactions.amount` and
// `crm_deals.value`. Matching the existing convention is what lets the money
// figures keep summing one column. Every total here is computed by the SERVER
// in integer minor units (see api-server/src/lib/crmMoney.ts) and only then
// formatted into these columns — a client-supplied total is ignored, and no
// currency arithmetic anywhere is done in floating point.
//
// ── What these tables deliberately do NOT model ─────────────────────────────
//
// Tax. There is no tax engine, no jurisdiction table and nobody has specified
// one, so an invoice carries no tax line rather than a zero that reads as
// "tax was considered and came to nothing".
//
// Signatures. Accepting a quote records that somebody clicked a button while
// holding a portal session. `crmPortal.ts`'s `PORTAL_NOT_A_SIGNATURE` is what
// every payload reports, and the columns here are named for the act performed
// (`acceptedTypedName`) rather than for an identity nobody verified.

// ── Vocabularies ────────────────────────────────────────────────────────────

export const CRM_QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
export type CrmQuoteStatus = (typeof CRM_QUOTE_STATUSES)[number];

export const CRM_INVOICE_STATUSES = ["draft", "issued", "part_paid", "paid", "void"] as const;
export type CrmInvoiceStatus = (typeof CRM_INVOICE_STATUSES)[number];

/** How an optional discount is expressed. `percent` is a percentage of the subtotal. */
export const CRM_DISCOUNT_TYPES = ["none", "percent", "amount"] as const;
export type CrmDiscountType = (typeof CRM_DISCOUNT_TYPES)[number];

/**
 * The quote state machine, as data rather than as a chain of `if`s.
 *
 * Declared here so the route, the tests and any future UI read the SAME table.
 * A machine spelled out at each call site is a machine that disagrees with
 * itself: that is exactly how `"received"` came to be filtered on in two money
 * readers while every writer stored `"completed"`.
 *
 * `accepted`, `declined` and `expired` are terminal. A quote that was declined
 * is not re-opened — a new quote is raised, so the record of what was offered
 * and refused survives.
 */
export const CRM_QUOTE_TRANSITIONS: Record<CrmQuoteStatus, readonly CrmQuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: [],
};

/**
 * The invoice state machine.
 *
 * `part_paid` and `paid` are reached by RECORDING A PAYMENT, never by setting a
 * status directly — the money has to exist in `crm_transactions` before the
 * invoice is allowed to say it arrived.
 *
 * Note what is missing: `part_paid → void`. Once money has been received
 * against an invoice, voiding it would leave a payment pointing at a document
 * the business says never existed. Refunding is a different act with a
 * different record, and pretending otherwise here would put the money figures
 * and the invoice list into permanent disagreement.
 */
export const CRM_INVOICE_TRANSITIONS: Record<CrmInvoiceStatus, readonly CrmInvoiceStatus[]> = {
  draft: ["issued", "void"],
  issued: ["part_paid", "paid", "void"],
  part_paid: ["paid"],
  paid: [],
  void: [],
};

export function canTransitionQuote(from: CrmQuoteStatus, to: CrmQuoteStatus): boolean {
  return (CRM_QUOTE_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionInvoice(from: CrmInvoiceStatus, to: CrmInvoiceStatus): boolean {
  return (CRM_INVOICE_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Customer-facing references, derived from the immutable id — the same
 * construction `portalTicketReference` uses, and for the same reason: the
 * number a customer quotes down the phone is the number staff can find.
 *
 * No counter table, so two concurrent creates cannot be handed one number.
 */
export function quoteReference(id: number): string {
  return `QUO-${String(id).padStart(5, "0")}`;
}

export function invoiceReference(id: number): string {
  return `INV-${String(id).padStart(5, "0")}`;
}

// ── Quotes ──────────────────────────────────────────────────────────────────

export const crmQuotes = pgTable("crm_quotes", {
  id: serial("id").primaryKey(),

  /**
   * The customer. NOT NULL, and it is the portal's tenant key — a quote with no
   * contact could never be shown to anybody, and every scoped read filters on
   * this column.
   */
  leadId: integer("lead_id").notNull(),

  /**
   * The deal this quote is for. Nullable at creation, because a quote is
   * sometimes drafted before the deal exists — but ACCEPTING one requires it,
   * so an accepted quote is always linked to the deal it came from.
   */
  dealId: integer("deal_id"),

  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),

  /** Recorded so a figure is never displayed without its unit. */
  currency: text("currency").notNull().default("USD"),

  // ── Totals, all computed server-side from the line items ─────────────────
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type").notNull().default("none"),
  /** The percentage (for `percent`) or the currency amount (for `amount`). */
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  /** What the discount actually came to, in currency. Derived, never supplied. */
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),

  /** Printed on the document the customer reads. */
  notes: text("notes"),
  /** Staff writing to staff. Never serialised to a portal payload. */
  internalNotes: text("internal_notes"),

  validUntil: timestamp("valid_until", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),

  // ── Acceptance. Not a signature; see the file header. ────────────────────
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** The deal the accepted quote is bound to, copied at acceptance. */
  acceptedDealId: integer("accepted_deal_id"),
  /** Free text the customer typed. Not compared against anything. */
  acceptedTypedName: text("accepted_typed_name"),
  acceptedFromIp: text("accepted_from_ip"),
  acceptedByPortalAccountId: integer("accepted_by_portal_account_id"),

  declinedAt: timestamp("declined_at", { withTimezone: true }),
  declinedReason: text("declined_reason"),
  expiredAt: timestamp("expired_at", { withTimezone: true }),

  /** The rendered document in `crm_attachments`, written when the quote is sent. */
  documentAttachmentId: integer("document_attachment_id"),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel: text("created_by_label").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_quotes_lead").on(table.leadId, table.id),
  index("ix_crm_quotes_deal").on(table.dealId),
  index("ix_crm_quotes_status").on(table.status),
  check("ck_crm_quotes_status",
    sql`${table.status} IN ('draft', 'sent', 'accepted', 'declined', 'expired')`),
  check("ck_crm_quotes_discount_type",
    sql`${table.discountType} IN ('none', 'percent', 'amount')`),
  // Money is never negative here. A credit is a different document.
  check("ck_crm_quotes_amounts",
    sql`${table.subtotal} >= 0 AND ${table.total} >= 0 AND ${table.discountAmount} >= 0`),
  // An accepted quote is bound to a deal. Enforced by the database as well as
  // by the route, because "which deal did they actually agree to" is the
  // question the whole record exists to answer.
  check("ck_crm_quotes_accepted_has_deal",
    sql`${table.status} <> 'accepted' OR ${table.acceptedDealId} IS NOT NULL`),
]);

export type CrmQuote = typeof crmQuotes.$inferSelect;

export const crmQuoteLineItems = pgTable("crm_quote_line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  /** Display order, so a re-read returns the list the author arranged. */
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  /** quantity × unitPrice, computed by the server. */
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_quote_line_items_quote").on(table.quoteId, table.position),
  check("ck_crm_quote_line_items_amounts",
    sql`${table.quantity} > 0 AND ${table.unitPrice} >= 0 AND ${table.lineTotal} >= 0`),
]);

export type CrmQuoteLineItem = typeof crmQuoteLineItems.$inferSelect;

// ── Invoices ────────────────────────────────────────────────────────────────

export const crmInvoices = pgTable("crm_invoices", {
  id: serial("id").primaryKey(),

  leadId: integer("lead_id").notNull(),

  /**
   * The deal a payment against this invoice is recorded under.
   *
   * Nullable, because an invoice can legitimately be raised against a customer
   * with no deal open. But `crm_transactions.deal_id` is NOT NULL and that
   * column is not ours to change, so RECORDING A PAYMENT requires a deal — the
   * payment route takes one in the body when the invoice has none, and says so
   * plainly rather than inventing a placeholder deal that would then show up in
   * the pipeline and the forecast.
   */
  dealId: integer("deal_id"),

  /** The accepted quote this invoice was raised from, when it was. */
  quoteId: integer("quote_id"),

  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("USD"),

  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountType: text("discount_type").notNull().default("none"),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),

  /**
   * A cached roll-up of the `crm_transactions` rows carrying this invoice id,
   * recomputed from those rows on every payment. It is a convenience for
   * listing, never a second source of truth — if it and the transactions ever
   * disagreed, the transactions are right, because they are what every money
   * figure in this system sums.
   */
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),

  notes: text("notes"),
  internalNotes: text("internal_notes"),

  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),

  documentAttachmentId: integer("document_attachment_id"),

  createdByStaffId: integer("created_by_staff_id"),
  createdByLabel: text("created_by_label").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_invoices_lead").on(table.leadId, table.id),
  index("ix_crm_invoices_deal").on(table.dealId),
  index("ix_crm_invoices_quote").on(table.quoteId),
  index("ix_crm_invoices_status_due").on(table.status, table.dueDate),
  check("ck_crm_invoices_status",
    sql`${table.status} IN ('draft', 'issued', 'part_paid', 'paid', 'void')`),
  check("ck_crm_invoices_discount_type",
    sql`${table.discountType} IN ('none', 'percent', 'amount')`),
  check("ck_crm_invoices_amounts",
    sql`${table.subtotal} >= 0 AND ${table.total} >= 0
        AND ${table.discountAmount} >= 0 AND ${table.amountPaid} >= 0`),
  // An invoice with money against it cannot be void. The state machine already
  // forbids the transition; this is the same rule where it cannot be bypassed.
  check("ck_crm_invoices_void_is_unpaid",
    sql`${table.status} <> 'void' OR ${table.amountPaid} = 0`),
]);

export type CrmInvoice = typeof crmInvoices.$inferSelect;

export const crmInvoiceLineItems = pgTable("crm_invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ix_crm_invoice_line_items_invoice").on(table.invoiceId, table.position),
  check("ck_crm_invoice_line_items_amounts",
    sql`${table.quantity} > 0 AND ${table.unitPrice} >= 0 AND ${table.lineTotal} >= 0`),
]);

export type CrmInvoiceLineItem = typeof crmInvoiceLineItems.$inferSelect;
