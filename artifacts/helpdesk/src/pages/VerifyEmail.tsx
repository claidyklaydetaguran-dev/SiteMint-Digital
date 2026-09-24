/**
 * Verify email address (owner directive 2026-09-11 §5).
 *
 * Reached at `/verify-email?token=…` from the verification email, or opened
 * bare with the code pasted by hand. Follows the PasswordResetComplete
 * pattern exactly: si-page shell, focusable role alerts, explicit outcome
 * states, and no session side effects — confirming is token-proven.
 *
 * "Send a new code" needs the customer's session (the API re-issues to the
 * account's own address); a 401 explains that honestly instead of failing
 * silently.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import {
  CODE_HELP,
  CODE_LABEL,
  CONFIRM_CREDENTIALS,
  CONFIRM_ENDPOINT,
  CONFIRM_METHOD,
  CONFIRM_NETWORK_ERROR,
  CONTINUE_HREF,
  EMPTY_VERIFY_FORM,
  RESEND_CREDENTIALS,
  RESEND_ENDPOINT,
  RESEND_METHOD,
  RESEND_SENT,
  buildConfirmPayload,
  mapConfirmError,
  mapResendError,
  validateVerify,
  type VerifyFormValues,
} from "./verify-email/verifyEmailContract";
import "@/styles/v2-signin.css";
import "@/styles/v3-app.css";
import "@/styles/v4-app.css";
// SiteMint V5 "Signal, mint-led" retheme — token-value override one layer
// above V4, same stack as Login/PasswordReset.
import "@/styles/v5-app.css";

type Outcome = "idle" | "done" | "error";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("token");

  const [form, setForm] = useState<VerifyFormValues>(
    urlToken ? { code: urlToken } : EMPTY_VERIFY_FORM,
  );
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const alertRef = useRef<HTMLDivElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const autoTried = useRef(false);

  const confirm = async (code: string) => {
    setSubmitting(true);
    setFormError("");
    setNotice("");
    try {
      const res = await fetch(CONFIRM_ENDPOINT, {
        method: CONFIRM_METHOD,
        credentials: CONFIRM_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildConfirmPayload(code)),
      });
      if (!res.ok) {
        setFormError(mapConfirmError(res.status));
        setOutcome("error");
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setOutcome("done");
    } catch {
      setFormError(CONFIRM_NETWORK_ERROR);
      setOutcome("error");
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  // A link click from the email should verify in one step — but only once,
  // and never in a loop after a failure.
  useEffect(() => {
    if (urlToken && !autoTried.current) {
      autoTried.current = true;
      void confirm(urlToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validation = validateVerify(form);
    if (!validation.ok) {
      setFormError(validation.error);
      codeRef.current?.focus();
      return;
    }
    await confirm(validation.code);
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setFormError("");
    setNotice("");
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: RESEND_METHOD,
        credentials: RESEND_CREDENTIALS,
      });
      if (!res.ok) {
        setFormError(mapResendError(res.status));
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setNotice(RESEND_SENT);
    } catch {
      setFormError(CONFIRM_NETWORK_ERROR);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setResending(false);
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

      <main className="si-main" id="verify-email-main">
        <div className="si-wrap">
          <h1 className="si-title">Verify your email</h1>
          <p className="si-lede">
            Confirming your address keeps your account recoverable and lets us
            send you call summaries.
          </p>

          <div className="si-card">
            <div className="si-form-pane">
              {outcome === "done" ? (
                <div className="si-alert" role="status">
                  <span className="si-alert__label">Email verified</span>
                  <span className="si-alert__text">
                    You're all set — your welcome email is on its way.{" "}
                    <Link href={CONTINUE_HREF} className="si-alt__link">
                      Continue to setup
                    </Link>
                  </span>
                </div>
              ) : (
                <form className="si-form" onSubmit={handleSubmit} noValidate>
                  {formError && (
                    <div ref={alertRef} className="si-alert" role="alert" tabIndex={-1} aria-live="assertive">
                      <span className="si-alert__label">Error</span>
                      <span className="si-alert__text">{formError}</span>
                    </div>
                  )}
                  {notice && (
                    <div className="si-alert" role="status">
                      <span className="si-alert__label">Sent</span>
                      <span className="si-alert__text">{notice}</span>
                    </div>
                  )}

                  <div className="si-field">
                    <label htmlFor="verify-code" className="si-label">
                      {CODE_LABEL} <span className="si-req">Required</span>
                    </label>
                    <input
                      id="verify-code"
                      ref={codeRef}
                      className="si-input"
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ code: e.target.value })}
                      autoComplete="one-time-code"
                      inputMode="text"
                      required
                      aria-required="true"
                      aria-describedby="verify-code-help"
                    />
                    <p className="si-hint" id="verify-code-help">
                      {CODE_HELP}
                    </p>
                  </div>

                  <button type="submit" className="si-submit" disabled={submitting}>
                    {submitting ? "Verifying…" : "Verify email"}
                  </button>

                  <p className="si-alt">
                    Didn't get it?{" "}
                    <button
                      type="button"
                      className="si-alt__link si-alt__link--button"
                      onClick={handleResend}
                      disabled={resending}
                    >
                      {resending ? "Sending…" : "Send a new code"}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
