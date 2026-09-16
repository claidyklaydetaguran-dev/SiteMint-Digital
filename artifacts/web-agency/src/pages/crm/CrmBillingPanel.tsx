import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, FilePlus2, Loader2, Plus, Receipt, Send, Trash2, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, countOf, dataOf } from "@/components/crm/LoadState";

// ── M5: quotes and invoices, on the record you are already looking at ───────
//
// This lives inside the Documents page rather than on a page of its own,
// because a quote IS a document here: sending one renders it into the same
// attachment store the list above shows, and grants the customer sight of it
// through the same portal allowlist every other file uses.
//
// Two rules the UI has to keep visible rather than merely obey:
//
//  1. No figure on this screen is computed here. Every subtotal, discount and
//     total comes back from the server, which recomputes from the line items
//     on every write. The form below deliberately has no "total" field — there
//     is nothing for the user to type that the server would read.
//  2. Accepting is not signing. The word "signed" does not appear on this
//     panel, and an accepted quote is labelled as an agreement in writing.

// ── The live API contract ────────────────────────────────────────────────────

interface LineItem {
  id?: number;
  position?: number;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number;
}

interface Quote {
  id: number;
  reference: string;
  leadId: number;
  dealId: number | null;
  title: string;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  currency: string;
  subtotal: number;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  total: number;
  notes: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
  acceptedDealId: number | null;
  acceptedTypedName: string | null;
  documentAttachmentId: number | null;
  allowedNextStatuses: string[];
  lineItems: Required<LineItem>[];
}

interface Invoice {
  id: number;
  reference: string;
  leadId: number;
  dealId: number | null;
  quoteId: number | null;
  title: string;
  status: "draft" | "issued" | "part_paid" | "paid" | "void";
  currency: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountOutstanding: number;
  dueDate: string | null;
  overdue: boolean;
  documentAttachmentId: number | null;
  allowedNextStatuses: string[];
  canRecordPayment: boolean;
  paymentNeedsDeal: boolean;
  lineItems: Required<LineItem>[];
}

interface DealOption { id: number; name: string; stage: string }

/** `/api/crm/deals` answers with every deal; this contact's are picked out here. */
interface DealRow extends DealOption { leadId: number | null }

// A body that is not the shape this panel expects is a failure too — never a
// reason to report that a client is waiting on nothing and owes nothing.
function pickQuotes(body: unknown): Quote[] | undefined {
  const list = body && typeof body === "object" ? (body as { quotes?: unknown }).quotes : undefined;
  return Array.isArray(list) ? list as Quote[] : undefined;
}

function pickInvoices(body: unknown): Invoice[] | undefined {
  const list = body && typeof body === "object" ? (body as { invoices?: unknown }).invoices : undefined;
  return Array.isArray(list) ? list as Invoice[] : undefined;
}

function pickDeals(body: unknown): DealRow[] | undefined {
  const list = body && typeof body === "object" ? (body as { deals?: unknown }).deals : undefined;
  return Array.isArray(list) ? list as DealRow[] : undefined;
}

const PAYMENT_METHODS = [
  { value: "manual_transfer", label: "Bank transfer" },
  { value: "manual_check", label: "Cheque" },
  { value: "manual_cash", label: "Cash" },
  { value: "manual_other", label: "Other" },
];

const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Status colours by MEANING, not by decoration. Teal is "this went well", amber
 * is "waiting on somebody", red is "this did not happen", and anything neutral
 * uses the semantic tokens so it follows the palette rather than pinning a grey.
 */
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-amber-50 text-amber-800 border-amber-200",
  issued: "bg-amber-50 text-amber-800 border-amber-200",
  part_paid: "bg-amber-50 text-amber-800 border-amber-200",
  accepted: "bg-teal-50 text-teal-800 border-teal-200",
  paid: "bg-teal-50 text-teal-800 border-teal-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  void: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "draft", sent: "sent", accepted: "accepted", declined: "declined",
  expired: "expired", issued: "issued", part_paid: "part paid", paid: "paid", void: "void",
};

const FIELD =
  "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-teal-500";
const LABEL =
  "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";
