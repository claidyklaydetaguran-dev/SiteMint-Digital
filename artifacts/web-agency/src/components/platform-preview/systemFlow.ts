import {
  BarChart3,
  CalendarCheck,
  Globe,
  Inbox,
  MessageCircle,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CapabilityLevel } from "./capabilityStatus";

/**
 * Single source of truth for the customer-journey narrative used by both
 * EcosystemVisual (the compact "living system" demonstration) and
 * ConnectedWorkflowSection (the detailed step list) — one config, two
 * compositions, per the "no duplicated business-goal content" engineering
 * requirement. `state` uses the exact vocabulary requested for the living
 * system visual (waiting/received/responding/captured/organized/scheduled/
 * visible); `system` names which part of the platform is doing the work, so
 * goal-aware emphasis (see businessGoals.ts) can highlight the right stages
 * without a second data set.
 */

export interface SystemStage {
  id: string;
  label: string;
  note: string;
  state: string;
  /** What the same moment looks like without a connected system — read by
   * the Connected/Disconnected control (Checkpoint 2A.2), shared by
   * EcosystemVisual and SiteMintDifferenceSection so neither hardcodes a
   * second version of this narrative. Deliberately realistic and
   * non-alarmist, not a worst-case scare scenario. */
  disconnectedNote: string;
  disconnectedState: string;
  icon: LucideIcon;
  system: string;
  /** Honest capability labeling (Checkpoint 2A.1) — see capabilityStatus.ts.
   * "visible"/Analytics is "planned": no analytics tool is installed
   * anywhere in the repo today (DESIGN_TOKEN_AUDIT.md §21, PRD §24). Every
   * other stage maps to functionality that genuinely exists per root
   * CLAUDE.md's protected-file list and the CRM route inventory in
   * ROUTE_AND_NAVIGATION_ARCHITECTURE.md. */
  capability: CapabilityLevel;
}

export const systemStages: SystemStage[] = [
  {
    id: "arrive",
    label: "Visitor arrives",
    note: "On your website or a product landing page.",
    state: "Waiting",
    disconnectedNote: "Visitor lands on a page with no clear next step.",
    disconnectedState: "Unclear",
    icon: Globe,
    system: "Website",
    capability: "available",
  },
  {
    id: "capture",
    label: "Inquiry captured",
    note: "Contact, Discovery, or product signup form.",
    state: "Received",
    disconnectedNote: "Inquiry lands in a separate form or inbox, disconnected from everything else.",
    disconnectedState: "Isolated",
    icon: Inbox,
    system: "Website",
    capability: "available",
  },
  {
    id: "respond",
    label: "AI or team responds",
    note: "AI Receptionist or your team follows up.",
    state: "Responding",
    disconnectedNote: "Response waits until a team member has time to check.",
    disconnectedState: "Waiting on staff",
    icon: MessageCircle,
    system: "AI Receptionist",
    capability: "available",
  },
  {
    id: "crm",
    label: "Lead enters CRM",
    note: "Every inquiry becomes a tracked record.",
    state: "Captured",
    disconnectedNote: "Details get copied by hand, if they get recorded at all.",
    disconnectedState: "Manual entry",
    icon: UserPlus,
    system: "CRM",
    capability: "available",
  },
  {
    id: "followup",
    label: "Follow-up begins",
    note: "Automated or manual, nothing sits idle.",
    state: "Organized",
    disconnectedNote: "Follow-up depends on someone remembering to do it.",
    disconnectedState: "Depends on memory",
    icon: Workflow,
    system: "Automation",
    capability: "available",
  },
  {
    id: "action",
    label: "Appointment or next action",
    note: "The lead moves toward a real outcome.",
    state: "Scheduled",
    disconnectedNote: "Next steps stall without a system prompting anyone.",
    disconnectedState: "Stalled",
    icon: CalendarCheck,
    system: "Automation",
    capability: "in-development",
  },
  {
    id: "visible",
    label: "Visible to the team",
    note: "Every touchpoint is visible in one place.",
    state: "Visible",
    disconnectedNote: "Management has limited visibility into what actually happened.",
    disconnectedState: "Limited visibility",
    icon: BarChart3,
    system: "Analytics",
    capability: "planned",
  },
];
