import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNumbers, pauseNumber, unpauseNumber, type PhoneNumberSummary } from "@/lib/numbersApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "voice-numbers" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

function listKey(firmId: number | undefined) {
  return firmId !== undefined ? [ROOT, "list", firmId] : undefined;
}

export function useNumbersList() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<{ items: PhoneNumberSummary[]; count: number }>({
    queryKey: listKey(firmId) ?? UNRESOLVED_SESSION_KEY,
    queryFn: fetchNumbers,
    enabled: firmId !== undefined,
  });
}

export function usePauseNumber() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => pauseNumber(id),
    onSuccess: () => {
      const key = listKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUnpauseNumber() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => unpauseNumber(id),
    onSuccess: () => {
      const key = listKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}
