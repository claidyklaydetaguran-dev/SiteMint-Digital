import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGENT_TEMPLATES } from "@/lib/agentTemplates";
import {
  Plus,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Save,
  ChevronUp,
  ChevronDown,
  Smartphone,
} from "lucide-react";

interface AgentConfigData {
  name: string;
  industry: string | null;
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

// ─── Character counter ──────────────────────────────────────────────────────

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const over = len > max;
  const nearLimit = len >= Math.floor(max * 0.85);
  return (
    <span
      className={`text-[11px] tabular-nums ${
        over
          ? "text-rose-600 font-semibold"
          : nearLimit
          ? "text-amber-600"
          : "text-slate-400"
      }`}
      aria-live="polite"
    >
      {len}/{max}
    </span>
  );
}

// ─── Phone preview card ─────────────────────────────────────────────────────

function PhonePreview({
  greeting,
  questions,
}: {
  greeting: string;
  questions: string[];
}) {
  const previewGreeting = greeting.trim() || "Your greeting will appear here…";
  const previewQ = questions.find((q) => q.trim());

  return (
    <div className="w-52 flex-shrink-0 hidden lg:flex flex-col pt-1">
      <div className="flex items-center gap-1.5 mb-3">
        <Smartphone className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          SMS Preview
        </p>
      </div>
      {/* Phone frame */}
      <div className="bg-slate-800 rounded-[28px] p-2 shadow-lg">
        <div className="bg-white rounded-[20px] overflow-hidden">
          {/* Notch */}
          <div className="bg-slate-800 h-5 flex items-center justify-center">
            <div className="w-12 h-1 bg-slate-600 rounded-full" />
          </div>
          {/* Header bar */}
          <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
            <p className="text-[10px] text-center text-slate-500 font-medium">
              AI Receptionist · SMS
            </p>
          </div>
          {/* Messages */}
          <div className="p-3 space-y-2.5 min-h-[260px] bg-slate-50">
            {/* Greeting bubble */}
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[90%] border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-700 leading-relaxed">
                  {previewGreeting.length > 120
                    ? previewGreeting.slice(0, 117) + "…"
                    : previewGreeting}
                </p>
              </div>
            </div>
            {/* Caller reply placeholder */}
            <div className="flex justify-end">
              <div className="bg-indigo-600 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[75%]">
                <p className="text-[10px] text-indigo-100">Hi, I need help with…</p>
              </div>
            </div>
            {/* First question */}
            {previewQ && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[90%] border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-700 leading-relaxed">
                    {previewQ.length > 100 ? previewQ.slice(0, 97) + "…" : previewQ}
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Bottom bar */}
          <div className="bg-white border-t border-slate-200 px-3 py-2 flex items-center gap-1.5">
            <div className="flex-1 h-6 bg-slate-100 rounded-full" />
            <div className="w-6 h-6 bg-indigo-600 rounded-full" />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-3 leading-snug">
        Approximate preview — exact formatting depends on carrier.
      </p>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AgentConfig() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery<AgentConfigData>({
    queryKey: ["agent-config"],
    queryFn: () => apiFetch<AgentConfigData>("/receptionist/agent-config"),
  });

  const [greeting, setGreeting]       = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions]     = useState<string[]>([]);

  useEffect(() => {
    if (!config) return;
    setGreeting(config.greetingMessage ?? "");
    setDescription(config.businessDescription ?? "");
    setQuestions(config.qualifyingQuestions ?? []);
  }, [config]);

  const isDirty = config
    ? greeting !== (config.greetingMessage ?? "") ||
      description !== (config.businessDescription ?? "") ||
      JSON.stringify(questions) !== JSON.stringify(config.qualifyingQuestions ?? [])
    : false;

  const mutation = useMutation({
    mutationFn: (payload: Partial<AgentConfigData>) =>
      apiFetch<AgentConfigData>("/receptionist/agent-config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["agent-config"], updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = () => {
    mutation.mutate({
      greetingMessage:     greeting.slice(0, 500),
      businessDescription: description.slice(0, 1000),
      qualifyingQuestions: questions.map((q) => q.slice(0, 200)).filter(Boolean),
    });
  };

  const handleReset = () => {
    if (!config) return;
    setGreeting(config.greetingMessage ?? "");
    setDescription(config.businessDescription ?? "");
    setQuestions(config.qualifyingQuestions ?? []);
    setAppliedId(null);
  };

  const applyTemplate = (id: string) => {
    const tpl = AGENT_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setAppliedId(id);
    setGreeting(tpl.greetingMessage);
    setDescription(tpl.businessDescription);
    setQuestions(tpl.qualifyingQuestions);
  };

  const addQuestion = () => setQuestions((q) => [...q, ""]);
  const removeQuestion = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, val: string) =>
    setQuestions((q) => q.map((v, idx) => (idx === i ? val : v)));
  const moveQuestion = (i: number, dir: "up" | "down") => {
    setQuestions((q) => {
      const next = [...q];
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">AI Receptionist</h1>
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
          Live on SMS
        </Badge>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200 px-6 flex gap-6 flex-shrink-0">
        <button className="py-3 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600 -mb-px">
          Configure
        </button>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <span className="py-3 text-sm font-medium text-slate-400 cursor-not-allowed select-none">
              Test
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Coming soon
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto">
        {/* Template picker */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-600 mb-2.5">
            Start from a template
          </p>
          <div className="flex flex-wrap gap-2">
            {AGENT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  appliedId === tpl.id
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50"
                }`}
              >
                <span role="img" aria-label={tpl.label}>{tpl.emoji}</span>
                {tpl.label}
              </button>
            ))}
          </div>
          {appliedId && (
            <p className="text-[11px] text-indigo-600 mt-2">
              Template applied — edit the fields below and save.
            </p>
          )}
        </div>

        {/* Two-column form */}
        <div className="flex gap-8 px-6 py-6">
          {/* Left: form fields */}
          <div className="flex-1 min-w-0 max-w-xl space-y-5">
            {/* Business name (read-only) */}
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5 block">
                Business Name
              </label>
              <Input
                value={config.name}
                disabled
                className="h-9 bg-slate-50 text-slate-500 border-slate-200 text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Update your business name in account settings.
              </p>
            </div>

            {/* Greeting message */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Greeting Message
                </label>
                <CharCount value={greeting} max={500} />
              </div>
              <Textarea
                placeholder="Hi! This is the virtual receptionist for [Business]. How can I help you today?"
                className="text-sm resize-none min-h-[80px] border-slate-200 focus-visible:ring-indigo-500"
                maxLength={500}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                The first SMS message sent to callers.
              </p>
            </div>

            {/* Business description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Business Description
                </label>
                <CharCount value={description} max={1000} />
              </div>
              <Textarea
                placeholder="We are a [type] company that helps customers with…"
                className="text-sm resize-none min-h-[100px] border-slate-200 focus-visible:ring-indigo-500"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Context the AI uses to answer questions and qualify leads.
              </p>
            </div>

            {/* Qualifying questions */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Qualifying Questions
                </label>
                <button
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 disabled:opacity-40 transition-colors"
                  onClick={addQuestion}
                  disabled={questions.length >= 6}
                  aria-label="Add qualifying question"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Questions the AI asks to qualify each lead (up to 6, max 200 chars each).
              </p>
              {questions.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-sm text-slate-400">
                  No questions yet — click Add to create one
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex gap-2 items-center">
                        {/* Reorder buttons */}
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => moveQuestion(i, "up")}
                            disabled={i === 0}
                            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move question up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveQuestion(i, "down")}
                            disabled={i === questions.length - 1}
                            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Move question down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Input
                          value={q}
                          onChange={(e) => updateQuestion(i, e.target.value)}
                          placeholder={`Question ${i + 1}…`}
                          maxLength={200}
                          className="h-9 text-sm border-slate-200 focus-visible:ring-indigo-500 flex-1"
                          aria-label={`Qualifying question ${i + 1}`}
                        />
                        <button
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                          onClick={() => removeQuestion(i)}
                          aria-label={`Remove question ${i + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex justify-end pr-9">
                        <CharCount value={q} max={200} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inline save button (always visible in scroll area) */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold h-9 gap-1.5"
                onClick={handleSave}
                disabled={mutation.isPending || (!isDirty && !saved)}
              >
                {mutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                ) : saved ? (
                  <><CheckCircle2 className="h-4 w-4" /> Saved</>
                ) : (
                  <><Save className="h-4 w-4" /> Save Changes</>
                )}
              </Button>
              {mutation.isError && (
                <p className="text-xs text-rose-600">Save failed — please try again.</p>
              )}
            </div>
          </div>

          {/* Right: phone preview */}
          <PhonePreview greeting={greeting} questions={questions} />
        </div>
      </div>

      {/* Sticky save bar — appears when form is dirty */}
      {isDirty && (
        <div className="border-t border-indigo-100 bg-indigo-50 px-6 py-3 flex-shrink-0 flex items-center justify-between gap-4 shadow-md">
          <p className="text-sm text-indigo-700 font-medium">You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={mutation.isPending}
              className="h-8 text-sm border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-8 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-3.5 w-3.5" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
