import { useState, useEffect, useCallback } from "react";
import { CrmLayout } from "./CrmLayout";
import {
  Search, Filter, FileText, ArrowRight, RefreshCw, Trash2, X,
  ChevronDown, ExternalLink, Zap, Clock, DollarSign, User,
  CheckCircle, AlertCircle, Eye, FolderOpen, Download,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";
import { useConfirmDialog, type Confirmation } from "@/components/crm/ConfirmDialog";
import { describeActionFailure, refusalMessage } from "@/components/crm/confirmDialogModel";

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

/** One page of submissions and the server's count of them. */
interface SubmissionPage {
  submissions: Submission[];
  total: number;
}

/**
 * A body that is not the shape this page expects is a failure too.
 *
 * The old version read `data.submissions` from any 2xx body and rendered the
 * result; anything else — including a request that never succeeded — left the
 * list empty and the header saying "0 submissions".
 */
function pickSubmissions(body: unknown): SubmissionPage | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { submissions, total } = body as { submissions?: unknown; total?: unknown };
  if (!Array.isArray(submissions)) return undefined;
  return {
    submissions: submissions as Submission[],
    total: typeof total === "number" ? total : submissions.length,
  };
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
  "Proposal Generated": "bg-teal-100 text-teal-700",
  "Archived": "bg-muted text-muted-foreground",
};
const COMPLEXITY_COLORS: Record<string, string> = {
  "Low": "text-green-600", "Medium": "text-yellow-600",
  "High": "text-orange-600", "Enterprise": "text-red-600",
};
const CRM_STATUSES = ["New", "Reviewed", "Proposal Generated", "Archived"];

