// ── M4/M5: what the client has been invoiced, and what they have paid ───────
//
// Before M5 this page was "Payments" and nothing else, because the CRM recorded
// money received and held no accounts-receivable ledger — a total labelled
// "outstanding" would have been a number nobody computed. Invoices exist now,
// so the figure is real: it is the sum of what was actually issued, less what
// has arrived against it. Drafts are never sent here at all, so nothing on this
// page is a figure still being argued about internally.
//
// Both tables are the wide things in the portal, so each scrolls inside its own
// container at 375px — the page body never scrolls sideways.

import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";

interface Payment {
  id: number; amount: number; method: string; status: string;
  settled: boolean; receivedAt: string | null; createdAt: string;
  forDeal: string | null;
}

interface InvoiceLine {
  id: number; description: string; quantity: number; unitPrice: number; lineTotal: number;
}

interface Invoice {
  id: number;
  reference: string;
  title: string;
  status: "issued" | "part_paid" | "paid" | "void";
  currency: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  amountOutstanding: number;
  notes: string | null;
  issuedAt: string | null;
  dueDate: string | null;
  paidAt: string | null;
  overdue: boolean;
  lineItems: InvoiceLine[];
}

interface Payload {
  invoices?: Invoice[];
  payments: Payment[];
  totals: { paidToDate: number; pending: number; outstanding?: number; overdue?: number };
  definitions: { paidToDate: string; pending: string; outstanding?: string; overdue?: string };
}

const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const methodLabel = (m: string) => m.replace(/^manual_/, "").replace(/_/g, " ");

const STATUS_LABEL: Record<string, string> = {
  issued: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid",
  void: "Cancelled",
};

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <PortalCard>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-medium">
            <span className="text-muted-foreground">{invoice.reference}</span> {invoice.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {invoice.issuedAt ? `Issued ${when(invoice.issuedAt)}` : "Issued"}
            {invoice.dueDate && (
              <span className={invoice.overdue ? " font-medium text-red-700 dark:text-red-400" : ""}>
                {" · "}due {when(invoice.dueDate)}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-lg font-semibold">{money(invoice.total, invoice.currency)}</p>
          <span className={`mt-1 inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
            invoice.status === "paid"
              ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
              : invoice.overdue
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-muted text-muted-foreground"
          }`}>
            {invoice.overdue ? "Overdue" : STATUS_LABEL[invoice.status] ?? invoice.status}
          </span>
        </div>
      </div>

      {invoice.lineItems.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">What {invoice.reference} is made up of</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Qty</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Each</th>
                <th scope="col" className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line) => (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{line.description}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">{line.quantity}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">{money(line.unitPrice, invoice.currency)}</td>
                  <td className="whitespace-nowrap py-2 text-right font-medium">{money(line.lineTotal, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoice.status !== "void" && invoice.amountPaid > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {money(invoice.amountPaid, invoice.currency)} received
          {invoice.amountOutstanding > 0 && <> · {money(invoice.amountOutstanding, invoice.currency)} still due</>}
          {invoice.paidAt && <> · settled {when(invoice.paidAt)}</>}
        </p>
      )}
      {invoice.notes && (
        <p className="mt-2 break-words text-sm text-muted-foreground">{invoice.notes}</p>
      )}
    </PortalCard>
  );
}

export default function PortalInvoices() {
  const { state, reload } = usePortalResource<Payload>("/api/portal/invoices");

  return (
    <PortalShell title="Invoices">
      {state.status === "loading" && <PortalLoadingState label="Loading your invoices…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (() => {
        const invoices = state.data.invoices ?? [];
        const { payments, totals, definitions } = state.data;
        return (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PortalCard>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.outstanding ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {definitions.outstanding
                    ?? "Invoices we have issued to you, less what has arrived against them."}
                </p>
                {(totals.overdue ?? 0) > 0 && (
                  <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">
                    {money(totals.overdue ?? 0)} of that is past its due date.
                  </p>
                )}
              </PortalCard>
              <PortalCard>
                <p className="text-sm text-muted-foreground">Paid to date</p>
                <p className="mt-1 text-2xl font-semibold">{money(totals.paidToDate)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{definitions.paidToDate}</p>
              </PortalCard>
            </div>

            <section aria-labelledby="invoices-heading">
              <h2 id="invoices-heading" className="text-sm font-semibold text-muted-foreground">
                Invoices
              </h2>
              {invoices.length === 0 ? (
                <div className="mt-2">
                  <PortalEmptyState
                    title="No invoices yet"
                    detail="Every invoice we issue appears here, with what it is made up of and when it is due."
                  />
                </div>
              ) : (
                <ul className="mt-2 space-y-3">
                  {invoices.map((invoice) => (
                    <li key={invoice.id}><InvoiceCard invoice={invoice} /></li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="payments-heading">
              <h2 id="payments-heading" className="text-sm font-semibold text-muted-foreground">
                Payments received
              </h2>
              {payments.length === 0 ? (
                <div className="mt-2">
                  <PortalEmptyState
                    title="No payments recorded yet"
                    detail="Every payment we receive from you is listed here with its date."
                  />
                </div>
              ) : (
                <PortalCard className="mt-2 p-0 sm:p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm">
                      <caption className="sr-only">Payments received from you</caption>
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th scope="col" className="px-4 py-3 font-medium">Date</th>
                          <th scope="col" className="px-4 py-3 font-medium">For</th>
                          <th scope="col" className="px-4 py-3 font-medium">Method</th>
                          <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                          <th scope="col" className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="whitespace-nowrap px-4 py-3">{when(p.receivedAt ?? p.createdAt)}</td>
                            <td className="px-4 py-3">{p.forDeal ?? "—"}</td>
                            <td className="whitespace-nowrap px-4 py-3 capitalize">{methodLabel(p.method)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{money(p.amount)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                                p.settled
                                  ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                {p.settled ? "Received" : p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PortalCard>
              )}
              {totals.pending > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {money(totals.pending)} {definitions.pending.charAt(0).toLowerCase() + definitions.pending.slice(1)}
                </p>
              )}
            </section>
          </>
        );
      })()}
    </PortalShell>
  );
}
