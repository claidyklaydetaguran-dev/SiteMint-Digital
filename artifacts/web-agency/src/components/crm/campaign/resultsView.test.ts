/**
 * What the campaign results screen may claim.
 *
 * Two rules, each easy to break by making the screen "friendlier":
 *
 *   - Every figure is a count of rows that can be listed, and together they
 *     account for everybody in the audience exactly once.
 *   - Nothing reports what nothing measured. Opens and clicks read "Not
 *     tracked", with the reason, rather than 0 — and an unknown delivery
 *     outcome is never folded into "did not arrive", which is what makes
 *     somebody send a second copy.
 */
import { describe, it, expect } from "vitest";
import { deliveryReport, engagementView, failureGroups, resultTiles, retryableCount } from "./resultsView";
import type { Results } from "./shared";

const person = (id: number, status: string, lastError: string | null = null) => ({
  id, leadId: 100 + id, name: `Person ${id}`, address: `p${id}@example.test`, status, lastError,
});

const results = (over: Partial<Results> = {}): Results => ({
  counts: { audience: 7, sent: 2, failed: 3, excluded: 1, neverAttempted: 1, testSends: 0 },
  excludedByReason: [{ reason: "unsubscribed", label: "Unsubscribed", count: 1, contacts: [{ leadId: 106, name: "Person 6" }] }],
  failedByOutcome: [
    { outcome: "rejected", label: "Refused by the mail provider", arrived: "no", retryable: true, count: 1,
      contacts: [{ id: 3, leadId: 103, name: "Person 3", address: "p3@example.test", lastError: "rejected: bad address" }] },
    { outcome: "failed", label: "Not sent — the connection to the mail provider never opened", arrived: "no", retryable: true, count: 1,
      contacts: [{ id: 4, leadId: 104, name: "Person 4", address: "p4@example.test", lastError: "failed: 503" }] },
    { outcome: "uncertain", label: "Not confirmed by the mail provider — it may or may not have arrived", arrived: "unknown", retryable: false, count: 1,
      contacts: [{ id: 5, leadId: 105, name: "Person 5", address: "p5@example.test", lastError: "uncertain: timeout" }] },
  ],
  recipients: [
    person(1, "sent"), person(2, "sent"),
    person(3, "failed", "rejected: bad address"), person(4, "failed", "failed: 503"), person(5, "failed", "uncertain: timeout"),
    person(6, "excluded"), person(7, "pending"),
  ],
  engagement: {
    tracked: false, opens: null, clicks: null, openRate: null, clickRate: null,
    unavailableReason: "No custom tracking domain is configured, so nothing records an open or a click.",
    why: "Opens and clicks are not tracked for these campaigns.",
  },
  deliverySignal: {
    meaning: "\"Sent\" means the mail provider accepted the message.",
    providerIdsRecorded: 2, notDelivered: 2, unconfirmed: 1, retryable: 2,
    unconfirmedNote: "Whether it arrived is unknown.",
  },
  definitions: {},
  ...over,
});

describe("the delivery figures", () => {
  it("account for everybody in the audience exactly once, each equal to its own list", () => {
    const r = results();
    const tiles = Object.fromEntries(resultTiles(r).map((t) => [t.key, t.value]));
    const of = (s: string) => r.recipients.filter((x) => x.status === s).length;

    expect(Object.values(tiles).reduce((s, n) => s + n, 0)).toBe(r.counts.audience);
    expect(tiles["sent"]).toBe(of("sent"));
    expect(tiles["notDelivered"] + tiles["unconfirmed"]).toBe(of("failed"));
    expect(tiles["excluded"]).toBe(of("excluded"));
    expect(tiles["neverAttempted"]).toBe(of("pending"));

    const groups = failureGroups(r);
    expect(groups.flatMap((g) => g.people)).toHaveLength(of("failed"));
    expect(tiles["unconfirmed"]).toBe(groups.filter((g) => g.arrived === "unknown").flatMap((g) => g.people).length);
  });

  it("keeps an unknown outcome out of 'not delivered' and out of Try again", () => {
    const r = results();
    const unknown = failureGroups(r).find((g) => g.key === "uncertain");
    expect(unknown).toMatchObject({ arrived: "unknown", retryable: false });
    expect(retryableCount(r)).toBe(2);
    expect(failureGroups(r).filter((g) => g.retryable).flatMap((g) => g.people).map((p) => p.id)).toEqual([3, 4]);
  });

  it("does not call every failure 'failed' when the server cannot say which may have arrived", () => {
    // An older server: no split, no retry count.
    const r = results({
      failedByOutcome: undefined,
      deliverySignal: { meaning: "\"Sent\" means accepted.", providerIdsRecorded: 2 },
    });
    const tiles = resultTiles(r);
    expect(tiles.map((t) => t.label)).not.toContain("Not delivered");
    expect(tiles.map((t) => t.label)).not.toContain("Failed");
    expect(tiles.find((t) => t.key === "notConfirmed")?.value).toBe(3);
    expect(tiles.reduce((s, t) => s + t.value, 0)).toBe(r.counts.audience);

    const groups = failureGroups(r);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ arrived: "unknown", retryable: false });
    expect(retryableCount(r)).toBe(0);
  });
});

