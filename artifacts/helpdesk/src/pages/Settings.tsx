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
    <div className="flex h-full flex-col bg-background md:flex-row">
      {/* Secondary nav: horizontal scrollable bar on mobile, vertical sidebar from md up */}
      <div className="flex-shrink-0 border-b border-border bg-card shadow-sm md:flex md:w-[220px] md:flex-col md:border-b-0 md:border-r">
        <div className="hidden px-4 py-4 border-b border-border md:block">
          <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:overflow-x-visible md:px-0 md:py-3">
          {NAV.map((group) => (
            <div key={group.section} className="flex flex-shrink-0 gap-1 md:mb-5 md:block md:gap-0">
              <div className="hidden px-4 mb-1.5 md:block">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {group.section}
                </span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`flex min-h-11 flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition-colors text-left md:w-full md:rounded-none md:px-4 ${
                    activePanel === item.id
                      ? "bg-surface-muted text-primary font-medium"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                  onClick={() => setActivePanel(item.id)}
                >
                  <item.icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      activePanel === item.id ? "text-primary" : "text-muted-foreground"
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
      <div className="min-w-0 flex-1 overflow-hidden">
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
      <div className="w-16 h-16 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center mb-5">
        <UserCog className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-2">Team Members</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-3">
        Multi-user access is coming soon. Right now each AI Receptionist account supports
        one login per business.
      </p>
      <Badge className="bg-muted text-muted-foreground border-transparent text-xs">
        Coming Soon
      </Badge>
    </div>
  );
}

// ─── Language ─────────────────────────────────────────────────────────────────

function LanguagePanel() {
  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-base font-semibold text-foreground mb-1">Language Settings</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Configure locale, date format, and timezone for your workspace.
      </p>
      <div className="space-y-4">
        <SettingsSection title="Locale">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Display Language</div>
              <div className="text-xs text-muted-foreground">English (United States)</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border"
            >
              Change
            </Button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Timezone</div>
              <div className="text-xs text-muted-foreground">UTC-8 (Pacific Time)</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-border"
            >
              Change
            </Button>
          </div>
        </SettingsSection>
        <SettingsSection title="Date & Time">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Date Format</div>
              <div className="text-xs text-muted-foreground">MM/DD/YYYY</div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">24-hour Time</div>
              <div className="text-xs text-muted-foreground">Show time in 24-hour format</div>
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
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="bg-card rounded-xl border border-border divide-y divide-border shadow-sm">
        {children}
      </div>
    </div>
  );
}
