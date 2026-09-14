// ── M5: quotes and invoices ─────────────────────────────────────────────────
//
// The gap area 9 of COMPLETENESS-2026-09-14.md named: "invoices and quotes not
// built". This is that, and it deliberately connects to what already exists
// rather than standing beside it.
//
//   money      A payment against an invoice is a `crm_transactions` row with
//              `TRANSACTION_RECEIVED_STATUS`, exactly like the manual and
//              Stripe payment paths. It therefore appears in the Command
//              Center's money panel, the sales forecast, the per-contact chain
//              and the portal's "paid to date" WITHOUT any of those four
//              learning that invoices exist. `crmMoneyContract.test.ts` is the
//              committed statement that those surfaces agree; this code is
//              written so that it keeps being true.
//   documents  A sent quote and an issued invoice are rendered into
//              `crm_attachments` + `crm_attachment_blobs`, the store the
//              Documents page already lists and the share-link machinery
//              already serves. No second file store.
//   portal     Visibility comes from `crm_portal_document_grants`, the same
//              default-deny allowlist every other customer-visible file uses.
//
// ── What is NOT here ────────────────────────────────────────────────────────
//
// Signing. No provider is configured, and an "accepted" quote is recorded as
// exactly what happened — a person clicked a button while holding a session.
// Every payload carries `portalSignatureDisclosure()`. What a provider would
// have to give us before that could change is written down in
// docs/crm-ops/E-SIGNATURE-REQUIREMENTS.md rather than half-built here.
//
// Tax. There is no tax model and nobody has specified one, so no line claims
// to be one.

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  crmQuotes, crmQuoteLineItems, crmInvoices, crmInvoiceLineItems,
  crmLeads, crmDeals, crmTransactions, crmActivities,
  crmAttachments, crmAttachmentBlobs, crmPortalDocumentGrants,
  canTransitionInvoice, canTransitionQuote, invoiceReference, quoteReference,
  portalSignatureDisclosure,
  TRANSACTION_METHODS, TRANSACTION_RECEIVED_STATUS,
  CRM_DISCOUNT_TYPES, CRM_INVOICE_TRANSITIONS, CRM_QUOTE_TRANSITIONS,
  type CrmDiscountType, type CrmInvoiceStatus, type CrmQuoteStatus,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import {
  computeTotals, formatMoneyMinor, parseMoneyMinor, parseQuantityHundredths,
  storedMoneyMinor,
  MAX_MONEY_MINOR, MAX_QUANTITY_HUNDREDTHS, MAX_UNIT_PRICE_MINOR,
  type DiscountInput, type LineInput,
} from "../lib/crmMoney.js";

const router: IRouter = Router();

/** Payment methods a person records by hand. Stripe settles through its own webhook. */
const MANUAL_METHODS = TRANSACTION_METHODS.filter((m) => m !== "stripe");

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : undefined;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName || s?.email || "admin" };
}

function parseDate(v: unknown): Date | null | undefined {
  if (v === null) return null;
  if (v === undefined || v === "") return undefined;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : undefined;
}

// ── Input parsing ───────────────────────────────────────────────────────────

interface ParsedLines { lines: LineInput[] }
type ParseFailure = { error: string };

/**
 * Line items, refused rather than coerced.
 *
 * Note what this does NOT read: a `lineTotal`, a `subtotal` or a `total` from
 * the body. There is no code path that accepts a client-computed figure, which
 * is why tampering with one has no effect — the route is not ignoring it, it
 * never looks at it.
 */
function parseLineItems(raw: unknown): ParsedLines | ParseFailure {
  if (!Array.isArray(raw)) return { error: "Send the line items as a list." };
  if (raw.length > 100) return { error: "A document may carry at most 100 line items." };

  const lines: LineInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    const description = str(item?.["description"]);
    if (description.length < 1 || description.length > 500) {
      return { error: `Line ${i + 1}: describe what is being charged for (1–500 characters).` };
    }
    const quantityHundredths = parseQuantityHundredths(item?.["quantity"] ?? "1");
    if (quantityHundredths === null || quantityHundredths > MAX_QUANTITY_HUNDREDTHS) {
      return { error: `Line ${i + 1}: the quantity must be a positive number with at most two decimal places.` };
    }
    const unitPriceMinor = parseMoneyMinor(item?.["unitPrice"] ?? "0");
    if (unitPriceMinor === null || unitPriceMinor > MAX_UNIT_PRICE_MINOR) {
      return { error: `Line ${i + 1}: the unit price must be an amount like 1250.00, and no larger than ${formatMoneyMinor(MAX_UNIT_PRICE_MINOR)}.` };
    }
    lines.push({ description, quantityHundredths, unitPriceMinor });
  }
  return { lines };
}

function parseDiscount(type: unknown, value: unknown): DiscountInput | ParseFailure {
  const kind = str(type) || "none";
  if (!(CRM_DISCOUNT_TYPES as readonly string[]).includes(kind)) {
    return { error: `Unknown discount type. Use one of: ${CRM_DISCOUNT_TYPES.join(", ")}.` };
  }
  if (kind === "none") return { type: "none" };

  const parsed = parseMoneyMinor(value ?? "0");
  if (parsed === null) {
    return { error: "The discount must be a non-negative number with at most two decimal places." };
  }
  if (kind === "percent") {
    if (parsed > 100_00) return { error: "A percentage discount cannot be more than 100%." };
    return { type: "percent", valueHundredths: parsed };
  }
  return { type: "amount", valueMinor: parsed };
}

function discountColumns(discount: DiscountInput): { discountType: CrmDiscountType; discountValue: string } {
  if (discount.type === "percent") {
    return { discountType: "percent", discountValue: formatMoneyMinor(discount.valueHundredths) };
  }
  if (discount.type === "amount") {
    return { discountType: "amount", discountValue: formatMoneyMinor(discount.valueMinor) };
  }
  return { discountType: "none", discountValue: "0.00" };
}

function discountFromColumns(type: string, value: string | null): DiscountInput {
  const minor = storedMoneyMinor(value);
  if (type === "percent") return { type: "percent", valueHundredths: minor };
  if (type === "amount") return { type: "amount", valueMinor: minor };
  return { type: "none" };
}

// ── Rendering the document a customer actually reads ────────────────────────
//
// Plain text, not a PDF. A PDF renderer is a new dependency, and the operating
// contract says to stop rather than add one; a clean fixed-width document is
// readable in every mail client, browser and phone, and downloads with the
// same `Content-Disposition: attachment` hardening every other file here gets.
// The format is deterministic, so re-sending an unchanged quote produces
// identical bytes and the existing content-hash/versioning tells the truth.

