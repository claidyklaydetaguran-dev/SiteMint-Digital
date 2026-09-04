/**
 * V5 customer-shell foundation — invite-only AI Receptionist signup (S-1).
 *
 * The filename, route registration order and base-path handling are
 * unchanged: `App.tsx` still lazy-loads this module at
 * `ROUTES.aiReceptionistSignup`, ahead of `ROUTES.aiReceptionist`.
 *
 * **What changed.** S-1 replaces the previous open trial signup (name,
 * business name, email, phone, industry, password) with an invite-gated
 * account-creation flow: invite code, owner name, business name, work
 * email, password, timezone, and a required Terms/Privacy acknowledgement.
 * Industry and every configuration decision now belong to the guided
 * onboarding hub the account lands in after signup (S-3). The fire-and-forget
 * `/api/landing-test/submit` lead capture from the previous page is removed —
 * this page creates a real account now, so a parallel unauthenticated lead
 * record duplicates what the account itself already is.
 *
 * **States**, per the task brief: submitting; per-field validation errors;
 * an invalid/expired invite code (400); a duplicate account (409, with a
 * "Sign in instead" recovery); the private beta not accepting signups right
 * now (503, with a "Request Beta Access" link into the AI Receptionist
 * page's beta section); and success, which — unchanged from before —
 * hard-navigates into the dashboard SPA once the server has set the session
 * cookie.
 *
 * Accessibility carries over the Phase 5 baseline: persistent visible
 * labels, explicit Required text, `autocomplete` on every field, an
 * accessible password-visibility toggle, inline errors tied to inputs by
 * `aria-describedby`, a form-level alert that takes focus on failure, and
 * 44px minimum control heights.
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { CAPABILITY_STATUS, READINESS } from "@/components/v2/home/readiness";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  BETA_REQUEST_HREF,
  detectTimezone,
  emptySignupForm,
  SIGNUP_ENDPOINT,
  SIGNUP_METHOD,
  SIGNUP_NETWORK_ERROR,
  TIMEZONE_OPTIONS,
  buildSignupPayload,
  mapSignupError,
  validateSignup,
  type SignupFormValues,
  type SignupOutcome,
} from "./signup/signupContract";

/** Verified consequences of creating an account. Nothing speculative. */
const NEXT_STEPS = [
  {
    title: "You're signed in straight away",
    body: "Creating the account signs you in and opens your guided setup.",
  },
  {
    title: "Setup happens after signup",
    body: "Business details, your assistant's prompt and voice, availability, and your phone number are all configured in the setup hub — not on this form.",
  },
  {
    title: "Activation is handled with SiteMint",
    body: "During the private beta, going live happens together with SiteMint once setup is complete.",
  },
];

