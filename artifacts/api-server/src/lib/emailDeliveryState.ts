// ── What the provider said, in one vocabulary ───────────────────────────────
//
// Pure. No database, no environment, no clock of its own — so every rule below
// is a test rather than a claim, and the same rules answer the inbox, the
// support thread, the operations queue, campaign results and reporting.
//
// The one rule worth stating before the code: DELIVERY STATE IS DERIVED FROM
// THE EVENTS, never stored beside them. Provider events arrive out of order
// (an `email.sent` retried at 10 hours can land after its `email.delivered`),
// and a stored state updated in arrival order would end up saying "Sent" about
// a message that was delivered, or — far worse — "Delivered" about one that
// bounced. Deriving from per-state first-seen timestamps makes the answer
// independent of the order the events were processed in, which is the only
// property that survives retries, replays and reprocessing.

// ── Event vocabulary ────────────────────────────────────────────────────────

export const PROVIDER_DELIVERY_STATES = [
  "sent", "delayed", "delivered", "bounced", "complained", "failed", "suppressed",
] as const;
export type ProviderDeliveryState = (typeof PROVIDER_DELIVERY_STATES)[number];

/**
 * Provider event type → what it says about delivery.
 *
 * `email.delivery_failed` is the name the previous webhook handled and is kept
 * as an alias for `email.failed`: an account still emitting the old name must
 * not silently stop being understood.
 */
export const DELIVERY_EVENT_TYPES: Readonly<Record<string, ProviderDeliveryState>> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.delivery_failed": "failed",
  "email.suppressed": "suppressed",
};

export const OPENED_EVENT_TYPE = "email.opened";
export const CLICKED_EVENT_TYPE = "email.clicked";

/** Every type this system interprets. Anything else is stored and ignored. */
export function isKnownEmailEventType(type: string): boolean {
  return type in DELIVERY_EVENT_TYPES || type === OPENED_EVENT_TYPE || type === CLICKED_EVENT_TYPE;
}

/**
 * States nothing can move away from.
 *
 * A bounce and a complaint are facts about what happened to a message that has
 * already left; no later event makes them untrue. Ordered by severity, which
 * decides only the rare tie where two terminal events share a timestamp.
 */
export const TERMINAL_PROVIDER_STATES: readonly ProviderDeliveryState[] = [
  "complained", "bounced", "suppressed", "failed",
];

export function isTerminalProviderState(state: ProviderDeliveryState): boolean {
  return TERMINAL_PROVIDER_STATES.includes(state);
}

// ── Deriving the state ──────────────────────────────────────────────────────

export interface ProviderDeliveryTimes {
  sentAt: Date | null;
  delayedAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  failedAt: Date | null;
  suppressedAt: Date | null;
}

/**
 * The state these facts support, and when it became true.
 *
 * Monotonic by construction rather than by discipline:
 *
 *   - a terminal event wins over every non-terminal one, whenever it arrived;
 *   - between two terminal events the EARLIER one is the answer, so processing
 *     order cannot change it;
 *   - otherwise `delivered` beats `delayed` beats `sent`, so a late `sent`
 *     never downgrades a delivery and a late `delayed` never un-delivers one.
 */
export function deriveProviderDeliveryState(
  times: ProviderDeliveryTimes,
): { state: ProviderDeliveryState; at: Date } | null {
  const terminal: Array<{ state: ProviderDeliveryState; at: Date | null }> = [
    { state: "complained", at: times.complainedAt },
    { state: "bounced", at: times.bouncedAt },
    { state: "suppressed", at: times.suppressedAt },
    { state: "failed", at: times.failedAt },
  ];
  let best: { state: ProviderDeliveryState; at: Date } | null = null;
  for (const candidate of terminal) {
    if (!candidate.at) continue;
    // Strictly earlier wins; an exact tie keeps the first, which is the most
    // severe because the list above is in severity order.
    if (!best || candidate.at.getTime() < best.at.getTime()) {
      best = { state: candidate.state, at: candidate.at };
    }
  }
  if (best) return best;

  if (times.deliveredAt) return { state: "delivered", at: times.deliveredAt };
  if (times.delayedAt) return { state: "delayed", at: times.delayedAt };
  if (times.sentAt) return { state: "sent", at: times.sentAt };
  return null;
}

