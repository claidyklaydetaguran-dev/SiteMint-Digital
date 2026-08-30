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

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" });
    qc.clear();
  };
}

/**
 * The authenticated firm id, or `undefined` whenever it cannot be trusted —
 * while the session is still loading, on any session error, or once fully
 * resolved but unauthenticated. Callers must never substitute a fallback id
 * here; tenant-scoped caches (e.g. assistants) key directly off this value
 * so that "unresolved" can never coincide with a real firm's cache entry.
 */
export function useAuthenticatedFirmId(): number | undefined {
  const { data, isLoading, isError } = useSession();
  if (isLoading || isError || !data) return undefined;
  return data.firm.id;
}

/**
 * Used only right after a successful login POST. Unlike invalidateQueries
 * (which only forces a real refetch when the query already has an active
 * observer), fetchQuery unconditionally performs a fresh network request
 * and writes the result into the cache before resolving — so by the time
 * the caller navigates into the authenticated app, `useSession()` is
 * guaranteed to reflect the newly-authenticated firm, never a stale
 * previous-firm identity left over from before this login.
 */
export function useRefreshSessionAfterLogin() {
  const qc = useQueryClient();
  return async () => {
    qc.removeQueries({ queryKey: SESSION_KEY });
    await qc.fetchQuery({
      queryKey: SESSION_KEY,
      queryFn: () => apiFetch<SessionData>("/receptionist/auth/me"),
    });
  };
}
