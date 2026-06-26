import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Users, Phone, Mail, MessageSquare, Calendar, DollarSign,
  TrendingUp, Zap, Award, Target, BarChart2, FileText,
  Download, Globe,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Stats {
  total: number; newLeads: number; hotLeads: number;
  won: number; lost: number; followUpToday: number; overdue: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function ReportCard({ icon: Icon, title, description, color, badge }: {
  icon: React.ElementType; title: string; description: string;
  color: string; badge?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground group-hover:text-blue-600 transition-colors">{title}</p>
            {badge && (
              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-semibold">{badge}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

const AGENT_REPORTS = [
  { icon: Users, title: "Agent Activity", description: "Number of leads per agent alongside stats on follow-up.", color: "bg-blue-500" },
  { icon: Phone, title: "Calls", description: "See calls made, conversations, missed calls, and talk time by agent.", color: "bg-green-500" },
  { icon: FileText, title: "Call Logs", description: "See and listen to recent inbound and outbound calls.", color: "bg-teal-500" },
  { icon: MessageSquare, title: "Texts", description: "See text message delivery rates and other stats by phone number.", color: "bg-sky-500" },
  { icon: Calendar, title: "Appointments", description: "A list of appointments & outcomes with details on lead source and agent.", color: "bg-indigo-500" },
  { icon: DollarSign, title: "Deals", description: "See all deals with commissions by deal stage and lead source.", color: "bg-emerald-500" },
  { icon: Award, title: "Agent Leaderboard", description: "Friendly competition based on follow-up and appointments.", color: "bg-orange-500", badge: "PRO" },
  { icon: TrendingUp, title: "Deal Leaderboard", description: "See which agent is closing the most deals.", color: "bg-purple-500", badge: "PRO" },
  { icon: Target, title: "Agent Goals", description: "Manage annual commission and personal goals for each agent.", color: "bg-red-500" },
];

const SOURCE_REPORTS = [
  { icon: Globe, title: "Source Report", description: "Your top lead providers and sources of appointments.", color: "bg-blue-600" },
  { icon: Zap, title: "Speed to Lead", description: "See how quickly you follow up by source and follow-up type.", color: "bg-yellow-500" },
  { icon: Phone, title: "Contact Attempts", description: "See how many times you follow up on average by source.", color: "bg-green-600" },
  { icon: DollarSign, title: "Closed Deals by Source", description: "Which lead source has the most closed deals, commission and conversion rate %.", color: "bg-emerald-600" },
];

const MARKETING_REPORTS = [
  { icon: Mail, title: "Batch Emails", description: "See the results of your email campaigns, opens & clicks.", color: "bg-blue-500" },
  { icon: BarChart2, title: "Lead Conversion", description: "See lead conversion rates by source, stage, and assigned agent.", color: "bg-purple-500" },
  { icon: Download, title: "Export Reports", description: "Download lead, activity, and deal reports as CSV.", color: "bg-gray-500" },
];

export default function CrmReporting() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    fetch("/api/crm/stats", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setStats(d.stats));
  }, [navigate]);

  const TABS = ["Overview","Agent Activity","Lead Sources","Calls","Texts","Batch Emails","Deals","Appointments","Leaderboard"];

  return (
    <CrmLayout>
      <div className="max-w-screen-xl mx-auto p-5">
        {/* Page header + sub-nav */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-foreground">Reporting</h1>
          <button className="text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            How Reporting works →
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t.toLowerCase())}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors relative shrink-0 ${
                tab === t.toLowerCase()
                  ? "text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* KPI stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            <StatCard label="Total Leads" value={stats.total} icon={Users} color="bg-blue-500" />
            <StatCard label="New Leads" value={stats.newLeads} sub="Uncontacted" icon={Zap} color="bg-indigo-500" />
            <StatCard label="Hot Leads" value={stats.hotLeads} sub="High priority" icon={TrendingUp} color="bg-orange-500" />
            <StatCard label="Follow-ups Today" value={stats.followUpToday} sub="Due today" icon={Calendar} color="bg-sky-500" />
            <StatCard label="Overdue" value={stats.overdue} sub="Past due date" icon={Target} color="bg-red-500" />
            <StatCard label="Won" value={stats.won} sub="Closed deals" icon={Award} color="bg-green-500" />
          </div>
        )}

        {/* Report cards grid */}
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Agents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {AGENT_REPORTS.map(r => <ReportCard key={r.title} {...r} />)}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Lead Sources</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SOURCE_REPORTS.map(r => <ReportCard key={r.title} {...r} />)}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-foreground mb-3">Marketing</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MARKETING_REPORTS.map(r => <ReportCard key={r.title} {...r} />)}
            </div>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
