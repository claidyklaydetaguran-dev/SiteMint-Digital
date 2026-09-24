import { useCallback, useEffect, useState, useMemo } from "react";
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

import { type Load, readAdminResource } from "@/lib/adminLoad";
import { Figure, LoadFailure, dataOf } from "@/components/crm/LoadState";

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

/** The two lists the route answers with, together. */
interface BehavioralPayload {
  events: BehavioralEvent[];
  leads: LeadLite[];
}

const HOT_SPIKE_THRESHOLD = 3; // 3+ signal events in the last 7 days

/**
 * A body that is not the shape this page expects is a failure too.
 *
 * The route always sends both lists. A body missing either one is not "no
 * signals" — it is an answer we did not understand, and the panels must not
 * count it as zero.
 */
function pickBehavioral(body: unknown): BehavioralPayload | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { events, leads } = body as { events?: unknown; leads?: unknown };
  if (!Array.isArray(events) || !Array.isArray(leads)) return undefined;
  return { events: events as BehavioralEvent[], leads: leads as LeadLite[] };
}

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
      className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 hover:bg-accent text-left transition-colors last:border-b-0"
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

/**
 * One panel of leads.
 *
 * `signals` is null when the read behind it never arrived. That is the whole
 * point of the prop: `(signals ?? []).length` was 0 on a failed request, so all
 * three headers read 0 and all three bodies said there were no leads to act on
 * — beside the page's own error message.
 */
function Panel({ title, icon: Icon, tone, signals, onOpen, emptyText, loading }: {
  title: string; icon: React.ElementType; tone: string;
  signals: LeadSignal[] | null; onOpen: (id: number) => void; emptyText: string;
  loading: boolean;
}) {
  return (
    <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted">
        <Icon className={`w-4 h-4 ${tone}`} />
        <span className="crm-insight-dot" />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          <Figure value={signals === null ? null : signals.length} loading={loading} />
        </span>
      </div>
      {signals === null ? (
        /* Deliberately not the empty state: "none right now" is a fact about
           the leads, this is a fact about the request. */
        <div className="px-4 py-6 min-w-0">
          <p className="text-sm font-medium text-foreground break-words">
            {title} could not be loaded, so no leads are listed here.
          </p>
          <p className="mt-1 text-sm text-muted-foreground break-words">
            The reason is stated above. Use Try again there.
          </p>
        </div>
      ) : signals.length === 0 ? (
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
  const [signalsLoad, setSignalsLoad] = useState<Load<BehavioralPayload>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);

  // The panels keep whatever they last showed until a new answer lands, so a
  // failed Refresh never blanks a screen that was already right.
  const refresh = useCallback(async () => {
    setReloading(true);
    setSignalsLoad(await readAdminResource("/api/crm/behavioral-events?limit=2000", pickBehavioral));
    setReloading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // The signals, or null. Never an empty list standing in for a request that
  // nobody managed to complete.
  const signals = useMemo<LeadSignal[] | null>(() => {
    const data = dataOf(signalsLoad);
    if (!data) return null;

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
    return computed;
  }, [signalsLoad]);

  const rising = useMemo(
    () => signals && signals.filter(s => s.trend.direction === "rising"),
    [signals],
  );
  const goingCold = useMemo(
    () => signals && signals.filter(s =>
      s.trend.direction === "falling" || s.dna.intentStage === "Dormant" || s.dna.intentStage === "At Risk"
    ),
    [signals],
  );
  const hotSpikes = useMemo(
    () => signals && signals
      .filter(s => s.recentEventCount7d >= HOT_SPIKE_THRESHOLD)
      .sort((a, b) => b.recentEventCount7d - a.recentEventCount7d),
    [signals],
  );

  const openLead = (id: number) => setLoc(`/admin/crm/leads/${id}?tab=behavior`);
  const busy = reloading || signalsLoad.status === "loading";

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Behavioral Intelligence</h1>
          </div>
          <button
            onClick={() => { void refresh(); }}
            disabled={busy}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Org-wide behavioral signals across all leads. Click a row to open that lead's full Behavior timeline.
        </p>

        {/* The words come from the response — a 401, a 403 naming the missing
            grant, a 404, a 5xx and an unreachable server each read differently. */}
        {signalsLoad.status === "error" && (
          <LoadFailure
            what="Behavioral signals"
            reason={signalsLoad.reason}
            onRetry={() => { void refresh(); }}
            retrying={reloading}
          >
            <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
              No lead count is shown below while this is unavailable — leads may well be heating up.
            </p>
          </LoadFailure>
        )}

        {signalsLoad.status === "loading" ? (
          <div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
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
              loading={busy}
            />
            <Panel
              title="Going Cold"
              icon={TrendingDown}
              tone="text-red-600"
              signals={goingCold}
              onOpen={openLead}
              emptyText="No leads going cold right now."
              loading={busy}
            />
            <Panel
              title="Hot Signal Spikes"
              icon={Flame}
              tone="text-orange-600"
              signals={hotSpikes}
              onOpen={openLead}
              emptyText="No leads with a burst of recent activity."
              loading={busy}
            />
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
