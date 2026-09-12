/**
 * V7 — every string the Transfer Contacts screen displays.
 *
 * Reads and writes `/receptionist/voice/transfer-contacts`, and runs the
 * settings check at `POST /receptionist/voice/transfer-contacts/:id/test`.
 *
 * The wording rules this module holds in one place, each because the obvious
 * phrasing would be untrue:
 *
 *  - Saving a contact never dials it, and the form says so, so nobody's phone
 *    rings because they pressed Save.
 *  - The check button is "Check setup", not "Test call". It verifies settings
 *    server-side and rings nobody, and its result says that explicitly.
 *  - A browser test call cannot hand a caller over. That distinction is stated
 *    on the page rather than left for someone to discover mid-demo.
 *  - A role is a routing label. The page says so, so nobody reads "Owner" as a
 *    permission level.
 */

import type { ContactRole } from "@/lib/inquiriesApi";

/** Role labels. A role is a routing label and confers no access — see above. */
export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  owner: "Owner",
  manager: "Manager",
  receptionist: "Receptionist",
  support: "Support",
  sales: "Sales",
  other: "Other",
  custom: "Custom title",
};

export const PAGE = {
  eyebrow: "CHANNELS",
  title: "Transfer contacts",
  detail: "The people a caller can be put through to when they ask for someone.",
  loading: "Checking your session…",
} as const;

export const COPY = {
  errorTitle: "Transfer contacts couldn't be loaded",
  errorDetail: "SiteMint couldn't read your transfer contacts. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  emptyTitle: "Add a transfer contact",
  emptyDetail:
    "Nobody is set up to receive transferred calls yet. Until you add someone, the assistant takes a message instead of putting callers through.",
  addLabel: "Add a transfer contact",

  // Form
  formNewTitle: "New transfer contact",
  formEditTitle: "Edit transfer contact",
  nameLabel: "Contact name",
  namePlaceholder: "e.g. Alex Moreno",
  roleLabel: "Role",
  roleHint: "A label for routing only. It gives this person no access to your SiteMint account.",
  customRoleLabel: "Job title",
  customRolePlaceholder: "e.g. Operations Lead",
  countryLabel: "Country",
  phoneLabel: "Phone number",
  phoneHint: "Stored in international format so it dials correctly from anywhere.",
  hoursLegend: "When can this person take calls?",
  useBusinessHoursLabel: "Use my business hours",
  ownHoursLabel: "Set their own hours",
  timezoneLabel: "Their timezone",
  hoursStartLabel: "From",
  hoursEndLabel: "Until",
  businessHoursOnlyLabel: "Only during business hours",
  businessHoursOnlyHint: "Turn this off for someone who is happy to take after-hours calls.",
  activeLabel: "Active",
  activeHint: "Inactive contacts are never called.",
  priorityLabel: "Order tried",
  priorityHint: "Lower numbers are tried first.",
  defaultLabel: "Try this contact first",
  consentLabel:
    "I'm authorised to route calls to this person, and they've agreed to receive them.",
  consentHint: "SiteMint will not put a caller through to anyone without this.",
  saveLabel: "Save contact",
  savingLabel: "Saving…",
  cancelLabel: "Cancel",
  saveNeverDialsNote: "Saving does not call anyone. You can test when they're available.",

  // List item
  defaultBadge: "Tried first",
  inactiveBadge: "Inactive",
  needsConsentBadge: "Needs authorisation",
  businessHoursBadge: "Business hours only",
  alwaysAvailableBadge: "Any time",
  editLabel: "Edit",
  removeLabel: "Remove",
  removeConfirmTitle: "Remove this transfer contact?",
  removeConfirmDetail: "Callers will no longer be put through to them. You can add them again later.",
  removeConfirmAction: "Remove",
  removeConfirmDismiss: "Keep contact",

  // Check
  checkLabel: "Check setup",
  checkingLabel: "Checking…",
  checkConfirmTitle: "Check this transfer contact?",
  checkConfirmDetail:
    "SiteMint will verify your settings the same way a live call does. It will not call anyone and nothing will be charged.",
  checkConfirmAction: "Run check",
  checkConfirmDismiss: "Cancel",
  checkResultTitle: "Check result",
  checkPassedLabel: "Ready",
  checkFailedLabel: "Needs attention",
  checkNobodyCalledNote: "Nobody was called.",
  checkFailedTitle: "The check couldn't run",
  checkFailedDetail: "Nothing changed. Try again.",

  // The digits a business is authorising, not just the name on them.
  wouldDialLabel: "A transfer now would ring:",

  // Capability
  capabilityTitle: "What transfers can do today",
  browserVsPhoneNote:
    "A browser test call happens entirely in this browser, so it has no phone line to hand over — transfers only complete on a real phone call.",
  lastTestNever: "Not yet tested on a real call",
  lastTestLabel: "Last real transfer",
} as const;

export const TEST_OUTCOME_LABEL: Record<string, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
  declined: "Declined",
};

export function roleLabel(role: string, custom: string | null): string {
  if (role === "custom") return custom ?? CONTACT_ROLE_LABEL.custom;
  return CONTACT_ROLE_LABEL[role as ContactRole] ?? "Contact";
}

/** Minutes-from-midnight to a 24-hour "HH:MM" for an <input type="time">. */
export function minutesToTimeValue(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "";
  const clamped = Math.min(Math.max(Math.round(minutes), 0), 1440);
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function testOutcomeLabel(outcome: string | null): string {
  if (outcome === null) return COPY.lastTestNever;
  return TEST_OUTCOME_LABEL[outcome] ?? "Unknown";
}

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...Object.values(COPY),
    ...Object.values(CONTACT_ROLE_LABEL),
    ...Object.values(TEST_OUTCOME_LABEL),
  ];
}