interface RenderedLine { description: string; quantity: string; unitPrice: string; lineTotal: string }

interface RenderInput {
  kind: "Quote" | "Invoice";
  reference: string;
  title: string;
  currency: string;
  contact: { name: string; company: string | null; email: string | null };
  dealName: string | null;
  lines: RenderedLine[];
  subtotal: string;
  discountLabel: string | null;
  discountAmount: string;
  total: string;
  notes: string | null;
  dates: Array<[string, string]>;
  closing: string[];
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + " ".repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value.slice(-width) : " ".repeat(width - value.length) + value;
}

function renderDocument(input: RenderInput): string {
  const rule = "-".repeat(72);
  const out: string[] = [];
  out.push(`SiteMint Digital — ${input.kind} ${input.reference}`);
  out.push(rule);
  out.push(`For:      ${input.contact.company ?? input.contact.name}`);
  if (input.contact.company) out.push(`Contact:  ${input.contact.name}`);
  if (input.contact.email) out.push(`Email:    ${input.contact.email}`);
  if (input.dealName) out.push(`Work:     ${input.dealName}`);
  out.push(`Subject:  ${input.title}`);
  for (const [label, value] of input.dates) out.push(`${pad(`${label}:`, 10)}${value}`);
  out.push("");
  out.push(`${pad("Description", 38)}${padStart("Qty", 8)}${padStart("Unit", 12)}${padStart("Amount", 14)}`);
  out.push(rule);
  for (const line of input.lines) {
    out.push(
      `${pad(line.description, 38)}${padStart(line.quantity, 8)}${padStart(line.unitPrice, 12)}${padStart(line.lineTotal, 14)}`,
    );
  }
  out.push(rule);
  out.push(`${pad("", 38)}${padStart("Subtotal", 20)}${padStart(`${input.currency} ${input.subtotal}`, 14)}`);
  if (input.discountLabel) {
    out.push(`${pad("", 38)}${padStart(input.discountLabel, 20)}${padStart(`-${input.currency} ${input.discountAmount}`, 14)}`);
  }
  out.push(`${pad("", 38)}${padStart("Total", 20)}${padStart(`${input.currency} ${input.total}`, 14)}`);
  out.push("");
  if (input.notes) {
    out.push("Notes");
    out.push(rule);
    out.push(input.notes);
    out.push("");
  }
  out.push(rule);
  for (const line of input.closing) out.push(line);
  return out.join("\n") + "\n";
}

/**
 * Puts a rendered document into the store the Documents page already lists,
 * and makes it visible to the one contact it belongs to.
 *
 * Versioning is the same rule `crmDocuments.ts` applies: the same filename
 * against the same record supersedes rather than shadows, so re-sending a
 * revised quote leaves the earlier one recoverable instead of overwriting the
 * thing the customer was actually shown.
 */
async function materialiseDocument(args: {
  leadId: number;
  filename: string;
  body: string;
  actorId: number | null;
  actorLabel: string;
}): Promise<number> {
  const bytes = Buffer.from(args.body, "utf8");
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");

  const [previous] = await db.select().from(crmAttachments).where(and(
    eq(crmAttachments.entityType, "lead"),
    eq(crmAttachments.entityId, args.leadId),
    eq(crmAttachments.filename, args.filename),
    isNull(crmAttachments.deletedAt),
  )).orderBy(desc(crmAttachments.version)).limit(1);

  const [attachment] = await db.insert(crmAttachments).values({
    entityType: "lead",
    entityId: args.leadId,
    filename: args.filename,
    mimeType: "text/plain",
    sizeBytes: bytes.length,
    storageKey: "db:crm_attachment_blobs",
    contentHash,
    version: previous ? previous.version + 1 : 1,
    supersedesId: previous?.id ?? null,
    uploadedByStaffId: args.actorId,
    uploadedByLabel: args.actorLabel,
  }).returning();

  await db.insert(crmAttachmentBlobs).values({ attachmentId: attachment.id, bytes });

  // Default-deny is the portal's rule, so sending a quote has to say so
  // explicitly. `onConflictDoUpdate` un-revokes a grant that was withdrawn,
  // which is the right answer when staff deliberately re-send.
  await db.insert(crmPortalDocumentGrants).values({
    leadId: args.leadId,
    attachmentId: attachment.id,
    grantedByStaffId: args.actorId,
    grantedByLabel: args.actorLabel,
  }).onConflictDoUpdate({
    target: [crmPortalDocumentGrants.leadId, crmPortalDocumentGrants.attachmentId],
    set: { revokedAt: null, grantedByStaffId: args.actorId, grantedByLabel: args.actorLabel },
  });

  return attachment.id;
}

// ── Shared reads ────────────────────────────────────────────────────────────

async function loadContact(leadId: number) {
  const [row] = await db.select({
    id: crmLeads.id, name: crmLeads.name, company: crmLeads.company, email: crmLeads.email,
  }).from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  return row;
}

async function loadDeal(dealId: number) {
  const [row] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId)).limit(1);
  return row;
}

const money = (stored: string | null) => Number(stored ?? 0) || 0;

function publicQuote(
  quote: typeof crmQuotes.$inferSelect,
  lines: (typeof crmQuoteLineItems.$inferSelect)[],
) {
  return {
    id: quote.id,
    reference: quoteReference(quote.id),
    leadId: quote.leadId,
    dealId: quote.dealId,
    title: quote.title,
    status: quote.status,
    currency: quote.currency,
    subtotal: money(quote.subtotal),
    discountType: quote.discountType,
    discountValue: money(quote.discountValue),
    discountAmount: money(quote.discountAmount),
    total: money(quote.total),
    notes: quote.notes,
    internalNotes: quote.internalNotes,
    validUntil: quote.validUntil,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    acceptedDealId: quote.acceptedDealId,
    acceptedTypedName: quote.acceptedTypedName,
    declinedAt: quote.declinedAt,
    declinedReason: quote.declinedReason,
    expiredAt: quote.expiredAt,
    documentAttachmentId: quote.documentAttachmentId,
    createdByLabel: quote.createdByLabel,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    /** What may happen next, from the one declared state machine. */
    allowedNextStatuses: CRM_QUOTE_TRANSITIONS[quote.status as CrmQuoteStatus] ?? [],
    lineItems: lines.map((l) => ({
      id: l.id, position: l.position, description: l.description,
      quantity: money(l.quantity), unitPrice: money(l.unitPrice), lineTotal: money(l.lineTotal),
    })),
    // Stated on every quote, so an acceptance can never be read as a signature.
    ...portalSignatureDisclosure(),
  };
}

