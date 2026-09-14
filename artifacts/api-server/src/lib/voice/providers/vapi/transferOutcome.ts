// What Vapi's server events actually tell us about a transfer.
//
// All provider-specific interpretation lives here. The rest of the
// application sees only the neutral `TransferOutcome`, so a second provider
// with different evidence never leaks its vocabulary upward.
//
// The design constraint that shapes everything: **an event named
// `transfer-update` is not a person answering.** Vapi documents that message
// as carrying a `destination` and nothing else — no status, no result. So the
// most an acknowledgement can ever establish is "the provider acted on a
// transfer", and reporting that as success would be inventing the part the
// business actually cares about.
//
// Where real evidence does exist is `endedReason` on the end-of-call report,
// whose documented vocabulary names several specific FAILURES. Those we can
// report. There is no documented value meaning "the human picked up", which
// is why `connected` is unreachable here and `connectionKnowable` is false:
// on a blind transfer the assistant leaves the call, so nothing downstream is
// observable to us at all.

import type { TransferOutcome, TransferOutcomeState } from "../../types.js";
import type { ParsedVapiMessage } from "../../webhooks/vapiServerMessage.js";

/**
 * Documented `endedReason` values that mean the transfer did not work.
 * Each is a specific, provider-stated failure — not an inference.
 */
const FAILURE_REASONS: Record<string, string> = {
  "call.forwarding.operator-busy": "The person being transferred to was busy.",
  "call.in-progress.error-transfer-failed": "The provider could not complete the transfer.",
  "customer-ended-call-during-transfer": "The caller hung up while being transferred.",
  "customer-ended-call-before-warm-transfer": "The caller hung up before the transfer completed.",
  "customer-ended-call-after-warm-transfer-attempt": "The caller hung up after the transfer was attempted.",
  "call.in-progress.error-warm-transfer-max-duration": "The transfer ran past its maximum duration.",
  "call.in-progress.error-warm-transfer-assistant-cancelled": "The transfer was cancelled before it completed.",
  "call.in-progress.error-warm-transfer-silence-timeout": "The transfer timed out in silence.",
  "call.in-progress.error-warm-transfer-microphone-timeout": "The transfer timed out waiting for audio.",
};

/**
 * The one documented value meaning the assistant handed the call over.
 *
 * Deliberately NOT treated as success. It says the assistant forwarded the
 * call — the last thing it can observe before leaving. Whether anyone picked
 * up on the other side happens after that, where we cannot see.
 */
const HANDED_OVER_REASON = "assistant-forwarded-call";

/** Strength order. A stronger conclusion is never overwritten by a weaker one. */
const RANK: Record<TransferOutcomeState, number> = {
  none: 0,
  requested: 1,
  accepted: 2,
  unknown: 3,
  failed: 4,
  connected: 5,
};

/**
 * Masks a destination for display: last two digits only.
 *
 * It is the business's own contact, not caller-supplied, but a call record is
 * read by staff and support and there is no reason for the full line to sit
 * in it.
 */
export function maskDestination(dest: { type: string; number?: string; sipUri?: string } | undefined): string | null {
  if (!dest) return null;
  if (dest.number) {
    const digits = dest.number.replace(/[^\d]/g, "");
    return digits.length >= 2 ? `••••${digits.slice(-2)}` : "••••";
  }
  if (dest.sipUri) return "a SIP destination";
  return dest.type === "assistant" ? "another assistant" : dest.type;
}

export interface TransferEvidence {
  /** Did WE resolve a destination for this call? Our own record, independent of the provider. */
  requestedByUs?: boolean;
  /** Events for exactly one call, in any order. */
  events: readonly Pick<ParsedVapiMessage, "type" | "status" | "endedReason" | "transferDestination">[];
}

/**
 * Folds one call's events into a single honest answer.
 *
 * Order-independent by construction: every event proposes a state and the
 * strongest wins, so a redelivered or out-of-order webhook cannot downgrade a
 * conclusion or flip it back and forth. Duplicates are idempotent for the same
 * reason — proposing the same state twice changes nothing.
 */
export function deriveVapiTransferOutcome(input: TransferEvidence): TransferOutcome {
  let state: TransferOutcomeState = input.requestedByUs === true ? "requested" : "none";
  let evidence: string | null = null;
  let destination: string | null = null;

  const propose = (next: TransferOutcomeState, why: string | null) => {
    if (RANK[next] > RANK[state]) {
      state = next;
      evidence = why;
    }
  };

  for (const event of input.events) {
    if (event.transferDestination && destination === null) {
      destination = maskDestination(event.transferDestination);
    }

    switch (event.type) {
      case "transfer-destination-request":
        propose("requested", null);
        break;

      case "transfer-update":
        // The ceiling of what this message proves.
        propose("accepted", "The provider acknowledged the transfer.");
        break;

      case "status-update":
        if (event.status === "forwarding") {
          propose("accepted", "The provider reported the call as forwarding.");
        }
        break;

      case "end-of-call-report": {
        const reason = event.endedReason;
        if (reason === undefined) break;
        const failure = FAILURE_REASONS[reason];
        if (failure !== undefined) {
          propose("failed", failure);
        } else if (reason === HANDED_OVER_REASON) {
          // Handed over, and then silence. Saying "connected" here would be
          // the exact overstatement this module exists to prevent.
          propose("unknown", "The assistant handed the call over. Nothing further was reported.");
        }
        break;
      }

      default:
        break;
    }
  }

  // A transfer we asked for, on a call that then said nothing about it, is
  // still unresolved rather than merely "requested".
  if (state === "requested" && input.events.some((e) => e.type === "end-of-call-report")) {
    state = "unknown";
    evidence = "The call ended without the provider reporting what happened to the transfer.";
  }

  return {
    state,
    evidence,
    // Blind transfer: the assistant leaves, so connection is not observable.
    connectionKnowable: false,
    destinationMasked: destination,
  };
}
