/**
 * V5 customer-shell foundation — request a password reset (S-2).
 *
 * One field, one action, one outcome. The confirmation copy is identical
 * whether or not the address has an account (`REQUEST_CONFIRMATION` in
 * `password-reset/passwordResetContract.ts`) because the backend contract is
 * non-enumerating by design — this page must never create a signal the
 * server does not send. The only other outcome the server defines is 503,
 * shown as "Password reset is not available yet — contact SiteMint" while
 * the feature is flagged off.
 *
 * Presentation reuses the sign-in page's stylesheet (`v2-signin.css`) rather
 * than adding a new one — same auth-surface visual language, no new palette,
 * no new dependency.
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { publicSiteUrl } from "@/lib/routes";
import {
  EMPTY_REQUEST_FORM,
  REQUEST_CONFIRMATION,
  REQUEST_CREDENTIALS,
  REQUEST_ENDPOINT,
  REQUEST_METHOD,
  REQUEST_NETWORK_ERROR,
  REQUEST_UNAVAILABLE,
  buildRequestPayload,
  mapRequestStatus,
  validateRequest,
  type RequestFormValues,
} from "./password-reset/passwordResetContract";
import "@/styles/v2-signin.css";
import "@/styles/v3-app.css";
import "@/styles/v4-app.css";

const LOGIN_URL = "/login";
const LANDING_URL = publicSiteUrl("/ai-receptionist");

type Outcome = "idle" | "confirmed" | "unavailable" | "error";

export default function PasswordReset() {
  const [form, setForm] = useState<RequestFormValues>(EMPTY_REQUEST_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [error, setError] = useState("");

  const alertRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFieldError(null);
    setError("");

    const validation = validateRequest(form);
    if (!validation.ok) {
      setFieldError(validation.fieldError);
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(REQUEST_ENDPOINT, {
        method: REQUEST_METHOD,
        credentials: REQUEST_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestPayload(form)),
      });
      const result = mapRequestStatus(res.status);
      setOutcome(result);
      if (result === "error") {
        setError((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
        window.requestAnimationFrame(() => alertRef.current?.focus());
      }
    } catch {
      setOutcome("error");
      setError(REQUEST_NETWORK_ERROR);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="si-page">
      <header className="si-bar">
        <div className="si-bar__inner">
          <a href={LANDING_URL} className="si-bar__brand">
            SiteMint <span className="si-bar__brand-accent">Digital</span>
          </a>
        </div>
      </header>

      <main className="si-main" id="password-reset-main">
        <div className="si-wrap">
          <Link href={LOGIN_URL} className="si-back">
            Back to sign in
          </Link>

          <h1 className="si-title">Reset your password</h1>
          <p className="si-lede">
            Enter the email address on your account and we&rsquo;ll send you a link to choose a
            new password.
          </p>

          <div className="si-card">
            <div className="si-form-pane">
              {outcome === "confirmed" ? (
                <div className="si-alert" role="status" data-tone="confirmed">
                  <span className="si-alert__label">Check your email</span>
                  <span className="si-alert__text">{REQUEST_CONFIRMATION}</span>
                </div>
              ) : outcome === "unavailable" ? (
                <div className="si-alert" role="alert">
                  <span className="si-alert__label">Not available</span>
                  <span className="si-alert__text">{REQUEST_UNAVAILABLE}</span>
                </div>
              ) : (
                <form className="si-form" onSubmit={handleSubmit} noValidate>
                  {outcome === "error" && (
                    <div ref={alertRef} className="si-alert" role="alert" tabIndex={-1} aria-live="assertive">
                      <span className="si-alert__label">Error</span>
                      <span className="si-alert__text">{error}</span>
                    </div>
                  )}

                  <div className="si-field">
                    <label htmlFor="reset-email" className="si-label">
                      Email <span className="si-req">Required</span>
                    </label>
                    <input
                      id="reset-email"
                      ref={emailRef}
                      className={`si-input${fieldError ? " si-input--invalid" : ""}`}
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ email: e.target.value })}
                      autoComplete="email"
                      inputMode="email"
                      required
                      aria-required="true"
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={fieldError ? "reset-email-error" : undefined}
                    />
                    {fieldError && (
                      <p className="si-error" id="reset-email-error">
                        {fieldError}
                      </p>
                    )}
                  </div>

                  <button type="submit" className="si-submit" disabled={submitting}>
                    {submitting ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              )}

              <p className="si-alt">
                Remembered your password?{" "}
                <Link href={LOGIN_URL} className="si-alt__link">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
