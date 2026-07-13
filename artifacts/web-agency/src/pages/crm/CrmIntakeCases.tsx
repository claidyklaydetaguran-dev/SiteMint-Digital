import { useEffect, useState } from "react";
import { CrmLayout } from "./CrmLayout";
import { BotMessageSquare, RefreshCw } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface IntakeCaseRow {
  id: number;
  createdAt: string;
  callerPhone: string;
  firmName: string;
  incidentType: string | null;
  incidentDate: string | null;
  incidentDateNormalized: string | null;
  injurySeverity: string | null;
  faultDescription: string | null;
  priorAttorney: boolean | null;
  summary: string | null;
  tier: string | null;
  disqualifyReason: string | null;
  conversationStatus: string;
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, string> = {
  Hot:           "bg-red-100 text-red-700 border border-red-200",
  Warm:          "bg-orange-100 text-orange-700 border border-orange-200",
  Cold:          "bg-blue-100 text-blue-700 border border-blue-200",
  Disqualified:  "bg-gray-100 text-gray-500 border border-gray-200",
  "Needs Review":"bg-yellow-100 text-yellow-700 border border-yellow-200",
};

const TIER_DOTS: Record<string, string> = {
  Hot:           "bg-red-500",
  Warm:          "bg-orange-400",
  Cold:          "bg-blue-400",
  Disqualified:  "bg-gray-400",
  "Needs Review":"bg-yellow-400",
};

function TierBadge({ tier }: { tier: string | null }) {
  const label = tier ?? "Pending";
  const style = TIER_STYLES[label] ?? "bg-gray-100 text-gray-500 border border-gray-200";
  const dot   = TIER_DOTS[label]  ?? "bg-gray-400";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      {label}
    </span>
  );
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export default function CrmIntakeCases() {
  const [cases, setCases] = useState<IntakeCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/intake/cases", {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json() as { cases: IntakeCaseRow[] };
      setCases(data.cases);
    } catch (e) {
      setError("Failed to load intake cases.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <BotMessageSquare className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">AI Intake Cases</h1>
              <p className="text-sm text-muted-foreground">Cases collected via the SMS AI intake agent</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-gray-200 rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Summary chips */}
        {!loading && !error && cases.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {(["Hot","Warm","Needs Review","Disqualified"] as const).map(tier => {
              const count = cases.filter(c => c.tier === tier).length;
              if (count === 0) return null;
              return (
                <span key={tier} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${TIER_STYLES[tier]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOTS[tier]}`} />
                  {count} {tier}
                </span>
              );
            })}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {cases.length} total
            </span>
          </div>
        )}

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && cases.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mb-4">
              <BotMessageSquare className="w-7 h-7 text-violet-400" />
            </div>
            <p className="text-foreground font-semibold mb-1">No intake cases yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Cases will appear here once callers complete the AI SMS intake conversation.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && cases.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Tier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Caller</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Incident Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Summary</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cases.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5 align-top">
                        <TierBadge tier={c.tier} />
                        {c.disqualifyReason && (
                          <p className="text-[11px] text-muted-foreground mt-1 leading-tight max-w-[120px]">
                            {c.disqualifyReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-foreground">{c.callerPhone}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.firmName}</p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-foreground">{c.incidentType ?? <span className="text-muted-foreground italic">Unknown</span>}</p>
                        {c.incidentDate && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.incidentDateNormalized
                              ? new Date(c.incidentDateNormalized).toLocaleDateString()
                              : c.incidentDate}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top max-w-sm">
                        {c.summary
                          ? <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">{c.summary}</p>
                          : <p className="text-muted-foreground italic text-xs">Conversation in progress</p>
                        }
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
