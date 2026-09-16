/**
 * The delivery state a set of provider events supports, and the record each
 * event belongs to.
 *
 * Two properties are worth more than the rest and are driven hardest:
 *
 *   ORDER CANNOT CHANGE THE ANSWER. Provider events arrive out of order and are
 *   replayed; a state that depended on arrival order would say "Sent" about a
 *   delivered message, or "Delivered" about one that bounced.
 *
 *   NOTHING IS REPORTED THAT NOTHING MEASURED. Engagement is available only on
 *   evidence — events actually received for this sending domain, beginning
 *   before the window being asked about — and never as a zero.
 *
 * Pure: no database, no clock of its own.
 */
import { describe, it, expect } from "vitest";
import {
  deriveProviderDeliveryState, emailDeliveryChip, emailDomainOf, engagementAvailability,
  isKnownEmailEventType, isTerminalProviderState, NOT_MEASURED_HEADLINE,
  PROVIDER_DELIVERY_WORDS, summariseProviderDelivery, emptyProviderFacts,
  type ProviderDeliveryState, type ProviderDeliveryTimes,
} from "./emailDeliveryState.js";
import { emailRef, emailRefTags, parseEmailRef, refFromTags, EMAIL_REF_TAG_NAME } from "./emailRefs.js";

const T = (minutes: number) => new Date(Date.UTC(2026, 8, 16, 12, minutes, 0));

const NO_TIMES: ProviderDeliveryTimes = {
  sentAt: null, delayedAt: null, deliveredAt: null,
  bouncedAt: null, complainedAt: null, failedAt: null, suppressedAt: null,
};

/** The timestamps a sequence of events would leave behind, in any order. */
function timesFor(events: Array<[ProviderDeliveryState, Date]>): ProviderDeliveryTimes {
  const key = {
    sent: "sentAt", delayed: "delayedAt", delivered: "deliveredAt", bounced: "bouncedAt",
    complained: "complainedAt", failed: "failedAt", suppressed: "suppressedAt",
  } as const;
  const times: ProviderDeliveryTimes = { ...NO_TIMES };
  for (const [state, at] of events) {
    const field = key[state];
    const existing = times[field];
    // First occurrence wins, exactly as the SQL aggregate (min) does.
    if (!existing || at.getTime() < existing.getTime()) times[field] = at;
  }
  return times;
}

