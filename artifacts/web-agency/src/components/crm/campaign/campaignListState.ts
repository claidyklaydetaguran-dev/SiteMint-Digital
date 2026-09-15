// ── How a campaign reads on the list ─────────────────────────────────────────
//
// Kept apart from the page so the wording rules are testable without a DOM.

import { formatWhen, type Campaign } from "./shared";

export type StateFilter = "all" | "draft" | "scheduled" | "sending" | "completed" | "attention" | "cancelled";

export interface DisplayState {
  key: Exclude<StateFilter, "all">;
  label: string;
  className: string;
  /** Shown under the name when something is not as it looks. */
  note: string | null;
}

/**
 * What state a campaign is really in, from the operator's point of view.
 *
 * The stored status is not enough on its own. "Scheduled" is a promise, and on
 * a server where nothing starts a scheduled send it is a promise nobody will
 * keep — so it is reported as needing attention, with the reason, rather than
 * as a quiet success.
 */
export function displayState(c: Campaign, autosend: boolean): DisplayState {
  const failed = c.counts?.["failed"] ?? 0;
  const attention = "bg-amber-50 text-amber-900 border border-amber-300";

  if (c.status === "paused") {
    return { key: "attention", label: "Needs attention", className: attention, note: "Paused part-way through a send." };
  }
  if (c.status === "scheduled" && !autosend) {
    return {
      key: "attention", label: "Needs attention", className: attention,
      note: `Scheduled for ${formatWhen(c.scheduledAt, c.scheduledTimezone)}, but nothing on this server will start it — somebody has to press Send.`,
    };
  }
  if (failed > 0 && (c.status === "sent" || c.status === "cancelled")) {
    return {
      key: "attention", label: "Needs attention", className: attention,
      // Not "refused": some of these may have had no answer from the provider
      // and be in somebody's inbox. Results says which is which.
      note: `${failed} ${failed === 1 ? "message was" : "messages were"} not confirmed delivered — open Results to see which did not arrive and which may have.`,
    };
  }
  if (c.status === "scheduled") {
    return {
      key: "scheduled", label: "Scheduled", className: "bg-teal-50 text-teal-900 border border-teal-200",
      note: `Starts on its own at ${formatWhen(c.scheduledAt, c.scheduledTimezone)}.`,
    };
  }
  if (c.status === "sending") {
    return { key: "sending", label: "Sending", className: "bg-teal-700 text-white", note: null };
  }
  if (c.status === "sent") {
    return { key: "completed", label: "Completed", className: "bg-emerald-50 text-emerald-900 border border-emerald-200", note: null };
  }
  if (c.status === "cancelled") {
    return { key: "cancelled", label: "Cancelled", className: "bg-muted text-muted-foreground border border-border", note: null };
  }
  return { key: "draft", label: "Draft", className: "bg-muted text-muted-foreground border border-border", note: null };
}

/**
 * The one-line account of what a campaign's send did.
 *
 * "Sent" rather than "delivered": the provider accepting a message is not a
 * delivery confirmation. And "not confirmed" rather than "failed", for the
 * same reason the tile on the results screen says it.
 */
export function resultsLine(c: Campaign): string {
  if (c.status === "draft" || c.status === "scheduled") return "Not sent yet";
  const sent = c.counts?.["sent"] ?? 0;
  const failed = c.counts?.["failed"] ?? 0;
  const excluded = c.counts?.["excluded"] ?? 0;
  return `${sent} sent${failed ? `, ${failed} not confirmed` : ""}${excluded ? `, ${excluded} left out` : ""}`;
}
