import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Users, Zap, TrendingUp, Clock, AlertTriangle, Trophy, XCircle, Activity,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Stats {
  total: number; newLeads: number; hotLeads: number;
  won: number; lost: number; followUpToday: number; overdue: number;
}
interface ActivityItem {
  id: number; type: string; title: string; description?: string;
  createdAt: string; leadId: number;
}

const activityIcon: Record<string, string> = {
  lead_created: "🟢", lead_imported: "📥", status_changed: "🔄",
  note_added: "📝", email_sent: "📧", task_created: "✅",
  task_completed: "🎯", follow_up_changed: "⏰", sms_attempted: "📱",
};

export default function CrmDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token()) { navigate("/admin"); return; }
    fetch("/api/crm/stats", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (r.status === 401) { navigate("/admin"); return null; } return r.json(); })
      .then(d => { if (d) { setStats(d.stats); setActivity(d.recentActivity || []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const statCards = stats ? [
    { label: "Total Leads", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "New Leads", value: stats.newLeads, icon: Zap, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Hot Leads", value: stats.hotLeads, icon: TrendingUp, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Follow-ups Today", value: stats.followUpToday, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "Overdue", value: stats.overdue, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Won", value: stats.won, icon: Trophy, color: "text-green-600", bg: "bg-green-50" },
    { label: "Lost", value: stats.lost, icon: XCircle, color: "text-gray-500", bg: "bg-gray-100" },
  ] : [];

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-foreground">CRM Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your leads and pipeline activity</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-foreground">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No activity yet. Add your first lead to get started.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activity.map(a => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <span className="text-base mt-0.5">{activityIcon[a.type] || "•"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                    {a.description && <p className="text-xs text-muted-foreground truncate">{a.description}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
