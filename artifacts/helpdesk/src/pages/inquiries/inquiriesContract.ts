/**
 * V7 — every string the Inquiries screen displays.
 *
 * Reads `GET /receptionist/voice/messages`, moves one through the follow-up
 * workflow with `PATCH /receptionist/voice/messages/:id`, and reads delivery
 * status from `GET /receptionist/voice/notifications`.
 *
 * Two wording rules this module exists to hold in one place:
 *
 *  - Nothing says an email was "delivered". We can observe that a provider
 *    ACCEPTED a message and no more, so the labels say exactly that.
 *  - An empty list says the assistant has not saved a message yet. It must not
 *    say "no inquiries" in a way that reads like "nobody called".
 */

import type { InquiryStatus, NotificationState } from "@/lib/inquiriesApi";

/** Reader-facing labels. Kept here so every surface says the same words. */
export const FOLLOW_UP_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

/**
 * Delivery labels. `accepted` names the PROVIDER, never the inbox: we can
 * observe that an email provider took the message and no more, so no label
 * here says "delivered".
 */
export const NOTIFICATION_STATE_LABEL: Record<NotificationState, string> = {
  queued: "Queued to send",
  sending: "Sending",
  accepted: "Accepted by email provider",
  failed: "Failed — will retry",
  abandoned: "Failed — gave up",
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
    "What SiteMint sent you about each call. “Accepted” means your email provider took the message — it is not proof it reached your inbox.",
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
  ];
}
