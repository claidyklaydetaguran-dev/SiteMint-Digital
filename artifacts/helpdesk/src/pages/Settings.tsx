import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Users,
  Zap,
  Globe,
  BookOpen,
  Smartphone,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  UserCog,
  Save,
} from "lucide-react";

type Panel =
  | "agent-config"
  | "members"
  | "mcp-access"
  | "language"
  | "product-guide"
  | "mobile-app";

const NAV: {
  section: string;
  items: { id: Panel; label: string; icon: React.ElementType; description?: string }[];
}[] = [
  {
    section: "Efficiency",
    items: [
      {
        id: "agent-config",
        label: "Agent Configuration",
        icon: Bot,
        description: "Configure AI agent behavior",
      },
    ],
  },
  {
    section: "People",
    items: [
      { id: "members", label: "Members", icon: Users, description: "Manage team members" },
    ],
  },
  {
    section: "Account",
    items: [
      { id: "mcp-access", label: "MCP Access", icon: Zap, description: "API & integration access" },
      { id: "language", label: "Language Settings", icon: Globe, description: "Locale and timezone" },
    ],
  },
  {
    section: "Resources",
    items: [
      { id: "product-guide", label: "Product Guide", icon: BookOpen },
      { id: "mobile-app", label: "Download Mobile App", icon: Smartphone },
    ],
  },
];

export default function Settings() {
  const [activePanel, setActivePanel] = useState<Panel>("agent-config");

  return (
    <div className="flex h-full bg-white">
      {/* Secondary Sidebar */}
      <div className="w-[220px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Settings</h2>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          {NAV.map((group) => (
            <div key={group.section} className="mb-5">
              <div className="px-4 mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {group.section}
                </span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${
                    activePanel === item.id
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => setActivePanel(item.id)}
                >
                  <item.icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      activePanel === item.id ? "text-indigo-600" : "text-slate-400"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {activePanel === "agent-config" && <AgentConfigPanel />}
        {activePanel === "members" && <MembersPanel />}
        {activePanel === "mcp-access" && <McpAccessPanel />}
        {activePanel === "language" && <LanguagePanel />}
        {activePanel === "product-guide" && (
          <ResourcePanel title="Product Guide" icon={BookOpen} />
        )}
        {activePanel === "mobile-app" && (
          <ResourcePanel title="Download Mobile App" icon={Smartphone} />
        )}
      </div>
    </div>
  );
}

// ─── Agent Config ─────────────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  industry: string | null;
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

function AgentConfigPanel() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: config, isLoading } = useQuery<AgentConfig>({
    queryKey: ["agent-config"],
    queryFn: () => apiFetch<AgentConfig>("/receptionist/agent-config"),
  });

  const [greeting, setGreeting] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (!config) return;
    setGreeting(config.greetingMessage ?? "");
    setDescription(config.businessDescription ?? "");
    setQuestions(config.qualifyingQuestions ?? []);
  }, [config]);

  const mutation = useMutation({
    mutationFn: (payload: Partial<AgentConfig>) =>
      apiFetch<AgentConfig>("/receptionist/agent-config", {
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
      greetingMessage: greeting,
      businessDescription: description,
      qualifyingQuestions: questions.filter(Boolean),
    });
  };

  const addQuestion = () => setQuestions((q) => [...q, ""]);
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
    <div className="flex flex-col h-full overflow-y-auto p-6 max-w-xl">
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
        <p className="text-[11px] text-slate-400 mt-1">Update your business name in account settings.</p>
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

// ─── Members ──────────────────────────────────────────────────────────────────

function MembersPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <UserCog className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-2">Team Members</h3>
      <p className="text-sm text-slate-500 max-w-xs mb-3">
        Multi-user access is coming soon. Right now each AI Receptionist account supports one login per business.
      </p>
      <Badge className="bg-slate-100 text-slate-500 border-transparent text-xs">Coming Soon</Badge>
    </div>
  );
}

// ─── MCP Access ───────────────────────────────────────────────────────────────

function McpAccessPanel() {
  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-base font-semibold text-slate-900 mb-1">MCP Access</h2>
      <p className="text-sm text-slate-500 mb-6">
        Manage API keys and integration access for Model Context Protocol.
      </p>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">API Keys</div>
          <Button
            size="sm"
            className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1"
          >
            <Plus className="h-3 w-3" /> New Key
          </Button>
        </div>
        <div className="space-y-2">
          {["sk_live_••••••••••••4f2a", "sk_live_••••••••••••9c1b"].map((key, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-white border border-slate-200 rounded px-3 py-2"
            >
              <code className="text-xs font-mono text-slate-700">{key}</code>
              <div className="flex items-center gap-2">
                <Badge
                  className={`${
                    i === 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  } border-transparent text-xs`}
                >
                  {i === 0 ? "Active" : "Inactive"}
                </Badge>
                <button className="text-xs text-rose-500 hover:text-rose-600">Revoke</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Section title="Permissions">
        <SettingRow
          label="Read conversations"
          description="Allow reading conversation data via API"
          defaultOn
        />
        <SettingRow
          label="Write conversations"
          description="Allow updating conversation records"
          defaultOn
        />
        <SettingRow
          label="Manage agent config"
          description="Allow updating agent configuration"
        />
      </Section>
    </div>
  );
}

// ─── Language ─────────────────────────────────────────────────────────────────

function LanguagePanel() {
  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-base font-semibold text-slate-900 mb-1">Language Settings</h2>
      <p className="text-sm text-slate-500 mb-6">
        Configure locale, date format, and timezone for your workspace.
      </p>
      <div className="space-y-4">
        <Section title="Locale">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Display Language</div>
              <div className="text-xs text-slate-500">English (United States)</div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs border-slate-200">
              Change
            </Button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Timezone</div>
              <div className="text-xs text-slate-500">UTC-8 (Pacific Time)</div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs border-slate-200">
              Change
            </Button>
          </div>
        </Section>
        <Section title="Date & Time">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Date Format</div>
              <div className="text-xs text-slate-500">MM/DD/YYYY</div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">24-hour Time</div>
              <div className="text-xs text-slate-500">Show time in 24-hour format</div>
            </div>
            <Switch />
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Resource Panel ───────────────────────────────────────────────────────────

function ResourcePanel({
  title,
  icon: Icon,
}: {
  title: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-indigo-400" />
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        {title === "Product Guide"
          ? "Access the full SiteMint documentation, tutorials, and best practices."
          : "Download the SiteMint mobile app for iOS and Android."}
      </p>
      <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5">
        <ExternalLink className="h-4 w-4" />
        {title === "Product Guide" ? "Open Guide" : "Download App"}
      </Button>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-200">
        {children}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  defaultOn,
}: {
  label: string;
  description: string;
  defaultOn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <Switch defaultChecked={!!defaultOn} />
    </div>
  );
}