function publicInvoice(
  invoice: typeof crmInvoices.$inferSelect,
  lines: (typeof crmInvoiceLineItems.$inferSelect)[],
) {
  const totalMinor = storedMoneyMinor(invoice.total);
  const paidMinor = storedMoneyMinor(invoice.amountPaid);
  return {
    id: invoice.id,
    reference: invoiceReference(invoice.id),
    leadId: invoice.leadId,
    dealId: invoice.dealId,
    quoteId: invoice.quoteId,
    title: invoice.title,
    status: invoice.status,
    currency: invoice.currency,
    subtotal: money(invoice.subtotal),
    discountType: invoice.discountType,
    discountValue: money(invoice.discountValue),
    discountAmount: money(invoice.discountAmount),
    total: money(invoice.total),
    amountPaid: money(invoice.amountPaid),
    amountOutstanding: Number(formatMoneyMinor(Math.max(totalMinor - paidMinor, 0))),
    notes: invoice.notes,
    internalNotes: invoice.internalNotes,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    voidReason: invoice.voidReason,
    overdue: invoice.dueDate != null
      && ["issued", "part_paid"].includes(invoice.status)
      && invoice.dueDate.getTime() < Date.now(),
    documentAttachmentId: invoice.documentAttachmentId,
    createdByLabel: invoice.createdByLabel,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    allowedNextStatuses: CRM_INVOICE_TRANSITIONS[invoice.status as CrmInvoiceStatus] ?? [],
    // A payment lands in crm_transactions, which requires a deal. Said here so
    // the UI can explain the block before somebody tries.
    canRecordPayment: ["issued", "part_paid"].includes(invoice.status),
    paymentNeedsDeal: invoice.dealId == null,
    lineItems: lines.map((l) => ({
      id: l.id, position: l.position, description: l.description,
      quantity: money(l.quantity), unitPrice: money(l.unitPrice), lineTotal: money(l.lineTotal),
    })),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// QUOTES
// ══════════════════════════════════════════════════════════════════════════

router.get("/crm/quotes", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  const leadId = num(req.query["leadId"]);
  const dealId = num(req.query["dealId"]);
  const status = str(req.query["status"]);

  const where = [
    ...(leadId ? [eq(crmQuotes.leadId, leadId)] : []),
    ...(dealId ? [eq(crmQuotes.dealId, dealId)] : []),
    ...(status ? [eq(crmQuotes.status, status)] : []),
  ];

  const rows = await db.select().from(crmQuotes)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(crmQuotes.id))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db.select().from(crmQuoteLineItems)
        .where(inArray(crmQuoteLineItems.quoteId, ids))
        .orderBy(asc(crmQuoteLineItems.position))
    : [];

  res.json({
    quotes: rows.map((q) => publicQuote(q, lines.filter((l) => l.quoteId === q.id))),
  });
});

router.get("/crm/quotes/:id", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, id)).limit(1);
  if (!quote) { res.status(404).json({ error: "Not found." }); return; }
  const lines = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, id)).orderBy(asc(crmQuoteLineItems.position));
  res.json({ quote: publicQuote(quote, lines) });
});

router.post("/crm/quotes", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const title = str(b["title"]);
  if (title.length < 2 || title.length > 200) {
    res.status(400).json({ error: "Give the quote a title (2–200 characters)." }); return;
  }

  const dealId = num(b["dealId"]);
  let leadId = num(b["leadId"]);

  // A quote can be raised from a deal alone; the customer is then the deal's
  // contact. Either way it ends up with a leadId, because that is the portal's
  // tenant key and a quote nobody can be shown is not a quote.
  let deal: Awaited<ReturnType<typeof loadDeal>> | undefined;
  if (dealId) {
    deal = await loadDeal(dealId);
    if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
    if (!leadId) leadId = deal.leadId ?? undefined;
    if (deal.leadId != null && leadId != null && deal.leadId !== leadId) {
      res.status(409).json({ error: "That deal belongs to a different contact." }); return;
    }
  }
  if (!leadId) {
    res.status(400).json({ error: "Say which contact this quote is for." }); return;
  }
  const contact = await loadContact(leadId);
  if (!contact) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const parsedLines = parseLineItems(b["lineItems"] ?? []);
  if ("error" in parsedLines) { res.status(400).json({ error: parsedLines.error }); return; }
  const discount = parseDiscount(b["discountType"], b["discountValue"]);
  if ("error" in discount) { res.status(400).json({ error: discount.error }); return; }

  const totals = computeTotals(parsedLines.lines, discount);
  if (totals.subtotalMinor > MAX_MONEY_MINOR) {
    res.status(400).json({ error: `That comes to more than ${formatMoneyMinor(MAX_MONEY_MINOR)}, which this system cannot record.` });
    return;
  }

  const validUntil = parseDate(b["validUntil"]);
  if (validUntil === undefined && b["validUntil"] !== undefined && b["validUntil"] !== "") {
    res.status(400).json({ error: "Invalid expiry date." }); return;
  }

  const me = actor(req);
  const [quote] = await db.insert(crmQuotes).values({
    leadId,
    dealId: dealId ?? null,
    title,
    status: "draft",
    ...discountColumns(discount),
    subtotal: formatMoneyMinor(totals.subtotalMinor),
    discountAmount: formatMoneyMinor(totals.discountAmountMinor),
    total: formatMoneyMinor(totals.totalMinor),
    notes: str(b["notes"]) || null,
    internalNotes: str(b["internalNotes"]) || null,
    validUntil: validUntil ?? null,
    createdByStaffId: me.id,
    createdByLabel: me.label,
  }).returning();

  if (totals.lines.length) {
    await db.insert(crmQuoteLineItems).values(totals.lines.map((l) => ({
      quoteId: quote.id,
      position: l.position,
      description: l.description,
      quantity: formatMoneyMinor(l.quantityHundredths),
      unitPrice: formatMoneyMinor(l.unitPriceMinor),
      lineTotal: formatMoneyMinor(l.lineTotalMinor),
    })));
  }

  await auditAction(req, "quote.created", `quote:${quote.id} lead:${leadId} ${formatMoneyMinor(totals.totalMinor)}`);

  const lines = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, quote.id)).orderBy(asc(crmQuoteLineItems.position));
  res.status(201).json({ quote: publicQuote(quote, lines) });
});

