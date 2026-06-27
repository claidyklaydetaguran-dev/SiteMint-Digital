import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Mail, MessageSquare,
  Phone, CheckSquare, Clock, Calendar, Users, Play, Pause, StopCircle,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
} from "lucide-react";
import { CrmLayout } from "./CrmLayout";

const tok = () => localStorage.getItem("adminToken") || "";
const authH = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampaignStep {
  id: number;
  campaignId: number;
  stepNumber: number;
  dayOffset: number;
  channel: string;
  subject: string | null;
  body: string | null;
  callPrompt: string | null;
  taskDescription: string | null;
  sendTime: string;
  businessDaysOnly: boolean;
  createdAt: string;
}

interface EnrolledRecipient {
  id: number;
  leadId: number;
  leadName: string;
  leadEmail: string;
  enrollmentStatus: string;
  currentStep: number;
  enrolledAt: string | null;
  scheduledCount: number;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  company?: string;
  status: string;
}

// ── Channel helpers ───────────────────────────────────────────────────────────

const CHANNELS = ["email", "sms", "call_prompt", "task"] as const;
const SEND_TIMES = ["immediate", "morning", "afternoon", "evening"] as const;

function ChannelIcon({ ch, cls = "w-4 h-4" }: { ch: string; cls?: string }) {
  if (ch === "email")       return <Mail className={cls} />;
  if (ch === "sms")         return <MessageSquare className={cls} />;
  if (ch === "call_prompt") return <Phone className={cls} />;
  return <CheckSquare className={cls} />;
}

const CH_COLOR: Record<string, string> = {
  email:       "bg-blue-100 text-blue-700 border-blue-200",
  sms:         "bg-violet-100 text-violet-700 border-violet-200",
  call_prompt: "bg-amber-100 text-amber-700 border-amber-200",
  task:        "bg-gray-100 text-gray-600 border-gray-200",
};

const ENROLL_COLOR: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused:    "bg-amber-100 text-amber-700 border-amber-200",
  stopped:   "bg-red-100 text-red-700 border-red-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Step Card ─────────────────────────────────────────────────────────────────

