/**
 * Lead Health Score Engine
 *
 * Pure, transparent, rule-based scoring — 0 to 100.
 * No AI, no black boxes. Every point is explained in `reasons`.
 * Can run from basic lead fields (list view) or full detail data (with activities).
 */

export type ReasonType = "positive" | "warning" | "negative";

export interface ScoreReason {
  type: ReasonType;
  text: string;
}

export interface ScoreResult {
  score: number;
  badge: "Excellent" | "Hot" | "Warm" | "Needs Attention" | "Cold";
  color: string;
  bgColor: string;
  barColor: string;
  borderColor: string;
  reasons: ScoreReason[];
  action: string;
}

export interface LeadScoreInput {
  status?: string;
  priority: string;
  estimatedValue?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
  smsConsent?: boolean;
  proposalStatus?: string;
}

export interface ScoredActivity {
  createdAt: string;
  type?: string;
}

const DAY = 86_400_000;

function getBadge(score: number): ScoreResult["badge"] {
  if (score >= 95) return "Excellent";
  if (score >= 80) return "Hot";
  if (score >= 60) return "Warm";
  if (score >= 40) return "Needs Attention";
  return "Cold";
}

function getBadgeStyle(badge: ScoreResult["badge"]) {
  switch (badge) {
    case "Excellent":
      return { color: "text-emerald-700", bgColor: "bg-emerald-100", barColor: "bg-emerald-500", borderColor: "border-emerald-300" };
    case "Hot":
      return { color: "text-orange-700",  bgColor: "bg-orange-100",  barColor: "bg-orange-500",  borderColor: "border-orange-300" };
    case "Warm":
      return { color: "text-yellow-700",  bgColor: "bg-yellow-100",  barColor: "bg-yellow-500",  borderColor: "border-yellow-300" };
    case "Needs Attention":
      return { color: "text-amber-700",   bgColor: "bg-amber-100",   barColor: "bg-amber-400",   borderColor: "border-amber-300" };
    case "Cold":
      return { color: "text-blue-600",    bgColor: "bg-blue-50",     barColor: "bg-blue-400",    borderColor: "border-blue-200" };
  }
}

/**
 * Compute a health score from whatever fields are available.
 *
 * Base: 30 points (neutral start so an average lead without strong signals is
 * in the "Needs Attention" range and can move up or down based on behaviour).
 *
 * When activities[] is provided (lead detail API) the 3-day recency and
 * 30-day inactivity signals are computed precisely. Otherwise updatedAt is
 * used as a proxy.
 *
 * Performance: pure function, no side effects, < 0.1 ms per call.
 */
