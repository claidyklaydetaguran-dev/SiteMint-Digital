import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, FileText, Star, LogOut, ExternalLink,
  Search, RefreshCw, ChevronRight, LayoutDashboard, ArrowRight,
  Zap, Trophy,
} from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";

interface Submission {
  id: number;
  createdAt: string;
  contactName: string;
  companyName: string;
  email: string;
  industry: string | null;
  serviceInterest: string | null;
  budget: string | null;
  timeline: string | null;
  leadScore: number;
  tags: string[];
  status: string;
  recommendedPackage: string | null;
  hasProposal: boolean;
}

const BUDGET_LABELS: Record<string, string> = {
  "under1k": "< $1K", "1k-2.5k": "$1K–$2.5K", "2.5k-5k": "$2.5K–$5K",
  "5k-10k": "$5K–$10K", "10k-plus": "$10K+",
};
const TIMELINE_LABELS: Record<string, string> = {
  "asap": "ASAP", "30-days": "30 Days", "60-days": "60 Days",
  "90-days": "90 Days", "flexible": "Flexible",
};
const SERVICE_LABELS: Record<string, string> = {
  "new-website": "New Website", "redesign": "Redesign", "web-app": "Web App",
  "crm": "CRM", "seo": "SEO", "blog": "Blog", "maintenance": "Maintenance",
  "automation": "AI Automation", "consultation": "Consultation",
};

const STATUSES = ["All", "New", "Reviewed", "Proposal Generated", "Follow-Up Needed", "Closed Won", "Closed Lost"];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-green-100 text-green-700 border-green-200"
    : score >= 5 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-red-100 text-red-700 border-red-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{score}/10</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "New": "bg-blue-100 text-blue-700 border-blue-200",
    "Reviewed": "bg-purple-100 text-purple-700 border-purple-200",
    "Proposal Generated": "bg-indigo-100 text-indigo-700 border-indigo-200",
    "Follow-Up Needed": "bg-orange-100 text-orange-700 border-orange-200",
    "Closed Won": "bg-green-100 text-green-700 border-green-200",
    "Closed Lost": "bg-gray-100 text-gray-700 border-gray-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>{status}</span>;
}

interface CrmStats {
  total: number;
  newLeads: number;
  hotLeads: number;
  won: number;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [error, setError] = useState("");
  const [crmStats, setCrmStats] = useState<CrmStats | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : "";

  const load = useCallback(async () => {
    if (!token) { navigate("/admin"); return; }
    setLoading(true);
    try {
      const [res, statsRes] = await Promise.all([
        fetch("/api/admin/submissions", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/crm/stats", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (res.status === 401) { localStorage.removeItem("adminToken"); navigate("/admin"); return; }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json() as { submissions: Submission[] };
      setSubmissions(data.submissions);
      if (statsRes.ok) {
        const sd = await statsRes.json() as { stats: CrmStats };
        setCrmStats(sd.stats);
      }
    } catch {
      setError("Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => { load(); }, [load]);

  const logout = () => { localStorage.removeItem("adminToken"); navigate("/admin"); };

  const filtered = submissions.filter(s => {
    const matchSearch = !search ||
      s.contactName.toLowerCase().includes(search.toLowerCase()) ||
      s.companyName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const hotLeads = submissions.filter(s => s.leadScore >= 8).length;
  const proposals = submissions.filter(s => s.hasProposal).length;
  const thisWeek = submissions.filter(s => {
    const d = new Date(s.createdAt);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-foreground text-background px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <SiteMintLogo variant="light" iconSize={30} />
          <span className="text-background/50 text-xs ml-1 hidden sm:inline border-l border-background/20 pl-3">Discovery Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/crm/dashboard">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 pl-3 pr-2.5 shadow-sm">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="font-semibold">Open CRM</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={load} className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Leads", value: submissions.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Hot Leads", value: hotLeads, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
            { label: "Proposals Generated", value: proposals, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "New This Week", value: thisWeek, icon: Star, color: "text-orange-600", bg: "bg-orange-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* CRM Module Card */}
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 shadow-lg overflow-hidden">
          <div className="px-6 py-5 sm:px-8 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-base font-bold text-white">Sitemint CRM</h2>
                    <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wide">Active</span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
                    Manage leads, deals, activities, pipeline, messages, tasks, and sales performance.
                  </p>
                </div>
              </div>
              <Link href="/admin/crm/dashboard" className="shrink-0">
                <Button className="bg-emerald-500 hover:bg-emerald-400 text-white border-0 gap-2 shadow-md px-5 h-10 font-semibold whitespace-nowrap">
                  Open Sitemint CRM
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            {crmStats && (
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Active Leads", value: crmStats.total, icon: Users, color: "text-blue-400" },
                  { label: "New This Week", value: crmStats.newLeads, icon: Zap, color: "text-yellow-400" },
                  { label: "Hot Leads", value: crmStats.hotLeads, icon: TrendingUp, color: "text-orange-400" },
                  { label: "Won", value: crmStats.won, icon: Trophy, color: "text-emerald-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    <div>
                      <p className="text-lg font-bold text-white leading-none">{value}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <h2 className="font-serif font-bold text-lg text-foreground">Discovery Submissions</h2>
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search leads..."
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading submissions...</div>
          ) : error ? (
            <div className="py-16 text-center text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {submissions.length === 0 ? "No submissions yet. Share your discovery form!" : "No results match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Client", "Company", "Industry", "Service", "Budget", "Score", "Status", "Date", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{s.contactName}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.companyName}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{s.industry || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {s.serviceInterest ? SERVICE_LABELS[s.serviceInterest] || s.serviceInterest : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {s.budget ? BUDGET_LABELS[s.budget] || s.budget : "—"}
                      </td>
                      <td className="px-4 py-3"><ScoreBadge score={s.leadScore} /></td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/submissions/${s.id}`}>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs h-7">
                            View <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SiteMint Admin Portal — Internal use only &nbsp;|&nbsp;
          <a href="/discovery" target="_blank" className="text-primary hover:underline inline-flex items-center gap-1">
            Discovery Form <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </main>
    </div>
  );
}
