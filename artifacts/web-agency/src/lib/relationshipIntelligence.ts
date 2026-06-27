// Relationship Intelligence Engine
// Pure TypeScript — no React, no API calls, no side effects.
// Combines health, engagement, DISC, workflow, and communication signals
// into a single relationship profile per lead.

const DAY = 86_400_000;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / DAY;
}

// ── Input interfaces ──────────────────────────────────────────────────────────

export interface RiLead {
  id: number;
  name: string;
  company?: string | null;
  status: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus?: string | null;
  sowStatus?: string | null;
  generatedProposal?: string | null;
  estimatedValue?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiActivity {
  type: string;
  createdAt: string;
}

// ── Output interfaces ─────────────────────────────────────────────────────────

export type StrengthLabel = "Weak" | "Growing" | "Strong" | "Excellent";
export type RiskLevel    = "Low Risk" | "Moderate" | "High" | "Critical";

export interface RelationshipStrength {
  score: number;
  label: StrengthLabel;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
}

export interface RiskSignal {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
}

export interface RiskScore {
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface ConversationRecommendation {
  action: string;
  why: string;
  urgency: "immediate" | "today" | "this-week" | "when-ready";
  channel: "SMS" | "Call" | "Email" | "Meeting" | "Wait";
}

export interface RelationshipProfile {
  strength: RelationshipStrength;
  risk: RiskScore;
  conversation: ConversationRecommendation;
  summary: string;
  executiveRecommendation: string;
}

// ── computeRelationshipStrength ───────────────────────────────────────────────

export function computeRelationshipStrength(
  lead: RiLead,
  healthScore: number,
  engagementScore = 50,
  discConfidence  = 0,
  momentumTrend: "rising" | "stable" | "declining" = "stable",
): RelationshipStrength {
  let score = 0;

  // Health (35% weight)
  score += healthScore * 0.35;

  // Engagement (25% weight)
  score += engagementScore * 0.25;

  // Deal stage (0-15)
  const stagePoints: Record<string, number> = {
    Won: 15, Negotiating: 12, "Proposal Sent": 10,
    "Follow-up": 8, Contacted: 5, New: 3,
    Lost: 0, Nurture: 2,
  };
  score += stagePoints[lead.status] ?? 3;

  // Proposal progress (0-10)
  const proposalPoints: Record<string, number> = { Signed: 10, Sent: 7, Draft: 4 };
  score += proposalPoints[lead.proposalStatus ?? ""] ?? 0;

  // Communication recency (0-10)
  const dsc = daysSince(lead.lastContactedAt);
  if      (dsc < 3)  score += 10;
  else if (dsc < 7)  score += 7;
  else if (dsc < 14) score += 4;
  else if (dsc < 30) score += 1;

  // DISC confidence bonus (0-5)
  if      (discConfidence > 80) score += 5;
  else if (discConfidence > 60) score += 3;
  else if (discConfidence > 40) score += 1;

  // Momentum modifier (±5)
  if      (momentumTrend === "rising")   score += 5;
  else if (momentumTrend === "declining") score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 75) {
    return {
      score, label: "Excellent",
      description: "Strong, trust-based relationship with active engagement",
      color: "text-emerald-700", bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200", barColor: "bg-emerald-500",
    };
  }
  if (score >= 50) {
    return {
      score, label: "Strong",
      description: "Solid relationship with consistent communication",
      color: "text-blue-700", bgColor: "bg-blue-50",
      borderColor: "border-blue-200", barColor: "bg-blue-500",
    };
  }
  if (score >= 26) {
    return {
      score, label: "Growing",
      description: "Relationship is developing — maintain regular contact",
      color: "text-amber-700", bgColor: "bg-amber-50",
      borderColor: "border-amber-200", barColor: "bg-amber-500",
    };
  }
  return {
    score, label: "Weak",
    description: "Relationship needs significant attention and outreach",
    color: "text-red-700", bgColor: "bg-red-50",
    borderColor: "border-red-200", barColor: "bg-red-500",
  };
}

// ── computeRiskScore ──────────────────────────────────────────────────────────

export function computeRiskScore(
  lead: RiLead,
  activities: RiActivity[],
  engagementScore = 50,
  momentumTrend: "rising" | "stable" | "declining" = "stable",
): RiskScore {
  const signals: RiskSignal[] = [];
  const now = Date.now();
  const dsc = daysSince(lead.lastContactedAt);

  // No contact
  if (!lead.lastContactedAt) {
    signals.push({ key: "no_contact", label: "Never contacted", severity: "high" });
  } else if (dsc > 30) {
    signals.push({ key: "no_contact", label: `No contact in ${Math.round(dsc)} days`, severity: "high" });
  } else if (dsc > 14) {
    signals.push({ key: "no_contact", label: `No contact in ${Math.round(dsc)} days`, severity: "medium" });
  }

  // Missed follow-up
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now) {
    const overdueDays = Math.round((now - new Date(lead.nextFollowUpAt).getTime()) / DAY);
    signals.push({
      key: "missed_followup",
      label: `Follow-up overdue by ${overdueDays} day${overdueDays !== 1 ? "s" : ""}`,
      severity: overdueDays > 3 ? "high" : "medium",
    });
  }