// ── Saying it in words ──────────────────────────────────────────────────────

/** The four tones the CRM's delivery surfaces already use. */
export type DeliveryTone = "waiting" | "working" | "accepted" | "attention";

export interface DeliveryWords {
  label: string;
  tone: DeliveryTone;
  explanation: string;
}

export const PROVIDER_DELIVERY_WORDS: Record<ProviderDeliveryState, DeliveryWords> = {
  sent: {
    label: "Sent",
    tone: "accepted",
    explanation: "The mail provider accepted this and began delivering it. That is not a delivery confirmation.",
  },
  delayed: {
    label: "Delayed",
    tone: "waiting",
    explanation: "The receiving server could not take it yet — a full mailbox or a temporary fault at their end. The provider is still trying.",
  },
  delivered: {
    label: "Delivered",
    tone: "accepted",
    explanation: "The recipient's mail server accepted the message. It is not proof that anybody read it.",
  },
  bounced: {
    label: "Bounced",
    tone: "attention",
    explanation: "The recipient's mail server permanently rejected it. Nothing arrived, and the address has been suppressed so the CRM stops writing to a dead mailbox.",
  },
  complained: {
    label: "Marked as spam",
    tone: "attention",
    explanation: "It arrived and the recipient reported it as spam. The address is suppressed: mailing it again damages deliverability for every other client too.",
  },
  failed: {
    label: "Failed at the provider",
    tone: "attention",
    explanation: "The provider could not send it at all — an invalid recipient, an unverified domain, or a quota. Nothing arrived.",
  },
  suppressed: {
    label: "Blocked by the provider",
    tone: "attention",
    explanation: "The provider refused to send because this address is on its own suppression list, usually after an earlier hard bounce or complaint. Nothing arrived.",
  },
};

// ── One email's provider record ─────────────────────────────────────────────

export interface ProviderEngagementFacts {
  opens: number;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  clicks: number;
  firstClickedAt: Date | null;
  lastClickedAt: Date | null;
}

export interface ProviderDeliveryFacts extends ProviderDeliveryTimes, ProviderEngagementFacts {
  providerEmailId: string | null;
  crmRef: string | null;
  recipient: string | null;
  senderDomain: string | null;
  bounceType: string | null;
  detail: string | null;
  lastEventAt: Date | null;
}

export interface ProviderDelivery extends ProviderDeliveryFacts, DeliveryWords {
  /**
   * Null when the provider has said something about this message — an open, a
   * click — without yet saying anything about its DELIVERY.
   *
   * Engagement and delivery are separate event subscriptions and, for opens
   * and clicks, a separate per-domain setting, so one arriving without the
   * other is an ordinary state rather than a gap. Dropping such a message
   * would throw away the only engagement evidence there is.
   */
  state: ProviderDeliveryState | null;
  at: Date | null;
}

/** Words for a message with engagement recorded but no delivery news. */
export const NO_DELIVERY_REPORT: DeliveryWords = {
  label: "No delivery report",
  tone: "waiting",
  explanation: "The provider has not reported on this message's delivery. Opens and clicks are a separate subscription, so one can arrive without the other.",
};

export function emptyProviderFacts(providerEmailId: string | null = null): ProviderDeliveryFacts {
  return {
    providerEmailId, crmRef: null, recipient: null, senderDomain: null,
    sentAt: null, delayedAt: null, deliveredAt: null, bouncedAt: null,
    complainedAt: null, failedAt: null, suppressedAt: null,
    bounceType: null, detail: null, lastEventAt: null,
    opens: 0, firstOpenedAt: null, lastOpenedAt: null,
    clicks: 0, firstClickedAt: null, lastClickedAt: null,
  };
}