describe("opens and clicks", () => {
  it("are shown as not tracked, with the reason, and never as a zero", () => {
    const view = engagementView(results().engagement);
    expect(view.headline).toBe("Not tracked");
    expect(view.detail).toMatch(/tracking domain/i);
    for (const f of view.figures) {
      expect(f.value).toBe("Not tracked");
      expect(f.value).not.toMatch(/\d|%/);
    }
  });

  it("are not invented from a server that says tracked but sends no numbers", () => {
    const view = engagementView({ ...results().engagement, tracked: true, opens: null, clicks: null });
    expect(view.headline).toBe("Not tracked");
    expect(view.figures.map((f) => f.value)).not.toContain("0");
  });

  it("never present a recorded open as a person reading the email", () => {
    const view = engagementView({ ...results().engagement, tracked: true, opens: 5, clicks: 1 });
    expect(view.detail).toMatch(/never proof that a person read/i);
    for (const f of view.figures) expect(f.label).not.toMatch(/read|seen|viewed/i);
  });

  it("measures each metric on its own evidence, and says so for the other", () => {
    // Open tracking and click tracking are separate settings on the sending
    // domain. One measured and one not is an ordinary state, and collapsing
    // them either hides a real figure or invents a missing one.
    const view = engagementView({
      ...results().engagement,
      tracked: true, opensMeasured: true, clicksMeasured: false,
      opens: 9, uniqueOpens: 4, openRate: 40,
      clicks: null, uniqueClicks: null, clickRate: null,
      caveat: "Opens are inflated by mail privacy proxies.",
    });
    expect(view.headline).toBe("Recorded by the mail provider");

    const byLabel = Object.fromEntries(view.figures.map((f) => [f.label, f.value]));
    expect(byLabel["Opens recorded"]).toBe("9");
    // The rate divides PEOPLE by people: one contact opening nine times is one
    // person who opened it.
    expect(byLabel["People who opened"]).toBe("4 · 40%");
    expect(byLabel["Clicks recorded"]).toBe("Not measured");
    expect(byLabel["People who clicked"]).toBe("Not measured");
    expect(view.detail).toMatch(/privacy proxies/i);
  });
});

describe("the provider's delivery report", () => {
  it("lists only the states that actually occurred, and marks the ones that need somebody", () => {
    const r = results({
      deliverySignal: {
        meaning: "\"Sent\" means the provider accepted it.",
        providerIdsRecorded: 6,
        provider: {
          sent: 1, delayed: 0, delivered: 3, bounced: 2,
          complained: 0, failed: 0, suppressed: 0, noReport: 1, messagesWithReports: 6,
        },
      },
    });

    const rows = deliveryReport(r);
    // A row of zeroes reads as a measurement of nothing, so the states that
    // did not happen are absent rather than shown as 0.
    expect(rows.map((x) => x.key)).toEqual(["delivered", "sent", "bounced", "noReport"]);
    expect(rows.find((x) => x.key === "bounced")!.attention).toBe(true);
    expect(rows.find((x) => x.key === "delivered")!.attention).toBe(false);
    expect(rows.reduce((sum, x) => sum + x.count, 0)).toBe(7);
  });

  it("shows nothing at all against a server that has no delivery reports", () => {
    expect(deliveryReport(results())).toEqual([]);
  });
});
