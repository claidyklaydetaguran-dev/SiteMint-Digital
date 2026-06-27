// ── Behavioral Intelligence Engine — Phase 24B ─────────────────────────────
//
// Pure computation layer. No API calls, no side effects.
// Input:  array of behavioral events (fetched from /api/crm/leads/:id/behavioral-events)
// Output: LeadDna — the full scored intelligence profile for a lead.
//
// This file is the source of truth for score computation.
// Do not import from locked engines (discEngine, leadScore, etc).

export interface BehavioralEvent {
  id: number;
  occurredAt: string;
  leadId: number;
  eventType: string;
  label: string | null;
  dClientIntent: string | null;
  dUrgency: string | null;
  dTrust: string | null;
  dProjectReadiness: string | null;
  dBudgetConfidence: string | null;
  dCommunicationScore: string | null;
  dReferralProbability: string | null;
  metadata: Record<string, unknown> | null;
}

export interface LeadDna {
  clientIntent: number;
  urgency: number;
  trust: number;
  projectReadiness: number;
  budgetConfidence: number;
  communicationScore: number;
  referralProbability: number;
  intentStage: IntentStage;
  eventCount: number;
  lastEventAt: string | null;
}

// Intent stages — ordered from early awareness to dormant
export type IntentStage =
  | "Discovering"
  | "Evaluating"
  | "Proposal Ready"
  | "Negotiating"
  | "Committed"
  | "Active Client"
  | "Project Complete"
  | "Referring"
  | "Dormant"
  | "At Risk";

// Default DNA baselines (neutral starting position)
const BASELINE: Omit<LeadDna, "intentStage" | "eventCount" | "lastEventAt"> = {
  clientIntent: 10,
  urgency: 10,
  trust: 20,
  projectReadiness: 5,
  budgetConfidence: 10,
  communicationScore: 20,
  referralProbability: 5,
};

// ── Built-in deltas per event type ────────────────────────────────────────────
// When an event has no stored delta columns, fall back to these defaults.
// Individual events may override any dimension with their own stored delta.

const EVENT_DEFAULTS: Record<string, Partial<Omit<LeadDna, "intentStage" | "eventCount" | "lastEventAt">>> = {
  email_opened:               { clientIntent: 6,  trust: 3,  communicationScore: 3 },
  email_clicked_cta:          { clientIntent: 12, urgency: 5, projectReadiness: 5, communicationScore: 4 },
  email_ignored:              { clientIntent: -4, communicationScore: -3 },
  email_replied:              { clientIntent: 15, trust: 10, communicationScore: 10, urgency: 5 },
  proposal_viewed:            { clientIntent: 20, projectReadiness: 15, urgency: 10 },
  proposal_reopened:          { clientIntent: 18, urgency: 15, projectReadiness: 10 },
  proposal_downloaded:        { clientIntent: 22, projectReadiness: 20, budgetConfidence: 10 },
  sow_opened:                 { clientIntent: 18, projectReadiness: 18, budgetConfidence: 8 },
  sow_downloaded:             { clientIntent: 20, projectReadiness: 22, budgetConfidence: 15 },
  call_answered:              { trust: 15, clientIntent: 18, communicationScore: 15, urgency: 8 },
  call_missed:                { communicationScore: -5, urgency: -3 },
  call_duration_long:         { trust: 20, clientIntent: 20, urgency: 15, projectReadiness: 10 },
  sms_replied:                { trust: 10, communicationScore: 10, clientIntent: 8 },
  sms_ignored:                { communicationScore: -4, trust: -2 },
  discovery_form_submitted:   { clientIntent: 25, urgency: 15, projectReadiness: 12 },
  contact_form_submitted:     { clientIntent: 18, urgency: 10 },
  referral:                   { trust: 20, clientIntent: 15, referralProbability: 20 },
  facebook_lead:              { clientIntent: 10, urgency: 5 },
  instagram_lead:             { clientIntent: 10, urgency: 5 },
  google_ppc:                 { clientIntent: 15, urgency: 10, projectReadiness: 5 },
  organic:                    { clientIntent: 8 },
  meeting_booked:             { clientIntent: 28, urgency: 22, projectReadiness: 18, trust: 12 },
  meeting_attended:           { clientIntent: 30, trust: 25, urgency: 20, projectReadiness: 20, budgetConfidence: 10 },
  meeting_no_show:            { communicationScore: -15, trust: -10, urgency: -8 },
};

