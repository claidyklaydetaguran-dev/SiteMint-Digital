/**
 * Sales Intelligence Engine — Phase 15
 *
 * Pure TypeScript. Zero React. Zero API calls. No AI.
 * Everything is transparent, deterministic, and rule-based.
 *
 * Accepts outputs from existing engines (leadScore, communicationIntelligence,
 * workflowEngine, discEngine) as inputs — no re-computation here.
 *
 * Exports:
 *   computeSalesNBA            — Next Best Action with confidence + expected outcome
 *   computeLeadMomentum        — Directional momentum (rising/stable/declining)
 *   computeRecommendationConfidence — Per-lead confidence in any recommendation
 *   computeSalesPriority       — Composite priority rank 0–100 for sorting
 *   computeOpportunityRadar    — Classify leads into 4 buckets
 *   computeDailyBrief          — Aggregate daily summary for the dashboard
 */

const DAY = 86_400_000;

// ── Input types ───────────────────────────────────────────────────────────────

export interface SiLead {
  id: number;
  name: string;
  company?: string;
  status: string;
  priority: string;
  estimatedValue?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus: string;
  sowStatus: string;
  generatedProposal?: string | null;
  generatedSow?: string | null;
  discoverySubmissionId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiActivity {
  type: string;
  createdAt: string;
}

export interface SiTask {
  status: string;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type NbaActionType =
  | "Call"
  | "Send Email"
  | "Generate Proposal"
  | "Send Proposal"
  | "Generate SOW"
  | "Follow Up"
  | "Re-engage"
  | "Close Deal"
  | "Review Discovery"
  | "Schedule Meeting"
  | "Archive Lead";

export interface SalesNextBestAction {
  action: NbaActionType;
  confidence: number;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  expectedOutcome: string;
  dueToday: boolean;
  urgency: "immediate" | "today" | "this-week" | "when-ready";
}

export type MomentumTrend = "rising" | "stable" | "declining";

export interface LeadMomentum {
  score: number;
  trend: MomentumTrend;
  explanation: string;
  confidence: number;
  positiveSignals: string[];
  negativeSignals: string[];
}

export type OpportunityBucket = "hot" | "cooling" | "at-risk" | "nurture";

export interface RadarEntry {
  id: number;
  name: string;
  company?: string;
  estimatedValue?: string | null;
  healthScore: number;
  engagementScore: number;
  discStyle: string;
  recommendation: string;
  confidence: number;
  bucket: OpportunityBucket;
}

export interface OpportunityRadar {
  hot:     RadarEntry[];
  cooling: RadarEntry[];
  atRisk:  RadarEntry[];
  nurture: RadarEntry[];
}

export interface DailyBriefItem {
  emoji: string;
  label: string;
  count: number;
  urgency: "high" | "medium" | "low";
  detail: string;
}

export interface DailyBrief {
  date: string;
  topPriorityCount: number;
  items: DailyBriefItem[];
  summary: string;
}

export interface RadarInput {
  lead: SiLead;
  healthScore: number;
  engagementScore: number;
  discStyle: string;
}

// ── computeRecommendationConfidence ──────────────────────────────────────────

export function computeRecommendationConfidence(
  lead: SiLead,
  healthScore: number,
  engagementScore: number,
): number {
  let confidence = 45;
  if (lead.lastContactedAt)              confidence += 10;
  if (lead.nextFollowUpAt)               confidence += 5;
  if (lead.estimatedValue)               confidence += 5;
  if (lead.proposalStatus !== "Not Started") confidence += 10;
  if (lead.discoverySubmissionId)        confidence += 10;
  const avg = (healthScore + engagementScore) / 2;
  if (avg >= 70 || avg <= 30)            confidence += 10;
  return Math.min(95, Math.max(30, Math.round(confidence)));
}

// ── computeSalesPriority ──────────────────────────────────────────────────────

export function computeSalesPriority(
  lead: SiLead,
  healthScore: number,
  engagementScore: number,
): number {
  const val = parseFloat(lead.estimatedValue ?? "0") || 0;
  const valScore =
    val > 50_000 ? 100 : val > 20_000 ? 80 : val > 10_000 ? 60 : val > 5_000 ? 40 : val > 0 ? 20 : 0;
  const stageScore =
    lead.status === "Negotiating"   ? 100 :
    lead.status === "Proposal Sent" ? 90  :
    lead.status === "Follow-up"     ? 70  :
    lead.status === "Contacted"     ? 50  :
    lead.status === "New"           ? 40  : 0;
  let priority =
    healthScore    * 0.40 +
    engagementScore * 0.20 +
    valScore        * 0.20 +
    stageScore      * 0.20;
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) priority -= 5;
  return Math.max(0, Math.min(100, Math.round(priority)));
}

// ── computeSalesNBA ───────────────────────────────────────────────────────────

export function computeSalesNBA(
  lead: SiLead,
  activities: SiActivity[],
  tasks: SiTask[],
  healthScore: number,
  engagementScore: number,
): SalesNextBestAction {
  const now     = Date.now();
  const today   = new Date().toDateString();
  const isActive = !["Won", "Lost"].includes(lead.status);

  // 1. CRITICAL — overdue follow-up
  if (isActive && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) {
    const days = Math.ceil((now - new Date(lead.nextFollowUpAt).getTime()) / DAY);
    return {
      action: "Follow Up", confidence: 95, priority: "critical",
      reason: `Follow-up overdue by ${days} day${days !== 1 ? "s" : ""}`,
      expectedOutcome: "Re-establish contact before the lead goes cold",
      dueToday: true, urgency: "immediate",
    };
  }

  // 2. HIGH — follow-up due today
  if (isActive && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).toDateString() === today) {
    return {
      action: "Call", confidence: 90, priority: "high",
      reason: "Follow-up is scheduled for today",
      expectedOutcome: "Progress the conversation and move toward a proposal or close",
      dueToday: true, urgency: "today",
    };
  }