export default function LandingReceptionistSignup() {
  const [form, setForm] = useState<SignupFormValues>(() => emptySignupForm(detectTimezone()));
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SignupOutcome | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignupFormValuesErrors>({});

  const [showPw, setShowPw] = useState(false);

  const alertRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = {
    inviteCode: useRef<HTMLInputElement | null>(null),
    ownerName: useRef<HTMLInputElement | null>(null),
    businessName: useRef<HTMLInputElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    password: useRef<HTMLInputElement | null>(null),
    acceptedTerms: useRef<HTMLInputElement | null>(null),
  };

  const set =
    (k: "inviteCode" | "ownerName" | "businessName" | "email" | "password" | "timezone") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOutcome(null);
    setFieldErrors({});

    const result = validateSignup(form);
    if (!result.ok) {
      setError(result.formError);
      setFieldErrors(result.fieldErrors);
      const target = result.focusField;
      if (target && target in fieldRefs) {
        (fieldRefs as Record<string, React.RefObject<HTMLInputElement | null>>)[target]?.current?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch(SIGNUP_ENDPOINT, {
        method: SIGNUP_METHOD,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildSignupPayload(form)),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        const mapped = mapSignupError(r.status, d.error);
        setOutcome(mapped.outcome);
        setError(mapped.message);
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }

      // Real account creation succeeded — the server set the session cookie.
      // Cross-application navigation into the dashboard SPA, resolved
      // through the centralised path layer. Redirect target unchanged from
      // the previous implementation.
      window.location.href = DASHBOARD_URLS.root;
    } catch {
      setOutcome("error");
      setError(SIGNUP_NETWORK_ERROR);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (
    field: "inviteCode" | "ownerName" | "businessName" | "email" | "password" | "acceptedTerms",
    ...extra: string[]
  ) => {
    const ids = [...extra];
    if (fieldErrors[field]) ids.unshift(`${field}-error`);
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <div className="sg-page">
      <header className="sg-bar">
        <div className="sg-bar__inner">
          <Link href={ROUTES.aiReceptionist} className="sg-bar__brand">
            SiteMint <span className="sg-bar__brand-accent">Digital</span>
          </Link>
          <a href={DASHBOARD_URLS.login} className="sg-bar__signin">
            Sign in
          </a>
        </div>
      </header>

      <main className="sg-main" id="signup-main">
        <div className="sg-grid">
          <div className="sg-intro">
            <Link href={ROUTES.aiReceptionist} className="sg-back">
              <ArrowLeft aria-hidden="true" className="sg-back__icon" />
              Back to AI Receptionist
            </Link>

            <p className="v2-eyebrow">AI Receptionist — Private beta</p>
            <h1 className="sg-title">Set up your AI Receptionist</h1>
            <p className="sg-lede">
              Accounts are created by invitation during the private beta. Enter the invite code
              from your invitation to create your account.
            </p>

            <ul className="sg-readiness">
              {CAPABILITY_STATUS.map((item) => (
                <li key={item.capability} className={`sg-readiness__item sg-readiness__item--${item.tier}`}>
                  <span className="sg-readiness__name">{item.capability}</span>
                  <span className={`v2-tier v2-tier--${item.tier}`}>{READINESS[item.tier].label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="sg-form-col">
            <form className="sg-form" onSubmit={submit} noValidate>
              <h2 className="sg-form__title">Your account</h2>

              {error && (
                <div ref={alertRef} className="sg-alert" role="alert" tabIndex={-1} aria-live="assertive">
                  <span className="sg-alert__label">
                    {outcome === "unavailable" ? "Not available" : "Error"}
                  </span>
                  <span className="sg-alert__text">
                    {error}
                    {outcome === "duplicate" && (
                      <>
                        {" "}
                        <a href={DASHBOARD_URLS.login} className="sg-alert__link">
                          Sign in instead
                        </a>
                        .
                      </>
                    )}
                    {outcome === "unavailable" && (
                      <>
                        {" "}
                        <Link href={BETA_REQUEST_HREF} className="sg-alert__link">
                          Request Beta Access
                        </Link>
                        .
                      </>
                    )}
                  </span>
                </div>
              )}

              <div className="sg-field">
                <label htmlFor="s-invite-code" className="sg-label">
                  Invite code <span className="sg-req">Required</span>
                </label>
                <input
                  id="s-invite-code"
                  ref={fieldRefs.inviteCode}
                  className={`sg-input${fieldErrors.inviteCode ? " sg-input--invalid" : ""}`}
                  type="text"
                  value={form.inviteCode}
                  onChange={set("inviteCode")}
                  autoComplete="off"
                  required
                  aria-required="true"
                  aria-invalid={fieldErrors.inviteCode ? true : undefined}
                  aria-describedby={describedBy("inviteCode")}
                />
                {fieldErrors.inviteCode && (
                  <p className="sg-error" id="inviteCode-error">
                    {fieldErrors.inviteCode}
                  </p>
                )}
              </div>

              <div className="sg-row">
                <div className="sg-field">
                  <label htmlFor="s-owner-name" className="sg-label">
                    Your name <span className="sg-req">Required</span>
                  </label>
                  <input
                    id="s-owner-name"
                    ref={fieldRefs.ownerName}
                    className={`sg-input${fieldErrors.ownerName ? " sg-input--invalid" : ""}`}
                    type="text"
                    value={form.ownerName}
                    onChange={set("ownerName")}
                    autoComplete="name"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.ownerName ? true : undefined}
                    aria-describedby={describedBy("ownerName")}
                  />
                  {fieldErrors.ownerName && (
                    <p className="sg-error" id="ownerName-error">
                      {fieldErrors.ownerName}
                    </p>
                  )}
                </div>

                <div className="sg-field">
                  <label htmlFor="s-business-name" className="sg-label">
                    Business name <span className="sg-req">Required</span>
                  </label>
                  <input
                    id="s-business-name"
                    ref={fieldRefs.businessName}
                    className={`sg-input${fieldErrors.businessName ? " sg-input--invalid" : ""}`}
                    type="text"
                    value={form.businessName}
                    onChange={set("businessName")}
                    autoComplete="organization"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.businessName ? true : undefined}
                    aria-describedby={describedBy("businessName")}
                  />
                  {fieldErrors.businessName && (
                    <p className="sg-error" id="businessName-error">
                      {fieldErrors.businessName}
                    </p>
                  )}
                </div>
              </div>

              <div className="sg-field">
                <label htmlFor="s-email" className="sg-label">
                  Work email <span className="sg-req">Required</span>
                </label>
                <input
                  id="s-email"
                  ref={fieldRefs.email}
                  className={`sg-input${fieldErrors.email ? " sg-input--invalid" : ""}`}
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                  inputMode="email"
                  required
                  aria-required="true"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={describedBy("email", "email-help")}
                />
                {fieldErrors.email && (
                  <p className="sg-error" id="email-error">
                    {fieldErrors.email}
                  </p>
                )}
                <p className="sg-help" id="email-help">
                  You sign in with this address.
                </p>
              </div>

              <div className="sg-field">
                <label htmlFor="s-timezone" className="sg-label">
                  Timezone <span className="sg-opt">Optional</span>
                </label>
                <select id="s-timezone" className="sg-input sg-select" value={form.timezone} onChange={set("timezone")}>
                  <option value="">Select your timezone</option>
                  {!TIMEZONE_OPTIONS.includes(form.timezone as (typeof TIMEZONE_OPTIONS)[number]) && form.timezone && (
                    <option value={form.timezone}>{form.timezone}</option>
                  )}
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sg-field">
                <label htmlFor="s-password" className="sg-label">
                  Password <span className="sg-req">Required</span>
                </label>
                <div className="sg-password">
                  <input
                    id="s-password"
                    ref={fieldRefs.password}
                    className={`sg-input sg-input--password${fieldErrors.password ? " sg-input--invalid" : ""}`}
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    autoComplete="new-password"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={describedBy("password", "password-help")}
                  />
                  <button
                    type="button"
                    className="sg-password__toggle"
                    onClick={() => setShowPw((v) => !v)}
                    aria-pressed={showPw}
                    aria-controls="s-password"
                  >
                    {showPw ? (
                      <EyeOff aria-hidden="true" className="sg-password__icon" />
                    ) : (
                      <Eye aria-hidden="true" className="sg-password__icon" />
                    )}
                    <span className="v2-visually-hidden">{showPw ? "Hide password" : "Show password"}</span>
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="sg-error" id="password-error">
                    {fieldErrors.password}
                  </p>
                )}
                <p className="sg-help" id="password-help">
                  At least 8 characters.
                </p>
              </div>

              <div className="sg-field" style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "0.6rem" }}>
                <input
                  id="s-accept-terms"
                  ref={fieldRefs.acceptedTerms}
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(e) => setForm((f) => ({ ...f, acceptedTerms: e.target.checked }))}
                  required
                  aria-required="true"
                  aria-invalid={fieldErrors.acceptedTerms ? true : undefined}
                  aria-describedby={describedBy("acceptedTerms")}
                  style={{ width: 20, height: 20, minWidth: 20, marginTop: 2 }}
                />
                <label htmlFor="s-accept-terms" className="sg-label" style={{ fontWeight: 400 }}>
                  I agree to the{" "}
                  <Link href={ROUTES.terms} className="sg-alt__link">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href={ROUTES.privacy} className="sg-alt__link">
                    Privacy Policy
                  </Link>
                  . <span className="sg-req">Required</span>
                </label>
              </div>
              {fieldErrors.acceptedTerms && (
                <p className="sg-error" id="acceptedTerms-error">
                  {fieldErrors.acceptedTerms}
                </p>
              )}

              <button type="submit" className="sg-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="sg-submit__spinner" />
                    Creating your account…
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <p className="sg-alt">
                Already have an account?{" "}
                <a href={DASHBOARD_URLS.login} className="sg-alt__link">
                  Sign in
                </a>
              </p>
            </form>
          </div>

          <aside className="sg-next" aria-labelledby="sg-next-heading">
            <h2 className="sg-next__title" id="sg-next-heading">
              What happens after you create it
            </h2>
            <ul className="sg-next__list">
              {NEXT_STEPS.map((step) => (
                <li key={step.title} className="sg-next__item">
                  <h3 className="sg-next__name">{step.title}</h3>
                  <p className="sg-next__body">{step.body}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}

interface SignupFormValuesErrors {
  inviteCode?: string;
  ownerName?: string;
  businessName?: string;
  email?: string;
  password?: string;
  acceptedTerms?: string;
}
