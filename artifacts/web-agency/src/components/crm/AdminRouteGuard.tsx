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
import { CheckCircle2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ADMIN_UNAUTHORIZED_EVENT,
  adminFetch,
  adminLoginPath,
  getAdminToken,
  resetUnauthorizedNotice,
  adminProbe,
} from "@/lib/adminFetch";
import { resolveAccess, type AccessOutcome } from "@/lib/adminAccess";
import { subscribeConnection } from "@/lib/connectionState";
import { clearAllDrafts } from "@/lib/draftVault";
import { afterSessionSignIn, type SignedInStaff } from "@/lib/staffSignIn";
import { SessionEndedDialog } from "./SessionEndedDialog";

type GuardState = "checking" | "allowed" | "denied" | "unreachable";

/** Where a different person lands after signing in over somebody else's page. */
const CRM_HOME = "/admin/crm";

const SIGNED_IN_AGAIN = "You're signed in again. Try your last action again.";

let verified = false;
/** The staff id the cached verification belongs to; null for the legacy shared admin. */
let verifiedStaffId: number | null = null;
let inflight: Promise<AccessOutcome> | null = null;

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

/**
 * M1: a per-person staff session is the primary credential, asked for first so
 * the workspace reflects who is actually signed in. Its 401 means "no staff
 * session", not "signed out", because the legacy bearer path may still be the
 * valid one — and a request that never completed means neither. The three-way
 * answer lives in `lib/adminAccess` so it can be tested without a browser.
 */
async function verifyAccess(): Promise<AccessOutcome> {
  if (verified) return "allowed";
  if (inflight) return inflight;
  inflight = resolveAccess({
    probeStaff: () => adminProbe("/api/crm/staff/me"),
    probeLegacy: () => adminFetch("/api/admin/me"),
    hasLegacyToken: () => !!getAdminToken(),
    staffIdFrom,
  }).then((result) => {
    if (result.outcome === "allowed") verifiedStaffId = result.staffId;
    return result.outcome;
  });
  const outcome = await inflight;
  inflight = null;
  verified = outcome === "allowed";
  if (verified) resetUnauthorizedNotice();
  return outcome;
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

  /** Apply one answer. Only a real refusal throws the page away. */
  const applyOutcome = (outcome: AccessOutcome) => {
    if (outcome === "allowed") { setState("allowed"); return; }
    if (outcome === "unreachable") { setState("unreachable"); return; }
    setState("denied");
    redirectToLogin();
  };

  const retryAccess = () => {
    setState("checking");
    verifyAccess().then(applyOutcome);
  };

  useEffect(() => {
    let cancelled = false;
    if (state !== "allowed") {
      verifyAccess().then(outcome => {
        if (cancelled) return;
        applyOutcome(outcome);
      });
    }
    // While the server is unreachable, any other request completing proves the
    // transport is back — so the page recovers on its own rather than waiting
    // for somebody to notice the button.
    const unsubscribe = subscribeConnection(connection => {
      if (connection.status === "online" && stateRef.current === "unreachable") {
        verifyAccess().then(outcome => { if (!cancelled) applyOutcome(outcome); });
      }
    });
    // The subscription alone is not enough: when the application is down, the
    // proxy in front of it ANSWERS (a 500/502), so the transport looks healthy
    // and no connection event ever fires. Asking again on a timer is what
    // actually brings the page back without anybody touching it.
    const poll = window.setInterval(() => {
      if (stateRef.current !== "unreachable") return;
      verifyAccess().then(outcome => { if (!cancelled) applyOutcome(outcome); });
    }, 8_000);
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
      unsubscribe();
      window.clearInterval(poll);
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

  // A server we could not reach has told us nothing about this person's
  // credentials, so the page stays and says so. Signing somebody out because
  // their connection dropped for a moment is how unsaved work disappears.
  if (state === "unreachable") {
    return (
      <div className="min-h-screen bg-crm-content flex items-center justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-sm sm:p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
              <PlugZap className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-snug text-foreground">Can't reach the server</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                This is a connection problem, not a sign-out. Your session is untouched and nothing
                you were working on has been sent anywhere. This page comes back on its own as soon
                as the server answers.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={retryAccess} className="h-11 w-full sm:w-auto">
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full sm:w-auto"
              onClick={() => navigate(adminLoginPath(), { replace: true })}
            >
              Go to the sign-in page
            </Button>
          </div>
        </div>
      </div>
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
