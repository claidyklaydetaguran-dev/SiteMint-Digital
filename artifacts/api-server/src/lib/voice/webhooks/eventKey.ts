// Milestone 2 foundation: idempotency key derivation for
// provider_webhook_events.eventKey (unique per (provider, eventKey)).
//
// Vapi redelivers server messages on transport failure, so the SAME logical
// event (e.g. one "in-progress" status-update) may arrive more than once and
// must collapse to a single stored row. A call also legitimately produces
// several DISTINCT events of the same `type` over its lifetime (queued →
// ringing → in-progress → ended), so the key must vary with the field that
// actually changed, not just call id + type.

import { createHash } from "node:crypto";
import type { ParsedVapiMessage } from "./vapiServerMessage.js";

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/**
 * Builds a stable dedupe key for one parsed Vapi server message. Two
 * deliveries of the identical logical event always produce the same key;
 * two genuinely distinct events (even of the same type) almost always don't.
 */
export function buildVapiEventKey(message: ParsedVapiMessage): string {
  switch (message.type) {
    case "status-update":
      return `${message.call.id}:status-update:${message.status ?? "unknown"}`;
    case "end-of-call-report":
      // Vapi's own docs note analysis "is triggered in the background and
      // typically completes within a few seconds" — so a second
      // end-of-call-report for the same call, arriving once analysis
      // finishes, is a genuine update (new transcript/summary/analysis
      // content), not a duplicate, and must not be silently dropped. Keying
      // on a hash of the content means a byte-identical retry still
      // collapses to one row, while a content-different redelivery is
      // stored as its own event and folded in additively (see
      // callStateModel.ts) rather than overwriting the first.
      return `${message.call.id}:end-of-call-report:${shortHash(
        JSON.stringify({ transcript: message.transcript, summary: message.summary, analysis: message.analysis }),
      )}`;
    case "transfer-destination-request":
      // One logical lookup per call attempt; retries collapse.
      return `${message.call.id}:transfer-destination-request`;
    case "transfer-update":
      return `${message.call.id}:transfer-update:${shortHash(JSON.stringify(message.status ?? null))}`;
    case "hang":
      return `${message.call.id}:hang`;
    case "tool-calls":
      // One delivery of a batch of tool calls is one logical event; Vapi
      // retries redeliver the same ids. Distinct batches carry distinct ids.
      return `${message.call.id}:tool-calls:${shortHash(
        JSON.stringify((message.toolCallList ?? []).map((t) => t.id).sort()),
      )}`;
    case "function-call":
      return `${message.call.id}:function-call:${shortHash(JSON.stringify(message.analysis ?? null))}`;
    case "assistant-request":
      return `${message.call.id}:assistant-request`;
  }
}
