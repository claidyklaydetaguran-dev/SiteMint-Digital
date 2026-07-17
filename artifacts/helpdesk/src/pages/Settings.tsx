import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Users, Globe, UserCog } from "lucide-react";

type Panel = "members" | "language";

const NAV: {
  section: string;
  items: { id: Panel; label: string; icon: React.ElementType; description?: string }[];
}[] = [
  {
    section: "People",
    items: [
      { id: "members", label: "Members", icon: Users, description: "Manage team members" },
    ],
  },
  {
    section: "Account",
    items: [
      {
        id: "language",
        label: "Language Settings",
        icon: Globe,
        description: "Locale and timezone",
      },
    ],
  },
];

export default function Settings() {
  const [activePanel, setActivePanel] = useState<Panel>("members");

  return (
    <div className="flex h-full bg-slate-50">
      {/* Secondary sidebar */}
      <div className="w-[220px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col shadow-sm">
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

      {/* Panel content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {activePanel === "members"  && <MembersPanel />}
        {activePanel === "language" && <LanguagePanel />}
      </div>
    </div>
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

function MembersPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5">
        <UserCog className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">Team Members</h3>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-3">
        Multi-user access is coming soon. Right now each AI Receptionist account supports
        one login per business.
      </p>
      <Badge className="bg-slate-100 text-slate-500 border-transparent text-xs">
        Coming Soon
      </Badge>
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
        <SettingsSection title="Locale">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Display Language</div>
              <div className="text-xs text-slate-500">English (United States)</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-slate-200"
            >
              Change
            </Button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Timezone</div>
              <div className="text-xs text-slate-500">UTC-8 (Pacific Time)</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-slate-200"
            >
              Change
            </Button>
          </div>
        </SettingsSection>
        <SettingsSection title="Date & Time">
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
        </SettingsSection>
      </div>
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 shadow-sm">
        {children}
      </div>
    </div>
  );
}
