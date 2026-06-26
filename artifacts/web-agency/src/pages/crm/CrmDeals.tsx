import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Plus, X, Trash2, Edit2, Check, DollarSign, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const token = () => localStorage.getItem("adminToken") || "";

const STAGES = ["Lead", "Qualified", "Proposal", "Won", "Lost"] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, { bg: string; text: string; border: string; accent: string }> = {
  Lead:      { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200", accent: "#6366f1" },
  Qualified: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",    accent: "#0ea5e9" },
  Proposal:  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200", accent: "#f97316" },
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
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-sm text-foreground leading-snug flex-1">{deal.name}</p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(deal)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded transition-colors">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(deal.id)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-500 rounded transition-colors">
            <Trash2 className="w-3 h-3" />
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

      <div className="mt-2.5 pt-2 border-t border-gray-100">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.bg} ${col.text}`}>
          {deal.stage}
        </span>
      </div>
    </div>
  );
}

export default function CrmDealsPage() {
  const [, navigate] = useLocation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateDealForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    const [dealsRes, leadsRes] = await Promise.all([
      fetch("/api/crm/deals", { headers: { Authorization: `Bearer ${token()}` } }),
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (dealsRes.status === 401) { navigate("/admin"); return; }
    const dealsData = await dealsRes.json() as { deals: Deal[] };
    const leadsData = await leadsRes.json() as { leads: Lead[] };
    setDeals(dealsData.deals || []);
    setLeads(leadsData.leads || []);
    setLoading(false);
  }, [navigate]);

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
        ? await fetch(`/api/crm/deals/${editDeal.id}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/crm/deals", {
            method: "POST",
            headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setFormError(d.error || "Failed to save deal.");
      } else {
        setShowCreate(false);
        setForm(emptyForm);
        setEditDeal(null);
        load();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteDeal = async (id: number) => {
    if (!confirm("Delete this deal?")) return;
    await fetch(`/api/crm/deals/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    setDeals(d => d.filter(x => x.id !== id));
  };

  const handleDrop = async (targetStage: Stage) => {
    if (dragId === null) return;
    const deal = deals.find(d => d.id === dragId);
    if (!deal || deal.stage === targetStage) { setDragId(null); setDragOverStage(null); return; }
    setDeals(prev => prev.map(d => d.id === dragId ? { ...d, stage: targetStage } : d));
    setDragId(null);
    setDragOverStage(null);
    await fetch(`/api/crm/deals/${dragId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    }).catch(() => load());
  };

  const columnDeals = (stage: Stage) => deals.filter(d => d.stage === stage);
  const columnValue = (stage: Stage) => columnDeals(stage).reduce((s, d) => s + Number(d.value), 0);

  return (
    <CrmLayout>
      <div className="flex flex-col h-[calc(100vh-48px)]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center gap-3 shrink-0">
          <div>
            <h1 className="font-bold text-foreground">Deals Pipeline</h1>
            <p className="text-xs text-muted-foreground">
              {deals.length} deal{deals.length !== 1 ? "s" : ""} · {fmt(deals.reduce((s, d) => s + Number(d.value), 0))} total value
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => openCreate()}>
              <Plus className="w-3.5 h-3.5" /> New Deal
            </Button>
          </div>
        </div>

        {/* Kanban Board */}
        {loading ? (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto">
            {STAGES.map(s => (
              <div key={s} className="w-64 shrink-0 bg-gray-100 rounded-xl animate-pulse h-48" />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto overflow-y-hidden">
            {STAGES.map(stage => {
              const col = STAGE_COLORS[stage];
              const stageDeals = columnDeals(stage);
              const total = columnValue(stage);
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
                      isDragOver ? `${col.bg} opacity-80` : "bg-gray-50/80"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
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
                    formError && !form.name ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-foreground/20"
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Stage</label>
                  <select
                    value={form.stage}
                    onChange={e => setForm(f => ({ ...f, stage: e.target.value as Stage }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                >
                  <option value="">— No contact linked —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Expected Close Date</label>
                <input
                  type="date" value={form.closeDate}
                  onChange={e => setForm(f => ({ ...f, closeDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea
                  rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                  placeholder="Optional notes…"
                />
              </div>
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
