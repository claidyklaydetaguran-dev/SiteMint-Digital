import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
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

import { type Load, readAdminResource } from "@/lib/adminLoad";
import { LoadFailure, dataOf } from "@/components/crm/LoadState";

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

/** The contact and its activity stream. A body with no contact is a failure. */
interface ContactBundle { lead: Lead; activities: Activity[]; }

function pickContact(body: unknown): ContactBundle | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { lead?: unknown; activities?: unknown };
  if (!b.lead || typeof b.lead !== "object") return undefined;
  return {
    lead: b.lead as Lead,
    activities: Array.isArray(b.activities) ? b.activities as Activity[] : [],
  };
}

function pickEvents(body: unknown): BehavioralEvent[] | undefined {
  const list = body && typeof body === "object" ? (body as { events?: unknown }).events : undefined;
  return Array.isArray(list) ? list as BehavioralEvent[] : undefined;
}

export default function CrmLeadDna() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [contactLoad, setContactLoad] = useState<Load<ContactBundle>>({ status: "loading" });
  /**
   * The behavioural signals, as their own answer.
   *
   * This was `evRes.ok ? … : { events: [] }`: a refused or unreachable
   * sub-request quietly became an empty array, and the page went on to report
   * "0 events", "last signal never" and an intent-stage badge computed from
   * nothing — a behavioural reading of a client that nobody had been able to
   * take, presented beside figures that were real.
   */
  const [eventsLoad, setEventsLoad] = useState<Load<BehavioralEvent[]>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  const [reloadingEvents, setReloadingEvents] = useState(false);

  const loadEvents = useCallback(async () => {
    setReloadingEvents(true);
    setEventsLoad(await readAdminResource(`/api/crm/leads/${params.id}/behavioral-events`, pickEvents));
    setReloadingEvents(false);
  }, [params.id]);

  const load = useCallback(async () => {
    setReloading(true);
    setReloadingEvents(true);
    const [nextContact, nextEvents] = await Promise.all([
      readAdminResource(`/api/crm/leads/${params.id}`, pickContact),
      readAdminResource(`/api/crm/leads/${params.id}/behavioral-events`, pickEvents),
    ]);
    setContactLoad(nextContact);
    setEventsLoad(nextEvents);
    setReloading(false);
    setReloadingEvents(false);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  const contact = dataOf(contactLoad);
  const lead = contact?.lead ?? null;
  // Stable identity, so the memos below do not re-run on every render.
  const activities = useMemo(() => contact?.activities ?? [], [contact]);
  /** The signals, or null when the request for them produced none. */
  const events = dataOf(eventsLoad);

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

  // Null all the way down when the signals never arrived: a DNA computed from
  // an empty list is a reading, not a blank.
  const sortedEvents = useMemo(
    () => (events === null
      ? null
      : [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())),
    [events],
  );
  const leadDna = useMemo(() => (sortedEvents === null ? null : computeLeadDna(sortedEvents)), [sortedEvents]);
  const trend = useMemo(() => (sortedEvents === null ? null : computeIntentTrend(sortedEvents)), [sortedEvents]);
  const recentEventCount7d = useMemo(() => {
    if (sortedEvents === null) return null;
    const cutoff = Date.now() - 7 * 86_400_000;
    return sortedEvents.filter(e => new Date(e.occurredAt).getTime() > cutoff).length;
  }, [sortedEvents]);
  const isHotSpike = recentEventCount7d !== null && recentEventCount7d >= HOT_SPIKE_THRESHOLD;

  // ── DNA Summary — deterministic, rule-based, no AI call ─────────────────────
  const dnaSummary = useMemo(() => {
    if (!lead || !health || !ciStats || !discProfile) return "";
    const parts: string[] = [];

    const discMeta = DISC_META[discProfile.primaryStyle];
    parts.push(`${discMeta.label} type (${discMeta.shortDesc.toLowerCase()})`);
    parts.push(`${health.badge} health score (${health.score}/100)`);

    // Nothing is claimed about the signal trend when the signals are missing.
    if (trend?.direction === "rising") parts.push("engagement rising");
    else if (trend?.direction === "falling") parts.push("engagement falling");
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

  /*
    The failure, stated in the words the response gave, with a way to try it
    again — a 403, a 5xx and an unreachable server no longer share the one
    flat "Failed to load Lead DNA." And a contact that is simply not there is
    named as that, with the list offered rather than substituted.
  */
  if (contactLoad.status === "error") {
    const missing = contactLoad.httpStatus === 404;
    return (
      <CrmLayout>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <LoadFailure
            what="Lead DNA"
            reason={contactLoad.reason}
            onRetry={missing ? undefined : () => { void load(); }}
            retrying={reloading}
          >
            <p className="mt-2 text-sm text-muted-foreground break-words">
              {missing
                ? "This contact is no longer in the CRM. It may have been deleted, or merged into another record."
                : "No behavioural type, health score or signal trend is shown while this is unavailable."}
            </p>
            <Link href="/admin/crm/leads">
              <button className="mt-3 text-sm text-primary underline underline-offset-2 hover:opacity-80">
                Open the contacts list
              </button>
            </Link>
          </LoadFailure>
        </div>
      </CrmLayout>
    );
  }

  // `health`, `ciStats` and `discProfile` are all derived from the contact, so
  // the only way they are missing is that it has not arrived yet.
  if (!lead || !health || !ciStats || !discProfile) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div
            role="status"
            aria-live="polite"
            className="bg-white rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
          >
            Loading Lead DNA…
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

        <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="crm-insight-dot" />
            <h3 className="font-semibold text-sm text-foreground">DNA Summary</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{dnaSummary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm p-5">
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

          <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm p-5">
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

          <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm p-5">
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

          <div className="crm-insight-card bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="crm-insight-dot" />
              {trend?.direction === "rising" ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : trend?.direction === "falling" ? (
                <TrendingDown className="w-4 h-4 text-red-600" />
              ) : (
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              )}
              <h3 className="font-semibold text-sm text-foreground">Behavioral Signal Trend</h3>
              {isHotSpike && <Flame className="w-4 h-4 text-orange-600 ml-auto" />}
            </div>
            {/*
              The intent stage, the signal count and the last-signal date all
              come from one sub-request. When it fails none of them is shown:
              "0 events · last signal never" under a stage badge computed from
              an empty list read as a dormant client who may well have been
              busy all week.
            */}
            {eventsLoad.status === "loading" ? (
              <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                Loading behavioural signals…
              </p>
            ) : leadDna === null || trend === null ? (
              <LoadFailure
                what="Behavioural signals"
                reason={eventsLoad.status === "error" ? eventsLoad.reason : ""}
                variant="inline"
                onRetry={() => { void loadEvents(); }}
                retrying={reloadingEvents}
              >
                <p className="mt-1 text-xs text-muted-foreground">
                  No intent stage, signal count or last-signal date is shown while this is unavailable — there may well be signals on this contact.
                </p>
              </LoadFailure>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
