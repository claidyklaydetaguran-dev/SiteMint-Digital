import { useState, useRef, useCallback } from "react";
import {
  Sparkles, Loader2, AlertCircle, ChevronDown, ChevronUp,
  CheckCircle2, Copy, Check, RotateCcw, Brain, Target,
  Zap, TrendingUp, Shield, Clock, Users, BarChart3,
} from "lucide-react";
import {
  SITEMINT_PERSONAS,
  SITEMINT_TOPICS,
  getPersonaById,
  type SitemintPersona,
} from "../../lib/campaignTaxonomy";
import type { CampaignStep } from "./CrmCampaignSequence";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CopilotResult {
  fullText: string;
}

interface CopilotProps {
  campaignId: number;
  campaignName: string;
  existingSteps: CampaignStep[];
  onBuildSequence: (steps: ParsedStep[]) => void;
}

export interface ParsedStep {
  stepNumber: number;
  dayOffset: number;
  channel: string;
  subject: string | null;
  body: string;
  callPrompt: string | null;
  taskDescription: string | null;
  sendTime: string;
  businessDaysOnly: boolean;
  intel: {
    objective: string;
    desiredBehavior: string;
    targetSignal: string;
    expectedLift: string;
    routingHint: string;
    personaId: string;
    topicId: string;
  };
}

const tok = () => localStorage.getItem("adminToken") || "";
const authH = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Tone / channel / temperature options ──────────────────────────────────────

const TONES = [
  "Professional", "Friendly", "Authority", "Educational",
  "Luxury", "Technical", "Relationship First", "High Energy", "Consultative",
];

const CAMPAIGN_GOALS = [
  "Book discovery call",
  "Website audit",
  "Sell website redesign",
  "Sell CRM / automation",
  "SEO consultation",
  "Re-engage cold leads",
  "Follow up on proposal",
  "Referral campaign",
  "Client onboarding",
  "Maintenance renewal",
];

const DISC_STYLES = ["Driver", "Analytical", "Amiable", "Expressive", "Mixed"];
const TEMPERATURES = ["Cold", "Warm", "Hot"];
const TOUCH_OPTIONS = [3, 5, 7, 14];
const CHANNEL_OPTIONS = ["email", "sms", "call_prompt", "task", "mixed"];

// ── Helper: parse AI output into step objects ─────────────────────────────────
// Extracts Step blocks from the markdown output. Best-effort: returns whatever it can parse.

