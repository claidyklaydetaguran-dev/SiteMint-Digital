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
  const measured = engagement.tracked === true
    && typeof engagement.opens === "number" && typeof engagement.clicks === "number";
  if (!measured) {
    return {
      headline: "Not tracked",
      detail: engagement.unavailableReason ?? engagement.why,
      figures: [
        { label: "Opens", value: "Not tracked" },
        { label: "Clicks", value: "Not tracked" },
      ],
    };
  }
  return {
    headline: "Recorded by the mail provider",
    detail: "An open only means an image was loaded. Privacy features and security scanners load images automatically, so an open is never proof that a person read the email.",
    figures: [
      { label: "Opens recorded", value: String(engagement.opens) },
      { label: "Clicks recorded", value: String(engagement.clicks) },
    ],
  };
}
