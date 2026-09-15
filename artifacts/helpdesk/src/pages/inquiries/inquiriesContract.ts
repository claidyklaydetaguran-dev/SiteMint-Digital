/**
 * V7 — every string the Inquiries screen displays.
 *
 * Reads `GET /receptionist/voice/messages`, moves one through the follow-up
 * workflow with `PATCH /receptionist/voice/messages/:id`, and reads delivery
 * status from `GET /receptionist/voice/notifications`.
 *
 * Two wording rules this module exists to hold in one place:
 *
 *  - The STATE labels never say an email was "delivered". A state describes
 *    what SiteMint did with the message; acceptance by a provider is the most
 *    it can prove on its own.
 *  - An empty list says the assistant has not saved a message yet. It must not
 *    say "no inquiries" in a way that reads like "nobody called".
 *
 * ── Delivery evidence is a separate question ──────────────────────────────
 * The provider's own signed delivery events now reach us, so "delivered" is
 * something we can sometimes observe rather than merely hope. That evidence
 * lives in `deliveryLine` below, NOT in the state labels: a state of accepted
 * with no event is a different, weaker claim than accepted with a delivered
 * event, and collapsing the two is exactly the overstatement to avoid. Null
 * evidence means no event has arrived, which is not the same as "not
 * delivered".
 */

import type { DeliveryStatus, InquiryStatus, NotificationState } from "@/lib/inquiriesApi";

/** Reader-facing labels. Kept here so every surface says the same words. */
export const FOLLOW_UP_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

/**
 * Delivery labels. `accepted` names the PROVIDER, never the inbox: the state
 * on its own only proves an email provider took the message, so no label here
 * says "delivered". `unconfirmed` is terminal and needs a person — a retry
 * could email the business a second time.
 */
export const NOTIFICATION_STATE_LABEL: Record<NotificationState, string> = {
  queued: "Queued to send",
  sending: "Sending",
  accepted: "Accepted by email provider",
  failed: "Failed — will retry",
  abandoned: "Failed — gave up",
  unconfirmed: "Might not have been sent",
};

export const PAGE = {
  eyebrow: "ACTIVITY",
  title: "Inquiries",
  detail: "Messages your assistant took from callers, and what still needs following up.",
  loading: "Checking your session…",
} as const;

export const TABS: ReadonlyArray<{ key: InquiryStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: FOLLOW_UP_STATUS_LABEL.new },
  { key: "in_progress", label: FOLLOW_UP_STATUS_LABEL.in_progress },
  { key: "resolved", label: FOLLOW_UP_STATUS_LABEL.resolved },
];

/* ── Urgency ───────────────────────────────────────────────────────────────
   The caller's own marking, carried through untouched. "Not urgent" is the
   absence of that marking, never a judgement SiteMint made about the call. */

export const URGENCY_FILTER_LABEL = "Urgency";

export const URGENCY_FILTERS = [
  { key: "all", label: "Any urgency" },
  { key: "urgent", label: "Urgent only" },
  { key: "normal", label: "Not urgent" },
] as const;

export type UrgencyFilter = (typeof URGENCY_FILTERS)[number]["key"];

export function matchesUrgency(inquiry: { urgency: string }, filter: UrgencyFilter): boolean {
  return filter === "all" || inquiry.urgency === filter;
}

/* ── Following up ──────────────────────────────────────────────────────────
   Both actions hand the reader off to their own phone or mail app using the
   details the CALLER gave. Nothing here sends anything, and neither link is
   offered when the matching detail is absent. */

export const ACTIONS = {
  callLabel: "Call back",
  emailLabel: "Send an email",
  noPhone: "No number to call back",
  noEmail: "No email address to write to",
} as const;

/** `tel:` takes digits and a leading `+`, and nothing else. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mailtoHref(email: string, topic: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Re: ${topic}`)}`;
}

/* ── When message-taking is not attached ───────────────────────────────────
   A silent empty list is the worst answer here: it reads as "nobody called"
   when the truth is that the assistant was never able to save a message. The
   server's own capability resolution is what decides this, and its sentence
   is preferred over the fallback below. */

export const CAPABILITY = {
  offTitle: "Taking messages isn't switched on for this business",
  offFallback: "Your assistant can't save messages yet, so nothing will appear here.",
} as const;

/* ── Delivery evidence ─────────────────────────────────────────────────── */

