/**
 * Sales Automation Engine — Phase 16
 * Pure TypeScript. Zero React. Zero API calls. No AI.
 *
 * All outputs are DRAFTS and RECOMMENDATIONS for human review.
 * Nothing auto-sends. Nothing auto-contacts customers.
 * Everything requires explicit salesperson approval before acting.
 *
 * Reuses input types from salesIntelligence.ts (SiActivity, SiTask).
 */

import type { SiActivity, SiTask } from "./salesIntelligence";

const DAY = 86_400_000;

// ── Input Types ───────────────────────────────────────────────────────────────

/**
 * Extended lead type for the automation engine.
 * Includes contact fields beyond what SiLead provides.
 */
export interface AuLead {
  id: number;
  name: string;
  company?: string;
  email: string;
  phone?: string;
  status: string;
  priority: string;
  serviceInterest?: string;
  estimatedValue?: string | null;
  notes?: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus: string;
  sowStatus: string;
  generatedProposal?: string | null;
  generatedSow?: string | null;
  discoverySubmissionId?: number | null;
  smsConsent?: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Output Types ─────────────────────────────────────────────────────────────

export interface AutomationQueueItem {
  id: string;
  action: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  requiredData: string[];
  recommendedOwner: string;
  estimatedMinutes: number;
  status: "available" | "blocked";
  blockedReason?: string;
}

export interface AutomationQueue {
  items: AutomationQueueItem[];
  availableCount: number;
  blockedCount: number;
  topItem: AutomationQueueItem | null;
}

export interface AutomationSuggestion {
  action: string;
  why: string;
  impact: string;
  effort: "low" | "medium" | "high";
}

export interface ReadinessStatus {
  gate: string;
  ready: boolean;
  score: number;
  complete: string[];
  missing: string[];
  nextAction: string;
}

export interface LeadReadiness {
  salesReady: ReadinessStatus;
  proposalReady: ReadinessStatus;
  contractReady: ReadinessStatus;
  onboardingReady: ReadinessStatus;
  overallScore: number;
}

export interface RequiredDocument {
  name: string;
  status: "complete" | "draft" | "missing";
  importance: "critical" | "high" | "medium";
  action: string;
}

export interface MissingField {
  field: string;
  importance: "critical" | "high" | "medium";
  impact: string;
  recommendation: string;
}

export interface MissingInformation {
  fields: MissingField[];
  completenessScore: number;
  criticalCount: number;
  highCount: number;
}

export interface SequenceStep {
  step: number;
  action: string;
  why: string;
  waitDays?: number;
  status: "completed" | "current" | "pending" | "blocked";
  blockReason?: string;
}

export interface RecommendedSequence {
  currentStep: number;
  totalSteps: number;
  steps: SequenceStep[];
  nextAction: string;
  completionEstimateDays: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortItems(items: AutomationQueueItem[]): AutomationQueueItem[] {
  return items.slice().sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return (a.status === "blocked" ? 1 : 0) - (b.status === "blocked" ? 1 : 0);
  });
}

// ── computeAutomationQueue ────────────────────────────────────────────────────

/**
 * Returns a priority-ordered queue of pending actions for a single lead.
 * All actions are DRAFTS — nothing sends automatically.
 */
