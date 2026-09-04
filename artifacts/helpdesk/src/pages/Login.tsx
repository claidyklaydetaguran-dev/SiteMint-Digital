/**
 * Frontend V2 Phase 6 — the AI Receptionist sign-in page.
 *
 * The filename and default export are unchanged on purpose: `App.tsx` still
 * lazy-loads this module at `ROUTES.login` inside `AuthShell`, so the route,
 * its base-path handling, and the dashboard's protection are preserved by
 * construction rather than by re-derivation.
 *
 * **Frozen contract.** The endpoint, the method, `credentials: "include"`, the
 * `{ email, password }` body, the httpOnly `receptionist_session` cookie the
 * server sets, the session refresh before navigation, and the destination the
 * page navigates to on success are exactly what shipped before. They live in
 * `login/loginContract.ts` so a committed test can assert them; extracting them
 * changed no value.
 *
 * **What changed is presentation and product truth.** The Phase 5 page was a
 * dark centred card with no statement of what the account is for — a generic
 * login template. This one is the light-forward companion to the approved
 * signup page, and it says plainly that the capability behind these credentials
 * is the SMS receptionist: the same three readiness tiers, in the same words as
 * the landing and signup pages, sit beside the form rather than above it, and a
 * closing line states that voice and connected CRM are not part of the
 * dashboard yet. Nothing on the page claims a voice, booking, CRM, response-time
 * or outcome capability.
 *
 * **No authentication method beyond email/password and reset was added.**
 * V5 S-2 added a real password-reset flow (`pages/PasswordReset.tsx` +
 * `pages/PasswordResetComplete.tsx`, contract in
 * `password-reset/passwordResetContract.ts`), so this page now carries a
 * "Forgot password?" link into it. Nothing else was added: no federated
 * provider, no remember-me field — a social button would still be a control
 * wired to nothing.
 *
 * Accessibility. One `h1`; persistent visible labels with explicit "Required"
 * text; `autocomplete="email"` / `"current-password"` so password managers
 * work; a keyboard- and screen-reader-reachable password-visibility toggle;
 * inline errors tied to their input by `aria-describedby`; a form-level alert
 * that takes focus on failure; 44px minimum controls; and a submitting state
 * that blocks a second submission without the button losing contrast.
 */

import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { publicSiteUrl } from "@/lib/routes";
import { useRefreshSessionAfterLogin } from "@/hooks/useSession";
import {
  EMPTY_LOGIN_FORM,
  LOGIN_CREDENTIALS,
  LOGIN_ENDPOINT,
  LOGIN_METHOD,
  LOGIN_NETWORK_ERROR,
  LOGIN_SUCCESS_ROUTE,
  buildLoginPayload,
  mapLoginError,
  validateLogin,
  type LoginFormValues,
} from "./login/loginContract";
import { CAPABILITY_STATUS, READINESS } from "./login/readiness";
import "@/styles/v2-signin.css";
import "@/styles/v3-app.css";
// Frontend V4 Signal retheme — token-value override one layer above V3.
// ROLLBACK: remove this import to restore the V3 appearance.
import "@/styles/v4-app.css";

/**
 * The public marketing surfaces this page links back out to. Both are in the
 * *other* application, so they are resolved through the centralised path layer
 * and consumed with a document navigation — never with `<Link>`, which would
 * prepend this app's base and produce a doubled prefix.
 */
const LANDING_URL = publicSiteUrl("/ai-receptionist");
const SIGNUP_URL = publicSiteUrl("/ai-receptionist/signup");

