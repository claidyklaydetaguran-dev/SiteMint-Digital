import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Plus, DollarSign } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; priority: string; estimatedValue?: string; serviceInterest?: string;
  assignedTo?: string; updatedAt: string;
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-red-400","bg-orange-400","bg-teal-500","bg-cyan-500","bg-emerald-500",
];
function initials(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

const PIPELINES = {
  active: {
    label: "Active Pipeline",
    columns: [
      { key: "discovery",  label: "Discovery",   statuses: ["New", "Contacted"],       color: "border-t-blue-500",   header: "bg-blue-50 text-blue-700" },
      { key: "proposal",   label: "Proposal",    statuses: ["Follow-up","Proposal Sent"], color: "border-t-purple-500", header: "bg-purple-50 text-purple-700" },
      { key: "active",     label: "Active",      statuses: ["Negotiating"],            color: "border-t-orange-500", header: "bg-orange-50 text-orange-700" },
      { key: "nurture",    label: "Nurture",     statuses: ["Nurture"],                color: "border-t-gray-400",   header: "bg-gray-100 text-gray-600" },
    ],
  },
  closed: {
    label: "Closed",
    columns: [
      { key: "won",  label: "Won / Closed", statuses: ["Won"],  color: "border-t-green-500", header: "bg-green-50 text-green-700" },
      { key: "lost", label: "Lost",         statuses: ["Lost"], color: "border-t-red-500",   header: "bg-red-50 text-red-700" },
    ],
  },
};

export default function CrmDeals() {
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "closed">("active");

  useEffect(() => {
    if (!token()) { navigate("/admin"); return; }
    fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const pipeline = PIPELINES[tab];
  const totalValue = (statuses: string[]) => {
    const deals = leads.filter(l => statuses.includes(l.status));
    const sum = deals.reduce((acc, l) => {
      const v = parseFloat((l.estimatedValue || "0").replace(/[^0-9.]/g, ""));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    return { count: deals.length, sum };
  };

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-5 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Deals</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{leads.length} total leads in pipeline</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/crm/leads">
              <button className="flex items-center gap-1.5 text-sm border border-gray-300 bg-white rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-foreground">
                <Plus className="w-3.5 h-3.5" /> Add Deal
              </button>
            </Link>
          </div>
        </div>

        {/* Pipeline tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
          {(["active", "closed"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative capitalize ${
                tab === t
                  ? "text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "active" ? "Active Pipeline" : "Closed Deals"}
            </button>
          ))}
        </div>

        {/* Kanban columns */}
        <div className={`grid gap-4 ${pipeline.columns.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
          {pipeline.columns.map(col => {
            const colLeads = leads.filter(l => col.statuses.includes(l.status));
            const { count, sum } = totalValue(col.statuses);
            return (
              <div key={col.key} className="flex flex-col">
                {/* Column header */}
                <div className={`rounded-t-xl p-3 border-t-4 ${col.color} bg-white border border-gray-200 border-b-0`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">{col.label}</h3>
                    <Link href="/admin/crm/leads">
                      <button className="w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors">
                        <Plus className="w-3 h-3 text-gray-600" />
                      </button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">{count} deal{count !== 1 ? "s" : ""}</span>
                    {sum > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · <DollarSign className="w-3 h-3 inline-block" />{sum.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 bg-gray-50 border border-gray-200 border-t-0 rounded-b-xl p-2 space-y-2 min-h-[200px]">
                  {colLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-xs text-gray-400">No deals</p>
                      <Link href="/admin/crm/leads">
                        <button className="text-xs text-blue-500 hover:text-blue-700 mt-1">add deal</button>
                      </Link>
                    </div>
                  ) : colLeads.map(lead => (
                    <Link key={lead.id} href={`/admin/crm/leads/${lead.id}`}>
                      <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-start gap-2">
                          <div className={`w-6 h-6 rounded-full ${avatarColor(lead.name)} flex items-center justify-center shrink-0 mt-0.5`}>
                            <span className="text-white text-[9px] font-bold">{initials(lead.name)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs text-foreground truncate">{lead.name}</p>
                            {lead.company && <p className="text-[10px] text-muted-foreground truncate">{lead.company}</p>}
                          </div>
                        </div>

                        {lead.serviceInterest && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 truncate">
                            🎯 {lead.serviceInterest}
                          </p>
                        )}

                        {lead.estimatedValue && lead.estimatedValue !== "0" && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <DollarSign className="w-3 h-3 text-green-600" />
                            <span className="text-xs font-semibold text-green-700">{lead.estimatedValue}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            lead.priority === "High" ? "bg-red-100 text-red-700" :
                            lead.priority === "Medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>{lead.priority}</span>
                          {lead.assignedTo && (
                            <div className={`w-5 h-5 rounded-full ${avatarColor(lead.assignedTo)} flex items-center justify-center`} title={lead.assignedTo}>
                              <span className="text-white text-[8px] font-bold">{initials(lead.assignedTo)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </CrmLayout>
  );
}
