import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchIssues, resolveIssue, type VoiceIssue } from "@/lib/issuesApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "voice-issues" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

function listKey(firmId: number | undefined) {
  return firmId !== undefined ? [ROOT, "list", firmId] : undefined;
}

export function useIssuesList() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<{ items: VoiceIssue[]; count: number }>({
    queryKey: listKey(firmId) ?? UNRESOLVED_SESSION_KEY,
    queryFn: fetchIssues,
    enabled: firmId !== undefined,
  });
}

export function useResolveIssue() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: string) => resolveIssue(id),
    onSuccess: () => {
      const key = listKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}
