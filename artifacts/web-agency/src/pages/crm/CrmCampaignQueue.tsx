import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, Mail, MessageSquare, Phone, CheckSquare, Send, X,
  RefreshCw, Loader2, AlertCircle, CheckCircle2, Clock, Filter,
  Calendar, Edit3, Save,
} from "lucide-react";
import { CrmLayout } from "./CrmLayout";

const tok = () => localStorage.getItem("adminToken") || "";
const authH = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduledMessage {
  id: number;
  campaignId: number;
  campaignName: string;
  recipientId: number;
  stepId: number | null;
  leadId: number;
  leadName: string;
  leadEmail: string;
  channel: string;
  subject: string | null;
  body: string | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChannelIcon({ ch, cls = "w-4 h-4" }: { ch: string; cls?: string }) {
  if (ch === "email")       return <Mail className={cls} />;
  if (ch === "sms")         return <MessageSquare className={cls} />;
  if (ch === "call_prompt") return <Phone className={cls} />;
  return <CheckSquare className={cls} />;
}

const CH_COLOR: Record<string, string> = {
  email:       "text-blue-600",
  sms:         "text-violet-600",
  call_prompt: "text-amber-600",
  task:        "text-gray-500",
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  queued:    "bg-violet-100 text-violet-700 border-violet-200",
  sent:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  canceled:  "bg-gray-100 text-gray-500 border-gray-200",
  skipped:   "bg-amber-100 text-amber-700 border-amber-200",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Inline edit form ──────────────────────────────────────────────────────────

function InlineEdit({
  msg,
  onSaved,
  onCancel,
}: {
  msg: ScheduledMessage;
  onSaved: (updated: Partial<ScheduledMessage>) => void;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(msg.subject ?? "");
  const [body,    setBody]    = useState(msg.body ?? "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/crm/campaigns/queue/${msg.id}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ subject: subject || null, body: body || null }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to save"); return; }
      onSaved({ subject: subject || null, body: body || null });
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-blue-50 border-t border-blue-200 space-y-2">
      {msg.channel === "email" && (
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject…"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        />
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        placeholder="Message body…"
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
        <button
          onClick={save} disabled={saving}
          className="flex items-center gap-1 px-3 py-1 text-xs bg-[#1e293b] text-white rounded-lg hover:bg-[#334155] disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ── Message Row ───────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  onSendNow,
  onCancel,
  onEdited,
  busy,
}: {
  msg: ScheduledMessage;
  onSendNow: (id: number) => void;
  onCancel: (id: number) => void;
  onEdited: (id: number, updates: Partial<ScheduledMessage>) => void;
  busy: boolean;
}) {
  const [editing, setEditing]       = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const canAct = ["scheduled", "queued"].includes(msg.status);

  return (
    <div className={`border-b border-gray-100 last:border-0 ${
      msg.status === "sent"    ? "bg-emerald-50/30" :
      msg.status === "failed"  ? "bg-red-50/30" :
      msg.status === "canceled"? "bg-gray-50/30 opacity-60" :
      ""
    }`}>
      <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 items-center px-4 py-3 text-xs">

        {/* Channel icon */}
        <ChannelIcon ch={msg.channel} cls={`w-4 h-4 shrink-0 ${CH_COLOR[msg.channel] ?? "text-gray-400"}`} />

        {/* Contact + campaign */}
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{msg.leadName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{msg.campaignName}</p>
        </div>

        {/* Subject + body preview */}
        <div className="min-w-0">
          {msg.subject && <p className="font-medium text-foreground truncate">{msg.subject}</p>}
          {msg.body    && <p className="text-muted-foreground truncate">{msg.body}</p>}
          {!msg.subject && !msg.body && <p className="text-muted-foreground italic">{msg.channel.replace("_", " ")}</p>}
        </div>

        {/* Scheduled date */}
        <div className="text-muted-foreground text-[10px] whitespace-nowrap shrink-0">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {msg.scheduledAt ? fmtDateTime(msg.scheduledAt) : "—"}
          </div>
          {msg.sentAt && (
            <div className="flex items-center gap-1 text-emerald-600 mt-0.5">
              <Clock className="w-3 h-3" />
              Sent {fmtDate(msg.sentAt)}
            </div>
          )}
        </div>

        {/* Status badge */}
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${STATUS_BADGE[msg.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
          {msg.status}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {canAct && (
            <>
              <button
                onClick={() => setEditing(x => !x)}
                title="Edit"
                className="p-1 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onSendNow(msg.id)}
                disabled={busy}
                title="Send Now"
                className="p-1 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 disabled:opacity-40 transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
              {cancelConfirm ? (
                <>
                  <button
                    onClick={() => { onCancel(msg.id); setCancelConfirm(false); }}
                    className="text-[10px] font-bold text-red-600 px-1"
                  >Yes</button>
                  <button onClick={() => setCancelConfirm(false)} className="text-[10px] text-muted-foreground px-1">No</button>
                </>
              ) : (
                <button
                  onClick={() => setCancelConfirm(true)}
                  title="Cancel"
                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {msg.lastError && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
            Error: {msg.lastError}
          </p>
        </div>
      )}

      {editing && (
        <InlineEdit
          msg={msg}
          onSaved={updates => { onEdited(msg.id, updates); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  campaignId?: number;
  campaignName?: string;
  onBack: () => void;
}

interface SchedulerStatus {
  running: boolean;
  lastRunAt: string | null;
  lastRunProcessed: number;
  lastRunErrors: number;
  totalProcessed: number;
  totalErrors: number;
  totalSkipped: number;
}

export default function CrmCampaignQueue({ campaignId, campaignName, onBack }: Props) {
  const [messages,   setMessages]   = useState<ScheduledMessage[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [busyId,     setBusyId]     = useState<number | null>(null);
  const [feedback,   setFeedback]   = useState<{ ok: boolean; text: string } | null>(null);
  const [scheduler,  setScheduler]  = useState<SchedulerStatus | null>(null);
  const [runningNow, setRunningNow] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (campaignId)   params.set("campaignId", String(campaignId));
      const r = await fetch(`/api/crm/campaigns/queue?${params}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to load queue"); return; }
      setMessages(d.messages ?? []);
    } catch {
      setError("Network error loading queue");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, campaignId]);

  const loadScheduler = useCallback(async () => {
    try {
      const r = await fetch("/api/crm/campaigns/scheduler/status", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) setScheduler(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); loadScheduler(); }, [load, loadScheduler]);

  const runSchedulerNow = async () => {
    setRunningNow(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/crm/campaigns/scheduler/run", {
        method: "POST",
        headers: authH(),
      });
      const d = await r.json();
      if (r.ok) {
        setFeedback({ ok: true, text: `Scheduler ran: ${d.processed} sent, ${d.skipped} skipped, ${d.errors} errors.` });
        await load();
        await loadScheduler();
      } else {
        setFeedback({ ok: false, text: d.error ?? "Scheduler run failed" });
      }
    } catch {
      setFeedback({ ok: false, text: "Network error" });
    } finally {
      setRunningNow(false);
    }
  };

  const sendNow = async (id: number) => {
    setBusyId(id);
    setFeedback(null);
    try {
      const r = await fetch(`/api/crm/campaigns/queue/${id}/send-now`, {
        method: "POST",
        headers: authH(),
      });
      const d = await r.json();
      if (r.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "sent", sentAt: new Date().toISOString() } : m));
        setFeedback({ ok: true, text: d.testMode ? "Simulated send (test mode active)." : "Message sent successfully." });
      } else {
        setFeedback({ ok: false, text: d.error ?? "Failed to send" });
      }
    } catch {
      setFeedback({ ok: false, text: "Network error" });
    } finally {
      setBusyId(null);
    }
  };

  const cancelMsg = async (id: number) => {
    try {
      await fetch(`/api/crm/campaigns/queue/${id}`, {
        method: "DELETE",
        headers: authH(),
      });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "canceled" } : m));
    } catch { /* ignore */ }
  };

  const onEdited = (id: number, updates: Partial<ScheduledMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  // Summary counts
  const counts = messages.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  const STATUSES = ["scheduled", "queued", "sent", "failed", "canceled", "skipped"];

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {campaignId ? "Campaign" : "All Campaigns"}
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-sm font-bold text-foreground">
            {campaignName ? `${campaignName} — Message Queue` : "Global Message Queue"}
          </h1>
          <button
            onClick={load}
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-center gap-2 text-xs rounded-xl px-4 py-2.5 border ${
            feedback.ok
              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : "text-red-700 bg-red-50 border-red-200"
          }`}>
            {feedback.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            {feedback.text}
            <button onClick={() => setFeedback(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Scheduler status card */}
        {!campaignId && scheduler && (
          <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${scheduler.running ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
              <span className="font-semibold text-foreground">Auto-Send Scheduler</span>
              <span className="text-muted-foreground">{scheduler.running ? "Running…" : "Idle"}</span>
            </div>
            {scheduler.lastRunAt && (
              <span className="text-muted-foreground">
                Last run: {new Date(scheduler.lastRunAt).toLocaleTimeString()} —&nbsp;
                <span className="text-emerald-600 font-medium">{scheduler.totalProcessed} sent</span>
                {scheduler.totalSkipped > 0 && <span className="text-amber-600 font-medium">, {scheduler.totalSkipped} skipped</span>}
                {scheduler.totalErrors > 0 && <span className="text-red-600 font-medium">, {scheduler.totalErrors} errors</span>}
              </span>
            )}
            <button
              onClick={runSchedulerNow}
              disabled={runningNow || scheduler.running}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] text-white rounded-lg hover:bg-[#2d3e53] disabled:opacity-50 transition-colors font-semibold"
            >
              {runningNow ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Run Now
            </button>
          </div>
        )}

        {/* Status summary tiles */}
        <div className="grid grid-cols-6 gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`rounded-xl border p-2.5 text-center transition-all ${
                statusFilter === s
                  ? `${STATUS_BADGE[s]} shadow-sm`
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <p className="text-lg font-black text-foreground">{counts[s] ?? 0}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">{s}</p>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Filter:</span>
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
                  statusFilter === s
                    ? `${STATUS_BADGE[s]} shadow-sm`
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">No messages in queue</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter ? `No "${statusFilter}" messages found.` : "Enroll contacts in a sequence to start scheduling messages."}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              {["Ch", "Contact / Campaign", "Message", "Scheduled", "Status", "Actions"].map(h => (
                <p key={h} className="text-[10px] font-semibold text-muted-foreground">{h}</p>
              ))}
            </div>

            {messages.map(msg => (
              <MessageRow
                key={msg.id}
                msg={msg}
                onSendNow={sendNow}
                onCancel={cancelMsg}
                onEdited={onEdited}
                busy={busyId === msg.id}
              />
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          {messages.length} message{messages.length !== 1 ? "s" : ""} {statusFilter ? `with status "${statusFilter}"` : "total"}
        </p>
      </div>
    </CrmLayout>
  );
}
