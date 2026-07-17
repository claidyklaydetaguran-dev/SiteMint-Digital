import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Save,
} from "lucide-react";

interface AgentConfigData {
  name: string;
  industry: string | null;
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function AgentConfig() {
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
        <button className="relative py-3 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600 -mb-px">
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

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        <AgentConfigPanel />
      </div>
    </div>
  );
}

// ─── Config form ──────────────────────────────────────────────────────────────

function AgentConfigPanel() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

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
      greetingMessage:     greeting,
      businessDescription: description,
      qualifyingQuestions: questions.filter(Boolean),
    });
  };

  const addQuestion    = () => setQuestions((q) => [...q, ""]);
  const removeQuestion = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, val: string) =>
    setQuestions((q) => q.map((v, idx) => (idx === i ? val : v)));

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 max-w-xl">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-slate-900">Agent Configuration</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Customize how your AI Receptionist greets and qualifies callers.
        </p>
      </div>

      {/* Business name (read-only) */}
      <div className="mb-5">
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
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5 block">
          Greeting Message
        </label>
        <Textarea
          placeholder="Hi! This is the virtual receptionist for [Business]. How can I help you today?"
          className="text-sm resize-none min-h-[80px] border-slate-200 focus-visible:ring-indigo-500"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
        />
        <p className="text-[11px] text-slate-400 mt-1">
          The first SMS message sent to callers.
        </p>
      </div>

      {/* Business description */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5 block">
          Business Description
        </label>
        <Textarea
          placeholder="We are a [type] company that helps customers with…"
          className="text-sm resize-none min-h-[100px] border-slate-200 focus-visible:ring-indigo-500"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Context the AI uses to answer questions and qualify leads.
        </p>
      </div>

      {/* Qualifying questions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Qualifying Questions
          </label>
          <button
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 disabled:opacity-40"
            onClick={addQuestion}
            disabled={questions.length >= 6}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          Questions the AI asks to qualify each lead (up to 6).
        </p>
        {questions.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-sm text-slate-400">
            No questions yet — click Add to create one
          </div>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder={`Question ${i + 1}…`}
                  className="h-9 text-sm border-slate-200 focus-visible:ring-indigo-500"
                />
                <button
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                  onClick={() => removeQuestion(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold h-9 gap-1.5"
          onClick={handleSave}
          disabled={mutation.isPending}
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
  );
}
