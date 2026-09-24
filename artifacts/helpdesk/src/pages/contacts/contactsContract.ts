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
  detail: "Everyone who has called your receptionist, and anyone you add yourself.",
  loading: "Checking your session…",
} as const;

export const LIST = {
  searchLabel: "Search contacts",
  searchPlaceholder: "Search by name, phone or email",
  loading: "Loading contacts…",
  failed: "Contacts couldn't be loaded. Try again shortly.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",
  emptyTitle: "No contacts yet",
  emptyDetail: "Contacts appear here when someone calls your receptionist. You can also add one yourself.",
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

/* ── Adding and editing ────────────────────────────────────────────────── */

export const FORM = {
  addButton: "Add contact",
  editButton: "Edit contact",
  addTitle: "Add a contact",
  addDetail: "Save someone your receptionist hasn't spoken to yet. Their calls will be linked to them by phone number.",
  editTitle: "Edit contact",
  editDetail: "The phone number can't be changed, because calls are matched to it. Add a new contact for a different number.",
  phoneLabel: "Phone number",
  phoneHelp: "Include the country code, for example +1 555 123 4567.",
  nameLabel: "Name",
  emailLabel: "Email",
  notesLabel: "Notes",
  notesHelp: "Only your team sees these.",
  optional: "Optional",
  required: "Required",
  save: "Save contact",
  saving: "Saving…",
  cancel: "Cancel",
  savedAnnouncement: "Contact saved.",
  failedTitle: "The contact wasn't saved",
  phoneRequired: "Enter a phone number.",
  emailInvalid: "Enter a valid email address, or leave it blank.",
  notesTooLong: "Keep notes under 2,000 characters.",
  nameTooLong: "Keep the name under 120 characters.",
  detailsHeading: "Details",
  emailLabelDetail: "Email",
  notesLabelDetail: "Notes",
  none: "Not added",
} as const;

export interface ContactFormValues {
  phone: string;
  name: string;
  email: string;
  notes: string;
}

export function validateContactForm(
  values: ContactFormValues,
  mode: "add" | "edit",
): { ok: true } | { ok: false; field: keyof ContactFormValues; message: string } {
  if (mode === "add" && values.phone.replace(/[^0-9]/g, "").length === 0) return { ok: false, field: "phone", message: FORM.phoneRequired };
  if (values.name.trim().length > 120) return { ok: false, field: "name", message: FORM.nameTooLong };
  const email = values.email.trim();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, field: "email", message: FORM.emailInvalid };
  if (values.notes.trim().length > 2000) return { ok: false, field: "notes", message: FORM.notesTooLong };
  return { ok: true };
}

/* ── Saved messages reached through this contact's calls ────────────────── */

export const INQUIRIES = {
  heading: "Saved messages",
  empty: "No messages were saved from this contact's calls.",
} as const;

/**
 * A name a CALLER gave on one of this contact's own calls, used only when the
 * contact record carries none. It is a quoted value from a saved message, not
 * an inference, and it is labelled as such so nobody reads it as the
 * contact's stored name.
 */
export const NAME_FROM_INQUIRY_NOTE =
  "Name taken from a message this caller left. It is not saved on the contact.";

export function resolvedContactName(
  contact: Pick<ContactSummary, "name">,
  callerNameFromInquiry: string | null | undefined,
): { name: string; fromInquiry: boolean } {
  const own = typeof contact.name === "string" ? contact.name.trim() : "";
  if (own !== "") return { name: own, fromInquiry: false };
  const quoted = typeof callerNameFromInquiry === "string" ? callerNameFromInquiry.trim() : "";
  if (quoted !== "") return { name: quoted, fromInquiry: true };
  return { name: LIST.unnamed, fromInquiry: false };
}

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
    ...Object.values(INQUIRIES),
    ...Object.values(FORM),
    NAME_FROM_INQUIRY_NOTE,
    ...(["voice", "sms", "manual", "unknown"] as const).map((s) => sourceLabel(s)),
    dispositionLabel(null),
    contactDisplayName({ name: null }),
    resolvedContactName({ name: null }, null).name,
  ];
}

/* ── J4: the text thread on a contact ─────────────────────────────────────── */

export const TEXTS = {
  heading: "Texts",
  loading: "Loading texts…",
  failedTitle: "Texts couldn't be loaded",
  failed: "This is a failed read, not an empty thread. Try again.",
  empty: "No texts with this contact yet.",
  fromCaller: "Caller",
  fromBusiness: "Sent automatically",
  newLabel: "New",
  // Honest about what the page cannot do.
  noReplyNote: "Replies aren't sent from SiteMint. To answer, call or text the caller from your own phone.",
} as const;

export interface TextStatusSource {
  direction: "in" | "out";
  status: string;
  deliveryStatus: string | null;
  errorCode: string | null;
  keyword: "stop" | "start" | "help" | "other" | null;
}

const NOT_SENT_REASON: Record<string, string> = {
  daily_cap_reached: "Not sent — the daily text limit was reached.",
  interrupted: "Not sent — sending was interrupted, and it was not retried so the caller could not get it twice.",
};

/**
 * What happened to one text, in words, or null when there is nothing to add.
 * Only what the provider or SiteMint recorded — "Sent" is never upgraded to
 * "Delivered" without a delivery report.
 */
export function textStatusLabel(m: TextStatusSource): { text: string; tone: "ok" | "waiting" | "problem" } | null {
  if (m.direction === "in") {
    if (m.keyword === "stop") return { text: "The caller opted out of texts.", tone: "problem" };
    if (m.keyword === "start") return { text: "The caller opted back in to texts.", tone: "ok" };
    if (m.keyword === "help") return { text: "The caller asked for help; the carrier sent its standard reply.", tone: "waiting" };
    return null;
  }
  if (m.status === "blocked_no_consent") return { text: "Not sent — the caller hasn't agreed to texts, or opted out.", tone: "problem" };
  if (m.status === "failed") {
    return { text: m.errorCode && NOT_SENT_REASON[m.errorCode] ? NOT_SENT_REASON[m.errorCode] : "Not sent — the text provider refused it.", tone: "problem" };
  }
  if (m.status === "queued" || m.status === "sending") return { text: "Waiting to send.", tone: "waiting" };
  if (m.deliveryStatus === "delivered" || m.deliveryStatus === "read") return { text: "Delivered.", tone: "ok" };
  if (m.deliveryStatus === "undelivered" || m.deliveryStatus === "failed") return { text: "Not delivered — the carrier couldn't deliver it.", tone: "problem" };
  return { text: "Sent. No delivery report yet.", tone: "waiting" };
}

/** J4: the list badge for texts nobody has opened. */
export function unreadTextsLabel(n: number): string {
  return n === 1 ? "1 new text" : `${n} new texts`;
}
