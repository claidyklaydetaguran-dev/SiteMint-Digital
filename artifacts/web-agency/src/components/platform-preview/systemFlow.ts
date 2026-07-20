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
    icon: Globe,
    system: "Website",
    capability: "available",
  },
  {
    id: "capture",
    label: "Inquiry captured",
    note: "Contact, Discovery, or product signup form.",
    state: "Received",
    icon: Inbox,
    system: "Website",
    capability: "available",
  },
  {
    id: "respond",
    label: "AI or team responds",
    note: "AI Receptionist or your team follows up.",
    state: "Responding",
    icon: MessageCircle,
    system: "AI Receptionist",
    capability: "available",
  },
  {
    id: "crm",
    label: "Lead enters CRM",
    note: "Every inquiry becomes a tracked record.",
    state: "Captured",
    icon: UserPlus,
    system: "CRM",
    capability: "available",
  },
  {
    id: "followup",
    label: "Follow-up begins",
    note: "Automated or manual, nothing sits idle.",
    state: "Organized",
    icon: Workflow,
    system: "Automation",
    capability: "available",
  },
  {
    id: "action",
    label: "Appointment or next action",
    note: "The lead moves toward a real outcome.",
    state: "Scheduled",
    icon: CalendarCheck,
    system: "Automation",
    capability: "in-development",
  },
  {
    id: "visible",
    label: "Visible to the team",
    note: "Every touchpoint is visible in one place.",
    state: "Visible",
    icon: BarChart3,
    system: "Analytics",
    capability: "planned",
  },
];