  // Proposal stalled
  if (lead.proposalStatus === "Sent" && dsc > 7) {
    signals.push({ key: "proposal_stalled", label: "Proposal sent — no response in 7+ days", severity: "medium" });
  }

  // Failed SMS (last 7 days)
  const recentFailed = activities.filter(a => a.type === "sms_failed" && daysSince(a.createdAt) < 7).length;
  if (recentFailed > 0) {
    signals.push({
      key: "failed_sms",
      label: `${recentFailed} SMS failure${recentFailed > 1 ? "s" : ""} in last 7 days`,
      severity: "medium",
    });
  }

  // No replies (low engagement despite outreach)
  const outboundCount = activities.filter(a =>
    ["sms_sent", "email_sent", "call_initiated"].includes(a.type)
  ).length;
  if (engagementScore < 20 && outboundCount > 2) {
    signals.push({ key: "no_replies", label: "Low engagement — no meaningful replies detected", severity: "medium" });
  }

  // Declining momentum
  if (momentumTrend === "declining") {
    signals.push({ key: "declining_momentum", label: "Momentum is declining", severity: "low" });
  }

  // Cold lead (status)
  if (lead.status === "Lost") {
    signals.push({ key: "lost_status", label: "Deal marked as Lost", severity: "high" });
  }

  const weights = { high: 30, medium: 15, low: 5 } as const;
  const rawScore = signals.reduce((sum, s) => sum + weights[s.severity], 0);
  const score = Math.min(100, rawScore);

