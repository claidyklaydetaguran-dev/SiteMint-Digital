import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, TrendingUp, FileText, Star, LogOut, ExternalLink,
  Search, RefreshCw, ChevronRight, LayoutDashboard, ArrowRight,
  Zap, Trophy, CheckCircle2, Loader2, AlertTriangle, RotateCw,
} from "lucide-react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import { adminFetch, adminLogout } from "@/lib/adminFetch";
import { type Load, readAdminResource, responseFailureReason, failureReason } from "@/lib/adminLoad";
import { AdminRouteGuard } from "@/components/crm/AdminRouteGuard";

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

/** Which submissions already have a CRM contact, by submission id and by email. */
interface CrmLinks {
  bySubmission: Record<number, number>;
  byEmail: Record<string, number>;
}

interface Toast {
  message: string;
  tone: "success" | "error";
}

function pickSubmissions(body: unknown): Submission[] | undefined {
  const list = body && typeof body === "object" ? (body as { submissions?: unknown }).submissions : undefined;
  return Array.isArray(list) ? list as Submission[] : undefined;
}

function pickStats(body: unknown): CrmStats | undefined {
  const stats = body && typeof body === "object" ? (body as { stats?: unknown }).stats : undefined;
  return stats && typeof stats === "object" ? stats as CrmStats : undefined;
}

function pickLinks(body: unknown): CrmLinks | undefined {
  const leads = body && typeof body === "object" ? (body as { leads?: unknown }).leads : undefined;
  if (!Array.isArray(leads)) return undefined;
  const bySubmission: Record<number, number> = {};
  const byEmail: Record<string, number> = {};
  for (const lead of leads as { id: number; email?: string | null; discoverySubmissionId?: number | null }[]) {
    if (lead.discoverySubmissionId) bySubmission[lead.discoverySubmissionId] = lead.id;
    if (typeof lead.email === "string" && lead.email) byEmail[lead.email.toLowerCase()] = lead.id;
  }
  return { bySubmission, byEmail };
}

/** A figure, or a dash that says why there is no figure. Never a zero standing in for "unknown". */
function Figure({ value, loading, className }: { value: number | null | undefined; loading: boolean; className: string }) {
  if (typeof value === "number") return <p className={className}>{value}</p>;
  return (
    <p className={className}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{loading ? "Loading" : "Not available"}</span>
    </p>
  );
}

