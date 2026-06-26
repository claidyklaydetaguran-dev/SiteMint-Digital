import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Phone, MessageSquare, SlidersHorizontal } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Stats {
  total: number; newLeads: number; hotLeads: number;
  won: number; lost: number; followUpToday: number; overdue: number;
}

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; priority: string; assignedTo?: string;
  lastContactedAt?: string; updatedAt: string; createdAt: string;
  serviceInterest?: string;
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

export default function CrmDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState("");

  useEffect(() => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    Promise.all([
      fetch("/api/crm/stats", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([sd, ld]) => {
      setStats(sd.stats);
      setLeads((ld.leads || []).slice().sort(
        (a: Lead, b: Lead) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [navigate]);

  const statCards = stats ? [
    { label: "NEW LEADS", value: stats.newLeads, sub: `${stats.total} total`, color: "#6366f1", seed: 1 },
    { label: "HOT LEADS", value: stats.hotLeads, sub: "High priority", color: "#f97316", seed: 2 },
    { label: "FOLLOW-UPS TODAY", value: stats.followUpToday, sub: "Due today", color: "#0ea5e9", seed: 3 },
    { label: "OVERDUE", value: stats.overdue, sub: "Need attention", color: "#ef4444", seed: 4 },
    { label: "WON", value: stats.won, sub: "Closed deals", color: "#34d399", seed: 5 },
  ] : [];

  const STAGES = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
  const filtered = filterStage ? leads.filter(l => l.status === filterStage) : leads;

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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="h-3 w-32 bg-gray-200 rounded" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50">
              <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
              <div className="h-3 w-28 bg-gray-200 rounded flex-1" />
              <div className="h-3 w-36 bg-gray-100 rounded" />
              <div className="h-3 w-16 bg-gray-100 rounded" />
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto">

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          {statCards.map(({ label, value, sub, color, seed }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 pt-4 pb-0 overflow-hidden">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className="text-3xl font-bold text-foreground leading-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">{sub}</p>
              <div className="-mx-4">
                <Sparkline seed={seed + value} color={color} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity table */}
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
              <button className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-foreground">
                <SlidersHorizontal className="w-3 h-3" /> Filter Activity
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
                    {["Name","Email","Phone","Last Activity","Time","Stage","Assigned"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(lead => (
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
                      {/* Email */}
                      <td className="px-4 py-3">
                        <a href={`mailto:${lead.email}`} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-[160px]">
                          {lead.email}
                        </a>
                      </td>
                      {/* Phone — green circle buttons */}
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
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
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
                        <span className="text-xs text-foreground">{lead.status}</span>
                      </td>
                      {/* Assigned */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{lead.assignedTo || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