const GHOST_BUTTON =
  "px-2 py-1 text-[11px] border border-border rounded hover:bg-accent transition-colors disabled:opacity-50";
const PRIMARY_BUTTON =
  "px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50";

const blankLine = (): LineItem => ({ description: "", quantity: "1", unitPrice: "" });

/** Reads a JSON body whether or not the response was an error. */
async function body(res: Response): Promise<Record<string, any>> {
  return res.json().catch(() => ({}));
}

// ── The line-item editor, shared by quotes and invoices ──────────────────────

function LineEditor({
  lines, onChange, disabled,
}: { lines: LineItem[]; onChange: (next: LineItem[]) => void; disabled?: boolean }) {
  function set(index: number, patch: Partial<LineItem>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  return (
    <div className="space-y-2">
      <span className={LABEL}>What is being charged for</span>
      {lines.map((line, index) => (
        <div key={index} className="flex flex-wrap items-start gap-2">
          <input
            aria-label={`Line ${index + 1} description`}
            value={line.description}
            disabled={disabled}
            onChange={e => set(index, { description: e.target.value })}
            placeholder="Design, build, retainer…"
            className={`${FIELD} min-w-0 flex-1 basis-full sm:basis-auto`}
          />
          <input
            aria-label={`Line ${index + 1} quantity`}
            value={String(line.quantity)}
            disabled={disabled}
            inputMode="decimal"
            onChange={e => set(index, { quantity: e.target.value })}
            placeholder="Qty"
            className={`${FIELD} w-20 shrink-0`}
          />
          <input
            aria-label={`Line ${index + 1} unit price`}
            value={String(line.unitPrice)}
            disabled={disabled}
            inputMode="decimal"
            onChange={e => set(index, { unitPrice: e.target.value })}
            placeholder="0.00"
            className={`${FIELD} w-28 shrink-0`}
          />
          <button
            type="button"
            aria-label={`Remove line ${index + 1}`}
            disabled={disabled || lines.length === 1}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
            className="mt-1 shrink-0 p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...lines, blankLine()])}
        className={GHOST_BUTTON}
      >
        <Plus className="w-3 h-3 inline -mt-px" /> Add a line
      </button>
      <p className="text-[11px] text-muted-foreground">
        Totals are worked out by the server from these lines. There is nothing to
        type them into, so the figure on the document is always the one the lines
        add up to.
      </p>
    </div>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────

export default function CrmBillingPanel({
  leadId, subjectLabel, onDocumentsChanged,
}: {
  leadId: number | null;
  subjectLabel: string;
  /** Sending or issuing writes a file, so the Files list above needs a re-read. */
  onDocumentsChanged: () => void;
}) {
  // Three separate answers, each one a `Load`. A failed read used to leave the
  // arrays empty, and the panel then reported "0" waiting on an answer,
  // "$0.00" outstanding and "No quotes for this contact yet" — telling somebody
  // a client owes the business nothing when nobody had managed to ask.
  const [quotes, setQuotes] = useState<Load<Quote[]>>({ status: "loading" });
  const [invoices, setInvoices] = useState<Load<Invoice[]>>({ status: "loading" });
  const [deals, setDeals] = useState<Load<DealRow[]>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<"none" | "quote" | "invoice">("none");
  const [title, setTitle] = useState("");
  const [dealId, setDealId] = useState("");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("manual_transfer");
  const [payDeal, setPayDeal] = useState("");

  // A different contact must never be shown the previous one's money while
  // their own is still in flight.
  useEffect(() => {
    setQuotes({ status: "loading" });
    setInvoices({ status: "loading" });
    setDeals({ status: "loading" });
  }, [leadId]);

  // Each part keeps its own answer: quotes can load while invoices are refused,
  // and the panel names the one that is missing instead of adding up what it
  // happens to hold as though that were everything.
  const load = useCallback(async () => {
    // With no contact chosen there is nothing to ask for, and the panel renders
    // its "pick one on the left" state rather than any figure at all.
    if (!leadId) return;
    setReloading(true);
    const [q, i, d] = await Promise.all([
      readAdminResource(`/api/crm/quotes?leadId=${leadId}`, pickQuotes),
      readAdminResource(`/api/crm/invoices?leadId=${leadId}`, pickInvoices),
      readAdminResource("/api/crm/deals", pickDeals),
    ]);
    setQuotes(q);
    setInvoices(i);
    setDeals(d);
    setReloading(false);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  // What actually loaded, or null. Never an empty list standing in for a
  // request nobody managed to complete.
  const quoteList = dataOf(quotes);
  const invoiceList = dataOf(invoices);
  /** This contact's deals, or null when the deal list never arrived. */
  const dealList = useMemo(() => {
    const all = dataOf(deals);
    return all ? all.filter(deal => deal.leadId === leadId) : null;
  }, [deals, leadId]);

  // Money owed, or nothing at all. "$0.00" for a read that failed is the worst
  // figure on this screen: it says a client is square with the business.
  const outstandingTotal = invoiceList
    ? invoiceList
        .filter(i => i.status === "issued" || i.status === "part_paid")
        .reduce((s, i) => s + i.amountOutstanding, 0)
    : null;
  const awaitingAnswer = quoteList ? quoteList.filter(q => q.status === "sent").length : null;

  function resetForm() {
    setForm("none"); setTitle(""); setDealId(""); setLines([blankLine()]);
    setDiscountType("none"); setDiscountValue(""); setNotes(""); setDueDate("");
  }

  /** One writer for every action, so the error and refresh handling is identical. */
  async function act(
    path: string,
    init: { method: string; payload?: unknown },
    success: string,
    touchesDocuments = false,
  ): Promise<Record<string, any> | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(path, {
        method: init.method,
        ...(init.payload === undefined ? {} : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.payload),
        }),
      });
      if (!res.ok) {
        // The shared wording, which carries the server's own explanation of WHY
        // a transition was refused — "a quote at draft cannot become accepted" —
        // and names the missing grant when a 403 names one. Read before the body
        // below: a response body can only be read once.
        setError(`That did not go through. ${await responseFailureReason(res)}`);
        return null;
      }
      const data = await body(res);
      setNotice(success);
      await load();
      if (touchesDocuments) onDocumentsChanged();
      return data;
    } catch {
      setError(`That did not go through. ${failureReason(null)}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    if (!leadId) return;
    await act("/api/crm/quotes", {
      method: "POST",
      payload: {
        leadId,
        dealId: dealId ? Number(dealId) : undefined,
        title: title.trim(),
        lineItems: lines.filter(l => l.description.trim()),
        discountType,
        discountValue: discountType === "none" ? undefined : discountValue,
        notes: notes.trim() || undefined,
      },
    }, "Quote drafted. Nothing has gone to the client until you send it.");
    resetForm();
  }

  async function createInvoice() {
    if (!leadId) return;
    await act("/api/crm/invoices", {
      method: "POST",
      payload: {
        leadId,
        dealId: dealId ? Number(dealId) : undefined,
        title: title.trim(),
        dueDate: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : undefined,
        lineItems: lines.filter(l => l.description.trim()),
        discountType,
        discountValue: discountType === "none" ? undefined : discountValue,
        notes: notes.trim() || undefined,
      },
    }, "Invoice drafted. Nothing has gone to the client until you issue it.");
    resetForm();
  }

  async function invoiceFromQuote(quote: Quote) {
    const due = window.prompt(
      `Invoice ${quote.reference} for ${money(quote.total, quote.currency)}.\n\n`
      + "Due date (YYYY-MM-DD). An issued invoice needs one so it can be chased.",
      new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    );
    if (!due) return;
    await act("/api/crm/invoices", {
      method: "POST",
      payload: { quoteId: quote.id, dueDate: new Date(`${due}T17:00:00`).toISOString() },
    }, "Invoice drafted from the accepted quote, with its line items carried across.");
  }

  async function recordPayment() {
    if (!payFor) return;
    const done = await act(`/api/crm/invoices/${payFor.id}/payments`, {
      method: "POST",
      payload: {
        amount: payAmount.trim(),
        method: payMethod,
        ...(payDeal ? { dealId: Number(payDeal) } : {}),
      },
    }, "Payment recorded. It now counts in every money figure the CRM reports.");
    if (done) { setPayFor(null); setPayAmount(""); setPayDeal(""); }
  }

  if (!leadId) {
    return (
      <div className="bg-background border border-border rounded-xl px-4 py-8 text-center">
        <p className="text-xs text-muted-foreground">
          Quotes and invoices belong to a contact. Pick one on the left to see theirs.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground truncate flex items-center gap-2">
          <Receipt className="w-4 h-4 text-teal-600" /> Quotes &amp; invoices
        </h2>
        {(quotes.status === "loading" || invoices.status === "loading" || reloading) && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" aria-label="Loading" />
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { resetForm(); setForm("quote"); }} disabled={busy}
            className={GHOST_BUTTON}>
            <FilePlus2 className="w-3 h-3 inline -mt-px" /> New quote
          </button>
          <button onClick={() => { resetForm(); setForm("invoice"); }} disabled={busy}
            className={GHOST_BUTTON}>
            <Receipt className="w-3 h-3 inline -mt-px" /> New invoice
          </button>
        </div>
      </div>

      {/* An action the server refused. A read that failed is stated where the
          missing thing would have been, not here. */}
      {error && (
        <div role="alert" className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss"
            className="shrink-0 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 border-b border-teal-200 bg-teal-50 px-4 py-2">
          <Check className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p className="text-xs text-teal-800 flex-1">{notice}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"
            className="text-teal-700 hover:text-teal-900"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Draft form ──────────────────────────────────────────────────── */}
      {form !== "none" && (
        <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-3">
          <p className="text-xs font-semibold text-foreground">
            New {form} for {subjectLabel}
          </p>
          <label className="block">
            <span className={LABEL}>Title</span>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder={form === "quote" ? "Website rebuild" : "Sprint one"}
              className={`${FIELD} mt-1`} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Deal</span>
              <select value={dealId} onChange={e => setDealId(e.target.value)} className={`${FIELD} mt-1`}>
                <option value="">Not linked yet</option>
                {(dealList ?? []).map(d => <option key={d.id} value={d.id}>{d.name} · {d.stage}</option>)}
              </select>
              {/* An empty picker would say this contact has no deals. Say which it is. */}
              {deals.status === "error" && (
                <span className="mt-1 block min-w-0 break-words text-[11px] text-muted-foreground">
                  Deals could not be loaded, so none can be linked here. {deals.reason} You can still
                  save this and link a deal later.
                </span>
              )}
            </label>
            {form === "invoice" && (
              <label className="block">
                <span className={LABEL}>Due</span>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className={`${FIELD} mt-1`} />
              </label>
            )}
          </div>

          <LineEditor lines={lines} onChange={setLines} disabled={busy} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Discount</span>
              <select value={discountType} onChange={e => setDiscountType(e.target.value)}
                className={`${FIELD} mt-1`}>
                <option value="none">None</option>
                <option value="percent">A percentage</option>
                <option value="amount">A fixed amount</option>
              </select>
            </label>
            {discountType !== "none" && (
              <label className="block">
                <span className={LABEL}>{discountType === "percent" ? "Percent" : "Amount"}</span>
                <input value={discountValue} inputMode="decimal"
                  onChange={e => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percent" ? "10" : "250.00"}
                  className={`${FIELD} mt-1`} />
              </label>
            )}
          </div>

          <label className="block">
            <span className={LABEL}>Note for the client (printed on the document)</span>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Prices hold for 30 days." className={`${FIELD} mt-1`} />
          </label>

          <div className="flex items-center gap-2">
            <button onClick={resetForm} className={GHOST_BUTTON}>Cancel</button>
            <button
              onClick={() => void (form === "quote" ? createQuote() : createInvoice())}
              disabled={busy || title.trim().length < 2 || !lines.some(l => l.description.trim())}
              className={`ml-auto ${PRIMARY_BUTTON}`}
            >
              Save as draft
            </button>
          </div>
        </div>
      )}

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-background px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting on an answer
          </p>
          <p className="text-lg font-bold text-foreground">
            <Figure value={awaitingAnswer} loading={quotes.status === "loading"} />
          </p>
        </div>
        <div className="bg-background px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Outstanding
          </p>
          <p className="text-lg font-bold text-foreground">
            <Figure
              value={outstandingTotal === null ? null : money(outstandingTotal)}
              loading={invoices.status === "loading"}
            />
          </p>
        </div>
      </div>

      {/* ── Quotes ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-border">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Quotes (<Figure value={countOf(quotes)} loading={quotes.status === "loading"} />)
        </h3>
      </div>
      {quotes.status === "error" ? (
        /* Deliberately not the empty state below it: "no quotes yet" is a fact
           about this contact, and this is a fact about the request. */
        <LoadFailure
          what="Quotes"
          reason={quotes.reason}
          onRetry={() => { void load(); }}
          retrying={reloading}
          variant="inline"
          className="px-4 pb-3"
        />
      ) : quoteList === null ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">Loading quotes…</p>
      ) : quoteList.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">No quotes for this contact yet.</p>
      ) : (
        <div className="divide-y divide-border/60 border-t border-border">
          {quoteList.map(q => (
            <div key={q.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground break-words">
                  <span className="text-muted-foreground">{q.reference}</span> · {q.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {money(q.total, q.currency)}
                  {q.discountAmount > 0 && <> · {money(q.subtotal, q.currency)} less {money(q.discountAmount, q.currency)}</>}
                  {" · "}{q.lineItems.length} line{q.lineItems.length === 1 ? "" : "s"}
                  {q.validUntil && <> · valid to {day(q.validUntil)}</>}
                </p>
                {q.acceptedAt && (
                  <p className="text-[11px] text-teal-800 mt-0.5">
                    {/* Never "signed". An agreement in writing is what happened. */}
                    Accepted by customer{q.acceptedTypedName ? ` — ${q.acceptedTypedName}` : ""}, {day(q.acceptedAt)}.
                    Recorded as an agreement in writing, not as a signature.
                  </p>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLE[q.status]}`}>
                {STATUS_LABEL[q.status]}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {q.allowedNextStatuses.includes("sent") && (
                  <button onClick={() => void act(`/api/crm/quotes/${q.id}/send`, { method: "POST", payload: {} },
                    "Sent. The client can see it in their portal — nothing was emailed.", true)}
                    disabled={busy} className={GHOST_BUTTON}>
                    <Send className="w-3 h-3 inline -mt-px" /> Send
                  </button>
                )}
                {q.allowedNextStatuses.includes("accepted") && (
                  <button onClick={() => void act(`/api/crm/quotes/${q.id}/status`,
                    { method: "POST", payload: { status: "accepted", dealId: q.dealId ?? undefined } },
                    "Recorded as accepted. This is an agreement in writing, not a signature.")}
                    disabled={busy} className={GHOST_BUTTON}>
                    Mark accepted
                  </button>
                )}
                {q.allowedNextStatuses.includes("declined") && (
                  <button onClick={() => void act(`/api/crm/quotes/${q.id}/status`,
                    { method: "POST", payload: { status: "declined" } }, "Recorded as declined.")}
                    disabled={busy} className={GHOST_BUTTON}>
                    Declined
                  </button>
                )}
                {q.status === "accepted" && (
                  <button onClick={() => void invoiceFromQuote(q)} disabled={busy} className={GHOST_BUTTON}>
                    Invoice it
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Invoices ────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-border">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Invoices (<Figure value={countOf(invoices)} loading={invoices.status === "loading"} />)
        </h3>
      </div>
      {invoices.status === "error" ? (
        <LoadFailure
          what="Invoices"
          reason={invoices.reason}
          onRetry={() => { void load(); }}
          retrying={reloading}
          variant="inline"
          className="px-4 pb-3"
        >
          <p className="mt-1 min-w-0 break-words text-[11px] text-muted-foreground">
            Nothing outstanding is totalled above while this is unavailable — this contact may well
            owe money.
          </p>
        </LoadFailure>
      ) : invoiceList === null ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">Loading invoices…</p>
      ) : invoiceList.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-muted-foreground">No invoices for this contact yet.</p>
      ) : (
        <div className="divide-y divide-border/60 border-t border-border">
          {invoiceList.map(i => (
            <div key={i.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground break-words">
                  <span className="text-muted-foreground">{i.reference}</span> · {i.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {money(i.total, i.currency)}
                  {i.amountPaid > 0 && <> · {money(i.amountPaid, i.currency)} paid</>}
                  {i.amountOutstanding > 0 && i.status !== "draft" && (
                    <> · {money(i.amountOutstanding, i.currency)} outstanding</>
                  )}
                  {i.dueDate && (
                    <span className={i.overdue ? "text-red-600 font-medium" : ""}> · due {day(i.dueDate)}</span>
                  )}
                </p>
                {i.paymentNeedsDeal && i.canRecordPayment && (
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Not linked to a deal. You will be asked for one when you record a payment,
                    so the money lands where the CRM reports it.
                  </p>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLE[i.status]}`}>
                {i.overdue ? "overdue" : STATUS_LABEL[i.status]}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {i.allowedNextStatuses.includes("issued") && (
                  <button onClick={() => void act(`/api/crm/invoices/${i.id}/issue`, { method: "POST", payload: {} },
                    "Issued. The client can see it in their portal — nothing was emailed.", true)}
                    disabled={busy} className={GHOST_BUTTON}>
                    <Send className="w-3 h-3 inline -mt-px" /> Issue
                  </button>
                )}
                {i.canRecordPayment && (
                  <button onClick={() => {
                    setPayFor(i);
                    setPayAmount(i.amountOutstanding.toFixed(2));
                    setPayDeal(i.dealId ? String(i.dealId) : "");
                  }} disabled={busy} className={GHOST_BUTTON}>
                    Record payment
                  </button>
                )}
                {i.allowedNextStatuses.includes("void") && (
                  <button onClick={() => void act(`/api/crm/invoices/${i.id}/void`,
                    { method: "POST", payload: { reason: "voided from the CRM" } }, "Voided.")}
                    disabled={busy} className={`${GHOST_BUTTON} border-red-200 text-red-700 bg-red-50 hover:bg-red-100`}>
                    Void
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="px-4 py-2.5 border-t border-border text-[11px] text-muted-foreground">
        Sending a quote or issuing an invoice writes it into the files above and lets
        the client see it in their portal. It does not email anybody — send that from
        Communications. An accepted quote is an agreement in writing; no e-signature
        provider is connected, so nothing here is a signed document.
      </p>

      {/* ── Record a payment ────────────────────────────────────────────── */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-0 sm:p-4"
          onClick={() => setPayFor(null)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-xl rounded-t-xl border border-border max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-background flex items-center gap-2 px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground truncate">
                Payment on {payFor.reference}
              </h3>
              <button onClick={() => setPayFor(null)} aria-label="Close"
                className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {money(payFor.amountOutstanding, payFor.currency)} outstanding of{" "}
                {money(payFor.total, payFor.currency)}. More than that is refused rather
                than overstating what the business has been paid.
              </p>
              <label className="block">
                <span className={LABEL}>Amount</span>
                <input value={payAmount} inputMode="decimal"
                  onChange={e => setPayAmount(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="block">
                <span className={LABEL}>How it arrived</span>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className={`${FIELD} mt-1`}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              {payFor.paymentNeedsDeal && (
                <label className="block">
                  <span className={LABEL}>Against which deal</span>
                  <select value={payDeal} onChange={e => setPayDeal(e.target.value)}
                    className={`${FIELD} mt-1`}>
                    <option value="">Choose a deal</option>
                    {(dealList ?? []).map(d => <option key={d.id} value={d.id}>{d.name} · {d.stage}</option>)}
                  </select>
                  {/* Recording the payment needs a deal. An empty picker would
                      read as "this contact has none" and leave the button dead
                      with no reason given for it. */}
                  {deals.status === "error" && (
                    <LoadFailure
                      what="Deals"
                      reason={deals.reason}
                      onRetry={() => { void load(); }}
                      retrying={reloading}
                      variant="inline"
                      className="mt-1"
                    />
                  )}
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Payments are recorded against a deal so they appear in the money
                    figures on the Command Center, the forecast and the client's portal.
                  </span>
                </label>
              )}
              <button onClick={() => void recordPayment()}
                disabled={busy || !payAmount.trim() || (payFor.paymentNeedsDeal && !payDeal)}
                className={`w-full ${PRIMARY_BUTTON}`}>
                Record it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