  if (score >= 75) {
    return { score, level: "Critical", signals, color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" };
  }
  if (score >= 50) {
    return { score, level: "High", signals, color: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200" };
  }
  if (score >= 25) {
    return { score, level: "Moderate", signals, color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" };
  }
  return { score, level: "Low Risk", signals, color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" };
}

// ── computeNextConversation ───────────────────────────────────────────────────

export function computeNextConversation(
  lead: RiLead,
  activities: RiActivity[],
  healthScore: number,
  engagementScore = 50,
  discPrimaryStyle = "",
  riskLevel: RiskLevel = "Low Risk",
): ConversationRecommendation {
  const dsc = daysSince(lead.lastContactedAt);
  void activities; // reserved for future signal use

  // Critical risk or very poor health
  if (riskLevel === "Critical" || healthScore < 25) {
    return {
      action: "Call immediately.",
      why: "This relationship is at critical risk and requires urgent personal outreach.",
      urgency: "immediate",
      channel: "Call",
    };
  }

  // Missed follow-up
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now()) {
    return {
      action: "Call today to address the missed follow-up.",
      why: "A scheduled follow-up is overdue — calling directly shows commitment.",
      urgency: "today",
      channel: "Call",
    };
  }

  // Proposal ready to send
  if (lead.proposalStatus === "Draft") {
    return {
      action: "Send the proposal now.",
      why: "A draft proposal is ready — every day of delay loses momentum.",
      urgency: "today",
      channel: "Email",
    };
  }

  // Proposal sent — follow up
  if (lead.proposalStatus === "Sent" && dsc > 5) {
    return {
      action: "Follow up on the proposal by phone.",
      why: `No contact for ${Math.round(dsc)} days since the proposal was sent.`,
      urgency: "today",
      channel: "Call",
    };
  }

  // DISC-specific recommendations
  if (discPrimaryStyle === "D") {
    return {
      action: "Schedule a brief, results-focused phone call.",
      why: "D-style contacts prefer directness and decisive conversations over email.",
      urgency: dsc > 7 ? "today" : "this-week",
      channel: "Call",
    };
  }

  if (discPrimaryStyle === "I") {
    return {
      action: "Send a warm, enthusiastic message and invite a casual call.",
      why: "I-style contacts are motivated by energy, recognition, and personal connection.",
      urgency: dsc > 7 ? "today" : "this-week",
      channel: "SMS",
    };
  }

  if (discPrimaryStyle === "S") {
    return {
      action: "Send a friendly check-in with a clear, low-pressure next step.",
      why: "S-style contacts value consistency and respond well to gentle, predictable outreach.",
      urgency: "this-week",
      channel: "Email",
    };
  }

  if (discPrimaryStyle === "C") {
    return {
      action: "Prepare and email a detailed update or data summary.",
      why: "C-style contacts make decisions based on complete information — give them the facts.",
      urgency: "this-week",
      channel: "Email",
    };
  }

  // Low engagement
  if (engagementScore < 30) {
    return {
      action: "Send a brief re-engagement SMS.",
      why: "Engagement is low — a short, easy-to-reply message has the best chance of re-opening dialogue.",
      urgency: "this-week",
      channel: "SMS",
    };
  }

  // Good recency
  if (dsc < 7) {
    return {
      action: "Maintain your current cadence — follow up in 3–5 days.",
      why: "Recent contact is fresh. Spacing maintains presence without creating pressure.",
      urgency: "when-ready",
      channel: "Email",
    };
  }

  // Default
  return {
    action: "Send a value-add email or call to check in.",
    why: `Last contact was ${dsc === Infinity ? "unknown" : `${Math.round(dsc)} days ago`} — staying top of mind matters.`,
    urgency: dsc > 14 ? "today" : "this-week",
    channel: dsc > 14 ? "Call" : "Email",
  };
}

// ── computeRelationshipSummary ────────────────────────────────────────────────

export function computeRelationshipSummary(
  strength: RelationshipStrength,
  risk: RiskScore,
  momentumTrend: "rising" | "stable" | "declining" = "stable",
): string {
  const strengthText =
    strength.label === "Excellent" ? "an excellent" :
    strength.label === "Strong"    ? "a strong"    :
    strength.label === "Growing"   ? "a growing"   : "a weak";

  const riskText =
    risk.level === "Low Risk" ? "low risk" :
    risk.level === "Moderate" ? "moderate risk" :
    risk.level === "High"     ? "elevated risk" : "critical risk";

  const momentumText =
    momentumTrend === "rising"   ? " Momentum is rising." :
    momentumTrend === "declining" ? " Momentum is declining." : "";

  const signalText = risk.signals.length > 0
    ? ` Key concern: ${risk.signals[0].label.toLowerCase()}.`
    : "";

  return `This is ${strengthText} relationship at ${riskText}.${momentumText}${signalText}`;
}

// ── computeExecutiveRecommendation ────────────────────────────────────────────

export function computeExecutiveRecommendation(
  lead: RiLead,
  strength: RelationshipStrength,
  risk: RiskScore,
  conversation: ConversationRecommendation,
  discPrimaryStyle = "",
  momentumTrend: "rising" | "stable" | "declining" = "stable",
): string {
  const parts: string[] = [];

  // Opening — relationship state
  if (strength.label === "Excellent") {
    parts.push(`${lead.name} represents an excellent relationship with strong engagement and consistent communication.`);
  } else if (strength.label === "Strong") {
    parts.push(`${lead.name} has a solid relationship — communication is consistent and the deal is progressing.`);
  } else if (strength.label === "Growing") {
    parts.push(`The relationship with ${lead.name} is developing but has not yet reached a strong foundation.`);
  } else {
    parts.push(`The relationship with ${lead.name} is currently weak and requires immediate focus.`);
  }

  // Momentum
  if (momentumTrend === "rising") {
    parts.push("Momentum is trending upward — now is an ideal time to advance the deal.");
  } else if (momentumTrend === "declining") {
    parts.push("Momentum is declining — action is needed to reverse the trend before the opportunity fades.");
  }

  // Top risk signal
  if (risk.level === "Critical" || risk.level === "High") {
    const top = risk.signals[0]?.label.toLowerCase() ?? "inactivity";
    parts.push(`The primary risk is ${top}.`);
  }

  // DISC influence
  if (discPrimaryStyle === "D") {
    parts.push("As a D-style communicator, they respond well to brief, outcome-focused conversations.");
  } else if (discPrimaryStyle === "I") {
    parts.push("As an I-style communicator, they are motivated by enthusiasm and personal connection.");
  } else if (discPrimaryStyle === "S") {
    parts.push("As an S-style communicator, they value trust, consistency, and a low-pressure approach.");
  } else if (discPrimaryStyle === "C") {
    parts.push("As a C-style communicator, they make decisions based on detailed data and logical analysis.");
  }

  // Proposal context
  if (lead.proposalStatus === "Sent") {
    parts.push("A proposal has been submitted and is awaiting response — follow-up is critical.");
  } else if (lead.proposalStatus === "Draft") {
    parts.push("A proposal draft is ready to send — delaying reduces momentum.");
  } else if (lead.proposalStatus === "Signed") {
    parts.push("The proposal has been signed — focus on delivering and transitioning to onboarding.");
  }

  // Closing action
  parts.push(`Recommended: ${conversation.action}`);

  return parts.join(" ");
}

// ── computeRelationshipProfile ────────────────────────────────────────────────

export function computeRelationshipProfile(
  lead: RiLead,
  activities: RiActivity[],
  healthScore: number,
  engagementScore  = 50,
  discPrimaryStyle = "",
  discConfidence   = 0,
  momentumTrend: "rising" | "stable" | "declining" = "stable",
): RelationshipProfile {
  const strength = computeRelationshipStrength(lead, healthScore, engagementScore, discConfidence, momentumTrend);
  const risk     = computeRiskScore(lead, activities, engagementScore, momentumTrend);
  const conversation = computeNextConversation(lead, activities, healthScore, engagementScore, discPrimaryStyle, risk.level);
  const summary  = computeRelationshipSummary(strength, risk, momentumTrend);
  const executiveRecommendation = computeExecutiveRecommendation(lead, strength, risk, conversation, discPrimaryStyle, momentumTrend);
  return { strength, risk, conversation, summary, executiveRecommendation };
}
