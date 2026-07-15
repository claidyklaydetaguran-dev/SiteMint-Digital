import { useState } from "react";
import { useListHelpdeskAgents } from "@workspace/api-client-react";
import type { HelpdeskAgent } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Users,
  Zap,
  Globe,
  BookOpen,
  Smartphone,
  Plus,
  Search,
  UserCog,
  CheckCircle2,
  Mail,
  ExternalLink,
} from "lucide-react";

type Panel =
  | "agent-config"
  | "members"
  | "mcp-access"
  | "language"
  | "product-guide"
  | "mobile-app";

const NAV: { section: string; items: { id: Panel; label: string; icon: React.ElementType; description?: string }[] }[] = [
  {
    section: "Efficiency",
    items: [
      { id: "agent-config", label: "Agent Configuration", icon: Bot, description: "Configure AI agent behavior" },
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
                  <item.icon className={`h-4 w-4 flex-shrink-0 ${activePanel === item.id ? "text-indigo-600" : "text-slate-400"}`} />
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
        {activePanel === "product-guide" && <ResourcePanel title="Product Guide" icon={BookOpen} />}
        {activePanel === "mobile-app" && <ResourcePanel title="Download Mobile App" icon={Smartphone} />}
      </div>
    </div>
  );
}

// ─── Agent Configuration ──────────────────────────────────────────────────────

function AgentConfigPanel() {
  const { data: agents, isLoading } = useListHelpdeskAgents();
  const [selectedAgent, setSelectedAgent] = useState<HelpdeskAgent | null>(null);

  return (
    <div className="flex h-full">
      {/* Agent list */}
      <div className="w-[220px] flex-shrink-0 border-r border-slate-200 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">Agents</span>
          <button className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading ? (
            <div className="px-4 py-2 text-xs text-slate-400">Loading…</div>
          ) : (
            agents?.map((agent) => (
              <button
                key={agent.id}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                  selectedAgent?.id === agent.id
                    ? "bg-indigo-50"
                    : "hover:bg-slate-50"
                }`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="relative">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback
                      style={{ backgroundColor: agent.avatarColor }}
                      className="text-white text-[10px] font-bold"
                    >
                      {agent.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      agent.status === "online" ? "bg-emerald-500" : agent.status === "busy" ? "bg-amber-400" : "bg-slate-300"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${selectedAgent?.id === agent.id ? "text-indigo-700" : "text-slate-900"}`}>
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize">{agent.role}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Agent detail / empty state */}
      <div className="flex-1 overflow-y-auto">
        {selectedAgent ? (
          <AgentDetail agent={selectedAgent} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <UserCog className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Select an Agent</h3>
            <p className="text-sm text-slate-500 max-w-xs">
              Choose an agent from the list to view their configuration, routing rules, and AI settings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentDetail({ agent }: { agent: HelpdeskAgent }) {
  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
        <div className="relative">
          <Avatar className="h-14 w-14">
            <AvatarFallback
              style={{ backgroundColor: agent.avatarColor }}
              className="text-white text-xl font-bold"
            >
              {agent.initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
              agent.status === "online" ? "bg-emerald-500" : agent.status === "busy" ? "bg-amber-400" : "bg-slate-300"
            }`}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{agent.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge className="bg-indigo-100 text-indigo-700 border-transparent text-xs capitalize">{agent.role}</Badge>
            {agent.teamName && (
              <span className="text-xs text-slate-500">· {agent.teamName}</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Section title="Availability">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-slate-900">Online Status</div>
              <div className="text-xs text-slate-500 capitalize">{agent.status}</div>
            </div>
            <Switch defaultChecked={agent.status === "online"} />
          </div>
        </Section>

        <Section title="Routing Rules">
          <SettingRow label="Auto-assign tickets" description="Automatically receive new tickets" defaultOn />
          <SettingRow label="Round-robin routing" description="Distribute tickets evenly" />
        </Section>

        <Section title="AI Assistance">
          <SettingRow label="AI reply suggestions" description="See AI-drafted reply suggestions" defaultOn />
          <SettingRow label="Auto-summarize thread" description="Summarize long threads automatically" defaultOn />
        </Section>

        <div className="pt-2">
          <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-200">
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, description, defaultOn }: { label: string; description: string; defaultOn?: boolean }) {
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

// ─── Members ──────────────────────────────────────────────────────────────────

function MembersPanel() {
  const { data: agents, isLoading } = useListHelpdeskAgents();
  const [search, setSearch] = useState("");

  const filtered = agents?.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Member Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">{agents?.length ?? 0} team members</p>
        </div>
        <Button size="sm" className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Invite Member
        </Button>
      </div>
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search members…"
            className="h-8 pl-8 text-xs bg-white border-slate-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-slate-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Online Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 w-[80px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered?.map((agent) => (
                <tr key={agent.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 text-slate-600 text-xs">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {agent.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback
                          style={{ backgroundColor: agent.avatarColor }}
                          className="text-white text-[10px] font-bold"
                        >
                          {agent.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-slate-900">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      agent.status === "online"
                        ? "bg-emerald-100 text-emerald-700"
                        : agent.status === "busy"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        agent.status === "online" ? "bg-emerald-500" : agent.status === "busy" ? "bg-amber-400" : "bg-slate-400"
                      }`} />
                      <span className="capitalize">{agent.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-slate-100 text-slate-600 border-transparent text-xs capitalize">
                      {agent.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── MCP Access ───────────────────────────────────────────────────────────────

function McpAccessPanel() {
  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-base font-semibold text-slate-900 mb-1">MCP Access</h2>
      <p className="text-sm text-slate-500 mb-6">Manage API keys and integration access for Model Context Protocol.</p>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-slate-900">API Keys</div>
          <Button size="sm" className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white gap-1">
            <Plus className="h-3 w-3" /> New Key
          </Button>
        </div>
        <div className="space-y-2">
          {["sk_live_••••••••••••4f2a", "sk_live_••••••••••••9c1b"].map((key, i) => (
            <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded px-3 py-2">
              <code className="text-xs font-mono text-slate-700">{key}</code>
              <div className="flex items-center gap-2">
                <Badge className={`${i === 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"} border-transparent text-xs`}>
                  {i === 0 ? "Active" : "Inactive"}
                </Badge>
                <button className="text-xs text-rose-500 hover:text-rose-600">Revoke</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Section title="Permissions">
        <SettingRow label="Read tickets" description="Allow reading ticket data via API" defaultOn />
        <SettingRow label="Write tickets" description="Allow creating and updating tickets" defaultOn />
        <SettingRow label="Manage contacts" description="Allow contact CRUD operations" />
      </Section>
    </div>
  );
}

// ─── Language Settings ────────────────────────────────────────────────────────

function LanguagePanel() {
  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-base font-semibold text-slate-900 mb-1">Language Settings</h2>
      <p className="text-sm text-slate-500 mb-6">Configure locale, date format, and timezone for your workspace.</p>
      <div className="space-y-4">
        <Section title="Locale">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Display Language</div>
              <div className="text-xs text-slate-500">English (United States)</div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs border-slate-200">Change</Button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Timezone</div>
              <div className="text-xs text-slate-500">UTC-8 (Pacific Time)</div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs border-slate-200">Change</Button>
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

function ResourcePanel({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
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

