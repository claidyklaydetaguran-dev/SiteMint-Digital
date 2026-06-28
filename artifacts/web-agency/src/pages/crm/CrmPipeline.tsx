import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { scoreLeadFromFields } from "@/lib/leadScore";
import { LEAD_STATUSES, LEAD_STATUS_STYLES, type LeadStatus } from "@/lib/crmTaxonomy";

const token = () => localStorage.getItem("adminToken") || "";

const STAGES: readonly LeadStatus[] = LEAD_STATUSES;

const stageColors: Record<string,string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s, LEAD_STATUS_STYLES[s].topBorder]),
);

const stageHeaderColors: Record<string,string> = Object.fromEntries(
  LEAD_STATUSES.map(s => [s, LEAD_STATUS_STYLES[s].header]),
);

const priorityDot: Record<string,string> = { High:"bg-red-500",Medium:"bg-yellow-500",Low:"bg-gray-400" };

interface Lead {
  id:number; name:string; company?:string; email:string; priority:string;
  estimatedValue?:string; serviceInterest?:string; nextFollowUpAt?:string; assignedTo?:string;
}

export default function CrmPipeline() {
  const [, navigate] = useLocation();
  const [pipeline, setPipeline] = useState<Record<string,Lead[]>>({});
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<number|null>(null);

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const r = await fetch("/api/crm/pipeline", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const d = await r.json() as { pipeline: Record<string,Lead[]> };
    setPipeline(d.pipeline || {});
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const moveLead = async (leadId: number, newStatus: string) => {
    setMovingId(leadId);
    await fetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setMovingId(null);
    load();
  };

  const total = Object.values(pipeline).reduce((n, leads) => n + leads.length, 0);

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-serif font-bold text-foreground">Lead Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track where each lead/contact is in your follow-up journey.</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">{total} leads across {STAGES.length} stages</p>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGES.map(stage => {
              const leads = pipeline[stage] || [];
              return (
                <div key={stage} className={`w-56 bg-white rounded-xl border-2 border-t-4 border-gray-200 shadow-sm flex flex-col ${stageColors[stage]}`}>
                  <div className={`px-3 py-2 rounded-t-lg flex items-center justify-between ${stageHeaderColors[stage]}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">{stage}</span>
                    <span className="text-xs font-bold">{leads.length}</span>
                  </div>

                  <div className="flex-1 p-2 space-y-2 min-h-24 max-h-[65vh] overflow-y-auto">
                    {leads.length === 0 && (
                      <div className="py-6 text-center text-xs text-muted-foreground/50">No leads</div>
                    )}
                    {leads.map(lead => {
                      const h = scoreLeadFromFields({
                        priority: lead.priority,
                        estimatedValue: lead.estimatedValue,
                        nextFollowUpAt: lead.nextFollowUpAt,
                        status: stage,
                      });
                      return (
                      <div key={lead.id} className={`bg-white rounded-lg border border-gray-200 p-2.5 hover:shadow-sm transition-shadow ${movingId===lead.id?"opacity-50":""}`}>
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-semibold text-foreground leading-tight">{lead.name}</p>
                          <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${priorityDot[lead.priority]||"bg-gray-400"}`} />
                        </div>
                        {lead.company && <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.company}</p>}
                        {lead.estimatedValue && <p className="text-xs text-green-700 font-medium mt-1">${Number(lead.estimatedValue).toLocaleString()}</p>}
                        {lead.nextFollowUpAt && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Follow-up: {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                          </p>
                        )}

                        {/* Health score badge */}
                        <div className="flex items-center gap-1 mt-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.barColor}`} />
                          <span className={`text-[10px] font-bold ${h.color}`}>{h.score}</span>
                          <span className={`text-[9px] font-semibold px-1 py-0.5 rounded-full border ${h.bgColor} ${h.color} ${h.borderColor}`}>{h.badge}</span>
                        </div>

                        <div className="flex items-center gap-1 mt-2">
                          <Link href={`/admin/crm/leads/${lead.id}`}>
                            <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                              View <ChevronRight className="w-3 h-3" />
                            </button>
                          </Link>
                          <div className="ml-auto">
                            <select
                              className="text-xs py-0.5 pl-1 pr-5 border border-gray-200 rounded focus:outline-none bg-white text-muted-foreground"
                              value={stage}
                              onChange={e => moveLead(lead.id, e.target.value)}
                              disabled={movingId === lead.id}
                            >
                              {STAGES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
