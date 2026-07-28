// Structured call-outcome contract — the one centralized, typed, versioned
// application-facing shape every genuine Vapi call's analysis is normalized
// into, regardless of exactly what Vapi's analysisPlan.structuredDataSchema
// happens to return. This is deliberately NOT the same shape as Vapi's own
// `call.analysis.structuredData` JSON — the provider-side schema can change
// independently of this contract.
//
// Provider mechanism (docs.vapi.ai/assistants/call-analysis, verified
// 2026-07): the assistant's `analysisPlan.structuredDataSchema` (a JSON
// Schema) plus `structuredDataPrompt` produce `call.analysis.structuredData`;
// `analysisPlan.summaryPrompt` produces `call.analysis.summary`. Vapi's own
// docs note analysis "is triggered in the background and typically
// completes within a few seconds" — so it may not be present on the first
// end-of-call-report delivery and can arrive on a later, updated delivery of
// the same event type. See eventKey.ts for how that's kept idempotent
// without silently dropping the update.

export const STRUCTURED_OUTCOME_SCHEMA_VERSION = "1.0" as const;

export const URGENCY_VALUES = ["low", "normal", "high"] as const;
export type Urgency = (typeof URGENCY_VALUES)[number];

export const APPOINTMENT_STATUS_VALUES = ["not_requested", "pending_review"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS_VALUES)[number];

export const FOLLOW_UP_STATUS_VALUES = ["not_requested", "pending_review"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUS_VALUES)[number];

export const DISPOSITION_OUTCOME_VALUES = [
  "information_requested",
  "appointment_requested",
  "message_taken",
  "spam",
  "unresolved",
] as const;
export type DispositionOutcome = (typeof DISPOSITION_OUTCOME_VALUES)[number];

export interface StructuredOutcome {
  schemaVersion: "1.0";
  caller: {
    name: string | null;
    phoneAvailable: boolean;
    email: string | null;
    companyOrBusiness: string | null;
  };
  inquiry: {
    reason: string | null;
    serviceInterest: string[];
    businessType: string | null;
    pricingQuestion: boolean;
    urgency: Urgency | null;
  };
  appointmentRequest: {
    requested: boolean;
    preferredDateText: string | null;
    preferredTimeText: string | null;
    timezone: string | null;
    status: AppointmentStatus;
  };
  followUp: {
    requested: boolean;
    phoneConsent: boolean;
    smsConsent: boolean;
    emailConsent: boolean;
    status: FollowUpStatus;
  };
  disposition: {
    outcome: DispositionOutcome;
    summary: string | null;
  };
}

/**
 * `available`  — valid structured data was present and normalized below.
 * `unavailable` — no structured data was supplied at all (this includes
 *   every call made before analysisPlan was configured — see
 *   docs/ai-receptionist/VOICE_PLATFORM.md "Historical calls").
 * `invalid`    — structured data was supplied but failed validation (kept
 *   distinct from `unavailable` for diagnostics only; every reader-facing
 *   surface — API and UI alike — treats `invalid` exactly like
 *   `unavailable`, per the "Structured analysis unavailable" requirement).
 */
export type StructuredOutcomeAvailability = "available" | "unavailable" | "invalid";

export type ParseStructuredOutcomeResult =
  | { availability: "available"; outcome: StructuredOutcome }
  | { availability: "unavailable" }
  | { availability: "invalid"; reason: string };

// Documented limits — a provider-generated string/array is untrusted input
// and must never pass through unbounded.
const MAX_SHORT_STRING = 200;
const MAX_LONG_STRING = 1000;
const MAX_SERVICE_INTEREST_ITEMS = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bounded, trimmed string, or null for anything else — never throws, never truncates silently into a misleading fragment (rejects instead by returning null when over the limit). */
function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/** Never infers `true` — only an explicit boolean `true` in the provider payload counts. Anything else (missing, string "true", 1, null) is `false`. This is the single choke point enforcing "do not infer consent." */
function safeBooleanDefaultFalse(value: unknown): boolean {
  return value === true;
}

function safeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function safeServiceInterest(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    const s = safeString(item, MAX_SHORT_STRING);
    if (s) items.push(s);
    if (items.length >= MAX_SERVICE_INTEREST_ITEMS) break;
  }
  return items;
}

