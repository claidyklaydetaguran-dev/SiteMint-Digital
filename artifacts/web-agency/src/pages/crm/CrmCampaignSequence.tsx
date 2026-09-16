import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Mail, MessageSquare,
  Phone, CheckSquare, Clock, Calendar, Users, Play, Pause, StopCircle,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Wand2,
  Route, ListOrdered, Target, GitBranch, ShieldCheck, Send, Brain, Sparkles,
} from "lucide-react";
import { CrmLayout } from "./CrmLayout";
import {
  SITEMINT_CAMPAIGN_BLUEPRINTS,
  getBlueprintById,
  getTopicById,
  getPersonaById,
  type SitemintCampaignBlueprint,
} from "../../lib/campaignTaxonomy";
import { CrmCopilot, type ParsedStep } from "./CrmCopilot";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, PageLoadFailures, failedParts } from "@/components/crm/LoadState";

// ── Step Intelligence (embedded metadata) ─────────────────────────────────────
// crm_campaign_steps has no metadata column, so per-step strategy metadata is
// stored as a structured, clearly-marked block appended to the step body. This
// keeps the data persistable with zero schema change. parse/serialize round-trip
// the block so the editable body stays clean.

export interface StepIntel {
  objective: string;
  desiredBehavior: string;
  targetSignal: string;
  expectedLift: string;
  routingHint: string;
  personaId: string;
  topicId: string;
}

const INTEL_MARKER = "[Step Intelligence]";

const EMPTY_INTEL: StepIntel = {
  objective: "", desiredBehavior: "", targetSignal: "",
  expectedLift: "", routingHint: "", personaId: "", topicId: "",
};

const INTEL_LABELS: Array<[keyof StepIntel, string]> = [
  ["objective", "Objective"],
  ["desiredBehavior", "Desired behavior"],
  ["targetSignal", "Target signal"],
  ["expectedLift", "Expected lift"],
  ["routingHint", "Routing hint"],
  ["personaId", "Persona"],
  ["topicId", "Topic"],
];

function hasIntel(intel: StepIntel): boolean {
  return INTEL_LABELS.some(([k]) => String(intel[k]).trim().length > 0);
}

// Split a stored body into the human-readable body and any embedded intelligence.
function parseStepBody(raw: string | null | undefined): { cleanBody: string; intel: StepIntel } {
  const intel: StepIntel = { ...EMPTY_INTEL };
  if (!raw) return { cleanBody: "", intel };
  // The marker must sit on its own line so an inline mention in normal copy
  // (e.g. "see the [Step Intelligence] block") is never mistaken for metadata.
  const lines = raw.split("\n");
  const markerIdx = lines.findIndex(l => l.trim() === INTEL_MARKER);
  if (markerIdx === -1) return { cleanBody: raw, intel };
  const cleanBody = lines.slice(0, markerIdx).join("\n").trimEnd();
  for (const line of lines.slice(markerIdx + 1)) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    const entry = INTEL_LABELS.find(([, l]) => l === label);
    if (entry) intel[entry[0]] = value;
  }
  return { cleanBody, intel };
}

// Re-attach an intelligence block to a clean body. Empty intel returns body as-is.
function serializeStepBody(cleanBody: string, intel: StepIntel): string {
  const base = (cleanBody ?? "").trimEnd();
  if (!hasIntel(intel)) return base;
  const lines = INTEL_LABELS
    .filter(([k]) => String(intel[k]).trim().length > 0)
    .map(([k, label]) => `${label}: ${String(intel[k]).trim()}`);
  const blockText = `${INTEL_MARKER}\n${lines.join("\n")}`;
  return base ? `${base}\n\n${blockText}` : blockText;
}

// ── Blueprint → draft steps ───────────────────────────────────────────────────
// Pure transform. Builds the POST payloads for each example step in a blueprint.
// Generates DRAFT strategy steps only — no AI copy, no send, no enroll.

interface AiSequenceStepDraft {
  dayOffset: number;
  channel: string;
  subject: string | null;
  body: string;
  intentLabel: string;
}

interface GeneratedStepPayload {
  stepNumber: number;
  dayOffset: number;
  channel: string;
  subject: string | null;
  body: string | null;
  callPrompt: string | null;
  taskDescription: string | null;
  sendTime: string;
  businessDaysOnly: boolean;
}

function buildStepsFromBlueprint(
  blueprint: SitemintCampaignBlueprint,
  startStepNumber: number,
): GeneratedStepPayload[] {
  return blueprint.exampleSteps.map((ex, i) => {
    const topic = getTopicById(ex.topicId);
    const recommendedCTA = topic?.recommendedCTA ?? "Book a call";
    const targetSignal = topic?.targetSignals?.[0] ?? "engagement";
    const expectedLift = topic?.behavioralLift ?? "TBD — measure after first sends";

    const intel: StepIntel = {
      objective: blueprint.goal,
      desiredBehavior: ex.purpose,
      targetSignal,
      expectedLift,
      routingHint: "Not configured — review before any routing",
      personaId: blueprint.personaId,
      topicId: ex.topicId ?? "",
    };

    const humanBody =
      `Purpose: ${ex.purpose}\n` +
      `Recommended CTA: ${recommendedCTA}\n` +
      `Behavioral signal tested: ${targetSignal}\n` +
      `Notes for future AI copy generation: Strategy draft from blueprint "${blueprint.label}". ` +
      `Topic: ${topic?.title ?? "—"}. No AI copy generated yet — replace with personalized copy before sending.`;

    const subject =
      ex.channel === "email"
        ? (topic?.suggestedSubjectHooks?.[0] ?? `Draft: ${topic?.title ?? blueprint.label}`)
        : null;

    return {
      stepNumber: startStepNumber + i,
      dayOffset: ex.day,
      channel: ex.channel,
      subject,
      // Body carries the human strategy notes + embedded intelligence for every channel.
      body: serializeStepBody(humanBody, intel),
      callPrompt: ex.channel === "call_prompt" ? ex.purpose : null,
      taskDescription: ex.channel === "task" ? ex.purpose : null,
      // Spec asks for 09:00 → nearest supported send window is "morning".
      sendTime: "morning",
      businessDaysOnly: true,
    };
  });
}

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
  intentLabel?: string | null;
  branchOnEvent?: string | null;
  branchWindowHours?: number | null;
  branchTrueNextStepId?: number | null;
  branchFalseNextStepId?: number | null;
}

const BRANCH_EVENTS = [
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "no_reply", label: "No reply" },
] as const;