// ── Core computation ──────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function parseNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function computeLeadDna(events: BehavioralEvent[]): LeadDna {
  const scores = { ...BASELINE };

  for (const ev of events) {
    const defaults = EVENT_DEFAULTS[ev.eventType] ?? {};

    const apply = (key: keyof typeof BASELINE, stored: string | null) => {
      const storedVal = parseNum(stored);
      const delta = storedVal !== null ? storedVal : (defaults[key] ?? 0);
      scores[key] += delta;
    };

    apply("clientIntent",       ev.dClientIntent);
    apply("urgency",            ev.dUrgency);
    apply("trust",              ev.dTrust);
    apply("projectReadiness",   ev.dProjectReadiness);
    apply("budgetConfidence",   ev.dBudgetConfidence);
    apply("communicationScore", ev.dCommunicationScore);
    apply("referralProbability",ev.dReferralProbability);
  }

  const clamped = {
    clientIntent:       clamp(scores.clientIntent),
    urgency:            clamp(scores.urgency),
    trust:              clamp(scores.trust),
    projectReadiness:   clamp(scores.projectReadiness),
    budgetConfidence:   clamp(scores.budgetConfidence),
    communicationScore: clamp(scores.communicationScore),
    referralProbability:clamp(scores.referralProbability),
  };

  return {
    ...clamped,
    intentStage: deriveIntentStage(clamped, events),
    eventCount: events.length,
    lastEventAt: events.length > 0
      ? events[events.length - 1].occurredAt
      : null,
  };
}

// ── Intent stage derivation ───────────────────────────────────────────────────

function deriveIntentStage(
  scores: Omit<LeadDna, "intentStage" | "eventCount" | "lastEventAt">,
  events: BehavioralEvent[],
): IntentStage {
  const { clientIntent, trust, projectReadiness, communicationScore } = scores;
  const types = new Set(events.map(e => e.eventType));
  const hasRecent = (days: number) => {
    const cutoff = Date.now() - days * 86_400_000;
    return events.some(e => new Date(e.occurredAt).getTime() > cutoff);
  };

  if (types.has("meeting_attended") && projectReadiness >= 70) return "Committed";
  if (types.has("sow_downloaded") || types.has("proposal_downloaded")) return "Negotiating";
  if (types.has("meeting_booked") || types.has("proposal_viewed") || projectReadiness >= 60) return "Proposal Ready";
  if (clientIntent >= 50 && trust >= 40) return "Evaluating";
  if (clientIntent >= 25) return "Discovering";

  if (!hasRecent(90) && communicationScore < 20) return "At Risk";
  if (!hasRecent(60)) return "Dormant";

  return "Discovering";
}

// ── Trend delta: compare last N events to prior N ────────────────────────────

export function computeIntentTrend(events: BehavioralEvent[], windowSize = 5): {
  delta: number; direction: "rising" | "falling" | "stable";
} {
  if (events.length < 2) return { delta: 0, direction: "stable" };

  const recent = events.slice(-windowSize);
  const prior  = events.slice(-windowSize * 2, -windowSize);
  if (prior.length === 0) return { delta: 0, direction: "stable" };

  const score = (evs: BehavioralEvent[]) =>
    computeLeadDna(evs).clientIntent;

  const delta = score(recent) - score(prior);
  return {
    delta: Math.round(delta),
    direction: delta > 5 ? "rising" : delta < -5 ? "falling" : "stable",
  };
}

// ── Signal label helpers ──────────────────────────────────────────────────────

export const INTENT_STAGE_COLOR: Record<IntentStage, string> = {
  "Discovering":      "bg-blue-100 text-blue-700",
  "Evaluating":       "bg-indigo-100 text-indigo-700",
  "Proposal Ready":   "bg-violet-100 text-violet-700",
  "Negotiating":      "bg-amber-100 text-amber-700",
  "Committed":        "bg-emerald-100 text-emerald-700",
  "Active Client":    "bg-green-100 text-green-700",
  "Project Complete": "bg-gray-100 text-gray-600",
  "Referring":        "bg-teal-100 text-teal-700",
  "Dormant":          "bg-orange-100 text-orange-700",
  "At Risk":          "bg-red-100 text-red-700",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  email_opened:               "Email Opened",
  email_clicked_cta:          "Clicked Email CTA",
  email_ignored:              "Email Ignored",
  email_replied:              "Replied to Email",
  proposal_viewed:            "Proposal Viewed",
  proposal_reopened:          "Proposal Reopened",
  proposal_downloaded:        "Proposal Downloaded",
  sow_opened:                 "SOW Opened",
  sow_downloaded:             "SOW Downloaded",
  call_answered:              "Call Answered",
  call_missed:                "Call Missed",
  call_duration_long:         "Long Call",
  sms_replied:                "SMS Replied",
  sms_ignored:                "SMS Ignored",
  discovery_form_submitted:   "Discovery Form",
  contact_form_submitted:     "Contact Form",
  referral:                   "Referral",
  facebook_lead:              "Facebook Lead",
  instagram_lead:             "Instagram Lead",
  google_ppc:                 "Google PPC",
  organic:                    "Organic",
  meeting_booked:             "Meeting Booked",
  meeting_attended:           "Meeting Attended",
  meeting_no_show:            "No-Show",
  manual:                     "Manual Event",
};