/** The link in the "project created" notice, so focus can be sent to it. */
const CONVERTED_LINK_ID = "discovery-converted-project-link";

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
  onConverted,
  askConfirm,
}: {
  sub: Submission;
  onClose: () => void;
  onRefresh: (updated: Submission) => void;
  onConverted: (submission: Submission, projectId: number) => void;
  askConfirm: Confirmation["ask"];
}) {
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [convertingProject, setConvertingProject] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<"proposal" | "sow" | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(sub.internalNotes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [status, setStatus] = useState(sub.crmStatus);

  // The words for a refusal come from the response, not from `String(e)` — a
  // thrown `Error: Failed` told the operator nothing about what to do next.
  const generateProposal = async () => {
    setGeneratingProposal(true);
    setError("");
    try {
      const r = await adminFetch(`/api/crm/discovery-submissions/${sub.id}/generate-proposal`, {
        method: "POST",
      });
      if (!r.ok) { setError(`Proposal not generated. ${await responseFailureReason(r)}`); return; }
      const body = await r.json().catch(() => null) as { submission?: Submission } | null;
      if (!body?.submission) {
        setError("Proposal not generated. The server's answer was not in the expected shape.");
        return;
      }
      onRefresh(body.submission);
      setStatus("Proposal Generated");
    } catch {
      setError(`Proposal not generated. ${failureReason(null)}`);
    } finally {
      setGeneratingProposal(false);
    }
  };

  /** Creates the project and tells the page, or throws with the server's words. */
  const createProject = async (force: boolean) => {
    const r = await adminFetch(`/api/crm/discovery-submissions/${sub.id}/convert-to-project`, {
      method: "POST",
      body: JSON.stringify({ force }),
    });
    const data = await r.json().catch(() => ({})) as {
      project?: { id: number }; error?: string; message?: string;
    };
    if (!r.ok || !data.project) {
      throw new Error(data.message || data.error || `The project could not be created (${r.status}).`);
    }
    onConverted(sub, data.project.id);
  };

  const convertToProject = async () => {
    if (sub.convertedProjectId) {
      await askConfirm({
        title: "Create a second project from this submission?",
        description: `It was already converted to project #${sub.convertedProjectId}.`,
        consequences: [
          "A separate new project is created, with its own starter tasks.",
          `Project #${sub.convertedProjectId} is not changed or replaced.`,
        ],
        confirmLabel: "Create another project",
        busyLabel: "Creating…",
        cancelLabel: "Don't create",
        action: () => createProject(true),
        focusAfterSuccess: () => document.getElementById(CONVERTED_LINK_ID),
      });
      return;
    }
    setConvertingProject(true);
    setError("");
    try {
      // The confirmation dialog above is kept; this is the body it calls, so
      // it does the request itself. (The incoming side called createProject
      // from inside createProject, which would have recursed for ever.)
      const r = await adminFetch(`/api/crm/discovery-submissions/${sub.id}/convert-to-project`, {
        method: "POST",
        body: JSON.stringify({ force: !!sub.convertedProjectId }),
      });
      if (!r.ok) { setError(`Project not created. ${await responseFailureReason(r)}`); return; }
      const data = await r.json().catch(() => null) as { project?: { id: number } } | null;
      if (!data?.project) {
        setError("Project not created. The server's answer was not in the expected shape.");
        return;
      }
      alert(`Project #${data.project.id} created! Navigate to Projects to see it.`);
      onClose();
    } catch {
      setError(`Project not created. ${failureReason(null)}`);
    } finally {
      setConvertingProject(false);
    }
  };

  // A refused status change used to do nothing at all: the pill stayed where it
  // was with no explanation, which reads as "that click did not register"
  // rather than "the server said no".
  const patchStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    setError("");
    try {
      const r = await adminFetch(`/api/crm/discovery-submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ crmStatus: newStatus }),
      });
      if (!r.ok) { setError(`Status not changed. ${await responseFailureReason(r)}`); return; }
      const body = await r.json().catch(() => null) as { submission?: Submission } | null;
      if (body?.submission) onRefresh(body.submission);
      setStatus(newStatus);
    } catch {
      setError(`Status not changed. ${failureReason(null)}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // The response was thrown away entirely, so notes that were refused looked
  // exactly like notes that were saved.
  const saveNotes = async () => {
    setSavingNotes(true);
    setError("");
    try {
      const r = await adminFetch(`/api/crm/discovery-submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ internalNotes: notes }),
      });
      if (!r.ok) setError(`Notes not saved. ${await responseFailureReason(r)}`);
    } catch {
      setError(`Notes not saved. ${failureReason(null)}`);
    } finally {
      setSavingNotes(false);
    }
  };

  if (previewDoc) {
    const html = previewDoc === "proposal" ? sub.generatedProposal : sub.generatedSow;
    const handleDownload = () => {
      const prefix = previewDoc === "proposal" ? "Proposal" : "SOW";
      const slug = sub.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const blob = new Blob([html || ""], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}-${slug}.html`;
      a.click();
      URL.revokeObjectURL(url);
    };
    return (
      <div className="fixed inset-0 z-[200] bg-white flex flex-col">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
          <button onClick={() => setPreviewDoc(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <span className="font-semibold text-sm">{previewDoc === "proposal" ? "Proposal" : "SOW"} — {sub.companyName}</span>
          <div className="ml-auto">
            <Button onClick={handleDownload} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-muted p-4">
          <iframe srcDoc={html || ""} sandbox="allow-same-origin allow-modals" className="w-full h-full bg-white rounded-lg shadow" title="Document preview" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex" onClick={onClose}>
      <div className="ml-auto w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border/60">
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
          <div className="px-6 py-4 border-b border-border/60 space-y-3">
            {error && (
              <div role="alert" className="flex items-start gap-2 text-xs text-muted-foreground bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 break-words">{error}</span>
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
                    status === s ? CRM_STATUS_COLORS[s] || "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground/60 hover:bg-accent"
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
                className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
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
            <div className="px-6 py-4 border-b border-border/60">
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
          <div className="px-6 py-4 border-b border-border/60">
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
          <div className="px-6 py-4 border-b border-border/60">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Discovery Answers</h3>
            <FormDataSection data={sub.formData} />
          </div>

          {/* Internal notes */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Internal Notes</h3>
            <textarea
              className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
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
  // The submissions and the server's count are one answer, and that answer is
  // either data or a stated failure. Before this the request was read with
  // `if (r.ok) {…}` and nothing else: a refusal, a 500 or an unreachable server
  // all left the list empty, so the page said "0 submissions" over "No
  // discovery submissions found." and the Refresh button reported nothing.
  const [subsLoad, setSubsLoad] = useState<Load<SubmissionPage>>({ status: "loading" });
  /** A row action the server refused. */
  const [rowNotice, setRowNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [budgetFilter, setBudgetFilter] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [converted, setConverted] = useState<{ projectId: number; companyName: string } | null>(null);
  const confirmation = useConfirmDialog();

  const load = useCallback(async () => {
    setSubsLoad({ status: "loading" });
    setRowNotice("");
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (budgetFilter) params.set("budget", budgetFilter);
    if (timelineFilter) params.set("timeline", timelineFilter);
    params.set("limit", "200");
    setSubsLoad(await readAdminResource(`/api/crm/discovery-submissions?${params}`, pickSubmissions));
  }, [search, statusFilter, budgetFilter, timelineFilter]);

  useEffect(() => { load(); }, [load]);

  /** What actually loaded, or null. Never an empty list standing in for a failure. */
  const page = subsLoad.status === "ready" ? subsLoad.data : null;
  const submissions = page?.submissions ?? null;
  const loading = subsLoad.status === "loading";

  /** Apply a local change, only when there is a loaded list to change. */
  const updatePage = (fn: (prev: SubmissionPage) => SubmissionPage) =>
    setSubsLoad(prev => (prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev));

  // Both meanings kept: the dialog names what goes with the submission, and
  // `refusalMessage` means a refused delete never looks like one that worked.
  // The row comes out through `updatePage`, so the total stays truthful.
  const handleDelete = (submission: Submission) => {
    void confirmation.ask({
      title: `Delete ${submission.companyName}'s discovery submission?`,
      description: "This cannot be undone.",
      consequences: [
        "Its answers, and the proposal and SOW stored on it, go with it.",
        "The contact it belongs to, and any project already created from it, are kept.",
      ],
      tone: "destructive",
      confirmLabel: "Delete submission",
      busyLabel: "Deleting…",
      cancelLabel: "Keep submission",
      action: async () => {
        setDeletingId(submission.id);
        try {
          const res = await adminFetch(`/api/crm/discovery-submissions/${submission.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(await refusalMessage(res, "That submission could not be deleted."));
          updatePage(prev => ({
            submissions: prev.submissions.filter(s => s.id !== submission.id),
            total: Math.max(0, prev.total - 1),
          }));
          if (selected?.id === submission.id) setSelected(null);
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleRefresh = (updated: Submission) => {
    updatePage(prev => ({
      ...prev,
      submissions: prev.submissions.map(s => s.id === updated.id ? updated : s),
    }));
    setSelected(updated);
  };

  const handleConverted = (submission: Submission, projectId: number) => {
    // The list has to learn about it: the row's "converted" tick and the
    // drawer's own button label are both read from this, and before this the
    // list was told nothing at all.
    updatePage(prev => ({
      ...prev,
      submissions: prev.submissions.map(s => (s.id === submission.id ? { ...s, convertedProjectId: projectId } : s)),
    }));
    setConverted({ projectId, companyName: submission.companyName });
    setSelected(null);
  };

  // The drawer holding the button has just closed, so focus goes to the one
  // thing worth doing next rather than to the top of the document.
  useEffect(() => {
    if (converted) document.getElementById(CONVERTED_LINK_ID)?.focus();
  }, [converted]);

  return (
    <CrmLayout>
      {selected && (
        <DiscoveryDrawer
          sub={selected}
          onClose={() => setSelected(null)}
          onRefresh={handleRefresh}
          onConverted={handleConverted}
          askConfirm={confirmation.ask}
        />
      )}

      {confirmation.element}

      <div className="flex flex-col h-full">
        {/* What used to be an alert() saying "navigate to Projects to see it". */}
        {converted && (
          <div
            role="status"
            className="mx-6 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
          >
            <CheckCircle className="w-4 h-4 shrink-0 text-teal-700" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              Project #{converted.projectId} was created from {converted.companyName}'s submission, with its starter tasks.
            </span>
            <Link
              id={CONVERTED_LINK_ID}
              href={`/admin/crm/projects?project=${converted.projectId}`}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Open the project
            </Link>
            <button
              type="button"
              onClick={() => setConverted(null)}
              aria-label="Dismiss"
              className="text-teal-700 hover:text-teal-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Page header */}
        <div className="px-6 py-4 border-b border-border/60 flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Discovery CRM</h1>
            {/*
              The figure exists only when the list behind it loaded. This line
              is where the page used to say "0 submissions" about a request
              that had failed.
            */}
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : page
                  ? `${page.total} submission${page.total !== 1 ? "s" : ""}`
                  : <><Figure value={null} /> submissions</>}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search name, company, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              className="text-xs border border-input rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {CRM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="text-xs border border-input rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={budgetFilter}
              onChange={e => setBudgetFilter(e.target.value)}
            >
              <option value="">All Budgets</option>
              {Object.entries(BUDGET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              className="text-xs border border-input rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
              value={timelineFilter}
              onChange={e => setTimelineFilter(e.target.value)}
            >
              <option value="">All Timelines</option>
              {Object.entries(TIMELINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* A row action the server refused. */}
        {rowNotice && (
          <p role="alert" className="shrink-0 mx-5 mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 break-words">{rowNotice}</span>
          </p>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : submissions === null ? (
            /*
              Deliberately NOT the "No discovery submissions found" panel
              below: the person has to be able to tell "nobody has submitted
              the form" from "we could not ask". The words come from the
              response, so a refusal names the missing permission and an
              unreachable server says so.
            */
            <div className="p-4 sm:p-5">
              <LoadFailure
                what="Discovery submissions"
                reason={subsLoad.status === "error" ? subsLoad.reason : ""}
                onRetry={() => { void load(); }}
                retrying={loading}
              >
                <p className="mt-2 text-sm text-muted-foreground">
                  No submission count is shown while this is unavailable — there may well be enquiries waiting here.
                </p>
              </LoadFailure>
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Search className="w-8 h-8 opacity-40" />
              <p className="text-sm">No discovery submissions found.</p>
              <p className="text-xs">Submissions appear here when the discovery form is submitted.</p>
            </div>
          ) : (
            // Ten columns will never fit 375px. Without a scroll container the
            // table overflowed its card and the right-hand columns could not be
            // reached at all — the page itself does not scroll sideways.
            // Scrolling inside this container keeps that true.
            <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead className="sticky top-0 bg-white border-b border-border/60 z-10">
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
              <tbody className="divide-y divide-border/40">
                {submissions.map(sub => (
                  <tr
                    key={sub.id}
                    className="hover:bg-accent/60 transition-colors cursor-pointer"
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
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CRM_STATUS_COLORS[sub.crmStatus] || "bg-muted text-muted-foreground"}`}>
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
                            <FileText className="w-4 h-4 text-cyan-500" />
                          </span>
                        )}
                        {sub.convertedProjectId && (
                          <span title="Converted to project">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(sub)}
                          disabled={deletingId === sub.id}
                          aria-label={`Delete ${sub.companyName}'s submission`}
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
            </div>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
