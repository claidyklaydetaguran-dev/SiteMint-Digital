import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import {
  TrendingUp, Users, Trophy, DollarSign, Target, XCircle, Plus, ArrowRight,
  UserPlus, MessageSquare, CheckSquare, Upload, Phone, AlertTriangle,
  CheckCircle2, RefreshCw, Flame, ChevronRight, GitBranch, LayoutGrid,
  UserCheck, Headphones, AlertOctagon, Briefcase,
} from "lucide-react";
import { adminFetch, adminGet } from "@/lib/adminFetch";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DealStats {
  totalRevenue: number; winRate: number; activeLeads: number;
  openDeals: number; wonDeals: number; lostDeals: number;
  pipeline: { stage: string; count: number; total: number }[];
  monthly: { month: string; revenue: number }[];
}
interface RecentDeal {
  id: number; name: string; value: string; stage: string;
  closeDate?: string | null; leadName?: string; createdAt: string;
}
interface Lead {
  id: number; name: string; company?: string | null; status: string;
  priority: string; estimatedValue?: string | null;
  nextFollowUpAt?: string | null; lastContactedAt?: string | null;
}
interface CrmTask {
  id: number; title: string; type: string; status: string;
  dueDate?: string | null; leadId?: number | null; leadName?: string | null;
}
interface ConvThread {
  leadId: number | null;
  lead?: { id: number; name: string } | null;
  messages: { direction: string; channel: string; body?: string | null; createdAt: string }[];
  lastAt: string;
  unread: number;
}
interface PriorityItem {
  type: "task" | "followup" | "hot-lead" | "inbox";
  title: string; reason: string; href: string; urgent: boolean;
}
interface ReceptionistAccount {
  id: string | number; name?: string;
  conversationCount?: number; trialConversationsLimit?: number;
}
interface VoiceIssue {
  id: string | number; level?: string; message?: string; firmName?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  Lead: "#6366f1", Qualified: "#0ea5e9", Proposal: "#f97316",
  Won: "#10b981", Lost: "#ef4444",
};
const PRIORITY_BADGE: Record<string, string> = {
  High: "bg-red-100 text-red-600", Medium: "bg-yellow-50 text-yellow-700",
  Low: "bg-gray-100 text-gray-500",
};
const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const CLIENT_STATUSES = new Set(["Client", "Maintenance Client"]);