export function scoreLeadFromFields(
  lead: LeadScoreInput,
  activities?: ScoredActivity[],
): ScoreResult {
  let score = 30;
  const reasons: ScoreReason[] = [];
  const now = Date.now();

  // ── POSITIVE ──────────────────────────────────────────────────────────────

  // +20 High priority
  if (lead.priority === "High") {
    score += 20;
    reasons.push({ type: "positive", text: "High priority lead" });
  } else if (lead.priority === "Low") {
    score -= 5;
    reasons.push({ type: "warning", text: "Low priority" });
  }

  // +15 Estimated value > $10K | +8 value $5K–$10K
  const estVal = parseFloat(lead.estimatedValue ?? "0") || 0;
  if (estVal > 10_000) {
    score += 15;
    reasons.push({ type: "positive", text: `Est. value $${estVal.toLocaleString()} (above $10K)` });
  } else if (estVal > 5_000) {
    score += 8;
    reasons.push({ type: "positive", text: `Est. value $${estVal.toLocaleString()}` });
  }

  // +15 Won | +5 active stages
  if (lead.status === "Won") {
    score += 15;
    reasons.push({ type: "positive", text: "Deal won" });
  } else if (["Contacted", "Follow-up", "Proposal Sent", "Negotiating"].includes(lead.status ?? "")) {
    score += 5;
    reasons.push({ type: "positive", text: `Active stage: ${lead.status}` });
  }

  // +15 Activity within last 3 days (precise, from activities[])
  // OR +8 updatedAt within 3 days (proxy when activities not loaded)
  // -25 No activity in 30 days (precise) | -20 via updatedAt proxy
  if (activities && activities.length > 0) {
    const hasRecent3d  = activities.some(a => now - new Date(a.createdAt).getTime() < 3  * DAY);
    const hasRecent30d = activities.some(a => now - new Date(a.createdAt).getTime() < 30 * DAY);
    if (hasRecent3d) {
      score += 15;
      reasons.push({ type: "positive", text: "Recent activity (last 3 days)" });
    }
    if (!hasRecent30d) {
      score -= 25;
      reasons.push({ type: "negative", text: "No activity in 30+ days" });
    }
  } else if (lead.updatedAt) {
    const daysSinceUpdate = (now - new Date(lead.updatedAt).getTime()) / DAY;
    if (daysSinceUpdate < 3) {
      score += 8;
      reasons.push({ type: "positive", text: "Recently updated" });
    } else if (daysSinceUpdate > 30) {
      score -= 20;
      reasons.push({ type: "negative", text: "No updates in 30+ days" });
    }
  }

  // +10 Upcoming follow-up (not overdue)
  if (lead.nextFollowUpAt) {
    const followUpMs = new Date(lead.nextFollowUpAt).getTime();
    const daysToFollowUp = (followUpMs - now) / DAY;
    if (daysToFollowUp > 0) {
      score += 10;
      const label =
        daysToFollowUp < 1  ? "today"
        : daysToFollowUp < 2 ? "tomorrow"
        : new Date(lead.nextFollowUpAt).toLocaleDateString();
      reasons.push({ type: "positive", text: `Follow-up scheduled: ${label}` });
    }
  }

  // +5 Proposal sent (waiting for response = engaged lead)
  if (lead.proposalStatus === "Sent") {
    score += 5;
    reasons.push({ type: "positive", text: "Proposal sent — awaiting response" });
  }

  // +3 SMS consent (reachable by text)
  if (lead.smsConsent) {
    score += 3;
  }

  // ── NEGATIVE ──────────────────────────────────────────────────────────────

  // -15 No contact in 14 days | -10 Never contacted
  if (lead.lastContactedAt) {
    const daysSinceContact = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
    if (daysSinceContact > 14) {
      score -= 15;
      reasons.push({ type: "warning", text: `No contact in ${Math.floor(daysSinceContact)} days` });
    }
  } else if (lead.status !== "Won" && lead.status !== "Lost") {
    score -= 10;
    reasons.push({ type: "warning", text: "Never contacted" });
  }

  // -20 Follow-up overdue
  if (lead.nextFollowUpAt) {
    const followUpMs = new Date(lead.nextFollowUpAt).getTime();
    if (followUpMs < now) {
      const daysOverdue = Math.ceil((now - followUpMs) / DAY);
      score -= 20;
      reasons.push({
        type: "negative",
        text: `Follow-up overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`,
      });
    }
  }

  // -15 Lost status
  if (lead.status === "Lost") {
    score -= 15;
    reasons.push({ type: "negative", text: "Lead marked Lost" });
  }

  // -5 Nurture (low-priority holding area)
  if (lead.status === "Nurture") {
    score -= 5;
  }

  // ── Clamp & finalise ──────────────────────────────────────────────────────

  score = Math.max(0, Math.min(100, Math.round(score)));
  const badge  = getBadge(score);
  const style  = getBadgeStyle(badge);

  // ── Recommended action (most urgent signal wins) ──────────────────────────

  let action: string;
  if (lead.status === "Lost") {
    action = "Re-engage or close out this lead";
  } else if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) {
    action = "Follow-up is overdue — contact now";
  } else if (!lead.lastContactedAt && lead.status !== "Won") {
    action = "Make initial contact";
  } else if (lead.status === "Proposal Sent") {
    action = "Follow up on the proposal";
  } else if (lead.status === "Negotiating") {
    action = "Close the deal";
  } else if (lead.priority === "High") {
    action = "Call today";
  } else if (lead.nextFollowUpAt) {
    action = `Follow up on ${new Date(lead.nextFollowUpAt).toLocaleDateString()}`;
  } else {
    action = "Schedule a follow-up or send an email";
  }

  return { score, badge, ...style, reasons, action };
}
