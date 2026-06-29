import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Users, Search, ArrowRight, Flame, Clock, AlertTriangle,
  RefreshCw, UserCheck, Star,
} from "lucide-react";

const tok = () => localStorage.getItem("adminToken") || "";
const LAST_LEAD_KEY = "lastCrmLeadId";

interface Lead {
  id: number;
  name: string;
  email: string;
  company?: string;
  status?: string;
  priority?: string;
  source?: string;
  serviceInterest?: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  createdAt?: string;
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-orange-400","bg-teal-500","bg-cyan-500","bg-emerald-500","bg-red-400","bg-yellow-500",
];
function av(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}
function ini(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function priorityColor(p?: string) {
  if (p === "High")   return "bg-red-100 text-red-700 border-red-200";
  if (p === "Medium") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors text-left group"
    >
      <div className={`w-9 h-9 rounded-full ${av(lead.name)} flex items-center justify-center shrink-0`}>
        <span className="text-white text-xs font-bold">{ini(lead.name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
          {lead.priority === "High" && <Flame className="w-3 h-3 text-red-500 shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {lead.company ? `${lead.company} · ` : ""}{lead.email}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {lead.priority && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityColor(lead.priority)}`}>
            {lead.priority}
          </span>
        )}
        {lead.lastContactedAt && (
          <span className="text-[10px] text-muted-foreground">{timeAgo(lead.lastContactedAt)}</span>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

export default function CrmWorkspaceLanding() {
  const [, navigate] = useLocation();
  const [leads, setLeads]     = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [lastLead, setLastLead] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crm/leads?limit=50&sort=createdAt:desc", {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (r.ok) {
        const data = await r.json() as { leads: Lead[] };
        setLeads(data.leads ?? []);

        const lastId = localStorage.getItem(LAST_LEAD_KEY);
        if (lastId) {
          const found = (data.leads ?? []).find(l => l.id === Number(lastId));
          if (found) setLastLead(found);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openLead = (lead: Lead) => {
    localStorage.setItem(LAST_LEAD_KEY, String(lead.id));
    navigate(`/admin/crm/leads/${lead.id}`);
  };

  const q = search.toLowerCase();
  const filtered = leads.filter(l =>
    !q ||
    l.name.toLowerCase().includes(q) ||
    l.email.toLowerCase().includes(q) ||
    (l.company || "").toLowerCase().includes(q)
  );

  const hotLeads = leads
    .filter(l => l.priority === "High")
    .slice(0, 5);

  const overdueLeads = leads
    .filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date())
    .slice(0, 5);

  const recentLeads = filtered.slice(0, 20);

  return (
    <CrmLayout>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <UserCheck className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-bold font-serif text-foreground">Sales Workspace</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Pick up where you left off or jump to any contact.
          </p>
        </div>

        <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">

          {/* Continue where you left off */}
          {lastLead && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full ${av(lastLead.name)} flex items-center justify-center shrink-0`}>
                <span className="text-white text-sm font-bold">{ini(lastLead.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-600 mb-0.5">Continue where you left off</p>
                <p className="text-sm font-semibold text-foreground">{lastLead.name}</p>
                <p className="text-xs text-muted-foreground">{lastLead.company || lastLead.email}</p>
              </div>
              <button
                onClick={() => openLead(lastLead)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
              >
                Open <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Hot leads */}
          {hotLeads.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold text-foreground">Hot Leads</h2>
                <span className="ml-auto text-xs text-muted-foreground">{hotLeads.length} high priority</span>
              </div>
              <div className="divide-y divide-gray-50">
                {hotLeads.map(l => (
                  <LeadRow key={l.id} lead={l} onClick={() => openLead(l)} />
                ))}
              </div>
            </div>
          )}

          {/* Overdue follow-ups */}
          {overdueLeads.length > 0 && (
            <div className="bg-white border border-amber-100 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Overdue Follow-ups</h2>
                <span className="ml-auto text-xs text-muted-foreground">{overdueLeads.length} overdue</span>
              </div>
              <div className="divide-y divide-gray-50">
                {overdueLeads.map(l => (
                  <LeadRow key={l.id} lead={l} onClick={() => openLead(l)} />
                ))}
              </div>
            </div>
          )}

          {/* Search + recent contacts */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 text-sm focus:outline-none placeholder-gray-400 bg-transparent"
                placeholder="Search contacts by name, company, or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              )}
              <button
                onClick={load}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
              </div>
            ) : recentLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Users className="w-8 h-8 opacity-30" />
                <p className="text-sm">{search ? "No contacts match your search." : "No contacts yet."}</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {search ? `${recentLeads.length} result${recentLeads.length !== 1 ? "s" : ""}` : "Recent Contacts"}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {recentLeads.map(l => (
                    <LeadRow key={l.id} lead={l} onClick={() => openLead(l)} />
                  ))}
                </div>
                {!search && leads.length > 20 && (
                  <div className="px-4 py-3 border-t border-gray-100 text-center">
                    <button
                      onClick={() => navigate("/admin/crm/leads")}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View all {leads.length} contacts →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Overdue follow-up empty hint */}
          {!loading && leads.length > 0 && overdueLeads.length === 0 && hotLeads.length === 0 && !search && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <Clock className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-800">All caught up — no overdue follow-ups or high-priority alerts.</p>
            </div>
          )}

        </div>
      </div>
    </CrmLayout>
  );
}
