import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, Mail, MessageSquare, Phone, CheckSquare, Send, X,
  RefreshCw, Loader2, AlertCircle, CheckCircle2, Clock, Filter,
  Calendar, Edit3, Save,
} from "lucide-react";
import { CrmLayout } from "./CrmLayout";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";
import { MESSAGING_CONCEPTS } from "@/lib/messagingConcepts";

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

// A body that is not the shape this page expects is a failure too — not a
// reason to render an empty queue over messages that are really scheduled.
function pickMessages(body: unknown): ScheduledMessage[] | undefined {
  const list = body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;
  return Array.isArray(list) ? list as ScheduledMessage[] : undefined;
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
  sms:         "text-teal-600",
  call_prompt: "text-amber-600",
  task:        "text-muted-foreground",
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  queued:    "bg-teal-100 text-teal-700 border-teal-200",
  sent:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed:    "bg-red-100 text-red-700 border-red-200",
  canceled:  "bg-muted text-muted-foreground border-border",
  skipped:   "bg-amber-100 text-amber-700 border-amber-200",
  // Not an error and not a cancellation: a message too overdue to send by
  // itself, waiting for somebody to decide. Ringed so it reads differently
  // from the states a machine is still working through.
  held:      "bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-300",
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
      const r = await adminFetch(`/api/crm/campaigns/queue/${msg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: subject || null, body: body || null }),
      });
      if (!r.ok) { setError(`Message not saved. ${await responseFailureReason(r)}`); return; }
      onSaved({ subject: subject || null, body: body || null });
    } catch {
      setError(`Message not saved. ${failureReason(null)}`);
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
          className="w-full border border-input rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        />
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        placeholder="Message body…"
        className="w-full border border-input rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs border border-border rounded-lg hover:bg-accent transition-colors">Cancel</button>
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
  onReschedule,
  busy,
}: {
  msg: ScheduledMessage;
  onSendNow: (id: number) => void;
  onCancel: (id: number) => void;
  onEdited: (id: number, updates: Partial<ScheduledMessage>) => void;
  onReschedule: (leadId: number, leadName: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing]       = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // A held message can be acted on — that is the whole point of holding it.
  const canAct = ["scheduled", "queued", "held"].includes(msg.status);

  return (
    <div className={`border-b border-border/60 last:border-0 ${
      msg.status === "sent"    ? "bg-emerald-50/30" :
      msg.status === "failed"  ? "bg-red-50/30" :
      msg.status === "canceled"? "bg-muted/30 opacity-60" :
      ""
    }`}>
      <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 items-center px-4 py-3 text-xs">

        {/* Channel icon */}
        <ChannelIcon ch={msg.channel} cls={`w-4 h-4 shrink-0 ${CH_COLOR[msg.channel] ?? "text-muted-foreground/60"}`} />

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
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${STATUS_BADGE[msg.status] ?? "bg-muted text-muted-foreground border-border"}`}>
          {msg.status}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {canAct && (
            <>
              <button
                onClick={() => onReschedule(msg.leadId, msg.leadName)}
                title="Shift all upcoming messages for this contact"
                className="p-1 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
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
          {/* A hold is a decision waiting to be made, not a failure, and
              calling it an error would send somebody looking for a fault. */}
          <p className={`text-[10px] rounded px-2 py-1 border ${
            msg.status === "held"
              ? "text-amber-800 bg-amber-50 border-amber-200"
              : "text-red-600 bg-red-50 border-red-100"
          }`}>
            {msg.status === "held" ? "Held: " : "Error: "}{msg.lastError}
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

function pickScheduler(body: unknown): SchedulerStatus | undefined {
  if (!body || typeof body !== "object") return undefined;
  return typeof (body as { running?: unknown }).running === "boolean" ? body as SchedulerStatus : undefined;
}

export default function CrmCampaignQueue({ campaignId, campaignName, onBack }: Props) {
  // The queue and the scheduler's own health are two separate answers, and each
  // one is a `Load`. Before this, a failed read left the array empty and the
  // page showed six status tiles of 0 over "No messages in queue" and "0
  // messages total" — it told the operator nothing was scheduled when the queue
  // may well have been full.
  const [messagesLoad, setMessagesLoad] = useState<Load<ScheduledMessage[]>>({ status: "loading" });
  const [schedulerLoad, setSchedulerLoad] = useState<Load<SchedulerStatus>>({ status: "loading" });
  const [reloading,  setReloading]  = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [busyId,     setBusyId]     = useState<number | null>(null);
  const [feedback,   setFeedback]   = useState<{ ok: boolean; text: string } | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<{ leadId: number; leadName: string } | null>(null);
  const [shiftDays,        setShiftDays]        = useState("7");
  const [rescheduling,     setRescheduling]     = useState(false);

  // What actually loaded, or null. Never an empty array standing in for a
  // request nobody managed to complete.
  const messages  = messagesLoad.status === "ready" ? messagesLoad.data : null;
  const scheduler = schedulerLoad.status === "ready" ? schedulerLoad.data : null;

  /** Apply a local change to the queue, only when there is a queue to change. */
  const updateMessages = (fn: (prev: ScheduledMessage[]) => ScheduledMessage[]) =>
    setMessagesLoad(prev => (prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev));

  const load = useCallback(async () => {
    setReloading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (campaignId)   params.set("campaignId", String(campaignId));
    setMessagesLoad(await readAdminResource(`/api/crm/campaigns/queue?${params}`, pickMessages));
    setReloading(false);
  }, [statusFilter, campaignId]);

  // The scheduler card is its own part of the page: it can fail while the queue
  // loads, and it says so rather than quietly disappearing.
  const loadScheduler = useCallback(async () => {
    setSchedulerLoad(await readAdminResource("/api/crm/campaigns/scheduler/status", pickScheduler));
  }, []);

  useEffect(() => { load(); loadScheduler(); }, [load, loadScheduler]);

  const runSchedulerNow = async () => {
    setRunningNow(true);
    setFeedback(null);
    try {
      const r = await adminFetch("/api/crm/campaigns/scheduler/run", {
        method: "POST",
      });
      if (!r.ok) { setFeedback({ ok: false, text: `The scheduler was not run. ${await responseFailureReason(r)}` }); return; }
      const d = await r.json().catch(() => ({})) as { processed?: number; skipped?: number; errors?: number };
      setFeedback({ ok: true, text: `Scheduler ran: ${d.processed ?? 0} sent, ${d.skipped ?? 0} skipped, ${d.errors ?? 0} errors.` });
      await load();
      await loadScheduler();
    } catch {
      setFeedback({ ok: false, text: `The scheduler was not run. ${failureReason(null)}` });
    } finally {
      setRunningNow(false);
    }
  };

  const sendNow = async (id: number) => {
    setBusyId(id);
    setFeedback(null);
    try {
      const r = await adminFetch(`/api/crm/campaigns/queue/${id}/send-now`, {
        method: "POST",
      });
      if (!r.ok) { setFeedback({ ok: false, text: `Message not sent. ${await responseFailureReason(r)}` }); return; }
      const d = await r.json().catch(() => ({})) as { testMode?: boolean };
      updateMessages(prev => prev.map(m => m.id === id ? { ...m, status: "sent", sentAt: new Date().toISOString() } : m));
      setFeedback({ ok: true, text: d.testMode ? "Simulated send (test mode active)." : "Message sent successfully." });
    } catch {
      setFeedback({ ok: false, text: `Message not sent. ${failureReason(null)}` });
    } finally {
      setBusyId(null);
    }
  };

  // A cancel that failed must not grey the row out: the message is still
  // scheduled, and the next refresh would bring it back with no explanation.
  const cancelMsg = async (id: number) => {
    setFeedback(null);
    try {
      const r = await adminFetch(`/api/crm/campaigns/queue/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) { setFeedback({ ok: false, text: `Message not canceled. ${await responseFailureReason(r)}` }); return; }
      updateMessages(prev => prev.map(m => m.id === id ? { ...m, status: "canceled" } : m));
    } catch {
      setFeedback({ ok: false, text: `Message not canceled. ${failureReason(null)}` });
    }
  };

  const onEdited = (id: number, updates: Partial<ScheduledMessage>) => {
    updateMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const rescheduleAll = useCallback(async () => {
    if (!rescheduleTarget) return;
    const days = Number(shiftDays);
    if (!Number.isFinite(days) || days === 0) {
      setFeedback({ ok: false, text: "Enter a non-zero number of days to shift." }); return;
    }
    setRescheduling(true);
    try {
      const r = await adminFetch(`/api/crm/campaigns/leads/${rescheduleTarget.leadId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ shiftDays: days }),
      });
      if (!r.ok) { setFeedback({ ok: false, text: `Nothing was rescheduled. ${await responseFailureReason(r)}` }); return; }
      const d = await r.json().catch(() => ({})) as { messages?: unknown; updated?: unknown };
      const updated = d.messages;
      if (!Array.isArray(updated) || typeof d.updated !== "number") {
        setFeedback({ ok: false, text: "The reschedule ran, but the server's answer was not in the expected shape." });
        return;
      }
      const shifted = updated as ScheduledMessage[];
      const count = d.updated;
      setMessagesLoad(prev => (prev.status === "ready"
        ? { status: "ready", data: prev.data.map(m => shifted.find(u => u.id === m.id) ?? m) }
        : prev));
      const sign = days > 0 ? "+" : "";
      setFeedback({ ok: true, text: `Shifted ${count} message${count !== 1 ? "s" : ""} for ${rescheduleTarget.leadName} by ${sign}${days} day${Math.abs(days) !== 1 ? "s" : ""}.` });
      setRescheduleTarget(null);
    } catch {
      setFeedback({ ok: false, text: `Nothing was rescheduled. ${failureReason(null)}` });
    } finally {
      setRescheduling(false);
    }
  }, [rescheduleTarget, shiftDays]);

  // Summary counts — or null. A tile of 0 for a queue nobody could read is a
  // claim about what is scheduled that nobody checked.
  const counts = messages
    ? messages.reduce<Record<string, number>>((acc, m) => {
        acc[m.status] = (acc[m.status] ?? 0) + 1;
        return acc;
      }, {})
    : null;

  const STATUSES = ["scheduled", "queued", "held", "sent", "failed", "canceled", "skipped"];

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {campaignId ? "Sequence" : "All sequences"}
            </button>
            <span className="text-muted-foreground/40">/</span>
            <div>
              <h1 className="text-lg font-bold font-serif text-foreground leading-tight">
                {campaignName ? `${campaignName} — Queue` : MESSAGING_CONCEPTS.queue.name}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {campaignName
                  ? "Every message this sequence has scheduled, one row per message per contact."
                  : MESSAGING_CONCEPTS.queue.summary}
              </p>
            </div>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${reloading || messagesLoad.status === "loading" ? "animate-spin" : ""}`} />
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

        {/* Bulk reschedule confirmation panel */}
        {rescheduleTarget && (
          <div className="flex flex-wrap items-center gap-3 text-xs rounded-xl px-4 py-3 border border-amber-200 bg-amber-50">
            <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-800">
              Shift all upcoming messages for <em>{rescheduleTarget.leadName}</em>?
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <input
                type="number"
                value={shiftDays}
                onChange={e => setShiftDays(e.target.value)}
                className="w-16 text-center border border-input rounded px-1.5 py-1 text-xs"
                aria-label="Days to shift"
              />
              <span className="text-amber-700">days (negative = earlier)</span>
              <button
                onClick={rescheduleAll}
                disabled={rescheduling}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 font-semibold transition-colors"
              >
                {rescheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Confirm shift
              </button>
              <button
                onClick={() => setRescheduleTarget(null)}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Scheduler status card */}
        {!campaignId && scheduler && (
          <div className="flex items-center gap-4 bg-white border border-border rounded-xl px-4 py-3 text-xs">
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

        {/* The scheduler card is one part of this page; a failed read names it. */}
        {!campaignId && schedulerLoad.status === "error" && (
          <LoadFailure
            what="Auto-Send Scheduler status"
            reason={schedulerLoad.reason}
            variant="inline"
            onRetry={() => { void loadScheduler(); }}
          />
        )}

        {/*
          Status summary tiles. Each figure exists only when the queue behind it
          loaded — this row is where the page used to state confident zeros
          about a request that had failed. The incoming side widened this grid
          for a seventh status, so the wider grid is kept.
        */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`min-w-0 rounded-xl border p-2.5 text-center transition-all ${
                statusFilter === s
                  ? `${STATUS_BADGE[s]} shadow-sm`
                  : "bg-white border-border hover:bg-accent"
              }`}
            >
              <p className="text-lg font-black text-foreground">
                <Figure value={counts ? (counts[s] ?? 0) : null} loading={messagesLoad.status === "loading"} />
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5 break-words">{s}</p>
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
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${!statusFilter ? "bg-[#1e293b] text-white" : "bg-muted text-muted-foreground hover:bg-accent"}`}
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
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {messagesLoad.status === "loading" ? (
          <div className="animate-pulse space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Loading the send queue…</span>
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
          </div>
        ) : messages === null ? (
          /*
            No queue at all, rather than an empty table under six zeros. An
            empty queue and an unanswered request must never look alike — and a
            401, 403, 404, 5xx or unreachable server each reads differently
            here, because the words come from the response.
          */
          <LoadFailure
            what="The send queue"
            reason={messagesLoad.status === "error" ? messagesLoad.reason : ""}
            onRetry={() => { void load(); }}
            retrying={reloading}
          >
            <p className="mt-2 text-sm text-muted-foreground">
              No status tallies and no message total are shown while this is unavailable — messages may well be scheduled.
            </p>
          </LoadFailure>
        ) : messages.length === 0 ? (
          <div className="bg-muted border border-border rounded-xl p-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">No messages in queue</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter ? `No "${statusFilter}" messages found.` : "Enroll contacts in a sequence to start scheduling messages."}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted border-b border-border/60">
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
                onReschedule={(leadId, leadName) => { setRescheduleTarget({ leadId, leadName }); setShiftDays("7"); }}
                busy={busyId === msg.id}
              />
            ))}
          </div>
        )}

        {/* The total exists only when the queue behind it loaded. */}
        <p className="text-[10px] text-muted-foreground text-center break-words">
          {messages
            ? <>{messages.length} message{messages.length !== 1 ? "s" : ""} {statusFilter ? `with status "${statusFilter}"` : "total"}</>
            : <><Figure value={null} loading={messagesLoad.status === "loading"} /> messages {statusFilter ? `with status "${statusFilter}"` : "total"}</>}
        </p>
      </div>
    </CrmLayout>
  );
}
