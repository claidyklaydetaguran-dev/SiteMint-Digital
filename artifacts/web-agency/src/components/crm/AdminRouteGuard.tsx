/**
 * AdminRouteGuard — client-side access gate for every `/admin/*` screen
 * (O-10). Rendered by `CrmLayout`, `AdminDashboard` and `AdminSubmissionDetail`,
 * so the chrome never renders unauthenticated. The login page is exempt.
 *
 * Verification order, on the first page shown (cached per page load):
 *   1. `GET /api/crm/staff/me` succeeds → allowed, and the person's id is kept.
 *   2. `GET /api/admin/me` succeeds → allowed (the legacy shared admin: nobody).
 *   3. That endpoint 404s (older backend without the session route) → accept a
 *      present legacy token.
 *   4. Anything else → redirect to `/admin?redirect=<current path>`.
 *
 * Once a page is showing, a later 401 from any `adminFetch` call fires
 * `admin:unauthorized` — and the guard no longer navigates away. It opens
 * `SessionEndedDialog` OVER the page, which stays mounted with everything the
 * person had typed into it:
 *
 *   - signing in again as the SAME person closes the dialog and says so. Nothing
 *     is replayed: the person repeats their last action, knowingly.
 *   - signing in as somebody ELSE discards the previous person's preserved
 *     drafts and reloads into the CRM, so none of that person's data or unsent
 *     text stays on screen for the next one.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ADMIN_UNAUTHORIZED_EVENT,
  adminFetch,
  adminLoginPath,
  getAdminToken,
  resetUnauthorizedNotice,
  adminProbe,
} from "@/lib/adminFetch";
import { clearAllDrafts } from "@/lib/draftVault";
import { afterSessionSignIn, type SignedInStaff } from "@/lib/staffSignIn";
import { SessionEndedDialog } from "./SessionEndedDialog";

type GuardState = "checking" | "allowed" | "denied";

/** Where a different person lands after signing in over somebody else's page. */
const CRM_HOME = "/admin/crm";

const SIGNED_IN_AGAIN = "You're signed in again. Try your last action again.";

let verified = false;
/** The staff id the cached verification belongs to; null for the legacy shared admin. */
let verifiedStaffId: number | null = null;
let inflight: Promise<boolean> | null = null;

/** Drop the cached verification (called on 401 and on logout). */
export function invalidateAdminAccess(): void {
  verified = false;
  inflight = null;
}

async function staffIdFrom(res: Response): Promise<number | null> {
  try {
    const body = await res.json() as { staff?: { id?: unknown } };
    return typeof body.staff?.id === "number" ? body.staff.id : null;
  } catch {
    return null;
  }
}

async function verifyAccess(): Promise<boolean> {
  if (verified) return true;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // M1: a per-person staff session is the primary credential. Ask for it
      // first so the workspace reflects who is actually signed in. This is a
      // probe, not a request: a 401 here means "no staff session", not "signed
      // out", because the legacy bearer path may still be the valid one.
      const staff = await adminProbe("/api/crm/staff/me");
      if (staff.ok) {
        verifiedStaffId = await staffIdFrom(staff);
        return true;
      }
      const res = await adminFetch("/api/admin/me");
      if (res.ok) { verifiedStaffId = null; return true; }
      if (res.status === 404) { verifiedStaffId = null; return !!getAdminToken(); }
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
  const [sessionEnded, setSessionEnded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const redirected = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    const onUnauthorized = () => {
      invalidateAdminAccess();
      // Before the page is showing there is nothing to keep, and the check in
      // flight redirects on its own answer.
      if (stateRef.current !== "allowed") return;
      setNotice(null);
      setSessionEnded(true);
    };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onSignedIn = (staff: SignedInStaff | null) => {
    if (afterSessionSignIn(verifiedStaffId, staff) === "resume") {
      verified = true;
      resetUnauthorizedNotice();
      setSessionEnded(false);
      setNotice(SIGNED_IN_AGAIN);
      return;
    }
    // Somebody else signed in over this page. Their predecessor's unsent text
    // goes now, before anything can show it, and a full reload guarantees no
    // in-memory record of the previous person survives. The next page binds the
    // drafts to whoever is signed in.
    clearAllDrafts();
    invalidateAdminAccess();
    verifiedStaffId = null;
    window.location.replace(CRM_HOME);
  };

  if (state === "allowed") {
    return (
      <>
        {children}
        {sessionEnded && (
          <SessionEndedDialog onSignedIn={onSignedIn} onLeave={invalidateAdminAccess} />
        )}
        {/* Always mounted, so the message is announced when it appears. */}
        <div role="status" aria-live="polite">
          {notice && (
            <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-lg sm:inset-x-auto sm:right-6">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="min-w-0 flex-1 leading-relaxed">{notice}</p>
              <Button
                type="button" variant="ghost" size="sm"
                className="-my-1 shrink-0" onClick={() => setNotice(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </>
    );
  }

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