/** Every ordering of a set of events. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i], ...tail]);
  }
  return out;
}

describe("the state the events support", () => {
  it("is nothing at all when no delivery event has arrived", () => {
    expect(deriveProviderDeliveryState(NO_TIMES)).toBeNull();

    // An open can arrive for a message no delivery event was ever received
    // for — they are separate subscriptions, and opens need a per-domain
    // setting delivery events do not. The engagement is still real, so the
    // summary exists and only its delivery state is absent.
    const engagementOnly = summariseProviderDelivery({
      ...emptyProviderFacts("re_1"), opens: 2, firstOpenedAt: T(1), lastOpenedAt: T(4), lastEventAt: T(4),
    });
    expect(engagementOnly.state).toBeNull();
    expect(engagementOnly.opens).toBe(2);
    // …and the screen says what WE know about the send rather than implying
    // the provider reported on it.
    const chip = emailDeliveryChip({ outcome: "accepted", at: T(0) }, engagementOnly);
    expect(chip).toMatchObject({ source: "local", label: "Sent", providerState: null, opens: 2 });
  });

  it("does not change with the order the events were processed in", () => {
    const cases: Array<{ events: Array<[ProviderDeliveryState, Date]>; state: ProviderDeliveryState; at: Date }> = [
      { events: [["sent", T(0)], ["delivered", T(1)]], state: "delivered", at: T(1) },
      // A late `sent` — the provider's eighth retry — must not downgrade it.
      { events: [["delivered", T(1)], ["sent", T(0)]], state: "delivered", at: T(1) },
      { events: [["sent", T(0)], ["delayed", T(2)], ["delivered", T(5)]], state: "delivered", at: T(5) },
      // Delayed AFTER delivered is a duplicate of an earlier attempt's news.
      { events: [["delivered", T(5)], ["delayed", T(6)]], state: "delivered", at: T(5) },
      { events: [["sent", T(0)], ["bounced", T(3)]], state: "bounced", at: T(3) },
      // Asynchronous bounce after a delivery: the bounce is the later truth.
      { events: [["sent", T(0)], ["delivered", T(1)], ["bounced", T(9)]], state: "bounced", at: T(9) },
      { events: [["delivered", T(1)], ["complained", T(30)]], state: "complained", at: T(30) },
      { events: [["failed", T(1)]], state: "failed", at: T(1) },
      { events: [["suppressed", T(1)]], state: "suppressed", at: T(1) },
    ];

    for (const { events, state, at } of cases) {
      for (const order of permutations(events)) {
        const derived = deriveProviderDeliveryState(timesFor(order));
        expect(derived, JSON.stringify(order)).toEqual({ state, at });
      }
    }
  });

  it("keeps the first terminal answer when two terminal events arrive", () => {
    // A bounce then a complaint cannot both be the state. The earlier event is
    // the answer whichever order they are processed in.
    for (const order of permutations<[ProviderDeliveryState, Date]>([["bounced", T(4)], ["complained", T(9)]])) {
      expect(deriveProviderDeliveryState(timesFor(order))).toEqual({ state: "bounced", at: T(4) });
    }
    // A tie is decided by severity, so it is still order-independent.
    for (const order of permutations<[ProviderDeliveryState, Date]>([["bounced", T(4)], ["complained", T(4)]])) {
      expect(deriveProviderDeliveryState(timesFor(order))).toEqual({ state: "complained", at: T(4) });
    }
  });

  it("marks exactly the states nothing can move away from", () => {
    expect(["bounced", "complained", "failed", "suppressed"].every(isTerminalProviderState as never)).toBe(true);
    expect(["sent", "delayed", "delivered"].some(isTerminalProviderState as never)).toBe(false);
  });

  it("knows which provider event types it interprets, including the old failure name", () => {
    for (const type of [
      "email.sent", "email.delivered", "email.delivery_delayed", "email.bounced",
      "email.complained", "email.failed", "email.delivery_failed", "email.suppressed",
      "email.opened", "email.clicked",
    ]) expect(isKnownEmailEventType(type), type).toBe(true);
    for (const type of ["email.received", "contact.created", "domain.updated", ""]) {
      expect(isKnownEmailEventType(type), type).toBe(false);
    }
  });

  it("never calls the provider accepting a message proof that anybody read it", () => {
    for (const words of Object.values(PROVIDER_DELIVERY_WORDS)) {
      expect(words.label).not.toMatch(/read|opened by/i);
    }
    expect(PROVIDER_DELIVERY_WORDS.delivered.explanation).toMatch(/not proof/i);
    expect(PROVIDER_DELIVERY_WORDS.sent.explanation).toMatch(/not a delivery confirmation/i);
  });
});

describe("the chip a screen shows", () => {
  const delivered = summariseProviderDelivery({
    ...emptyProviderFacts("re_1"), deliveredAt: T(2), sentAt: T(1), lastEventAt: T(2), opens: 3, clicks: 1,
  })!;

  it("prefers what the provider said over what we managed to hand over", () => {
    const chip = emailDeliveryChip({ outcome: "accepted", at: T(1) }, delivered);
    expect(chip).toMatchObject({ state: "delivered", label: "Delivered", source: "provider", opens: 3, clicks: 1 });
    expect(chip.at).toBe(T(2).toISOString());
  });

  it("falls back to our own outcome, and never renders an unknown one as a failure", () => {
    const unknown = emailDeliveryChip({ outcome: "uncertain", at: T(1), detail: "socket hang up" }, null);
    expect(unknown).toMatchObject({ state: "uncertain", source: "local", providerState: null });
    expect(unknown.label).toBe("Unconfirmed");
    expect(unknown.label).not.toMatch(/failed|not sent/i);
    expect(unknown.explanation).toMatch(/unknown/i);

    expect(emailDeliveryChip({ outcome: "accepted" }, null).label).toBe("Sent");
    expect(emailDeliveryChip({ outcome: "test_mode" }, null).label).toMatch(/Test mode/);
    expect(emailDeliveryChip({ outcome: "refused" }, null).tone).toBe("attention");
    expect(emailDeliveryChip({ outcome: "unknown" }, null).opens).toBeNull();
  });

  it("shows a bounce even when our own record says the provider accepted it", () => {
    const bounced = summariseProviderDelivery({
      ...emptyProviderFacts("re_2"), sentAt: T(1), deliveredAt: T(2), bouncedAt: T(8),
      detail: "Suppressed", bounceType: "Permanent", lastEventAt: T(8),
    })!;
    const chip = emailDeliveryChip({ outcome: "accepted", at: T(1) }, bounced);
    expect(chip).toMatchObject({ state: "bounced", tone: "attention", detail: "Suppressed" });
  });
});

describe("whether engagement may be reported at all", () => {
  const domain = "sitemintdigital.com";
  const base = { webhookConfigured: true, sendingDomain: domain, opensSince: null, clicksSince: null };

  it("says not measured — never zero — when no event has ever been received", () => {
    const opens = engagementAvailability(base, "opens");
    expect(opens.measured).toBe(false);
    expect(opens.reason).toContain(NOT_MEASURED_HEADLINE);
    expect(opens.reason).toContain(domain);
    expect(opens.reason).not.toMatch(/\b0%/);
  });

  it("names the missing secret when the webhook cannot be received at all", () => {
    const opens = engagementAvailability({ ...base, webhookConfigured: false }, "opens");
    expect(opens.measured).toBe(false);
    expect(opens.reason).toContain("RESEND_WEBHOOK_SECRET");
  });

  it("measures each metric on its own evidence", () => {
    const evidence = { ...base, opensSince: T(0), clicksSince: null };
    expect(engagementAvailability(evidence, "opens").measured).toBe(true);
    expect(engagementAvailability(evidence, "clicks").measured).toBe(false);
  });

  it("refuses a window that closed before anything was being measured", () => {
    const evidence = { ...base, opensSince: new Date("2026-09-01T00:00:00Z") };
    const before = engagementAvailability(evidence, "opens", new Date("2026-08-31T23:59:59Z"));
    expect(before.measured).toBe(false);
    expect(before.reason).toMatch(/after this window ended/);
    const after = engagementAvailability(evidence, "opens", new Date("2026-09-30T00:00:00Z"));
    expect(after.measured).toBe(true);
    expect(after.reason).toBeNull();
  });

  it("still names the missing secret in every unavailable answer", () => {
    const evidence = { ...base, webhookConfigured: false, opensSince: new Date("2026-09-01T00:00:00Z") };
    const reason = engagementAvailability(evidence, "opens", new Date("2026-08-01T00:00:00Z")).reason ?? "";
    expect(reason).toContain("RESEND_WEBHOOK_SECRET");
  });

  it("carries the privacy-proxy caveat with every measured figure", () => {
    const measured = engagementAvailability({ ...base, opensSince: T(0) }, "opens");
    expect(measured.caveat).toMatch(/Apple Mail Privacy Protection/);
    expect(measured.caveat).toMatch(/never that a person read/);
  });

  it("reads the sending domain out of a From header", () => {
    expect(emailDomainOf("SiteMint Digital <noreply@SiteMintDigital.com>")).toBe("sitemintdigital.com");
    expect(emailDomainOf("noreply@example.test")).toBe("example.test");
    expect(emailDomainOf("not-an-address")).toBeNull();
    expect(emailDomainOf(null)).toBeNull();
  });
});

describe("the tag that says which record an email belongs to", () => {
  it("round-trips a record reference", () => {
    expect(emailRef("support_message", 12)).toBe("support_message-12");
    expect(parseEmailRef("support_message-12")).toEqual({ kind: "support_message", id: 12, qualifiers: [] });
    expect(parseEmailRef(emailRef("appointment_attendee", 7, "REQUEST", 3)))
      .toEqual({ kind: "appointment_attendee", id: 7, qualifiers: ["REQUEST", "3"] });
  });

  it("produces only characters the provider accepts in a tag", () => {
    const ref = emailRef("marketing_recipient", 5, "a b/c:d");
    expect(ref).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(emailRefTags(ref)).toEqual([{ name: EMAIL_REF_TAG_NAME, value: ref }]);
  });

  it("refuses anything this system did not write", () => {
    for (const bad of ["", "nonsense-1", "message-zero", "message--1", "message", null, 12, "message-0"]) {
      expect(parseEmailRef(bad as never), String(bad)).toBeNull();
    }
  });

  it("reads the tag back from either payload shape the provider may use", () => {
    expect(refFromTags({ [EMAIL_REF_TAG_NAME]: "message-4", category: "x" })).toBe("message-4");
    expect(refFromTags([{ name: EMAIL_REF_TAG_NAME, value: "message-4" }])).toBe("message-4");
    expect(refFromTags([{ name: "category", value: "x" }])).toBeNull();
    expect(refFromTags(undefined)).toBeNull();
    expect(refFromTags("message-4")).toBeNull();
  });
});