export const DELIVERY = {
  acceptedNoEvent: "Handed to the email provider (delivery not yet confirmed).",
  delivered: "Delivered to your inbox provider.",
  delayed: "Your email provider reported a delay. It may still arrive.",
  bounced: "The address rejected this email. Check the address on your account, then ask SiteMint to resend.",
  complained: "This was marked as spam. Check your spam folder and any filters on the address.",
  deliveryFailed: "Your email provider could not hand this over. Check the address on your account.",
  unconfirmed: "May have been sent — check your inbox; it will not be sent again automatically.",
  abandoned: "Not sent.",
  abandonedReasonLabel: "Reason",
  queued: "Waiting to be sent.",
  sending: "Being sent now.",
  retrying: "Not sent yet. SiteMint will try again automatically.",
  unrecognised: "This email's state isn't recognised.",
} as const;

/**
 * One sentence for what is actually known about one notification.
 *
 * Acceptance and delivery are kept apart deliberately: `accepted` with no
 * event says only that a provider took it, and is never upgraded into a claim
 * that it arrived.
 */
export function deliveryLine(notification: {
  state: string;
  deliveryStatus?: DeliveryStatus | string | null;
}): string {
  switch (notification.state) {
    case "unconfirmed":
      return DELIVERY.unconfirmed;
    case "abandoned":
      return DELIVERY.abandoned;
    case "queued":
      return DELIVERY.queued;
    case "sending":
      return DELIVERY.sending;
    case "failed":
      return DELIVERY.retrying;
    case "accepted":
      switch (notification.deliveryStatus) {
        case "delivered":
          return DELIVERY.delivered;
        case "delivery_delayed":
          return DELIVERY.delayed;
        case "bounced":
          return DELIVERY.bounced;
        case "complained":
          return DELIVERY.complained;
        case "failed":
          return DELIVERY.deliveryFailed;
        default:
          return DELIVERY.acceptedNoEvent;
      }
    default:
      return DELIVERY.unrecognised;
  }
}

export const COPY = {
  errorTitle: "Inquiries couldn't be loaded",
  errorDetail: "SiteMint couldn't read your inquiries. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  emptyTitle: "No messages yet",
  emptyDetail:
    "When a caller leaves their details, the message appears here and you get an email about it.",
  emptyFilteredTitle: "Nothing in this list",
  emptyFilteredDetail: "There are no inquiries with this follow-up status right now.",

  callerLabel: "From",
  topicLabel: "About",
  detailsLabel: "What they asked for",
  phoneLabel: "Call back",
  emailLabel: "Email",
  receivedLabel: "Received",
  noPhone: "No number given",
  noEmail: "No email given",
  urgentBadge: "Urgent",
  ackRequestedNote: "This caller asked us to email them a copy.",

  statusLabel: "Follow-up",
  markNew: "Mark new",
  markInProgress: "Mark in progress",
  markResolved: "Mark resolved",
  savingLabel: "Saving…",
  updateFailedTitle: "That status wasn't saved",
  updateFailedDetail: "Nothing changed. Try again.",

  viewCallLabel: "View call",

  notificationsTitle: "Email notifications",
  notificationsDetail:
    "What SiteMint sent you about each call. “Accepted” means your email provider took the message — it is not proof it reached your inbox. Where the provider later told us what happened, that is shown too.",
  notificationsEmpty: "No notification emails yet.",
  notificationRecipientLabel: "Sent to",
  notificationAttemptsLabel: "Attempts",
  notificationErrorLabel: "Last error",
  notificationRetryNote: "SiteMint will try again automatically.",
} as const;

export function followUpLabel(status: string): string {
  return FOLLOW_UP_STATUS_LABEL[status as InquiryStatus] ?? "Unknown";
}

export function notificationLabel(state: string): string {
  return (
    NOTIFICATION_STATE_LABEL[state as keyof typeof NOTIFICATION_STATE_LABEL] ??
    // An unrecognised state is stated as unknown, never guessed into a
    // reassuring one.
    "Unknown"
  );
}

export function everyRenderableString(): string[] {
  return [
    ...Object.values(PAGE),
    ...Object.values(COPY),
    ...TABS.map((t) => t.label),
    ...Object.values(FOLLOW_UP_STATUS_LABEL),
    ...Object.values(NOTIFICATION_STATE_LABEL),
    ...Object.values(DELIVERY),
    ...Object.values(ACTIONS),
    ...Object.values(CAPABILITY),
    URGENCY_FILTER_LABEL,
    ...URGENCY_FILTERS.map((f) => f.label),
  ];
}
