// ── M4: what the client has paid ────────────────────────────────────────────
//
// "Payments", not "Invoices with a balance". The CRM records money received;
// it does not hold an accounts-receivable ledger, so a total labelled
// "outstanding" would be a number nobody computed. Two figures, each saying
// what it means.
//
// The table is the one wide thing in the portal, so it scrolls inside its own
// container at 375px — the page body never scrolls sideways.

import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";

interface Payment {
  id: number; amount: number; method: string; status: string;
  settled: boolean; receivedAt: string | null; createdAt: string;
  forDeal: string | null;
}
interface Invoices {
  payments: Payment[];
  totals: { paidToDate: number; pending: number };
  definitions: { paidToDate: string; pending: string };
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const methodLabel = (m: string) => m.replace(/^manual_/, "").replace(/_/g, " ");

export default function PortalInvoices() {
  const { state, reload } = usePortalResource<Invoices>("/api/portal/invoices");

  return (
    <PortalShell title="Payments">
      {state.status === "loading" && <PortalLoadingState label="Loading your payments…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PortalCard>
              <p className="text-sm text-muted-foreground">Paid to date</p>
              <p className="mt-1 text-2xl font-semibold">{money(state.data.totals.paidToDate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.data.definitions.paidToDate}</p>
            </PortalCard>
            <PortalCard>
              <p className="text-sm text-muted-foreground">Started, not yet settled</p>
              <p className="mt-1 text-2xl font-semibold">{money(state.data.totals.pending)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{state.data.definitions.pending}</p>
            </PortalCard>
          </div>

          {state.data.payments.length === 0 ? (
            <PortalEmptyState
              title="No payments recorded yet"
              detail="Every payment we receive from you is listed here with its date."
            />
          ) : (
            <PortalCard className="p-0 sm:p-0">
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
                    {state.data.payments.map((p) => (
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
        </>
      )}
    </PortalShell>
  );
}
