import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { RefreshCw, Receipt, Filter } from "lucide-react";
import { type Load, readAdminResource } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";

interface Transaction {
  id: number;
  dealId: number;
  dealName?: string | null;
  dealStage?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  leadId: number | null;
  amount: string;
  method: string;
  status: string;
  stripePaymentIntentId: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/** The money behind the whole filtered set, as the server totalled it. */
interface Totals { received: number; pending: number; basis: string }

/** One server page of payments: the rows, how many match, and the money. */
interface TransactionPage {
  transactions: Transaction[];
  total: number;
  /** Null only when the server did not send them — never a zero standing in. */
  totals: Totals | null;
}

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  refunded:  "bg-muted text-muted-foreground border-border",
};

const METHOD_LABEL: Record<string, string> = {
  stripe: "Stripe",
  manual_cash: "Cash",
  manual_check: "Check",
  manual_transfer: "Transfer",
  manual_other: "Other",
};

function fmtMoney(n: string | number) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pickTotals(value: unknown): Totals | null {
  if (!value || typeof value !== "object") return null;
  const t = value as { received?: unknown; pending?: unknown; basis?: unknown };
  if (typeof t.received !== "number" || typeof t.pending !== "number") return null;
  return { received: t.received, pending: t.pending, basis: typeof t.basis === "string" ? t.basis : "" };
}

/**
 * A body that is not the shape this page expects is a failure too — not a
 * reason to show an empty payment history. The row count is required for the
 * same reason: "of 0" is a claim about the business, and nobody checked it.
 */
function pickPage(body: unknown): TransactionPage | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { transactions?: unknown; total?: unknown; totals?: unknown };
  if (!Array.isArray(b.transactions)) return undefined;
  if (typeof b.total !== "number") return undefined;
  return {
    transactions: b.transactions as Transaction[],
    total: b.total,
    totals: pickTotals(b.totals),
  };
}

const PAGE_SIZE = 50;

export default function CrmTransactionsPage() {
  const [, navigate] = useLocation();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Load<TransactionPage>>({ status: "loading" });
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // One request, filtered and paged on the server. This used to fetch every
  // deal and then issue a request per deal — a fan-out that grew with the
  // business and re-sorted the whole payment history in the browser.
  //
  // The answer is a `Load`, so a refusal is a stated failure. It used to return
  // early on a 401 and swallow every other error into a banner, then fall
  // through to the empty state underneath it: a signed-out operator was shown
  // "No transactions found" and a footer reading "No transactions" about a
  // payment history nobody had managed to read.
  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    // Back to a skeleton first: the rows on screen answer the previous query,
    // and the footer beside them would describe this one.
    setPage({ status: "loading" });
    setPage(await readAdminResource(`/api/crm/transactions?${params}`, pickPage));
  }, [offset, statusFilter, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOffset(0); }, [statusFilter, fromDate, toDate]);

  // What actually loaded, or null. Never an empty page standing in for a
  // request nobody managed to complete.
  const data = page.status === "ready" ? page.data : null;
  // Filtering and paging happen on the server; this is the current page.
  const filtered = data?.transactions ?? [];
  const loading = page.status === "loading";

  const STATUSES = ["completed", "pending", "failed", "refunded"];

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-bold font-serif text-foreground leading-tight">Transactions</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              All payments recorded against deals — manual and Stripe.
            </p>
          </div>
          <button
            onClick={() => { void load(); }}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setStatusFilter("")}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${!statusFilter ? "bg-[#1e293b] text-white" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              All
            </button>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  statusFilter === s ? `${STATUS_BADGE[s]} shadow-sm` : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              aria-label="From date"
              className="px-2 py-1 border border-input rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              aria-label="To date"
              className="px-2 py-1 border border-input rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Loading transactions…</span>
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
          </div>
        ) : page.status === "error" ? (
          /* The failure is the whole answer here. An empty table and a "$0.00"
             received figure underneath it would say the business has taken no
             money, which is a different thing entirely from "we could not ask". */
          <LoadFailure
            what="Transactions"
            reason={page.reason}
            onRetry={() => { void load(); }}
          >
            <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
              No payment, total or count is listed while this is unavailable — there may well be
              payments recorded.
            </p>
          </LoadFailure>
        ) : filtered.length === 0 ? (
          <div className="bg-muted border border-border rounded-xl p-8 text-center">
            <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">No transactions found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Record a payment from a deal in the Pipeline to see it here.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-muted border-b border-border/60">
                  {["Deal", "Contact", "Amount", "Method", "Status", "Received", "Notes"].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const deal = { name: t.dealName, stage: t.dealStage } as { name: string|null; stage: string|null };
                  return (
                    <tr key={t.id} className="border-b border-border/40 last:border-0 hover:bg-accent/60">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => navigate("/admin/crm/deals")}
                          className="font-medium text-foreground hover:underline text-left"
                        >
                          {deal?.name || `Deal #${t.dealId}`}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{t.clientName || t.clientCompany || "—"}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{fmtMoney(t.amount)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{METHOD_LABEL[t.method] || t.method}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[t.status] || "bg-muted text-muted-foreground border-border"}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {t.status === "completed" ? fmtDate(t.receivedAt) : "pending"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">{t.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals cover the whole filtered set, not this page — a page-only
            sum would be a different and misleading number, so the basis is
            stated rather than left to be assumed. They are shown only when the
            page they describe actually loaded. */}
        {data?.totals && (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs">
            <span className="text-foreground">
              Received <strong className="tabular-nums">{fmtMoney(data.totals.received)}</strong>
            </span>
            <span className="text-muted-foreground">
              Pending <strong className="tabular-nums">{fmtMoney(data.totals.pending)}</strong>
            </span>
            <span className="text-[10px] text-muted-foreground">{data.totals.basis}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* "No transactions" is a fact about the business, so it is only ever
              said about a page that arrived. Otherwise the position is unknown
              and says so. */}
          <p className="text-[10px] text-muted-foreground tabular-nums min-w-0 break-words">
            {data ? (
              <>
                {data.total === 0
                  ? "No transactions"
                  : `Showing ${offset + 1}–${Math.min(offset + filtered.length, data.total)} of ${data.total}`}
              </>
            ) : (
              <>
                Showing <Figure value={null} loading={loading} /> of{" "}
                <Figure value={null} loading={loading} />
              </>
            )}
            {statusFilter ? ` with status "${statusFilter}"` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
              disabled={offset === 0 || !data}
              className="text-xs border border-input rounded-lg px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!data || offset + filtered.length >= data.total}
              className="text-xs border border-input rounded-lg px-3 py-1.5 hover:bg-accent transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
