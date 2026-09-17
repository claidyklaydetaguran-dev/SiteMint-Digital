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
    capability: "Voice receptionist",
    description:
      "Answers calls in a natural voice, takes messages with what the caller needs, and emails you a summary. You can test it in your browser before connecting a number.",
    tier: "available",
  },
  {
    capability: "Appointment booking and team access",
    description:
      "Books an appointment into your connected calendar once the caller confirms, and lets your team sign in with their own passwords and roles.",
    tier: "available",
  },
  {
    capability: "Text messages to callers",
    description:
      "Confirmation texts and replies by text message. Not sent today; the receptionist never promises one.",
    tier: "planned",
  },
];
