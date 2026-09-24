// What a finished call contributes to the usage ledger. Pure: the webhook
// supplies the parsed end-of-call report and the time it arrived.
//
// Every real provider call is metered, browser tests included — they spend the
// same provider minutes as a telephone call, so leaving them out would make
// usage understate what the business consumed. The channel travels with the
// row so usage can show browser tests separately instead of hiding them.
//
// The one exclusion is deliberate and narrow: a SiteMint-generated QA event,
// identified by its reserved call-id namespace, which no provider ever billed.
// Missing caller details are never a reason to skip metering.

import type { ParsedVapiMessage } from "../voice/webhooks/vapiServerMessage.js";
import {
  deriveCallChannel,
  isSyntheticQaCallId,
  type CallChannel,
} from "../voice/webhooks/callStateModel.js";

export type MeteringDecision =
  | { meter: true; durationSec: number; endedAt: Date; channel: CallChannel }
  | { meter: false; reason: "synthetic_qa_event" | "no_provider_duration" };

export function meteringDecisionForReport(message: ParsedVapiMessage, receivedAt: Date): MeteringDecision {
  if (isSyntheticQaCallId(message.call.id)) return { meter: false, reason: "synthetic_qa_event" };

  // The provider's own figure first; otherwise its own start and end times.
  // Receipt times are never used — they measure our webhook, not the call.
  let durationSec: number | undefined = message.durationSeconds;
  if (durationSec === undefined && message.startedAtIso && message.endedAtIso) {
    const span = (Date.parse(message.endedAtIso) - Date.parse(message.startedAtIso)) / 1000;
    if (Number.isFinite(span) && span >= 0) durationSec = span;
  }
  if (durationSec === undefined) return { meter: false, reason: "no_provider_duration" };

  // The billing month follows when the call ended, not when the report landed:
  // a call that ends at 23:59 on the 31st belongs to that month even if its
  // report is redelivered the next morning.
  const endedAt = message.endedAtIso ? new Date(message.endedAtIso) : receivedAt;
  const channel = deriveCallChannel(
    message.call.callType,
    Boolean(message.call.phoneNumberId || message.call.customerNumber),
  );
  return { meter: true, durationSec, endedAt, channel };
}
