/**
 * V5 PR-8 — every string the Contacts workspace displays: the list, the
 * search box, and the detail view with linked calls and conversations.
 *
 * ── What changed from Frontend V2 Phase 10 ────────────────────────────────
 * Phase 10 documented, with schema and router evidence, that this product had
 * no contact table and no contact endpoint — `/contacts` was a capability
 * notice explaining that absence. PR-8 adds `GET /receptionist/contacts` and
 * `GET /receptionist/contacts/:id`, built on top of the calls and
 * conversations already recorded. That premise is now false, and this module
 * replaces it with a real list and detail contract rather than quietly
 * dropping the capability-notice copy.
 */

import type { ContactCallRef, ContactConversationRef, ContactSource, ContactSummary } from "@/lib/contactsApi";

export const PAGE = {
  eyebrow: "ACTIVITY",
  title: "Contacts",
  detail: "Everyone who has called or texted your receptionist, in one place.",
  loading: "Checking your session…",
} as const;

export const LIST = {
  searchLabel: "Search contacts",
  searchPlaceholder: "Search by name or phone number",
  loading: "Loading contacts…",
  failed: "Contacts couldn't be loaded. Try again shortly.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",
  emptyTitle: "No contacts yet",
  emptyDetail: "Contacts appear here once someone calls or texts your receptionist.",
  noResultsTitle: "No contacts match that search",
  noResultsDetail: "Try a different name or phone number.",
  columnName: "Name",
  columnSource: "Source",
  columnLastInteraction: "Last interaction",
  columnStatus: "Status",
  columnNextAppointment: "Next appointment",
  unnamed: "Unnamed contact",
  optedOutChip: "Opted out",
  never: "No interactions recorded",
  noNextAppointment: "None scheduled",
  countSuffix: (n: number) => (n === 1 ? "1 contact" : `${n} contacts`),
};

const SOURCE_LABEL: Record<ContactSource, string> = {
  voice: "Voice",
  sms: "SMS",
  manual: "Added manually",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source as ContactSource] ?? "Unknown source";
}

export function dispositionLabel(disposition: string | null): string {
  if (typeof disposition !== "string" || disposition.trim() === "") return "Not set";
  const words = disposition.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function contactDisplayName(contact: Pick<ContactSummary, "name">): string {
  return typeof contact.name === "string" && contact.name.trim() !== "" ? contact.name.trim() : LIST.unnamed;
}

/* ── Detail ────────────────────────────────────────────────────────────── */

export const DETAIL = {
  back: "Back to Contacts",
  loading: "Loading contact…",
  notFoundTitle: "That contact isn't here",
  notFoundDetail: "No stored contact matches this address.",
  errorTitle: "This contact couldn't be loaded",
  errorDetail: "SiteMint couldn't read the stored contact. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  phoneLabel: "Phone",
  sourceLabel: "First seen from",
  lastInteractionLabel: "Last interaction",
  dispositionLabel: "Status",
  nextAppointmentLabel: "Next appointment",
  optedOutLabel: "SMS opt-out",
  optedOutTrue: "Opted out — SiteMint will not text this number",
  optedOutFalse: "Not opted out",

  callsHeading: "Calls",
  callsEmpty: "No calls recorded for this contact.",
  conversationsHeading: "Conversations",
  conversationsEmpty: "No conversations recorded for this contact.",
  openCall: "Open call",
  openConversation: "Open conversation",
} as const;

export function callSummaryLabel(call: ContactCallRef): string {
  return `${new Date(call.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — ${call.state}`;
}

export function conversationSummaryLabel(conversation: ContactConversationRef): string {
  return `${new Date(conversation.lastMessageAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — ${conversation.status}`;
}

/* ── Exhaustive string surface ─────────────────────────────────────────── */

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...Object.values(LIST).filter((v): v is string => typeof v === "string"),
    ...Object.values(DETAIL),
    ...(["voice", "sms", "manual", "unknown"] as const).map((s) => sourceLabel(s)),
    dispositionLabel(null),
    contactDisplayName({ name: null }),
  ];
}