function AdminDashboardInner() {
  const [, navigate] = useLocation();
  const [submissions, setSubmissions] = useState<Load<Submission[]>>({ status: "loading" });
  const [crmStats, setCrmStats] = useState<Load<CrmStats>>({ status: "loading" });
  const [crmLinks, setCrmLinks] = useState<Load<CrmLinks>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  /** Submissions sent to the CRM from this page, known even if the CRM lookup failed. */
  const [sentNow, setSentNow] = useState<Record<number, number>>({});
  const [importingId, setImportingId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string, tone: Toast["tone"]) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "error" ? 8000 : 4000);
  };

  // Every part keeps what it last showed until its new answer arrives, so a
  // retry never flashes the page back to empty — and a part that failed stays
  // a stated failure, not a zero.
  const load = useCallback(async () => {
    setReloading(true);
    const [nextSubmissions, nextStats, nextLinks] = await Promise.all([
      readAdminResource("/api/admin/submissions", pickSubmissions),
      readAdminResource("/api/crm/stats", pickStats),
      readAdminResource("/api/crm/leads", pickLinks),
    ]);
    if (!alive.current) return;
    setSubmissions(nextSubmissions);
    setCrmStats(nextStats);
    setCrmLinks(nextLinks);
    setReloading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendToCrm = async (submissionId: number) => {
    setImportingId(submissionId);
    try {
      const res = await adminFetch(`/api/crm/import-discovery/${submissionId}`, {
        method: "POST",
      });
      if (!res.ok) {
        showToast(`Not sent to the CRM. ${await responseFailureReason(res)}`, "error");
        return;
      }
      const data = await res.json().catch(() => null) as { existing?: boolean; leadId?: unknown; message?: unknown } | null;
      if (typeof data?.leadId === "number") {
        const leadId = data.leadId;
        setSentNow(prev => ({ ...prev, [submissionId]: leadId }));
      }
      showToast(
        data?.existing ? "Already in the CRM." : typeof data?.message === "string" ? data.message : "Sent to the CRM.",
        "success",
      );
    } catch {
      showToast(`Not sent to the CRM. ${failureReason(null)}`, "error");
    } finally {
      setImportingId(null);
    }
  };

  const logout = async () => { await adminLogout(); navigate("/admin"); };

  const list = submissions.status === "ready" ? submissions.data : null;
  const loadingSubmissions = submissions.status === "loading";

  const filtered = (list ?? []).filter(s => {
    const matchSearch = !search ||
      s.contactName.toLowerCase().includes(search.toLowerCase()) ||
      s.companyName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Counts exist only when the list they count actually loaded.
  const hotLeads = list ? list.filter(s => s.leadScore >= 8).length : null;
  const proposals = list ? list.filter(s => s.hasProposal).length : null;
  const thisWeek = list ? list.filter(s => {
    const diff = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  }).length : null;

  const failures: { what: string; reason: string }[] = [];
  if (submissions.status === "error") failures.push({ what: "Discovery submissions", reason: submissions.reason });
  if (crmStats.status === "error") failures.push({ what: "CRM status", reason: crmStats.reason });
  if (crmLinks.status === "error") failures.push({ what: "Which submissions are already in the CRM", reason: crmLinks.reason });

  return (
    <>
      {/* Always mounted, so a message is announced when it appears. */}
      <div aria-live="polite" role="status">
        {toast && (
          <div
            className={`fixed bottom-6 left-6 right-6 sm:left-auto z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 ${
              toast.tone === "error" ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background"
            }`}
          >
            {toast.tone === "error"
              ? <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />}
            <span className="min-w-0">{toast.message}</span>
          </div>
        )}
      </div>
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-foreground text-background px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <SiteMintLogo variant="ops" iconSize={30} />
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
          <Button
            variant="ghost" size="sm" onClick={() => { void load(); }} disabled={reloading}
            className="text-background/70 hover:text-background hover:bg-white/10 gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {failures.length > 0 && (
          <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">
                  {failures.length === 1 ? `${failures[0].what} could not be loaded.` : "Parts of this page could not be loaded."}
                </p>
                {failures.length === 1 ? (
                  <p className="mt-1 break-words text-sm text-muted-foreground">{failures[0].reason}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {failures.map(f => (
                      <li key={f.what} className="break-words">
                        <span className="font-medium text-foreground">{f.what}:</span> {f.reason}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => { void load(); }} disabled={reloading}>
                  {reloading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    : <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />}
                  {reloading ? "Trying again…" : "Try again"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" aria-busy={loadingSubmissions}>
          {[
            { label: "Total Leads", value: list ? list.length : null, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Hot Leads", value: hotLeads, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
            { label: "Proposals Generated", value: proposals, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "New This Week", value: thisWeek, icon: Star, color: "text-orange-600", bg: "bg-orange-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <Figure value={value} loading={loadingSubmissions} className="text-2xl font-bold text-foreground" />
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

            <div className="mt-4 pt-4 border-t border-white/10">
              {crmStats.status === "ready" ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Active Leads", value: crmStats.data.total, icon: Users, color: "text-blue-400" },
                    { label: "New This Week", value: crmStats.data.newLeads, icon: Zap, color: "text-yellow-400" },
                    { label: "Hot Leads", value: crmStats.data.hotLeads, icon: TrendingUp, color: "text-orange-400" },
                    { label: "Won", value: crmStats.data.won, icon: Trophy, color: "text-emerald-400" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                      <div>
                        <Figure value={value} loading={false} className="text-lg font-bold text-white leading-none" />
                        <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : crmStats.status === "loading" ? (
                <p className="flex items-center gap-2 text-sm text-gray-400" role="status">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading CRM status…
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">CRM status unavailable — {crmStats.reason}</span>
                </p>
              )}
            </div>
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
                  aria-label="Search submissions"
                  className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {submissions.status === "loading" ? (
            <div className="px-6 py-6 space-y-3" role="status" aria-live="polite">
              <p className="text-sm text-muted-foreground">Loading submissions…</p>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : submissions.status === "error" ? (
            <div className="py-16 px-6 text-center">
              <p className="font-medium text-foreground">Submissions could not be loaded, so none are listed here.</p>
              <p className="mt-1 text-sm text-muted-foreground">Use Try again at the top of the page.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {submissions.data.length === 0 ? "No submissions yet. Share your discovery form!" : "No results match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Client", "Company", "Industry", "Service", "Budget", "Score", "Status", "Date", "CRM", ""].map(h => (
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => {
                          const leadId = sentNow[s.id] ?? (crmLinks.status === "ready"
                            ? crmLinks.data.bySubmission[s.id] ?? crmLinks.data.byEmail[s.email.toLowerCase()]
                            : undefined);
                          if (leadId) {
                            return (
                              <Link href={`/admin/crm/leads/${leadId}`}>
                                <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 font-semibold">
                                  <CheckCircle2 className="w-3 h-3" /> In CRM
                                </Button>
                              </Link>
                            );
                          }
                          if (importingId === s.id) {
                            return (
                              <Button size="sm" variant="ghost" disabled className="gap-1 text-xs h-7">
                                <Loader2 className="w-3 h-3 animate-spin" /> Sending…
                              </Button>
                            );
                          }
                          // Without the CRM lookup there is no telling whether this
                          // submission is already a contact, so the page does not
                          // offer to create one as if it knew.
                          if (crmLinks.status === "loading") {
                            return <span className="text-xs text-muted-foreground">Checking…</span>;
                          }
                          if (crmLinks.status === "error") {
                            return <span className="text-xs text-muted-foreground">CRM status unavailable</span>;
                          }
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => { void sendToCrm(s.id); }}
                            >
                              Send to CRM
                            </Button>
                          );
                        })()}
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
    </>
  );
}

export default function AdminDashboard() {
  return (
    <AdminRouteGuard>
      <AdminDashboardInner />
    </AdminRouteGuard>
  );
}
