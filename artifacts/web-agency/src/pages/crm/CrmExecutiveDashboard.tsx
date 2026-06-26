import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { TrendingUp, Users, Trophy, DollarSign, Target, XCircle, Plus, ArrowRight } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

interface DealStats {
  totalRevenue: number;
  winRate: number;
  activeLeads: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  pipeline: { stage: string; count: number; total: number }[];
  monthly: { month: string; revenue: number }[];
}

interface RecentDeal {
  id: number;
  name: string;
  value: string;
  stage: string;
  closeDate?: string | null;
  leadName?: string;
  createdAt: string;
}

const STAGE_COLORS: Record<string, string> = {
  Lead: "#6366f1",
  Qualified: "#0ea5e9",
  Proposal: "#f97316",
  Won: "#10b981",
  Lost: "#ef4444",
};

function StatCard({ label, value, sub, icon: Icon, color, loading }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-1">{label}</p>
        {loading ? (
          <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

const CustomBarTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">{payload[0]?.value} deal{payload[0]?.value !== 1 ? "s" : ""}</p>
      {payload[1] && <p className="text-emerald-600 font-medium">{fmt(payload[1].value)}</p>}
    </div>
  );
};

const CustomLineTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-emerald-600 font-medium">{fmt(payload[0]?.value || 0)}</p>
    </div>
  );
};

export default function CrmExecutiveDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DealStats | null>(null);
  const [recentDeals, setRecentDeals] = useState<RecentDeal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    try {
      const [statsRes, dealsRes] = await Promise.all([
        fetch("/api/crm/deals/stats", { headers: { Authorization: `Bearer ${token()}` } }),
        fetch("/api/crm/deals", { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      if (statsRes.status === 401) { navigate("/admin"); return; }
      const statsData = await statsRes.json() as DealStats;
      const dealsData = await dealsRes.json() as { deals: RecentDeal[] };
      setStats(statsData);
      setRecentDeals((dealsData.deals || []).slice(0, 8));
    } catch { /* ignore */ }
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const statCards = stats ? [
    { label: "Total Revenue", value: fmt(stats.totalRevenue), sub: "From won deals", icon: DollarSign, color: "#10b981" },
    { label: "Active Leads", value: String(stats.activeLeads), sub: "In pipeline", icon: Users, color: "#6366f1" },
    { label: "Win Rate", value: `${stats.winRate}%`, sub: "Won / (Won + Lost)", icon: Target, color: "#0ea5e9" },
    { label: "Open Deals", value: String(stats.openDeals), sub: "Lead · Qualified · Proposal", icon: TrendingUp, color: "#f97316" },
    { label: "Won Deals", value: String(stats.wonDeals), sub: "Closed successfully", icon: Trophy, color: "#10b981" },
    { label: "Lost Deals", value: String(stats.lostDeals), sub: "Did not close", icon: XCircle, color: "#ef4444" },
  ] : [];

  const hasAnyRevenue = stats?.monthly.some(m => m.revenue > 0);

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Deal pipeline overview and performance metrics</p>
          </div>
          <Link href="/admin/crm/deals">
            <button className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors font-medium">
              <Plus className="w-4 h-4" /> New Deal
            </button>
          </Link>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
                  <div className="w-10 h-10 rounded-lg bg-gray-200 mb-3" />
                  <div className="h-2 w-16 bg-gray-200 rounded mb-2" />
                  <div className="h-7 w-14 bg-gray-200 rounded mb-1" />
                  <div className="h-2 w-20 bg-gray-100 rounded" />
                </div>
              ))
            : statCards.map(card => (
                <StatCard key={card.label} {...card} loading={false} />
              ))
          }
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Pipeline Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-foreground">Pipeline Distribution</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Deal count by stage</p>
              </div>
              <Link href="/admin/crm/deals">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  View board <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            {loading ? (
              <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
            ) : !stats?.pipeline.some(p => p.count > 0) ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-sm">No deals yet</p>
                <Link href="/admin/crm/deals">
                  <button className="mt-2 text-xs text-emerald-600 hover:text-emerald-700">+ Create your first deal</button>
                </Link>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.pipeline} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#f9fafb" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}
                    fill="#6366f1"
                    label={{ position: "top", fontSize: 10, fill: "#6b7280" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Monthly Revenue */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-foreground">Monthly Revenue</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Won deal value over 6 months</p>
              </div>
              {stats && <span className="text-xs text-muted-foreground">Last 6 months</span>}
            </div>
            {loading ? (
              <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
            ) : !stats || !hasAnyRevenue ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground">
                <DollarSign className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-sm">No revenue data yet</p>
                <p className="text-xs text-muted-foreground mt-1">Close deals to see monthly trends</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                  <Tooltip content={<CustomLineTooltip />} />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5}
                    dot={{ fill: "#10b981", r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Deals */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Recent Deals</h2>
            <Link href="/admin/crm/deals">
              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                All deals <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                  <div className="h-3 w-32 bg-gray-200 rounded flex-1" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                  <div className="h-5 w-16 bg-gray-100 rounded-full" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : recentDeals.length === 0 ? (
            <div className="py-14 text-center">
              <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No deals yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create your first deal to start tracking revenue.</p>
              <Link href="/admin/crm/deals">
                <button className="mt-4 text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                  + New Deal
                </button>
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Deal", "Contact", "Value", "Stage", "Close Date"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentDeals.map(deal => (
                  <tr key={deal.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-medium text-foreground text-sm">{deal.name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-muted-foreground">{deal.leadName || "—"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm font-semibold text-foreground">{fmt(Number(deal.value))}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: (STAGE_COLORS[deal.stage] || "#6366f1") + "20", color: STAGE_COLORS[deal.stage] || "#6366f1" }}>
                        {deal.stage}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-muted-foreground">
                        {deal.closeDate ? new Date(deal.closeDate + "T00:00:00").toLocaleDateString() : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </CrmLayout>
  );
}