export function computeAutomationQueue(
  lead: AuLead,
  activities: SiActivity[],
  tasks: SiTask[],
): AutomationQueue {
  const now = Date.now();
  const isActive = !["Won", "Lost"].includes(lead.status);
  const items: AutomationQueueItem[] = [];

  // ── 1. CRITICAL: overdue follow-up ─────────────────────────────────────────
  if (isActive && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()) {
    const days = Math.ceil((now - new Date(lead.nextFollowUpAt).getTime()) / DAY);
    items.push({
      id: "overdue-followup",
      action: "Send Follow-up",
      priority: "critical",
      reason: `Follow-up is ${days} day${days !== 1 ? "s" : ""} overdue — draft and send immediately`,
      requiredData: ["Client email", "Previous conversation context"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 8,
      status: "available",
    });
  }

  // ── 2. CRITICAL: review discovery before proposal ──────────────────────────
  if (isActive && lead.discoverySubmissionId && lead.proposalStatus === "Not Started" && !lead.generatedProposal) {
    items.push({
      id: "review-discovery",
      action: "Review Discovery Form",
      priority: "critical",
      reason: "Client submitted a discovery form — review it before generating a proposal",
      requiredData: ["Discovery submission access"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 15,
      status: "available",
    });
  }

  // ── 3. HIGH: proposal draft ready — review & send ─────────────────────────
  if (isActive && lead.generatedProposal && lead.proposalStatus === "Draft") {
    items.push({
      id: "review-send-proposal",
      action: "Review & Send Proposal",
      priority: "high",
      reason: "Proposal draft is ready — every day unsent reduces close probability",
      requiredData: ["Proposal draft", "Client email"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 10,
      status: lead.email ? "available" : "blocked",
      blockedReason: lead.email ? undefined : "Missing client email address",
    });
  }

  // ── 4. HIGH: generate proposal ────────────────────────────────────────────
  if (isActive && lead.proposalStatus === "Not Started" && !lead.generatedProposal) {
    const hasEnoughInfo = !!(lead.estimatedValue || lead.serviceInterest || lead.discoverySubmissionId);
    items.push({
      id: "generate-proposal",
      action: "Generate Proposal",
      priority: lead.discoverySubmissionId ? "high" : "medium",
      reason: hasEnoughInfo
        ? "Active lead with no proposal — generate one from available information"
        : "Lead lacks enough data for a complete proposal — gather more first",
      requiredData: ["Service interest", "Budget range", "Discovery data"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 20,
      status: hasEnoughInfo ? "available" : "blocked",
      blockedReason: hasEnoughInfo ? undefined : "Missing service interest or estimated value",
    });
  }

  // ── 5. HIGH: generate SOW ─────────────────────────────────────────────────
  if (isActive && ["Sent", "Signed"].includes(lead.proposalStatus) && !lead.generatedSow) {
    items.push({
      id: "generate-sow",
      action: "Generate Scope of Work",
      priority: lead.proposalStatus === "Signed" ? "critical" : "high",
      reason: lead.proposalStatus === "Signed"
        ? "Proposal is signed — generate the SOW immediately to define project scope"
        : "Proposal is in client hands — prepare SOW while awaiting approval",
      requiredData: ["Proposal content", "Service scope", "Project timeline"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 25,
      status: "available",
    });
  }

  // ── 6. HIGH: draft proposal follow-up (5+ days since sent, no response) ───
  if (isActive && (lead.proposalStatus === "Sent" || lead.status === "Proposal Sent")) {
    const lastAct = activities[0];
    const daysSince = lastAct
      ? (now - new Date(lastAct.createdAt).getTime()) / DAY
      : Infinity;
    if (daysSince >= 5) {
      items.push({
        id: "draft-followup-email",
        action: "Draft Follow-up Email",
        priority: daysSince >= 10 ? "high" : "medium",
        reason: `Proposal sent — no response in ${Math.floor(daysSince)} days. Draft a gentle check-in`,
        requiredData: ["Client email", "Proposal details"],
        recommendedOwner: "Sales Rep",
        estimatedMinutes: 10,
        status: "available",
      });
    }
  }

  // ── 7. HIGH: schedule closing call (negotiating) ──────────────────────────
  if (lead.status === "Negotiating") {
    items.push({
      id: "schedule-closing-call",
      action: "Schedule Closing Call",
      priority: "high",
      reason: "Lead is in active negotiation — schedule a call to close the deal",
      requiredData: ["Client availability", "Decision maker contact"],
      recommendedOwner: "Senior Sales Rep",
      estimatedMinutes: 5,
      status: "available",
    });
  }

  // ── 8. MEDIUM: request discovery form ─────────────────────────────────────
  if (
    isActive &&
    !lead.discoverySubmissionId &&
    lead.proposalStatus === "Not Started" &&
    lead.email &&
    lead.lastContactedAt &&
    !lead.generatedProposal
  ) {
    items.push({
      id: "request-discovery",
      action: "Request Discovery Form",
      priority: "medium",
      reason: "No discovery data collected — send the form to qualify this lead properly",
      requiredData: ["Client email", "Discovery form link"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 5,
      status: "available",
    });
  }

  // ── 9. MEDIUM: create follow-up task ──────────────────────────────────────
  const hasPendingTask = tasks.some(
    t => t.status !== "completed" && t.dueDate && new Date(t.dueDate) > new Date(),
  );
  const hasUpcomingFollowup = !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) > new Date();
  if (isActive && !hasPendingTask && !hasUpcomingFollowup) {
    items.push({
      id: "create-followup-task",
      action: "Create Follow-up Task",
      priority: "medium",
      reason: "No upcoming task or follow-up scheduled — set the next action",
      requiredData: ["Task type", "Due date"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 3,
      status: "available",
    });
  }

  // ── 10. MEDIUM: never contacted ───────────────────────────────────────────
  const hasContact =
    !!lead.lastContactedAt ||
    activities.some(a =>
      ["email_sent", "sms_sent", "call_initiated", "call_received", "sms_received"].includes(a.type),
    );
  if (isActive && !hasContact) {
    items.push({
      id: "first-outreach",
      action: "Send First Outreach",
      priority: "high",
      reason: "Lead has never been contacted — start the relationship",
      requiredData: ["Email address"],
      recommendedOwner: "Sales Rep",
      estimatedMinutes: 8,
      status: lead.email ? "available" : "blocked",
      blockedReason: lead.email ? undefined : "Missing email address",
    });
  }

  // ── 11. MEDIUM/HIGH: kickoff (won) ────────────────────────────────────────
  if (lead.status === "Won") {
    items.push({
      id: "schedule-kickoff",
      action: "Schedule Project Kickoff",
      priority: "high",
      reason: "Deal is won — schedule the kickoff to start the project on a strong note",
      requiredData: ["Client calendar access", "Internal team availability"],
      recommendedOwner: "Project Manager",
      estimatedMinutes: 10,
      status: "available",
    });
  }

  const sorted = sortItems(items);
  return {
    items: sorted,
    availableCount: sorted.filter(i => i.status === "available").length,
    blockedCount: sorted.filter(i => i.status === "blocked").length,
    topItem: sorted.find(i => i.status === "available") ?? sorted[0] ?? null,
  };
}

// ── computeAutomationSuggestions ─────────────────────────────────────────────

/**
 * Returns 3–5 quick-win suggestions for a lead, ordered by effort.
 */
export function computeAutomationSuggestions(
  lead: AuLead,
  activities: SiActivity[],
  tasks: SiTask[],
): AutomationSuggestion[] {
  const suggestions: AutomationSuggestion[] = [];

  if (!lead.nextFollowUpAt && !["Won", "Lost"].includes(lead.status)) {
    suggestions.push({
      action: "Schedule next follow-up date",
      why: "No planned next action — lead will drift without a set date",
      impact: "Scheduled follow-ups dramatically reduce lead attrition",
      effort: "low",
    });
  }

  if ((!lead.notes || lead.notes === "[]" || lead.notes.trim() === "") && lead.lastContactedAt) {
    suggestions.push({
      action: "Add sales notes",
      why: "No context captured for this lead",
      impact: "Notes protect pipeline continuity and help future handoffs",
      effort: "low",
    });
  }

  if (!lead.discoverySubmissionId && lead.email && lead.lastContactedAt) {
    suggestions.push({
      action: "Send discovery form link",
      why: "You've made contact but haven't collected structured requirements",
      impact: "Enables a tailored, high-converting proposal",
      effort: "low",
    });
  }

  if (lead.proposalStatus === "Not Started" && lead.lastContactedAt && !lead.generatedProposal) {
    suggestions.push({
      action: "Generate a proposal",
      why: "Active lead with no proposal — you're losing conversion time",
      impact: "A concrete proposal accelerates decision-making",
      effort: "medium",
    });
  }

  if (["Sent", "Signed"].includes(lead.proposalStatus) && !lead.generatedSow) {
    suggestions.push({
      action: "Generate Scope of Work",
      why: "Proposal is in client hands — now define deliverables to build trust",
      impact: "SOW reduces negotiation friction and scope creep",
      effort: "medium",
    });
  }

  if (!lead.estimatedValue) {
    suggestions.push({
      action: "Add budget / estimated value",
      why: "No deal value recorded — affects priority scoring and reporting",
      impact: "Enables accurate pipeline value tracking",
      effort: "low",
    });
  }

  return suggestions.slice(0, 5);
}

// ── computeLeadReadiness ──────────────────────────────────────────────────────

/**
 * Computes 4 readiness gates. Each gate explains what's complete, what's
 * missing, and what the next action is.
 */
export function computeLeadReadiness(
  lead: AuLead,
  activities: SiActivity[],
  tasks: SiTask[],
): LeadReadiness {
  const now = Date.now();
  const STAGES_ORDER = [
    "New", "Contacted", "Follow-up", "Proposal Sent", "Negotiating", "Won", "Lost", "Nurture",
  ];
  const stageIndex = STAGES_ORDER.indexOf(lead.status);

  // ── Sales Ready ───────────────────────────────────────────────────────────
  const srComplete: string[] = [];
  const srMissing: string[] = [];
  if (lead.email) srComplete.push("Email address on file"); else srMissing.push("No email address");
  if (lead.lastContactedAt) srComplete.push("Contact recorded"); else srMissing.push("Never contacted");
  if (stageIndex >= 1) srComplete.push(`Stage: ${lead.status}`); else srMissing.push("Status still 'New' — not qualified");
  if (lead.estimatedValue) srComplete.push("Deal value estimated"); else srMissing.push("No estimated value");
  const srScore = Math.round((srComplete.length / (srComplete.length + srMissing.length)) * 100);
  const salesReady: ReadinessStatus = {
    gate: "Sales Ready",
    ready: srScore >= 75,
    score: srScore,
    complete: srComplete,
    missing: srMissing,
    nextAction: srMissing.length === 0
      ? "Lead is sales-ready — move to qualification"
      : srMissing[0].replace("No ", "Add ").replace("Never ", "Make first contact — "),
  };

  // ── Proposal Ready ────────────────────────────────────────────────────────
  const prComplete: string[] = [];
  const prMissing: string[] = [];
  if (lead.email) prComplete.push("Email address"); else prMissing.push("No email to send proposal to");
  if (lead.serviceInterest) prComplete.push("Service interest identified"); else prMissing.push("Service interest unknown");
  if (lead.estimatedValue) prComplete.push("Budget range defined"); else prMissing.push("No budget estimate");
  if (lead.discoverySubmissionId) prComplete.push("Discovery form completed"); else prMissing.push("No discovery form");
  if (stageIndex >= 1 && stageIndex <= 4) prComplete.push(`Active stage: ${lead.status}`);
  else prMissing.push(lead.status === "New" ? "Lead not yet qualified" : "Lead is closed");
  if (lead.lastContactedAt) prComplete.push("Prior contact established"); else prMissing.push("No prior contact");
  const prScore = Math.round((prComplete.length / (prComplete.length + prMissing.length)) * 100);
  const proposalReady: ReadinessStatus = {
    gate: "Proposal Ready",
    ready: prScore >= 60,
    score: prScore,
    complete: prComplete,
    missing: prMissing,
    nextAction: lead.generatedProposal
      ? "Draft exists — review and send"
      : prMissing.length === 0
      ? "All clear — generate proposal now"
      : `Resolve: ${prMissing[0]}`,
  };

  // ── Contract Ready ────────────────────────────────────────────────────────
  const crComplete: string[] = [];
  const crMissing: string[] = [];
  if (["Sent", "Signed"].includes(lead.proposalStatus)) crComplete.push("Proposal delivered");
  else crMissing.push("Proposal not yet sent");
  if (lead.generatedProposal) crComplete.push("Proposal document ready");
  else crMissing.push("No proposal generated");
  if (lead.generatedSow) crComplete.push("SOW ready");
  else crMissing.push("SOW not generated");
  if (["Negotiating", "Proposal Sent"].includes(lead.status)) crComplete.push("Active negotiation");
  else crMissing.push("Not in negotiation stage");
  if (lead.lastContactedAt) {
    const days = (now - new Date(lead.lastContactedAt).getTime()) / DAY;
    if (days < 14) crComplete.push("Recently engaged");
    else crMissing.push("No contact in 14+ days");
  } else {
    crMissing.push("No contact recorded");
  }
  const crScore = Math.round((crComplete.length / (crComplete.length + crMissing.length)) * 100);
  const contractReady: ReadinessStatus = {
    gate: "Contract Ready",
    ready: crScore >= 60,
    score: crScore,
    complete: crComplete,
    missing: crMissing,
    nextAction: lead.proposalStatus === "Signed"
      ? "Proposal signed — generate SOW and schedule kickoff"
      : crMissing.includes("SOW not generated")
      ? "Generate the Scope of Work"
      : crMissing.length > 0
      ? `Resolve: ${crMissing[0]}`
      : "All clear — push to close",
  };

  // ── Onboarding Ready ──────────────────────────────────────────────────────
  const orComplete: string[] = [];
  const orMissing: string[] = [];
  if (lead.status === "Won") orComplete.push("Deal marked Won");
  else orMissing.push("Deal not yet closed");
  if (lead.generatedProposal) orComplete.push("Proposal on record");
  else orMissing.push("No proposal document");
  if (lead.generatedSow) orComplete.push("Scope of Work defined");
  else orMissing.push("No SOW generated");
  if (lead.lastContactedAt) orComplete.push("Client communication established");
  else orMissing.push("No client contact recorded");
  const orScore = Math.round((orComplete.length / (orComplete.length + orMissing.length)) * 100);
  const onboardingReady: ReadinessStatus = {
    gate: "Onboarding Ready",
    ready: lead.status === "Won" && orScore >= 75,
    score: orScore,
    complete: orComplete,
    missing: orMissing,
    nextAction: lead.status !== "Won"
      ? "Close the deal first"
      : orMissing.length > 0
      ? `Resolve: ${orMissing[0]}`
      : "Schedule project kickoff meeting",
  };

  const overallScore = Math.round((srScore + prScore + crScore + orScore) / 4);

  return { salesReady, proposalReady, contractReady, onboardingReady, overallScore };
}

// ── computeRequiredDocuments ──────────────────────────────────────────────────

/**
 * Returns the status of the 3 key pipeline documents.
 */
export function computeRequiredDocuments(lead: AuLead): RequiredDocument[] {
  return [
    {
      name: "Discovery Form",
      status: lead.discoverySubmissionId ? "complete" : "missing",
      importance: "high",
      action: lead.discoverySubmissionId
        ? "Review the submitted discovery form"
        : "Send discovery form link to client",
    },
    {
      name: "Proposal",
      status: lead.generatedProposal
        ? lead.proposalStatus === "Draft"
          ? "draft"
          : "complete"
        : "missing",
      importance: "critical",
      action: !lead.generatedProposal
        ? "Generate proposal from lead information"
        : lead.proposalStatus === "Draft"
        ? "Review and send the draft proposal"
        : lead.proposalStatus === "Sent"
        ? "Follow up to get a decision"
        : "Proposal accepted — proceed to SOW",
    },
    {
      name: "Scope of Work",
      status: lead.generatedSow ? "complete" : "missing",
      importance: lead.proposalStatus === "Signed" ? "critical" : "high",
      action: !lead.generatedSow
        ? lead.proposalStatus === "Not Started"
          ? "Generate proposal first, then create SOW"
          : "Generate the Scope of Work document"
        : "SOW complete — review and deliver to client",
    },
  ];
}

// ── computeMissingInformation ─────────────────────────────────────────────────

/**
 * Identifies missing lead fields and explains their impact.
 */
export function computeMissingInformation(lead: AuLead): MissingInformation {
  const fields: MissingField[] = [];

  if (!lead.email) {
    fields.push({
      field: "Email Address",
      importance: "critical",
      impact: "Cannot send proposals, follow-ups, or any written communication",
      recommendation: "Request email address via phone or referral contact",
    });
  }

  if (!lead.phone) {
    fields.push({
      field: "Phone Number",
      importance: "high",
      impact: "Cannot make calls or send SMS — limits real-time communication",
      recommendation: "Ask for phone number in next email contact",
    });
  }

  if (!lead.estimatedValue) {
    fields.push({
      field: "Budget / Estimated Value",
      importance: "high",
      impact: "Cannot calculate deal priority or generate an accurate proposal",
      recommendation: "Ask about budget range in next conversation or discovery form",
    });
  }

  if (!lead.serviceInterest) {
    fields.push({
      field: "Service Interest",
      importance: "high",
      impact: "Unclear what solution to propose — risk of generic, low-converting pitch",
      recommendation: "Qualify the service need in the next touchpoint",
    });
  }

  if (!lead.discoverySubmissionId) {
    fields.push({
      field: "Discovery Form",
      importance: "high",
      impact: "Missing client requirements — proposal will lack specificity",
      recommendation: "Send discovery form link and ask lead to complete before proposal call",
    });
  }

  if (!lead.lastContactedAt && !["Won", "Lost"].includes(lead.status)) {
    fields.push({
      field: "Contact History",
      importance: "high",
      impact: "No recorded contact — cannot assess lead interest or engagement level",
      recommendation: "Log first outreach attempt in the activity feed",
    });
  }

  if (!lead.nextFollowUpAt && !["Won", "Lost"].includes(lead.status)) {
    fields.push({
      field: "Follow-up Date",
      importance: "medium",
      impact: "No planned next action — lead may go cold without a scheduled touchpoint",
      recommendation: "Set a follow-up date to maintain pipeline momentum",
    });
  }

  if (
    !lead.notes ||
    lead.notes === "[]" ||
    lead.notes.trim() === ""
  ) {
    fields.push({
      field: "Sales Notes",
      importance: "medium",
      impact: "No context captured — future rep starts from zero",
      recommendation: "Add a brief summary of conversations, objections, and interests",
    });
  }

  if (lead.phone && lead.smsConsent === undefined) {
    fields.push({
      field: "SMS Consent",
      importance: "medium",
      impact: "Cannot send text messages without consent — reduces communication options",
      recommendation: "Request SMS permission in next phone or email contact",
    });
  }

  let score = 100;
  for (const f of fields) {
    score -= f.importance === "critical" ? 25 : f.importance === "high" ? 15 : 8;
  }

  return {
    fields,
    completenessScore: Math.max(0, score),
    criticalCount: fields.filter(f => f.importance === "critical").length,
    highCount: fields.filter(f => f.importance === "high").length,
  };
}

// ── computeRecommendedSequence ────────────────────────────────────────────────

/**
 * Generates a 10-step sales sequence. Each step explains WHY it matters.
 * Steps are marked completed/current/pending/blocked based on lead state.
 */
export function computeRecommendedSequence(
  lead: AuLead,
  activities: SiActivity[],
  tasks: SiTask[],
): RecommendedSequence {
  const CONTACT_TYPES = ["email_sent", "sms_sent", "call_initiated", "call_received", "sms_received"];
  const hasContact =
    !!lead.lastContactedAt ||
    activities.some(a => CONTACT_TYPES.includes(a.type));
  const isQualified = !!(lead.estimatedValue && lead.serviceInterest);
  const hasDiscovery = !!lead.discoverySubmissionId;
  const hasProposalDraft = !!lead.generatedProposal;
  const hasProposalSent =
    ["Sent", "Signed"].includes(lead.proposalStatus) || lead.status === "Proposal Sent";
  const hasProposalSigned = lead.proposalStatus === "Signed";
  const hasSOW = !!lead.generatedSow;
  const isNegotiating = lead.status === "Negotiating";
  const isWon = lead.status === "Won";
  const isLost = lead.status === "Lost";

  const done = (flag: boolean) => (flag ? "completed" : "pending") as SequenceStep["status"];

  const steps: SequenceStep[] = [
    {
      step: 1,
      action: "Initial Outreach",
      why: "Start the relationship and confirm the lead is a real opportunity",
      status: hasContact ? "completed" : "current",
    },
    {
      step: 2,
      action: "Qualify the Lead",
      why: "Understand budget, timeline, and decision-making process before investing time",
      status: hasContact && isQualified ? "completed" : hasContact ? "current" : "pending",
    },
    {
      step: 3,
      action: "Send Discovery Form",
      why: "Gather structured requirements to build a precise, tailored proposal",
      status: hasDiscovery ? "completed" : isQualified ? "current" : "pending",
    },
    {
      step: 4,
      action: "Review Discovery",
      why: "Understand the client's needs in detail before drafting — prevents revisions later",
      status: hasDiscovery && hasProposalDraft ? "completed" : hasDiscovery ? "current" : "pending",
    },
    {
      step: 5,
      action: "Generate Proposal",
      why: "A concrete proposal gives the client a decision to make and accelerates the sale",
      status: hasProposalDraft ? "completed" : hasDiscovery || isQualified ? "current" : "pending",
    },
    {
      step: 6,
      action: "Review & Send Proposal",
      why: "Every day the proposal sits unsent is a day the client evaluates other options",
      status: hasProposalSent ? "completed" : hasProposalDraft ? "current" : "pending",
    },
    {
      step: 7,
      action: "Follow-up (3 days post-proposal)",
      why: "Most sales are won on the follow-up — don't wait for the client to reach out",
      waitDays: 3,
      status: hasProposalSent && isNegotiating ? "completed"
             : hasProposalSent ? "current"
             : "pending",
    },
    {
      step: 8,
      action: "Generate Scope of Work",
      why: "Defines deliverables clearly — reduces negotiation friction and scope creep",
      status: hasSOW ? "completed" : hasProposalSent ? "current" : "pending",
    },
    {
      step: 9,
      action: "Schedule Closing Call",
      why: "A live conversation resolves final objections faster than email",
      status: isWon ? "completed" : hasSOW && isNegotiating ? "current" : "pending",
    },
    {
      step: 10,
      action: "Close & Schedule Kickoff",
      why: "A strong kickoff builds client confidence and sets clear project expectations",
      status: isWon ? "current" : "pending",
    },
  ];

  if (isLost) {
    steps.forEach(s => {
      if (s.status !== "completed") {
        s.status = "blocked";
        s.blockReason = "Lead marked Lost";
      }
    });
  }

  const currentStep = steps.find(s => s.status === "current");
  const currentStepNum = currentStep?.step ?? (isWon ? 10 : 1);

  const remaining = steps.filter(s => s.status === "pending" || s.status === "current");
  const estimateDays = remaining.reduce((sum, s) => sum + (s.waitDays ?? 0) + 2, 0);

  return {
    currentStep: currentStepNum,
    totalSteps: steps.length,
    steps,
    nextAction: currentStep?.action ?? (isWon ? "Project active — maintain relationship" : "Start outreach"),
    completionEstimateDays: Math.max(0, estimateDays),
  };
}
