// ── Communication Intelligence Engine ────────────────────────────────────────
// Pure TypeScript utility — no React, no API calls, no side effects.
// Inputs: lead fields, activities array, messages array (any may be empty).
// Outputs: engagement score, response rate, preferred channel, reply risk,
//          communication status, and plain-English recommendations.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CiLead {
  id: number;
  status: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus?: string;
  smsConsent?: boolean;
  smsOptOut?: boolean;
}

export interface CiActivity {
  id: number;
  type: string;
  title: string;
  description?: string;
  createdAt: string;
}

export interface CiMessage {
  id: number;
  direction: string;       // "inbound" | "outbound"
  channel: string;         // "sms" | "call"
  body?: string;
  status?: string;
  callStatus?: string;
  duration?: number;
  createdAt: string;
}

export type EngagementBadge =
  | "Highly Engaged"
  | "Engaged"
  | "Moderate"
  | "Low Engagement"
  | "Cold";

export type ChannelPreference = "SMS" | "Email" | "Call" | "Unknown";
export type ReplyRisk        = "Low" | "Medium" | "High";
export type CommStatus       = "Engaged" | "Waiting for Reply" | "Needs Follow-up" | "Cold" | "New";

export interface EngagementScore {
  score: number;
  badge: EngagementBadge;
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
  reasons: string[];
}

export interface ResponseRate {
  outboundCount: number;
  inboundCount: number;
  rate: number;              // 0–100 percentage
  lastOutboundAt?: string;
  lastInboundAt?: string;
  daysSinceLastResponse?: number;
  daysSinceLastOutreach?: number;
}

export interface CommunicationStats {
  engagementScore: EngagementScore;
  responseRate: ResponseRate;
  preferredChannel: ChannelPreference;
  replyRisk: ReplyRisk;
  status: CommStatus;
  lastOutboundAt?: string;
  lastInboundAt?: string;
}

export interface CommunicationRecommendation {
  id: string;
  text: string;
  priority: "high" | "medium" | "low";
  channel?: ChannelPreference;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

const OUTBOUND_ACTIVITY_TYPES = ["email_sent", "sms_attempted", "sms_sent", "call_initiated"];
const INBOUND_ACTIVITY_TYPES  = ["sms_received", "call_received"];
const ALL_COMM_TYPES = [...OUTBOUND_ACTIVITY_TYPES, ...INBOUND_ACTIVITY_TYPES];

// ── Internal helpers ──────────────────────────────────────────────────────────

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / DAY;
}

function latest(...isoList: (string | null | undefined)[]): string | undefined {
  const valid = isoList.filter((s): s is string => !!s);
  if (!valid.length) return undefined;
  return valid.reduce((best, cur) =>
    new Date(cur).getTime() > new Date(best).getTime() ? cur : best
  );
}

function earliest(...isoList: (string | null | undefined)[]): string | undefined {
  const valid = isoList.filter((s): s is string => !!s);
  if (!valid.length) return undefined;
  return valid.reduce((best, cur) =>
    new Date(cur).getTime() < new Date(best).getTime() ? cur : best
  );
}

// ── computeEngagementScore ────────────────────────────────────────────────────

