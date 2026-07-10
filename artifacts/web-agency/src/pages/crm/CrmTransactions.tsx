import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { RefreshCw, AlertCircle, Receipt, Filter } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Transaction {
  id: number;
  dealId: number;
  leadId: number | null;
  amount: string;
  method: string;
  status: string;
  stripePaymentIntentId: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Deal { id: number; name: string; leadName?: string | null; }

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  refunded:  "bg-gray-100 text-gray-600 border-gray-200",
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

export default function CrmTransactionsPage() {
  const [, navigate] = useLocation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    setError("");
    try {
      const dealsRes = await fetch("/api/crm/deals", { headers: { Authorization: `Bearer ${token()}` } });
      if (dealsRes.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
      const dealsData = await dealsRes.json() as { deals: Deal[] };
      const dealList = dealsData.deals || [];
      setDeals(dealList);

      const all = await Promise.all(dealList.map(async d => {
        const r = await fetch(`/api/crm/deals/${d.id}/transactions`, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return [] as Transaction[];
        const data = await r.json() as { transactions: Transaction[] };
        return data.transactions || [];
      }));
      const merged = all.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTxns(merged);
    } catch {
      setError("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const dealById = (id: number) => deals.find(d => d.id === id);

  const filtered = txns.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    const dateRef = t.receivedAt || t.createdAt;
    if (fromDate && new Date(dateRef) < new Date(fromDate)) return false;
    if (toDate && new Date(dateRef) > new Date(`${toDate}T23:59:59`)) return false;
    return true;
  });

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
            onClick={load}
            className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setStatusFilter("")}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${!statusFilter ? "bg-[#1e293b] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              All
            </button>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  statusFilter === s ? `${STATUS_BADGE[s]} shadow-sm` : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">No transactions found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Record a payment from a deal in the Pipeline to see it here.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["Deal", "Contact", "Amount", "Method", "Status", "Received", "Notes"].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const deal = dealById(t.dealId);
                  return (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => navigate("/admin/crm/deals")}
                          className="font-medium text-foreground hover:underline text-left"
                        >
                          {deal?.name || `Deal #${t.dealId}`}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{deal?.leadName || "—"}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{fmtMoney(t.amount)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{METHOD_LABEL[t.method] || t.method}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[t.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
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

        <p className="text-[10px] text-muted-foreground text-center">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} {statusFilter ? `with status "${statusFilter}"` : "total"}
        </p>
      </div>
    </CrmLayout>
  );
}
