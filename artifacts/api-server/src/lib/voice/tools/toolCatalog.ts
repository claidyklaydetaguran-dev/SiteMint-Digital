// P3: the closed catalog of tools a SiteMint voice assistant may carry.
//
// Two audiences, one source of truth:
//   - the DISPATCHER validates incoming tool-call arguments against the zod
//     schemas (never trusting the model),
//   - the PUBLISH/SYNC payload builder emits the matching JSON-schema
//     `parameters` to the provider so the model produces those arguments in
//     the first place.
//
// Mandatory safety rules honored by construction:
//   - No tool accepts a URL, phone number for routing, provider id, firm id,
//     or credential from the model. Identity fields here are display-only
//     contact details for a human reviewer; tenancy comes exclusively from
//     assistant linkage in the webhook route.
//   - The catalog is closed: a name outside TOOL_NAMES is refused by both
//     the dispatcher and the payload validator.

import { z } from "zod/v4";
import type { JsonObject } from "../types.js";

export const TOOL_NAMES = [
  "check_availability",
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "save_message",
] as const;
export type VoiceToolName = (typeof TOOL_NAMES)[number];

export function isVoiceToolName(value: unknown): value is VoiceToolName {
  return typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);
}

// ── argument schemas (dispatcher-side) ───────────────────────────────────────

const DATE_KEY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/** ISO instant with timezone designator — the engine works in UTC instants. */
const ISO_INSTANT = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/, "must be an ISO datetime with zone")
  .refine((s: string) => Number.isFinite(Date.parse(s)), "must parse as a datetime");

const UUID = z.string().uuid();

/** Bounded free text; trimmed; control characters rejected. */
function boundedText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s: string) => !/[\u0000-\u001f\u007f]/.test(s), "control characters are not allowed");
}

export const checkAvailabilityArgs = z
  .object({
    date: DATE_KEY,
    appointmentTypeId: boundedText(32).optional(),
  })
  .strict();

export const bookAppointmentArgs = z
  .object({
    appointmentTypeId: boundedText(32),
    startIso: ISO_INSTANT,
    customerName: boundedText(120),
    notes: boundedText(500).optional(),
    /** Spoken-back contact details for the reviewing human; never used for routing. */
    customerPhone: boundedText(32).optional(),
    customerEmail: z.string().trim().max(200).email().optional(),
    smsConsent: z.boolean().optional(),
  })
  .strict();

export const rescheduleAppointmentArgs = z
  .object({
    requestId: UUID,
    newStartIso: ISO_INSTANT,
  })
  .strict();

export const cancelAppointmentArgs = z
  .object({
    requestId: UUID,
  })
  .strict();

/**
 * V7: take a message for the business.
 *
 * Nothing here identifies a tenant, names a destination, or carries a
 * credential — the firm comes exclusively from the webhook's assistant linkage,
 * exactly as for every other tool. `callbackPhone` and `callbackEmail` are
 * contact details for a human to act on, never used for routing or dialling.
 *
 * `emailCopyRequested` exists so the caller's explicit "yes, email me a copy"
 * is carried as its own fact. An address the caller merely stated is not
 * consent to be emailed, so the acknowledgement path reads this flag and never
 * infers permission from the address being present.
 */
export const saveMessageArgs = z
  .object({
    callerName: boundedText(120),
    topic: boundedText(120),
    details: boundedText(2000),
    callbackPhone: boundedText(32).optional(),
    callbackEmail: z.string().trim().max(200).email().optional(),
    urgency: z.enum(["normal", "urgent"]).optional(),
    emailCopyRequested: z.boolean().optional(),
  })
  .strict()
  // Structural guarantee for the schema's own promise above: the flag cannot be
  // true without an address to honour it, so a malformed pair is rejected
  // before persistence rather than silently downgraded.
  .refine(
    (v) => v.emailCopyRequested !== true || typeof v.callbackEmail === "string",
    { message: "an email copy requires the caller's email address" },
  );

