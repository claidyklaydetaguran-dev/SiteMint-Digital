/**
 * V5 customer-shell foundation — complete a password reset (S-2).
 *
 * Reached at `/password-reset/complete?token=…`; the token is read from the
 * query string via wouter's `useSearchParams` and never re-typed by the
 * visitor. Two password fields (new + confirm) with the strength hint the
 * signup and account-password-change flows share
 * (`MIN_PASSWORD_LENGTH` / `PASSWORD_STRENGTH_HINT`), a 400 branch for an
 * invalid or expired token, and a success state that links back to sign-in
 * rather than auto-signing-in — this endpoint sets no session cookie.
 */

import { useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  COMPLETE_CREDENTIALS,
  COMPLETE_ENDPOINT,
  COMPLETE_METHOD,
  COMPLETE_NETWORK_ERROR,
  EMPTY_COMPLETE_FORM,
  PASSWORD_STRENGTH_HINT,
  buildCompletePayload,
  mapCompleteError,
  validateComplete,
  type CompleteFormValues,
} from "./password-reset/passwordResetContract";
import "@/styles/v2-signin.css";
import "@/styles/v3-app.css";
import "@/styles/v4-app.css";
// SiteMint V5 "Signal, mint-led" retheme — token-value override one layer
// above V4. This page shares Login.tsx's `.si-page` stylesheet but had
// never picked up the V5 layer, so it was rendering the retired V4
// navy/cyan palette. ROLLBACK: remove this import to restore the V4
// appearance.
import "@/styles/v5-app.css";

type Outcome = "idle" | "done" | "error";

export default function PasswordResetComplete() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [form, setForm] = useState<CompleteFormValues>(EMPTY_COMPLETE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const alertRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFormError("");
    setFieldErrors({});

    const validation = validateComplete(form, token);
    if (!validation.ok) {
      setFormError(validation.formError);
      setFieldErrors(validation.fieldErrors);
      if (validation.fieldErrors.token) {
        window.requestAnimationFrame(() => alertRef.current?.focus());
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(COMPLETE_ENDPOINT, {
        method: COMPLETE_METHOD,
        credentials: COMPLETE_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCompletePayload(form, token as string)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(mapCompleteError(res.status, data.error));
        setOutcome("error");
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setOutcome("done");
    } catch {
      setFormError(COMPLETE_NETWORK_ERROR);
      setOutcome("error");
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="si-page">
      <header className="si-bar">
        <div className="si-bar__inner">
          <Link href="/login" className="si-bar__brand">
            SiteMint <span className="si-bar__brand-accent">Digital</span>
          </Link>
        </div>
      </header>

      <main className="si-main" id="password-reset-complete-main">
        <div className="si-wrap">
          <h1 className="si-title">Choose a new password</h1>
          <p className="si-lede">Set a new password for your account.</p>

          <div className="si-card">
            <div className="si-form-pane">
              {outcome === "done" ? (
                <div className="si-alert" role="status">
                  <span className="si-alert__label">Password updated</span>
                  <span className="si-alert__text">
                    Your password has been changed.{" "}
                    <Link href="/login" className="si-alt__link">
                      Sign in
                    </Link>
                  </span>
                </div>
              ) : (
                <form className="si-form" onSubmit={handleSubmit} noValidate>
                  {(formError || !token) && (
                    <div ref={alertRef} className="si-alert" role="alert" tabIndex={-1} aria-live="assertive">
                      <span className="si-alert__label">Error</span>
                      <span className="si-alert__text">
                        {!token ? "This reset link is missing its token. Request a new one." : formError}
                      </span>
                    </div>
                  )}

                  <div className="si-field">
                    <label htmlFor="new-password" className="si-label">
                      New password <span className="si-req">Required</span>
                    </label>
                    <input
                      id="new-password"
                      ref={passwordRef}
                      className={`si-input${fieldErrors.password ? " si-input--invalid" : ""}`}
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      autoComplete="new-password"
                      required
                      aria-required="true"
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby="new-password-help"
                    />
                    {fieldErrors.password && <p className="si-error">{fieldErrors.password}</p>}
                    <p className="si-hint" id="new-password-help">
                      {PASSWORD_STRENGTH_HINT}
                    </p>
                  </div>

                  <div className="si-field">
                    <label htmlFor="confirm-password" className="si-label">
                      Confirm new password <span className="si-req">Required</span>
                    </label>
                    <input
                      id="confirm-password"
                      className={`si-input${fieldErrors.confirmPassword ? " si-input--invalid" : ""}`}
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      autoComplete="new-password"
                      required
                      aria-required="true"
                      aria-invalid={fieldErrors.confirmPassword ? true : undefined}
                    />
                    {fieldErrors.confirmPassword && <p className="si-error">{fieldErrors.confirmPassword}</p>}
                  </div>

                  <button type="submit" className="si-submit" disabled={submitting || !token}>
                    {submitting ? "Saving…" : "Save new password"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
