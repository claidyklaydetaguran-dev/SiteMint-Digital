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

/** How the call reached the assistant, from the provider's own call type. */
export const CALL_CHANNELS = ["telephone", "browser", "unknown"] as const;
export type CallChannel = (typeof CALL_CHANNELS)[number];

/**
 * Levels of evidence about handing a caller to a person — not steps in a
 * progress bar. `accepted` is an acknowledgement, never someone answering.
 */
export const TRANSFER_STATES = ["none", "requested", "accepted", "connected", "failed", "unknown"] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];

export interface TransferOutcome {
  state: TransferState;
  evidence: string | null;
  /** False for a blind transfer: nothing after the handover is observable. */
  connectionKnowable: boolean;
  destinationMasked: string | null;
}

export interface RealCallSummary {
  callId: string;
  source: "vapi_twilio";
  channel: CallChannel;
  /** A SiteMint QA event, never a real call. */
  synthetic: boolean;
  state: InternalCallState;
  stateLabel: string;
  isFinal: boolean;
  /** Null unless a caller number was actually received. */
  callerNumberDisplay: string | null;
  startedAt: string;
  endedAt: string | null;
  /** The provider's own measurement. Null reads as "not available". */
  durationSec: number | null;
  transferState: TransferState;
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
  transfer: TransferOutcome;
  /**
   * The server-owned retention policy for this account, carried on the record
   * itself so the page needs no second request to say what is kept. Optional
   * so a dashboard deployed ahead of its backend degrades safely.
   */
  artifactPolicy?: ArtifactPolicy;
}

/**
 * The server-owned artifact policy, reported by name. "unknown" is what an
 * unset or unrecognised policy reports — it is never upgraded into a
 * permissive answer, and anything other than an explicit retaining policy is
 * treated as "nothing is kept".
 */
export const ARTIFACT_POLICIES = ["none", "transcript_only", "full", "unknown"] as const;
export type ArtifactPolicy = (typeof ARTIFACT_POLICIES)[number];

export interface VoiceProviderStatus {
  vapiApiKeyConfigured: boolean;
  vapiWebhookSecretConfigured: boolean;
  vapiPublicKeyConfigured: boolean;
  developmentPhoneNumberVerified: boolean;
  /** Optional so a dashboard deployed ahead of its backend degrades safely. */
  artifactPolicy?: ArtifactPolicy;
}

/** Only an explicitly retaining policy may display a transcript. Fail closed. */
export function policyRetainsTranscript(policy: ArtifactPolicy | undefined): boolean {
  return policy === "transcript_only" || policy === "full";
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