function StepCard({
  step,
  onEdit,
  onDelete,
}: {
  step: CampaignStep;
  onEdit: (s: CampaignStep) => void;
  onDelete: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="w-7 h-7 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-xs font-bold shrink-0">
          {step.stepNumber}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${CH_COLOR[step.channel] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
          <ChannelIcon ch={step.channel} cls="w-3 h-3" />
          {step.channel.replace("_", " ")}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Calendar className="w-3 h-3" />
          Day {step.dayOffset}
        </div>
        {step.sendTime !== "immediate" && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {step.sendTime}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onEdit(step)}
            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          {confirmDel ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-red-600 font-semibold">Delete?</span>
              <button
                disabled={deleting}
                onClick={async () => { setDeleting(true); await onDelete(step.id); }}
                className="text-[10px] font-bold text-red-600 hover:text-red-800 disabled:opacity-40"
              >
                {deleting ? "…" : "Yes"}
              </button>
              <button onClick={() => setConfirmDel(false)} className="text-[10px] text-muted-foreground">No</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="text-[10px] font-semibold text-red-500 hover:text-red-700 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="px-4 py-3 space-y-1">
        {step.subject && (
          <p className="text-xs font-semibold text-foreground">{step.subject}</p>
        )}
        {step.body && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans line-clamp-3">
            {step.body}
          </pre>
        )}
        {step.callPrompt && (
          <p className="text-xs text-amber-700 font-medium">Prompt: {step.callPrompt}</p>
        )}
        {step.taskDescription && (
          <p className="text-xs text-gray-600">Task: {step.taskDescription}</p>
        )}
        {step.businessDaysOnly && (
          <p className="text-[10px] text-muted-foreground">Business days only</p>
        )}
      </div>
    </div>
  );
}

// ── Step Form (create / edit) ─────────────────────────────────────────────────

interface StepFormProps {
  campaignId: number;
  existing?: CampaignStep | null;
  stepCount: number;
  onSaved: (s: CampaignStep) => void;
  onCancel: () => void;
}

function StepForm({ campaignId, existing, stepCount, onSaved, onCancel }: StepFormProps) {
  const [stepNumber,       setStepNumber]       = useState(existing?.stepNumber ?? stepCount + 1);
  const [dayOffset,        setDayOffset]        = useState(existing?.dayOffset ?? (stepCount === 0 ? 0 : 3));
  const [channel,          setChannel]          = useState<string>(existing?.channel ?? "email");
  const [subject,          setSubject]          = useState(existing?.subject ?? "");
  const [body,             setBody]             = useState(existing?.body ?? "");
  const [callPrompt,       setCallPrompt]       = useState(existing?.callPrompt ?? "");
  const [taskDescription,  setTaskDescription]  = useState(existing?.taskDescription ?? "");
  const [sendTime,         setSendTime]         = useState<string>(existing?.sendTime ?? "immediate");
  const [businessDaysOnly, setBusinessDaysOnly] = useState(existing?.businessDaysOnly ?? true);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const url    = existing ? `/api/crm/campaigns/${campaignId}/steps/${existing.id}` : `/api/crm/campaigns/${campaignId}/steps`;
      const method = existing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: authH(),
        body: JSON.stringify({
          stepNumber, dayOffset, channel, subject: subject || null,
          body: body || null,
          callPrompt: callPrompt || null,
          taskDescription: taskDescription || null,
          sendTime, businessDaysOnly,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to save step"); return; }
      onSaved(d.step);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-bold text-blue-900">{existing ? "Edit Step" : "New Sequence Step"}</h3>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Step #</label>
          <input
            type="number" min={1} value={stepNumber}
            onChange={e => setStepNumber(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Day Offset</label>
          <input
            type="number" min={0} value={dayOffset}
            onChange={e => setDayOffset(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Send Time</label>
          <select
            value={sendTime}
            onChange={e => setSendTime(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {SEND_TIMES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Channel</label>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(ch => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                channel === ch
                  ? `${CH_COLOR[ch]} shadow-sm`
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <ChannelIcon ch={ch} cls="w-3.5 h-3.5" />
              {ch.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {(channel === "email" || channel === "sms") && (
        <>
          {channel === "email" && (
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line…"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Message Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder={channel === "sms" ? "SMS message text…" : "Email body (plain text)…"}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
            />
          </div>
        </>
      )}

      {channel === "call_prompt" && (
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Call Prompt / Talk Track</label>
          <textarea
            value={callPrompt}
            onChange={e => setCallPrompt(e.target.value)}
            rows={3}
            placeholder="What should the rep say on this call?…"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
          />
        </div>
      )}

      {channel === "task" && (
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Task Description</label>
          <textarea
            value={taskDescription}
            onChange={e => setTaskDescription(e.target.value)}
            rows={2}
            placeholder="What task should be completed?…"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="bdo" type="checkbox" checked={businessDaysOnly}
          onChange={e => setBusinessDaysOnly(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="bdo" className="text-xs text-muted-foreground">Business days only</label>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1e293b] text-white text-xs font-semibold rounded-lg hover:bg-[#334155] disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : existing ? "Update Step" : "Add Step"}
        </button>
      </div>
    </div>
  );
}

// ── Lead Picker ───────────────────────────────────────────────────────────────

function LeadPicker({
  campaignId,
  onEnrolled,
}: {
  campaignId: number;
  onEnrolled: () => void;
}) {
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error,    setError]    = useState("");
  const [result,   setResult]   = useState<{ enrolled: number; scheduled: number } | null>(null);

  useEffect(() => {
    fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(d => setLeads((d.leads ?? []).filter((l: Lead) => l.email && !l.email.includes("@imported.local"))))
      .catch(() => setError("Failed to load leads"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const enroll = async () => {
    setError("");
    setEnrolling(true);
    try {
      const r = await fetch(`/api/crm/campaigns/${campaignId}/enroll`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Failed to enroll"); return; }
      setResult({ enrolled: d.enrolled, scheduled: d.scheduled });
      setSelected(new Set());
      onEnrolled();
    } catch {
      setError("Network error");
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) return <div className="text-xs text-muted-foreground p-4 animate-pulse">Loading contacts…</div>;

  return (
    <div className="space-y-3">
      {result && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Enrolled {result.enrolled} contacts · {result.scheduled} messages scheduled
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
        {leads.map(l => (
          <label key={l.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(l.id)}
              onChange={() => toggle(l.id)}
              className="rounded"
            />
            <div>
              <p className="text-xs font-semibold text-foreground">{l.name}</p>
              <p className="text-[10px] text-muted-foreground">{l.email}</p>
            </div>
            {l.company && <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[100px]">{l.company}</span>}
          </label>
        ))}
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground p-4 text-center">No leads with valid email addresses found.</p>
        )}
      </div>
      <button
        onClick={enroll}
        disabled={!selected.size || enrolling}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
        {enrolling ? "Enrolling…" : `Enroll ${selected.size || ""} Contact${selected.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  campaignId: number;
  campaignName: string;
  campaignType: string;
  onBack: () => void;
}

export default function CrmCampaignSequence({ campaignId, campaignName, campaignType, onBack }: Props) {
  const [steps,      setSteps]      = useState<CampaignStep[]>([]);
  const [recipients, setRecipients] = useState<EnrolledRecipient[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [activeTab,    setActiveTab]    = useState<"steps" | "enroll" | "recipients">("steps");
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep,  setEditingStep]  = useState<CampaignStep | null>(null);
  const [updatingRid,  setUpdatingRid]  = useState<number | null>(null);
  const [expandEnroll, setExpandEnroll] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const h = { Authorization: `Bearer ${tok()}` };
      const [sr, rr] = await Promise.all([
        fetch(`/api/crm/campaigns/${campaignId}/steps`,      { headers: h }).then(r => r.json()),
        fetch(`/api/crm/campaigns/${campaignId}/recipients`, { headers: h }).then(r => r.json()),
      ]);
      setSteps(sr.steps ?? []);
      // Enrich recipients
      const recs = (rr.recipients ?? rr.campaign?.recipients ?? []);
      setRecipients(
        recs.map((r: EnrolledRecipient & { leadName?: string; leadEmail?: string; name?: string; email?: string }) => ({
          ...r,
          leadName:  r.leadName  ?? r.name  ?? `Lead #${r.leadId}`,
          leadEmail: r.leadEmail ?? r.email ?? "",
        }))
      );
    } catch {
      setError("Failed to load sequence data");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const onStepSaved = (step: CampaignStep) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === step.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = step;
        return next.sort((a, b) => a.stepNumber - b.stepNumber || a.dayOffset - b.dayOffset);
      }
      return [...prev, step].sort((a, b) => a.stepNumber - b.stepNumber || a.dayOffset - b.dayOffset);
    });
    setShowStepForm(false);
    setEditingStep(null);
  };

  const deleteStep = async (id: number) => {
    await fetch(`/api/crm/campaigns/${campaignId}/steps/${id}`, {
      method: "DELETE",
      headers: authH(),
    });
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const updateEnrollmentStatus = async (rid: number, enrollmentStatus: string) => {
    setUpdatingRid(rid);
    try {
      await fetch(`/api/crm/campaigns/${campaignId}/recipients/${rid}/status`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ enrollmentStatus }),
      });
      setRecipients(prev =>
        prev.map(r => r.id === rid ? { ...r, enrollmentStatus } : r)
      );
    } finally {
      setUpdatingRid(null);
    }
  };

  if (loading) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </CrmLayout>
    );
  }

  const typeColor: Record<string, string> = {
    nurture:   "bg-violet-100 text-violet-700 border border-violet-200",
    drip:      "bg-blue-100 text-blue-700 border border-blue-200",
    broadcast: "bg-gray-100 text-gray-600 border border-gray-200",
  };

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
            All Campaigns
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-sm font-bold text-foreground truncate max-w-xs">{campaignName}</h1>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${typeColor[campaignType] ?? "bg-gray-100 text-gray-600 border border-gray-200"}`}>
            {campaignType}
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(["steps", "recipients", "enroll"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "steps" && `Sequence Steps (${steps.length})`}
              {tab === "recipients" && `Enrolled (${recipients.length})`}
              {tab === "enroll" && "Enroll Contacts"}
            </button>
          ))}
        </div>

        {/* ── Steps Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "steps" && (
          <div className="space-y-3">
            {steps.length === 0 && !showStepForm && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                <Calendar className="w-8 h-8 text-blue-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-blue-900">No steps yet</p>
                <p className="text-xs text-blue-700 mt-1 mb-4">Add the first step in your sequence — Day 0 starts immediately on enrollment.</p>
                <button
                  onClick={() => { setShowStepForm(true); setEditingStep(null); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 mx-auto transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Step
                </button>
              </div>
            )}

            {steps.map(step => (
              editingStep?.id === step.id ? (
                <StepForm
                  key={step.id}
                  campaignId={campaignId}
                  existing={editingStep}
                  stepCount={steps.length}
                  onSaved={onStepSaved}
                  onCancel={() => setEditingStep(null)}
                />
              ) : (
                <StepCard
                  key={step.id}
                  step={step}
                  onEdit={s => { setEditingStep(s); setShowStepForm(false); }}
                  onDelete={deleteStep}
                />
              )
            ))}

            {showStepForm && !editingStep && (
              <StepForm
                campaignId={campaignId}
                existing={null}
                stepCount={steps.length}
                onSaved={onStepSaved}
                onCancel={() => setShowStepForm(false)}
              />
            )}

            {!showStepForm && !editingStep && steps.length > 0 && (
              <button
                onClick={() => setShowStepForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-xs font-semibold text-muted-foreground rounded-xl hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Step
              </button>
            )}

            {steps.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-muted-foreground mb-2">SEQUENCE TIMELINE</p>
                <div className="flex flex-col gap-1">
                  {steps.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs text-foreground">
                      <span className="w-6 h-6 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      <ChannelIcon ch={s.channel} cls="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{s.subject ?? s.channel.replace("_", " ")}</span>
                      <span className="text-muted-foreground ml-auto shrink-0">Day {s.dayOffset}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Enrolled Recipients Tab ─────────────────────────────────────────── */}
        {activeTab === "recipients" && (
          <div className="space-y-3">
            {recipients.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">No contacts enrolled yet</p>
                <p className="text-xs text-muted-foreground mt-1">Switch to "Enroll Contacts" to add people to this sequence.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {["Contact", "Email", "Enrollment", "Step", "Enrolled On", "Actions"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recipients.map(r => {
                      const isBusy = updatingRid === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-xs text-foreground">{r.leadName}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">{r.leadEmail}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ENROLL_COLOR[r.enrollmentStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                              {r.enrollmentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.currentStep ?? 0}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.enrolledAt ? fmtDate(r.enrolledAt) : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {r.enrollmentStatus === "active" && (
                                <>
                                  <button
                                    onClick={() => updateEnrollmentStatus(r.id, "paused")}
                                    disabled={isBusy}
                                    title="Pause"
                                    className="p-1 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-700 disabled:opacity-40 transition-colors"
                                  >
                                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => updateEnrollmentStatus(r.id, "stopped")}
                                    disabled={isBusy}
                                    title="Stop"
                                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                                  >
                                    <StopCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {r.enrollmentStatus === "paused" && (
                                <button
                                  onClick={() => updateEnrollmentStatus(r.id, "active")}
                                  disabled={isBusy}
                                  title="Resume"
                                  className="p-1 rounded hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700 disabled:opacity-40 transition-colors"
                                >
                                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Enroll Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "enroll" && (
          <div className="space-y-3">
            {steps.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                You must add at least one step before enrolling contacts.
              </div>
            )}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Enroll Contacts</h2>
                <button
                  onClick={() => setExpandEnroll(x => !x)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  {expandEnroll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expandEnroll ? "Collapse" : "Select contacts"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Contacts selected here will be enrolled into this sequence. A scheduled message is created for each step × contact.
              </p>
              {expandEnroll && steps.length > 0 && (
                <LeadPicker campaignId={campaignId} onEnrolled={() => { load(); setActiveTab("recipients"); }} />
              )}
              {!expandEnroll && (
                <button
                  onClick={() => setExpandEnroll(true)}
                  disabled={steps.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-xs font-semibold text-muted-foreground rounded-xl hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Select Contacts to Enroll
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </CrmLayout>
  );
}