// ── Sub-components ────────────────────────────────────────────────────────────

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
        {loading ? <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" /> : (
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

/** Smaller, de-emphasized stat tile — used for the demoted vanity-metrics strip. */
function MiniStatCard({ label, value, icon: Icon, color, loading }: {
  label: string; value: string; icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
        {loading ? <div className="h-4 w-12 bg-gray-200 rounded animate-pulse mt-0.5" /> : (
          <p className="text-sm font-bold text-foreground leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

/** Lightweight, best-effort summary card for the additive O-2 sections. */
function SummaryCard({ icon: Icon, color, title, body, href, hrefLabel, loading }: {
  icon: React.ElementType; color: string; title: string; body: string;
  href?: string; hrefLabel?: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</p>
        {loading ? (
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-sm font-medium text-foreground mt-0.5">{body}</p>
        )}
      </div>
      {href && (
        <Link href={href}>
          <button className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
            {hrefLabel ?? "View"} <ArrowRight className="w-3 h-3" />
          </button>
        </Link>
      )}
    </div>
  );
}

const CustomBarTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">{payload[0]?.value} deal{payload[0]?.value !== 1 ? "s" : ""}</p>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function CrmExecutiveDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DealStats | null>(null);
  const [recentDeals, setRecentDeals] = useState<RecentDeal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [conversations, setConversations] = useState<ConvThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // O-2 additive sections — best-effort, never block the main dashboard.
  const [receptionistAccounts, setReceptionistAccounts] = useState<ReceptionistAccount[] | null>(null);
  const [issuesCount, setIssuesCount] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [statsRes, dealsRes, leadsRes, tasksRes, convsRes] = await Promise.allSettled([
        adminFetch("/api/crm/deals/stats"),
        adminFetch("/api/crm/deals"),
        adminFetch("/api/crm/leads"),
        adminFetch("/api/crm/tasks"),
        adminFetch("/api/crm/conversations"),
      ]);

      if (statsRes.status === "fulfilled" && statsRes.value.ok) setStats(await statsRes.value.json() as DealStats);
      if (dealsRes.status === "fulfilled" && dealsRes.value.ok) {
        const d = await dealsRes.value.json() as { deals: RecentDeal[] };
        setRecentDeals((d.deals || []).slice(0, 8));
      }
      if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
        const d = await leadsRes.value.json() as { leads: Lead[] };
        setLeads(d.leads || []);
      }
      if (tasksRes.status === "fulfilled" && tasksRes.value.ok) {
        const d = await tasksRes.value.json() as { tasks: CrmTask[] };
        setTasks(d.tasks || []);
      }
      if (convsRes.status === "fulfilled" && convsRes.value.ok) {
        const d = await convsRes.value.json() as { conversations: ConvThread[] };
        setConversations(d.conversations || []);
      }
    } catch { /* ignore */ }

    // Receptionist health — additive, best-effort. A missing/older backend
    // route (404) or any other failure simply omits the section.
    try {
      const r = await adminGet<{ accounts: ReceptionistAccount[] }>("/api/admin/receptionist-accounts");
      setReceptionistAccounts(r.accounts ?? []);
    } catch {
      setReceptionistAccounts(null);
    }

    // Unresolved issues — additive, best-effort. This backend route may not
    // exist yet; never surface an error on the home dashboard for that.
    try {
      const r = await adminGet<{ items?: VoiceIssue[]; count?: number }>("/api/admin/voice/issues");
      setIssuesCount(r.count ?? r.items?.length ?? 0);
    } catch {
      setIssuesCount(null);
    }

    if (silent) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Computed values ─────────────────────────────────────────────────────────

  const statCards = stats ? [
    { label: "Active Leads", value: String(stats.activeLeads), sub: "In pipeline", icon: Users, color: "#6366f1" },
    { label: "Open Deals", value: String(stats.openDeals), sub: "Lead · Qualified · Proposal", icon: TrendingUp, color: "#f97316" },
    { label: "Won Deals", value: String(stats.wonDeals), sub: "Closed successfully", icon: Trophy, color: "#10b981" },
    { label: "Lost Deals", value: String(stats.lostDeals), sub: "Did not close", icon: XCircle, color: "#ef4444" },
  ] : [];

  // Demoted per O-2: vanity totals, kept but moved to a small strip at the
  // bottom of the page instead of the top KPI row.
  const vanityCards = stats ? [
    { label: "Total Revenue", value: fmt(stats.totalRevenue), icon: DollarSign, color: "#10b981" },
    { label: "Win Rate", value: `${stats.winRate}%`, icon: Target, color: "#0ea5e9" },
  ] : [];

  const hasAnyRevenue = stats?.monthly.some(m => m.revenue > 0);

  const inboundUnread = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread || 0), 0),
    [conversations],
  );
  const overdueCount = useMemo(
    () => tasks.filter(t => t.status === "overdue").length,
    [tasks],
  );

  // O-2 §1 — Leads needing follow-up (overdue or due today), soonest first.
  const followUpLeads = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);
    return leads
      .filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < todayEnd)
      .sort((a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime())
      .slice(0, 6)
      .map(l => ({ ...l, overdue: new Date(l.nextFollowUpAt!) < todayStart }));
  }, [leads]);

  // O-2 §2 — Active clients (canonical "Client" / "Maintenance Client" leads).
  const activeClientsCount = useMemo(
    () => leads.filter(l => CLIENT_STATUSES.has(l.status)).length,
    [leads],
  );

  // O-2 §3 — Receptionist health summary.
  const receptionistSummary = useMemo(() => {
    if (!receptionistAccounts) return null;
    const nearLimit = receptionistAccounts.filter(a => {
      const used = a.conversationCount ?? 0;
      const limit = a.trialConversationsLimit ?? 0;
      return limit > 0 && used / limit >= 0.8;
    }).length;
    return { total: receptionistAccounts.length, nearLimit };
  }, [receptionistAccounts]);

  const priorities = useMemo((): PriorityItem[] => {
    const items: PriorityItem[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);

    tasks
      .filter(t => t.status === "overdue")
      .slice(0, 3)
      .forEach(t => items.push({
        type: "task",
        title: t.title,
        reason: t.leadName ? `Overdue task for ${t.leadName}` : `Overdue ${t.type || "task"}`,
        href: t.leadId ? `/admin/crm/leads/${t.leadId}` : "/admin/crm/tasks",
        urgent: true,
      }));

    leads
      .filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt) >= todayStart && new Date(l.nextFollowUpAt) < todayEnd)
      .slice(0, 2)
      .forEach(l => items.push({
        type: "followup",
        title: `Follow up with ${l.name}`,
        reason: [l.status, l.company].filter(Boolean).join(" · "),
        href: `/admin/crm/leads/${l.id}`,
        urgent: false,
      }));

    leads
      .filter(l =>
        l.priority === "High" &&
        l.status !== "Won" && l.status !== "Lost" &&
        (!l.lastContactedAt || new Date(l.lastContactedAt) < threeDaysAgo)
      )
      .slice(0, 2)
      .forEach(l => {
        if (items.length < 6) {
          items.push({
            type: "hot-lead",
            title: l.name,
            reason: `High priority · ${l.status}${l.company ? ` · ${l.company}` : ""} · no recent contact`,
            href: `/admin/crm/leads/${l.id}`,
            urgent: false,
          });
        }
      });

    conversations
      .filter(c => c.unread > 0)
      .slice(0, 2)
      .forEach(c => {
        if (items.length < 6) {
          items.push({
            type: "inbox",
            title: c.lead?.name ? `Inbound from ${c.lead.name}` : "Inbound message",
            reason: `${c.unread} unread message${c.unread !== 1 ? "s" : ""} waiting in inbox`,
            href: "/admin/crm/inbox",
            urgent: false,
          });
        }
      });

    return items.slice(0, 5);
  }, [tasks, leads, conversations]);

  const hotLeads = useMemo((): Lead[] => {
    const now = Date.now();
    return [...leads]
      .filter(l => l.status !== "Won" && l.status !== "Lost")
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 1;
        const pb = PRIORITY_ORDER[b.priority] ?? 1;
        if (pa !== pb) return pa - pb;
        const va = Number(a.estimatedValue ?? 0);
        const vb = Number(b.estimatedValue ?? 0);
        if (vb !== va) return vb - va;
        const fa = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Infinity;
        const fb = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Infinity;
        const aOvd = fa < now ? -1 : 0;
        const bOvd = fb < now ? -1 : 0;
        if (aOvd !== bOvd) return aOvd - bOvd;
        return fa - fb;
      })
      .slice(0, 5);
  }, [leads]);

  const recentConvs = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()).slice(0, 5),
    [conversations],
  );

  // ── Quick Actions definition ────────────────────────────────────────────────

  const quickActions = [
    {
      icon: UserPlus, label: "Add Lead", sub: "Create a new contact",
      href: "/admin/crm/leads", color: "text-indigo-600", bg: "bg-indigo-50",
      badge: null,
    },
    {
      icon: GitBranch, label: "Lead Pipeline", sub: "View all 8 stages",
      href: "/admin/crm/pipeline", color: "text-blue-600", bg: "bg-blue-50",
      badge: leads.filter(l => l.status !== "Won" && l.status !== "Lost").length || null,
    },
    {
      icon: LayoutGrid, label: "Deals Kanban", sub: "Track revenue opportunities",
      href: "/admin/crm/deals", color: "text-emerald-600", bg: "bg-emerald-50",
      badge: null,
    },
    {
      icon: MessageSquare, label: "Inbox", sub: "SMS & call threads",
      href: "/admin/crm/inbox", color: "text-sky-600", bg: "bg-sky-50",
      badge: inboundUnread > 0 ? inboundUnread : null,
      badgeColor: "bg-red-500",
    },
    {
      icon: CheckSquare, label: "Tasks", sub: "Manage follow-ups",
      href: "/admin/crm/tasks", color: "text-orange-600", bg: "bg-orange-50",
      badge: overdueCount > 0 ? overdueCount : null,
      badgeColor: "bg-red-500",
    },
    {
      icon: Upload, label: "Import Leads", sub: "Bulk upload contacts",
      href: "/admin/crm/import", color: "text-purple-600", bg: "bg-purple-50",
      badge: null,
    },
  ];

  // ── Priority badge ──────────────────────────────────────────────────────────

  const PriorityBadge = ({ type }: { type: PriorityItem["type"] }) => {
    const map: Record<string, { label: string; cls: string }> = {
      task:      { label: "Overdue Task",  cls: "bg-red-100 text-red-700" },
      followup:  { label: "Follow-up",     cls: "bg-yellow-100 text-yellow-700" },
      "hot-lead":{ label: "Hot Lead",      cls: "bg-orange-100 text-orange-700" },
      inbox:     { label: "Inbox",         cls: "bg-sky-100 text-sky-700" },
    };
    const { label, cls } = map[type] ?? { label: type, cls: "bg-gray-100 text-gray-600" };
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${cls}`}>{label}</span>;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">CRM Command Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your daily sales overview and priorities</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/dashboard">
              <button title="Discovery Portal"
                className="text-xs text-muted-foreground hover:text-foreground border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                Discovery Portal
              </button>
            </Link>
            <button
              onClick={() => load(true)}
              disabled={refreshing || loading}
              title="Refresh dashboard"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link href="/admin/crm/deals">
              <button className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors font-medium">
                <Plus className="w-4 h-4" /> New Deal
              </button>
            </Link>
          </div>
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {quickActions.map(({ icon: Icon, label, sub, href, color, bg, badge, badgeColor }) => (
              <Link key={href} href={href}>
                <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all group">
                  {badge !== null && badge !== undefined && (
                    <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full ${badgeColor ?? "bg-blue-500"} text-white text-[10px] font-bold flex items-center justify-center leading-none`}>
                      {(badge as number) > 99 ? "99+" : badge}
                    </span>
                  )}
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2.5`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-sm font-semibold text-foreground group-hover:text-blue-600 transition-colors leading-tight">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── 1. Leads Needing Follow-Up ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Leads Needing Follow-Up</h2>
            </div>
            <Link href="/admin/crm/leads">
              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                All leads <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array.from<unknown>({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="h-4 w-20 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1"><div className="h-3 w-36 bg-gray-200 rounded mb-1.5" /><div className="h-2.5 w-24 bg-gray-100 rounded" /></div>
                </div>
              ))}
            </div>
          ) : followUpLeads.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No follow-ups due.</p>
              <p className="text-xs text-muted-foreground mt-1">Nothing overdue or due today.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {followUpLeads.map(l => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/admin/crm/leads/${l.id}`)}
                  className={`w-full flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left ${l.overdue ? "border-l-2 border-red-400" : ""}`}
                >
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${l.overdue ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {l.overdue ? "Overdue" : "Due Today"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug truncate ${l.overdue ? "text-red-700" : "text-foreground"}`}>{l.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{[l.status, l.company].filter(Boolean).join(" · ")}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 2. Active Clients + 3. Receptionist Health ──────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard
            icon={UserCheck} color="#10b981" title="Active Clients"
            body={`${activeClientsCount} client${activeClientsCount !== 1 ? "s" : ""} (Client + Maintenance Client)`}
            href="/admin/crm/leads" hrefLabel="View"
            loading={loading}
          />
          {receptionistSummary ? (
            <SummaryCard
              icon={Headphones} color="#6366f1" title="Receptionist Health"
              body={`${receptionistSummary.total} receptionist firm${receptionistSummary.total !== 1 ? "s" : ""}${receptionistSummary.nearLimit > 0 ? ` · ${receptionistSummary.nearLimit} near their trial limit` : ""}`}
              href="/admin/ops/firms" hrefLabel="View all"
              loading={loading}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gray-100">
                <Headphones className="w-4 h-4 text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Receptionist Health</p>
                <p className="text-sm text-muted-foreground mt-0.5">{loading ? "Loading…" : "Not available"}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 4. Today's Tasks (+ Hot Leads) ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Today's Priorities / Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-orange-500" />
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Today's Tasks</h2>
              </div>
              <Link href="/admin/crm/tasks">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  All tasks <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array.from<unknown>({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                    <div className="h-4 w-20 bg-gray-200 rounded-full shrink-0" />
                    <div className="flex-1"><div className="h-3 w-36 bg-gray-200 rounded mb-1.5" /><div className="h-2.5 w-24 bg-gray-100 rounded" /></div>
                  </div>
                ))}
              </div>
            ) : priorities.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">You're caught up for today.</p>
                <p className="text-xs text-muted-foreground mt-1">No overdue tasks or pending follow-ups.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {priorities.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(item.href)}
                    className={`w-full flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left ${item.urgent ? "border-l-2 border-red-400" : ""}`}
                  >
                    <PriorityBadge type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug truncate ${item.urgent ? "text-red-700" : "text-foreground"}`}>{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.reason}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hot Leads to Review */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Hot Leads to Review</h2>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Rule-based</span>
              </div>
              <Link href="/admin/crm/leads">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  All leads <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array.from<unknown>({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                    <div className="flex-1"><div className="h-3 w-28 bg-gray-200 rounded mb-1.5" /><div className="h-2.5 w-20 bg-gray-100 rounded" /></div>
                    <div className="h-4 w-14 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : hotLeads.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No leads to review</p>
                <p className="text-xs text-muted-foreground mt-1">Add leads or import contacts to get started.</p>
                <Link href="/admin/crm/leads">
                  <button className="mt-3 text-xs text-blue-600 hover:text-blue-700">Go to Leads →</button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {hotLeads.map(lead => {
                  const initials = lead.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
                  const colorIdx = lead.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 8;
                  const colors = ["bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500","bg-orange-400","bg-teal-500","bg-cyan-500","bg-emerald-500"];
                  return (
                    <Link key={lead.id} href={`/admin/crm/leads/${lead.id}`}>
                      <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                        <div className={`w-8 h-8 rounded-full ${colors[colorIdx]} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-[10px] font-bold">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {lead.company ? `${lead.company} · ` : ""}{lead.status}
                            {lead.estimatedValue && Number(lead.estimatedValue) > 0 ? ` · ${fmt(Number(lead.estimatedValue))}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[lead.priority] ?? "bg-gray-100 text-gray-500"}`}>
                            {lead.priority}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 5. Unresolved Issues (best-effort, omitted if unavailable) ──────── */}
        {issuesCount !== null && (
          <SummaryCard
            icon={AlertOctagon} color="#ef4444" title="Unresolved Issues"
            body={`${issuesCount} unresolved issue${issuesCount !== 1 ? "s" : ""}`}
            href="/admin/ops/issues" hrefLabel="View all"
            loading={loading}
          />
        )}

        {/* ── 7. Active Projects (deal pipeline + revenue) ────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-emerald-500" /> Active Projects
          </h2>

          {/* Deal-count stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading
              ? Array.from<unknown>({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 mb-3" />
                    <div className="h-2 w-16 bg-gray-200 rounded mb-2" />
                    <div className="h-7 w-14 bg-gray-200 rounded mb-1" />
                    <div className="h-2 w-20 bg-gray-100 rounded" />
                  </div>
                ))
              : statCards.map(card => <StatCard key={card.label} {...card} loading={false} />)
            }
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                  <BarChart data={stats!.pipeline} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#CFE7EA" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#4A6472" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#4A6472" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#EDF9FA" }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#6366f1"
                      label={{ position: "top", fontSize: 10, fill: "#4A6472" }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

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
                  <Link href="/admin/crm/deals">
                    <button className="mt-2 text-xs text-emerald-600 hover:text-emerald-700">View pipeline</button>
                  </Link>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats.monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#CFE7EA" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#4A6472" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#4A6472" }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} />
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
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Recent Deals</h2>
              </div>
              <Link href="/admin/crm/deals">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  All deals <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array.from<unknown>({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                    <div className="h-3 w-32 bg-gray-200 rounded flex-1" />
                    <div className="h-3 w-16 bg-gray-100 rounded" />
                    <div className="h-5 w-16 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentDeals.length === 0 ? (
              <div className="py-12 text-center">
                <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No deals yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first deal to start tracking revenue.</p>
                <Link href="/admin/crm/deals">
                  <button className="mt-3 text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                    + New Deal
                  </button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentDeals.slice(0, 5).map(deal => (
                  <Link key={deal.id} href="/admin/crm/deals">
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{deal.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{deal.leadName || "No contact"}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground shrink-0">{fmt(Number(deal.value))}</p>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: (STAGE_COLORS[deal.stage] || "#6366f1") + "20", color: STAGE_COLORS[deal.stage] || "#6366f1" }}>
                        {deal.stage}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent Communications ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-500" />
              <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Recent Communications</h2>
            </div>
            <Link href="/admin/crm/inbox">
              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                Open Inbox <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="divide-y divide-gray-50">
              {Array.from<unknown>({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
                  <div className="flex-1"><div className="h-3 w-32 bg-gray-200 rounded mb-1.5" /><div className="h-2.5 w-20 bg-gray-100 rounded" /></div>
                  <div className="h-3 w-10 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : recentConvs.length === 0 ? (
            <div className="py-12 text-center px-5">
              <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">SMS and calls will appear here once Twilio is connected.</p>
              <Link href="/admin/crm/inbox">
                <button className="mt-3 text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                  Open Inbox
                </button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentConvs.map((conv, i) => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const isCall = lastMsg?.channel === "call";
                const isInbound = lastMsg?.direction === "inbound";
                const contactName = conv.lead?.name ?? "Unknown";
                return (
                  <Link key={i} href="/admin/crm/inbox">
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        {isCall
                          ? <Phone className="w-3.5 h-3.5 text-green-600" />
                          : <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-sm font-medium text-foreground truncate">{contactName}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-full shrink-0 ${isCall ? "bg-green-100 text-green-700" : "bg-sky-100 text-sky-700"}`}>
                            {isCall ? "Call" : "SMS"}
                          </span>
                          {conv.unread > 0 && (
                            <span className="text-[10px] font-bold px-1 py-0 rounded-full bg-red-500 text-white shrink-0">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {isInbound ? "↓ Inbound" : "↑ Outbound"}
                          {lastMsg?.body ? ` · ${lastMsg.body.slice(0, 40)}${lastMsg.body.length > 40 ? "…" : ""}` : ""}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground shrink-0">{timeAgo(conv.lastAt)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Demoted vanity metrics (win rate / total revenue) ───────────────── */}
        <div>
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">Totals</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {loading
              ? Array.from<unknown>({ length: 2 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 animate-pulse">
                    <div className="w-7 h-7 rounded-md bg-gray-200 mb-2" />
                    <div className="h-4 w-12 bg-gray-200 rounded" />
                  </div>
                ))
              : vanityCards.map(card => <MiniStatCard key={card.label} {...card} loading={false} />)
            }
          </div>
        </div>

      </div>
    </CrmLayout>
  );
}
