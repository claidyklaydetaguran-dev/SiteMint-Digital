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
      // One terminal report per call is expected; a second delivery with
      // different content is treated as the same logical event and dropped
      // rather than silently overwriting the first.
      return `${message.call.id}:end-of-call-report`;
    case "hang":
      return `${message.call.id}:hang`;
    case "function-call":
      return `${message.call.id}:function-call:${shortHash(JSON.stringify(message.analysis ?? null))}`;
    case "assistant-request":
      return `${message.call.id}:assistant-request`;
  }
}
