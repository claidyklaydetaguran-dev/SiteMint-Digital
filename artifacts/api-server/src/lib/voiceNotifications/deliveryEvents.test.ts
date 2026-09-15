// Delivery evidence is recorded beside acceptance, never instead of it, and a
// late or repeated event cannot weaken what is already known.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import {
  nextDeliveryStatus,
  recordVoiceNotificationDeliveryEvent,
  type DeliveryEventStore,
  type VoiceDeliveryStatus,
} from "./deliveryEvents.js";

function memoryStore(rows: Array<{ id: number; providerMessageId: string; accepted: boolean; deliveryStatus: VoiceDeliveryStatus | null }>) {
  const store: DeliveryEventStore & { rows: typeof rows } = {
    rows,
    findByProviderMessageId: async (id) => {
      const row = rows.find((r) => r.providerMessageId === id && r.accepted);
      return row ? { id: row.id, deliveryStatus: row.deliveryStatus } : undefined;
    },
    updateIfUnchanged: async (id, expected, next) => {
      const row = rows.find((r) => r.id === id);
      if (!row || row.deliveryStatus !== expected) return false;
      row.deliveryStatus = next;
      return true;
    },
  };
  return store;
}

const AT = new Date("2026-09-16T12:00:00Z");

describe("nextDeliveryStatus", () => {
  it("only ever strengthens what is known", () => {
    expect(nextDeliveryStatus(null, "delivery_delayed")).toBe("delivery_delayed");
    expect(nextDeliveryStatus("delivery_delayed", "delivered")).toBe("delivered");
    expect(nextDeliveryStatus("delivered", "bounced")).toBe("bounced");
    expect(nextDeliveryStatus("bounced", "delivery_delayed")).toBeNull();
    expect(nextDeliveryStatus("delivered", "delivered")).toBeNull();
  });
});

describe("recordVoiceNotificationDeliveryEvent", () => {
  it("records a delivery against the accepted notification with that message id", async () => {
    const store = memoryStore([{ id: 1, providerMessageId: "re_1", accepted: true, deliveryStatus: null }]);
    expect(await recordVoiceNotificationDeliveryEvent("email.delivered", "re_1", AT, store)).toBe("recorded");
    expect(store.rows[0]!.deliveryStatus).toBe("delivered");
  });

  it("treats a redelivered or weaker late event as no change", async () => {
    const store = memoryStore([{ id: 1, providerMessageId: "re_1", accepted: true, deliveryStatus: "bounced" }]);
    expect(await recordVoiceNotificationDeliveryEvent("email.delivered", "re_1", AT, store)).toBe("unchanged");
    expect(store.rows[0]!.deliveryStatus).toBe("bounced");
  });

  it("ignores events that are not delivery evidence, and messages that are not ours", async () => {
    const store = memoryStore([{ id: 1, providerMessageId: "re_1", accepted: true, deliveryStatus: null }]);
    expect(await recordVoiceNotificationDeliveryEvent("email.opened", "re_1", AT, store)).toBe("not_delivery_evidence");
    expect(await recordVoiceNotificationDeliveryEvent("email.delivered", "re_campaign_9", AT, store)).toBe("no_matching_notification");
    expect(store.rows[0]!.deliveryStatus).toBeNull();
  });

  it("never attaches evidence to a notification that was not accepted", async () => {
    const store = memoryStore([{ id: 1, providerMessageId: "re_1", accepted: false, deliveryStatus: null }]);
    expect(await recordVoiceNotificationDeliveryEvent("email.delivered", "re_1", AT, store)).toBe("no_matching_notification");
  });
});