/**
 * Edits a DRAFT quote only.
 *
 * Once a quote has been sent, its figures are what the customer was shown.
 * Editing them in place would mean an accepted quote's line items are not
 * necessarily the ones anybody agreed to, which is the same class of defect as
 * a proposal acceptance that referenced a mutable deal value instead of
 * copying it.
 */
router.patch("/crm/quotes/:id", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, id)).limit(1);
  if (!quote) { res.status(404).json({ error: "Not found." }); return; }
  if (quote.status !== "draft") {
    res.status(409).json({
      error: `This quote is "${quote.status}". Only a draft can be edited — the figures a customer was sent are the record of what they were offered. Raise a new quote instead.`,
    });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if ("title" in b) {
    const title = str(b["title"]);
    if (title.length < 2 || title.length > 200) {
      res.status(400).json({ error: "Give the quote a title (2–200 characters)." }); return;
    }
    updates["title"] = title;
  }
  if ("notes" in b) updates["notes"] = str(b["notes"]) || null;
  if ("internalNotes" in b) updates["internalNotes"] = str(b["internalNotes"]) || null;
  if ("validUntil" in b) {
    const d = parseDate(b["validUntil"]);
    if (d === undefined) { res.status(400).json({ error: "Invalid expiry date." }); return; }
    updates["validUntil"] = d;
  }
  if ("dealId" in b) {
    const dealId = num(b["dealId"]);
    if (dealId) {
      const deal = await loadDeal(dealId);
      if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
      if (deal.leadId != null && deal.leadId !== quote.leadId) {
        res.status(409).json({ error: "That deal belongs to a different contact." }); return;
      }
      updates["dealId"] = dealId;
    } else {
      updates["dealId"] = null;
    }
  }

  // Totals are recomputed whenever the lines or the discount move, never taken
  // from the body.
  const linesChanged = "lineItems" in b;
  const discountChanged = "discountType" in b || "discountValue" in b;
  if (linesChanged || discountChanged) {
    const existing = await db.select().from(crmQuoteLineItems)
      .where(eq(crmQuoteLineItems.quoteId, id)).orderBy(asc(crmQuoteLineItems.position));

    const parsedLines = linesChanged
      ? parseLineItems(b["lineItems"])
      : {
          lines: existing.map((l) => ({
            description: l.description,
            quantityHundredths: storedMoneyMinor(l.quantity),
            unitPriceMinor: storedMoneyMinor(l.unitPrice),
          })),
        };
    if ("error" in parsedLines) { res.status(400).json({ error: parsedLines.error }); return; }

    const discount = discountChanged
      ? parseDiscount(b["discountType"] ?? quote.discountType, b["discountValue"] ?? quote.discountValue)
      : discountFromColumns(quote.discountType, quote.discountValue);
    if ("error" in discount) { res.status(400).json({ error: discount.error }); return; }

    const totals = computeTotals(parsedLines.lines, discount);
    if (totals.subtotalMinor > MAX_MONEY_MINOR) {
      res.status(400).json({ error: `That comes to more than ${formatMoneyMinor(MAX_MONEY_MINOR)}, which this system cannot record.` });
      return;
    }

    if (linesChanged) {
      await db.delete(crmQuoteLineItems).where(eq(crmQuoteLineItems.quoteId, id));
      if (totals.lines.length) {
        await db.insert(crmQuoteLineItems).values(totals.lines.map((l) => ({
          quoteId: id,
          position: l.position,
          description: l.description,
          quantity: formatMoneyMinor(l.quantityHundredths),
          unitPrice: formatMoneyMinor(l.unitPriceMinor),
          lineTotal: formatMoneyMinor(l.lineTotalMinor),
        })));
      }
    }

    Object.assign(updates, discountColumns(discount), {
      subtotal: formatMoneyMinor(totals.subtotalMinor),
      discountAmount: formatMoneyMinor(totals.discountAmountMinor),
      total: formatMoneyMinor(totals.totalMinor),
    });
  }

  const [updated] = await db.update(crmQuotes).set(updates)
    .where(eq(crmQuotes.id, id)).returning();
  const lines = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, id)).orderBy(asc(crmQuoteLineItems.position));
  res.json({ quote: publicQuote(updated, lines) });
});

/**
 * draft → sent. Renders the document and makes it visible in the portal.
 *
 * It does NOT email anything. Mail is `communications.send`'s business and goes
 * out from the Communications surface; saying "sent" here means the quote has
 * been issued and the customer can see it, which is what the portal grant
 * actually achieves.
 */
router.post("/crm/quotes/:id/send", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, id)).limit(1);
  if (!quote) { res.status(404).json({ error: "Not found." }); return; }

  if (!canTransitionQuote(quote.status as CrmQuoteStatus, "sent")) {
    res.status(409).json({
      error: `A quote at "${quote.status}" cannot be sent.`,
      allowedNextStatuses: CRM_QUOTE_TRANSITIONS[quote.status as CrmQuoteStatus] ?? [],
    });
    return;
  }

  const lines = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, id)).orderBy(asc(crmQuoteLineItems.position));
  if (lines.length === 0) {
    res.status(409).json({ error: "This quote has no line items, so there is nothing to quote for." });
    return;
  }

  const contact = await loadContact(quote.leadId);
  if (!contact) { res.status(404).json({ error: "That contact no longer exists." }); return; }
  const deal = quote.dealId ? await loadDeal(quote.dealId) : undefined;

  const me = actor(req);
  const now = new Date();
  const body = renderDocument({
    kind: "Quote",
    reference: quoteReference(quote.id),
    title: quote.title,
    currency: quote.currency,
    contact: { name: contact.name, company: contact.company, email: contact.email },
    dealName: deal?.name ?? null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    subtotal: quote.subtotal,
    discountLabel: quote.discountType === "percent"
      ? `Discount ${quote.discountValue}%`
      : quote.discountType === "amount" ? "Discount" : null,
    discountAmount: quote.discountAmount,
    total: quote.total,
    notes: quote.notes,
    dates: [
      ["Issued", now.toISOString().slice(0, 10)],
      ...(quote.validUntil ? ([["Valid to", quote.validUntil.toISOString().slice(0, 10)]] as Array<[string, string]>) : []),
    ],
    closing: [
      "Accepting this quote in your SiteMint client area records your agreement",
      "in writing. It is not an electronic signature and does not replace a",
      "signed contract.",
    ],
  });

  const attachmentId = await materialiseDocument({
    leadId: quote.leadId,
    filename: `Quote-${quoteReference(quote.id)}.txt`,
    body,
    actorId: me.id,
    actorLabel: me.label,
  });

  const [updated] = await db.update(crmQuotes).set({
    status: "sent",
    sentAt: now,
    documentAttachmentId: attachmentId,
    updatedAt: now,
  }).where(and(eq(crmQuotes.id, id), eq(crmQuotes.status, "draft"))).returning();
  if (!updated) {
    // Somebody else moved it between the check and the write.
    res.status(409).json({ error: "That quote is no longer a draft." }); return;
  }

  if (updated.leadId) {
    await db.insert(crmActivities).values({
      leadId: updated.leadId,
      type: "quote_sent",
      title: `Quote ${quoteReference(updated.id)} sent: ${updated.title}`,
      description: `${updated.currency} ${updated.total}`,
      createdBy: me.label,
    });
  }

  await auditAction(req, "quote.sent", `quote:${id} attachment:${attachmentId}`);
  res.json({
    quote: publicQuote(updated, lines),
    documentAttachmentId: attachmentId,
    note: "The quote is now visible in the customer's portal. Nothing was emailed — send that from Communications.",
  });
});

