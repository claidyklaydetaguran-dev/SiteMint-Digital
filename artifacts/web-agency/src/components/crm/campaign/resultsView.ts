// ── What the results screen is allowed to say ────────────────────────────────
//
// Pure, so the rules are testable without a DOM. Two of them are the point:
//
//   Every figure is a count of rows the screen can list. The tiles account for
//   everybody in the audience exactly once, so no number exists that a person
//   could not expand into names.
//
//   Nothing is reported that nothing measured. Opens and clicks read "Not
//   tracked", with the reason — never 0, which would be a claim about customers
//   with no evidence behind it. And where an open is ever recorded, it is called
//   what it is: an image loading, not a person reading.

import type { Results } from "./shared";

export interface ResultTile {
  key: string;
  label: string;
  value: number;
  hint: string;
}

export function resultTiles(results: Results): ResultTile[] {
  const { counts, deliverySignal } = results;
  const split = typeof deliverySignal.notDelivered === "number" && typeof deliverySignal.unconfirmed === "number";
  return [
    { key: "sent", label: "Sent", value: counts.sent, hint: "Accepted by the mail provider. Not proof it was read." },
    ...(split
      ? [
        {
          key: "notDelivered", label: "Not delivered", value: deliverySignal.notDelivered as number,
          hint: "Refused, or never handed over, so it did not arrive.",
        },
        {
          key: "unconfirmed", label: "Unconfirmed", value: deliverySignal.unconfirmed as number,
          hint: "Not confirmed by the mail provider. It may have arrived.",
        },
      ]
      // A server that does not split these cannot say which failures may have
      // arrived. Calling them all "failed" is what gets a second copy sent.
      : [{
        key: "notConfirmed", label: "Not confirmed", value: counts.failed,
        hint: "Not accepted, or no answer. The list below says which.",
      }]),
    { key: "excluded", label: "Left out", value: counts.excluded, hint: "Never mailed, each with a reason." },
    { key: "neverAttempted", label: "Never attempted", value: counts.neverAttempted, hint: "The send stopped before reaching them." },
  ];
}

export interface FailureGroup {
  key: string;
  label: string;
  /** "no" — it did not arrive. "unknown" — it may have. Never "yes". */
  arrived: "no" | "unknown";
  retryable: boolean;
  people: { id: number; name: string; address: string | null; lastError: string | null }[];
}

/** The people who were attempted and not accepted, grouped by what is known about each. */
export function failureGroups(results: Results): FailureGroup[] {
  if (results.failedByOutcome) {
    return results.failedByOutcome
      .filter((b) => b.count > 0)
      .map((b) => ({
        key: b.outcome,
        label: b.label,
        arrived: b.arrived,
        retryable: b.retryable === true,
        people: b.contacts.map((c) => ({ id: c.id, name: c.name, address: c.address ?? null, lastError: c.lastError ?? null })),
      }));
  }
  const failed = results.recipients.filter((r) => r.status === "failed");
  if (failed.length === 0) return [];
  // Unsplit: the honest reading is "may have arrived", and nothing is offered a
  // retry on the strength of a guess.
  return [{
    key: "unsplit",
    label: "Not confirmed delivered",
    arrived: "unknown",
    retryable: false,
    people: failed.map((r) => ({ id: r.id, name: r.name, address: r.address ?? null, lastError: r.lastError ?? null })),
  }];
}

/** How many people "Try again" would reach. Zero unless the server said so. */
export function retryableCount(results: Results): number {
  const n = results.deliverySignal.retryable;
  return typeof n === "number" && n > 0 ? n : 0;
}

export interface EngagementView {
  headline: string;
  detail: string;
  figures: { label: string; value: string }[];
}

export function engagementView(engagement: Results["engagement"]): EngagementView {
  // Per metric. Open tracking and click tracking are separate settings on the
  // sending domain, so one can be measured while the other is not — and a
  // single flag would either hide a real figure or invent a missing one. A
  // server that predates the split sends neither field, and its single flag is
  // used for both.
  const measuredOpens = (engagement.opensMeasured ?? engagement.tracked === true)
    && typeof engagement.opens === "number";
  const measuredClicks = (engagement.clicksMeasured ?? engagement.tracked === true)
    && typeof engagement.clicks === "number";

  if (!measuredOpens && !measuredClicks) {
    return {
      headline: "Not tracked",
      detail: engagement.unavailableReason ?? engagement.why,
      figures: [
        { label: "Opens", value: "Not tracked" },
        { label: "Clicks", value: "Not tracked" },
      ],
    };
  }

  const people = (value: number | null | undefined, rate: number | null) =>
    typeof value === "number"
      ? `${value}${typeof rate === "number" ? ` · ${rate}%` : ""}`
      : "—";

  return {
    headline: "Recorded by the mail provider",
    detail: engagement.caveat
      ?? "An open only means an image was loaded. Privacy features and security scanners load images automatically, so an open is never proof that a person read the email.",
    figures: [
      { label: "Opens recorded", value: measuredOpens ? String(engagement.opens) : "Not measured" },
      // Named for what it is: people, not events. One contact opening four
      // times is one person who opened it, which is what the rate divides.
      { label: "People who opened", value: measuredOpens ? people(engagement.uniqueOpens, engagement.openRate) : "Not measured" },
      { label: "Clicks recorded", value: measuredClicks ? String(engagement.clicks) : "Not measured" },
      { label: "People who clicked", value: measuredClicks ? people(engagement.uniqueClicks, engagement.clickRate) : "Not measured" },
    ],
  };
}

export interface DeliveryReportRow {
  key: string;
  label: string;
  count: number;
  /** True for the states that mean nothing arrived. */
  attention: boolean;
}

/**
 * What the provider reported about the messages it accepted.
 *
 * Only states that actually occurred are listed: a row of zeroes reads as a
 * measurement of nothing, and the count that matters most — the accepted
 * messages with no report at all — is stated in its own words instead of being
 * shown as a zero somewhere else.
 */
export function deliveryReport(results: Results): DeliveryReportRow[] {
  const provider = results.deliverySignal.provider;
  if (!provider) return [];
  const rows: DeliveryReportRow[] = [
    { key: "delivered", label: "Delivered", count: provider.delivered, attention: false },
    { key: "delayed", label: "Delayed", count: provider.delayed, attention: false },
    { key: "sent", label: "Accepted, no delivery report yet", count: provider.sent, attention: false },
    { key: "bounced", label: "Bounced", count: provider.bounced, attention: true },
    { key: "complained", label: "Marked as spam", count: provider.complained, attention: true },
    { key: "failed", label: "Failed at the provider", count: provider.failed, attention: true },
    { key: "suppressed", label: "Blocked by the provider", count: provider.suppressed, attention: true },
    { key: "noReport", label: "No report from the provider", count: provider.noReport, attention: false },
  ];
  return rows.filter((row) => row.count > 0);
}
