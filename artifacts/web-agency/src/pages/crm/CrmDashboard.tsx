import { useEffect, useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Phone, MessageSquare, SlidersHorizontal, AlertTriangle, TrendingUp, Zap, GitBranch, ChevronRight } from "lucide-react";
import { scoreLeadFromFields } from "@/lib/leadScore";
import { computeWorkflowQueue } from "@/lib/workflowEngine";
import { computeSimplifiedDisc, DISC_META, type DiscStyle } from "@/lib/discEngine";
import {
  computeDailyBrief, computeOpportunityRadar,
  type BriefInput, type RadarInput, type RadarEntry,
} from "@/lib/salesIntelligence";

const token = () => localStorage.getItem("adminToken") || "";

interface Stats {
  total: number; newLeads: number; hotLeads: number;
  won: number; lost: number; followUpToday: number; overdue: number;
}

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; priority: string; assignedTo?: string;
  lastContactedAt?: string | null; updatedAt: string; createdAt: string;
  serviceInterest?: string;
  estimatedValue?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus?: string;
  sowStatus?: string;
  smsConsent?: boolean;
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-red-400","bg-orange-400","bg-yellow-500","bg-teal-500","bg-cyan-500","bg-emerald-500",
];
function initials(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "a day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(d).toLocaleDateString();
}
function lastActivityLabel(lead: Lead) {
  if (lead.lastContactedAt) return `Last contacted · ${lead.serviceInterest || lead.status}`;
  if (lead.status === "New") return "New lead added";
  return `Stage updated · ${lead.status}`;
}