export const TOOL_ARG_SCHEMAS: Record<VoiceToolName, z.ZodType> = {
  check_availability: checkAvailabilityArgs,
  book_appointment: bookAppointmentArgs,
  reschedule_appointment: rescheduleAppointmentArgs,
  cancel_appointment: cancelAppointmentArgs,
  save_message: saveMessageArgs,
};

export type CheckAvailabilityArgs = z.infer<typeof checkAvailabilityArgs>;
export type BookAppointmentArgs = z.infer<typeof bookAppointmentArgs>;
export type RescheduleAppointmentArgs = z.infer<typeof rescheduleAppointmentArgs>;
export type CancelAppointmentArgs = z.infer<typeof cancelAppointmentArgs>;
export type SaveMessageArgs = z.infer<typeof saveMessageArgs>;

// ── provider-facing definitions (payload-side) ───────────────────────────────

/** JSON-schema `parameters` per tool — the wire twin of the zod schemas above. */
export const TOOL_PARAMETER_SCHEMAS: Record<VoiceToolName, JsonObject> = {
  check_availability: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: {
      date: { type: "string", description: "Calendar date to check, YYYY-MM-DD, in the business's timezone." },
      appointmentTypeId: { type: "string", description: "Appointment type id from a previous availability answer. Omit to use the default type." },
    },
  },
  book_appointment: {
    type: "object",
    additionalProperties: false,
    required: ["appointmentTypeId", "startIso", "customerName"],
    properties: {
      appointmentTypeId: { type: "string", description: "Appointment type id from check_availability." },
      startIso: { type: "string", description: "Chosen slot start, exactly as returned by check_availability (ISO datetime)." },
      customerName: { type: "string", description: "Caller's name for the appointment." },
      customerPhone: { type: "string", description: "Callback number the caller states, if any." },
      customerEmail: { type: "string", description: "Email the caller states, if any." },
      notes: { type: "string", description: "Anything the caller wants the office to know." },
      smsConsent: { type: "boolean", description: "True only if the caller explicitly agrees to receive a confirmation text." },
    },
  },
  reschedule_appointment: {
    type: "object",
    additionalProperties: false,
    required: ["requestId", "newStartIso"],
    properties: {
      requestId: { type: "string", description: "The appointment reference id given when it was booked." },
      newStartIso: { type: "string", description: "New slot start from check_availability (ISO datetime)." },
    },
  },
  cancel_appointment: {
    type: "object",
    additionalProperties: false,
    required: ["requestId"],
    properties: {
      requestId: { type: "string", description: "The appointment reference id given when it was booked." },
    },
  },
  save_message: {
    type: "object",
    additionalProperties: false,
    required: ["callerName", "topic", "details"],
    properties: {
      callerName: { type: "string", description: "The caller's name, as they gave it and you read it back to them." },
      topic: { type: "string", description: "A short subject line for the office, e.g. 'Quote for kitchen rewire'." },
      details: {
        type: "string",
        description:
          "What the caller asked for, in their own terms. Include only what they actually said — never add prices, dates, hours, or commitments they did not state.",
      },
      callbackPhone: { type: "string", description: "Callback number the caller states, if any. Read it back before saving." },
      callbackEmail: { type: "string", description: "Email address the caller states, if any. Read it back before saving." },
      urgency: {
        type: "string",
        enum: ["normal", "urgent"],
        description: "Use 'urgent' only if the caller says it is urgent or time-critical.",
      },
      emailCopyRequested: {
        type: "boolean",
        description:
          "True only if the caller explicitly asks to be emailed a copy AND has given their email address. Never true otherwise.",
      },
    },
  },
};

export const TOOL_DESCRIPTIONS: Record<VoiceToolName, string> = {
  check_availability: "Look up open appointment slots for a date before offering times to the caller.",
  book_appointment: "Book one offered slot for the caller after they confirm a specific time.",
  reschedule_appointment: "Move an existing appointment the caller references to a new confirmed slot.",
  cancel_appointment: "Cancel an existing appointment the caller references.",
  save_message:
    "Save the caller's request as a message for the business to follow up. Call this after confirming their name and the details back to them, and only say it is saved once this tool has answered successfully.",
};
