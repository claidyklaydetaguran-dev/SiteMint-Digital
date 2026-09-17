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

/** Who is signed in: the business's main account, or a team member. */
export interface SessionViewer {
  email: string;
  role: "owner" | "staff";
  accountHolder: boolean;
}

export interface SessionData {
  firm: SessionFirm;
  conversationCount: number;
  /** Absent from servers that predate team access; treat that as the main account. */
  viewer?: SessionViewer;
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

/**
 * The signed-in person's role. The server enforces it on every request; the
 * dashboard uses it only to avoid offering actions that would be refused.
 * While the session is unresolved, nobody is treated as an owner.
 */
export function useViewer(): { isOwner: boolean; accountHolder: boolean; role: "owner" | "staff" | null; email: string | null } {
  const { data } = useSession();
  if (!data) return { isOwner: false, accountHolder: false, role: null, email: null };
  const viewer = data.viewer ?? { email: data.firm.email ?? "", role: "owner" as const, accountHolder: true };
  return { isOwner: viewer.role === "owner", accountHolder: viewer.accountHolder, role: viewer.role, email: viewer.email };
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await fetch("/api/receptionist/auth/logout", { method: "POST", credentials: "include" });
    qc.clear();
  };
}

// The rule itself lives in `sessionAccess.ts`, which imports nothing — no
// React, no React Query, no `@/` alias. Its contract test runs under plain
// tsx, and reaching it through this file would drag in `@/lib/api` and fail
// at module load. Re-exported here so existing callers are unaffected.
import { classifySessionAccess, type SessionAccess } from "./sessionAccess.js";

export { classifySessionAccess };
export type { SessionAccess };

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
