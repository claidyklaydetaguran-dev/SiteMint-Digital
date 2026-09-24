import type { CapabilityLevel } from "./capabilityStatus";

/**
 * Synthetic AI Receptionist demonstration content (Checkpoint 2A.2 Part 3).
 * All names/details below are fabricated example data, never real customer
 * information. Keyed by the three scenario names named in the checkpoint
 * brief; businessGoals.ts maps each business goal to one of these ids
 * (`demoScenarioId`) so the demo updates via the same goal-selection
 * interaction rather than introducing a second, competing selector — see
 * the coordination note in businessGoals.ts and Part 7 of the checkpoint.
 */

export interface ReceptionistDemoScenario {
  id: "never-miss-a-call" | "automate-follow-up" | "organize-leads-crm";
  scenarioLabel: string;
  inquiry: {
    name: string;
    channel: string;
    reason: string;
  };
  capturedFields: string[];
  nextAction: string;
  /** SMS intake is the real, working pipeline today (root CLAUDE.md
   * protected-file list). Voice is explicitly a Milestone 1+ in-development
   * track (CLAUDE.md "Voice platform" section). CRM follow-up automation
   * triggered directly from this demo is illustrative only — the CRM itself
   * is real, but this specific automated hand-off is a conceptual
   * demonstration, not a wired behavior. */
  smsCapability: CapabilityLevel;
  voiceCapability: CapabilityLevel;
  crmFollowupCapability: CapabilityLevel;
}

export const receptionistDemoScenarios: Record<string, ReceptionistDemoScenario> = {
  "never-miss-a-call": {
    id: "never-miss-a-call",
    scenarioLabel: "Never Miss a Call",
    inquiry: {
      name: "Jordan Lee",
      channel: "Text message",
      reason: "Needs a consultation next week",
    },
    capturedFields: ["Name", "Contact preference", "Request summary"],
    nextAction: "Review and follow up",
    smsCapability: "available",
    voiceCapability: "in-development",
    crmFollowupCapability: "conceptual",
  },
  "automate-follow-up": {
    id: "automate-follow-up",
    scenarioLabel: "Automate Follow-Up",
    inquiry: {
      name: "Priya Nandan",
      channel: "Text message",
      reason: "Asked about pricing, hasn't replied since",
    },
    capturedFields: ["Name", "Contact preference", "Interest area", "Last contact date"],
    nextAction: "Send a scheduled check-in",
    smsCapability: "available",
    voiceCapability: "in-development",
    crmFollowupCapability: "conceptual",
  },
  "organize-leads-crm": {
    id: "organize-leads-crm",
    scenarioLabel: "Organize Leads in a CRM",
    inquiry: {
      name: "Marcus Ito",
      channel: "Text message",
      reason: "Referred by an existing client, wants to talk this week",
    },
    capturedFields: ["Name", "Contact preference", "Referral source", "Request summary"],
    nextAction: "Assign to a team member in the CRM",
    smsCapability: "available",
    voiceCapability: "in-development",
    crmFollowupCapability: "conceptual",
  },
};

export const defaultReceptionistDemoScenarioId: ReceptionistDemoScenario["id"] = "never-miss-a-call";
