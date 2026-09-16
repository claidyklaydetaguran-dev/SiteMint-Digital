/**
 * Support: the one address a customer writes to, and the words the request
 * screen uses.
 *
 * The address used to be spelled two ways — Support said `info.sitemint@gmail.com`
 * and the Usage "paused" action said `support@sitemintdigital.com`. Nothing else
 * in the repository uses the second, so a customer following the Usage link
 * could have written to an inbox nobody reads. Both screens read this constant.
 *
 * Support is no longer only an address: a request is recorded, carries a state,
 * and keeps its thread. The copy below is written so the screen never claims
 * more than that — "received" is not "somebody is reading it", and neither is a
 * promise of when a reply comes.
 *
 * No imports, matching every other contract module in this app, so it stays
 * portable into the plain `tsx` test runner.
 */

export const SUPPORT_EMAIL = "info.sitemint@gmail.com";

/** A `mailto:` link to the support address, with an optional subject line. */
export function supportMailto(subject?: string): string {
  const trimmed = subject?.trim() ?? "";
  return trimmed === "" ? `mailto:${SUPPORT_EMAIL}` : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(trimmed)}`;
}

export const SUPPORT_SUBJECT_MAX = 160;
export const SUPPORT_BODY_MAX = 4000;

export type SupportCategoryKey = "question" | "problem" | "billing" | "other";
export type SupportStatusKey = "open" | "in_progress" | "answered" | "closed";

export const SUPPORT_CATEGORY_OPTIONS: ReadonlyArray<{ value: SupportCategoryKey; label: string }> = [
  { value: "question", label: "A question" },
  { value: "problem", label: "Something is not working" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Something else" },
];

/**
 * What each state means, in the customer's terms. `open` deliberately does not
 * say anyone is working on it — only that SiteMint has it and owes a reply.
 */
export const SUPPORT_STATUS: Record<SupportStatusKey, { label: string; detail: string }> = {
  open: { label: "Waiting on SiteMint", detail: "We have your request and owe you a reply." },
  in_progress: { label: "Being worked on", detail: "Somebody at SiteMint is on it." },
  answered: { label: "Replied", detail: "SiteMint has answered. Write back if that did not settle it." },
  closed: { label: "Closed", detail: "Finished. Writing again reopens it." },
};

export const SUPPORT_COPY = {
  heading: "Support",
  description: "Get help from SiteMint.",
  formTitle: "Ask SiteMint for help",
  formDetail: "Your request is saved here with its status, so you can see what you asked and what came back.",
  subjectLabel: "Subject",
  subjectPlaceholder: "Calendar keeps disconnecting",
  categoryLabel: "What is this about?",
  bodyLabel: "What do you need help with?",
  bodyPlaceholder: "Include anything that helps us find it: when it happens, what you expected, what you saw.",
  submit: "Send request",
  submitPending: "Sending…",
  sent: "Request sent",
  /** Only ever shown when the server said the alert reached SiteMint's inbox. */
  sentNotified: "SiteMint's support inbox has been told. We reply by email to the address on your account.",
  sentNotNotified:
    "Your request is saved here. SiteMint's support inbox was not reachable just now, so if this is urgent, email us as well.",
  listTitle: "Your requests",
  listEmpty: "You have not sent a support request yet.",
  threadTitle: "Conversation",
  replyLabel: "Add to this request",
  replyPlaceholder: "Anything else that would help us answer.",
  reply: "Send reply",
  replyPending: "Sending…",
  close: "Mark as finished",
  closePending: "Closing…",
  reopenNote: "Sending a reply reopens a finished request.",
  failedTitle: "That did not send",
  loadFailed: "Your requests could not be loaded just now.",
  loading: "Loading your requests…",
  authorBusiness: "You",
  authorSiteMint: "SiteMint",
  emailFallback: `Prefer email? Write to ${SUPPORT_EMAIL}.`,
  issuesLink: "Problems SiteMint has already flagged",
} as const;

export interface SupportFormValues {
  subject: string;
  body: string;
  category: SupportCategoryKey;
}

export interface SupportFormErrors {
  subject?: string;
  body?: string;
}

/**
 * The same rules the server enforces, stated before the request leaves the
 * browser. The server remains the authority: its field errors are shown as
 * written when they disagree.
 */
export function validateSupportForm(values: SupportFormValues): SupportFormErrors {
  const errors: SupportFormErrors = {};
  const subject = values.subject.trim();
  const body = values.body.trim();
  if (subject === "") errors.subject = "Give your request a short subject.";
  else if (subject.length > SUPPORT_SUBJECT_MAX) errors.subject = `Keep the subject under ${SUPPORT_SUBJECT_MAX} characters.`;
  if (body === "") errors.body = "Tell us what you need help with.";
  else if (body.length > SUPPORT_BODY_MAX) errors.body = `Keep it under ${SUPPORT_BODY_MAX} characters.`;
  return errors;
}

export function hasSupportFormErrors(errors: SupportFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The sentence shown after a request is sent, chosen by what actually happened. */
export function sentMessage(operatorNotified: boolean): string {
  return operatorNotified ? SUPPORT_COPY.sentNotified : SUPPORT_COPY.sentNotNotified;
}