/**
 * Staff-side outcome: accepted, declined or expired.
 *
 * Accepting from here is for the case where the customer said yes by phone or
 * email; the portal has its own route for the customer doing it themselves.
 * Both write the same columns and both refuse to record an acceptance that is
 * not bound to a deal.
 */
router.post("/crm/quotes/:id/status", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const b = req.body as Record<string, unknown>;
  const next = str(b["status"]) as CrmQuoteStatus;

  const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, id)).limit(1);
  if (!quote) { res.status(404).json({ error: "Not found." }); return; }

  const current = quote.status as CrmQuoteStatus;
  if (!canTransitionQuote(current, next)) {
    res.status(409).json({
      error: `A quote at "${current}" cannot become "${next}".`,
      allowedNextStatuses: CRM_QUOTE_TRANSITIONS[current] ?? [],
    });
    return;
  }

  const me = actor(req);
  const now = new Date();
  const updates: Record<string, unknown> = { status: next, updatedAt: now };

  if (next === "accepted") {
    const dealId = quote.dealId ?? num(b["dealId"]);
    if (!dealId) {
      res.status(409).json({
        error: "An accepted quote has to be linked to the deal it came from. Name a deal and try again.",
      });
      return;
    }
    const deal = await loadDeal(dealId);
    if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
    if (deal.leadId != null && deal.leadId !== quote.leadId) {
      res.status(409).json({ error: "That deal belongs to a different contact." }); return;
    }
    updates["dealId"] = dealId;
    updates["acceptedDealId"] = dealId;
    updates["acceptedAt"] = now;
    updates["acceptedTypedName"] = str(b["acceptedTypedName"]) || `Recorded by ${me.label}`;
  }
  if (next === "declined") {
    updates["declinedAt"] = now;
    updates["declinedReason"] = str(b["reason"]) || null;
  }
  if (next === "expired") updates["expiredAt"] = now;

  const [updated] = await db.update(crmQuotes).set(updates)
    .where(and(eq(crmQuotes.id, id), eq(crmQuotes.status, current))).returning();
  if (!updated) { res.status(409).json({ error: "That quote has already moved on." }); return; }

  if (updated.leadId) {
    await db.insert(crmActivities).values({
      leadId: updated.leadId,
      type: `quote_${next}`,
      title: `Quote ${quoteReference(updated.id)} ${next}: ${updated.title}`,
      description: next === "accepted"
        // Said in the activity feed too, because this is where somebody goes
        // looking for evidence of agreement.
        ? `${updated.currency} ${updated.total}. Recorded as agreement in writing, not as a signature.`
        : `${updated.currency} ${updated.total}`,
      createdBy: me.label,
    });
  }

  await auditAction(req, `quote.${next}`, `quote:${id}`);
  const lines = await db.select().from(crmQuoteLineItems)
    .where(eq(crmQuoteLineItems.quoteId, id)).orderBy(asc(crmQuoteLineItems.position));
  res.json({ quote: publicQuote(updated, lines) });
});

// ══════════════════════════════════════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════════════════════════════════════

router.get("/crm/invoices", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  const leadId = num(req.query["leadId"]);
  const dealId = num(req.query["dealId"]);
  const status = str(req.query["status"]);

  const where = [
    ...(leadId ? [eq(crmInvoices.leadId, leadId)] : []),
    ...(dealId ? [eq(crmInvoices.dealId, dealId)] : []),
    ...(status ? [eq(crmInvoices.status, status)] : []),
  ];

  const rows = await db.select().from(crmInvoices)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(crmInvoices.id))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db.select().from(crmInvoiceLineItems)
        .where(inArray(crmInvoiceLineItems.invoiceId, ids))
        .orderBy(asc(crmInvoiceLineItems.position))
    : [];

  const invoices = rows.map((i) => publicInvoice(i, lines.filter((l) => l.invoiceId === i.id)));
  res.json({
    invoices,
    totals: {
      // Every figure names its own basis, the house rule in REPORTING-DEFINITIONS.md.
      issuedTotal: invoices.filter((i) => i.status !== "draft" && i.status !== "void")
        .reduce((s, i) => s + i.total, 0),
      paid: invoices.reduce((s, i) => s + i.amountPaid, 0),
      outstanding: invoices.filter((i) => ["issued", "part_paid"].includes(i.status))
        .reduce((s, i) => s + i.amountOutstanding, 0),
    },
    definitions: {
      issuedTotal: "Face value of every invoice that has been issued and not voided. Drafts are excluded because nobody has been asked to pay them.",
      paid: `Money recorded against these invoices in crm_transactions with status '${TRANSACTION_RECEIVED_STATUS}' — the same rows every other money figure in the CRM sums.`,
      outstanding: "Issued and part-paid invoices, less what has arrived against them. This is a balance owed to us, not a forecast.",
    },
  });
});

router.get("/crm/invoices/:id", requireCrmAuth("deals.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not found." }); return; }
  const lines = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));
  const payments = await db.select().from(crmTransactions)
    .where(eq(crmTransactions.invoiceId, id)).orderBy(desc(crmTransactions.id));
  res.json({
    invoice: publicInvoice(invoice, lines),
    payments: payments.map((p) => ({
      id: p.id, amount: money(p.amount), method: p.method, status: p.status,
      settled: p.status === TRANSACTION_RECEIVED_STATUS,
      receivedAt: p.receivedAt, createdAt: p.createdAt, notes: p.notes,
    })),
  });
});

