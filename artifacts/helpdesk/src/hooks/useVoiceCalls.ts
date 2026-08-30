import { useQuery } from "@tanstack/react-query";
import {
  fetchVoiceProviderStatus,
  fetchRealCalls,
  fetchRealCallDetail,
  type VoiceProviderStatus,
  type RealCallSummary,
  type RealCallDetail,
} from "@/lib/voiceCallsApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const VOICE_CALLS_ROOT = "real-voice-calls" as const;
const UNRESOLVED_SESSION_KEY = [VOICE_CALLS_ROOT, "unresolved-session"] as const;

export function useVoiceProviderStatus() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<VoiceProviderStatus>({
    queryKey: firmId !== undefined ? [VOICE_CALLS_ROOT, "provider-status", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchVoiceProviderStatus,
    enabled: firmId !== undefined,
  });
}

export function useRealCallsList() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<{ items: RealCallSummary[]; count: number }>({
    queryKey: firmId !== undefined ? [VOICE_CALLS_ROOT, "list", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchRealCalls,
    enabled: firmId !== undefined,
  });
}

export function useRealCallDetail(callId: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && callId !== undefined;
  return useQuery<{ call: RealCallDetail } | undefined>({
    queryKey: resolved ? [VOICE_CALLS_ROOT, "detail", firmId, callId] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchRealCallDetail(callId as string),
    enabled: resolved,
  });
}
