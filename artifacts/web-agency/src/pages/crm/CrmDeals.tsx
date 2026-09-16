import { useEffect, useState, useCallback, useRef } from "react";
import { CrmLayout } from "./CrmLayout";
import { Plus, X, Trash2, Edit2, Check, DollarSign, Calendar, User, CreditCard, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";

const TXN_METHODS = [
  { value: "manual_cash", label: "Cash" },
  { value: "manual_check", label: "Check" },
  { value: "manual_transfer", label: "Transfer" },
  { value: "manual_other", label: "Other" },
];

interface Transaction {
  id: number;
  amount: string;
  method: string;
  status: string;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

const STAGES = ["Lead", "Qualified", "Proposal", "Won", "Lost"] as const;
type Stage = typeof STAGES[number];

// Deal stages follow the ops mint ramp (crmTaxonomy.ts): cool mint/ocean
// hues carry progress; amber = action pending; green/red stay semantic.
const STAGE_COLORS: Record<Stage, { bg: string; text: string; border: string; accent: string }> = {
  Lead:      { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",    accent: "#0ea5e9" },
  Qualified: { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",   accent: "#14b8a6" },
  Proposal:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",  accent: "#f59e0b" },
  Won:       { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",accent: "#10b981" },
  Lost:      { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",    accent: "#ef4444" },
};

function fmt(n: number | string) {
  const v = Number(n);
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

interface Deal {
  id: number;
  name: string;
  value: string;
  stage: string;
  closeDate?: string | null;
  notes?: string | null;
  leadId?: number | null;
  leadName?: string | null;
  createdAt: string;
}

interface Lead { id: number; name: string; }

interface CreateDealForm {
  name: string; value: string; stage: Stage; closeDate: string; notes: string; leadId: string;
}

// A body that is not the shape this page expects is a failure too — not a
// reason to render an empty pipeline.
function pickDeals(body: unknown): Deal[] | undefined {
  const list = body && typeof body === "object" ? (body as { deals?: unknown }).deals : undefined;
  return Array.isArray(list) ? list as Deal[] : undefined;
}

function pickLeads(body: unknown): Lead[] | undefined {
  const list = body && typeof body === "object" ? (body as { leads?: unknown }).leads : undefined;
  return Array.isArray(list) ? list as Lead[] : undefined;
}

function pickTransactions(body: unknown): Transaction[] | undefined {
  const list = body && typeof body === "object" ? (body as { transactions?: unknown }).transactions : undefined;
  return Array.isArray(list) ? list as Transaction[] : undefined;
}

const emptyForm: CreateDealForm = { name: "", value: "", stage: "Lead", closeDate: "", notes: "", leadId: "" };

function DealCard({ deal, onDragStart, onDelete, onEdit }: {
  deal: Deal;
  onDragStart: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (deal: Deal) => void;
}) {
  const col = STAGE_COLORS[deal.stage as Stage] || STAGE_COLORS.Lead;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal.id)}
      className="bg-white rounded-xl border border-border shadow-sm p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-sm text-foreground leading-snug flex-1">{deal.name}</p>
        {/*
          Edit and delete used to be `opacity-0 group-hover:opacity-100` at
          24px. On a touch screen there is no hover, so they were not merely
          small — they were invisible and unreachable, and a phone user could
          not edit or delete a deal at all.

          The reveal is now keyed on `(hover: hover)` rather than on screen
          width: what decides is whether the device can hover, not how wide it
          is. A hover-capable device keeps the tidy reveal; everything else
          shows the controls permanently at a 40px target.
        */}
        <div className="flex items-center gap-1 shrink-0 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Edit ${deal.name}`}
            onClick={() => onEdit(deal)}
            className="w-10 h-10 [@media(hover:hover)]:w-7 [@media(hover:hover)]:h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4 [@media(hover:hover)]:w-3 [@media(hover:hover)]:h-3" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${deal.name}`}
            onClick={() => onDelete(deal.id)}
            className="w-10 h-10 [@media(hover:hover)]:w-7 [@media(hover:hover)]:h-7 flex items-center justify-center text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 [@media(hover:hover)]:w-3 [@media(hover:hover)]:h-3" />
          </button>
        </div>
      </div>

      <p className="text-lg font-bold text-foreground mb-2.5">{fmt(deal.value)}</p>

      <div className="space-y-1">
        {deal.leadName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{deal.leadName}</span>
          </div>
        )}
        {deal.closeDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{new Date(deal.closeDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-border/60">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.bg} ${col.text}`}>
          {deal.stage}
        </span>
      </div>
    </div>
  );
}

export default function CrmDealsPage() {
  // The board, the contact list and a deal's payments are three separate
  // answers, and each one is a `Load`. Before this, a failed request left the
  // arrays empty and the page reported "0 deals · $0 total value" with every
  // stage reading "0 / No deals" and no failure message at all — it told the
  // owner they had no pipeline and no money.
  const [dealsLoad, setDealsLoad] = useState<Load<Deal[]>>({ status: "loading" });
  const [leadsLoad, setLeadsLoad] = useState<Load<Lead[]>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  /** A board action (move, delete) the server refused. */
  const [boardNotice, setBoardNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateDealForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const savingRef = useRef(false);

  const [txnsLoad, setTxnsLoad] = useState<Load<Transaction[]>>({ status: "loading" });
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("manual_cash");
  const [payReceivedAt, setPayReceivedAt] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payError, setPayError] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [stripeUrl, setStripeUrl] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // What actually loaded, or null. Never an empty array standing in for a
  // request nobody managed to complete.
  const deals = dealsLoad.status === "ready" ? dealsLoad.data : null;
  const leads = leadsLoad.status === "ready" ? leadsLoad.data : null;
  const txns = txnsLoad.status === "ready" ? txnsLoad.data : null;

  /** Apply a local change to the board, only when there is a board to change. */
  const updateDeals = (fn: (prev: Deal[]) => Deal[]) =>
    setDealsLoad(prev => (prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev));

  const loadTxns = useCallback(async (dealId: number) => {
    setTxnsLoad({ status: "loading" });
    setTxnsLoad(await readAdminResource(`/api/crm/deals/${dealId}/transactions`, pickTransactions));
  }, []);

  // Money actually received, or null. A flat "$0.00" for a read that failed
  // told an owner a client had paid nothing when nobody had managed to ask.
  const totalReceived = txns
    ? txns.filter(t => t.status === "completed").reduce((s, t) => s + Number(t.amount), 0)
    : null;

  const recordPayment = async () => {
    if (!editDeal) return;
    if (!payAmount || Number(payAmount) <= 0) { setPayError("Enter a positive amount."); return; }
    setPaySaving(true);
    setPayError("");
    try {
      const res = await adminFetch(`/api/crm/deals/${editDeal.id}/transactions/manual`, {
        method: "POST",
        body: JSON.stringify({
          amount: payAmount, method: payMethod,
          receivedAt: payReceivedAt || undefined,
          notes: payNotes || undefined,
        }),
      });
      if (!res.ok) { setPayError(`Payment not recorded. ${await responseFailureReason(res)}`); return; }
      const d = await res.json().catch(() => ({})) as { transaction?: Transaction };
      if (d.transaction) {
        const added = d.transaction;
        setTxnsLoad(prev => (prev.status === "ready" ? { status: "ready", data: [added, ...prev.data] } : prev));
      }
      setShowPayForm(false);
      setPayAmount(""); setPayNotes(""); setPayReceivedAt(""); setPayMethod("manual_cash");
    } catch {
      setPayError(`Payment not recorded. ${failureReason(null)}`);
    } finally {
      setPaySaving(false);
    }
  };

  const createStripeLink = async () => {
    if (!editDeal) return;
    setStripeLoading(true);
    setPayError("");
    try {
      const res = await adminFetch(`/api/crm/deals/${editDeal.id}/transactions/stripe-checkout`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) { setPayError(`Payment link not created. ${await responseFailureReason(res)}`); return; }
      const d = await res.json().catch(() => ({})) as { url?: string; transaction?: Transaction };
      if (!d.url) { setPayError("Payment link not created. The server's answer was not in the expected shape."); return; }
      setStripeUrl(d.url);
      if (d.transaction) {
        const added = d.transaction;
        setTxnsLoad(prev => (prev.status === "ready" ? { status: "ready", data: [added, ...prev.data] } : prev));
      }
    } catch {
      setPayError(`Payment link not created. ${failureReason(null)}`);
    } finally {
      setStripeLoading(false);
    }
  };

  const copyStripeUrl = async () => {
    try {
      await navigator.clipboard.writeText(stripeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  // Each part keeps its own answer: the board can load while the contact list
  // fails, and the page says so instead of silently offering no contacts.
  // (The previous version returned early on a 401 and left the page spinning
  // for ever.)
  const load = useCallback(async () => {
    setReloading(true);
    setBoardNotice("");
    const [nextDeals, nextLeads] = await Promise.all([
      readAdminResource("/api/crm/deals", pickDeals),
      readAdminResource("/api/crm/leads", pickLeads),
    ]);
    setDealsLoad(nextDeals);
    setLeadsLoad(nextLeads);
    setReloading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = (stage: Stage = "Lead") => {
    setForm({ ...emptyForm, stage });
    setFormError("");
    setEditDeal(null);
    setShowCreate(true);
  };

  const openEdit = (deal: Deal) => {
    setEditDeal(deal);
    setForm({
      name: deal.name,
      value: deal.value,
      stage: deal.stage as Stage,
      closeDate: deal.closeDate || "",
      notes: deal.notes || "",
      leadId: deal.leadId ? String(deal.leadId) : "",
    });
    setFormError("");
    setShowCreate(true);
    setTxnsLoad({ status: "loading" });
    setShowPayForm(false);
    setStripeUrl("");
    setPayError("");
    loadTxns(deal.id);
  };

  const saveDeal = async () => {
    if (!form.name.trim()) { setFormError("Deal name is required."); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: form.name.trim(),
        value: form.value || "0",
        stage: form.stage,
        closeDate: form.closeDate || null,
        notes: form.notes || null,
        leadId: form.leadId ? Number(form.leadId) : null,
      };
      const res = editDeal
        ? await adminFetch(`/api/crm/deals/${editDeal.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await adminFetch("/api/crm/deals", {
            method: "POST",
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        setFormError(`Deal not saved. ${await responseFailureReason(res)}`);
      } else {
        setShowCreate(false);
        setForm(emptyForm);
        setEditDeal(null);
        load();
      }
    } catch {
      setFormError(`Deal not saved. ${failureReason(null)}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // A delete that failed must not take the card off the board: the deal is
  // still there, and the next reload would bring it back with no explanation.
  const deleteDeal = async (id: number) => {
    if (!confirm("Delete this deal?")) return;
    setBoardNotice("");
    try {
      const res = await adminFetch(`/api/crm/deals/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setBoardNotice(`Deal not deleted. ${await responseFailureReason(res)}`);
        return;
      }
      updateDeals(d => d.filter(x => x.id !== id));
    } catch {
      setBoardNotice(`Deal not deleted. ${failureReason(null)}`);
    }
  };

  // The card moves at once, but a refused move is put back where it was and
  // said out loud. Leaving it in the new column showed the operator a stage
  // change that never happened.
  const handleDrop = async (targetStage: Stage) => {
    if (dragId === null || deals === null) return;
    const movedId = dragId;
    const deal = deals.find(d => d.id === movedId);
    if (!deal || deal.stage === targetStage) { setDragId(null); setDragOverStage(null); return; }
    const previousStage = deal.stage;
    const revert = () => updateDeals(prev => prev.map(d => d.id === movedId ? { ...d, stage: previousStage } : d));
    updateDeals(prev => prev.map(d => d.id === movedId ? { ...d, stage: targetStage } : d));
    setDragId(null);
    setDragOverStage(null);
    setBoardNotice("");
    try {
      const res = await adminFetch(`/api/crm/deals/${movedId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) {
        revert();
        setBoardNotice(`"${deal.name}" was not moved to ${targetStage}. ${await responseFailureReason(res)}`);
      }
    } catch {
      revert();
      setBoardNotice(`"${deal.name}" was not moved to ${targetStage}. ${failureReason(null)}`);
    }
  };

  const columnDeals = (list: Deal[], stage: Stage) => list.filter(d => d.stage === stage);

  return (
    <CrmLayout>
      <div className="flex flex-col h-[calc(100vh-48px)]">
        {/* Header */}
        <div className="bg-white border-b border-border px-6 py-3.5 flex items-center gap-3 shrink-0">
          <div>
            <h1 className="font-bold text-foreground">Deals Kanban</h1>
            <p className="text-xs text-muted-foreground">Track revenue opportunities and move deals through your sales stages.</p>
            {/*
              The figures exist only when the board behind them loaded. This
              line is where the page used to say "0 deals · $0 total value"
              about a request that had failed.
            */}
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {deals ? (
                <>{deals.length} deal{deals.length !== 1 ? "s" : ""} · {fmt(deals.reduce((s, d) => s + Number(d.value), 0))} total value</>
              ) : (
                <>
                  <Figure value={null} loading={dealsLoad.status === "loading"} /> deals ·{" "}
                  <Figure value={null} loading={dealsLoad.status === "loading"} /> total value
                </>
              )}
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => openCreate()}>
              <Plus className="w-3.5 h-3.5" /> New Deal
            </Button>
          </div>
        </div>

        {/* A board action the server refused. */}
        {boardNotice && (
          <p role="alert" className="shrink-0 mx-5 mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 break-words">{boardNotice}</span>
          </p>
        )}

        {/* Kanban Board */}
        {dealsLoad.status === "loading" ? (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto" role="status" aria-live="polite">
            <span className="sr-only">Loading deals…</span>
            {STAGES.map(s => (
              <div key={s} className="w-64 shrink-0 bg-muted rounded-xl animate-pulse h-48" />
            ))}
          </div>
        ) : deals === null ? (
          /*
            No board at all, rather than five columns each reading "0 / No
            deals". An empty pipeline and an unanswered request must never
            look alike — and a 401, 403, 404, 5xx or unreachable server each
            reads differently here, because the words come from the response.
          */
          <div className="flex-1 overflow-y-auto p-5">
            <LoadFailure
              what="Deals"
              reason={dealsLoad.status === "error" ? dealsLoad.reason : ""}
              onRetry={() => { void load(); }}
              retrying={reloading}
            >
              <p className="mt-2 text-sm text-muted-foreground">
                No deal count, stage tally or total value is shown while this is unavailable — the pipeline may well be full.
              </p>
            </LoadFailure>
          </div>
        ) : (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto overflow-y-hidden">
            {STAGES.map(stage => {
              const col = STAGE_COLORS[stage];
              const stageDeals = columnDeals(deals, stage);
              const total = stageDeals.reduce((s, d) => s + Number(d.value), 0);
              const isDragOver = dragOverStage === stage;
              return (
                <div
                  key={stage}
                  className="w-64 shrink-0 rounded-xl flex flex-col transition-all"
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null);
                  }}
                  onDrop={() => handleDrop(stage)}
                >
                  {/* Column header */}
                  <div className={`rounded-t-xl px-3 py-2.5 border ${col.border} ${col.bg} border-b-0`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.accent }} />
                        <span className={`text-xs font-bold ${col.text}`}>{stage}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 ${col.text}`}>
                          {stageDeals.length}
                        </span>
                      </div>
                      <button
                        onClick={() => openCreate(stage)}
                        className={`w-5 h-5 flex items-center justify-center rounded ${col.text} hover:bg-white/50 transition-colors opacity-60 hover:opacity-100`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {total > 0 && (
                      <div className="flex items-center gap-1">
                        <DollarSign className={`w-3 h-3 ${col.text} opacity-60`} />
                        <span className={`text-xs font-semibold ${col.text}`}>{fmt(total)}</span>
                        {stageDeals.length > 1 && (
                          <span className={`text-[10px] ${col.text} opacity-60`}>
                            · avg {fmt(total / stageDeals.length)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cards area */}
                  <div
                    className={`flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border border-t-0 ${col.border} transition-colors ${
                      isDragOver ? `${col.bg} opacity-80` : "bg-muted/80"
                    }`}
                    style={{ minHeight: "120px" }}
                  >
                    {stageDeals.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-20 text-center">
                        <p className="text-xs text-muted-foreground/50">No deals</p>
                        <button onClick={() => openCreate(stage)} className={`text-xs ${col.text} hover:opacity-80 mt-1`}>
                          + Add deal
                        </button>
                      </div>
                    ) : (
                      stageDeals.map(deal => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          onDragStart={setDragId}
                          onDelete={deleteDeal}
                          onEdit={openEdit}
                        />
                      ))
                    )}

                    {isDragOver && dragId !== null && (
                      <div className={`rounded-xl border-2 border-dashed ${col.border} h-16 flex items-center justify-center`}>
                        <p className={`text-xs ${col.text} opacity-60`}>Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowCreate(false); setEditDeal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <h2 className="font-semibold text-foreground">{editDeal ? "Edit Deal" : "New Deal"}</h2>
              <button onClick={() => { setShowCreate(false); setEditDeal(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Deal Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormError(""); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    formError && !form.name ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-input focus:ring-foreground/20"
                  }`}
                  placeholder="e.g. Website Redesign — Acme Corp"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Value ($)</label>
                  <input
                    type="number" min="0" value={form.value}
                    onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Stage</label>
                  <select
                    value={form.stage}
                    onChange={e => setForm(f => ({ ...f, stage: e.target.value as Stage }))}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none bg-white"
                  >
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Link to Lead (optional)</label>
                <select
                  value={form.leadId}
                  onChange={e => setForm(f => ({ ...f, leadId: e.target.value }))}
                  disabled={leads === null}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none bg-white disabled:opacity-60"
                >
                  <option value="">— No contact linked —</option>
                  {(leads ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {/* An empty picker would say "you have no contacts". Say which it is. */}
                {leads === null && (
                  <p className="mt-1 text-xs text-muted-foreground break-words">
                    {leadsLoad.status === "loading"
                      ? "Loading contacts…"
                      : `Contacts could not be loaded, so none can be linked. ${leadsLoad.status === "error" ? leadsLoad.reason : ""}`}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Expected Close Date</label>
                <input
                  type="date" value={form.closeDate}
                  onChange={e => setForm(f => ({ ...f, closeDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea
                  rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                  placeholder="Optional notes…"
                />
              </div>

              {editDeal && (
                <div className="pt-3 border-t border-border/60 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-1.5">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" /> Payments
                    </p>
                    {/* "$0.00" for a payments read that failed is a claim about a client's account. */}
                    <p className="text-xs font-bold text-emerald-700">
                      Total received:{" "}
                      <Figure
                        value={totalReceived === null
                          ? null
                          : `$${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        loading={txnsLoad.status === "loading"}
                      />
                    </p>
                  </div>

                  {payError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{payError}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button" variant="outline" size="sm" className="gap-1.5"
                      onClick={() => setShowPayForm(v => !v)}
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Record Payment
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm" className="gap-1.5"
                      onClick={createStripeLink} disabled={stripeLoading}
                    >
                      {stripeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                      Send Stripe payment link
                    </Button>
                  </div>

                  {stripeUrl && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <input
                        readOnly value={stripeUrl}
                        className="flex-1 min-w-0 bg-transparent text-xs text-blue-800 focus:outline-none truncate"
                        onFocus={e => e.currentTarget.select()}
                      />
                      <button type="button" onClick={copyStripeUrl} className="shrink-0 text-blue-700 hover:text-blue-900">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copied && <span className="text-[10px] text-blue-700 shrink-0">Copied!</span>}
                    </div>
                  )}

                  {showPayForm && (
                    <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Amount ($)</label>
                          <input
                            type="number" min="0" value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Method</label>
                          <select
                            value={payMethod}
                            onChange={e => setPayMethod(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs focus:outline-none bg-white"
                          >
                            {TXN_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Received On</label>
                        <input
                          type="date" value={payReceivedAt}
                          onChange={e => setPayReceivedAt(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Notes</label>
                        <input
                          value={payNotes}
                          onChange={e => setPayNotes(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
                          placeholder="Optional…"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setShowPayForm(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="button" size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                          onClick={recordPayment} disabled={paySaving}
                        >
                          {paySaving ? "Saving…" : "Save Payment"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {txnsLoad.status === "error" && (
                    <LoadFailure
                      what="Payments"
                      reason={txnsLoad.reason}
                      variant="inline"
                      onRetry={() => { if (editDeal) void loadTxns(editDeal.id); }}
                    />
                  )}

                  {txns && txns.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {txns.map(t => (
                        <div key={t.id} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-white border border-border/60 rounded-lg">
                          <span className="text-muted-foreground truncate">
                            {t.method === "stripe" ? "Stripe" : TXN_METHODS.find(m => m.value === t.method)?.label || t.method}
                          </span>
                          <span className="font-semibold text-foreground">${Number(t.amount).toLocaleString()}</span>
                          <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-semibold ${
                            t.status === "completed" ? "bg-emerald-100 text-emerald-700"
                              : t.status === "pending" ? "bg-amber-100 text-amber-700"
                              : "bg-muted text-muted-foreground"
                          }`}>{t.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCreate(false); setEditDeal(null); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5"
                onClick={saveDeal}
                disabled={saving}
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : editDeal ? "Save Changes" : "Create Deal"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