  // 3. HIGH — discovery submitted, no proposal yet
  if (isActive && lead.discoverySubmissionId && lead.proposalStatus === "Not Started") {
    return {
      action: "Review Discovery", confidence: 88, priority: "high",
      reason: "Client submitted a discovery form — review it and generate a proposal",
      expectedOutcome: "Tailored proposal based on discovery data drives faster decisions",
      dueToday: false, urgency: "today",
    };
  }

  // 4. HIGH — proposal sent, 7+ days no activity
  if (isActive && (lead.proposalStatus === "Sent" || lead.status === "Proposal Sent")) {
    const lastAct = activities[0];
    if (!lastAct || now - new Date(lastAct.createdAt).getTime() > 7 * DAY) {
      return {
        action: "Follow Up", confidence: 85, priority: "high",
        reason: "Proposal sent but no response in 7+ days",
        expectedOutcome: "Get a yes/no decision and advance to negotiation or revision",
        dueToday: false, urgency: "this-week",
      };
    }
  }

  // 5. HIGH — proposal drafted but not sent
  if (isActive && lead.generatedProposal && lead.proposalStatus === "Draft") {
    return {
      action: "Send Proposal", confidence: 87, priority: "high",
      reason: "Proposal is drafted and ready — every day of delay reduces close probability",
      expectedOutcome: "Get the proposal in front of the client to trigger a decision",
      dueToday: false, urgency: "today",
    };
  }

  // 6. HIGH — negotiating → push to close
  if (lead.status === "Negotiating") {
    return {
      action: "Close Deal", confidence: 82, priority: "high",
      reason: "Lead is in active negotiation — apply light pressure to close",
      expectedOutcome: "Secure signed agreement and move to project kickoff",
      dueToday: false, urgency: "this-week",
    };
  }

  // 7. HIGH — no proposal, active lead with decent score
  if (isActive && lead.proposalStatus === "Not Started" && !lead.generatedProposal && healthScore >= 50) {
    return {
      action: "Generate Proposal", confidence: 75, priority: "high",
      reason: "Active lead with no proposal — missing a conversion opportunity",
      expectedOutcome: "A concrete proposal accelerates decision-making",
      dueToday: false, urgency: "this-week",
    };
  }

  // 8. MEDIUM — proposal out but no SOW
  if (isActive && ["Sent", "Signed"].includes(lead.proposalStatus) && !lead.generatedSow) {
    return {
      action: "Generate SOW", confidence: 78, priority: "medium",
      reason: "Proposal is in client hands — create the SOW to define deliverables",
      expectedOutcome: "Clear scope builds client confidence and reduces negotiation friction",
      dueToday: false, urgency: "this-week",
    };
  }

  // 9. HIGH — never contacted
  const CONTACT_TYPES = ["email_sent", "sms_sent", "call_initiated", "call_received", "sms_received"];
  const hasContact = !!lead.lastContactedAt ||
    activities.some(a => CONTACT_TYPES.includes(a.type));
  if (isActive && !hasContact) {
    return {
      action: "Send Email", confidence: 80, priority: "high",
      reason: "Lead has never been contacted",
      expectedOutcome: "Start the relationship and qualify the opportunity",
      dueToday: false, urgency: "today",
    };
  }