function parseStepsFromOutput(text: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  // Match ### Step N — Day X blocks
  const stepRegex = /### Step (\d+)\s*[—–-]\s*Day (\d+)([\s\S]*?)(?=### Step \d+|## |$)/g;
  let m: RegExpExecArray | null;
  while ((m = stepRegex.exec(text)) !== null) {
    const stepNum = parseInt(m[1], 10);
    const dayOff  = parseInt(m[2], 10);
    const block   = m[3];

    const get = (label: string) => {
      const r = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
      return block.match(r)?.[1]?.trim() ?? "";
    };

    const channel = (get("Channel") || "email").toLowerCase().replace(/\s+/, "_");
    const subject = get("Subject") || null;
    const cta     = get("CTA");

    // Extract body — between **Body:** and the next **
    const bodyMatch = block.match(/\*\*Body:\*\*\s*([\s\S]*?)(?=\*\*CTA:|$)/i);
    let body = bodyMatch?.[1]?.trim() ?? "";
    if (cta) body = body + (body ? "\n\n" : "") + `CTA: ${cta}`;

    // Step Intelligence
    const intelMatch = block.match(/\*\*Step Intelligence:\*\*([\s\S]*?)(?=---|\n##|$)/i);
    const intelBlock = intelMatch?.[1] ?? "";
    const getIntel = (lbl: string) => {
      const r = new RegExp(`-?\\s*${lbl}:\\s*([^\\n]+)`, "i");
      return intelBlock.match(r)?.[1]?.trim() ?? "";
    };

    steps.push({
      stepNumber: stepNum,
      dayOffset: isNaN(dayOff) ? (stepNum - 1) * 3 : dayOff,
      channel: ["email","sms","call_prompt","task"].includes(channel) ? channel : "email",
      subject: channel === "email" ? (subject || `Draft step ${stepNum}`) : null,
      body,
      callPrompt:      channel === "call_prompt" ? body : null,
      taskDescription: channel === "task"         ? body : null,
      sendTime: "morning",
      businessDaysOnly: true,
      intel: {
        objective:       getIntel("Objective"),
        desiredBehavior: getIntel("Desired behavior"),
        targetSignal:    getIntel("Target signal"),
        expectedLift:    getIntel("Expected lift"),
        routingHint:     getIntel("Routing hint"),
        personaId:       "",
        topicId:         "",
      },
    });
  }
  return steps;
}

// ── Extract campaign meta from AI output ──────────────────────────────────────

function extractMeta(text: string): Record<string, string> {
  const get = (label: string) => {
    const r = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
    return text.match(r)?.[1]?.trim() ?? "";
  };
  return {
    name:            get("Campaign Name"),
    objective:       get("Objective"),
    summary:         get("Summary"),
    whyItWorks:      get("Why this sequence works"),
    outcome:         get("Expected behavioral outcome"),
    audience:        get("Ideal audience"),
    risk:            get("Risk level"),
    duration:        get("Estimated completion time"),
    replyRate:       get("Expected reply rate"),
    conversionRate:  get("Expected conversion rate"),
    overallScore:    get("Overall campaign score"),
    sequenceBalance: get("Sequence balance"),
    touchFrequency:  get("Touch frequency"),
    valueToAsk:      get("Value-to-ask ratio"),
    behaviorDiv:     get("Behavior diversity"),
  };
}

// ── Small UI atoms ────────────────────────────────────────────────────────────

function Chip({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
        selected
          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
          : "bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-700"
      }`}
    >
      {label}
    </button>
  );
}

function ScoreBadge({ label, value }: { label: string; value: string | number }) {
  const num = typeof value === "number" ? value : parseInt(String(value), 10);
  const color = isNaN(num)
    ? "bg-gray-100 text-gray-600"
    : num >= 8 ? "bg-emerald-100 text-emerald-700"
    : num >= 6 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-600";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${color}`}>
      {label}: {value}
    </span>
  );
}

// ── Rendered markdown (lightweight) ───────────────────────────────────────────

function RenderedOutput({ text }: { text: string }) {
  const lines = text.split("\n");
  const rendered: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      rendered.push(
        <h3 key={i} className="text-sm font-bold text-gray-900 mt-5 mb-1.5 border-b border-gray-100 pb-1">
          {line.replace("### ", "")}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      rendered.push(
        <h2 key={i} className="text-base font-bold text-violet-900 mt-6 mb-2">
          {line.replace("## ", "")}
        </h2>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      rendered.push(
        <p key={i} className="text-xs font-bold text-gray-800 mt-2">{line.replace(/\*\*/g, "")}</p>
      );
    } else if (line.match(/^\*\*[^*]+:\*\*/)) {
      const parts = line.match(/^\*\*([^*]+):\*\*\s*(.*)/);
      rendered.push(
        <p key={i} className="text-xs mt-1">
          <span className="font-semibold text-gray-700">{parts?.[1]}: </span>
          <span className="text-gray-600">{parts?.[2]}</span>
        </p>
      );
    } else if (line.startsWith("- ")) {
      rendered.push(
        <li key={i} className="text-xs text-gray-600 ml-4 list-disc">{line.slice(2)}</li>
      );
    } else if (line.trim() === "---") {
      rendered.push(<hr key={i} className="border-gray-100 my-3" />);
    } else if (line.trim()) {
      rendered.push(
        <p key={i} className="text-xs text-gray-600 leading-relaxed mt-1">{line}</p>
      );
    }
    i++;
  }
  return <div className="space-y-0.5">{rendered}</div>;
}