function Sparkline({ seed, color = "#34d399" }: { seed: number; color?: string }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const v = Math.sin(i * 1.7 + seed * 0.9) * 0.28 + Math.cos(i * 2.3 + seed * 0.4) * 0.18;
    return Math.max(0.05, Math.min(0.95, 0.5 + v + (i / 7) * 0.12));
  });
  const W = 90, H = 32;
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - p * H}`).join(" ");
  const area = `0,${H} ${d} ${W},${H}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg${seed})`} />
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DAY = 86_400_000;

export default function CrmDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState("");
  const [filterDisc, setFilterDisc]   = useState("");

  useEffect(() => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    Promise.all([
      fetch("/api/crm/stats", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([sd, ld]) => {
      setStats(sd.stats);
      setAllLeads((ld.leads || []).slice().sort(
        (a: Lead, b: Lead) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [navigate]);

  // ── Health Scores (memoized — computed once per allLeads change) ───────────
  const scoreMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof scoreLeadFromFields>>();
    for (const l of allLeads) map.set(l.id, scoreLeadFromFields(l));
    return map;
  }, [allLeads]);

  // ── Intelligence Insights (dynamic, data-driven alerts) ───────────────────
  const insights = useMemo(() => {
    const now = Date.now();
    const today = new Date().toDateString();
    const active = allLeads.filter(l => !["Won", "Lost"].includes(l.status));

    const noContact = active.filter(l =>
      !l.lastContactedAt || (now - new Date(l.lastContactedAt).getTime()) > 14 * DAY
    );
    const overdue = active.filter(l =>
      l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date()
    );
    const followUpToday = active.filter(l =>
      l.nextFollowUpAt && new Date(l.nextFollowUpAt).toDateString() === today
    );
    const proposalWaiting = active.filter(l => l.status === "Proposal Sent");
    const coldLeads = active.filter(l => (scoreMap.get(l.id)?.score ?? 50) < 40);
    const hotLeads  = active.filter(l => (scoreMap.get(l.id)?.score ?? 0) >= 80);

    const items: { type: "error"|"warning"|"success"|"info"; icon: string; text: string; count: number; href: string }[] = [];

    if (overdue.length > 0) items.push({
      type: "error", icon: "🚨",
      text: `${overdue.length} follow-up${overdue.length !== 1 ? "s" : ""} ${overdue.length !== 1 ? "are" : "is"} overdue — contact now.`,
      count: overdue.length, href: "/admin/crm/leads",
    });
    if (noContact.length > 0) items.push({
      type: "warning", icon: "📞",
      text: `${noContact.length} lead${noContact.length !== 1 ? "s" : ""} haven't been contacted in over two weeks.`,
      count: noContact.length, href: "/admin/crm/leads",
    });
    if (followUpToday.length > 0) items.push({
      type: "info", icon: "⏰",
      text: `${followUpToday.length} follow-up${followUpToday.length !== 1 ? "s" : ""} due today.`,
      count: followUpToday.length, href: "/admin/crm/leads",
    });
    if (proposalWaiting.length > 0) items.push({
      type: "info", icon: "📄",
      text: `${proposalWaiting.length} proposal${proposalWaiting.length !== 1 ? "s are" : " is"} waiting for response.`,
      count: proposalWaiting.length, href: "/admin/crm/leads",
    });
    if (coldLeads.length > 0) items.push({
      type: "warning", icon: "🧊",
      text: `${coldLeads.length} lead${coldLeads.length !== 1 ? "s are" : " is"} becoming cold.`,
      count: coldLeads.length, href: "/admin/crm/leads",
    });
    if (hotLeads.length > 0) items.push({
      type: "success", icon: "🔥",
      text: `${hotLeads.length} hot lead${hotLeads.length !== 1 ? "s are" : " is"} ready to close.`,
      count: hotLeads.length, href: "/admin/crm/leads",
    });

    return items;
  }, [allLeads, scoreMap]);

  // ── Communication Signals (computed from lead contact fields) ────────────
  const commHealth = useMemo(() => {
    const now = Date.now();
    const active = allLeads.filter(l => !["Won", "Lost"].includes(l.status));
    return {
      recentlyActive: active.filter(l => l.lastContactedAt &&
        now - new Date(l.lastContactedAt).getTime() < 7 * DAY).length,
      goingCold: active.filter(l => l.lastContactedAt &&
        now - new Date(l.lastContactedAt).getTime() >= 7 * DAY &&
        now - new Date(l.lastContactedAt).getTime() < 14 * DAY).length,
      cold: active.filter(l => l.lastContactedAt &&
        now - new Date(l.lastContactedAt).getTime() >= 14 * DAY).length,
      neverContacted: active.filter(l => !l.lastContactedAt).length,
    };
  }, [allLeads]);

  // ── DISC Distribution (computed from lead fields only, no extra API calls) ──
  const discMap = useMemo(() => {
    const map = new Map<number, DiscStyle>();
    allLeads.forEach(lead => {
      map.set(lead.id, computeSimplifiedDisc(lead));
    });
    return map;
  }, [allLeads]);

  const discDist = useMemo(() => {
    const active = allLeads.filter(l => !["Won", "Lost"].includes(l.status));
    const counts: Record<DiscStyle, number> = { Driver: 0, Expressive: 0, Amiable: 0, Analytical: 0 };
    active.forEach(l => {
      const s = discMap.get(l.id);
      if (s) counts[s]++;
    });
    return { counts, total: active.length };
  }, [allLeads, discMap]);

  // ── Sales Intelligence — Daily Brief + Opportunity Radar ─────────────────
  const dailyBrief = useMemo(() => {
    const siLeads = allLeads.map(l => ({
      id: l.id, name: l.name, company: l.company, status: l.status,
      priority: l.priority, estimatedValue: l.estimatedValue,
      lastContactedAt: l.lastContactedAt, nextFollowUpAt: l.nextFollowUpAt,
      proposalStatus: l.proposalStatus ?? "Not Started",
      sowStatus: l.sowStatus ?? "Not Started",
      generatedProposal: null, generatedSow: null, discoverySubmissionId: null,
      createdAt: l.createdAt, updatedAt: l.updatedAt,
    }));
    const briefInput: BriefInput = {
      leads: siLeads, tasks: [],
      healthScores: new Map(Array.from(scoreMap.entries()).map(([id, s]) => [id, s.score])),
    };
    return computeDailyBrief(briefInput);
  }, [allLeads, scoreMap]);

  const opportunityRadar = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    function proxyEngagement(lead: Lead): number {
      if (!lead.lastContactedAt) return 20;
      const days = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
      if (days < 3)  return 80;
      if (days < 7)  return 65;
      if (days < 14) return 45;
      if (days < 30) return 30;
      return 15;
    }
    const inputs: RadarInput[] = allLeads
      .filter(l => !["Won", "Lost"].includes(l.status))
      .map(l => ({
        lead: {
          id: l.id, name: l.name, company: l.company, status: l.status,
          priority: l.priority, estimatedValue: l.estimatedValue,
          lastContactedAt: l.lastContactedAt, nextFollowUpAt: l.nextFollowUpAt,
          proposalStatus: l.proposalStatus ?? "Not Started",
          sowStatus: l.sowStatus ?? "Not Started",
          generatedProposal: null, generatedSow: null, discoverySubmissionId: null,
          createdAt: l.createdAt, updatedAt: l.updatedAt,
        },
        healthScore:     scoreMap.get(l.id)?.score ?? 50,
        engagementScore: proxyEngagement(l),
        discStyle:       discMap.get(l.id) ?? "Amiable",
      }));
    return computeOpportunityRadar(inputs);
  }, [allLeads, scoreMap, discMap]);

  // ── Automation Queue Tiles (5 readiness buckets) ─────────────────────────
  const automationTiles = useMemo(() => {
    const active = allLeads.filter(l => !["Won", "Lost"].includes(l.status));
    return [
      {
        emoji: "📤", label: "Ready to Send",
        desc: "Draft proposal waiting",
        color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200",
        count: active.filter(l => l.proposalStatus === "Draft").length,
        action: "Review and send drafted proposals to clients",
      },
      {
        emoji: "⚠️", label: "Missing Info",
        desc: "Profile incomplete",
        color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200",
        count: active.filter(l => !l.email || !l.estimatedValue || !l.serviceInterest).length,
        action: "Complete lead profiles to enable full automation",
      },
      {
        emoji: "📝", label: "Proposal Needed",
        desc: "No proposal started",
        color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
        count: active.filter(l =>
          (l.proposalStatus == null || l.proposalStatus === "Not Started") &&
          ["Contacted", "Follow-up"].includes(l.status)
        ).length,
        action: "Generate proposals for qualified active leads",
      },
      {
        emoji: "📋", label: "SOW Needed",
        desc: "Proposal sent, no SOW",
        color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200",
        count: active.filter(l =>
          (l.proposalStatus === "Sent" || l.status === "Proposal Sent") &&
          (l.sowStatus == null || l.sowStatus === "Not Started")
        ).length,
        action: "Create Scope of Work for leads with active proposals",
      },
      {
        emoji: "🚀", label: "Ready for Kickoff",
        desc: "Deal closed — schedule start",
        color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
        count: allLeads.filter(l => l.status === "Won").length,
        action: "Schedule project kickoff meetings for won deals",
      },
    ];
  }, [allLeads]);

  // ── Workflow Queue (6 action-grouped buckets) ─────────────────────────────
  const workflowQueue = useMemo(
    () => computeWorkflowQueue(allLeads.map(l => ({
      id: l.id, name: l.name, company: l.company, status: l.status,
      proposalStatus: l.proposalStatus ?? "Not Started",
      sowStatus: l.sowStatus ?? "Not Started",
      lastContactedAt: l.lastContactedAt, nextFollowUpAt: l.nextFollowUpAt,
      estimatedValue: l.estimatedValue, updatedAt: l.updatedAt, createdAt: l.createdAt,
    }))),
    [allLeads],
  );

  // ── Smart CRM Lists (7 intelligence-based lists) ──────────────────────────
  const smartLists = useMemo(() => {
    const now = Date.now();
    const today = new Date().toDateString();
    const active = allLeads.filter(l => !["Won", "Lost"].includes(l.status));

    return [
      {
        emoji: "🔥", label: "Hot Leads",
        desc: "Health score ≥ 80",
        color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",
        count: active.filter(l => (scoreMap.get(l.id)?.score ?? 0) >= 80).length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "⚠️", label: "Follow-up Today",
        desc: "Due today",
        color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200",
        count: allLeads.filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt).toDateString() === today).length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "🚨", label: "Overdue Follow-ups",
        desc: "Missed deadline",
        color: "text-red-700", bg: "bg-red-50", border: "border-red-200",
        count: active.filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date()).length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "💰", label: "High Value",
        desc: "Est. value > $10K",
        color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
        count: allLeads.filter(l => parseFloat(l.estimatedValue ?? "0") > 10_000).length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "📞", label: "No Contact 14 Days",
        desc: "Needs outreach",
        color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
        count: active.filter(l => !l.lastContactedAt || (now - new Date(l.lastContactedAt).getTime()) > 14 * DAY).length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "📩", label: "Waiting for Reply",
        desc: "Proposal sent",
        color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200",
        count: active.filter(l => l.status === "Proposal Sent").length,
        href: "/admin/crm/leads",
      },
      {
        emoji: "🧊", label: "Cold Leads",
        desc: "Health score < 40",
        color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200",
        count: active.filter(l => (scoreMap.get(l.id)?.score ?? 50) < 40).length,
        href: "/admin/crm/leads",
      },
    ];
  }, [allLeads, scoreMap]);

  const statCards = stats ? [
    { label: "NEW LEADS",        value: stats.newLeads,      sub: `${stats.total} total`,  color: "#6366f1", seed: 1 },
    { label: "HOT LEADS",        value: stats.hotLeads,      sub: "High priority",          color: "#f97316", seed: 2 },
    { label: "FOLLOW-UPS TODAY", value: stats.followUpToday, sub: "Due today",              color: "#0ea5e9", seed: 3 },
    { label: "OVERDUE",          value: stats.overdue,       sub: "Need attention",         color: "#ef4444", seed: 4 },
    { label: "WON",              value: stats.won,           sub: "Closed deals",           color: "#34d399", seed: 5 },
  ] : [];

  const STAGES = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
  const filtered = allLeads
    .filter(l => !filterStage || l.status === filterStage)
    .filter(l => !filterDisc  || discMap.get(l.id) === filterDisc);

  if (loading) return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 pt-4 pb-0 overflow-hidden h-24">
              <div className="h-2 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-10 bg-gray-200 rounded mb-1" />
              <div className="h-2 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Stat cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {statCards.map(({ label, value, sub, color, seed }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 pt-4 pb-0 overflow-hidden">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-3xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">{sub}</p>
              <div className="-mx-4"><Sparkline seed={seed + value} color={color} /></div>
            </div>
          ))}
        </div>

        {/* ── Intelligence Insights ─────────────────────────────────────────── */}
        {insights.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Intelligence Insights</h2>
              <span className="ml-auto text-[10px] text-muted-foreground">Based on real CRM data · rule-based</span>
            </div>
            <div className="divide-y divide-gray-50">
              {insights.map((item, i) => {
                const alertStyles = {
                  error:   "border-l-red-500   bg-red-50/40",
                  warning: "border-l-amber-500  bg-amber-50/40",
                  success: "border-l-emerald-500 bg-emerald-50/40",
                  info:    "border-l-blue-500   bg-blue-50/30",
                };
                const iconBg = {
                  error:   "bg-red-100   text-red-600",
                  warning: "bg-amber-100  text-amber-700",
                  success: "bg-emerald-100 text-emerald-700",
                  info:    "bg-blue-100   text-blue-700",
                };
                return (
                  <Link href={item.href} key={i}>
                    <div className={`flex items-center gap-3 px-5 py-3.5 border-l-4 hover:brightness-95 transition-all cursor-pointer ${alertStyles[item.type]}`}>
                      <span className={`text-lg w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg[item.type]}`}>
                        {item.icon}
                      </span>
                      <p className="text-sm text-foreground flex-1">{item.text}</p>
                      <span className="text-xs text-muted-foreground shrink-0">View →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Smart CRM Lists ───────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Smart CRM Lists</h2>
            <span className="text-[10px] text-muted-foreground ml-1">— automatically computed from lead data</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {smartLists.map(list => (
              <Link href={list.href} key={list.label}>
                <div className={`rounded-xl border ${list.border} ${list.bg} p-3.5 hover:shadow-sm transition-all cursor-pointer group h-full`}>
                  <div className="text-2xl mb-2">{list.emoji}</div>
                  <p className="text-3xl font-bold text-foreground mb-0.5">{list.count}</p>
                  <p className={`text-xs font-semibold ${list.color} mb-1`}>{list.label}</p>
                  <p className="text-[10px] text-muted-foreground">{list.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Communication Signals ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Communication Signals</h2>
            <span className="text-[10px] text-muted-foreground ml-1">— contact recency across active leads</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
              <p className="text-3xl font-bold text-foreground">{commHealth.recentlyActive}</p>
              <p className="text-xs font-semibold text-emerald-700">💬 Recently Active</p>
              <p className="text-[10px] text-muted-foreground">Contacted within 7 days</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-1">
              <p className="text-3xl font-bold text-foreground">{commHealth.goingCold}</p>
              <p className="text-xs font-semibold text-yellow-700">⏳ Going Cold</p>
              <p className="text-[10px] text-muted-foreground">No contact in 7–14 days</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-3xl font-bold text-foreground">{commHealth.cold}</p>
              <p className="text-xs font-semibold text-red-700">🥶 Cold</p>
              <p className="text-[10px] text-muted-foreground">No contact in 14+ days</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1">
              <p className="text-3xl font-bold text-foreground">{commHealth.neverContacted}</p>
              <p className="text-xs font-semibold text-gray-600">🆕 Never Contacted</p>
              <p className="text-[10px] text-muted-foreground">No outreach recorded</p>
            </div>
          </div>
        </div>

        {/* ── DISC Behavioral Distribution ──────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base leading-none">🧠</span>
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Behavioral Profiles</h2>
            <span className="text-[10px] text-muted-foreground ml-1">— DISC distribution across active leads (rule-based, no AI)</span>
          </div>
          {discDist.total === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-sm text-muted-foreground">
              No behavioral profile data yet. Add leads to see DISC distribution.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["Driver","Expressive","Amiable","Analytical"] as DiscStyle[]).map(style => {
                const meta = DISC_META[style];
                const count = discDist.counts[style];
                const pct = discDist.total > 0 ? Math.round((count / discDist.total) * 100) : 0;
                return (
                  <button
                    key={style}
                    onClick={() => setFilterDisc(filterDisc === style ? "" : style)}
                    className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                      filterDisc === style
                        ? `${meta.bgColor} ${meta.borderColor} ring-2 ring-offset-1 ring-current ${meta.textColor}`
                        : `${meta.bgColor} ${meta.borderColor}`
                    }`}
                  >
                    <p className="text-3xl font-bold text-foreground mb-0.5">{count}</p>
                    <p className={`text-xs font-semibold ${meta.textColor} mb-1`}>{meta.emoji} {style}</p>
                    <div className="h-1 w-full bg-white/60 rounded-full overflow-hidden mb-1">
                      <div className={`h-1 rounded-full ${meta.barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{pct}% · {meta.shortDesc}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Workflow Queue ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Workflow Queue</h2>
            <span className="text-[10px] text-muted-foreground ml-1">— action-grouped lead pipeline</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflowQueue.map(group => (
              <div
                key={group.id}
                className={`rounded-xl border ${group.borderClass} ${group.bgClass} p-4`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl leading-none mt-0.5">{group.emoji}</span>
                    <div>
                      <p className={`text-sm font-semibold leading-tight ${group.colorClass}`}>
                        {group.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{group.description}</p>
                    </div>
                  </div>
                  <span className={`text-2xl font-bold leading-none shrink-0 ${group.colorClass}`}>
                    {group.count}
                  </span>
                </div>

                {group.topLeads.length > 0 ? (
                  <div className="space-y-1">
                    {group.topLeads.map(lead => (
                      <Link href={`/admin/crm/leads/${lead.id}`} key={lead.id}>
                        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/70 hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-white/80 hover:shadow-sm">
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-foreground truncate block">
                              {lead.name}
                            </span>
                            {lead.company && (
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {lead.company}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 ml-2" />
                        </div>
                      </Link>
                    ))}
                    {group.count > 4 && (
                      <Link href="/admin/crm/leads">
                        <div className="text-center pt-1.5">
                          <span className={`text-xs font-semibold ${group.colorClass} hover:underline cursor-pointer`}>
                            View all {group.count} →
                          </span>
                        </div>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <p className="text-xs text-muted-foreground">All clear ✓</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Activity table with Health Score ───────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Recent Activity</h2>
            <div className="flex items-center gap-2">
              <select
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white text-foreground"
              >
                <option value="">All Stages</option>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select
                value={filterDisc}
                onChange={e => setFilterDisc(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none bg-white text-foreground"
              >
                <option value="">All DISC Styles</option>
                {(["Driver","Expressive","Amiable","Analytical"] as DiscStyle[]).map(s => (
                  <option key={s} value={s}>{DISC_META[s].emoji} {s}</option>
                ))}
              </select>
              {(filterStage || filterDisc) && (
                <button
                  onClick={() => { setFilterStage(""); setFilterDisc(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  ✕ Clear
                </button>
              )}
              <button className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-foreground">
                <SlidersHorizontal className="w-3 h-3" /> Filter
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No leads yet — add your first lead or import from Discovery forms.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name","Health","DISC","Contact","Email","Phone","Last Activity","Time","Stage","Assigned"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(lead => {
                    const health = scoreMap.get(lead.id);
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50/70 transition-colors group">
                        {/* Name + avatar */}
                        <td className="px-4 py-3">
                          <Link href={`/admin/crm/leads/${lead.id}`}>
                            <div className="flex items-center gap-2.5 cursor-pointer">
                              <div className={`w-8 h-8 rounded-full ${avatarColor(lead.name)} flex items-center justify-center shrink-0`}>
                                <span className="text-white text-xs font-semibold">{initials(lead.name)}</span>
                              </div>
                              <span className="font-medium text-blue-600 hover:text-blue-800 transition-colors truncate max-w-[120px]">
                                {lead.name}
                              </span>
                            </div>
                          </Link>
                        </td>
                        {/* Health Score */}
                        <td className="px-4 py-3">
                          {health ? (
                            <Link href={`/admin/crm/leads/${lead.id}`}>
                              <div className="flex items-center gap-1.5 cursor-pointer group/h">
                                <span className={`text-sm font-bold ${health.color}`}>{health.score}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${health.bgColor} ${health.color} ${health.borderColor}`}>
                                  {health.badge}
                                </span>
                              </div>
                            </Link>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        {/* DISC Style Badge */}
                        <td className="px-4 py-3">
                          {(() => {
                            const style = discMap.get(lead.id);
                            if (!style) return <span className="text-gray-300">—</span>;
                            const meta = DISC_META[style];
                            return (
                              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>
                                {meta.emoji} {style}
                              </span>
                            );
                          })()}
                        </td>
                        {/* Contact signal */}
                        <td className="px-4 py-3">
                          {(() => {
                            if (!lead.lastContactedAt) return (
                              <span title="Never contacted" className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-1.5 py-0.5">
                                🆕 New
                              </span>
                            );
                            const days = Math.floor((Date.now() - new Date(lead.lastContactedAt).getTime()) / DAY);
                            if (days < 7) return (
                              <span title={`Contacted ${days}d ago`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                                💬 {days}d
                              </span>
                            );
                            if (days < 14) return (
                              <span title={`Contacted ${days}d ago`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-1.5 py-0.5">
                                ⏳ {days}d
                              </span>
                            );
                            return (
                              <span title={`Contacted ${days}d ago`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                                🥶 {days}d
                              </span>
                            );
                          })()}
                        </td>
                        {/* Email */}
                        <td className="px-4 py-3">
                          <a href={`mailto:${lead.email}`} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-[160px]">
                            {lead.email}
                          </a>
                        </td>
                        {/* Phone */}
                        <td className="px-4 py-3">
                          {lead.phone ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground mr-1">{lead.phone}</span>
                              <a href={`tel:${lead.phone}`} title="Call"
                                 className="w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                                <Phone className="w-3 h-3 text-white" />
                              </a>
                              <a href={`sms:${lead.phone}`} title="Text"
                                 className="w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                                <MessageSquare className="w-3 h-3 text-white" />
                              </a>
                            </div>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        {/* Last activity */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{lastActivityLabel(lead)}</span>
                        </td>
                        {/* Time */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">{timeAgo(lead.lastContactedAt || lead.updatedAt)}</span>
                        </td>
                        {/* Stage */}
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            lead.status === "Won"           ? "bg-green-100 text-green-700" :
                            lead.status === "Lost"          ? "bg-red-100 text-red-600" :
                            lead.status === "Proposal Sent" ? "bg-purple-100 text-purple-700" :
                            lead.status === "Negotiating"   ? "bg-orange-100 text-orange-700" :
                            lead.status === "New"           ? "bg-blue-100 text-blue-700" :
                            lead.status === "Contacted"     ? "bg-indigo-100 text-indigo-700" :
                            lead.status === "Follow-up"     ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{lead.status}</span>
                        </td>
                        {/* Assigned */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{lead.assignedTo || "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Daily Sales Brief ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <Zap className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Daily Sales Brief</h2>
            <span className="ml-auto text-[10px] text-muted-foreground">{dailyBrief.date}</span>
          </div>
          <div className="px-5 py-3 border-b border-gray-50">
            <p className={`text-sm font-medium ${
              dailyBrief.topPriorityCount > 5 ? "text-red-600" :
              dailyBrief.topPriorityCount > 0 ? "text-foreground" : "text-emerald-700"
            }`}>
              {dailyBrief.topPriorityCount > 0 && (
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2 align-middle" />
              )}
              {dailyBrief.summary}
            </p>
          </div>
          {dailyBrief.items.length === 0 ? (
            <div className="px-5 py-5 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-sm text-muted-foreground">All clear — no urgent actions today.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-px bg-gray-100">
              {dailyBrief.items.map(item => (
                <div key={item.label} className={`bg-white px-4 py-3 flex flex-col gap-0.5 ${
                  item.urgency === "high"   ? "border-t-2 border-red-400" :
                  item.urgency === "medium" ? "border-t-2 border-amber-400" :
                                             "border-t-2 border-gray-200"
                }`}>
                  <p className="text-xl leading-none">{item.emoji}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{item.count}</p>
                  <p className={`text-[11px] font-semibold leading-tight ${
                    item.urgency === "high" ? "text-red-600" :
                    item.urgency === "medium" ? "text-amber-700" : "text-muted-foreground"
                  }`}>{item.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{item.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Opportunity Radar ──────────────────────────────────────────────── */}
        {(() => {
          const total = opportunityRadar.hot.length + opportunityRadar.cooling.length +
            opportunityRadar.atRisk.length + opportunityRadar.nurture.length;
          if (total === 0) return null;

          const buckets: {
            key: "hot" | "cooling" | "atRisk" | "nurture";
            label: string; emoji: string;
            color: string; bg: string; border: string;
            leads: RadarEntry[];
          }[] = [
            {
              key: "hot", label: "Hot", emoji: "🔥",
              color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",
              leads: opportunityRadar.hot,
            },
            {
              key: "atRisk", label: "At Risk", emoji: "⚠️",
              color: "text-red-700", bg: "bg-red-50", border: "border-red-200",
              leads: opportunityRadar.atRisk,
            },
            {
              key: "cooling", label: "Cooling", emoji: "⏳",
              color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
              leads: opportunityRadar.cooling,
            },
            {
              key: "nurture", label: "Nurture", emoji: "🌱",
              color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
              leads: opportunityRadar.nurture,
            },
          ];

          return (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Opportunity Radar</h2>
                <span className="text-[10px] text-muted-foreground ml-1">— {total} active lead{total !== 1 ? "s" : ""} classified · rule-based</span>
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {buckets.map(bucket => (
                  <div key={bucket.key} className={`rounded-xl border ${bucket.border} ${bucket.bg} overflow-hidden`}>
                    <div className={`flex items-center justify-between px-3.5 py-2.5 border-b ${bucket.border}`}>
                      <p className={`text-xs font-bold ${bucket.color}`}>
                        {bucket.emoji} {bucket.label}
                      </p>
                      <span className={`text-sm font-bold ${bucket.color}`}>{bucket.leads.length}</span>
                    </div>
                    <div className="divide-y divide-white/50">
                      {bucket.leads.length === 0 ? (
                        <p className="px-3.5 py-4 text-[11px] text-muted-foreground text-center">No leads in this bucket</p>
                      ) : bucket.leads.slice(0, 4).map(entry => (
                        <Link href={`/admin/crm/leads/${entry.id}`} key={entry.id}>
                          <div className="px-3.5 py-2.5 hover:bg-white/70 transition-colors cursor-pointer">
                            <div className="flex items-start justify-between gap-1.5 mb-0.5">
                              <p className="text-xs font-semibold text-foreground leading-tight truncate">{entry.name}</p>
                              <span className="text-[10px] font-bold text-muted-foreground shrink-0">{entry.healthScore}</span>
                            </div>
                            {entry.company && (
                              <p className="text-[10px] text-muted-foreground truncate mb-1">{entry.company}</p>
                            )}
                            <p className={`text-[10px] leading-snug ${bucket.color}`}>{entry.recommendation}</p>
                          </div>
                        </Link>
                      ))}
                      {bucket.leads.length > 4 && (
                        <Link href="/admin/crm/leads">
                          <p className="px-3.5 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-center">
                            +{bucket.leads.length - 4} more →
                          </p>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Automation Queue ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Automation Queue</h2>
            <span className="text-[10px] text-muted-foreground ml-1">— pending actions by category · drafts only, nothing auto-sends</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            {automationTiles.map(tile => (
              <div key={tile.label} className={`rounded-xl border ${tile.border} ${tile.bg} p-3.5`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg leading-none">{tile.emoji}</span>
                  <span className={`text-xl font-bold leading-none ${tile.color}`}>{tile.count}</span>
                </div>
                <p className={`text-xs font-bold ${tile.color} mb-0.5`}>{tile.label}</p>
                <p className="text-[10px] text-muted-foreground leading-snug mb-2">{tile.desc}</p>
                <p className="text-[10px] text-muted-foreground leading-snug italic">{tile.action}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Open any lead → <strong>Automation</strong> tab in Sales Workspace for step-by-step actions, readiness gates, and recommended sequence.
          </p>
        </div>

        {/* ── Intelligence note ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>How scores work:</strong> Health scores are rule-based and transparent. Points are
            awarded for high priority, estimated value, recent activity, and upcoming follow-ups.
            Points are deducted for no contact, overdue tasks, and low activity. View any lead to see
            the full breakdown.
          </span>
        </div>
      </div>
    </CrmLayout>
  );
}
