import { useQuery } from "@tanstack/react-query";
import { fetchUsage, type UsagePeriod } from "@/lib/usageApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "voice-usage" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

/** `period` omitted reads the server's current billing period. */
export function useUsage(period?: string) {
  const firmId = useAuthenticatedFirmId();
  return useQuery<UsagePeriod>({
    queryKey: firmId !== undefined ? [ROOT, firmId, period ?? "current"] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchUsage(period),
    enabled: firmId !== undefined,
  });
}
