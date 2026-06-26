import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell,
} from "recharts";
import {
  Users, DollarSign, TrendingUp, Target, Zap, MessageSquare, Phone,
  CheckSquare, Award, Lightbulb, AlertTriangle, BarChart2, RefreshCw,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrmStats {
  total: number; newLeads: number; hotLeads: number;
  won: number; lost: number; followUpToday: number; overdue: number;
}
interface DealStats {
  totalRevenue: number; winRate: number; activeLeads: number;
  openDeals: number; wonDeals: number; lostDeals: number;
  pipeline: { stage: string; count: number; total: number }[];
  monthly: { month: string; revenue: number }[];
}
interface Lead {
  id: number; name: string; source?: string | null; status: string;
  priority: string; createdAt: string;
}
interface CrmTask {
  id: number; status: string; dueDate?: string | null; createdAt: string;
}
interface MsgItem { direction: string; channel: string; }
interface ConvThread {
  leadId: number | null;
  messages: MsgItem[];
  lastAt: string;
  unread: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function filterByRange<T extends { createdAt: string }>(items: T[], range: string): T[] {
  if (range === "all") return items;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return items.filter(i => new Date(i.createdAt) >= cutoff);
}

// ── Reusable components ───────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="h-2.5 w-20 bg-gray-200 rounded mb-2" />
          <div className="h-7 w-12 bg-gray-200 rounded mb-2" />
          <div className="h-2 w-14 bg-gray-100 rounded" />
        </div>
        <div className="w-9 h-9 rounded-lg bg-gray-200 shrink-0" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, bg, fg, warn }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; bg: string; fg: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${warn ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${fg}`} />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children, height = 220 }: {
  title: string; sub?: string; children: React.ReactNode; height?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function EmptyChart({ label }: { label?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
      <BarChart2 className="w-7 h-7 opacity-20" />
      <p className="text-xs">{label ?? "No data yet"}</p>
    </div>
  );
}

const BarTip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const AreaTip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-emerald-600 font-medium">{fmt(payload[0]?.value ?? 0)}</p>
    </div>
  );
};

const DEAL_STAGE_COLORS: Record<string, string> = {
  Lead: "#6366f1", Qualified: "#0ea5e9", Proposal: "#f97316", Won: "#10b981", Lost: "#ef4444",
};
const SOURCE_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16",
];

const RANGE_OPTIONS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CrmReporting() {
  const [, navigate] = useLocation();
  const [crmStats, setCrmStats] = useState<CrmStats | null>(null);
  const [dealStats, setDealStats] = useState<DealStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelineMap, setPipelineMap] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [conversations, setConversations] = useState<ConvThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("all");

  const load = useCallback(async () => {
    if (!token()) {
      navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const h = { Authorization: `Bearer ${token()}` };
      const [statsRes, dealRes, leadsRes, pipeRes, tasksRes, convsRes] = await Promise.allSettled([
        fetch("/api/crm/stats", { headers: h }),
        fetch("/api/crm/deals/stats", { headers: h }),
        fetch("/api/crm/leads", { headers: h }),
        fetch("/api/crm/pipeline", { headers: h }),
        fetch("/api/crm/tasks", { headers: h }),
        fetch("/api/crm/conversations", { headers: h }),
      ]);

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const d = await statsRes.value.json() as { stats: CrmStats };
        setCrmStats(d.stats ?? null);
      }
      if (dealRes.status === "fulfilled" && dealRes.value.ok) {
        const d = await dealRes.value.json() as DealStats;
        setDealStats(d ?? null);
      }
      if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
        const d = await leadsRes.value.json() as { leads: Lead[] };
        setLeads(d.leads ?? []);
      }
      if (pipeRes.status === "fulfilled" && pipeRes.value.ok) {
        const d = await pipeRes.value.json() as { pipeline: Record<string, unknown[]> };
        const map: Record<string, number> = {};
        for (const [stage, items] of Object.entries(d.pipeline ?? {})) {
          map[stage] = Array.isArray(items) ? items.length : 0;
        }
        setPipelineMap(map);
      }
      if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
        const d = await tasksRes.value.json() as { tasks: CrmTask[] };
        setTasks(d.tasks ?? []);
      }
      if (convsRes.status === "fulfilled" && convsRes.value.ok) {
        const d = await convsRes.value.json() as { conversations: ConvThread[] };
        setConversations(d.conversations ?? []);
      }
    } catch {
      setError("Failed to load reporting data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  // ── Derived / computed data ─────────────────────────────────────────────────

  const filteredLeads = useMemo(() => filterByRange(leads, range), [leads, range]);
  const filteredTasks = useMemo(() => filterByRange(tasks, range), [tasks, range]);

  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const s = l.source?.trim() || "Unknown";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredLeads]);

  const pipelineData = useMemo(
    () => Object.entries(pipelineMap).map(([stage, count]) => ({ stage, count })),
    [pipelineMap],
  );

  const taskData = useMemo(() => {
    const map: Record<string, number> = { Pending: 0, Completed: 0, Overdue: 0 };
    filteredTasks.forEach(t => {
      const key = t.status.charAt(0).toUpperCase() + t.status.slice(1);
      if (key in map) map[key]++;
    });
    return Object.entries(map).map(([status, count]) => ({ status, count }));
  }, [filteredTasks]);

  const commStats = useMemo(() => {
    let inbound = 0, outbound = 0, sms = 0, calls = 0;
    conversations.forEach(c =>
      c.messages.forEach(m => {
        if (m.direction === "inbound") inbound++; else outbound++;
        if (m.channel === "sms") sms++; else calls++;
      })
    );
    return { total: conversations.length, inbound, outbound, sms, calls, totalMsgs: inbound + outbound };
  }, [conversations]);

  const overdueCount = useMemo(
    () => filteredTasks.filter(t => t.status === "overdue").length,
    [filteredTasks],
  );

  const insights = useMemo(() => {
    const list: { text: string; warn: boolean }[] = [];

    const topStage = [...pipelineData].sort((a, b) => b.count - a.count)[0];
    if (topStage && topStage.count > 0) {
      list.push({ text: `Most leads are currently in the "${topStage.stage}" stage (${topStage.count} lead${topStage.count !== 1 ? "s" : ""}).`, warn: false });
    }
    if (sourceData.length > 0) {
      list.push({ text: `Top lead source is "${sourceData[0].name}" with ${sourceData[0].value} lead${sourceData[0].value !== 1 ? "s" : ""}.`, warn: false });
    }
    if (overdueCount > 0) {
      list.push({ text: `You have ${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""} requiring immediate attention.`, warn: true });
    }
    if (dealStats && dealStats.totalRevenue > 0) {
      list.push({ text: `Won revenue is ${fmt(dealStats.totalRevenue)} with a ${dealStats.winRate}% win rate.`, warn: false });
    }
    if (commStats.inbound > 0) {
      list.push({ text: `Inbox has ${commStats.inbound} inbound message${commStats.inbound !== 1 ? "s" : ""} that may need a reply.`, warn: commStats.inbound > 3 });
    }
    if (list.length === 0 && !loading) {
      list.push({ text: "No leads yet — import from the Discovery Portal or add leads manually to see insights.", warn: false });
    }
    return list;
  }, [pipelineData, sourceData, overdueCount, dealStats, commStats, loading]);

  const commCards = [
    { label: "Conversations", value: commStats.total, bg: "bg-purple-50", fg: "text-purple-600", icon: MessageSquare },
    { label: "Inbound", value: commStats.inbound, bg: "bg-emerald-50", fg: "text-emerald-600", icon: TrendingUp },
    { label: "Outbound", value: commStats.outbound, bg: "bg-blue-50", fg: "text-blue-600", icon: Zap },
    { label: "SMS", value: commStats.sms, bg: "bg-sky-50", fg: "text-sky-600", icon: MessageSquare },
    { label: "Calls", value: commStats.calls, bg: "bg-green-50", fg: "text-green-600", icon: Phone },
    { label: "Total Msgs", value: commStats.totalMsgs, bg: "bg-gray-50", fg: "text-gray-500", icon: Users },
  ];

  return (
    <CrmLayout>
      <div className="max-w-screen-xl mx-auto px-5 py-5">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reporting</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Live analytics from your CRM data</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            {/* Time range filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {RANGE_OPTIONS.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    range === r.key
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="mb-5 flex items-center gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={load} className="ml-auto text-xs font-medium underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {/* ── KPI Grid ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {loading ? (
            Array.from<unknown>({ length: 8 }).map((_, i) => <KpiSkeleton key={i} />)
          ) : (
            <>
              <KpiCard
                label="Total Leads" value={crmStats?.total ?? 0} sub="In CRM"
                icon={Users} bg="bg-blue-50" fg="text-blue-600"
              />
              <KpiCard
                label="New This Week" value={crmStats?.newLeads ?? 0} sub="Uncontacted"
                icon={Zap} bg="bg-indigo-50" fg="text-indigo-600"
              />
              <KpiCard
                label="Hot Leads" value={crmStats?.hotLeads ?? 0} sub="High priority"
                icon={TrendingUp} bg="bg-orange-50" fg="text-orange-600"
              />
              <KpiCard
                label="Open Deals" value={dealStats?.openDeals ?? 0} sub="Active pipeline"
                icon={Target} bg="bg-sky-50" fg="text-sky-600"
              />
              <KpiCard
                label="Won Revenue" value={fmt(dealStats?.totalRevenue ?? 0)} sub="From closed deals"
                icon={DollarSign} bg="bg-emerald-50" fg="text-emerald-600"
              />
              <KpiCard
                label="Win Rate" value={`${dealStats?.winRate ?? 0}%`} sub="Won / (Won + Lost)"
                icon={Award} bg="bg-green-50" fg="text-green-600"
              />
              <KpiCard
                label="Overdue Tasks" value={overdueCount} sub="Need action"
                icon={CheckSquare} bg={overdueCount > 0 ? "bg-red-50" : "bg-gray-50"}
                fg={overdueCount > 0 ? "text-red-500" : "text-gray-400"} warn={overdueCount > 0}
              />
              <KpiCard
                label="Conversations" value={conversations.length}
                sub={`${commStats.totalMsgs} total messages`}
                icon={MessageSquare} bg="bg-purple-50" fg="text-purple-600"
              />
            </>
          )}
        </div>

        {/* ── CRM Insights ────────────────────────────────────────────────────── */}
        {!loading && insights.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <h3 className="text-sm font-semibold text-foreground">CRM Insights</h3>
              <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                Rule-based
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {insights.map((ins, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 ${
                    ins.warn
                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                      : "bg-blue-50 border border-blue-100 text-blue-800"
                  }`}
                >
                  {ins.warn
                    ? <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                    : <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-blue-500" />
                  }
                  <span className="leading-relaxed">{ins.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Charts Grid ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Chart 1 — Lead Pipeline by Stage */}
          <ChartCard
            title="Lead Pipeline by Stage"
            sub="Lead count per CRM status"
          >
            {pipelineData.length === 0 || pipelineData.every(d => d.count === 0) ? (
              <EmptyChart label="No leads in pipeline yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<BarTip />} />
                  <Bar dataKey="count" name="Leads" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 2 — Lead Source Breakdown */}
          <ChartCard
            title="Lead Source Breakdown"
            sub={`${filteredLeads.length} lead${filteredLeads.length !== 1 ? "s" : ""} in selected period`}
          >
            {sourceData.length === 0 ? (
              <EmptyChart label="No leads to analyze" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sourceData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 90, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip content={<BarTip />} />
                  <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {sourceData.map((_, idx) => (
                      <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 3 — Deal Revenue Trend */}
          <ChartCard
            title="Deal Revenue Trend"
            sub="Monthly won revenue (from closed deals)"
          >
            {!dealStats || dealStats.monthly.every(m => m.revenue === 0) ? (
              <EmptyChart label="No deal revenue recorded yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dealStats.monthly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                  />
                  <Tooltip content={<AreaTip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 4 — Deal Stage Distribution */}
          <ChartCard
            title="Deal Stage Distribution"
            sub="Number of deals per stage"
          >
            {!dealStats || dealStats.pipeline.every(p => p.count === 0) ? (
              <EmptyChart label="No deals created yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealStats.pipeline} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<BarTip />} />
                  <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {dealStats.pipeline.map((entry, idx) => (
                      <Cell key={idx} fill={DEAL_STAGE_COLORS[entry.stage] ?? "#9ca3af"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 5 — Task Overview */}
          <ChartCard
            title="Task Overview"
            sub={`${filteredTasks.length} task${filteredTasks.length !== 1 ? "s" : ""} in selected period`}
            height={190}
          >
            {filteredTasks.length === 0 ? (
              <EmptyChart label="No tasks found for this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<BarTip />} />
                  <Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]} maxBarSize={80}>
                    {taskData.map((entry, idx) => {
                      const colors: Record<string, string> = {
                        Pending: "#0ea5e9",
                        Completed: "#10b981",
                        Overdue: "#ef4444",
                      };
                      return <Cell key={idx} fill={colors[entry.status] ?? "#9ca3af"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Chart 6 — Communication Activity Summary */}
          <ChartCard
            title="Communication Activity"
            sub="SMS &amp; call breakdown from your inbox"
            height={190}
          >
            {commStats.totalMsgs === 0 ? (
              <EmptyChart label="No SMS or call activity recorded yet" />
            ) : (
              <div className="h-full flex items-center">
                <div className="grid grid-cols-3 gap-3 w-full">
                  {commCards.map(({ label, value, bg, fg, icon: Icon }) => (
                    <div
                      key={label}
                      className={`${bg} rounded-xl px-3 py-3 text-center border border-transparent`}
                    >
                      <Icon className={`w-4 h-4 mx-auto mb-1.5 ${fg}`} />
                      <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

        </div>

        {/* ── Footer note ─────────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-muted-foreground mt-8 pb-4">
          Data refreshes on page load. Use the ↻ button to reload. Time range filter applies to leads and tasks only.
        </p>
      </div>
    </CrmLayout>
  );
}
