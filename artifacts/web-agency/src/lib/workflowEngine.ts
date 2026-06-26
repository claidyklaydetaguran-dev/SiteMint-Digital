// ── Workflow Engine ──────────────────────────────────────────────────────────
// Pure TypeScript utility — no React, no API calls, no side effects.
// Used by: Sales Workspace (per-lead timeline + next action)
//          CRM Dashboard (Workflow Queue)
//          Any future module that needs workflow state.

// ── Shared minimal types ──────────────────────────────────────────────────────

export interface WeLead {
  id: number;
  name: string;
  status: string;
  source: string;
  proposalStatus: string;
  sowStatus: string;
  generatedProposal?: string | null;
  generatedSow?: string | null;
  discoverySubmissionId?: number | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  estimatedValue?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeActivity {
  id: number;
  type: string;
  title: string;
  description?: string;
  createdAt: string;
}

export interface WeTask {
  id: number;
  type: string;
  title: string;
  status: string;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

// ── WorkflowStep ──────────────────────────────────────────────────────────────

export type WorkflowStepStatus = "completed" | "active" | "pending" | "skipped";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  completed: boolean;
  completedAt?: string;
  completedBy: string;
  source: string;
  recommendedAction?: string;
}

// ── NextBestAction ────────────────────────────────────────────────────────────

export type ActionPriority = "critical" | "high" | "medium" | "low";

export interface NextBestAction {
  id: string;
  title: string;
  description: string;
  reason: string;
  priority: ActionPriority;
  actionLabel: string;
  actionHint?: string;
  tab?: string;
}

// ── WorkflowQueueGroup ────────────────────────────────────────────────────────

export interface WeQueueLead {
  id: number;
  name: string;
  company?: string;
  status: string;
  proposalStatus: string;
  sowStatus: string;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  estimatedValue?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface WorkflowQueueGroup {
  id: string;
  label: string;
  emoji: string;
  description: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  count: number;
  topLeads: WeQueueLead[];
}

// ── Step definitions ──────────────────────────────────────────────────────────

interface StepDef {
  id: string;
  title: string;
  description: string;
  completedBy: string;
  source: string;
  recommendedAction: string;
  check: (lead: WeLead, activities: WeActivity[], tasks: WeTask[]) => boolean;
  getTimestamp: (lead: WeLead, activities: WeActivity[]) => string | undefined;
}

const CONTACT_TYPES = ["email_sent", "sms_sent", "sms_attempted", "call_initiated", "call_received"];

const STEP_DEFS: StepDef[] = [
  {
    id: "lead_created",
    title: "Lead Created",
    description: "Lead entered the CRM system",
    completedBy: "System",
    source: "crm",
    recommendedAction: "Make first contact",
    check: () => true,
    getTimestamp: (lead, activities) =>
      activities.find(a => a.type === "lead_created")?.createdAt ?? lead.createdAt,
  },
  {
    id: "discovery_submitted",
    title: "Discovery Form Submitted",
    description: "Client submitted the discovery intake form",
    completedBy: "Client",
    source: "discovery",
    recommendedAction: "Review the discovery submission",
    check: (lead, activities) =>
      !!lead.discoverySubmissionId ||
      activities.some(a => a.type === "lead_imported" && a.description?.includes("discovery")),
    getTimestamp: (lead, activities) =>
      activities.find(a => a.type === "lead_imported")?.createdAt,
  },
  {
    id: "first_contact",
    title: "First Contact Made",
    description: "Initial outreach to client completed",
    completedBy: "Team",
    source: "crm",
    recommendedAction: "Send an introductory email or call",
    check: (lead, activities) =>
      !!lead.lastContactedAt ||
      activities.some(a => CONTACT_TYPES.includes(a.type)),
    getTimestamp: (lead, activities) => {
      const contacts = activities.filter(a => CONTACT_TYPES.includes(a.type));
      if (contacts.length > 0) {
        return [...contacts].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0].createdAt;
      }
      return lead.lastContactedAt ?? undefined;
    },
  },
  {
    id: "proposal_generated",
    title: "Proposal Generated",
    description: "Proposal document created for client",
    completedBy: "Team",
    source: "sales_workspace",
    recommendedAction: "Generate proposal from the Proposal tab",
    check: (lead, activities) =>
      !!lead.generatedProposal ||
      activities.some(a => a.type === "proposal_generated"),
    getTimestamp: (lead, activities) =>
      activities.find(a => a.type === "proposal_generated")?.createdAt,
  },
  {
    id: "proposal_sent",
    title: "Proposal Sent",
    description: "Proposal delivered to client for review",
    completedBy: "Team",
    source: "crm",
    recommendedAction: "Mark proposal status as Sent in the Proposal tab",
    check: (lead) =>
      ["Sent", "Signed"].includes(lead.proposalStatus) || lead.status === "Proposal Sent",
    getTimestamp: (lead, activities) =>
      activities.find(
        a => a.type === "status_changed" && a.description?.includes("Proposal Sent"),
      )?.createdAt,
  },
  {
    id: "sow_generated",
    title: "Scope of Work Generated",
    description: "SOW document created outlining project deliverables",
    completedBy: "Team",
    source: "sales_workspace",
    recommendedAction: "Generate SOW from the Scope of Work tab",
    check: (lead, activities) =>
      !!lead.generatedSow || activities.some(a => a.type === "sow_generated"),
    getTimestamp: (lead, activities) =>
      activities.find(a => a.type === "sow_generated")?.createdAt,
  },
  {
    id: "negotiating",
    title: "Negotiating",
    description: "Active negotiation with client on terms and pricing",
    completedBy: "Team",
    source: "crm",
    recommendedAction: "Move lead status to Negotiating",
    check: (lead) =>
      ["Negotiating", "Won"].includes(lead.status) || lead.proposalStatus === "Signed",
    getTimestamp: (lead, activities) =>
      activities.find(
        a => a.type === "status_changed" && a.description?.includes("To: Negotiating"),
      )?.createdAt,
  },
  {
    id: "deal_won",
    title: "Project Won 🎉",
    description: "Client confirmed — project is ready to begin",
    completedBy: "Team",
    source: "crm",
    recommendedAction: "Update lead status to Won and schedule kickoff",
    check: (lead) => lead.status === "Won",
    getTimestamp: (lead, activities) =>
      activities.find(
        a => a.type === "status_changed" && a.description?.includes("To: Won"),
      )?.createdAt,
  },
];

// ── computeWorkflowSteps ──────────────────────────────────────────────────────

export function computeWorkflowSteps(
  lead: WeLead,
  activities: WeActivity[],
  tasks: WeTask[],
): WorkflowStep[] {
  const isLost = lead.status === "Lost";
  let foundFirstIncomplete = false;

  return STEP_DEFS.map(def => {
    const completed = def.check(lead, activities, tasks);
    const ts = completed ? def.getTimestamp(lead, activities) : undefined;

    let status: WorkflowStepStatus;
    if (isLost) {
      status = completed ? "completed" : "skipped";
    } else if (completed) {
      status = "completed";
    } else if (!foundFirstIncomplete) {
      status = "active";
      foundFirstIncomplete = true;
    } else {
      status = "pending";
    }

    return {
      id: def.id,
      title: def.title,
      description: def.description,
      status,
      completed,
      completedAt: ts,
      completedBy: completed ? def.completedBy : "",
      source: def.source,
      recommendedAction: !completed ? def.recommendedAction : undefined,
    };
  });
}

// ── Rule engine ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

interface Rule {
  id: string;
  priority: number;
  condition: (lead: WeLead, activities: WeActivity[], tasks: WeTask[], steps: WorkflowStep[]) => boolean;
  build: (lead: WeLead, activities: WeActivity[], tasks: WeTask[], steps: WorkflowStep[]) => NextBestAction;
}

const RULES: Rule[] = [
  {
    id: "lead_won",
    priority: 0,
    condition: l => l.status === "Won",
    build: () => ({
      id: "schedule_kickoff",
      title: "Schedule Project Kickoff",
      description: "This lead has been won. Schedule the kickoff meeting to officially start the project.",
      reason: "Lead status is Won",
      priority: "high",
      actionLabel: "Schedule Kickoff Meeting",
      actionHint: "Best practice: send the kickoff invite within 24 hours of winning the deal.",
    }),
  },
  {
    id: "lead_lost",
    priority: 1,
    condition: l => l.status === "Lost",
    build: () => ({
      id: "lost_review",
      title: "Lead Marked Lost",
      description: "Consider whether this lead should be placed in a nurture campaign for future re-engagement.",
      reason: "Lead status is Lost",
      priority: "low",
      actionLabel: "Move to Nurture",
      actionHint: "Re-engage in 60–90 days if their timeline or budget changes.",
    }),
  },
  {
    id: "overdue_followup",
    priority: 2,
    condition: l =>
      !!l.nextFollowUpAt &&
      new Date(l.nextFollowUpAt) < new Date() &&
      !["Won", "Lost"].includes(l.status),
    build: l => ({
      id: "follow_up_now",
      title: "Follow Up Immediately",
      description: `Follow-up was due on ${new Date(l.nextFollowUpAt!).toLocaleDateString()}. Contact this lead now before they go cold.`,
      reason: "Follow-up date has passed",
      priority: "critical",
      actionLabel: "Call or Email Now",
      actionHint: "Late follow-ups significantly reduce close rates.",
    }),
  },
  {
    id: "followup_today",
    priority: 3,
    condition: l =>
      !!l.nextFollowUpAt &&
      new Date(l.nextFollowUpAt).toDateString() === new Date().toDateString() &&
      !["Won", "Lost"].includes(l.status),
    build: () => ({
      id: "contact_today",
      title: "Follow-Up Due Today",
      description: "A follow-up is scheduled for today. Reach out now while the timing is right.",
      reason: "Follow-up is due today",
      priority: "high",
      actionLabel: "Contact Now",
    }),
  },
  {
    id: "proposal_waiting_long",
    priority: 4,
    condition: (l, activities) => {
      if (l.proposalStatus !== "Sent" && l.status !== "Proposal Sent") return false;
      const mostRecent = activities[0];
      if (!mostRecent) return true;
      return Date.now() - new Date(mostRecent.createdAt).getTime() > 7 * DAY_MS;
    },
    build: () => ({
      id: "follow_up_proposal",
      title: "Follow Up on Proposal",
      description: "Proposal has been waiting 7+ days without any activity. Time to check in with the client.",
      reason: "Proposal sent but no response or activity in 7 days",
      priority: "high",
      actionLabel: "Send Follow-up Email",
      tab: "proposal",
    }),
  },
  {
    id: "no_proposal",
    priority: 5,
    condition: l =>
      !l.generatedProposal &&
      l.proposalStatus === "Not Started" &&
      !["Won", "Lost"].includes(l.status),
    build: () => ({
      id: "generate_proposal",
      title: "Generate Proposal",
      description: "No proposal has been created yet. Generate one from the Sales Workspace to move this lead forward.",
      reason: "Proposal status is Not Started",
      priority: "high",
      actionLabel: "Go to Proposal Tab",
      tab: "proposal",
    }),
  },
  {
    id: "proposal_draft",
    priority: 6,
    condition: l => l.proposalStatus === "Draft" && !["Won", "Lost"].includes(l.status),
    build: () => ({
      id: "send_proposal",
      title: "Send Proposal to Client",
      description: "Proposal is drafted and ready. Review it, then send it to the client.",
      reason: "Proposal is in Draft status",
      priority: "high",
      actionLabel: "Preview & Send Proposal",
      tab: "proposal",
    }),
  },
  {
    id: "no_sow_after_proposal",
    priority: 7,
    condition: l =>
      !!l.generatedProposal &&
      !l.generatedSow &&
      ["Sent", "Signed"].includes(l.proposalStatus),
    build: () => ({
      id: "generate_sow",
      title: "Generate Scope of Work",
      description: "Proposal is out — create the SOW to define deliverables, timeline, and milestones.",
      reason: "Proposal sent but no SOW created yet",
      priority: "medium",
      actionLabel: "Go to Scope of Work Tab",
      tab: "sow",
    }),
  },
  {
    id: "no_contact",
    priority: 8,
    condition: (l, activities) =>
      !l.lastContactedAt &&
      !activities.some(a => CONTACT_TYPES.includes(a.type)) &&
      !["Won", "Lost"].includes(l.status),
    build: () => ({
      id: "first_contact",
      title: "Make First Contact",
      description: "This lead has never been contacted. Send an intro email or make a call to start the relationship.",
      reason: "No contact activity recorded",
      priority: "high",
      actionLabel: "Send Email or Call",
    }),
  },
  {
    id: "no_followup_scheduled",
    priority: 9,
    condition: l => !l.nextFollowUpAt && !["Won", "Lost"].includes(l.status),
    build: () => ({
      id: "schedule_followup",
      title: "Schedule a Follow-up",
      description: "No follow-up date is set. Add one to keep this lead moving through the pipeline.",
      reason: "No follow-up date scheduled",
      priority: "medium",
      actionLabel: "Set Follow-up Date",
    }),
  },
  {
    id: "long_no_contact",
    priority: 10,
    condition: l =>
      !!l.lastContactedAt &&
      Date.now() - new Date(l.lastContactedAt).getTime() > 14 * DAY_MS &&
      !["Won", "Lost"].includes(l.status),
    build: l => {
      const days = Math.floor((Date.now() - new Date(l.lastContactedAt!).getTime()) / DAY_MS);
      return {
        id: "re_engage",
        title: "Re-engage Lead",
        description: `Last contacted ${days} days ago. Time to check in before this lead goes cold.`,
        reason: `No contact in ${days} days`,
        priority: "medium",
        actionLabel: "Send Check-in Email",
      };
    },
  },
  {
    id: "default",
    priority: 99,
    condition: () => true,
    build: () => ({
      id: "stay_engaged",
      title: "Stay Engaged",
      description: "Keep this lead warm with regular touchpoints and value-add communication.",
      reason: "General engagement — no urgent actions detected",
      priority: "low",
      actionLabel: "View Full Timeline",
      tab: "history",
    }),
  },
];

// ── computeNextBestAction ─────────────────────────────────────────────────────

export function computeNextBestAction(
  lead: WeLead,
  activities: WeActivity[],
  tasks: WeTask[],
  steps: WorkflowStep[],
): NextBestAction {
  for (const rule of RULES) {
    if (rule.condition(lead, activities, tasks, steps)) {
      return rule.build(lead, activities, tasks, steps);
    }
  }
  return RULES[RULES.length - 1].build(lead, [], [], []);
}

// ── computeWorkflowQueue ──────────────────────────────────────────────────────

export function computeWorkflowQueue(leads: WeQueueLead[]): WorkflowQueueGroup[] {
  const now = Date.now();
  const active = leads.filter(l => !["Won", "Lost"].includes(l.status));
  const won30 = leads.filter(
    l => l.status === "Won" && now - new Date(l.updatedAt).getTime() < 30 * DAY_MS,
  );

  function group(
    id: string, label: string, emoji: string, description: string,
    colorClass: string, bgClass: string, borderClass: string,
    filtered: WeQueueLead[],
  ): WorkflowQueueGroup {
    return {
      id, label, emoji, description, colorClass, bgClass, borderClass,
      count: filtered.length,
      topLeads: filtered.slice(0, 4),
    };
  }

  return [
    group(
      "needs_proposal", "Needs Proposal", "📄",
      "Active leads without a proposal",
      "text-orange-700", "bg-orange-50", "border-orange-200",
      active.filter(l => !l.proposalStatus || l.proposalStatus === "Not Started"),
    ),
    group(
      "needs_sow", "Needs SOW", "📋",
      "Proposal sent, SOW not created",
      "text-purple-700", "bg-purple-50", "border-purple-200",
      active.filter(
        l => ["Sent", "Signed"].includes(l.proposalStatus) &&
          (!l.sowStatus || l.sowStatus === "Not Started"),
      ),
    ),
    group(
      "proposal_waiting", "Proposal Waiting", "⏳",
      "Awaiting client response on proposal",
      "text-blue-700", "bg-blue-50", "border-blue-200",
      active.filter(l => l.status === "Proposal Sent" || l.proposalStatus === "Sent"),
    ),
    group(
      "needs_followup", "Needs Follow-up", "📞",
      "Overdue or no follow-up scheduled",
      "text-yellow-700", "bg-yellow-50", "border-yellow-200",
      active.filter(l =>
        !l.lastContactedAt ||
        (now - new Date(l.lastContactedAt).getTime()) > 14 * DAY_MS ||
        (!!l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date()),
      ),
    ),
    group(
      "ready_for_deal", "Ready for Deal", "🤝",
      "In active negotiation",
      "text-green-700", "bg-green-50", "border-green-200",
      leads.filter(l => l.status === "Negotiating"),
    ),
    group(
      "ready_for_kickoff", "Ready for Kickoff", "🚀",
      "Recently won — schedule kickoff",
      "text-emerald-700", "bg-emerald-50", "border-emerald-200",
      won30,
    ),
  ];
}