  // 10. MEDIUM — cold lead (14+ days no contact)
  if (isActive && lead.lastContactedAt) {
    const daysSince = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
    if (daysSince > 14) {
      return {
        action: "Re-engage", confidence: 65, priority: "medium",
        reason: `No contact in ${Math.floor(daysSince)} days — lead is cooling`,
        expectedOutcome: "Re-warm the relationship and confirm their current timeline",
        dueToday: false, urgency: "this-week",
      };
    }
  }

  // 11. Won → kickoff
  if (lead.status === "Won") {
    return {
      action: "Schedule Meeting", confidence: 90, priority: "medium",
      reason: "Deal is won — schedule the project kickoff meeting",
      expectedOutcome: "Strong kickoff builds client trust from day one",
      dueToday: false, urgency: "this-week",
    };
  }

  // 12. Lost → archive
  if (lead.status === "Lost") {
    return {
      action: "Archive Lead", confidence: 60, priority: "low",
      reason: "Lead is marked Lost",
      expectedOutcome: "Clean up the pipeline and schedule re-engagement in 60–90 days",
      dueToday: false, urgency: "when-ready",
    };
  }

  // 13. Default
  return {
    action: healthScore >= 60 ? "Call" : "Send Email",
    confidence: 50, priority: "low",
    reason: "No urgent actions detected — keep the relationship warm",
    expectedOutcome: "Maintain top-of-mind presence and gather new information",
    dueToday: false, urgency: "when-ready",
  };
}

// ── computeLeadMomentum ───────────────────────────────────────────────────────

export function computeLeadMomentum(
  lead: SiLead,
  activities: SiActivity[],
  tasks: SiTask[],
  healthScore: number,
  engagementScore: number,
): LeadMomentum {
  const now = Date.now();
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 50;

  // Forward workflow steps in last 14 days
  const FORWARD = ["proposal_generated","proposal_sent","sow_generated","status_changed","task_completed"];
  const recentForward = activities.filter(
    a => FORWARD.includes(a.type) && now - new Date(a.createdAt).getTime() < 14 * DAY,
  );
  if (recentForward.length > 0) {
    score += 15;
    positive.push(`${recentForward.length} forward step${recentForward.length !== 1 ? "s" : ""} in last 14 days`);
  }

  // Proposal progress
  if (lead.proposalStatus === "Signed") {
    score += 20; positive.push("Proposal signed — deal closing");
  } else if (lead.proposalStatus === "Sent") {
    score += 10; positive.push("Proposal in client's hands");
  } else if (lead.generatedProposal) {
    score += 5; positive.push("Proposal drafted");
  }

  // SOW created
  if (lead.generatedSow) { score += 8; positive.push("SOW created"); }

  // Recent activity < 7 days
  const recent7d = activities.filter(a => now - new Date(a.createdAt).getTime() < 7 * DAY);
  if (recent7d.length >= 3) {
    score += 12; positive.push(`${recent7d.length} activities in last 7 days`);
  } else if (recent7d.length > 0) {
    score += 6; positive.push(`${recent7d.length} activity in last 7 days`);
  }

  // Tasks completed < 14 days
  const doneTasks = tasks.filter(
    t => t.status === "completed" && t.completedAt &&
      now - new Date(t.completedAt).getTime() < 14 * DAY,
  );
  if (doneTasks.length > 0) {
    score += 8; positive.push(`${doneTasks.length} task${doneTasks.length !== 1 ? "s" : ""} completed recently`);
  }

  // Upcoming follow-up
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) > new Date()) {
    score += 5; positive.push("Follow-up scheduled");
  }

  // Discovery submitted
  if (lead.discoverySubmissionId) { score += 5; positive.push("Discovery form submitted"); }

  // ── Negatives

  // Overdue follow-up
  if (lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) {
    const d = Math.ceil((now - new Date(lead.nextFollowUpAt).getTime()) / DAY);
    score -= 15; negative.push(`Follow-up overdue by ${d} day${d !== 1 ? "s" : ""}`);
  }

  // Long no contact
  if (lead.lastContactedAt) {
    const days = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
    if (days > 21) { score -= 20; negative.push(`No contact in ${Math.floor(days)} days`); }
    else if (days > 14) { score -= 10; negative.push(`${Math.floor(days)} days since last contact`); }
  } else if (!["Won", "Lost"].includes(lead.status)) {
    score -= 10; negative.push("Never contacted");
  }

  // Proposal stalled
  if (lead.proposalStatus === "Sent" || lead.status === "Proposal Sent") {
    const last = activities[0];
    if (!last || now - new Date(last.createdAt).getTime() > 14 * DAY) {
      score -= 10; negative.push("Proposal sent but silent for 14+ days");
    }
  }

  // Both scores low
  if (healthScore < 40 && engagementScore < 40) {
    score -= 10; negative.push("Both health and engagement are low");
  }

  // No activity in 30+ days
  const has30d = activities.some(a => now - new Date(a.createdAt).getTime() < 30 * DAY);
  if (!has30d && activities.length > 0) {
    score -= 15; negative.push("No activity in 30+ days");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let trend: MomentumTrend;
  let explanation: string;
  if (score >= 65) {
    trend = "rising";
    explanation = positive.length > 0
      ? `Moving forward — ${positive[0]}`
      : "Strong engagement and pipeline movement";
  } else if (score <= 35) {
    trend = "declining";
    explanation = negative.length > 0
      ? `Losing steam — ${negative[0]}`
      : "Multiple stall signals detected";
  } else {
    trend = "stable";
    explanation = "Moderate activity — no strong movement in either direction";
  }

  const totalSignals = positive.length + negative.length;
  const confidence = totalSignals === 0 ? 40 : Math.min(90, 40 + totalSignals * 7);

  return { score, trend, explanation, confidence, positiveSignals: positive, negativeSignals: negative };
}

