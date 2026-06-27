import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  FileText, ClipboardList, Printer, Copy, Edit3, Loader2,
  CheckCircle2, Clock, AlertCircle, Plus, Search, Folder,
  X, DollarSign, Package, Zap, ChevronRight, RefreshCw,
  StickyNote, History, Star, GitBranch, MessageSquare,
} from "lucide-react";
import {
  computeWorkflowSteps, computeNextBestAction,
  type ActionPriority,
} from "@/lib/workflowEngine";
import {
  computeCommunicationStats, computeCommunicationRecommendations,
  type CiLead, type CiMessage,
  type CommunicationRecommendation,
} from "@/lib/communicationIntelligence";
import {
  computeSalesNBA, computeLeadMomentum,
  type SiLead, type SiActivity, type SiTask,
} from "@/lib/salesIntelligence";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceLead {
  id: number;
  name: string;
  company?: string;
  email: string;
  serviceInterest?: string;
  status: string;
  source: string;
  packageType?: string;
  estimatedValue?: string;
  discoveryFormStatus: string;
  proposalStatus: string;
  sowStatus: string;
  notes?: string;
  generatedProposal?: string;
  generatedSow?: string;
  discoverySubmissionId?: number;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceActivity {
  id: number;
  type: string;
  title: string;
  description?: string;
  createdAt: string;
}

interface WorkspaceTask {
  id: number;
  type: string;
  title: string;
  status: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
}

export interface SalesWorkspaceProps {
  lead: WorkspaceLead;
  activities: WorkspaceActivity[];
  tasks: WorkspaceTask[];
  onReload: () => Promise<void>;
}

type WsTab = "overview" | "workflow" | "communications" | "proposal" | "sow" | "notes" | "history" | "documents" | "intelligence";

const tk = () => localStorage.getItem("adminToken") || "";

// ── Sales Stage Tracker ───────────────────────────────────────────────────────

const STAGES = [
  { label: "Discovery",   check: (l: WorkspaceLead) => l.discoveryFormStatus !== "Not Started" },
  { label: "Qualified",   check: (l: WorkspaceLead) => l.status !== "New" },
  { label: "Proposal",    check: (l: WorkspaceLead) => l.proposalStatus !== "Not Started" },
  { label: "Sent",        check: (l: WorkspaceLead) => l.status === "Proposal Sent" || l.proposalStatus === "Sent" },
  { label: "Negotiating", check: (l: WorkspaceLead) => l.status === "Negotiating" || l.status === "Won" },
  { label: "Contract",    check: (l: WorkspaceLead) => l.proposalStatus === "Signed" || l.status === "Won" },
  { label: "Won 🎉",      check: (l: WorkspaceLead) => l.status === "Won" },
];

function StageTracker({ lead }: { lead: WorkspaceLead }) {
  const isLost = lead.status === "Lost";
  const completedCount = STAGES.filter(s => s.check(lead)).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Progress</h3>
        {isLost ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Lost</span>
        ) : (
          <span className="text-xs text-muted-foreground">{completedCount}/{STAGES.length} stages</span>
        )}
      </div>
      <div className="relative">
        <div className="absolute top-3 left-3 right-3 h-0.5 bg-gray-100" />
        <div
          className={`absolute top-3 left-3 h-0.5 transition-all ${isLost ? "bg-red-300" : "bg-green-400"}`}
          style={{ width: `${Math.max(0, (completedCount - 1) / (STAGES.length - 1)) * (100 - (6 / STAGES.length * 100))}%` }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((stage, i) => {
            const done = stage.check(lead);
            const active = done && (i === STAGES.length - 1 || !STAGES[i + 1].check(lead));
            return (
              <div key={stage.label} className="flex flex-col items-center gap-1.5" style={{ minWidth: 0 }}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs z-10 transition-all ${
                  isLost && i === 0
                    ? "border-red-400 bg-red-50 text-red-600"
                    : done
                    ? "border-green-400 bg-green-400 text-white"
                    : active
                    ? "border-foreground bg-foreground text-background animate-pulse"
                    : "border-gray-200 bg-white text-gray-300"
                }`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                </div>
                <span className="text-[9px] text-center text-muted-foreground leading-tight max-w-[48px]">{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Not Started": "bg-gray-100 text-gray-500",
    "Draft": "bg-yellow-100 text-yellow-700",
    "Sent": "bg-blue-100 text-blue-700",
    "Viewed": "bg-indigo-100 text-indigo-700",
    "Signed": "bg-green-100 text-green-700",
    "Rejected": "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ── Doc Preview Modal ─────────────────────────────────────────────────────────

function DocPreviewModal({ html, title, onClose }: { html: string; title: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handlePrint = () => iframeRef.current?.contentWindow?.print();
  const handleCopy = () => {
    const text = iframeRef.current?.contentDocument?.body?.innerText || "";
    navigator.clipboard.writeText(text);
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">
      <div className="bg-foreground text-background px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <h2 className="font-serif font-semibold text-base">{title}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={handleCopy} variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10 gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy Text
          </Button>
          <Button onClick={handlePrint} variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10 gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </Button>
          <Button onClick={onClose} variant="outline" size="sm" className="border-white/20 text-background hover:bg-white/10">
            Close
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden bg-gray-200 p-4">
        <iframe ref={iframeRef} srcDoc={html} className="w-full h-full bg-white rounded-lg shadow-xl" title={title} />
      </div>
    </div>
  );
}

// ── Edit HTML Modal ───────────────────────────────────────────────────────────

function EditHtmlModal({
  html, title, saving, onSave, onClose,
}: { html: string; title: string; saving: boolean; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(html);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">
      <div className="bg-foreground text-background px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <h2 className="font-serif font-semibold text-base">Edit {title} HTML</h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => onSave(value)} disabled={saving} size="sm" className="bg-white text-foreground hover:bg-white/90 gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
          </Button>
          <Button onClick={onClose} variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10">
            Cancel
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full h-full font-mono text-xs bg-white rounded-lg p-4 border-0 outline-none resize-none shadow-xl"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ── Doc Panel (Proposal or SOW) ───────────────────────────────────────────────

function DocPanel({
  lead,
  kind,
  onReload,
}: {
  lead: WorkspaceLead;
  kind: "proposal" | "sow";
  onReload: () => Promise<void>;
}) {
  const html = kind === "proposal" ? lead.generatedProposal : lead.generatedSow;
  const docStatus = kind === "proposal" ? lead.proposalStatus : lead.sowStatus;
  const label = kind === "proposal" ? "Proposal" : "Scope of Work";

  const [generating, setGenerating] = useState(false);
  const [savingHtml, setSavingHtml] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const r = await fetch(`/api/crm/leads/${lead.id}/${kind}/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk()}` },
      });
      if (!r.ok) throw new Error();
      showToast(`${label} generated!`);
      await onReload();
    } catch {
      showToast("Generation failed — try again.");
    } finally {
      setGenerating(false);
    }
  }, [lead.id, kind, label, onReload]);

  const saveHtml = useCallback(async (newHtml: string) => {
    setSavingHtml(true);
    try {
      await fetch(`/api/crm/leads/${lead.id}/${kind}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ html: newHtml }),
      });
      showToast("Saved!");
      setEditOpen(false);
      await onReload();
    } catch {
      showToast("Save failed.");
    } finally {
      setSavingHtml(false);
    }
  }, [lead.id, kind, onReload]);

  const updateStatus = useCallback(async (newStatus: string) => {
    setSavingStatus(true);
    try {
      const field = kind === "proposal" ? "proposalStatus" : "sowStatus";
      await fetch(`/api/crm/leads/${lead.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newStatus }),
      });
      showToast(`Status updated to ${newStatus}`);
      await onReload();
    } catch {
      showToast("Update failed.");
    } finally {
      setSavingStatus(false);
    }
  }, [lead.id, kind, onReload]);

  const STATUSES = ["Not Started", "Draft", "Sent", "Signed", "Rejected"];

  return (
    <div className="p-5 space-y-5">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-foreground text-background px-4 py-2.5 rounded-lg text-sm shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}

      {!html ? (
        /* Empty state */
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mx-auto mb-4">
            {kind === "proposal" ? <FileText className="w-7 h-7 text-gray-300" /> : <ClipboardList className="w-7 h-7 text-gray-300" />}
          </div>
          <h3 className="font-semibold text-foreground mb-1">No {label} Yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            {lead.discoverySubmissionId
              ? `This lead has a discovery submission — generate a rich ${label.toLowerCase()} from it.`
              : `Generate a ${label.toLowerCase()} from the lead's contact and service details.`}
          </p>
          <Button onClick={generate} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {generating ? `Generating ${label}…` : `Generate ${label}`}
          </Button>
        </div>
      ) : (
        /* Document exists */
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{label}</span>
              <StatusBadge status={docStatus} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => setPreviewOpen(true)} variant="outline" size="sm" className="gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Preview
              </Button>
              <Button onClick={() => setEditOpen(true)} variant="outline" size="sm" className="gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Edit HTML
              </Button>
              <Button onClick={generate} disabled={generating} variant="outline" size="sm" className="gap-1.5">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Regenerate
              </Button>
            </div>
          </div>

          {/* Thumbnail preview */}
          <div
            className="relative w-full rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-gray-300 transition-colors group"
            style={{ height: 220 }}
            onClick={() => setPreviewOpen(true)}
          >
            <iframe
              srcDoc={html}
              className="w-full h-full pointer-events-none"
              style={{ transform: "scale(0.6)", transformOrigin: "top left", width: "167%", height: "167%" }}
              title={`${label} preview`}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
              <span className="bg-white rounded-lg px-3 py-1.5 text-sm font-medium shadow">Click to open full preview</span>
            </div>
          </div>

          {/* Status updater */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Status</span>
              {savingStatus && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  disabled={savingStatus}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    docStatus === s
                      ? "bg-foreground text-background border-foreground"
                      : "bg-white text-muted-foreground border-gray-200 hover:border-gray-300 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewOpen && html && <DocPreviewModal html={html} title={label} onClose={() => setPreviewOpen(false)} />}
      {editOpen && html && (
        <EditHtmlModal html={html} title={label} saving={savingHtml} onSave={saveHtml} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

function parseNotes(raw?: string): { timestamp: string; text: string }[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/\n\n(?=\[)/);
  return parts
    .map(p => {
      const match = p.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
      return match
        ? { timestamp: match[1], text: match[2].trim() }
        : { timestamp: "", text: p.trim() };
    })
    .reverse();
}

function NotesTab({ lead, onReload }: { lead: WorkspaceLead; onReload: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const notes = useMemo(() => parseNotes(lead.notes), [lead.notes]);
  const filtered = useMemo(() =>
    search ? notes.filter(n => n.text.toLowerCase().includes(search.toLowerCase()) || n.timestamp.toLowerCase().includes(search.toLowerCase())) : notes,
    [notes, search],
  );

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/crm/leads/${lead.id}/notes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      });
      if (!r.ok) throw new Error();
      setNewNote("");
      showToast("Note added!");
      await onReload();
    } catch {
      showToast("Failed to add note.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-foreground text-background px-4 py-2.5 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Add note */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Add Note</h3>
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Type a note about this lead…"
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none bg-white"
        />
        <div className="flex justify-end mt-2">
          <Button onClick={addNote} disabled={adding || !newNote.trim()} size="sm" className="gap-1.5">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Note
          </Button>
        </div>
      </div>

      {/* Search */}
      {notes.length > 2 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      )}

      {/* Notes list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <StickyNote className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{search ? "No notes match your search." : "No notes yet — add the first one above."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              {note.timestamp && (
                <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">{note.timestamp}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{note.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
  lead_created: "🟢", lead_imported: "📥", status_changed: "🔄", note_added: "📝",
  email_sent: "📧", task_created: "✅", task_completed: "🎯", follow_up_changed: "⏰",
  sms_sent: "📤", sms_received: "📩", sms_attempted: "📱",
  call_initiated: "📞", call_received: "📲",
  proposal_generated: "📄", sow_generated: "📋",
  sms_opt_out: "🚫", sms_opt_in: "✅",
};

function formatRelative(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: days > 365 ? "numeric" : undefined });
}

function groupByDate(activities: WorkspaceActivity[]) {
  const groups: { label: string; items: WorkspaceActivity[] }[] = [];
  const seen = new Map<string, number>();
  for (const a of activities) {
    const d = new Date(a.createdAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const idx = seen.get(label);
    if (idx !== undefined) {
      groups[idx].items.push(a);
    } else {
      seen.set(label, groups.length);
      groups.push({ label, items: [a] });
    }
  }
  return groups;
}

function HistoryTab({ activities, tasks }: { activities: WorkspaceActivity[]; tasks: WorkspaceTask[] }) {
  const allItems = useMemo(() => {
    const taskActivities: WorkspaceActivity[] = tasks
      .filter(t => t.completedAt)
      .map(t => ({
        id: t.id + 100000,
        type: "task_completed",
        title: `Task completed: ${t.title}`,
        description: t.type,
        createdAt: t.completedAt!,
      }));
    return [...activities, ...taskActivities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activities, tasks]);

  const groups = useMemo(() => groupByDate(allItems), [allItems]);

  if (allItems.length === 0) {
    return (
      <div className="p-5 text-center py-12">
        <History className="w-8 h-8 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No activity yet for this lead.</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="space-y-5">
        {groups.map(group => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="space-y-2">
              {group.items.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2">
                  <span className="text-base shrink-0 mt-0.5">{ACTIVITY_ICONS[a.type] || "•"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{a.title}</p>
                    {a.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{formatRelative(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ lead }: { lead: WorkspaceLead }) {
  const docStats = [
    { label: "Discovery Form", status: lead.discoveryFormStatus },
    { label: "Proposal", status: lead.proposalStatus },
    { label: "Scope of Work", status: lead.sowStatus },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Stage tracker */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
        <StageTracker lead={lead} />
      </div>

      {/* Deal summary */}
      <div className="grid sm:grid-cols-2 gap-3">
        {lead.estimatedValue && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Est. Value</p>
              <p className="text-sm font-semibold text-foreground">
                ${Number(lead.estimatedValue).toLocaleString()}
              </p>
            </div>
          </div>
        )}
        {lead.packageType && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Package</p>
              <p className="text-sm font-semibold text-foreground">{lead.packageType}</p>
            </div>
          </div>
        )}
        {lead.serviceInterest && (
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Service</p>
              <p className="text-sm font-semibold text-foreground">{lead.serviceInterest}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Source</p>
            <p className="text-sm font-semibold text-foreground">{lead.source}</p>
          </div>
        </div>
      </div>

      {/* Document statuses */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Document Pipeline</h3>
        <div className="space-y-2.5">
          {docStats.map(d => (
            <div key={d.label} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{d.label}</span>
              <StatusBadge status={d.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Discovery link */}
      {lead.discoverySubmissionId && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-sm text-blue-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Discovery submission linked — proposals will be generated from the full form data.</span>
        </div>
      )}
    </div>
  );
}

// ── Workflow Tab ──────────────────────────────────────────────────────────────

function WorkflowTab({ lead, activities, tasks }: {
  lead: WorkspaceLead;
  activities: WorkspaceActivity[];
  tasks: WorkspaceTask[];
}) {
  const steps = useMemo(
    () => computeWorkflowSteps(lead, activities, tasks),
    [lead, activities, tasks],
  );
  const action = useMemo(
    () => computeNextBestAction(lead, activities, tasks, steps),
    [lead, activities, tasks, steps],
  );

  const priorityConfig: Record<ActionPriority, {
    badge: string; card: string; icon: React.ElementType; ring: string;
  }> = {
    critical: {
      badge: "bg-red-100 text-red-700 border-red-200",
      card: "border-red-200 bg-red-50",
      ring: "ring-red-200",
      icon: AlertCircle,
    },
    high: {
      badge: "bg-orange-100 text-orange-700 border-orange-200",
      card: "border-orange-200 bg-orange-50",
      ring: "ring-orange-200",
      icon: Zap,
    },
    medium: {
      badge: "bg-yellow-100 text-yellow-700 border-yellow-200",
      card: "border-yellow-200 bg-yellow-50",
      ring: "ring-yellow-200",
      icon: Clock,
    },
    low: {
      badge: "bg-gray-100 text-gray-600 border-gray-200",
      card: "border-gray-200 bg-gray-50",
      ring: "ring-gray-200",
      icon: CheckCircle2,
    },
  };

  const pc = priorityConfig[action.priority] ?? priorityConfig.low;
  const PIcon = pc.icon;

  return (
    <div className="p-5 space-y-5">

      {/* Next Best Action ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 ${pc.card}`}>
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <PIcon className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide text-foreground/70">
              Next Best Action
            </span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase shrink-0 ${pc.badge}`}>
            {action.priority}
          </span>
        </div>
        <h3 className="font-semibold text-foreground mb-1 leading-snug">{action.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{action.description}</p>
        <p className="text-xs text-muted-foreground/70 mt-1.5 italic">Reason: {action.reason}</p>
        {action.actionHint && (
          <p className="text-xs font-medium text-muted-foreground mt-2 pt-2 border-t border-black/5">
            💡 {action.actionHint}
          </p>
        )}
      </div>

      {/* Pre-Sale Workflow Timeline ───────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Pre-Sale Workflow
          </h3>
          <span className="text-[10px] text-muted-foreground">
            — {steps.filter(s => s.completed).length} of {steps.length} steps complete
          </span>
        </div>

        <div className="relative pl-2">
          {/* Vertical connector line */}
          <div className="absolute left-5 top-3 bottom-3 w-px bg-gray-100" />

          <div className="space-y-0">
            {steps.map(step => (
              <div key={step.id} className="flex items-start gap-3.5 py-2.5 relative">
                {/* Step indicator */}
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                  step.status === "completed"
                    ? "border-green-400 bg-green-400"
                    : step.status === "active"
                    ? "border-gray-900 bg-gray-900"
                    : step.status === "skipped"
                    ? "border-gray-200 bg-gray-100"
                    : "border-gray-200 bg-white"
                }`}>
                  {step.status === "completed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  ) : step.status === "active" ? (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-gray-200" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-sm leading-snug ${
                        step.status === "completed"
                          ? "text-foreground font-medium"
                          : step.status === "active"
                          ? "text-foreground font-semibold"
                          : step.status === "skipped"
                          ? "text-muted-foreground/50 line-through"
                          : "text-muted-foreground"
                      }`}>
                        {step.title}
                      </p>

                      {step.status === "completed" && step.completedAt && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(step.completedAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                          {" · "}
                          {step.completedBy}
                          {" · "}
                          <span className="capitalize">
                            {step.source === "sales_workspace" ? "Workspace" :
                             step.source === "discovery" ? "Discovery" : "CRM"}
                          </span>
                        </p>
                      )}

                      {step.status === "active" && step.recommendedAction && (
                        <p className="text-[11px] text-orange-600 font-medium mt-0.5">
                          → {step.recommendedAction}
                        </p>
                      )}
                    </div>

                    {step.status === "completed" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">
                        ✓ Done
                      </span>
                    )}
                    {step.status === "active" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-medium shrink-0">
                        Active
                      </span>
                    )}
                    {step.status === "skipped" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium shrink-0">
                        Skipped
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rule Engine Legend ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
          About This Engine
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Workflow steps and next actions are computed in real-time from lead status, activity history,
          proposal state, and follow-up dates. No AI — transparent rules only. Updates immediately
          when you change status, generate documents, or log activity.
        </p>
      </div>

    </div>
  );
}

// ── Communications Tab ────────────────────────────────────────────────────────

function CommunicationsTab({ lead, activities }: {
  lead: WorkspaceLead;
  activities: WorkspaceActivity[];
}) {
  const [msgs, setMsgs] = useState<CiMessage[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const t = tk();
    fetch(`/api/crm/leads/${lead.id}/messages`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((d: { messages?: CiMessage[] }) => setMsgs(d.messages ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [lead.id]);

  const ciLead: CiLead = {
    id: lead.id,
    status: lead.status,
    lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    proposalStatus: lead.proposalStatus,
  };

  const stats = useMemo(
    () => computeCommunicationStats(ciLead, activities, msgs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, activities, msgs],
  );
  const recs: CommunicationRecommendation[] = useMemo(
    () => computeCommunicationRecommendations(ciLead, activities, msgs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, activities, msgs],
  );

  const timeline = useMemo(() => {
    const COMM_TYPES = [
      "email_sent", "sms_attempted", "sms_sent", "sms_received",
      "call_initiated", "call_received", "sms_opt_out", "sms_opt_in",
    ];
    const iconMap: Record<string, string> = {
      email_sent: "📧", sms_attempted: "📱", sms_sent: "📤", sms_received: "📩",
      call_initiated: "📞", call_received: "📲", sms_opt_out: "🚫", sms_opt_in: "✅",
    };

    type TItem = {
      key: string; icon: string; direction: string; channel: string;
      summary: string; status?: string; timestamp: string;
    };

    const items: TItem[] = [];

    for (const m of msgs) {
      const isCall = m.channel === "call";
      items.push({
        key: `msg-${m.id}`,
        icon: isCall
          ? (m.direction === "inbound" ? "📲" : "📞")
          : (m.direction === "inbound" ? "📩" : "📤"),
        direction: m.direction,
        channel: isCall ? "call" : "sms",
        summary: isCall
          ? `Call${m.callStatus ? ` — ${m.callStatus}` : ""}${m.duration ? ` (${m.duration}s)` : ""}`
          : ((m.body ?? "SMS message").slice(0, 120)),
        status: m.status ?? m.callStatus,
        timestamp: m.createdAt,
      });
    }

    for (const a of activities) {
      if (!COMM_TYPES.includes(a.type)) continue;
      items.push({
        key: `act-${a.id}`,
        icon: iconMap[a.type] ?? "💬",
        direction: ["sms_received", "call_received"].includes(a.type) ? "inbound" : "outbound",
        channel: a.type.startsWith("email") ? "email" : a.type.startsWith("call") ? "call" : "sms",
        summary: a.title + (a.description ? ` — ${a.description.slice(0, 80)}` : ""),
        timestamp: a.createdAt,
      });
    }

    const seen = new Set<string>();
    return items
      .filter(i => { if (seen.has(i.key)) return false; seen.add(i.key); return true; })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [msgs, activities]);

  const { engagementScore: es, responseRate: rr, preferredChannel, replyRisk, status } = stats;

  const riskBadge: Record<string, string> = {
    Low:    "text-green-700  bg-green-50  border-green-200",
    Medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
    High:   "text-red-700    bg-red-50    border-red-200",
  };
  const statusColor: Record<string, string> = {
    Engaged: "text-green-700", "Waiting for Reply": "text-blue-700",
    "Needs Follow-up": "text-orange-700", Cold: "text-red-700", New: "text-gray-600",
  };
  const chanIcon: Record<string, string> = { SMS: "📱", Email: "📧", Call: "📞", Unknown: "—" };
  const priorityStyle = (p: string) =>
    p === "high"   ? "bg-orange-50 border-orange-200" :
    p === "medium" ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200";

  return (
    <div className="p-5 space-y-5">

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <div className={`rounded-xl border p-4 ${es.bgColor} ${es.borderColor}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-foreground/60">
            Communication Intelligence
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${es.bgColor} ${es.color} ${es.borderColor}`}>
            {es.badge}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Engagement</p>
            <p className={`text-2xl font-bold leading-none ${es.color}`}>
              {es.score}<span className="text-xs font-normal text-muted-foreground">/100</span>
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5 overflow-hidden">
              <div className={`h-1 rounded-full ${es.barColor}`} style={{ width: `${es.score}%` }} />
            </div>
          </div>

          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Response Rate</p>
            <p className="text-2xl font-bold leading-none text-foreground">{rr.rate}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {rr.inboundCount} reply · {rr.outboundCount} sent
            </p>
          </div>

          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Preferred</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {chanIcon[preferredChannel]} {preferredChannel}
            </p>
          </div>

          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Reply Risk</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${riskBadge[replyRisk]}`}>
              {replyRisk}
            </span>
          </div>

          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
            <p className={`text-xs font-semibold mt-0.5 ${statusColor[status] ?? "text-foreground"}`}>{status}</p>
          </div>

          <div className="bg-white/70 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Last Reply</p>
            <p className="text-xs text-foreground mt-0.5">
              {rr.daysSinceLastResponse !== undefined ? `${rr.daysSinceLastResponse}d ago` : "—"}
            </p>
          </div>
        </div>

        {es.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {es.reasons.map((r, i) => (
              <span key={i} className="text-[10px] bg-white/60 border border-black/10 rounded px-1.5 py-0.5 text-foreground/70">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Recommendations ──────────────────────────────────────────────── */}
      {recs.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2.5">
            Recommendations
          </h3>
          <div className="space-y-2">
            {recs.map(rec => (
              <div key={rec.id} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 border text-sm ${priorityStyle(rec.priority)}`}>
                <span className="text-base shrink-0">
                  {rec.channel === "SMS" ? "📱" : rec.channel === "Call" ? "📞" : rec.channel === "Email" ? "📧" : "💡"}
                </span>
                <p className="text-foreground/90 leading-snug">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unified timeline ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Communication Timeline
          </h3>
          {fetching && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin ml-1" />}
        </div>

        {timeline.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {fetching ? "Loading messages…" : "No communication history recorded yet."}
          </div>
        ) : (
          <div className="space-y-1.5">
            {timeline.map(item => (
              <div
                key={item.key}
                className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border text-sm ${
                  item.direction === "inbound"
                    ? "bg-blue-50/50 border-blue-100"
                    : "bg-gray-50 border-gray-100"
                }`}
              >
                <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase ${
                      item.direction === "inbound" ? "text-blue-700" : "text-gray-500"
                    }`}>
                      {item.direction === "inbound" ? "← Inbound" : "→ Outbound"}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">{item.channel}</span>
                    {item.status && !["delivered", "received", "completed"].includes(item.status.toLowerCase()) && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        item.status === "failed" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {item.status}
                      </span>
                    )}
                  </div>
                  <p className="text-foreground/80 leading-snug text-xs break-words">{item.summary}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                  {new Date(item.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Intelligence Tab ──────────────────────────────────────────────────────────

function IntelligenceTab({ lead, activities, tasks }: {
  lead: WorkspaceLead;
  activities: WorkspaceActivity[];
  tasks: WorkspaceTask[];
}) {
  const siLead: SiLead = {
    id: lead.id, name: lead.name, company: lead.company, status: lead.status,
    priority: "Medium",
    estimatedValue: lead.estimatedValue,
    lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt,
    proposalStatus: lead.proposalStatus,
    sowStatus: lead.sowStatus,
    generatedProposal: lead.generatedProposal,
    generatedSow: lead.generatedSow,
    discoverySubmissionId: lead.discoverySubmissionId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
  const siActivities: SiActivity[] = activities.map(a => ({ type: a.type, createdAt: a.createdAt }));
  const siTasks: SiTask[] = tasks.map(t => ({
    status: t.status, dueDate: t.dueDate, completedAt: t.completedAt, createdAt: t.createdAt,
  }));

  const ciLead: CiLead = {
    id: lead.id, status: lead.status, lastContactedAt: lead.lastContactedAt,
    nextFollowUpAt: lead.nextFollowUpAt, proposalStatus: lead.proposalStatus,
  };
  const commStats = useMemo(() => computeCommunicationStats(ciLead, activities, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, activities]);

  const healthProxy = useMemo(() => {
    const now = Date.now(); const DAY = 86_400_000;
    let score = 50;
    if (lead.lastContactedAt) {
      const d = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
      if (d < 3) score += 20; else if (d < 7) score += 10;
      else if (d > 21) score -= 20; else if (d > 14) score -= 10;
    }
    if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) score -= 15;
    if (lead.generatedProposal) score += 10;
    if (lead.proposalStatus === "Signed") score += 20;
    return Math.max(0, Math.min(100, score));
  }, [lead]);

  const nba = useMemo(() => computeSalesNBA(siLead, siActivities, siTasks, healthProxy, commStats.engagementScore.score),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, activities, tasks, healthProxy]);

  const momentum = useMemo(() => computeLeadMomentum(siLead, siActivities, siTasks, healthProxy, commStats.engagementScore.score),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, activities, tasks, healthProxy]);

  const NBA_PRIORITY_STYLE = {
    critical: { border: "border-red-200 bg-red-50",   badge: "bg-red-50 text-red-700 border-red-200",    label: "🚨 Critical" },
    high:     { border: "border-orange-200 bg-orange-50", badge: "bg-orange-50 text-orange-700 border-orange-200", label: "🔥 High" },
    medium:   { border: "border-amber-200 bg-amber-50",   badge: "bg-yellow-50 text-yellow-700 border-yellow-200", label: "⚠️ Medium" },
    low:      { border: "border-gray-100 bg-gray-50",     badge: "bg-gray-50 text-gray-600 border-gray-200",       label: "· Low" },
  };
  const ps = NBA_PRIORITY_STYLE[nba.priority];

  return (
    <div className="p-5 space-y-5">

      {/* ── Next Best Action ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Next Best Action</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ps.badge}`}>{ps.label}</span>
        </div>
        <div className={`rounded-xl border ${ps.border} p-4`}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-5 h-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-foreground leading-tight">{nba.action}</p>
              <p className={`text-[10px] font-semibold mt-0.5 ${
                nba.urgency === "immediate" ? "text-red-600" :
                nba.urgency === "today"     ? "text-orange-600" :
                nba.urgency === "this-week" ? "text-amber-600" : "text-muted-foreground"
              }`}>
                {nba.urgency === "immediate" ? "🚨 Act now" :
                 nba.urgency === "today"     ? "📅 Do today" :
                 nba.urgency === "this-week" ? "📆 This week" : "· When ready"}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0 pt-px w-14">Why</span>
              <p className="text-xs text-muted-foreground leading-snug">{nba.reason}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0 pt-px w-14">Outcome</span>
              <p className="text-xs font-medium text-foreground leading-snug">{nba.expectedOutcome}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-black/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Confidence</span>
              <span className="text-[10px] font-bold text-foreground">{nba.confidence}%</span>
            </div>
            <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  nba.confidence >= 80 ? "bg-emerald-500" :
                  nba.confidence >= 60 ? "bg-amber-400" : "bg-gray-400"
                }`}
                style={{ width: `${nba.confidence}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Lead Momentum ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lead Momentum</p>
          <span className={`text-[10px] font-bold ${
            momentum.trend === "rising"    ? "text-emerald-600" :
            momentum.trend === "declining" ? "text-red-600"     : "text-muted-foreground"
          }`}>
            {momentum.trend === "rising" ? "↑ Rising" :
             momentum.trend === "declining" ? "↓ Declining" : "→ Stable"}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <div className="flex items-end gap-2 mb-1.5">
              <span className={`text-3xl font-bold leading-none ${
                momentum.score >= 65 ? "text-emerald-600" :
                momentum.score <= 35 ? "text-red-500"     : "text-amber-600"
              }`}>{momentum.score}</span>
              <span className="text-xs text-muted-foreground mb-0.5">/ 100</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  momentum.score >= 65 ? "bg-emerald-400" :
                  momentum.score <= 35 ? "bg-red-400"     : "bg-amber-400"
                }`}
                style={{ width: `${momentum.score}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">{momentum.explanation}</p>
          {(momentum.positiveSignals.length > 0 || momentum.negativeSignals.length > 0) && (
            <div className="space-y-1 pt-1 border-t border-gray-50">
              {momentum.positiveSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span className="text-emerald-700">{s}</span>
                </div>
              ))}
              {momentum.negativeSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-red-500 font-bold shrink-0">✗</span>
                  <span className="text-red-600">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Communication Snapshot ────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Communication Snapshot</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Engagement</p>
            <p className={`text-xl font-bold leading-tight ${commStats.engagementScore.color}`}>
              {commStats.engagementScore.score}
            </p>
            <p className="text-[10px] text-muted-foreground">/ 100</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-0.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Reply Risk</p>
            <p className={`text-sm font-bold ${
              commStats.replyRisk === "Low"    ? "text-emerald-600" :
              commStats.replyRisk === "Medium" ? "text-amber-600"   : "text-red-600"
            }`}>{commStats.replyRisk}</p>
            <p className="text-[10px] text-muted-foreground">Status: {commStats.status}</p>
          </div>
        </div>
      </div>

      {/* ── Engine Legend ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
          How This Works
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Next Best Action, momentum, and confidence are computed in real-time from lead status,
          activity history, proposal state, and contact recency. No AI — transparent rules only.
          Scores update immediately when you log activity or change lead data.
        </p>
      </div>

    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const WS_TABS: { id: WsTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",   label: "Overview",      icon: Star },
  { id: "workflow",        label: "Workflow",        icon: GitBranch },
  { id: "communications", label: "Communications",  icon: MessageSquare },
  { id: "proposal",       label: "Proposal",        icon: FileText },
  { id: "sow",        label: "Scope of Work", icon: ClipboardList },
  { id: "notes",      label: "Notes",         icon: StickyNote },
  { id: "history",    label: "History",       icon: History },
  { id: "documents",  label: "Documents",     icon: Folder },
  { id: "intelligence", label: "Intelligence", icon: Zap },
];

export function SalesWorkspace({ lead, activities, tasks, onReload }: SalesWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WsTab>("overview");

  const proposalCount = lead.generatedProposal ? 1 : 0;
  const sowCount = lead.generatedSow ? 1 : 0;
  const noteCount = useMemo(() => parseNotes(lead.notes).length, [lead.notes]);

  function getBadge(tab: WsTab): number | null {
    if (tab === "notes" && noteCount > 0) return noteCount;
    if (tab === "history" && activities.length > 0) return activities.length;
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded bg-foreground flex items-center justify-center">
            <ChevronRight className="w-3 h-3 text-background" />
          </div>
          <h2 className="font-serif font-bold text-base text-foreground">Sales Workspace</h2>
          {(proposalCount > 0 || sowCount > 0) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium ml-auto">
              {proposalCount > 0 && sowCount > 0 ? "Proposal + SOW ready" : proposalCount > 0 ? "Proposal ready" : "SOW ready"}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto -mb-px">
          {WS_TABS.map(tab => {
            const badge = getBadge(tab.id);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px shrink-0 ${
                  activeTab === tab.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {badge !== null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    activeTab === tab.id ? "bg-foreground text-background" : "bg-gray-100 text-gray-500"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab lead={lead} />}
      {activeTab === "workflow" && <WorkflowTab lead={lead} activities={activities} tasks={tasks} />}
      {activeTab === "communications" && <CommunicationsTab lead={lead} activities={activities} />}
      {activeTab === "proposal" && <DocPanel lead={lead} kind="proposal" onReload={onReload} />}
      {activeTab === "sow" && <DocPanel lead={lead} kind="sow" onReload={onReload} />}
      {activeTab === "notes" && <NotesTab lead={lead} onReload={onReload} />}
      {activeTab === "history" && <HistoryTab activities={activities} tasks={tasks} />}
      {activeTab === "intelligence" && <IntelligenceTab lead={lead} activities={activities} tasks={tasks} />}
      {activeTab === "documents" && (
        <div className="p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center mx-auto mb-4">
            <Folder className="w-6 h-6 text-gray-300" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Documents</h3>
          <p className="text-sm text-muted-foreground">
            File attachments, contracts, and client uploads are coming in a future phase.
          </p>
        </div>
      )}
    </div>
  );
}
