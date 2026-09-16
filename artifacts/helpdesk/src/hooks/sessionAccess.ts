// What a failed session request actually means.
//
// The dashboard used to treat every session error as "signed out" and send the
// person to the login page. A request that never completed — a restarting
// instance, a dropped connection, a laptop waking up — counted as a refusal, so
// an operator or a business owner could be thrown out of a half-filled form by
// a blip that had nothing to do with their session.
//
// This module holds the rule and nothing else: no React, no React Query, no
// `@/` alias. That is deliberate. The contract test runs under plain `tsx` from
// the scripts package, which resolves neither the alias nor the framework, so a
// rule that lives beside `useSession`'s hooks cannot be tested there at all —
// importing it would pull in `@/lib/api` and fail at module load. Every other
// contract module in this app is pure for the same reason.

/**
 *   "loading"     — the request has not settled yet.
 *   "allowed"     — the server answered with a session.
 *   "denied"      — the server answered 401/403. This is the only signed-out
 *                   signal, and the only one that may navigate away.
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