/**
 * Facts plus the state they support.
 *
 * Always an object: `state` is null when no DELIVERY event has arrived, which
 * is not the same as knowing nothing — the opens and clicks are still real and
 * still counted.
 */
export function summariseProviderDelivery(facts: ProviderDeliveryFacts): ProviderDelivery {
  const derived = deriveProviderDeliveryState(facts);
  return derived
    ? { ...facts, ...derived, ...PROVIDER_DELIVERY_WORDS[derived.state] }
    : { ...facts, state: null, at: null, ...NO_DELIVERY_REPORT };
}

// ── The chip a screen shows for one message ─────────────────────────────────

/**
 * What THIS server knows about its own send, before the provider says anything.
 *
 * `uncertain` is the one that must never be rendered as a failure: the message
 * may be in somebody's inbox, and a screen that says "not sent" is how a second
 * copy gets sent.
 */
export type LocalSendOutcome =
  | "accepted" | "in_flight" | "uncertain" | "refused" | "not_sent" | "test_mode" | "unknown";

const LOCAL_WORDS: Record<LocalSendOutcome, DeliveryWords> = {
  accepted: {
    label: "Sent",
    tone: "accepted",
    explanation: "The mail provider accepted this. No delivery report has arrived for it yet.",
  },
  in_flight: {
    label: "Sending",
    tone: "working",
    explanation: "This is being handed to the mail provider now.",
  },
  uncertain: {
    label: "Unconfirmed",
    tone: "attention",
    explanation: "The mail provider never answered, so whether this arrived is genuinely unknown. Ask the recipient before sending it again — a second attempt may put a second copy in their inbox.",
  },
  refused: {
    label: "Refused",
    tone: "attention",
    explanation: "The mail provider refused this message, so nothing arrived. Fix the cause — usually the address — before trying again.",
  },
  not_sent: {
    label: "Not sent",
    tone: "attention",
    explanation: "This was never handed to a mail provider, so nothing reached anybody.",
  },
  test_mode: {
    label: "Test mode — not sent",
    tone: "waiting",
    explanation: "This server simulates mail (CRM_EMAIL_TEST_MODE is not \"false\"), so the message was recorded but never sent.",
  },
  unknown: {
    label: "No delivery record",
    tone: "waiting",
    explanation: "Nothing was recorded about this message's delivery. It predates delivery tracking.",
  },
};

export interface EmailDeliveryChip extends DeliveryWords {
  /** The provider's state where one is known, otherwise the local outcome. */
  state: string;
  /** ISO instant the state became true, when one is known. */
  at: string | null;
  source: "provider" | "local";
  providerState: ProviderDeliveryState | null;
  /** The provider's own words about a failure, when it gave any. */
  detail: string | null;
  opens: number | null;
  clicks: number | null;
}

/**
 * One message's delivery, for a screen.
 *
 * The provider's word wins whenever there is one: it is later, and it is about
 * what happened to the message rather than about what we managed to hand over.
 */
export function emailDeliveryChip(
  local: { outcome: LocalSendOutcome; at?: Date | null; detail?: string | null },
  provider: ProviderDelivery | null,
): EmailDeliveryChip {
  if (provider && provider.state && provider.at) {
    return {
      state: provider.state,
      label: provider.label,
      tone: provider.tone,
      explanation: provider.explanation,
      at: provider.at.toISOString(),
      source: "provider",
      providerState: provider.state,
      detail: provider.detail ?? null,
      opens: provider.opens,
      clicks: provider.clicks,
    };
  }
  // No delivery news. Our own outcome is the honest label — but the opens and
  // clicks, if any arrived, are still facts and are carried through.
  const words = LOCAL_WORDS[local.outcome];
  return {
    state: local.outcome,
    label: words.label,
    tone: words.tone,
    explanation: words.explanation,
    at: local.at ? local.at.toISOString() : null,
    source: "local",
    providerState: null,
    detail: local.detail ?? null,
    opens: provider ? provider.opens : null,
    clicks: provider ? provider.clicks : null,
  };
}

// ── Whether engagement may be reported at all ───────────────────────────────