// ── Main Copilot Component ─────────────────────────────────────────────────────

export function CrmCopilot({ campaignId, campaignName, existingSteps, onBuildSequence }: CopilotProps) {
  // Config state
  const [goal,          setGoal]          = useState("");
  const [customGoal,    setCustomGoal]    = useState("");
  const [personaId,     setPersonaId]     = useState("");
  const [discStyle,     setDiscStyle]     = useState("Mixed");
  const [temperature,   setTemperature]   = useState("Warm");
  const [industry,      setIndustry]      = useState("");
  const [leadSource,    setLeadSource]    = useState("");
  const [tone,          setTone]          = useState("Professional");
  const [touchCount,    setTouchCount]    = useState(5);
  const [customTouches, setCustomTouches] = useState(5);
  const [useCustom,     setUseCustom]     = useState(false);
  const [channels,      setChannels]      = useState<string[]>(["email"]);

  // UI state
  const [generating, setGenerating]   = useState(false);
  const [output,     setOutput]       = useState("");
  const [error,      setError]        = useState("");
  const [done,       setDone]         = useState(false);
  const [copied,     setCopied]       = useState(false);
  const [showConfig, setShowConfig]   = useState(true);
  const [building,   setBuilding]     = useState(false);
  const [buildResult, setBuildResult] = useState("");

  const outputRef = useRef<HTMLDivElement>(null);

  const selectedPersona: SitemintPersona | undefined =
    (personaId ? getPersonaById(personaId) : undefined) ?? undefined;

  const toggleChannel = (ch: string) => {
    if (ch === "mixed") { setChannels(["email", "sms", "call_prompt", "task"]); return; }
    setChannels(prev =>
      prev.includes(ch) ? (prev.length > 1 ? prev.filter(c => c !== ch) : prev) : [...prev, ch]
    );
  };

  const effectiveTouches = useCustom ? customTouches : touchCount;
  const effectiveGoal    = goal === "__custom__" ? customGoal : goal;

  const generate = useCallback(async () => {
    if (!effectiveGoal) { setError("Please select or enter a campaign goal."); return; }
    setGenerating(true);
    setOutput("");
    setError("");
    setDone(false);
    setBuildResult("");
    setShowConfig(false);

    try {
      const body = JSON.stringify({
        campaignGoal:             effectiveGoal,
        personaId:                selectedPersona?.id ?? "",
        personaLabel:             selectedPersona?.label ?? "",
        personaDescription:       selectedPersona?.description ?? "",
        personaPainPoint:         selectedPersona?.primaryPainPoint ?? "",
        personaBestCTA:           selectedPersona?.bestCTA ?? "",
        personaRecommendedCadence: selectedPersona?.recommendedCadence ?? "",
        discStyle,
        leadTemperature:          temperature,
        industry,
        leadSource,
        tone,
        touchCount:               effectiveTouches,
        channels,
      });

      const res = await fetch("/api/crm/campaigns/copilot/generate", {
        method:  "POST",
        headers: authH(),
        body,
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Generation failed — please try again.");
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: rdDone, value } = await reader.read();
        if (rdDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(part.slice(6)) as { type: string; content?: string; message?: string };
            if (event.type === "chunk" && event.content) {
              setOutput(prev => {
                const next = prev + event.content!;
                // Auto-scroll
                requestAnimationFrame(() => {
                  if (outputRef.current) {
                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                  }
                });
                return next;
              });
            } else if (event.type === "done") {
              setDone(true);
            } else if (event.type === "error") {
              setError(event.message ?? "Generation failed.");
            }
          } catch { /* malformed chunk, skip */ }
        }
      }
      setDone(true);
    } catch (err) {
      setError("Network error — please check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }, [effectiveGoal, selectedPersona, discStyle, temperature, industry, leadSource, tone, effectiveTouches, channels]);

  const copyAll = async () => {
    await navigator.clipboard.writeText(output).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setOutput("");
    setDone(false);
    setError("");
    setBuildResult("");
    setShowConfig(true);
  };

  // Parse steps from the AI output and hand off to the parent to create them via API
  const buildSequence = async () => {
    const parsed = parseStepsFromOutput(output);
    if (parsed.length === 0) {
      setError("Couldn't parse steps from the output. You can copy the text and add steps manually.");
      return;
    }
    setBuilding(true);
    setBuildResult("");
    setError("");
    try {
      // If there are existing steps and no one is enrolled, user chose to proceed —
      // we APPEND (never auto-replace enrolled sequences).
      const startNum = existingSteps.reduce((m, s) => Math.max(m, s.stepNumber), 0) + 1;
      // Adjust step numbers
      const adjusted = parsed.map((s, i) => ({ ...s, stepNumber: startNum + i }));
      onBuildSequence(adjusted);
      setBuildResult(`${adjusted.length} step${adjusted.length !== 1 ? "s" : ""} sent to the Sequence Builder. Review and personalise before enrolling contacts.`);
    } finally {
      setBuilding(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Safety notice */}
      <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
        <Shield className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-violet-900">AI Campaign Copilot</p>
          <p className="text-[11px] text-violet-700 mt-0.5">
            AI generates strategy drafts only. No contacts are enrolled, no messages are queued, and nothing is sent automatically. Review all copy before use.
          </p>
        </div>
      </div>

      {/* Config panel */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowConfig(x => !x)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-bold text-gray-900">Campaign Configuration</span>
            {!showConfig && effectiveGoal && (
              <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">
                {effectiveGoal}
              </span>
            )}
          </div>
          {showConfig ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showConfig && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100">

            {/* Campaign Goal */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-2 mt-3 uppercase tracking-wide">Campaign Goal</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CAMPAIGN_GOALS.map(g => (
                  <Chip key={g} label={g} selected={goal === g} onClick={() => { setGoal(g); setCustomGoal(""); }} />
                ))}
                <Chip label="Custom…" selected={goal === "__custom__"} onClick={() => setGoal("__custom__")} />
              </div>
              {goal === "__custom__" && (
                <input
                  type="text"
                  placeholder="Describe your campaign goal…"
                  value={customGoal}
                  onChange={e => setCustomGoal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              )}
            </div>

            {/* Audience */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Persona</label>
                <select
                  value={personaId}
                  onChange={e => setPersonaId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white"
                >
                  <option value="">— Any persona —</option>
                  {SITEMINT_PERSONAS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                {selectedPersona && (
                  <p className="text-[10px] text-violet-700 mt-1 leading-relaxed">
                    {selectedPersona.description} · CTA: {selectedPersona.bestCTA}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">DISC Style</label>
                <div className="flex flex-wrap gap-1.5">
                  {DISC_STYLES.map(d => (
                    <Chip key={d} label={d} selected={discStyle === d} onClick={() => setDiscStyle(d)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Lead Temperature</label>
                <div className="flex gap-1.5">
                  {TEMPERATURES.map(t => (
                    <Chip key={t} label={t} selected={temperature === t} onClick={() => setTemperature(t)} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Real Estate, Law…"
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Lead Source</label>
                <input
                  type="text"
                  placeholder="e.g. Referral, Google, Form…"
                  value={leadSource}
                  onChange={e => setLeadSource(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Tone</label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map(t => (
                  <Chip key={t} label={t} selected={tone === t} onClick={() => setTone(t)} />
                ))}
              </div>
            </div>

            {/* Length + Channels */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Campaign Length</label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {TOUCH_OPTIONS.map(n => (
                    <Chip
                      key={n}
                      label={`${n} Touches`}
                      selected={!useCustom && touchCount === n}
                      onClick={() => { setTouchCount(n); setUseCustom(false); }}
                    />
                  ))}
                  <Chip label="Custom" selected={useCustom} onClick={() => setUseCustom(x => !x)} />
                </div>
                {useCustom && (
                  <input
                    type="number" min={1} max={30} value={customTouches}
                    onChange={e => setCustomTouches(Number(e.target.value))}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                )}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Channels</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CHANNEL_OPTIONS.map(ch => (
                    <Chip
                      key={ch}
                      label={ch.replace("_", " ")}
                      selected={ch === "mixed" ? channels.length === 4 : channels.includes(ch)}
                      onClick={() => toggleChannel(ch)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={generate}
              disabled={generating || !effectiveGoal}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 disabled:opacity-40 transition-colors shadow-sm"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating campaign…" : "✨ Generate Complete Campaign"}
            </button>

          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Output */}
      {(output || generating) && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

          {/* Output header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-600" />
              <span className="text-xs font-bold text-gray-900">AI Campaign Strategy</span>
              {generating && !done && (
                <span className="flex items-center gap-1 text-[10px] text-violet-600 font-semibold">
                  <Loader2 className="w-3 h-3 animate-spin" /> Writing…
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Complete
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {done && (
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy all"}
                </button>
              )}
              <button
                onClick={reset}
                className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> New generation
              </button>
            </div>
          </div>

          {/* Streaming output */}
          <div
            ref={outputRef}
            className="px-4 py-4 max-h-[600px] overflow-y-auto"
          >
            {output ? (
              <RenderedOutput text={output} />
            ) : (
              <div className="flex items-center gap-2 text-xs text-violet-600 animate-pulse py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking about your campaign strategy…
              </div>
            )}
          </div>

          {/* Post-generation actions */}
          {done && output && (
            <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/60 space-y-3">

              {/* Quick meta summary */}
              {(() => {
                const meta = extractMeta(output);
                const parsed = parseStepsFromOutput(output);
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {meta.name && (
                      <div className="col-span-2 bg-violet-50 border border-violet-200 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wide mb-0.5">Campaign Name</p>
                        <p className="text-sm font-bold text-violet-900">{meta.name}</p>
                        {meta.objective && <p className="text-[11px] text-violet-700 mt-1">{meta.objective}</p>}
                      </div>
                    )}
                    {meta.overallScore && (
                      <div className="bg-white border border-gray-200 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BarChart3 className="w-3.5 h-3.5 text-violet-600" />
                          <p className="text-[10px] font-bold text-gray-700">Campaign Score</p>
                        </div>
                        <p className="text-xs text-gray-600">{meta.overallScore}</p>
                      </div>
                    )}
                    {meta.replyRate && (
                      <div className="bg-white border border-gray-200 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          <p className="text-[10px] font-bold text-gray-700">Expected Rates</p>
                        </div>
                        <p className="text-xs text-gray-600">Reply: {meta.replyRate}</p>
                        {meta.conversionRate && <p className="text-xs text-gray-600">Conversion: {meta.conversionRate}</p>}
                      </div>
                    )}
                    {meta.risk && (
                      <div className="bg-white border border-gray-200 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Shield className="w-3.5 h-3.5 text-amber-500" />
                          <p className="text-[10px] font-bold text-gray-700">Risk / Duration</p>
                        </div>
                        <p className="text-xs text-gray-600">Risk: {meta.risk}</p>
                        {meta.duration && <p className="text-xs text-gray-600">Duration: {meta.duration}</p>}
                      </div>
                    )}
                    {parsed.length > 0 && (
                      <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Zap className="w-3.5 h-3.5 text-emerald-600" />
                          <p className="text-[10px] font-bold text-emerald-800">{parsed.length} steps parsed and ready to build</p>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          Clicking "Build Sequence" will append these steps to your campaign sequence tab. No contacts will be enrolled and nothing will be sent.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {buildResult && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {buildResult}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={buildSequence}
                  disabled={building || !parseStepsFromOutput(output).length}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-sm"
                >
                  {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {building ? "Building…" : "Build Sequence from AI Output"}
                </button>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2.5 border border-violet-200 text-violet-700 text-xs font-semibold rounded-xl hover:bg-violet-50 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  No contacts enrolled · No messages sent · Review before using
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
