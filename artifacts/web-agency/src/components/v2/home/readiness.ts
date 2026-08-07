/**
 * Frontend V2 Phase 3 — product readiness tiers (binding).
 *
 * CONTENT-SPECIFICATION.md §4.1 and INFORMATION-ARCHITECTURE.md §3 make this
 * labelling mandatory wherever a capability appears. The homepage must visibly
 * distinguish the three tiers, and **must not imply that a production-ready
 * voice capability currently answers every call.**
 *
 * One shared source so a tier cannot be worded differently in two places.
 */

export type ReadinessTier = "available" | "in-development" | "planned";

export const READINESS: Record<ReadinessTier, { label: string; note: string }> = {
  available: {
    label: "Available now",
    note: "In production today.",
  },
  "in-development": {
    label: "In development",
    note: "Being built. Not available to customers yet.",
  },
  planned: {
    label: "Planned",
    note: "A direction we are building toward, not a current capability.",
  },
};

/** The three capabilities the homepage must distinguish, in order. */
export const CAPABILITY_STATUS: Array<{
  capability: string;
  description: string;
  tier: ReadinessTier;
}> = [
  {
    capability: "SMS Receptionist",
    description:
      "Replies to inbound text inquiries, asks the questions the business needs answered, and keeps the conversation in one place.",
    tier: "available",
  },
  {
    capability: "Voice experience",
    description:
      "A spoken version of the same receptionist. It is being built and is not answering customer calls.",
    tier: "in-development",
  },
  {
    capability: "Connected CRM and automated follow-up",
    description:
      "Conversations flowing into a CRM record and follow-up running on its own. This is the direction of the product, not a shipped feature.",
    tier: "planned",
  },
];