/**
 * An open is not a read, and a click is not always a person.
 *
 * Apple Mail Privacy Protection fetches the tracking image for every message
 * it receives, whether or not anybody opens it, and corporate scanners fetch
 * images and follow links to check them. So the honest figure is "opens
 * recorded", with this said beside it every time.
 */
export const OPEN_TRACKING_CAVEAT =
  "Opens are inflated by mail privacy proxies. Apple Mail Privacy Protection loads the tracking image for every message it receives, and security scanners do the same, so an open means the image loaded — never that a person read the message.";

export const CLICK_TRACKING_CAVEAT =
  "Clicks are more reliable than opens, but security scanners follow links to check them, so a click is not always a person either.";

/** The exact words for a figure nothing is measuring. Never a zero. */
export const NOT_MEASURED_HEADLINE =
  "Not measured — open/click tracking isn't enabled for this sending domain";

export interface EngagementEvidence {
  /** Whether the event webhook can be verified at all right now. */
  webhookConfigured: boolean;
  /** The domain the CRM sends from, which is where tracking is configured. */
  sendingDomain: string | null;
  /** First open ever recorded for that domain, or null if none ever was. */
  opensSince: Date | null;
  /** First click ever recorded for that domain, or null if none ever was. */
  clicksSince: Date | null;
}

export interface EngagementAvailability {
  measured: boolean;
  /** Non-null exactly when `measured` is false. */
  reason: string | null;
  /** The instant from which this metric has been measured at all. */
  since: Date | null;
  caveat: string;
}

const SECRET_NOTE =
  "RESEND_WEBHOOK_SECRET is not set on this server, so the provider's event webhook cannot be verified and no open or click can be recorded.";

/**
 * May opens (or clicks) be reported as figures for this window?
 *
 * Availability is EVIDENCE, not configuration: the question is whether events
 * have actually been received for this sending domain, and whether they had
 * begun by the end of the window being asked about. A window that closed
 * before the first event ever arrived cannot be reported as "0 opens" — during
 * that period nothing was measuring, and 0 would be a claim to have looked.
 */
export function engagementAvailability(
  evidence: EngagementEvidence,
  metric: "opens" | "clicks",
  windowEndsAt?: Date | null,
): EngagementAvailability {
  const since = metric === "opens" ? evidence.opensSince : evidence.clicksSince;
  const caveat = metric === "opens" ? OPEN_TRACKING_CAVEAT : CLICK_TRACKING_CAVEAT;
  const word = metric === "opens" ? "open" : "click";
  const domain = evidence.sendingDomain ?? "this sending domain";
  const secretSuffix = evidence.webhookConfigured ? "" : ` ${SECRET_NOTE}`;

  if (!since) {
    const reason = evidence.webhookConfigured
      ? `${NOT_MEASURED_HEADLINE}. No ${word} has ever been recorded for ${domain}, so there is nothing to count — a 0 here would be a claim about your customers with no evidence behind it. If tracking has just been switched on, figures appear once the first ${word} arrives.`
      : `${NOT_MEASURED_HEADLINE}. ${SECRET_NOTE} A 0% here would say "we measured, and nobody opened anything". Nothing is measuring.`;
    return { measured: false, reason, since: null, caveat };
  }

  if (windowEndsAt && since.getTime() > windowEndsAt.getTime()) {
    return {
      measured: false,
      reason: `Not measured in this period — the first ${word} recorded for ${domain} was ${since.toISOString().slice(0, 10)}, after this window ended, so nothing was measuring while these messages were sent.${secretSuffix}`,
      since,
      caveat,
    };
  }

  return { measured: true, reason: null, since, caveat };
}

/** `"SiteMint <noreply@sitemintdigital.com>"` → `"sitemintdigital.com"`. */
export function emailDomainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const angle = address.match(/<([^>]+)>/);
  const bare = (angle ? angle[1] : address).trim();
  const at = bare.lastIndexOf("@");
  if (at < 0 || at === bare.length - 1) return null;
  return bare.slice(at + 1).toLowerCase();
}
