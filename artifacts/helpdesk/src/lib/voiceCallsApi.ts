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

export interface RealCallDetail extends RealCallSummary {
  assistantId: string | null;
  endedReason: string | null;
  transcript: string | null;
  summary: string | null;
  analysis: unknown;
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