/**
 * A new invoice: standalone against a customer, or raised from an accepted
 * quote, in which case the line items and the discount CARRY ACROSS rather than
 * being retyped. Re-typing them is exactly how the quote and the invoice come
 * to disagree about what was sold.
 */
router.post("/crm/invoices", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const quoteId = num(b["quoteId"]);

  let leadId = num(b["leadId"]);
  let dealId = num(b["dealId"]);
  let title = str(b["title"]);
  let lines: LineInput[];
  let discount: DiscountInput;

  if (quoteId) {
    const [quote] = await db.select().from(crmQuotes).where(eq(crmQuotes.id, quoteId)).limit(1);
    if (!quote) { res.status(404).json({ error: "That quote does not exist." }); return; }
    if (quote.status !== "accepted") {
      res.status(409).json({
        error: `That quote is "${quote.status}". An invoice is raised from an ACCEPTED quote — otherwise the business is billing for something the customer has not agreed to.`,
      });
      return;
    }
    const quoteLines = await db.select().from(crmQuoteLineItems)
      .where(eq(crmQuoteLineItems.quoteId, quoteId)).orderBy(asc(crmQuoteLineItems.position));

    leadId = quote.leadId;
    dealId = dealId ?? quote.acceptedDealId ?? quote.dealId ?? undefined;
    title = title || quote.title;
    lines = quoteLines.map((l) => ({
      description: l.description,
      quantityHundredths: storedMoneyMinor(l.quantity),
      unitPriceMinor: storedMoneyMinor(l.unitPrice),
    }));
    discount = discountFromColumns(quote.discountType, quote.discountValue);
  } else {
    const parsedLines = parseLineItems(b["lineItems"] ?? []);
    if ("error" in parsedLines) { res.status(400).json({ error: parsedLines.error }); return; }
    const parsedDiscount = parseDiscount(b["discountType"], b["discountValue"]);
    if ("error" in parsedDiscount) { res.status(400).json({ error: parsedDiscount.error }); return; }
    lines = parsedLines.lines;
    discount = parsedDiscount;
  }

  if (title.length < 2 || title.length > 200) {
    res.status(400).json({ error: "Give the invoice a title (2–200 characters)." }); return;
  }

  if (dealId) {
    const deal = await loadDeal(dealId);
    if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
    if (!leadId) leadId = deal.leadId ?? undefined;
    if (deal.leadId != null && leadId != null && deal.leadId !== leadId) {
      res.status(409).json({ error: "That deal belongs to a different contact." }); return;
    }
  }
  if (!leadId) { res.status(400).json({ error: "Say which contact this invoice is for." }); return; }
  const contact = await loadContact(leadId);
  if (!contact) { res.status(404).json({ error: "That contact does not exist." }); return; }

  const totals = computeTotals(lines, discount);
  if (totals.subtotalMinor > MAX_MONEY_MINOR) {
    res.status(400).json({ error: `That comes to more than ${formatMoneyMinor(MAX_MONEY_MINOR)}, which this system cannot record.` });
    return;
  }

  const dueDate = parseDate(b["dueDate"]);
  if (dueDate === undefined && b["dueDate"] !== undefined && b["dueDate"] !== "") {
    res.status(400).json({ error: "Invalid due date." }); return;
  }

  const me = actor(req);
  const [invoice] = await db.insert(crmInvoices).values({
    leadId,
    dealId: dealId ?? null,
    quoteId: quoteId ?? null,
    title,
    status: "draft",
    ...discountColumns(discount),
    subtotal: formatMoneyMinor(totals.subtotalMinor),
    discountAmount: formatMoneyMinor(totals.discountAmountMinor),
    total: formatMoneyMinor(totals.totalMinor),
    amountPaid: "0.00",
    notes: str(b["notes"]) || null,
    internalNotes: str(b["internalNotes"]) || null,
    dueDate: dueDate ?? null,
    createdByStaffId: me.id,
    createdByLabel: me.label,
  }).returning();

  if (totals.lines.length) {
    await db.insert(crmInvoiceLineItems).values(totals.lines.map((l) => ({
      invoiceId: invoice.id,
      position: l.position,
      description: l.description,
      quantity: formatMoneyMinor(l.quantityHundredths),
      unitPrice: formatMoneyMinor(l.unitPriceMinor),
      lineTotal: formatMoneyMinor(l.lineTotalMinor),
    })));
  }

  await auditAction(req, "invoice.created",
    `invoice:${invoice.id} lead:${leadId}${quoteId ? ` quote:${quoteId}` : ""} ${formatMoneyMinor(totals.totalMinor)}`);

  const created = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, invoice.id)).orderBy(asc(crmInvoiceLineItems.position));
  res.status(201).json({ invoice: publicInvoice(invoice, created), fromQuoteId: quoteId ?? null });
});