function stepPreviewLabel(s: CampaignStep): string {
  const { intel } = parseStepBody(s.body);
  const desc = s.subject ?? intel.objective ?? s.channel.replace("_", " ");
  return `Step ${s.stepNumber} — ${desc}`;
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

/** The parts of the campaign-detail response this screen shows. */
interface CampaignDetail {
  stopOnReply: boolean | null;
  autoSend: boolean | null;
  recipients: EnrolledRecipient[];
}

// A body that is not the shape this page expects is a failure too — not a
// reason to render an empty sequence over steps that are really there. This
// screen used to read both answers with `.then(r => r.json())` and no `r.ok`
// check, so a JSON error body flowed straight into state as zero steps and
// zero enrolled contacts.
function pickSteps(body: unknown): CampaignStep[] | undefined {
  const list = body && typeof body === "object" ? (body as { steps?: unknown }).steps : undefined;
  return Array.isArray(list) ? list as CampaignStep[] : undefined;
}

function pickLeads(body: unknown): Lead[] | undefined {
  const list = body && typeof body === "object" ? (body as { leads?: unknown }).leads : undefined;
  return Array.isArray(list) ? list as Lead[] : undefined;
}

function pickCampaignDetail(body: unknown): CampaignDetail | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { campaign?: unknown; recipients?: unknown };
  // Older backends answer with the campaign at the top level.
  const camp = (b.campaign && typeof b.campaign === "object" ? b.campaign : body) as {
    stopOnReply?: unknown; autoSend?: unknown;
  };
  const raw = Array.isArray(b.recipients) ? b.recipients : [];
  return {
    stopOnReply: typeof camp.stopOnReply === "boolean" ? camp.stopOnReply : null,
    autoSend:    typeof camp.autoSend    === "boolean" ? camp.autoSend    : null,
    // Enrolled contacts are embedded in the campaign detail response rather
    // than served by a separate endpoint.
    recipients: raw.map((r: EnrolledRecipient & { leadName?: string; leadEmail?: string; name?: string; email?: string }) => ({
      ...r,
      leadName:  r.leadName  ?? r.name  ?? `Lead #${r.leadId}`,
      leadEmail: r.leadEmail ?? r.email ?? "",
    })),
  };
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
  sms:         "bg-teal-100 text-teal-700 border-teal-200",
  call_prompt: "bg-amber-100 text-amber-700 border-amber-200",
  task:        "bg-muted text-muted-foreground border-border",
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

function branchSummary(step: CampaignStep, allSteps: CampaignStep[]): string | null {
  if (!step.branchOnEvent) return null;
  const trueStep = allSteps.find(s => s.id === step.branchTrueNextStepId);
  const falseStep = allSteps.find(s => s.id === step.branchFalseNextStepId);
  // A branch isn't meaningfully configured unless BOTH targets resolve to real
  // steps — otherwise treat it as unset rather than rendering placeholder "—".
  if (!trueStep || !falseStep) return null;
  const evLabel = BRANCH_EVENTS.find(e => e.value === step.branchOnEvent)?.label ?? step.branchOnEvent;
  return `${evLabel} -> Step ${trueStep.stepNumber}, else Step ${falseStep.stepNumber}`;
}

function StepCard({
  step,
  allSteps,
  onEdit,
  onDelete,
}: {
  step: CampaignStep;
  allSteps: CampaignStep[];
  onEdit: (s: CampaignStep) => void;
  onDelete: (id: number) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const { cleanBody, intel } = parseStepBody(step.body);
  const intelChips: Array<[string, string]> = [
    ["Objective", intel.objective],
    ["Behavior", intel.desiredBehavior],
    ["Signal", intel.targetSignal],
    ["Lift", intel.expectedLift],
  ].filter((c): c is [string, string] => Boolean(c[1]));
  const branchLine = branchSummary(step, allSteps);

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-muted/60">
        <div className="w-7 h-7 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-xs font-bold shrink-0">
          {step.stepNumber}
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${CH_COLOR[step.channel] ?? "bg-muted text-muted-foreground border-border"}`}>
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
      <div className="px-4 py-3 space-y-1.5">
        {step.subject && (
          <p className="text-xs font-semibold text-foreground">{step.subject}</p>
        )}
        {cleanBody && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans line-clamp-3">
            {cleanBody}
          </pre>
        )}
        {step.callPrompt && (
          <p className="text-xs text-amber-700 font-medium">Prompt: {step.callPrompt}</p>
        )}
        {step.taskDescription && (
          <p className="text-xs text-muted-foreground">Task: {step.taskDescription}</p>
        )}
        {intelChips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {intelChips.map(([label, val]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-cyan-50 text-cyan-700 border border-cyan-100"
                title={`${label}: ${val}`}
              >
                <Brain className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[140px]">{label}: {val}</span>
              </span>
            ))}
          </div>
        )}
        {step.businessDaysOnly && (
          <p className="text-[10px] text-muted-foreground">Business days only</p>
        )}
        {branchLine && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <GitBranch className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-medium text-emerald-700">{branchLine}</span>
          </div>
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
  allSteps: CampaignStep[];
  onSaved: (s: CampaignStep) => void;
  onCancel: () => void;
}

function StepForm({ campaignId, existing, stepCount, allSteps, onSaved, onCancel }: StepFormProps) {
  const parsed = parseStepBody(existing?.body);
  const [stepNumber,       setStepNumber]       = useState(existing?.stepNumber ?? stepCount + 1);
  const [dayOffset,        setDayOffset]        = useState(existing?.dayOffset ?? (stepCount === 0 ? 0 : 3));
  const [channel,          setChannel]          = useState<string>(existing?.channel ?? "email");
  const [subject,          setSubject]          = useState(existing?.subject ?? "");
  const [body,             setBody]             = useState(parsed.cleanBody);
  const [callPrompt,       setCallPrompt]       = useState(existing?.callPrompt ?? "");
  const [taskDescription,  setTaskDescription]  = useState(existing?.taskDescription ?? "");
  const [sendTime,         setSendTime]         = useState<string>(existing?.sendTime ?? "immediate");
  const [businessDaysOnly, setBusinessDaysOnly] = useState(existing?.businessDaysOnly ?? true);
  const [intel,            setIntel]            = useState<StepIntel>(parsed.intel);
  const [showIntel,        setShowIntel]        = useState(hasIntel(parsed.intel));
  const [intentLabel,      setIntentLabel]      = useState(existing?.intentLabel ?? "");
  const [showBranch,       setShowBranch]       = useState(Boolean(existing?.branchOnEvent));
  const [branchOnEvent,    setBranchOnEvent]    = useState<string>(existing?.branchOnEvent ?? "opened");
  const [branchWindowHours, setBranchWindowHours] = useState<number>(existing?.branchWindowHours ?? 48);
  const [branchTrueNextStepId,  setBranchTrueNextStepId]  = useState<number | "">(existing?.branchTrueNextStepId ?? "");
  const [branchFalseNextStepId, setBranchFalseNextStepId] = useState<number | "">(existing?.branchFalseNextStepId ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Only already-saved OTHER steps can be branch targets — never self, never
  // a step that doesn't exist yet in this (possibly unsaved) sequence.
  const branchTargetOptions = allSteps.filter(s => s.id !== existing?.id);

  const setIntelField = (k: keyof StepIntel, v: string) => setIntel(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setError("");
    if (showBranch) {
      if (branchTrueNextStepId === "" || branchFalseNextStepId === "") {
        setError("Choose both a 'then go to' and an 'else go to' step, or collapse the branch section to leave this step linear."); return;
      }
      if (existing && branchTrueNextStepId === existing.id) {
        setError("A step can't branch to itself (true path)."); return;
      }
      if (existing && branchFalseNextStepId === existing.id) {
        setError("A step can't branch to itself (else path)."); return;
      }
      if (!branchTargetOptions.some(s => s.id === branchTrueNextStepId)) {
        setError("Selected 'then go to' step no longer exists in this sequence."); return;
      }
      if (!branchTargetOptions.some(s => s.id === branchFalseNextStepId)) {
        setError("Selected 'else go to' step no longer exists in this sequence."); return;
      }
    }
    setSaving(true);
    try {
      const url    = existing ? `/api/crm/campaigns/${campaignId}/steps/${existing.id}` : `/api/crm/campaigns/${campaignId}/steps`;
      const method = existing ? "PATCH" : "POST";
      // Step Intelligence is embedded back into the body (no metadata column).
      const mergedBody = serializeStepBody(body, intel);
      const r = await adminFetch(url, {
        method,
        body: JSON.stringify({
          stepNumber, dayOffset, channel, subject: subject || null,
          body: mergedBody || null,
          callPrompt: callPrompt || null,
          taskDescription: taskDescription || null,
          sendTime, businessDaysOnly,
          intentLabel: intentLabel || null,
          branchOnEvent: showBranch ? branchOnEvent : null,
          branchWindowHours: showBranch ? branchWindowHours : null,
          branchTrueNextStepId: showBranch && branchTrueNextStepId !== "" ? branchTrueNextStepId : null,
          branchFalseNextStepId: showBranch && branchFalseNextStepId !== "" ? branchFalseNextStepId : null,
        }),
      });
      if (!r.ok) { setError(`Step not saved. ${await responseFailureReason(r)}`); return; }
      const d = await r.json().catch(() => ({})) as { step?: CampaignStep };
      if (!d.step) { setError("Step not saved. The server's answer was not in the expected shape."); return; }
      onSaved(d.step);
    } catch {
      setError(`Step not saved. ${failureReason(null)}`);
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
            className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Day Offset</label>
          <input
            type="number" min={0} value={dayOffset}
            onChange={e => setDayOffset(Number(e.target.value))}
            className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Send Time</label>
          <select
            value={sendTime}
            onChange={e => setSendTime(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
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
                  : "bg-white border-border text-muted-foreground hover:bg-accent"
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
                className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
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
              className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
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
            className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
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
            className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
          />
        </div>
      )}

      {/* ── Step Intelligence (collapsible) ── */}
      <div className="border border-cyan-200 rounded-lg overflow-hidden bg-cyan-50/40">
        <button
          type="button"
          onClick={() => setShowIntel(s => !s)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cyan-50 transition-colors"
        >
          <Brain className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
          <span className="text-xs font-bold text-cyan-900">Step Intelligence</span>
          <span className="text-[9px] text-cyan-500 font-medium">optional · strategy metadata</span>
          {showIntel ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-cyan-500" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-cyan-500" />}
        </button>
        {showIntel && (
          <div className="px-3 pb-3 pt-1 space-y-2">
            {([
              ["objective", "Objective", "e.g. Test CRM automation interest"],
              ["desiredBehavior", "Desired behavior", "e.g. Click case study"],
              ["targetSignal", "Target signal", "e.g. crm_interest"],
              ["expectedLift", "Expected lift", "e.g. +12 Client Intent"],
              ["routingHint", "Routing hint", "e.g. If clicked, move to CRM/Automation campaign"],
            ] as Array<[keyof StepIntel, string, string]>).map(([k, label, ph]) => (
              <div key={k}>
                <label className="block text-[10px] font-semibold text-cyan-700/80 mb-0.5">{label}</label>
                <input
                  value={intel[k]}
                  onChange={e => setIntelField(k, e.target.value)}
                  placeholder={ph}
                  className="w-full border border-cyan-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
                />
              </div>
            ))}
            <p className="text-[9px] text-cyan-500/80 leading-relaxed pt-0.5">
              Stored inside the step body under a marked <span className="font-mono">[Step Intelligence]</span> block — no schema change. Strategy metadata only; no AI generation yet.
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Intent Label <span className="font-normal">(optional)</span></label>
        <input
          value={intentLabel}
          onChange={e => setIntentLabel(e.target.value)}
          placeholder="e.g. re-engagement nudge"
          className="w-full border border-input rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
        />
      </div>

      {/* ── Branch (collapsible) ── */}
      <div className="border border-emerald-200 rounded-lg overflow-hidden bg-emerald-50/40">
        <button
          type="button"
          onClick={() => setShowBranch(s => !s)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-xs font-bold text-emerald-900">Add a branch after this step</span>
          <span className="text-[9px] text-emerald-600 font-medium">optional</span>
          {showBranch ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-emerald-500" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-emerald-500" />}
        </button>
        {showBranch && (
          <div className="px-3 pb-3 pt-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-emerald-700/80 mb-0.5">On event</label>
                <select
                  value={branchOnEvent}
                  onChange={e => setBranchOnEvent(e.target.value)}
                  className="w-full border border-emerald-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
                >
                  {BRANCH_EVENTS.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-emerald-700/80 mb-0.5">Window (hours)</label>
                <input
                  type="number" min={1} value={branchWindowHours}
                  onChange={e => setBranchWindowHours(Number(e.target.value))}
                  className="w-full border border-emerald-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-emerald-700/80 mb-0.5">Then go to (event matched)</label>
              <select
                value={branchTrueNextStepId}
                onChange={e => setBranchTrueNextStepId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border border-emerald-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
              >
                <option value="">— Select step —</option>
                {branchTargetOptions.map(s => <option key={s.id} value={s.id}>{stepPreviewLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-emerald-700/80 mb-0.5">Else go to (not matched)</label>
              <select
                value={branchFalseNextStepId}
                onChange={e => setBranchFalseNextStepId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border border-emerald-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
              >
                <option value="">— Select step —</option>
                {branchTargetOptions.map(s => <option key={s.id} value={s.id}>{stepPreviewLabel(s)}</option>)}
              </select>
            </div>
            {branchTargetOptions.length === 0 && (
              <p className="text-[9px] text-emerald-600/80 leading-relaxed pt-0.5">
                No other steps exist yet in this sequence — save more steps first, then come back to wire up the branch targets.
              </p>
            )}
          </div>
        )}
      </div>

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
          className="flex-1 px-4 py-2 border border-border text-xs font-medium rounded-lg hover:bg-accent transition-colors"
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
  const [leadsLoad, setLeadsLoad] = useState<Load<Lead[]>>({ status: "loading" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reloading, setReloading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error,    setError]    = useState("");
  const [result,   setResult]   = useState<{ enrolled: number; scheduled: number } | null>(null);

  // Contacts that actually loaded, or null. "No leads with valid email
  // addresses found" is a claim about the CRM; a read that failed is not.
  const leads = leadsLoad.status === "ready" ? leadsLoad.data : null;

  const loadLeads = useCallback(async () => {
    setReloading(true);
    const next = await readAdminResource("/api/crm/leads", pickLeads);
    setLeadsLoad(next.status === "ready"
      ? { status: "ready", data: next.data.filter(l => l.email && !l.email.includes("@imported.local")) }
      : next);
    setReloading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const toggle = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const enroll = async () => {
    setError("");
    setEnrolling(true);
    try {
      const r = await adminFetch(`/api/crm/campaigns/${campaignId}/enroll`, {
        method: "POST",
        body: JSON.stringify({ leadIds: Array.from(selected) }),
      });
      if (!r.ok) { setError(`Nobody was enrolled. ${await responseFailureReason(r)}`); return; }
      const d = await r.json().catch(() => ({})) as { enrolled?: unknown; scheduled?: unknown };
      if (typeof d.enrolled !== "number" || typeof d.scheduled !== "number") {
        setError("The enrollment ran, but the server's answer was not in the expected shape."); return;
      }
      setResult({ enrolled: d.enrolled, scheduled: d.scheduled });
      setSelected(new Set());
      onEnrolled();
    } catch {
      setError(`Nobody was enrolled. ${failureReason(null)}`);
    } finally {
      setEnrolling(false);
    }
  };

  if (leadsLoad.status === "loading") {
    return <div className="text-xs text-muted-foreground p-4 animate-pulse" role="status" aria-live="polite">Loading contacts…</div>;
  }

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
      {leads === null ? (
        /* An empty picker would say "you have no contacts". Say which it is. */
        <LoadFailure
          what="Contacts"
          reason={leadsLoad.status === "error" ? leadsLoad.reason : ""}
          onRetry={() => { void loadLeads(); }}
          retrying={reloading}
        >
          <p className="mt-2 text-sm text-muted-foreground">
            Nobody can be enrolled while this is unavailable — there may well be contacts to enroll.
          </p>
        </LoadFailure>
      ) : (
        <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-border/60">
          {leads.map(l => (
            <label key={l.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(l.id)}
                onChange={() => toggle(l.id)}
                className="rounded"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground break-words">{l.name}</p>
                <p className="text-[10px] text-muted-foreground break-words">{l.email}</p>
              </div>
              {l.company && <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[100px]">{l.company}</span>}
            </label>
          ))}
          {leads.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">No leads with valid email addresses found.</p>
          )}
        </div>
      )}
      <button
        onClick={enroll}
        disabled={!selected.size || enrolling || leads === null}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
        {enrolling ? "Enrolling…" : `Enroll ${selected.size || ""} Contact${selected.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ── Journey View (read-only timeline grouped by week) ─────────────────────────

function JourneyView({
  steps,
  stopOnReply,
  autoSend,
}: {
  steps: CampaignStep[];
  stopOnReply: boolean | null;
  autoSend: boolean | null;
}) {
  if (steps.length === 0) {
    return (
      <div className="bg-muted border border-border rounded-xl p-6 text-center">
        <Route className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-semibold text-muted-foreground">No journey to preview yet</p>
        <p className="text-xs text-muted-foreground mt-1">Add steps or generate them from a blueprint to see the contact journey.</p>
      </div>
    );
  }

  const ordered = [...steps].sort((a, b) => a.dayOffset - b.dayOffset || a.stepNumber - b.stepNumber);
  const weeks = new Map<number, CampaignStep[]>();
  for (const s of ordered) {
    const w = Math.floor(s.dayOffset / 7) + 1;
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(s);
  }
  const weekKeys = [...weeks.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Route className="w-4 h-4 text-cyan-500" />
        <span>Read-only preview of the contact journey. Cadence tapers as the relationship matures — later touches sit further apart.</span>
      </div>

      <div className="relative pl-4">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-cyan-300 via-cyan-200 to-transparent" />
        <div className="space-y-5">
          {weekKeys.map(wk => {
            const wkSteps = weeks.get(wk)!;
            return (
              <div key={wk} className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <span className="absolute -left-4 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-white shadow" />
                  <span className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide">Week {wk}</span>
                  <span className="text-[10px] text-muted-foreground">· {wkSteps.length} touch{wkSteps.length !== 1 ? "es" : ""}</span>
                </div>
                <div className="space-y-2">
                  {wkSteps.map(s => {
                    const { cleanBody, intel } = parseStepBody(s.body);
                    const firstLine = (cleanBody.split("\n").find(l => l.trim()) ?? "").trim();
                    return (
                      <div key={s.id} className="bg-white border border-border rounded-lg px-3 py-2 flex items-start gap-2 shadow-sm">
                        <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${CH_COLOR[s.channel] ?? "bg-muted text-muted-foreground border-border"}`}>
                          <ChannelIcon ch={s.channel} cls="w-2.5 h-2.5" />
                          {s.channel.replace("_", " ")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {s.subject ?? intel.objective ?? firstLine ?? s.channel.replace("_", " ")}
                          </p>
                          {intel.desiredBehavior && (
                            <p className="text-[10px] text-cyan-600 truncate">Goal: {intel.desiredBehavior}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">Day {s.dayOffset}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Journey end marker */}
      <div className="flex items-center gap-2 pl-4 text-[11px] text-muted-foreground">
        <GitBranch className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span>
          Journey ends after the last step{stopOnReply ? ", or earlier if the contact replies" : ""}.
          {autoSend === false ? " Sending is manual — nothing leaves without queue approval." : ""}
        </span>
      </div>
    </div>
  );
}

// ── Campaign Ends When… panel ─────────────────────────────────────────────────

function CampaignEndsPanel({
  stopOnReply,
  autoSend,
}: {
  stopOnReply: boolean | null;
  autoSend: boolean | null;
}) {
  const rows: Array<{ icon: typeof Target; label: string; detail: string; tone: string }> = [
    {
      icon: CheckCircle2,
      label: "All steps completed",
      detail: "A contact finishes the journey once their final scheduled step has been processed.",
      tone: "text-emerald-600",
    },
    {
      icon: MessageSquare,
      label: stopOnReply ? "Contact replies (stop-on-reply ON)" : "Stop-on-reply is OFF",
      detail: stopOnReply
        ? "An inbound reply marks the enrollment complete and halts remaining steps."
        : "Replies do not automatically stop the sequence — exit must be handled manually.",
      tone: stopOnReply ? "text-emerald-600" : "text-amber-600",
    },
    {
      icon: Send,
      label: autoSend === false ? "Auto-send is OFF" : autoSend ? "Auto-send is ON" : "Sending via queue",
      detail: autoSend === false
        ? "Steps are queued but never sent automatically — the send queue requires manual approval."
        : "The scheduler queues steps; the send queue still governs what actually goes out.",
      tone: "text-blue-600",
    },
    {
      icon: GitBranch,
      label: "Branch / switch logic",
      detail: "Not configured — contacts follow a single linear path. Cross-campaign routing is a strategy note only.",
      tone: "text-muted-foreground",
    },
  ];

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-[#1e293b]" />
        <p className="text-xs font-bold text-foreground">Campaign ends when…</p>
      </div>
      <div className="space-y-2">
        {rows.map(({ icon: Icon, label, detail, tone }) => (
          <div key={label} className="flex items-start gap-2.5">
            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone}`} />
            <div>
              <p className="text-[11px] font-semibold text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 text-[10px] text-muted-foreground border-t border-border/60 pt-2.5">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-emerald-500" />
        <span>Safety: scheduler behaviour is unchanged. No contact is enrolled and no message is sent without explicit action.</span>
      </div>
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
  // The sequence's steps and its campaign detail (enrolled contacts, stop-on-
  // reply, auto-send) are two separate answers, and each one is a `Load`.
  const [stepsLoad,  setStepsLoad]  = useState<Load<CampaignStep[]>>({ status: "loading" });
  const [detailLoad, setDetailLoad] = useState<Load<CampaignDetail>>({ status: "loading" });
  const [reloading,  setReloading]  = useState(false);
  /** A sequence action (save, delete, generate) the server refused. */
  const [error,      setError]      = useState("");

  const [activeTab,    setActiveTab]    = useState<"steps" | "enroll" | "recipients" | "copilot">("steps");
  const [stepView,     setStepView]     = useState<"sequence" | "journey">("sequence");
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingStep,  setEditingStep]  = useState<CampaignStep | null>(null);
  const [updatingRid,  setUpdatingRid]  = useState<number | null>(null);
  const [expandEnroll, setExpandEnroll] = useState(false);

  // Blueprint generation (drafts only — no AI, no send, no enroll)
  const [selectedBlueprintId, setSelectedBlueprintId] = useState("");
  const [genConfirm, setGenConfirm] = useState(false);
  const [genMode,    setGenMode]    = useState<"append" | "replace">("append");
  const [generating, setGenerating] = useState(false);
  const [genResult,  setGenResult]  = useState("");

  // AI sequence draft generation (Phase 26G) — draft only, added on explicit confirm
  const [aiStepCount,   setAiStepCount]   = useState(4);
  const [aiGenerating,  setAiGenerating]  = useState(false);
  const [aiError,       setAiError]       = useState("");
  const [aiPreview,     setAiPreview]     = useState<AiSequenceStepDraft[] | null>(null);
  const [aiAdding,      setAiAdding]      = useState(false);
  const [aiResult,      setAiResult]      = useState("");

  // What actually loaded, or null. Never an empty array standing in for a
  // request nobody managed to complete.
  const steps      = stepsLoad.status === "ready" ? stepsLoad.data : null;
  const detail     = detailLoad.status === "ready" ? detailLoad.data : null;
  const recipients = detail ? detail.recipients : null;
  // Campaign settings (read-only here) for the "Campaign ends when…" panel.
  const stopOnReply = detail ? detail.stopOnReply : null;
  const autoSend    = detail ? detail.autoSend : null;

  /** Apply a local change to the steps, only when there are steps to change. */
  const updateSteps = (fn: (prev: CampaignStep[]) => CampaignStep[]) =>
    setStepsLoad(prev => (prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev));

  // Each part keeps its own answer: the steps can load while the campaign
  // detail fails, and the page says so instead of silently reporting that
  // nobody is enrolled.
  const load = useCallback(async () => {
    setReloading(true);
    setError("");
    const [nextSteps, nextDetail] = await Promise.all([
      readAdminResource(`/api/crm/campaigns/${campaignId}/steps`, pickSteps),
      readAdminResource(`/api/crm/campaigns/${campaignId}`, pickCampaignDetail),
    ]);
    setStepsLoad(nextSteps);
    setDetailLoad(nextDetail);
    setReloading(false);
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const onStepSaved = (step: CampaignStep) => {
    updateSteps(prev => {
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

  // A delete that failed must not take the card off the screen: the step is
  // still there, and the next reload would bring it back with no explanation.
  const deleteStep = async (id: number) => {
    setError("");
    try {
      const r = await adminFetch(`/api/crm/campaigns/${campaignId}/steps/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) { setError(`Step not deleted. ${await responseFailureReason(r)}`); return; }
      updateSteps(prev => prev.filter(s => s.id !== id));
    } catch {
      setError(`Step not deleted. ${failureReason(null)}`);
    }
  };

  // Generate DRAFT steps from a blueprint. Appends to the existing sequence.
  // No AI copy, no auto-send, no auto-enroll — pure strategy scaffold.
  const generateFromBlueprint = async () => {
    const blueprint = getBlueprintById(selectedBlueprintId);
    if (!blueprint || steps === null) return;
    const existing = steps;
    // Replace is only ever permitted when no contacts are enrolled — guard again
    // here so the destructive path can never run on a live sequence. A
    // recipients read that FAILED is not proof that nobody is enrolled, so it
    // blocks the replace just as a live enrollment would.
    const doReplace = genMode === "replace" && recipients !== null && recipients.length === 0;
    setGenerating(true);
    setGenResult("");
    setError("");
    try {
      // Clear existing steps first when safely replacing.
      if (doReplace && existing.length > 0) {
        for (const s of existing) {
          const dr = await adminFetch(`/api/crm/campaigns/${campaignId}/steps/${s.id}`, {
            method: "DELETE",
          });
          if (!dr.ok) {
            setError(`The existing steps were not cleared, so nothing was generated. ${await responseFailureReason(dr)}`);
            return;
          }
        }
        setStepsLoad({ status: "ready", data: [] });
      }
      const startNum = doReplace ? 1 : existing.reduce((m, s) => Math.max(m, s.stepNumber), 0) + 1;
      const payloads = buildStepsFromBlueprint(blueprint, startNum);
      const created: CampaignStep[] = [];
      let failed = false;
      for (const p of payloads) {
        const r = await adminFetch(`/api/crm/campaigns/${campaignId}/steps`, {
          method: "POST",
          body: JSON.stringify(p),
        });
        if (!r.ok) {
          failed = true;
          setError(`${created.length} of ${payloads.length} steps were created, then the rest stopped. ${await responseFailureReason(r)} Review the sequence and re-run or finish manually.`);
          break;
        }
        const d = await r.json().catch(() => ({})) as { step?: CampaignStep };
        if (!d.step) {
          failed = true;
          setError(`${created.length} of ${payloads.length} steps were created, then the server's answer was not in the expected shape. Review the sequence and re-run or finish manually.`);
          break;
        }
        created.push(d.step);
      }
      if (created.length) {
        setStepsLoad(prev => ({
          status: "ready",
          data: [...(doReplace || prev.status !== "ready" ? [] : prev.data), ...created]
            .sort((a, b) => a.stepNumber - b.stepNumber || a.dayOffset - b.dayOffset),
        }));
        if (!failed) {
          setGenResult(`${doReplace ? "Replaced sequence with" : "Added"} ${created.length} draft step${created.length !== 1 ? "s" : ""} from "${blueprint.label}". Review and personalise before enrolling contacts.`);
        }
      }
    } catch {
      setError(`No steps were generated. ${failureReason(null)}`);
    } finally {
      setGenerating(false);
      setGenConfirm(false);
      setGenMode("append");
      setSelectedBlueprintId("");
    }
  };

  // Generate a structured AI sequence draft (Phase 26G). Only stored in local
  // preview state until the user explicitly clicks "Add these draft steps" —
  // nothing is created, enrolled, or sent by generation alone.
  const generateSequenceWithAi = async () => {
    setAiGenerating(true);
    setAiError("");
    setAiResult("");
    try {
      const blueprint = getBlueprintById(selectedBlueprintId);
      const persona = blueprint ? getPersonaById(blueprint.personaId) : null;
      const res = await adminFetch("/api/crm/campaigns/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          mode: "sequence",
          personaId: persona?.id,
          personaLabel: persona?.label,
          personaDescription: persona?.description,
          personaPainPoint: persona?.primaryPainPoint,
          personaBestCTA: persona?.bestCTA,
          objective: blueprint?.goal ?? "",
          toneProfile: blueprint?.toneProfile ?? "",
          stepCount: aiStepCount,
        }),
      });
      if (!res.ok) { setAiError(`Nothing was generated. ${await responseFailureReason(res)}`); return; }
      const data = await res.json().catch(() => ({})) as { draft?: { steps?: unknown } };
      const drafted = data.draft?.steps;
      if (!Array.isArray(drafted)) {
        setAiError("The generation ran, but the server's answer was not in the expected shape."); return;
      }
      setAiPreview(drafted as AiSequenceStepDraft[]);
    } catch {
      setAiError(`Nothing was generated. ${failureReason(null)}`);
    } finally {
      setAiGenerating(false);
    }
  };

  // Human explicitly confirmed the AI draft — now (and only now) persist the
  // steps, always appending after existing steps (never replaces/enrolls).
  const addAiDraftSteps = async () => {
    if (!aiPreview || aiPreview.length === 0 || steps === null) return;
    setAiAdding(true);
    setAiError("");
    try {
      const startNum = steps.reduce((m, s) => Math.max(m, s.stepNumber), 0) + 1;
      const created: CampaignStep[] = [];
      let failed = false;
      for (let i = 0; i < aiPreview.length; i++) {
        const s = aiPreview[i];
        const bodyWithIntel = s.intentLabel ? `${s.body}\n\n${INTEL_MARKER}\nObjective: ${s.intentLabel}` : s.body;
        const r = await adminFetch(`/api/crm/campaigns/${campaignId}/steps`, {
          method: "POST",
          body: JSON.stringify({
            stepNumber: startNum + i,
            dayOffset: s.dayOffset,
            channel: s.channel,
            subject: s.subject,
            body: bodyWithIntel,
            sendTime: "morning",
            businessDaysOnly: true,
          }),
        });
        if (!r.ok) { failed = true; setAiError(`${created.length} of ${aiPreview.length} steps were added, then the rest stopped. ${await responseFailureReason(r)}`); break; }
        const d = await r.json().catch(() => ({})) as { step?: CampaignStep };
        if (!d.step) { failed = true; setAiError(`${created.length} of ${aiPreview.length} steps were added, then the server's answer was not in the expected shape.`); break; }
        created.push(d.step);
      }
      if (created.length) {
        updateSteps(prev => [...prev, ...created].sort((a, b) => a.stepNumber - b.stepNumber || a.dayOffset - b.dayOffset));
        if (!failed) setAiResult(`Added ${created.length} AI-drafted step${created.length !== 1 ? "s" : ""}. Review and personalise before enrolling contacts.`);
      }
      if (!failed) setAiPreview(null);
    } finally {
      setAiAdding(false);
    }
  };

  // Copilot → Sequence: receive AI-generated steps and POST them to the API.
  // Always appends (never replaces) — enrollments are never touched.
  const handleCopilotBuildSequence = useCallback(async (parsed: ParsedStep[]) => {
    const INTEL_MARKER_LOCAL = "[Step Intelligence]";
    const INTEL_LABELS_LOCAL: Array<[string, string]> = [
      ["objective",       "Objective"],
      ["desiredBehavior", "Desired behavior"],
      ["targetSignal",    "Target signal"],
      ["expectedLift",    "Expected lift"],
      ["routingHint",     "Routing hint"],
      ["personaId",       "Persona"],
      ["topicId",         "Topic"],
    ];
    function serializeIntel(cleanBody: string, intel: ParsedStep["intel"]): string {
      const base = (cleanBody ?? "").trimEnd();
      const lines = INTEL_LABELS_LOCAL
        .filter(([k]) => String(intel[k as keyof ParsedStep["intel"]]).trim().length > 0)
        .map(([k, lbl]) => `${lbl}: ${String(intel[k as keyof ParsedStep["intel"]]).trim()}`);
      if (!lines.length) return base;
      const block = `${INTEL_MARKER_LOCAL}\n${lines.join("\n")}`;
      return base ? `${base}\n\n${block}` : block;
    }
    const created: CampaignStep[] = [];
    let failed = false;
    for (const p of parsed) {
      const mergedBody = serializeIntel(p.body, p.intel);
      const r = await adminFetch(`/api/crm/campaigns/${campaignId}/steps`, {
        method: "POST",
        body: JSON.stringify({
          stepNumber:      p.stepNumber,
          dayOffset:       p.dayOffset,
          channel:         p.channel,
          subject:         p.subject,
          body:            mergedBody || null,
          callPrompt:      p.callPrompt,
          taskDescription: p.taskDescription,
          sendTime:        p.sendTime,
          businessDaysOnly: p.businessDaysOnly,
        }),
      });
      if (!r.ok) { failed = true; setError(`Step ${p.stepNumber} was not saved. ${await responseFailureReason(r)}`); break; }
      const d = await r.json().catch(() => ({})) as { step?: CampaignStep };
      if (!d.step) { failed = true; setError(`Step ${p.stepNumber} was not saved. The server's answer was not in the expected shape.`); break; }
      created.push(d.step);
    }
    if (created.length > 0) {
      setStepsLoad(prev => (prev.status === "ready"
        ? { status: "ready", data: [...prev.data, ...created].sort((a, b) => a.stepNumber - b.stepNumber || a.dayOffset - b.dayOffset) }
        : prev));
      if (!failed) setActiveTab("steps");
    }
  }, [campaignId]);

  // A pause/stop/resume the server refused must not be shown as applied: the
  // enrollment is unchanged, and the next reload would silently undo it.
  const updateEnrollmentStatus = async (rid: number, enrollmentStatus: string) => {
    setUpdatingRid(rid);
    setError("");
    try {
      const r = await adminFetch(`/api/crm/campaigns/${campaignId}/recipients/${rid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ enrollmentStatus }),
      });
      if (!r.ok) { setError(`The enrollment was not changed. ${await responseFailureReason(r)}`); return; }
      setDetailLoad(prev => (prev.status === "ready"
        ? { status: "ready", data: { ...prev.data, recipients: prev.data.recipients.map(x => x.id === rid ? { ...x, enrollmentStatus } : x) } }
        : prev));
    } catch {
      setError(`The enrollment was not changed. ${failureReason(null)}`);
    } finally {
      setUpdatingRid(null);
    }
  };

  if (stepsLoad.status === "loading" || detailLoad.status === "loading") {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4" role="status" aria-live="polite">
          <span className="sr-only">Loading this sequence…</span>
          <div className="h-8 w-48 bg-border rounded" />
          <div className="h-32 bg-muted rounded-xl" />
        </div>
      </CrmLayout>
    );
  }

  const typeColor: Record<string, string> = {
    nurture:   "bg-teal-100 text-teal-700 border border-teal-200",
    drip:      "bg-blue-100 text-blue-700 border border-blue-200",
    broadcast: "bg-muted text-muted-foreground border border-border",
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
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-sm font-bold text-foreground truncate max-w-xs">{campaignName}</h1>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${typeColor[campaignType] ?? "bg-muted text-muted-foreground border border-border"}`}>
            {campaignType}
          </span>
        </div>

        {/*
          Which parts of this screen could not be loaded, named. It sits above
          the tabs so a failure in a part you are not looking at is still
          stated — the counts in the tab strip show an em dash rather than a 0.
        */}
        <PageLoadFailures
          failures={failedParts([
            ["Sequence steps", stepsLoad],
            ["Enrolled contacts", detailLoad],
          ])}
          onRetry={() => { void load(); }}
          retrying={reloading}
        />

        {error && (
          <div role="alert" className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit flex-wrap">
          <button
            onClick={() => setActiveTab("steps")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "steps" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sequence Steps (<Figure value={steps ? steps.length : null} />)
          </button>
          <button
            onClick={() => setActiveTab("copilot")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "copilot" ? "bg-teal-600 text-white shadow-sm" : "text-teal-600 hover:bg-teal-50"}`}
          >
            <Sparkles className="w-3 h-3" />
            AI Copilot
          </button>
          <button
            onClick={() => setActiveTab("recipients")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "recipients" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Enrolled (<Figure value={recipients ? recipients.length : null} />)
          </button>
          <button
            onClick={() => setActiveTab("enroll")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "enroll" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Enroll Contacts
          </button>
        </div>

        {/* ── Steps Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "steps" && (
          <div className="space-y-3">

            {/* View toggle + blueprint generator */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {([["sequence", "Sequence", ListOrdered], ["journey", "Journey", Route]] as const).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    onClick={() => setStepView(v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      stepView === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Blueprint generator */}
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={selectedBlueprintId}
                  onChange={e => { setSelectedBlueprintId(e.target.value); setGenConfirm(false); setGenResult(""); }}
                  className="border border-input rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200 max-w-[220px]"
                >
                  <option value="">Start from a blueprint…</option>
                  {SITEMINT_CAMPAIGN_BLUEPRINTS.map(bp => (
                    <option key={bp.id} value={bp.id}>{bp.label}</option>
                  ))}
                </select>
                {selectedBlueprintId && !genConfirm && (
                  <button
                    onClick={() => setGenConfirm(true)}
                    disabled={steps === null}
                    title={steps === null ? "The existing steps could not be loaded, so new ones cannot be numbered." : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-40 transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Generate Steps
                  </button>
                )}
                <select
                  value={aiStepCount}
                  onChange={e => setAiStepCount(Number(e.target.value))}
                  className="border border-input rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-200"
                  title="Number of AI-drafted steps to generate"
                >
                  {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} steps</option>)}
                </select>
                <button
                  onClick={generateSequenceWithAi}
                  disabled={aiGenerating || steps === null}
                  title={steps === null ? "The existing steps could not be loaded, so new ones cannot be numbered." : undefined}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
                >
                  {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiGenerating ? "Generating…" : "Generate with AI"}
                </button>
              </div>
            </div>

            {aiError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {aiError}
              </div>
            )}

            {/* AI sequence draft preview — nothing is saved until explicitly confirmed */}
            {aiPreview && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-teal-900">
                      AI-drafted, review before saving — {aiPreview.length} step{aiPreview.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-teal-700 mt-0.5">
                      Nothing is created, enrolled, or sent yet. Review the copy below, then confirm to append these as draft steps.
                    </p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {aiPreview.map((s, i) => (
                    <li key={i} className="bg-white rounded-lg border border-teal-100 p-2.5 text-xs">
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-teal-700 mb-1">
                        <span>Day {s.dayOffset}</span>
                        <span className="text-teal-300">·</span>
                        <span className="capitalize">{s.channel}</span>
                        {s.intentLabel && <><span className="text-teal-300">·</span><span className="text-muted-foreground font-normal">{s.intentLabel}</span></>}
                      </div>
                      {s.subject && <p className="font-semibold text-foreground mb-0.5">{s.subject}</p>}
                      <p className="text-muted-foreground whitespace-pre-line">{s.body}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={addAiDraftSteps}
                    disabled={aiAdding}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
                  >
                    {aiAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {aiAdding ? "Adding…" : "Add these draft steps"}
                  </button>
                  <button
                    onClick={() => setAiPreview(null)}
                    disabled={aiAdding}
                    className="px-4 py-2 border border-border text-xs font-medium rounded-lg hover:bg-white transition-colors disabled:opacity-40"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

            {aiResult && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {aiResult}
              </div>
            )}

            {/* Generate confirm panel */}
            {selectedBlueprintId && genConfirm && steps !== null && (() => {
              const bp = getBlueprintById(selectedBlueprintId);
              const persona = bp ? getPersonaById(bp.personaId) : null;
              // Replace is only offered when there are existing steps AND we can
              // SEE that no one is enrolled. A recipients read that failed is not
              // evidence of an empty enrollment.
              const replaceSafe = recipients !== null && recipients.length === 0;
              const canReplace  = steps.length > 0 && replaceSafe;
              const effectiveMode = genMode === "replace" && canReplace ? "replace" : "append";
              return (
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Wand2 className="w-4 h-4 text-cyan-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-cyan-900">Generate {bp?.exampleSteps.length ?? 0} draft step{(bp?.exampleSteps.length ?? 0) !== 1 ? "s" : ""} from "{bp?.label}"</p>
                      <p className="text-[11px] text-cyan-700 mt-0.5">
                        {bp?.goal}{persona ? ` · Audience: ${persona.label}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Append / Replace selector (only when there are existing steps) */}
                  {steps.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio" name="genmode" checked={effectiveMode === "append"}
                          onChange={() => setGenMode("append")}
                          className="mt-0.5"
                        />
                        <span className="text-[11px] text-cyan-900">
                          <span className="font-semibold">Append</span> after your existing {steps.length} step{steps.length !== 1 ? "s" : ""} — nothing is removed.
                        </span>
                      </label>
                      <label className={`flex items-start gap-2 ${canReplace ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}>
                        <input
                          type="radio" name="genmode" checked={effectiveMode === "replace"}
                          disabled={!canReplace}
                          onChange={() => setGenMode("replace")}
                          className="mt-0.5"
                        />
                        <span className="text-[11px] text-cyan-900">
                          <span className="font-semibold">Replace</span> all existing draft steps with this blueprint.
                          {!replaceSafe && (
                            <span className="block text-[10px] text-amber-700">
                              {recipients === null
                                ? "Disabled — the enrolled contacts could not be loaded, so replacing cannot be shown to be safe."
                                : "Disabled — contacts are enrolled. Replacing is only allowed before anyone is enrolled."}
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                  )}

                  <ul className="text-[10px] text-cyan-700/90 space-y-1 pl-6 list-disc">
                    <li>These are <span className="font-semibold">strategy drafts</span> — no AI copy is generated.</li>
                    <li>No contacts are enrolled and nothing is sent. Review &amp; personalise each step first.</li>
                  </ul>
                  <div className="flex gap-2">
                    <button
                      onClick={generateFromBlueprint}
                      disabled={generating}
                      className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 text-white text-xs font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-40 transition-colors"
                    >
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {generating ? "Generating…" : effectiveMode === "replace" ? "Replace draft steps" : "Append draft steps"}
                    </button>
                    <button
                      onClick={() => { setGenConfirm(false); setGenMode("append"); }}
                      disabled={generating}
                      className="px-4 py-2 border border-border text-xs font-medium rounded-lg hover:bg-white transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}

            {genResult && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {genResult}
              </div>
            )}

            {/* Safety banner */}
            <div className="flex items-start gap-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                AI and blueprint steps are drafts only · Nothing is enrolled or sent automatically · Review before enrolling contacts · The send queue controls all sending.
              </span>
            </div>

            {steps === null ? (
              /*
                No sequence at all, rather than "Sequence Steps (0)" over "No
                steps yet". An empty sequence and an unanswered request must
                never look alike — and a 401, 403, 404, 5xx or unreachable
                server each reads differently here, because the words come from
                the response.
              */
              <LoadFailure
                what="Sequence steps"
                reason={stepsLoad.status === "error" ? stepsLoad.reason : ""}
                onRetry={() => { void load(); }}
                retrying={reloading}
              >
                <p className="mt-2 text-sm text-muted-foreground">
                  No step count and no journey are shown while this is unavailable — this sequence may well have steps.
                </p>
              </LoadFailure>
            ) : stepView === "journey" ? (
              <JourneyView steps={steps} stopOnReply={stopOnReply} autoSend={autoSend} />
            ) : (<>
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
                  allSteps={steps}
                  onSaved={onStepSaved}
                  onCancel={() => setEditingStep(null)}
                />
              ) : (
                <StepCard
                  key={step.id}
                  step={step}
                  allSteps={steps}
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
                allSteps={steps}
                onSaved={onStepSaved}
                onCancel={() => setShowStepForm(false)}
              />
            )}

            {!showStepForm && !editingStep && steps.length > 0 && (
              <button
                onClick={() => setShowStepForm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-card-border text-xs font-semibold text-muted-foreground rounded-xl hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Step
              </button>
            )}

            {steps.length > 0 && (
              <div className="bg-muted border border-border rounded-xl p-4">
                <p className="text-[10px] font-semibold text-muted-foreground mb-2">SEQUENCE TIMELINE</p>
                <div className="flex flex-col gap-1">
                  {steps.map((s, i) => {
                    const branchLine = branchSummary(s, steps);
                    return (
                      <div key={s.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 text-xs text-foreground">
                          <span className="w-6 h-6 rounded-full bg-[#1e293b] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                          <ChannelIcon ch={s.channel} cls="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium">{s.subject ?? s.channel.replace("_", " ")}</span>
                          <span className="text-muted-foreground ml-auto shrink-0">Day {s.dayOffset}</span>
                        </div>
                        {branchLine && (
                          <div className="flex items-center gap-1.5 pl-8 text-[10px] text-emerald-700">
                            <GitBranch className="w-3 h-3 shrink-0" />
                            <span>{branchLine}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </>)}

            {/* Campaign ends when… */}
            {steps !== null && steps.length > 0 && <CampaignEndsPanel stopOnReply={stopOnReply} autoSend={autoSend} />}
          </div>
        )}

        {/* ── AI Copilot Tab ──────────────────────────────────────────────────── */}
        {activeTab === "copilot" && (
          steps === null ? (
            /*
              Not `steps ?? []`: the copilot reads the existing steps to decide
              what to add, so handing it an empty array for a read that failed
              would have it plan a sequence from scratch over one that already
              has steps in it.
            */
            <LoadFailure
              what="This sequence's steps"
              reason={detailLoad.status === "error" ? detailLoad.reason : ""}
              onRetry={() => { void load(); }}
              retrying={reloading}
            >
              <p className="mt-2 text-sm text-muted-foreground">
                The copilot is not offered while the current steps are unknown — it would plan as though the sequence were empty.
              </p>
            </LoadFailure>
          ) : (
            <CrmCopilot
              campaignId={campaignId}
              campaignName={campaignName}
              existingSteps={steps}
              onBuildSequence={handleCopilotBuildSequence}
            />
          )
        )}

        {/* ── Enrolled Recipients Tab ─────────────────────────────────────────── */}
        {activeTab === "recipients" && (
          <div className="space-y-3">
            {recipients === null ? (
              /* "No contacts enrolled yet" is a claim about this sequence. */
              <LoadFailure
                what="Enrolled contacts"
                reason={detailLoad.status === "error" ? detailLoad.reason : ""}
                onRetry={() => { void load(); }}
                retrying={reloading}
              >
                <p className="mt-2 text-sm text-muted-foreground">
                  No enrolled count is shown while this is unavailable — people may well be enrolled in this sequence.
                </p>
              </LoadFailure>
            ) : recipients.length === 0 ? (
              <div className="bg-muted border border-border rounded-xl p-6 text-center">
                <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-semibold text-muted-foreground">No contacts enrolled yet</p>
                <p className="text-xs text-muted-foreground mt-1">Switch to "Enroll Contacts" to add people to this sequence.</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted">
                      {["Contact", "Email", "Enrollment", "Step", "Enrolled On", "Actions"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recipients.map(r => {
                      const isBusy = updatingRid === r.id;
                      return (
                        <tr key={r.id} className="hover:bg-accent/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-xs text-foreground">{r.leadName}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">{r.leadEmail}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ENROLL_COLOR[r.enrollmentStatus] ?? "bg-muted text-muted-foreground border-border"}`}>
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
            {/* "You have no steps" only when we could actually read the steps. */}
            {steps !== null && steps.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                You must add at least one step before enrolling contacts.
              </div>
            )}
            {steps === null && (
              <LoadFailure
                what="Sequence steps"
                reason={stepsLoad.status === "error" ? stepsLoad.reason : ""}
                variant="inline"
                onRetry={() => { void load(); }}
                retrying={reloading}
              >
                <p className="mt-1 text-xs text-muted-foreground">
                  Enrolling is held back until the steps can be read — this sequence may well have steps.
                </p>
              </LoadFailure>
            )}
            <div className="bg-white border border-border rounded-xl shadow-sm p-4 space-y-3">
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
              {expandEnroll && steps !== null && steps.length > 0 && (
                <LeadPicker campaignId={campaignId} onEnrolled={() => { load(); setActiveTab("recipients"); }} />
              )}
              {!expandEnroll && (
                <button
                  onClick={() => setExpandEnroll(true)}
                  disabled={steps === null || steps.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-card-border text-xs font-semibold text-muted-foreground rounded-xl hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
