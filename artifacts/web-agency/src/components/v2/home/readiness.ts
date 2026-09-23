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
    label: "Assisted pilot",
    note: "Enabled after setup and acceptance checks for your business.",
  },
  "in-development": {
    label: "Activation required",
    note: "Requires configuration and delivery testing before activation.",
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
      "Configure and test your receptionist with our help before connecting your business number. Summary emails depend on your notification setup.",
    tier: "available",
  },
  {
    capability: "Appointment booking and team access",
    description:
      "Connect your own calendar and verify booking during setup. Unconfirmed times remain requests. Team members use their own accounts and roles.",
    tier: "available",
  },
  {
    capability: "Text messages to callers",
    description:
      "SMS requires a configured number, caller consent and verified delivery before activation. It is not enabled by default.",
    tier: "in-development",
  },
];
