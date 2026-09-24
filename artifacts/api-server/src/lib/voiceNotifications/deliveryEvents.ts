// Delivery evidence for the post-call emails a business receives.
//
// `accepted` on a notification means the provider took the message. Whether it
// then reached the inbox is a separate fact the provider reports later, as a
// signed event against the message id it returned. This module records that
// fact on the notification row, without ever changing what 'accepted' means.
//
// Events arrive out of order and more than once. A later, weaker event must not
// overwrite a stronger one: once a message has bounced, a delayed-delivery
// notice arriving afterwards does not make it "delayed" again. So each status
// has a rank and a row only ever moves up.

export type VoiceDeliveryStatus = "delivery_delayed" | "delivered" | "failed" | "bounced" | "complained";

/** Resend event type → the delivery status it is evidence of. Anything else is not delivery evidence. */
export const RESEND_DELIVERY_EVENTS: Readonly<Record<string, VoiceDeliveryStatus>> = {
  "email.delivery_delayed": "delivery_delayed",
  "email.delivered": "delivered",
  "email.failed": "failed",
  "email.delivery_failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

const RANK: Record<VoiceDeliveryStatus, number> = {
  delivery_delayed: 1,
  delivered: 2,
  failed: 3,
  bounced: 4,
  complained: 5,
};

/** The status to store after an event, or null when the event adds nothing. */
export function nextDeliveryStatus(
  current: VoiceDeliveryStatus | null,
  incoming: VoiceDeliveryStatus,
): VoiceDeliveryStatus | null {
  if (current !== null && RANK[current] >= RANK[incoming]) return null;
  return incoming;
}

export type DeliveryEventOutcome = "not_delivery_evidence" | "no_matching_notification" | "recorded" | "unchanged";

export interface DeliveryEventStore {
  /** The accepted notification that provider message id belongs to, if any. */
  findByProviderMessageId: (providerMessageId: string) => Promise<{ id: number; deliveryStatus: VoiceDeliveryStatus | null } | undefined>;
  /** Moves the row to `next` only if it still holds `expected` (a concurrent event may have landed). */
  updateIfUnchanged: (id: number, expected: VoiceDeliveryStatus | null, next: VoiceDeliveryStatus, at: Date) => Promise<boolean>;
}

async function productionStore(): Promise<DeliveryEventStore> {
  const { db } = await import("@workspace/db");
  const { voiceNotifications } = await import("@workspace/db/schema/voice");
  const { and, eq, isNull } = await import("drizzle-orm");
  return {
    findByProviderMessageId: async (providerMessageId) => {
      const [row] = await db
        .select({ id: voiceNotifications.id, deliveryStatus: voiceNotifications.deliveryStatus })
        .from(voiceNotifications)
        .where(and(eq(voiceNotifications.providerMessageId, providerMessageId), eq(voiceNotifications.state, "accepted")))
        .limit(1);
      return row ? { id: row.id, deliveryStatus: (row.deliveryStatus as VoiceDeliveryStatus | null) ?? null } : undefined;
    },
    updateIfUnchanged: async (id, expected, next, at) => {
      const updated = await db
        .update(voiceNotifications)
        .set({ deliveryStatus: next, deliveryEventAt: at, updatedAt: new Date() })
        .where(
          and(
            eq(voiceNotifications.id, id),
            eq(voiceNotifications.state, "accepted"),
            expected === null ? isNull(voiceNotifications.deliveryStatus) : eq(voiceNotifications.deliveryStatus, expected),
          ),
        )
        .returning({ id: voiceNotifications.id });
      return updated.length > 0;
    },
  };
}

/**
 * Records one provider event, if it is delivery evidence for one of our
 * notifications. Idempotent: a redelivered event, or a weaker one arriving
 * late, changes nothing. The caller has already verified the event's signature.
 */
export async function recordVoiceNotificationDeliveryEvent(
  eventType: string,
  providerMessageId: string,
  occurredAt: Date,
  store?: DeliveryEventStore,
): Promise<DeliveryEventOutcome> {
  const incoming = RESEND_DELIVERY_EVENTS[eventType];
  if (!incoming) return "not_delivery_evidence";
  const resolved = store ?? (await productionStore());
  for (let tries = 0; tries < 3; tries++) {
    const row = await resolved.findByProviderMessageId(providerMessageId);
    if (!row) return "no_matching_notification";
    const next = nextDeliveryStatus(row.deliveryStatus, incoming);
    if (next === null) return "unchanged";
    if (await resolved.updateIfUnchanged(row.id, row.deliveryStatus, next, occurredAt)) return "recorded";
    // Another event for the same message landed in between; re-read and re-rank.
  }
  return "unchanged";
}