// ── classifyOpportunityBucket (internal) ─────────────────────────────────────

function classifyOpportunityBucket(
  lead: SiLead,
  healthScore: number,
  engagementScore: number,
): { bucket: OpportunityBucket; recommendation: string; confidence: number } {
  const now = Date.now();
  const val = parseFloat(lead.estimatedValue ?? "0") || 0;
  const isActive = !["Won", "Lost"].includes(lead.status);
  const daysSinceContact = lead.lastContactedAt
    ? (now - new Date(lead.lastContactedAt).getTime()) / DAY
    : Infinity;
  const isOverdue = !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
  const conf = computeRecommendationConfidence(lead, healthScore, engagementScore);

  // Hot: high health+engagement + high value or active deal stage
  if (
    isActive && healthScore >= 70 && engagementScore >= 55 &&
    (val > 10_000 || lead.proposalStatus === "Sent" || lead.status === "Negotiating")
  ) {
    return {
      bucket: "hot",
      recommendation:
        lead.status === "Negotiating"   ? "Push to close — deal is within reach" :
        lead.proposalStatus === "Sent"  ? "Follow up on proposal this week" :
        "High-value engaged lead — move to proposal immediately",
      confidence: conf,
    };
  }
  if (isActive && healthScore >= 80 && engagementScore >= 60) {
    return {
      bucket: "hot",
      recommendation: "Strong lead — prioritize and schedule a call",
      confidence: conf,
    };
  }

  // At Risk: overdue or cold + low health
  const proposalStalled =
    (lead.proposalStatus === "Sent" || lead.status === "Proposal Sent") &&
    daysSinceContact > 21;
  if (isActive && (isOverdue || daysSinceContact > 21 || proposalStalled) && healthScore < 55) {
    return {
      bucket: "at-risk",
      recommendation:
        isOverdue         ? "Follow up immediately — overdue" :
        proposalStalled   ? "Proposal has been silent too long — send a check-in" :
        `Re-engage now — ${Math.floor(daysSinceContact)} days without contact`,
      confidence: conf,
    };
  }

  // Cooling: dropping health but still active
  if (
    isActive && healthScore >= 35 && healthScore < 70 &&
    (engagementScore < 50 || daysSinceContact > 7)
  ) {
    return {
      bucket: "cooling",
      recommendation:
        engagementScore < 40
          ? "Re-engage before this lead goes cold"
          : "Schedule a follow-up to maintain momentum",
      confidence: conf,
    };
  }

  // Nurture (low urgency, won, or lost)
  return {
    bucket: "nurture",
    recommendation:
      lead.status === "Won"  ? "Schedule project kickoff" :
      lead.status === "Lost" ? "Add to re-engagement list for 60+ days" :
      "Maintain periodic touchpoints — not urgent",
    confidence: conf,
  };
}

// ── computeOpportunityRadar ───────────────────────────────────────────────────