/** Edits a DRAFT invoice only, for the same reason a sent quote is frozen. */
router.patch("/crm/invoices/:id", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not found." }); return; }
  if (invoice.status !== "draft") {
    res.status(409).json({
      error: `This invoice is "${invoice.status}". Only a draft can be edited — an issued invoice is what the customer was asked to pay. Void it and raise another.`,
    });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if ("title" in b) {
    const title = str(b["title"]);
    if (title.length < 2 || title.length > 200) {
      res.status(400).json({ error: "Give the invoice a title (2–200 characters)." }); return;
    }
    updates["title"] = title;
  }
  if ("notes" in b) updates["notes"] = str(b["notes"]) || null;
  if ("internalNotes" in b) updates["internalNotes"] = str(b["internalNotes"]) || null;
  if ("dueDate" in b) {
    const d = parseDate(b["dueDate"]);
    if (d === undefined) { res.status(400).json({ error: "Invalid due date." }); return; }
    updates["dueDate"] = d;
  }
  if ("dealId" in b) {
    const dealId = num(b["dealId"]);
    if (dealId) {
      const deal = await loadDeal(dealId);
      if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
      if (deal.leadId != null && deal.leadId !== invoice.leadId) {
        res.status(409).json({ error: "That deal belongs to a different contact." }); return;
      }
      updates["dealId"] = dealId;
    } else {
      updates["dealId"] = null;
    }
  }

  const linesChanged = "lineItems" in b;
  const discountChanged = "discountType" in b || "discountValue" in b;
  if (linesChanged || discountChanged) {
    const existing = await db.select().from(crmInvoiceLineItems)
      .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));

    const parsedLines = linesChanged
      ? parseLineItems(b["lineItems"])
      : {
          lines: existing.map((l) => ({
            description: l.description,
            quantityHundredths: storedMoneyMinor(l.quantity),
            unitPriceMinor: storedMoneyMinor(l.unitPrice),
          })),
        };
    if ("error" in parsedLines) { res.status(400).json({ error: parsedLines.error }); return; }

    const discount = discountChanged
      ? parseDiscount(b["discountType"] ?? invoice.discountType, b["discountValue"] ?? invoice.discountValue)
      : discountFromColumns(invoice.discountType, invoice.discountValue);
    if ("error" in discount) { res.status(400).json({ error: discount.error }); return; }

    const totals = computeTotals(parsedLines.lines, discount);
    if (totals.subtotalMinor > MAX_MONEY_MINOR) {
      res.status(400).json({ error: `That comes to more than ${formatMoneyMinor(MAX_MONEY_MINOR)}, which this system cannot record.` });
      return;
    }

    if (linesChanged) {
      await db.delete(crmInvoiceLineItems).where(eq(crmInvoiceLineItems.invoiceId, id));
      if (totals.lines.length) {
        await db.insert(crmInvoiceLineItems).values(totals.lines.map((l) => ({
          invoiceId: id,
          position: l.position,
          description: l.description,
          quantity: formatMoneyMinor(l.quantityHundredths),
          unitPrice: formatMoneyMinor(l.unitPriceMinor),
          lineTotal: formatMoneyMinor(l.lineTotalMinor),
        })));
      }
    }

    Object.assign(updates, discountColumns(discount), {
      subtotal: formatMoneyMinor(totals.subtotalMinor),
      discountAmount: formatMoneyMinor(totals.discountAmountMinor),
      total: formatMoneyMinor(totals.totalMinor),
    });
  }

  const [updated] = await db.update(crmInvoices).set(updates)
    .where(eq(crmInvoices.id, id)).returning();
  const lines = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));
  res.json({ invoice: publicInvoice(updated, lines) });
});

/** draft → issued. Renders the document and makes it visible in the portal. */
router.post("/crm/invoices/:id/issue", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not found." }); return; }

  if (!canTransitionInvoice(invoice.status as CrmInvoiceStatus, "issued")) {
    res.status(409).json({
      error: `An invoice at "${invoice.status}" cannot be issued.`,
      allowedNextStatuses: CRM_INVOICE_TRANSITIONS[invoice.status as CrmInvoiceStatus] ?? [],
    });
    return;
  }

  const lines = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));
  if (lines.length === 0) {
    res.status(409).json({ error: "This invoice has no line items, so there is nothing to charge for." });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const suppliedDue = parseDate(b["dueDate"]);
  if (suppliedDue === undefined && b["dueDate"] !== undefined && b["dueDate"] !== "") {
    res.status(400).json({ error: "Invalid due date." }); return;
  }
  const dueDate = suppliedDue ?? invoice.dueDate;
  if (!dueDate) {
    // An invoice with no due date cannot be chased and cannot be overdue, so
    // "outstanding" would be a figure nobody can act on.
    res.status(400).json({ error: "An issued invoice needs a due date, so it can be chased when it passes." });
    return;
  }

  const contact = await loadContact(invoice.leadId);
  if (!contact) { res.status(404).json({ error: "That contact no longer exists." }); return; }
  const deal = invoice.dealId ? await loadDeal(invoice.dealId) : undefined;

  const me = actor(req);
  const now = new Date();
  const body = renderDocument({
    kind: "Invoice",
    reference: invoiceReference(invoice.id),
    title: invoice.title,
    currency: invoice.currency,
    contact: { name: contact.name, company: contact.company, email: contact.email },
    dealName: deal?.name ?? null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    subtotal: invoice.subtotal,
    discountLabel: invoice.discountType === "percent"
      ? `Discount ${invoice.discountValue}%`
      : invoice.discountType === "amount" ? "Discount" : null,
    discountAmount: invoice.discountAmount,
    total: invoice.total,
    notes: invoice.notes,
    dates: [
      ["Issued", now.toISOString().slice(0, 10)],
      ["Due", dueDate.toISOString().slice(0, 10)],
    ],
    closing: [
      `Payable by ${dueDate.toISOString().slice(0, 10)}.`,
      "Payments recorded against this invoice appear in your client area under",
      "Payments, with the date each one arrived.",
    ],
  });

  const attachmentId = await materialiseDocument({
    leadId: invoice.leadId,
    filename: `Invoice-${invoiceReference(invoice.id)}.txt`,
    body,
    actorId: me.id,
    actorLabel: me.label,
  });

  const [updated] = await db.update(crmInvoices).set({
    status: "issued",
    issuedAt: now,
    dueDate,
    documentAttachmentId: attachmentId,
    updatedAt: now,
  }).where(and(eq(crmInvoices.id, id), eq(crmInvoices.status, "draft"))).returning();
  if (!updated) { res.status(409).json({ error: "That invoice is no longer a draft." }); return; }

  await db.insert(crmActivities).values({
    leadId: updated.leadId,
    type: "invoice_issued",
    title: `Invoice ${invoiceReference(updated.id)} issued: ${updated.title}`,
    description: `${updated.currency} ${updated.total}, due ${dueDate.toISOString().slice(0, 10)}`,
    createdBy: me.label,
  });

  await auditAction(req, "invoice.issued", `invoice:${id} attachment:${attachmentId}`);
  res.json({
    invoice: publicInvoice(updated, lines),
    documentAttachmentId: attachmentId,
    note: "The invoice is now visible in the customer's portal. Nothing was emailed — send that from Communications.",
  });
});

/**
 * Records money against an invoice.
 *
 * This is the reconciliation point. It writes a `crm_transactions` row with
 * `TRANSACTION_RECEIVED_STATUS`, which is what the Command Center's money
 * panel, the sales forecast, the per-contact chain and the portal's "paid to
 * date" all sum — so an invoice payment is visible in every one of them
 * without any of them knowing invoices exist. `crm_invoices.amount_paid` is
 * then recomputed FROM those rows rather than incremented, so it cannot drift
 * away from the money the business actually reports.
 */
