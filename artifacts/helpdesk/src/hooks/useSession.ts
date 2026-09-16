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
 * What a failed session request actually means.
 *
 * The dashboard used to treat every session error as "signed out" and send the
 * person to the login page. A request that never completed — a restarting
 * instance, a dropped connection, a laptop waking up — counted as a refusal,
 * so an operator or a business owner could be thrown out of a half-filled form
 * by a blip that had nothing to do with their session.
 *
 *   "allowed"     — the server answered with a session.
 *   "denied"      — the server answered 401/403. This is the only signed-out
 *                   signal, and the only one that navigates away.
 *   "unreachable" — no answer, or the server failed. The page stays as it is
 *                   and says so; the next successful request clears it.
 */
export type SessionAccess = "loading" | "allowed" | "denied" | "unreachable";

export function classifySessionAccess(state: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  hasData: boolean;
}): SessionAccess {
  if (state.isLoading) return "loading";
  if (state.isError) {
    const status = (state.error as { status?: unknown } | undefined)?.status;
    return status === 401 || status === 403 ? "denied" : "unreachable";
  }
  return state.hasData ? "allowed" : "unreachable";
}

/** The session, classified — see `classifySessionAccess`. */
export function useSessionAccess(): { access: SessionAccess; refetch: () => void } {
  const query = useSession();
  return {
    access: classifySessionAccess({
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      hasData: query.data !== undefined,
    }),
    refetch: () => void query.refetch(),
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
