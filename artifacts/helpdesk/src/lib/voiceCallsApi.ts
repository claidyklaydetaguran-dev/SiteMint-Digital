/**
 * Milestone 2 foundation: client for the real (Vapi + Twilio) call read
 * endpoints and the honest provider-readiness status endpoint. Same-origin,
 * cookie-authenticated requests only — never a client-controlled firmId.
 */

const API_BASE = "/api";

export const INTERNAL_CALL_STATES = [
  "queued",
  "ringing",
  "connecting",
  "in_progress",
  "completed",
  "failed",
  "no_answer",
  "busy",
  "canceled",
  "provider_error",
] as const;
export type InternalCallState = (typeof INTERNAL_CALL_STATES)[number];

export interface RealCallSummary {
  callId: string;
  source: "vapi_twilio";
  state: InternalCallState;
  stateLabel: string;
  isFinal: boolean;
  callerNumberDisplay: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
}

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

/** Mirrors artifacts/api-server/src/lib/voice/webhooks/structuredOutcome.ts — the one centralized, versioned, application-facing shape every genuine call's analysis is normalized into. */
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

/** "invalid" is never sent by the server — the API always collapses it into "unavailable" (see receptionistVoiceCalls.ts). */
export type StructuredOutcomeAvailability = "available" | "unavailable";

export interface RealCallDetail extends RealCallSummary {
  assistantId: string | null;
  endedReason: string | null;
  transcript: string | null;
  summary: string | null;
  analysisAvailability: StructuredOutcomeAvailability;
  structuredOutcome: StructuredOutcome | null;
}

export interface VoiceProviderStatus {
  vapiApiKeyConfigured: boolean;
  vapiWebhookSecretConfigured: boolean;
  vapiPublicKeyConfigured: boolean;
  developmentPhoneNumberVerified: boolean;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = Object.assign(new Error(`API ${res.status}`), { status: res.status });
    throw err;
  }
  return res.json() as Promise<T>;
}

export function fetchVoiceProviderStatus(): Promise<VoiceProviderStatus> {
  return apiFetch<VoiceProviderStatus>("/receptionist/voice/provider-status");
}

export function fetchRealCalls(): Promise<{ items: RealCallSummary[]; count: number }> {
  return apiFetch<{ items: RealCallSummary[]; count: number }>("/receptionist/voice/calls");
}

export function fetchRealCallDetail(callId: string): Promise<{ call: RealCallDetail } | undefined> {
  return apiFetch<{ call: RealCallDetail }>(`/receptionist/voice/calls/${encodeURIComponent(callId)}`).catch(
    (err: unknown) => {
      if (err instanceof Error && (err as Error & { status?: number }).status === 404) return undefined;
      throw err;
    },
  );
}
