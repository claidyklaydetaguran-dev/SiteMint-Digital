import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  computeLeadDna, computeIntentTrend,
  type BehavioralEvent, type LeadDna, type IntentStage,
  INTENT_STAGE_COLOR,
} from "@/lib/behavioralIntelligence";
import {
  BotMessageSquare, TrendingUp, TrendingDown, Flame, RefreshCw, ChevronRight,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface LeadLite {
  id: number;
  name: string;
  company?: string | null;
  status?: string | null;
}

interface LeadSignal {
  lead: LeadLite;
  dna: LeadDna;
  trend: { delta: number; direction: "rising" | "falling" | "stable" };
  recentEventCount7d: number;
}

const HOT_SPIKE_THRESHOLD = 3; // 3+ signal events in the last 7 days

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

function StageBadge({ stage }: { stage: IntentStage }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${INTENT_STAGE_COLOR[stage]}`}>
      {stage}
    </span>
  );
}

function SignalRow({ signal, onOpen }: { signal: LeadSignal; onOpen: (id: number) => void }) {
  const { lead, dna, trend } = signal;
  return (
    <button
      onClick={() => onOpen(lead.id)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors last:border-b-0"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">{lead.name}</span>
          {lead.company && <span className="text-xs text-muted-foreground truncate">{lead.company}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <StageBadge stage={dna.intentStage} />
          <span className="text-[11px] text-muted-foreground">
            Client Intent {dna.clientIntent} · last event {timeAgo(dna.lastEventAt)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-xs font-semibold flex items-center gap-1 ${
          trend.direction === "rising" ? "text-emerald-600" : trend.direction === "falling" ? "text-red-600" : "text-muted-foreground"
        }`}>
          {trend.direction === "rising" && <TrendingUp className="w-3.5 h-3.5" />}
          {trend.direction === "falling" && <TrendingDown className="w-3.5 h-3.5" />}
          {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function Panel({ title, icon: Icon, tone, signals, onOpen, emptyText }: {
  title: string; icon: React.ElementType; tone: string;
  signals: LeadSignal[]; onOpen: (id: number) => void; emptyText: string;
}) {
  return (
    <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <Icon className={`w-4 h-4 ${tone}`} />
        <span className="crm-insight-dot" />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{signals.length}</span>
      </div>
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground px-4 py-6 text-center">{emptyText}</p>
      ) : (
        <div>
          {signals.map(s => <SignalRow key={s.lead.id} signal={s} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

export default function CrmBehavioralIntelligence() {
  const [, setLoc] = useLocation();
  const [signals, setSignals] = useState<LeadSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/crm/behavioral-events?limit=2000", {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { events: BehavioralEvent[]; leads: LeadLite[] };

      const leadsById = new Map(data.leads.map(l => [l.id, l]));
      const byLead = new Map<number, BehavioralEvent[]>();
      for (const ev of data.events) {
        const bucket = byLead.get(ev.leadId) ?? [];
        bucket.push(ev);
        byLead.set(ev.leadId, bucket);
      }

      const cutoff7d = Date.now() - 7 * 86_400_000;
      const computed: LeadSignal[] = [];
      for (const [leadId, events] of byLead) {
        const lead = leadsById.get(leadId);
        if (!lead) continue;
        const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
        const dna = computeLeadDna(sorted);
        const trend = computeIntentTrend(sorted);
        const recentEventCount7d = sorted.filter(e => new Date(e.occurredAt).getTime() > cutoff7d).length;
        computed.push({ lead, dna, trend, recentEventCount7d });
      }
      computed.sort((a, b) => (new Date(b.dna.lastEventAt ?? 0).getTime()) - (new Date(a.dna.lastEventAt ?? 0).getTime()));
      setSignals(computed);
    } catch {
      setError("Failed to load behavioral intelligence.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rising = useMemo(() => (signals ?? []).filter(s => s.trend.direction === "rising"), [signals]);
  const goingCold = useMemo(() => (signals ?? []).filter(s =>
    s.trend.direction === "falling" || s.dna.intentStage === "Dormant" || s.dna.intentStage === "At Risk"
  ), [signals]);
  const hotSpikes = useMemo(() => (signals ?? [])
    .filter(s => s.recentEventCount7d >= HOT_SPIKE_THRESHOLD)
    .sort((a, b) => b.recentEventCount7d - a.recentEventCount7d), [signals]);

  const openLead = (id: number) => setLoc(`/admin/crm/leads/${id}?tab=behavior`);

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Behavioral Intelligence</h1>
          </div>
          <button
            onClick={load}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Org-wide behavioral signals across all leads. Click a row to open that lead's full Behavior timeline.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        {loading && !signals ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-muted-foreground">
            Loading behavioral signals…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Panel
              title="Rising Engagement"
              icon={TrendingUp}
              tone="text-emerald-600"
              signals={rising}
              onOpen={openLead}
              emptyText="No leads with rising intent right now."
            />
            <Panel
              title="Going Cold"
              icon={TrendingDown}
              tone="text-red-600"
              signals={goingCold}
              onOpen={openLead}
              emptyText="No leads going cold right now."
            />
            <Panel
              title="Hot Signal Spikes"
              icon={Flame}
              tone="text-orange-600"
              signals={hotSpikes}
              onOpen={openLead}
              emptyText="No leads with a burst of recent activity."
            />
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
