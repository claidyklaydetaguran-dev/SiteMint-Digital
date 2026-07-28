// Milestone 2 foundation: Vapi Server Message envelope parsing.
//
// Message types and envelope shape (`{ "message": { "type": ..., ... } }`)
// verified against Vapi's official starter (github.com/VapiAI/vapi-express-
// starter, src/types/vapi.types.ts / src/webhooks/vapi.webhook.ts, fetched
// 2026-07). We only need to safely and defensively extract the handful of
// fields below — we never assume any field beyond `type` is present, since
// Vapi's own starter leaves the nested `Call` shape effectively open-ended.

export const VAPI_SERVER_MESSAGE_TYPES = [
  "assistant-request",
  "function-call",
  "status-update",
  "end-of-call-report",
  "hang",
] as const;

export type VapiServerMessageType = (typeof VAPI_SERVER_MESSAGE_TYPES)[number];

/** Vapi's documented in-call status values for status-update messages. */
export type VapiCallStatus = "queued" | "ringing" | "in-progress" | "forwarding" | "ended";

export interface VapiCallRef {
  id: string;
  assistantId?: string;
  phoneNumberId?: string;
  /** Present on some payload shapes; we only ever display a masked form. */
  customerNumber?: string;
}

export interface ParsedVapiMessage {
  type: VapiServerMessageType;
  call: VapiCallRef;
  status?: VapiCallStatus;
  endedReason?: string;
  transcript?: string;
  summary?: string;
  /** Vapi structured-output / analysis payload, if the assistant produced one. Untyped — validated field-by-field by the caller before display. */
  analysis?: unknown;
  timestamp?: number;
}

export type ParseVapiServerMessageResult =
  | { ok: true; message: ParsedVapiMessage }
  | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Defensively parses a Vapi Server Message HTTP request body. Rejects
 * anything that isn't shaped like `{ message: { type, call: { id }, ... } }`
 * with a recognized `type` and a non-empty `call.id` — every other field is
 * read opportunistically and never required, since Vapi's own type
 * definitions leave most of the Call object unspecified.
 */
export function parseVapiServerMessage(body: unknown): ParseVapiServerMessageResult {
  if (!isPlainObject(body)) {
    return { ok: false, reason: "body_not_object" };
  }
  const message = body.message;
  if (!isPlainObject(message)) {
    return { ok: false, reason: "missing_message" };
  }
  const { type } = message;
  if (typeof type !== "string" || !VAPI_SERVER_MESSAGE_TYPES.includes(type as VapiServerMessageType)) {
    return { ok: false, reason: "unknown_message_type" };
  }

  const call = message.call;
  if (!isPlainObject(call) || !isNonEmptyString(call.id)) {
    return { ok: false, reason: "missing_call_id" };
  }

  const callRef: VapiCallRef = { id: call.id };
  if (isNonEmptyString(call.assistantId)) callRef.assistantId = call.assistantId;
  if (isNonEmptyString(call.phoneNumberId)) callRef.phoneNumberId = call.phoneNumberId;
  if (isNonEmptyString(call.customer)) callRef.customerNumber = call.customer;
  if (isPlainObject(call.customer) && isNonEmptyString(call.customer.number)) {
    callRef.customerNumber = call.customer.number;
  }

  const parsed: ParsedVapiMessage = { type: type as VapiServerMessageType, call: callRef };
  if (isNonEmptyString(message.status)) parsed.status = message.status as VapiCallStatus;
  if (isNonEmptyString(message.endedReason)) parsed.endedReason = message.endedReason;
  if (isNonEmptyString(message.transcript)) parsed.transcript = message.transcript;
  if (isNonEmptyString(message.summary)) parsed.summary = message.summary;
  if ("analysis" in message) parsed.analysis = message.analysis;
  if (typeof message.timestamp === "number") parsed.timestamp = message.timestamp;

  return { ok: true, message: parsed };
}