export function computeEngagementScore(
  lead: CiLead,
  activities: CiActivity[],
  messages: CiMessage[],
): EngagementScore {
  const now = Date.now();
  const reasons: string[] = [];

  // ── Classify messages
  const outboundMsgs = messages.filter(m => m.direction === "outbound");
  const inboundMsgs  = messages.filter(m => m.direction === "inbound");
  const completedCalls = messages.filter(m =>
    m.channel === "call" &&
    ["completed", "in-progress", "answered"].includes((m.callStatus ?? "").toLowerCase()),
  );
  const failedComm = messages.filter(m =>
    m.status === "failed" ||
    ["failed", "no-answer", "busy"].includes((m.callStatus ?? "").toLowerCase()),
  );

  // ── Classify activities
  const emailSentActs = activities.filter(a => a.type === "email_sent");
  const outboundActs  = activities.filter(a => OUTBOUND_ACTIVITY_TYPES.includes(a.type));
  const inboundActs   = activities.filter(a => INBOUND_ACTIVITY_TYPES.includes(a.type));

  // ── Aggregates
  const totalOutbound = outboundMsgs.length + emailSentActs.length;
  const totalInbound  = inboundMsgs.length  + inboundActs.length;
  const hasInbound    = totalInbound > 0;
  const hasTwoWay     = totalOutbound > 0 && hasInbound;

  // Timing of last outbound/inbound
  const lastOutMs = Math.max(
    ...outboundMsgs.map(m => new Date(m.createdAt).getTime()),
    ...outboundActs.map(a => new Date(a.createdAt).getTime()),
    0,
  );
  const lastInMs = Math.max(
    ...inboundMsgs.map(m => new Date(m.createdAt).getTime()),
    ...inboundActs.map(a => new Date(a.createdAt).getTime()),
    0,
  );
  const lastAnyMs = Math.max(lastOutMs, lastInMs);

  const recentInbound  = lastInMs  > 0 && (now - lastInMs)  < 7  * DAY;
  const recentOutbound = lastOutMs > 0 && (now - lastOutMs) < 3  * DAY;
  const daysSinceLast  = lastAnyMs > 0 ? (now - lastAnyMs) / DAY : Infinity;

  // ── Scoring
  let score = 30;

  if (recentInbound) {
    score += 20;
    reasons.push("Inbound reply within 7 days");
  }
  if (hasTwoWay) {
    score += 15;
    reasons.push("Two-way conversation exists");
  }
  if (recentOutbound) {
    score += 10;
    reasons.push("Outbound message sent within 3 days");
  }
  if (completedCalls.length > 0) {
    score += 10;
    reasons.push(`${completedCalls.length} completed call${completedCalls.length !== 1 ? "s" : ""}`);
  }
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) > new Date()) {
    score += 10;
    reasons.push("Follow-up scheduled");
  }
  if (emailSentActs.length > 0) {
    score += 5;
    reasons.push(`${emailSentActs.length} email${emailSentActs.length !== 1 ? "s" : ""} sent`);
  }
  const smsOutCount = outboundMsgs.filter(m => m.channel === "sms").length +
    activities.filter(a => ["sms_sent", "sms_attempted"].includes(a.type)).length;
  if (smsOutCount > 0) {
    score += 5;
    reasons.push("SMS outreach attempted");
  }

  if (!hasInbound && totalOutbound >= 3) {
    score -= 15;
    reasons.push("No response after 3+ outbound attempts");
  } else if (!hasInbound && totalOutbound > 0) {
    score -= 20;
    reasons.push("No inbound reply received yet");
  }
  if (daysSinceLast >= 30) {
    score -= 25;
    reasons.push("No communication in 30+ days");
  } else if (daysSinceLast >= 14) {
    score -= 20;
    reasons.push("No communication in 14+ days");
  }
  if (failedComm.length > 0) {
    score -= 10;
    reasons.push(`${failedComm.length} failed communication attempt${failedComm.length !== 1 ? "s" : ""}`);
  }

  if (totalOutbound === 0 && totalInbound === 0) {
    score = Math.min(score, 35);
    if (!reasons.includes("No communication recorded yet")) {
      reasons.push("No communication recorded yet");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let badge: EngagementBadge;
  let color: string;
  let bgColor: string;
  let borderColor: string;
  let barColor: string;

  if (score >= 90) {
    badge = "Highly Engaged"; color = "text-emerald-700"; bgColor = "bg-emerald-50";
    borderColor = "border-emerald-200"; barColor = "bg-emerald-500";
  } else if (score >= 70) {
    badge = "Engaged"; color = "text-green-700"; bgColor = "bg-green-50";
    borderColor = "border-green-200"; barColor = "bg-green-500";
  } else if (score >= 50) {
    badge = "Moderate"; color = "text-yellow-700"; bgColor = "bg-yellow-50";
    borderColor = "border-yellow-200"; barColor = "bg-yellow-500";
  } else if (score >= 30) {
    badge = "Low Engagement"; color = "text-orange-700"; bgColor = "bg-orange-50";
    borderColor = "border-orange-200"; barColor = "bg-orange-400";
  } else {
    badge = "Cold"; color = "text-red-700"; bgColor = "bg-red-50";
    borderColor = "border-red-200"; barColor = "bg-red-500";
  }

  return { score, badge, color, bgColor, borderColor, barColor, reasons };
}

// ── computeResponseRate ───────────────────────────────────────────────────────

export function computeResponseRate(
  activities: CiActivity[],
  messages: CiMessage[],
): ResponseRate {
  const outboundMsgs = messages.filter(m => m.direction === "outbound");
  const inboundMsgs  = messages.filter(m => m.direction === "inbound");
  const emailSentActs = activities.filter(a => a.type === "email_sent");
  const inboundActs   = activities.filter(a => INBOUND_ACTIVITY_TYPES.includes(a.type));

  const outboundCount = outboundMsgs.length + emailSentActs.length;
  const inboundCount  = inboundMsgs.length  + inboundActs.length;
  const rate = outboundCount === 0 ? 0 : Math.min(100, Math.round((inboundCount / outboundCount) * 100));

  const lastOutboundAt = latest(
    ...outboundMsgs.map(m => m.createdAt),
    ...emailSentActs.map(a => a.createdAt),
  );
  const lastInboundAt = latest(
    ...inboundMsgs.map(m => m.createdAt),
    ...inboundActs.map(a => a.createdAt),
  );

  const daysSinceLastResponse = lastInboundAt
    ? Math.floor(daysSince(lastInboundAt))
    : undefined;
  const daysSinceLastOutreach = lastOutboundAt
    ? Math.floor(daysSince(lastOutboundAt))
    : undefined;

  return {
    outboundCount,
    inboundCount,
    rate,
    lastOutboundAt,
    lastInboundAt,
    daysSinceLastResponse,
    daysSinceLastOutreach,
  };
}

// ── computePreferredChannel ───────────────────────────────────────────────────

export function computePreferredChannel(
  activities: CiActivity[],
  messages: CiMessage[],
): ChannelPreference {
  const smsInbound  = messages.filter(m => m.direction === "inbound" && m.channel === "sms").length;
  const callInbound = messages.filter(m => m.direction === "inbound" && m.channel === "call").length;
  const completedCalls = messages.filter(m =>
    m.channel === "call" &&
    ["completed", "answered", "in-progress"].includes((m.callStatus ?? "").toLowerCase()),
  ).length;
  const emailSent   = activities.filter(a => a.type === "email_sent").length;
  const smsOutbound = messages.filter(m => m.direction === "outbound" && m.channel === "sms").length +
    activities.filter(a => ["sms_sent", "sms_attempted"].includes(a.type)).length;

  // Only identify a preference when there's clear signal (≥2 events)
  if (smsInbound >= 2) return "SMS";
  if (completedCalls >= 2) return "Call";
  if (smsInbound === 1 && smsInbound > callInbound) return "SMS";
  if (completedCalls === 1 && completedCalls > smsInbound) return "Call";
  // Email: only if outbound email with no SMS responses (tentative — we can't track email replies)
  if (emailSent >= 2 && smsInbound === 0 && callInbound === 0 && smsOutbound === 0) return "Email";
  return "Unknown";
}

// ── computeReplyRisk ──────────────────────────────────────────────────────────

export function computeReplyRisk(
  lead: CiLead,
  activities: CiActivity[],
  messages: CiMessage[],
): ReplyRisk {
  const outboundMsgs = messages.filter(m => m.direction === "outbound");
  const inboundMsgs  = messages.filter(m => m.direction === "inbound");
  const outboundActs = activities.filter(a => OUTBOUND_ACTIVITY_TYPES.includes(a.type));
  const inboundActs  = activities.filter(a => INBOUND_ACTIVITY_TYPES.includes(a.type));

  const totalOutbound = outboundMsgs.length + outboundActs.length;
  const hasInbound    = inboundMsgs.length + inboundActs.length > 0;

  const lastInboundAt = latest(
    ...inboundMsgs.map(m => m.createdAt),
    ...inboundActs.map(a => a.createdAt),
  );

  const daysSinceReply = daysSince(lastInboundAt);

  // Count outbound messages sent AFTER last inbound (i.e. unanswered)
  const cutoff = lastInboundAt ? new Date(lastInboundAt).getTime() : 0;
  const unansweredOut = [
    ...outboundMsgs.filter(m => new Date(m.createdAt).getTime() > cutoff),
    ...outboundActs.filter(a => new Date(a.createdAt).getTime() > cutoff),
  ].length;

  if (daysSinceReply < 7) return "Low";
  if (unansweredOut >= 3 || daysSinceReply > 21) return "High";
  if (!hasInbound && totalOutbound >= 2) return "High";
  if (unansweredOut >= 2 || daysSinceReply > 10) return "Medium";
  if (!hasInbound && totalOutbound >= 1) return "Medium";
  return "Low";
}

// ── computeCommunicationStats ─────────────────────────────────────────────────

export function computeCommunicationStats(
  lead: CiLead,
  activities: CiActivity[],
  messages: CiMessage[],
): CommunicationStats {
  const engagementScore  = computeEngagementScore(lead, activities, messages);
  const responseRate     = computeResponseRate(activities, messages);
  const preferredChannel = computePreferredChannel(activities, messages);
  const replyRisk        = computeReplyRisk(lead, activities, messages);

  const outboundMsgs = messages.filter(m => m.direction === "outbound");
  const inboundMsgs  = messages.filter(m => m.direction === "inbound");
  const outboundActs = activities.filter(a => OUTBOUND_ACTIVITY_TYPES.includes(a.type));
  const inboundActs  = activities.filter(a => INBOUND_ACTIVITY_TYPES.includes(a.type));

  const lastOutboundAt = latest(
    ...outboundMsgs.map(m => m.createdAt),
    ...outboundActs.map(a => a.createdAt),
  );
  const lastInboundAt = latest(
    ...inboundMsgs.map(m => m.createdAt),
    ...inboundActs.map(a => a.createdAt),
  );

  const totalOutbound = outboundMsgs.length + outboundActs.length;
  const totalInbound  = inboundMsgs.length  + inboundActs.length;
  const hasRecent     = (lastOutboundAt ?? lastInboundAt) &&
    daysSince(latest(lastOutboundAt, lastInboundAt)) < 7;

  let status: CommStatus;
  if (totalOutbound === 0 && totalInbound === 0) {
    status = "New";
  } else if (lastInboundAt && daysSince(lastInboundAt) < 7) {
    status = "Engaged";
  } else if (totalOutbound > 0 && totalInbound === 0) {
    status = "Waiting for Reply";
  } else if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= new Date()) {
    status = "Needs Follow-up";
  } else if (daysSince(latest(lastOutboundAt, lastInboundAt)) > 14) {
    status = "Cold";
  } else {
    status = hasRecent ? "Engaged" : "Needs Follow-up";
  }

  return {
    engagementScore,
    responseRate,
    preferredChannel,
    replyRisk,
    status,
    lastOutboundAt,
    lastInboundAt,
  };
}

