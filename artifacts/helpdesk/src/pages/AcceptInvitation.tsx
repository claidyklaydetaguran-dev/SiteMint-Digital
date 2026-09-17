/**
 * Accept a team invitation.
 *
 * Reached at `/accept-invitation?token=…` from the invitation email, or
 * opened bare with the code typed in. The invited person confirms the address
 * the invitation was sent to and chooses their own password; the server signs
 * them in, and they go straight to the dashboard.
 *
 * The address is required because the server only activates the invitation
 * that was sent to it — a code on its own proves nothing about who holds it.
 */

import { useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { acceptTeamInvitation } from "@/lib/accountApi";
import { SESSION_KEY } from "@/hooks/useSession";
import { ROUTES } from "@/lib/routes";
import "@/styles/v2-signin.css";
import "@/styles/v3-app.css";
import "@/styles/v4-app.css";
import "@/styles/v5-app.css";

const MIN_PASSWORD_LENGTH = 8;

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const urlToken = (searchParams.get("token") ?? "").trim();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const alertRef = useRef<HTMLDivElement | null>(null);

  const fail = (message: string) => {
    setError(message);
    window.requestAnimationFrame(() => alertRef.current?.focus());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    const token = urlToken || code.trim();
    if (token === "") return fail("Enter the code from your invitation email.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail("Enter the email address the invitation was sent to.");
    if (password.length < MIN_PASSWORD_LENGTH) return fail(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return fail("The two passwords don't match.");

    setSubmitting(true);
    const result = await acceptTeamInvitation(token, email.trim(), password);
    setSubmitting(false);
    if (!result.ok) return fail(result.message);
    // The server set a session cookie for this person; drop any cached
    // identity so the dashboard loads as them.
    queryClient.removeQueries({ queryKey: SESSION_KEY });
    navigate(ROUTES.overview, { replace: true });
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

      <main className="si-main" id="accept-invitation-main">
        <div className="si-wrap">
          <h1 className="si-title">Join your team</h1>
          <p className="si-lede">
            Choose the password you'll use to sign in to your team's AI Receptionist.
          </p>

          <div className="si-card">
            <div className="si-form-pane">
              <form className="si-form" onSubmit={submit} noValidate>
                {error && (
                  <div ref={alertRef} className="si-alert" role="alert" tabIndex={-1} aria-live="assertive">
                    <span className="si-alert__label">Error</span>
                    <span className="si-alert__text">{error}</span>
                  </div>
                )}

                {urlToken === "" && (
                  <div className="si-field">
                    <label htmlFor="invite-code" className="si-label">
                      Invitation code <span className="si-req">Required</span>
                    </label>
                    <input
                      id="invite-code"
                      className="si-input"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="one-time-code"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      aria-required="true"
                      aria-describedby="invite-code-help"
                    />
                    <p className="si-hint" id="invite-code-help">It's in your invitation email and works for seven days.</p>
                  </div>
                )}

                <div className="si-field">
                  <label htmlFor="invite-email" className="si-label">
                    Your email address <span className="si-req">Required</span>
                  </label>
                  <input
                    id="invite-email"
                    className="si-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    aria-required="true"
                    aria-describedby="invite-email-help"
                  />
                  <p className="si-hint" id="invite-email-help">The address the invitation was sent to.</p>
                </div>

                <div className="si-field">
                  <label htmlFor="invite-password" className="si-label">
                    Choose a password <span className="si-req">Required</span>
                  </label>
                  <input
                    id="invite-password"
                    className="si-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    aria-required="true"
                    aria-describedby="invite-password-help"
                  />
                  <p className="si-hint" id="invite-password-help">At least {MIN_PASSWORD_LENGTH} characters.</p>
                </div>

                <div className="si-field">
                  <label htmlFor="invite-confirm" className="si-label">
                    Confirm password <span className="si-req">Required</span>
                  </label>
                  <input
                    id="invite-confirm"
                    className="si-input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    aria-required="true"
                  />
                </div>

                <button type="submit" className="si-submit" disabled={submitting}>
                  {submitting ? "Joining…" : "Join and sign in"}
                </button>

                <p className="si-alt">
                  Already joined?{" "}
                  <Link href="/login" className="si-alt__link">
                    Sign in
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
