/**
 * AdminRouteGuard — client-side access gate for every `/admin/*` screen
 * (O-10). Rendered by `CrmLayout`, `AdminDashboard` and `AdminSubmissionDetail`,
 * so the chrome never renders unauthenticated. The login page is exempt.
 *
 * Verification order:
 *   1. `GET /api/admin/me` succeeds → allowed.
 *   2. The endpoint 404s (older backend without the session route) → accept a
 *      present legacy token.
 *   3. Anything else → redirect to `/admin?redirect=<current path>`.
 *
 * Verification is cached per page load so navigating between CRM pages does
 * not re-ask; a later 401 from any `adminFetch` call clears the cache, fires
 * `admin:unauthorized`, and the guard redirects exactly once.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ADMIN_UNAUTHORIZED_EVENT,
  adminFetch,
  adminLoginPath,
  getAdminToken,
  resetUnauthorizedNotice,
} from "@/lib/adminFetch";

type GuardState = "checking" | "allowed" | "denied";

let verified = false;
let inflight: Promise<boolean> | null = null;

/** Drop the cached verification (called on 401 and on logout). */
export function invalidateAdminAccess(): void {
  verified = false;
  inflight = null;
}

async function verifyAccess(): Promise<boolean> {
  if (verified) return true;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await adminFetch("/api/admin/me");
      if (res.ok) return true;
      if (res.status === 404) return !!getAdminToken();
      return false;
    } catch {
      // Network failure: do not lock a working session out; fall back to the
      // token presence exactly like the older-backend path.
      return !!getAdminToken();
    }
  })();
  const ok = await inflight;
  inflight = null;
  verified = ok;
  if (ok) resetUnauthorizedNotice();
  return ok;
}

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [state, setState] = useState<GuardState>(verified ? "allowed" : "checking");
  const redirected = useRef(false);

  const redirectToLogin = () => {
    if (redirected.current) return;
    redirected.current = true;
    invalidateAdminAccess();
    navigate(adminLoginPath(), { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    if (state !== "allowed") {
      verifyAccess().then(ok => {
        if (cancelled) return;
        if (ok) setState("allowed");
        else { setState("denied"); redirectToLogin(); }
      });
    }
    const onUnauthorized = () => { setState("denied"); redirectToLogin(); };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="min-h-screen bg-crm-content flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <div className="w-4 h-4 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" aria-hidden="true" />
        {state === "checking" ? "Checking access…" : "Redirecting to sign in…"}
      </div>
    </div>
  );
}

export default AdminRouteGuard;
