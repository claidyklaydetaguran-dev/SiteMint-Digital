import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { scoreLeadFromFields, type LeadScoreInput, type ScoredActivity } from "@/lib/leadScore";
import { computeCommunicationStats, type CiLead } from "@/lib/communicationIntelligence";
import { computeDiscProfile, DISC_META, type DiLead } from "@/lib/discEngine";
import {
  computeLeadDna, computeIntentTrend,
  type BehavioralEvent, INTENT_STAGE_COLOR,
} from "@/lib/behavioralIntelligence";
import {
  ArrowLeft, Dna, Heart, MessageCircle, TrendingUp, TrendingDown, Flame,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

// Same threshold used by the org-wide Behavioral Intelligence dashboard —
// do not redefine a second "hot spike" concept here.
const HOT_SPIKE_THRESHOLD = 3;

interface Lead {
  id: number; name: string; company?: string; status: string; priority: string;
  source: string; serviceInterest?: string; notes?: string; tags: string[];
  estimatedValue?: string; packageType?: string; proposalStatus: string;
  sowStatus: string; discoveryFormStatus: string;
  lastContactedAt?: string; nextFollowUpAt?: string;
  smsConsent: boolean; smsOptOut: boolean;
  createdAt: string; updatedAt: string;
}
interface Activity { id: number; type: string; title: string; description?: string; createdAt: string; }

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

export default function CrmLeadDna() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<BehavioralEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const h = { Authorization: `Bearer ${token()}` };
        const [leadRes, evRes] = await Promise.all([
          fetch(`/api/crm/leads/${params.id}`, { headers: h }),
          fetch(`/api/crm/leads/${params.id}/behavioral-events`, { headers: h }),
        ]);
        if (!leadRes.ok) throw new Error(`HTTP ${leadRes.status}`);
        const leadData = await leadRes.json() as { lead: Lead; activities: Activity[] };
        const evData = evRes.ok ? await evRes.json() as { events: BehavioralEvent[] } : { events: [] };
        setLead(leadData.lead);
        setActivities(leadData.activities ?? []);
        setEvents(evData.events ?? []);
      } catch {
        setError("Failed to load Lead DNA.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const health = useMemo(() => {
    if (!lead) return null;
    const input: LeadScoreInput = {
      status: lead.status, priority: lead.priority, estimatedValue: lead.estimatedValue,
      lastContactedAt: lead.lastContactedAt, nextFollowUpAt: lead.nextFollowUpAt,
      updatedAt: lead.updatedAt, createdAt: lead.createdAt,
      smsConsent: lead.smsConsent, proposalStatus: lead.proposalStatus,
    };
    const scoredActivities: ScoredActivity[] = activities.map(a => ({ createdAt: a.createdAt, type: a.type }));
    return scoreLeadFromFields(input, scoredActivities);
  }, [lead, activities]);

  const ciStats = useMemo(() => {
    if (!lead) return null;
    const ciLead: CiLead = {
      id: lead.id, status: lead.status, lastContactedAt: lead.lastContactedAt,
      nextFollowUpAt: lead.nextFollowUpAt, proposalStatus: lead.proposalStatus,
      smsConsent: lead.smsConsent, smsOptOut: lead.smsOptOut,
    };
    return computeCommunicationStats(ciLead, activities, []);
  }, [lead, activities]);

  const discProfile = useMemo(() => {
    if (!lead) return null;
    const diLead: DiLead = {
      id: lead.id, status: lead.status, priority: lead.priority, source: lead.source,
      serviceInterest: lead.serviceInterest, notes: lead.notes, tags: lead.tags,
      estimatedValue: lead.estimatedValue, packageType: lead.packageType,
      proposalStatus: lead.proposalStatus, discoveryFormStatus: lead.discoveryFormStatus,
      lastContactedAt: lead.lastContactedAt, nextFollowUpAt: lead.nextFollowUpAt,
      smsConsent: lead.smsConsent, smsOptOut: lead.smsOptOut,
    };
    return computeDiscProfile(diLead, [], activities);
  }, [lead, activities]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
    [events],
  );
  const leadDna = useMemo(() => computeLeadDna(sortedEvents), [sortedEvents]);
  const trend = useMemo(() => computeIntentTrend(sortedEvents), [sortedEvents]);
  const recentEventCount7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return sortedEvents.filter(e => new Date(e.occurredAt).getTime() > cutoff).length;
  }, [sortedEvents]);
  const isHotSpike = recentEventCount7d >= HOT_SPIKE_THRESHOLD;

  // ── DNA Summary — deterministic, rule-based, no AI call ─────────────────────
  const dnaSummary = useMemo(() => {
    if (!lead || !health || !ciStats || !discProfile) return "";
    const parts: string[] = [];

    const discMeta = DISC_META[discProfile.primaryStyle];
    parts.push(`${discMeta.label} type (${discMeta.shortDesc.toLowerCase()})`);
    parts.push(`${health.badge} health score (${health.score}/100)`);

    if (trend.direction === "rising") parts.push("engagement rising");
    else if (trend.direction === "falling") parts.push("engagement falling");
    if (isHotSpike) parts.push(`a recent spike of ${recentEventCount7d} signals in the last 7 days`);

    const goneQuietOnCalls = activities.filter(a => a.type === "call_initiated" || a.type === "call_received").length === 0
      && activities.some(a => a.type === "email_sent" || a.type === "sms_sent");
    if (goneQuietOnCalls) parts.push("has gone quiet on calls");
    else if (ciStats.replyRisk === "High") parts.push("at high risk of going cold");

    const sentence1 = `${parts[0]}, ${parts.slice(1).join(", ")}.`;

    let recommendation: string;
    if (discProfile.primaryStyle === "Analytical" || discProfile.primaryStyle === "Driver") {
      recommendation = goneQuietOnCalls
        ? "recommend a data-heavy follow-up email, not a call"
        : "recommend a concise, results-focused follow-up";
    } else {
      recommendation = goneQuietOnCalls
        ? "recommend a warm check-in call"
        : "recommend continuing the current cadence";
    }
    const sentence2 = health.badge === "Cold" || health.badge === "Needs Attention"
      ? `Health score suggests re-engagement is overdue — ${recommendation}.`
      : `Recommend: ${recommendation}.`;

    return `${sentence1.charAt(0).toUpperCase()}${sentence1.slice(1)} ${sentence2}`;
  }, [lead, health, ciStats, discProfile, trend, isHotSpike, recentEventCount7d, activities]);

  if (loading) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-muted-foreground">
            Loading Lead DNA…
          </div>
        </div>
      </CrmLayout>
    );
  }

  if (error || !lead || !health || !ciStats || !discProfile) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error ?? "Lead not found."}
          </div>
        </div>
      </CrmLayout>
    );
  }

  const discMeta = DISC_META[discProfile.primaryStyle];

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/admin/crm/leads/${lead.id}`)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {lead.name}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Dna className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Lead DNA — {lead.name}</h1>
          {lead.company && <span className="text-sm text-muted-foreground">{lead.company}</span>}
        </div>

        <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="crm-insight-dot" />
            <h3 className="font-semibold text-sm text-foreground">DNA Summary</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{dnaSummary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="crm-insight-dot" />
              <span className="text-lg">{discMeta.emoji}</span>
              <h3 className="font-semibold text-sm text-foreground">Behavioral Type</h3>
            </div>
            <div className={`inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-full border ${discMeta.bgColor} ${discMeta.color} ${discMeta.borderColor} mb-2`}>
              {discMeta.label}
            </div>
            <p className="text-xs text-muted-foreground mb-3">{discMeta.shortDesc}</p>
            <p className="text-xs text-muted-foreground">
              Confidence {discProfile.confidence}% · secondary trait {discProfile.secondaryStyle}
            </p>
          </div>

          <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="crm-insight-dot" />
              <Heart className={`w-4 h-4 ${health.color}`} />
              <h3 className="font-semibold text-sm text-foreground">Lead Health</h3>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-3xl font-bold leading-none ${health.color}`}>{health.score}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${health.bgColor} ${health.color} ${health.borderColor}`}>
                {health.badge}
              </span>
            </div>
            <ul className="space-y-1">
              {health.reasons.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {r.type === "positive" ? "+" : r.type === "negative" ? "−" : "•"} {r.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="crm-insight-dot" />
              <MessageCircle className={`w-4 h-4 ${ciStats.engagementScore.color}`} />
              <h3 className="font-semibold text-sm text-foreground">Communication Intelligence</h3>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-3xl font-bold leading-none ${ciStats.engagementScore.color}`}>
                {ciStats.engagementScore.score}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ciStats.engagementScore.bgColor} ${ciStats.engagementScore.color} ${ciStats.engagementScore.borderColor}`}>
                {ciStats.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Response rate {ciStats.responseRate.rate}% · reply risk {ciStats.replyRisk} · prefers {ciStats.preferredChannel}
            </p>
          </div>

          <div className="crm-insight-card bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="crm-insight-dot" />
              {trend.direction === "rising" ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : trend.direction === "falling" ? (
                <TrendingDown className="w-4 h-4 text-red-600" />
              ) : (
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              )}
              <h3 className="font-semibold text-sm text-foreground">Behavioral Signal Trend</h3>
              {isHotSpike && <Flame className="w-4 h-4 text-orange-600 ml-auto" />}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INTENT_STAGE_COLOR[leadDna.intentStage]}`}>
                {leadDna.intentStage}
              </span>
              <span className={`text-xs font-semibold flex items-center gap-1 ${
                trend.direction === "rising" ? "text-emerald-600" : trend.direction === "falling" ? "text-red-600" : "text-muted-foreground"
              }`}>
                {trend.delta > 0 ? `+${trend.delta}` : trend.delta}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Client Intent {leadDna.clientIntent} · {leadDna.eventCount} events · last signal {timeAgo(leadDna.lastEventAt)}
              {isHotSpike && ` · hot spike (${recentEventCount7d} in 7d)`}
            </p>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