export function computeOpportunityRadar(inputs: RadarInput[]): OpportunityRadar {
  const radar: OpportunityRadar = { hot: [], cooling: [], atRisk: [], nurture: [] };

  for (const { lead, healthScore, engagementScore, discStyle } of inputs) {
    const { bucket, recommendation, confidence } = classifyOpportunityBucket(
      lead, healthScore, engagementScore,
    );
    const entry: RadarEntry = {
      id: lead.id, name: lead.name, company: lead.company,
      estimatedValue: lead.estimatedValue,
      healthScore, engagementScore, discStyle,
      recommendation, confidence, bucket,
    };
    if (bucket === "at-risk") radar.atRisk.push(entry);
    else radar[bucket].push(entry);
  }

  const sortFn = (a: RadarEntry, b: RadarEntry) =>
    (b.healthScore + b.engagementScore) - (a.healthScore + a.engagementScore);
  radar.hot.sort(sortFn);
  radar.cooling.sort(sortFn);
  radar.atRisk.sort(sortFn);
  radar.nurture.sort(sortFn);

  return radar;
}

// ── computeDailyBrief ─────────────────────────────────────────────────────────

export interface BriefInput {
  leads: SiLead[];
  tasks: SiTask[];
  healthScores: Map<number, number>;
}

export function computeDailyBrief(input: BriefInput): DailyBrief {
  const { leads, tasks, healthScores } = input;
  const now   = Date.now();
  const today = new Date().toDateString();
  const active = leads.filter(l => !["Won", "Lost"].includes(l.status));

  const overdue        = active.filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date());
  const followUpToday  = active.filter(l => l.nextFollowUpAt && new Date(l.nextFollowUpAt).toDateString() === today);
  const proposalWait   = active.filter(l => l.proposalStatus === "Sent" || l.status === "Proposal Sent");
  const tasksDueToday  = tasks.filter(t => t.status !== "completed" && t.dueDate && new Date(t.dueDate).toDateString() === today);
  const hotOpps        = active.filter(l => (healthScores.get(l.id) ?? 0) >= 75);
  const nearClose      = leads.filter(l => l.status === "Negotiating");
  const needsOutreach  = active.filter(l => !l.lastContactedAt || (now - new Date(l.lastContactedAt).getTime()) > 14 * DAY);

  const items: DailyBriefItem[] = [];

  if (overdue.length > 0) items.push({
    emoji: "🚨", label: "Overdue Follow-ups", count: overdue.length, urgency: "high",
    detail: `${overdue.length} lead${overdue.length !== 1 ? "s" : ""} missed their follow-up date`,
  });
  if (followUpToday.length > 0) items.push({
    emoji: "📅", label: "Follow-ups Due Today", count: followUpToday.length, urgency: "high",
    detail: `${followUpToday.length} lead${followUpToday.length !== 1 ? "s" : ""} scheduled for contact today`,
  });
  if (nearClose.length > 0) items.push({
    emoji: "🤝", label: "Deals Near Closing", count: nearClose.length, urgency: "high",
    detail: `${nearClose.length} deal${nearClose.length !== 1 ? "s" : ""} in active negotiation`,
  });
  if (proposalWait.length > 0) items.push({
    emoji: "📄", label: "Proposal Follow-ups", count: proposalWait.length, urgency: "medium",
    detail: `${proposalWait.length} proposal${proposalWait.length !== 1 ? "s" : ""} awaiting client response`,
  });
  if (tasksDueToday.length > 0) items.push({
    emoji: "✅", label: "Tasks Due Today", count: tasksDueToday.length, urgency: "medium",
    detail: `${tasksDueToday.length} task${tasksDueToday.length !== 1 ? "s" : ""} on today's agenda`,
  });
  if (hotOpps.length > 0) items.push({
    emoji: "🔥", label: "Hot Opportunities", count: hotOpps.length, urgency: "medium",
    detail: `${hotOpps.length} lead${hotOpps.length !== 1 ? "s" : ""} with health score ≥ 75`,
  });
  if (needsOutreach.length > 0) items.push({
    emoji: "📞", label: "Needs Outreach", count: needsOutreach.length, urgency: "low",
    detail: `${needsOutreach.length} lead${needsOutreach.length !== 1 ? "s" : ""} not contacted in 14+ days`,
  });

  const topPriorityCount = overdue.length + followUpToday.length + nearClose.length;

  const summary =
    topPriorityCount === 0 && items.length === 0
      ? "All caught up — no urgent actions today."
      : topPriorityCount > 5
      ? `Heavy day — ${topPriorityCount} high-priority actions need your attention.`
      : topPriorityCount > 0
      ? `${topPriorityCount} priority action${topPriorityCount !== 1 ? "s" : ""} to complete today.`
      : "Light day — follow up on proposals and check outstanding tasks.";

  return {
    date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    topPriorityCount,
    items,
    summary,
  };
}
