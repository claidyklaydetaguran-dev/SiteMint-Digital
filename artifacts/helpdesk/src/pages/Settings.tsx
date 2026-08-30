/**
 * Frontend V2 Phase 11 — the Settings workspace.
 *
 * Mounted at `ROUTES.settings` (`/settings`, base-relative) inside the Phase 7
 * `DashboardShell`. It inherits that shell's navigation rail, `<main>`
 * landmark, skip link, palette, focus ring and motion system, and adds no
 * second design system and no chrome of its own.
 *
 * ── Requests: the shell's session, and nothing else ───────────────────────
 * `useSession()` reads the **same** React Query entry the shell has already
 * fetched (`SESSION_KEY`, `GET /api/receptionist/auth/me`, `staleTime: 60_000`).
 * Mounting a second observer on a resolved, fresh entry issues no request — the
 * pattern Billing and Overview already use. This page adds no query of its own,
 * no settings endpoint, no mutation, no cache entry, no refetch interval and no
 * polling. The only request it can cause is the logout POST, and only when the
 * operator activates Sign out.
 *
 * Authentication, the loading gate and the redirect on an expired session are
 * the shell's, unchanged: `AppShell` renders its own boot state while the
 * session is in flight and navigates to `/login` on error, so no authenticated
 * content here can paint before authorisation resolves. The local loading branch
 * below is a second belt on the same trousers, not a replacement.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 * A page of invented preferences: a fixed display language, a fixed time zone,
 * a fixed date format, two Change buttons wired to nothing, two uncontrolled
 * switches that persisted nothing, and a "Coming Soon" promise of multi-user
 * access that no document in this repository makes. None of it was backed by an
 * endpoint, a column, or a decision. Every claim on this route now comes from
 * `settings/settingsContract.ts`, which owns each string and each rule.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { useSession, useLogout } from "@/hooks/useSession";
import {
  accountFields,
  accountNote,
  destinations,
  NOT_AVAILABLE,
  pageCopy,
  preferenceNotice,
  sessionCopy,
  signOutLabel,
  SIGN_OUT_TIMEOUT_MS,
  type SignOutState,
} from "@/pages/settings/settingsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-settings.css";

export default function Settings() {
  const { data: me, isLoading } = useSession();
  const [, navigate] = useLocation();
  const logout = useLogout();

  const [signOut, setSignOut] = useState<SignOutState>("idle");
  const signOutRef = useRef<HTMLButtonElement | null>(null);
  // Survives unmount: a resolved logout navigates away, and a state update on a
  // page that is already gone is a warning nobody can act on.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The way out after a failure is the control that failed, so focus returns to
  // it — a keyboard user must never have to hunt for the retry.
  useEffect(() => {
    if (signOut === "failed") signOutRef.current?.focus();
  }, [signOut]);

  const handleSignOut = useCallback(async () => {
    if (signOut === "pending") return;
    setSignOut("pending");
    try {
      // A logout that never answers must not strand the button in `pending`
      // with no way back; the wait is bounded and the outcome is stated.
      await Promise.race([
        logout(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), SIGN_OUT_TIMEOUT_MS),
        ),
      ]);
      if (!alive.current) return;
      navigate("/login");
    } catch {
      if (!alive.current) return;
      setSignOut("failed");
    }
  }, [logout, navigate, signOut]);

  const page = pageCopy();
  const notice = preferenceNotice();
  const session = sessionCopy();

  if (isLoading) {
    return (
      <div className="sg-page">
        <p className="sg-loading" role="status" aria-live="polite">
          Loading account information…
        </p>
      </div>
    );
  }

  // The shell has already redirected on a session error. Rendering nothing here
  // guarantees no authenticated shape appears in the frame before it does.
  if (!me) return null;

  const fields = accountFields(me.firm);
  const places = destinations();

  return (
    <div className="sg-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{page.eyebrow}</span>
          <h1 className="sd-page__title">{page.title}</h1>
          <p className="sg-lede">{page.detail}</p>
        </div>
      </div>

      {/* Read-only account values, straight from the authenticated session.
          A description list, not a form: there is no control here because there
          is nothing to submit, and a disabled input would imply otherwise. */}
      <section className="sd-section" aria-labelledby="sg-account-title">
        {/* One child, so the shell's space-between head keeps the note with
            its heading instead of throwing it to the far edge of the column. */}
        <div className="sd-section__head">
          <div>
            <h2 className="sd-h2" id="sg-account-title">
              Account
            </h2>
            <p className="sg-note">{accountNote()}</p>
          </div>
        </div>
        <dl className="sg-fields">
          {fields.map((field) => (
            <div className="sg-fields__row" key={field.label}>
              <dt className="sg-fields__label">{field.label}</dt>
              <dd className="sg-fields__value" data-missing={field.value === null}>
                {field.value ?? NOT_AVAILABLE}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The two places configuration genuinely happens. Real links, so the
          destination is visible on hover and focus and can be opened in a new
          tab; the card is not the control. */}
      <section className="sd-section" aria-labelledby="sg-config-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-config-title">
            Configuration
          </h2>
        </div>
        <ul className="sg-places">
          {places.map((place) => (
            <li className="sg-place" key={place.href}>
              <div className="sg-place__body">
                <h3 className="sg-place__title">{place.title}</h3>
                <p className="sg-place__detail">{place.detail}</p>
              </div>
              <Link href={place.href} className="sd-link sg-place__action">
                {place.action}
                <ArrowRight className="sg-icon" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Stated once, without warning colour and without a promise. Neutral:
          nothing is broken and nothing is waiting on the operator. */}
      <section
        className="sd-status sg-status"
        data-state={notice.tone}
        aria-labelledby="sg-prefs-title"
      >
        <div className="sd-status__head">
          <span className="sd-status__dot" aria-hidden="true" />
          <div className="sd-status__body">
            <h2 className="sd-status__title" id="sg-prefs-title">
              {notice.title}
            </h2>
            <p className="sd-status__detail">{notice.detail}</p>
          </div>
        </div>
      </section>

      {/* A real action against a real endpoint, so it is a button. No token,
          session identifier, firm identifier or cookie detail is exposed. */}
      <section className="sd-section" aria-labelledby="sg-session-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sg-session-title">
            {session.title}
          </h2>
        </div>
        <div className="sg-session">
          <p className="sg-session__detail">{session.detail}</p>
          <button
            ref={signOutRef}
            type="button"
            className="sg-signout"
            onClick={handleSignOut}
            disabled={signOut === "pending"}
            aria-busy={signOut === "pending"}
          >
            {signOutLabel(signOut)}
          </button>
        </div>
        {signOut === "failed" && (
          <div className="sg-failure" role="alert">
            <p className="sg-failure__title">{session.errorTitle}</p>
            <p className="sg-failure__detail">{session.errorDetail}</p>
          </div>
        )}
      </section>
    </div>
  );
}