router.post("/crm/invoices/:id/payments", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not found." }); return; }

  if (!["issued", "part_paid"].includes(invoice.status)) {
    res.status(409).json({
      error: invoice.status === "draft"
        ? "This invoice has not been issued yet, so nobody has been asked to pay it."
        : `This invoice is "${invoice.status}", so no further payment can be recorded against it.`,
      allowedNextStatuses: CRM_INVOICE_TRANSITIONS[invoice.status as CrmInvoiceStatus] ?? [],
    });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const amountMinor = parseMoneyMinor(b["amount"]);
  if (amountMinor === null || amountMinor <= 0) {
    res.status(400).json({ error: "The amount must be a positive figure like 1250.00." }); return;
  }

  const method = str(b["method"]);
  if (!MANUAL_METHODS.includes(method as (typeof MANUAL_METHODS)[number])) {
    res.status(400).json({ error: `The method must be one of: ${MANUAL_METHODS.join(", ")}.` }); return;
  }

  const totalMinor = storedMoneyMinor(invoice.total);
  const paidMinor = storedMoneyMinor(invoice.amountPaid);
  const outstandingMinor = totalMinor - paidMinor;
  if (amountMinor > outstandingMinor) {
    // A figure larger than the balance is a typo far more often than it is a
    // gift, and recording it would overstate money received on four surfaces.
    res.status(409).json({
      error: `That is more than the ${invoice.currency} ${formatMoneyMinor(outstandingMinor)} still outstanding on this invoice.`,
      outstanding: Number(formatMoneyMinor(outstandingMinor)),
    });
    return;
  }

  // `crm_transactions.deal_id` is NOT NULL and that column is not ours to
  // change, so a payment needs a deal. Taking one here lets a standalone
  // invoice be settled without editing it first, and refusing outright beats
  // inventing a placeholder deal that would then inflate the pipeline.
  const dealId = invoice.dealId ?? num(b["dealId"]);
  if (!dealId) {
    res.status(409).json({
      error: "This invoice is not linked to a deal. Payments are recorded against a deal so they appear in the business's money figures — name a deal and try again.",
      needsDeal: true,
    });
    return;
  }
  const deal = await loadDeal(dealId);
  if (!deal) { res.status(404).json({ error: "That deal does not exist." }); return; }
  if (deal.leadId != null && deal.leadId !== invoice.leadId) {
    res.status(409).json({ error: "That deal belongs to a different contact." }); return;
  }

  const receivedAt = parseDate(b["receivedAt"]);
  if (receivedAt === undefined && b["receivedAt"] !== undefined && b["receivedAt"] !== "") {
    res.status(400).json({ error: "Invalid payment date." }); return;
  }

  const me = actor(req);
  const [transaction] = await db.insert(crmTransactions).values({
    dealId,
    leadId: invoice.leadId,
    invoiceId: invoice.id,
    amount: formatMoneyMinor(amountMinor),
    method,
    // The one status that means the money is in the bank, imported rather than
    // spelled out — the reason TRANSACTION_RECEIVED_STATUS exists at all.
    status: TRANSACTION_RECEIVED_STATUS,
    receivedAt: receivedAt ?? new Date(),
    notes: str(b["notes"]) || `Payment against ${invoiceReference(invoice.id)}`,
  }).returning();

  // Recomputed from the transactions, never incremented from the previous
  // cached value: the transactions are the money, this column is a convenience.
  const [settled] = await db.select({
    total: sql<string>`coalesce(sum(${crmTransactions.amount}), 0)`,
  }).from(crmTransactions).where(and(
    eq(crmTransactions.invoiceId, invoice.id),
    eq(crmTransactions.status, TRANSACTION_RECEIVED_STATUS),
  ));
  const nowPaidMinor = storedMoneyMinor(String(settled?.total ?? "0"));

  const nextStatus: CrmInvoiceStatus = nowPaidMinor >= totalMinor ? "paid" : "part_paid";
  const current = invoice.status as CrmInvoiceStatus;
  // Moving from part_paid to part_paid is not a transition; everything else
  // goes through the same declared machine as any staff-driven change.
  if (nextStatus !== current && !canTransitionInvoice(current, nextStatus)) {
    res.status(409).json({ error: `An invoice at "${current}" cannot become "${nextStatus}".` });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(crmInvoices).set({
    amountPaid: formatMoneyMinor(nowPaidMinor),
    status: nextStatus,
    paidAt: nextStatus === "paid" ? now : null,
    // A deal named at payment time is kept, so a standalone invoice is asked
    // for one once rather than on every instalment — and so the invoice and
    // the transaction it produced do not disagree about which deal this was.
    dealId,
    updatedAt: now,
  }).where(eq(crmInvoices.id, id)).returning();

  await db.insert(crmActivities).values({
    leadId: invoice.leadId,
    type: "payment_received",
    title: `Payment on ${invoiceReference(invoice.id)}: ${invoice.currency} ${formatMoneyMinor(amountMinor)}`,
    description: `${method.replace(/^manual_/, "")} — ${invoice.currency} ${formatMoneyMinor(nowPaidMinor)} of ${invoice.currency} ${invoice.total} received`,
    createdBy: me.label,
  });

  await auditAction(req, "invoice.payment_recorded",
    `invoice:${id} transaction:${transaction.id} ${formatMoneyMinor(amountMinor)}`);

  const lines = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));
  res.status(201).json({
    invoice: publicInvoice(updated, lines),
    transactionId: transaction.id,
    note: `Recorded in crm_transactions as '${TRANSACTION_RECEIVED_STATUS}', so it counts in every money figure the CRM reports.`,
  });
});

router.post("/crm/invoices/:id/void", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [invoice] = await db.select().from(crmInvoices).where(eq(crmInvoices.id, id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Not found." }); return; }

  const current = invoice.status as CrmInvoiceStatus;
  if (!canTransitionInvoice(current, "void")) {
    res.status(409).json({
      error: storedMoneyMinor(invoice.amountPaid) > 0
        ? `This invoice has ${invoice.currency} ${invoice.amountPaid} recorded against it. Voiding it would leave that payment pointing at a document the business says never existed — refunding is a different act with its own record.`
        : `An invoice at "${current}" cannot be voided.`,
      allowedNextStatuses: CRM_INVOICE_TRANSITIONS[current] ?? [],
    });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(crmInvoices).set({
    status: "void",
    voidedAt: now,
    voidReason: str((req.body as Record<string, unknown>)["reason"]) || null,
    updatedAt: now,
  }).where(and(eq(crmInvoices.id, id), eq(crmInvoices.status, current))).returning();
  if (!updated) { res.status(409).json({ error: "That invoice has already moved on." }); return; }

  await auditAction(req, "invoice.voided", `invoice:${id}`);
  const lines = await db.select().from(crmInvoiceLineItems)
    .where(eq(crmInvoiceLineItems.invoiceId, id)).orderBy(asc(crmInvoiceLineItems.position));
  res.json({ invoice: publicInvoice(updated, lines) });
});

export default router;
