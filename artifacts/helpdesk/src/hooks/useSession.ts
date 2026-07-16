import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SessionFirm {
  id: number;
  name: string;
  email: string | null;
  planTier: string;
  trialConversationsLimit: number;
  createdAt: string;
}

export interface SessionData {
  firm: SessionFirm;
  conversationCount: number;
}

export const SESSION_KEY = ["receptionist-me"] as const;

export function useSession() {
  return useQuery<SessionData>({
    queryKey: SESSION_KEY,
    queryFn: () => apiFetch<SessionData>("/receptionist/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useInvalidateSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SESSION_KEY });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" });
    qc.clear();
  };
}