// ── computeCommunicationRecommendations ───────────────────────────────────────

export function computeCommunicationRecommendations(
  lead: CiLead,
  activities: CiActivity[],
  messages: CiMessage[],
): CommunicationRecommendation[] {
  const outboundMsgs = messages.filter(m => m.direction === "outbound");
  const inboundMsgs  = messages.filter(m => m.direction === "inbound");
  const outboundActs = activities.filter(a => OUTBOUND_ACTIVITY_TYPES.includes(a.type));
  const inboundActs  = activities.filter(a => INBOUND_ACTIVITY_TYPES.includes(a.type));
  const emailSentActs = activities.filter(a => a.type === "email_sent");

  const totalOutbound = outboundMsgs.length + outboundActs.length;
  const totalInbound  = inboundMsgs.length  + inboundActs.length;
  const smsOutbound   = messages.filter(m => m.direction === "outbound" && m.channel === "sms").length;
  const smsInbound    = inboundMsgs.filter(m => m.channel === "sms").length;

  const lastInboundAt = latest(
    ...inboundMsgs.map(m => m.createdAt),
    ...inboundActs.map(a => a.createdAt),
  );
  const daysSinceReply = daysSince(lastInboundAt);

  const recs: CommunicationRecommendation[] = [];

  // No communication yet
  if (totalOutbound === 0 && totalInbound === 0) {
    recs.push({
      id: "first_contact",
      text: "No communication yet. Make first contact via SMS or email to introduce yourself.",
      priority: "high",
      channel: "SMS",
    });
    return recs;
  }

  // Lead replied recently — don't over-contact
  if (lastInboundAt && daysSinceReply < 4) {
    recs.push({
      id: "wait",
      text: "Lead replied recently. Wait before following up again — give them space to respond.",
      priority: "low",
    });
    return recs;
  }

  // SMS sent 3+ times, no reply — try another channel
  if (smsOutbound >= 3 && smsInbound === 0) {
    recs.push({
      id: "switch_channel",
      text: "SMS has not received a response after 3+ attempts. Try a phone call instead.",
      priority: "high",
      channel: "Call",
    });
  }

  // Proposal sent — use email for detail
  if (lead.proposalStatus === "Draft" || lead.proposalStatus === "Sent") {
    recs.push({
      id: "email_proposal",
      text: "Use email to provide detailed proposal context or answer questions about pricing.",
      priority: "medium",
      channel: "Email",
    });
  }

  // No follow-up in a while
  if (daysSince(latest(
    ...outboundMsgs.map(m => m.createdAt),
    ...outboundActs.map(a => a.createdAt),
  )) > 14) {
    recs.push({
      id: "re_engage",
      text: "No outreach in 14+ days. Send a short SMS follow-up to re-engage.",
      priority: "high",
      channel: "SMS",
    });
  }

  // Has email history but no SMS — suggest SMS
  if (emailSentActs.length > 0 && smsOutbound === 0 && !lead.smsOptOut) {
    recs.push({
      id: "try_sms",
      text: "You've emailed this lead but haven't tried SMS yet. SMS often gets faster responses.",
      priority: "medium",
      channel: "SMS",
    });
  }

  // Good cadence
  if (totalInbound > 0 && daysSinceReply < 14) {
    recs.push({
      id: "maintain_cadence",
      text: "Conversation is active. Maintain regular follow-up cadence and move toward the next sales step.",
      priority: "low",
    });
  }

  // Default fallback
  if (recs.length === 0) {
    recs.push({
      id: "continue",
      text: "Continue regular outreach. Aim for consistent touchpoints every 5–7 days.",
      priority: "low",
    });
  }

  return recs;
}

// ── Utility: isCommActivity ───────────────────────────────────────────────────

export function isCommActivity(type: string): boolean {
  return ALL_COMM_TYPES.includes(type);
}