export default function Login() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<LoginFormValues>(EMPTY_LOGIN_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const refreshSessionAfterLogin = useRefreshSessionAfterLogin();

  const alertRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const set =
    (key: keyof LoginFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A second submission while one is in flight would create a second session
    // request; the disabled button is the visible half of this guard.
    if (submitting) return;

    setError("");
    setFieldErrors({});

    const result = validateLogin(form);
    if (!result.ok) {
      setError(result.formError);
      setFieldErrors(result.fieldErrors);
      // Focus goes to the field the rule implicates, so a keyboard or
      // screen-reader user lands on the problem rather than at the top.
      (result.focusField === "password" ? passwordRef : emailRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(LOGIN_ENDPOINT, {
        method: LOGIN_METHOD,
        credentials: LOGIN_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLoginPayload(form)),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        // Nothing about the submitted credentials is logged or echoed — only
        // the server's own message is shown.
        setError(mapLoginError(res.status, data.error).message);
        // The alert is focusable and takes focus, so the failure is announced
        // rather than silently rendered. The typed email is left untouched.
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }

      // Fetch the new session before navigating so the authenticated app never
      // briefly renders under the previous firm's identity or cache.
      await refreshSessionAfterLogin();
      navigate(LOGIN_SUCCESS_ROUTE);
    } catch {
      setError(LOGIN_NETWORK_ERROR);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (field: "email" | "password", ...extra: string[]) => {
    const ids = [...extra];
    if (fieldErrors[field]) ids.unshift(`${field}-error`);
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <div className="si-page">
      <header className="si-bar">
        <div className="si-bar__inner">
          <a href={LANDING_URL} className="si-bar__brand">
            SiteMint <span className="si-bar__brand-accent">Digital</span>
          </a>
          <a href={SIGNUP_URL} className="si-bar__create">
            Create account
          </a>
        </div>
      </header>

      <main className="si-main" id="signin-main">
        <div className="si-wrap">
          <a href={LANDING_URL} className="si-back">
            <ArrowLeft aria-hidden="true" className="si-back__icon" />
            Back to AI Receptionist
          </a>

          {/* No eyebrow above this heading. "AI Receptionist" is already the
              last thing read in the link above it, and stacking the two put
              the product name on screen twice before the task was named. */}
          <h1 className="si-title">
            Sign in to your <span className="si-title__live">SMS Receptionist</span>
          </h1>
          <p className="si-lede">
            Your dashboard holds the conversations your receptionist has had, the
            questions it asks, and your account settings.
          </p>

          {/* One bordered object on the page: the form, and the readiness the
              form's credentials actually unlock. DOM order puts the form
              first, so a phone reaches the fields without scrolling past
              product context. */}
          <div className="si-card">
            <div className="si-form-pane">
              {/* No heading over the form. The h1 already says what these two
                  fields are for, and "Your account" above them was a second
                  title that added nothing a person needed. */}
              <form className="si-form" onSubmit={handleSubmit} noValidate>
                {error && (
                  <div
                    ref={alertRef}
                    className="si-alert"
                    role="alert"
                    tabIndex={-1}
                    aria-live="assertive"
                  >
                    <span className="si-alert__label">Error</span>
                    <span className="si-alert__text">{error}</span>
                  </div>
                )}

                <div className="si-field">
                  <label htmlFor="signin-email" className="si-label">
                    Email <span className="si-req">Required</span>
                  </label>
                  <input
                    id="signin-email"
                    ref={emailRef}
                    className={`si-input${fieldErrors.email ? " si-input--invalid" : ""}`}
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    autoComplete="email"
                    inputMode="email"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.email ? true : undefined}
                    aria-describedby={describedBy("email")}
                  />
                  {fieldErrors.email && (
                    <p className="si-error" id="email-error">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="si-field">
                  <label htmlFor="signin-password" className="si-label">
                    Password <span className="si-req">Required</span>
                  </label>
                  <div className="si-password">
                    <input
                      id="signin-password"
                      ref={passwordRef}
                      className={`si-input si-input--password${
                        fieldErrors.password ? " si-input--invalid" : ""
                      }`}
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={set("password")}
                      autoComplete="current-password"
                      required
                      aria-required="true"
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby={describedBy("password")}
                    />
                    <button
                      type="button"
                      className="si-password__toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-controls="signin-password"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="si-password__icon" />
                      ) : (
                        <Eye aria-hidden="true" className="si-password__icon" />
                      )}
                      <span className="sr-only">
                        {showPassword ? "Hide password" : "Show password"}
                      </span>
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="si-error" id="password-error">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <button type="submit" className="si-submit" disabled={submitting}>
                  {submitting && (
                    <Loader2 aria-hidden="true" className="si-submit__spinner" />
                  )}
                  {submitting ? "Signing in…" : "Sign in"}
                </button>

                <p className="si-hint">Signing in opens your receptionist dashboard.</p>

                {/* S-2. Base-relative in-app navigation, so it goes through
                    wouter's <Link> and picks up the router base — unlike the
                    landing/signup links above, which cross into the other
                    application and use a document navigation instead. */}
                <p className="si-alt">
                  <Link href="/password-reset" className="si-alt__link">
                    Forgot password?
                  </Link>
                </p>
              </form>

              <p className="si-alt">
                Don't have an account?{" "}
                <a href={SIGNUP_URL} className="si-alt__link">
                  Create account
                </a>
              </p>
            </div>

            <aside className="si-status" aria-labelledby="signin-status-title">
              <h2 className="si-status__title" id="signin-status-title">
                What your account covers
              </h2>
              <ul className="si-status__list">
                {CAPABILITY_STATUS.map((item) => (
                  <li
                    key={item.capability}
                    className={`si-status__item si-status__item--${item.tier}`}
                  >
                    <span className="si-status__name">{item.capability}</span>
                    <span className="si-status__tier">{READINESS[item.tier].label}</span>
                  </li>
                ))}
              </ul>
              <p className="si-status__note">
                Signing in opens the SMS dashboard. Voice and connected CRM are
                not part of it yet.
              </p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