/**
 * Validates and normalizes Vapi's raw `call.analysis.structuredData` (as
 * delivered in an end-of-call-report message) into the stable application
 * contract. Every unrecognized field is silently stripped (never copied
 * through) simply by never being read. Unknown/invalid enum values and
 * over-limit strings degrade to their null-safe default rather than
 * invalidating the whole record — the record is only `invalid` when the
 * top-level shape itself isn't a usable object at all.
 */
export function parseStructuredOutcome(rawAnalysis: unknown): ParseStructuredOutcomeResult {
  if (rawAnalysis === undefined || rawAnalysis === null) {
    return { availability: "unavailable" };
  }
  if (!isPlainObject(rawAnalysis)) {
    return { availability: "invalid", reason: "analysis_not_object" };
  }

  const structuredData = rawAnalysis["structuredData"];
  if (structuredData === undefined || structuredData === null) {
    // Vapi delivered an analysis object (e.g. with just a summary) but no
    // structured data yet — honestly unavailable, not a validation failure.
    return { availability: "unavailable" };
  }
  if (!isPlainObject(structuredData)) {
    return { availability: "invalid", reason: "structured_data_not_object" };
  }

  const callerRaw = isPlainObject(structuredData["caller"]) ? structuredData["caller"] : {};
  const inquiryRaw = isPlainObject(structuredData["inquiry"]) ? structuredData["inquiry"] : {};
  const appointmentRaw = isPlainObject(structuredData["appointmentRequest"]) ? structuredData["appointmentRequest"] : {};
  const followUpRaw = isPlainObject(structuredData["followUp"]) ? structuredData["followUp"] : {};
  const dispositionRaw = isPlainObject(structuredData["disposition"]) ? structuredData["disposition"] : {};

  const appointmentRequested = safeBooleanDefaultFalse(appointmentRaw["requested"]);
  const followUpRequested = safeBooleanDefaultFalse(followUpRaw["requested"]);

  const rawSummary =
    safeString(dispositionRaw["summary"], MAX_LONG_STRING) ?? safeString(rawAnalysis["summary"], MAX_LONG_STRING);

  const outcome: StructuredOutcome = {
    schemaVersion: STRUCTURED_OUTCOME_SCHEMA_VERSION,
    caller: {
      name: safeString(callerRaw["name"], MAX_SHORT_STRING),
      phoneAvailable: safeBooleanDefaultFalse(callerRaw["phoneAvailable"]),
      email: safeString(callerRaw["email"], MAX_SHORT_STRING),
      companyOrBusiness: safeString(callerRaw["companyOrBusiness"], MAX_SHORT_STRING),
    },
    inquiry: {
      reason: safeString(inquiryRaw["reason"], MAX_LONG_STRING),
      serviceInterest: safeServiceInterest(inquiryRaw["serviceInterest"]),
      businessType: safeString(inquiryRaw["businessType"], MAX_SHORT_STRING),
      pricingQuestion: safeBooleanDefaultFalse(inquiryRaw["pricingQuestion"]),
      urgency: safeEnum(inquiryRaw["urgency"], URGENCY_VALUES),
    },
    appointmentRequest: {
      requested: appointmentRequested,
      // Preserved verbatim as caller/AI wording — never normalized into a
      // fabricated date/time when the transcript was ambiguous.
      preferredDateText: safeString(appointmentRaw["preferredDateText"], MAX_SHORT_STRING),
      preferredTimeText: safeString(appointmentRaw["preferredTimeText"], MAX_SHORT_STRING),
      timezone: safeString(appointmentRaw["timezone"], MAX_SHORT_STRING),
      status: appointmentRequested ? "pending_review" : "not_requested",
    },
    followUp: {
      requested: followUpRequested,
      // Channel-specific and never inferred from one another: a phone
      // number being present, or appointment interest, or an email address
      // being mentioned, is not consent for that channel or any other.
      phoneConsent: safeBooleanDefaultFalse(followUpRaw["phoneConsent"]),
      smsConsent: safeBooleanDefaultFalse(followUpRaw["smsConsent"]),
      emailConsent: safeBooleanDefaultFalse(followUpRaw["emailConsent"]),
      status: followUpRequested ? "pending_review" : "not_requested",
    },
    disposition: {
      outcome: safeEnum(dispositionRaw["outcome"], DISPOSITION_OUTCOME_VALUES) ?? "unresolved",
      summary: rawSummary,
    },
  };

  return { availability: "available", outcome };
}
