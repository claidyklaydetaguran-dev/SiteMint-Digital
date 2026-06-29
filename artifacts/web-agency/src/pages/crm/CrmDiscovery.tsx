import { useState, useEffect, useCallback } from "react";
import { CrmLayout } from "./CrmLayout";
import {
  Search, Filter, FileText, ArrowRight, RefreshCw, Trash2, X,
  ChevronDown, ExternalLink, Zap, Clock, DollarSign, User,
  CheckCircle, AlertCircle, Eye, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const tok = () => localStorage.getItem("adminToken") || "";
const API = (path: string) => `/api${path}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Submission {
  id: number;
  createdAt: string;
  contactName: string;
  companyName: string;
  email: string;
  phone?: string;
  industry?: string;
  serviceInterest?: string;
  budget?: string;
  timeline?: string;
  leadScore: number;
  tags: string[];
  status: string;
  crmStatus: string;
  recommendedPackage?: string;
  aiSummary?: string;
  estimatedComplexity?: string;
  estimatedBudgetTier?: string;
  suggestedScope?: Record<string, unknown>;
  formData: Record<string, unknown>;
  generatedProposal?: string;
  generatedSow?: string;
  internalNotes?: string;
  leadId?: number;
  convertedProjectId?: number;
  preferredContactMethod?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<string, string> = {
  "under1k": "Under $1k", "1k-2.5k": "$1k–$2.5k", "2.5k-5k": "$2.5k–$5k",
  "5k-10k": "$5k–$10k", "10k-plus": "$10k+",
};
const TIMELINE_LABELS: Record<string, string> = {
  "asap": "ASAP", "30-days": "30 Days", "60-days": "60 Days",
  "90-days": "90 Days", "flexible": "Flexible",
};
const CRM_STATUS_COLORS: Record<string, string> = {
  "New": "bg-blue-100 text-blue-700",
  "Reviewed": "bg-yellow-100 text-yellow-700",
  "Proposal Generated": "bg-purple-100 text-purple-700",
  "Archived": "bg-gray-100 text-gray-500",
};
const COMPLEXITY_COLORS: Record<string, string> = {
  "Low": "text-green-600", "Medium": "text-yellow-600",
  "High": "text-orange-600", "Enterprise": "text-red-600",
};
const CRM_STATUSES = ["New", "Reviewed", "Proposal Generated", "Archived"];

function ScoreDot({ score }: { score: number }) {
  const color = score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-400" : "bg-red-400";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs font-medium">{score}/10</span>
    </span>
  );
}

function FormDataSection({ data }: { data: Record<string, unknown> }) {
  const skip = new Set(["services"]);
  const entries = Object.entries(data).filter(([k]) => !skip.has(k) && data[k] != null && data[k] !== "");
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No form data.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[180px_1fr] gap-2 text-sm">
          <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}:</span>
          <span className="text-foreground font-medium">
            {Array.isArray(v) ? v.join(", ") : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DiscoveryDrawer({
  sub,
  onClose,
  onRefresh,
}: {
  sub: Submission;
  onClose: () => void;
  onRefresh: (updated: Submission) => void;
}) {
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [convertingProject, setConvertingProject] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<"proposal" | "sow" | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(sub.internalNotes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [status, setStatus] = useState(sub.crmStatus);

  const generateProposal = async () => {
    setGeneratingProposal(true);
    setError("");
    try {
      const r = await fetch(API(`/crm/discovery-submissions/${sub.id}/generate-proposal`), {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error || "Failed");
      const { submission } = await r.json() as { submission: Submission };
      onRefresh(submission);
      setStatus("Proposal Generated");
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingProposal(false);
    }
  };

  const convertToProject = async () => {
    if (sub.convertedProjectId) {
      if (!window.confirm("This submission was already converted to a project. Create another one?")) return;
    }
    setConvertingProject(true);
    setError("");
    try {
      const r = await fetch(API(`/crm/discovery-submissions/${sub.id}/convert-to-project`), {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!sub.convertedProjectId }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error || "Failed");
      const data = await r.json() as { project: { id: number } };
      alert(`Project #${data.project.id} created! Navigate to Projects to see it.`);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setConvertingProject(false);
    }
  };

  const patchStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const r = await fetch(API(`/crm/discovery-submissions/${sub.id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ crmStatus: newStatus }),
      });
      if (r.ok) {
        const { submission } = await r.json() as { submission: Submission };
        onRefresh(submission);
        setStatus(newStatus);
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetch(API(`/crm/discovery-submissions/${sub.id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ internalNotes: notes }),
      });
    } finally {
      setSavingNotes(false);
    }
  };

  if (previewDoc) {
    const html = previewDoc === "proposal" ? sub.generatedProposal : sub.generatedSow;
    return (
      <div className="fixed inset-0 z-[200] bg-white flex flex-col">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200">
          <button onClick={() => setPreviewDoc(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <span className="font-semibold text-sm">{previewDoc === "proposal" ? "Proposal" : "SOW"} — {sub.companyName}</span>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-100 p-4">
          <iframe srcDoc={html || ""} sandbox="allow-same-origin allow-modals" className="w-full h-full bg-white rounded-lg shadow" title="Document preview" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex" onClick={onClose}>
      <div className="ml-auto w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground truncate">{sub.companyName}</h2>
            <p className="text-xs text-muted-foreground">{sub.contactName} · {sub.email}</p>
          </div>
          <ScoreDot score={sub.leadScore} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Status + Actions */}
          <div className="px-6 py-4 border-b border-gray-100 space-y-3">
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}

            {/* CRM Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Status:</span>
              {CRM_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => patchStatus(s)}
                  disabled={updatingStatus}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    status === s ? CRM_STATUS_COLORS[s] || "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={generateProposal}
                disabled={generatingProposal}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {generatingProposal ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {generatingProposal ? "Generating…" : sub.generatedProposal ? "Regenerate Proposal" : "Generate Proposal"}
              </Button>

              {sub.generatedProposal && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setPreviewDoc("proposal")} className="gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> View Proposal
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreviewDoc("sow")} className="gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> View SOW
                  </Button>
                </>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={convertToProject}
                disabled={convertingProject}
                className="gap-1.5"
              >
                {convertingProject ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                {convertingProject ? "Converting…" : sub.convertedProjectId ? "Create Another Project" : "Convert to Project"}
              </Button>

              {sub.leadId && (
                <a href={`/admin/crm/leads/${sub.leadId}`}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> View Lead
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* AI Summary */}
          {sub.aiSummary && (
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">AI Summary</h3>
              <p className="text-sm text-foreground leading-relaxed">{sub.aiSummary}</p>
              <div className="flex gap-4 mt-3">
                {sub.estimatedComplexity && (
                  <div>
                    <span className="text-xs text-muted-foreground">Complexity</span>
                    <p className={`text-sm font-semibold ${COMPLEXITY_COLORS[sub.estimatedComplexity] || ""}`}>
                      {sub.estimatedComplexity}
                    </p>
                  </div>
                )}
                {sub.estimatedBudgetTier && (
                  <div>
                    <span className="text-xs text-muted-foreground">Recommended Tier</span>
                    <p className="text-sm font-semibold text-foreground">{sub.estimatedBudgetTier}</p>
                  </div>
                )}
                {sub.recommendedPackage && sub.recommendedPackage !== sub.estimatedBudgetTier && (
                  <div>
                    <span className="text-xs text-muted-foreground">Package</span>
                    <p className="text-sm font-semibold text-foreground">{sub.recommendedPackage}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Key Info */}
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Key Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Service Interest", value: sub.serviceInterest?.replace(/-/g, " ") },
                { label: "Budget", value: BUDGET_LABELS[sub.budget || ""] || sub.budget },
                { label: "Timeline", value: TIMELINE_LABELS[sub.timeline || ""] || sub.timeline },
                { label: "Industry", value: sub.industry },
                { label: "Phone", value: sub.phone },
                { label: "Preferred Contact", value: sub.preferredContactMethod },
              ].filter(i => i.value).map(({ label, value }) => (
                <div key={label}>
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <p className="font-medium text-foreground capitalize">{value}</p>
                </div>
              ))}
            </div>
            {sub.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sub.tags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Form answers */}
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Discovery Answers</h3>
            <FormDataSection data={sub.formData} />
          </div>

          {/* Internal notes */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Internal Notes</h3>
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
              rows={4}
              placeholder="Add internal notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes} className="mt-2">
              {savingNotes ? "Saving…" : "Save Notes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CrmDiscovery() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [budgetFilter, setBudgetFilter] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (budgetFilter) params.set("budget", budgetFilter);
      if (timelineFilter) params.set("timeline", timelineFilter);
      params.set("limit", "200");
      const r = await fetch(API(`/crm/discovery-submissions?${params}`), {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) {
        const data = await r.json() as { submissions: Submission[]; total: number };
        setSubmissions(data.submissions);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, budgetFilter, timelineFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this discovery submission?")) return;
    setDeletingId(id);
    await fetch(API(`/crm/discovery-submissions/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tok()}` },
    });
    setDeletingId(null);
    setSubmissions(prev => prev.filter(s => s.id !== id));
  };

  const handleRefresh = (updated: Submission) => {
    setSubmissions(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
  };

  return (
    <CrmLayout>
      {selected && (
        <DiscoveryDrawer
          sub={selected}
          onClose={() => setSelected(null)}
          onRefresh={handleRefresh}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Discovery CRM</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${total} submission${total !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search name, company, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {CRM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={budgetFilter}
              onChange={e => setBudgetFilter(e.target.value)}
            >
              <option value="">All Budgets</option>
              {Object.entries(BUDGET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={timelineFilter}
              onChange={e => setTimelineFilter(e.target.value)}
            >
              <option value="">All Timelines</option>
              {Object.entries(TIMELINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Search className="w-8 h-8 opacity-40" />
              <p className="text-sm">No discovery submissions found.</p>
              <p className="text-xs">Submissions appear here when the discovery form is submitted.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                <tr className="text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Complexity</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {submissions.map(sub => (
                  <tr
                    key={sub.id}
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                    onClick={() => setSelected(sub)}
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">{sub.contactName}</p>
                      <p className="text-xs text-muted-foreground">{sub.companyName}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-foreground capitalize">
                        {sub.serviceInterest?.replace(/-/g, " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground">
                      {BUDGET_LABELS[sub.budget || ""] || sub.budget || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground">
                      {TIMELINE_LABELS[sub.timeline || ""] || sub.timeline || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <ScoreDot score={sub.leadScore} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-sm font-medium ${COMPLEXITY_COLORS[sub.estimatedComplexity || ""] || "text-muted-foreground"}`}>
                        {sub.estimatedComplexity || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CRM_STATUS_COLORS[sub.crmStatus] || "bg-gray-100 text-gray-500"}`}>
                        {sub.crmStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {sub.generatedProposal && (
                          <span title="Proposal generated">
                            <FileText className="w-4 h-4 text-indigo-500" />
                          </span>
                        )}
                        {sub.convertedProjectId && (
                          <span title="Converted to project">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(sub.id)}
                          disabled={deletingId === sub.id}
                          className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
