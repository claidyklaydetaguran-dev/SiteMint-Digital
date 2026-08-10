/**
 * Frontend V2 Phase 5 — the AI Receptionist account-creation page.
 *
 * The filename is unchanged on purpose: `App.tsx` still lazy-loads this module
 * at `ROUTES.aiReceptionistSignup`, so the route, its registration order ahead
 * of `/ai-receptionist`, and the base-path handling are preserved by
 * construction rather than by re-derivation.
 *
 * **Frozen contract.** Every field, its required/optional status, the submitted
 * payload keys, the endpoint and method, `credentials: "include"`, the
 * fire-and-forget lead capture, and the post-signup redirect into the dashboard
 * SPA are exactly what shipped before. The payload and the two validation rules
 * now live in `signup/signupContract.ts` so they can be asserted by a committed
 * test; extracting them changed no value.
 *
 * **Product truth.** This page creates an account for the capability that is
 * available today: the SMS receptionist. The Phase 4 page opposite the form
 * claimed "running 24/7", "Answers in seconds", "Qualifies every caller" and
 * "24 hours a day" — none of which is supported, and all of which are removed.
 * The three readiness tiers are stated above the form, from the same shared
 * source the landing page uses, so signup can never describe the product
 * differently from the page the user just read.
 *
 * **What happens next** is limited to verified behaviour: the server sets a
 * session cookie and this page navigates to the dashboard; the firm is created
 * on `planTier: "trial"` with `trialConversationsLimit: 20`, which
 * `intakeAgent.ts` enforces; and no number is provisioned at signup, so the
 * page says plainly that creating the account does not finish setup.
 *
 * Accessibility. Persistent visible labels, explicit Required/Optional text
 * (never colour alone), `autocomplete` on every field so password managers
 * work, an accessible password-visibility toggle (the previous one was
 * `tabIndex={-1}` and unreachable by keyboard), inline errors tied to inputs by
 * `aria-describedby`, a form-level alert that takes focus on failure, and 44px
 * minimum control heights (the previous inputs were 36px).
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { ROUTES, DASHBOARD_URLS } from "@/lib/routes";
import { CAPABILITY_STATUS, READINESS } from "@/components/v2/home/readiness";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  EMPTY_SIGNUP_FORM,
  INDUSTRY_OPTIONS,
  INDUSTRY_VALUES,
  SIGNUP_ENDPOINT,
  SIGNUP_METHOD,
  SIGNUP_NETWORK_ERROR,
  buildSignupPayload,
  mapSignupError,
  validateSignup,
  type SignupFormValues,
} from "./signup/signupContract";

/** Verified consequences of creating an account. Nothing speculative. */
const NEXT_STEPS = [
  {
    title: "You're signed in straight away",
    body: "Creating the account signs you in and opens your receptionist dashboard.",
  },
  {
    title: "You start on a trial plan",
    body: "New accounts begin on a trial with 20 conversations included.",
  },
  {
    title: "Setup is not finished at signup",
    body: "Connecting the number your receptionist answers on, and choosing the questions it asks, are steps that still have to happen after the account exists.",
  },
];

export default function LandingReceptionistSignup() {
  const [form, setForm] = useState<SignupFormValues>(EMPTY_SIGNUP_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [offerSignIn, setOfferSignIn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [showPw, setShowPw] = useState(false);

  const alertRef = useRef<HTMLDivElement | null>(null);
  const fieldRefs = {
    name: useRef<HTMLInputElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    password: useRef<HTMLInputElement | null>(null),
  };

  const set =
    (k: keyof SignupFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOfferSignIn(false);
    setFieldErrors({});

    // Identical rules, identical order, identical messages.
    const result = validateSignup(form);
    if (!result.ok) {
      setError(result.formError);
      setFieldErrors(result.fieldErrors);
      // Send focus to the first field the rule implicates so a keyboard or
      // screen-reader user is put where the problem is.
      const target = result.focusField;
      if (target === "name" || target === "email" || target === "password") {
        fieldRefs[target].current?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      // ── Real account creation — endpoint, method, credentials, and body
      //    unchanged. ────────────────────────────────────────────────────────
      const r = await fetch(SIGNUP_ENDPOINT, {
        method: SIGNUP_METHOD,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildSignupPayload(form)),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        const mapped = mapSignupError(r.status, d.error);
        setError(mapped.message);
        setOfferSignIn(mapped.offerSignIn);
        // The alert is focusable and receives focus so the failure is
        // announced rather than silently rendered above the fold.
        window.requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }

      // ── Fire-and-forget lead capture (non-blocking) — unchanged. ─────────
      void fetch("/api/landing-test/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vertical: "receptionist",
          name: form.name,
          businessName: form.businessName,
          email: form.email,
          phone: form.phone,
          extra: { source: "get-early-access", businessType: form.businessType },
          utmSource: new URLSearchParams(window.location.search).get("utm_source") ?? "direct",
          utmMedium: new URLSearchParams(window.location.search).get("utm_medium") ?? "direct",
          utmCampaign: new URLSearchParams(window.location.search).get("utm_campaign") ?? null,
        }),
      }).catch(() => {});

      // Cross-application navigation into the dashboard SPA, resolved through
      // the centralised path layer. Redirect target unchanged.
      window.location.href = DASHBOARD_URLS.root;
    } catch {
      setError(SIGNUP_NETWORK_ERROR);
      window.requestAnimationFrame(() => alertRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (field: "name" | "email" | "password", ...extra: string[]) => {
    const ids = [...extra];
    if (fieldErrors[field]) ids.unshift(`${field}-error`);
    return ids.length ? ids.join(" ") : undefined;
  };

  return (
    <div className="sg-page">
      {/* Minimal auth chrome. The previous page rendered the marketing
          `ReceptionistNav`, whose links still point at homepage anchors
          (`/#features`, `/#pricing`) that the approved information
          architecture removed. A wordmark that returns to the landing page and
          a sign-in link are what this surface actually needs. */}
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
          {/* ── Context. First in the DOM, so mobile reads it before the
                 fields — and it is kept short so it never becomes a marketing
                 section standing between the user and the form. ──────────── */}
          <div className="sg-intro">
            <Link href={ROUTES.aiReceptionist} className="sg-back">
              <ArrowLeft aria-hidden="true" className="sg-back__icon" />
              Back to AI Receptionist
            </Link>

            <p className="v2-eyebrow">AI Receptionist</p>
            <h1 className="sg-title">Create your SMS Receptionist</h1>
            <p className="sg-lede">
              This account is for the SMS receptionist — the part of the product
              that is available today. It replies to inbound texts, asks the
              questions you choose, and hands the conversation to a person.
            </p>

            {/* Readiness, above the form and never below it. Same three tiers,
                same wording, from the same shared source as the landing page. */}
            <ul className="sg-readiness">
              {CAPABILITY_STATUS.map((item) => (
                <li key={item.capability} className={`sg-readiness__item sg-readiness__item--${item.tier}`}>
                  {/* Capability first, then its tier, so the row reads as the
                      sentence a person would say: "SMS Receptionist —
                      available now". */}
                  <span className="sg-readiness__name">{item.capability}</span>
                  <span className={`v2-tier v2-tier--${item.tier}`}>
                    {READINESS[item.tier].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── The form. One surface, not a stack of cards. ──────────────── */}
          <div className="sg-form-col">
            <form className="sg-form" onSubmit={submit} noValidate={false}>
              <h2 className="sg-form__title">Your account</h2>

              {error && (
                <div
                  ref={alertRef}
                  className="sg-alert"
                  role="alert"
                  tabIndex={-1}
                  aria-live="assertive"
                >
                  {/* The word "Error" carries the state, so it never depends on
                      colour or on the icon alone. */}
                  <span className="sg-alert__label">Error</span>
                  <span className="sg-alert__text">
                    {error}
                    {offerSignIn && (
                      <>
                        {" "}
                        <a href={DASHBOARD_URLS.login} className="sg-alert__link">
                          Sign in instead
                        </a>
                        .
                      </>
                    )}
                  </span>
                </div>
              )}

              <div className="sg-row">
                <div className="sg-field">
                  <label htmlFor="s-name" className="sg-label">
                    Full name <span className="sg-req">Required</span>
                  </label>
                  <input
                    id="s-name"
                    ref={fieldRefs.name}
                    className={`sg-input${fieldErrors.name ? " sg-input--invalid" : ""}`}
                    type="text"
                    value={form.name}
                    onChange={set("name")}
                    autoComplete="name"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.name ? true : undefined}
                    aria-describedby={describedBy("name")}
                  />
                  {fieldErrors.name && (
                    <p className="sg-error" id="name-error">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="sg-field">
                  <label htmlFor="s-biz" className="sg-label">
                    Business name <span className="sg-opt">Optional</span>
                  </label>
                  <input
                    id="s-biz"
                    className="sg-input"
                    type="text"
                    value={form.businessName}
                    onChange={set("businessName")}
                    autoComplete="organization"
                    aria-describedby="biz-help"
                  />
                  <p className="sg-help" id="biz-help">
                    Used as your account name. Your own name is used if you leave
                    this empty.
                  </p>
                </div>
              </div>

              <div className="sg-field">
                <label htmlFor="s-email" className="sg-label">
                  Email <span className="sg-req">Required</span>
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
                  You sign in with this address, and conversation summaries are
                  sent to it.
                </p>
              </div>

              <div className="sg-row">
                <div className="sg-field">
                  <label htmlFor="s-phone" className="sg-label">
                    Phone <span className="sg-opt">Optional</span>
                  </label>
                  <input
                    id="s-phone"
                    className="sg-input"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>

                <div className="sg-field">
                  <label htmlFor="s-industry" className="sg-label">
                    Industry <span className="sg-opt">Optional</span>
                  </label>
                  {/* A native select: it is keyboard- and screen-reader-native,
                      works with autofill, and needs no JavaScript to open. The
                      stored values are unchanged. */}
                  <select
                    id="s-industry"
                    className="sg-input sg-select"
                    value={form.businessType}
                    onChange={set("businessType")}
                  >
                    <option value="">Select your industry</option>
                    {INDUSTRY_OPTIONS.map((label) => (
                      <option key={label} value={INDUSTRY_VALUES[label]}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sg-field">
                <label htmlFor="s-password" className="sg-label">
                  Password <span className="sg-req">Required</span>
                </label>
                <div className="sg-password">
                  <input
                    id="s-password"
                    ref={fieldRefs.password}
                    className={`sg-input sg-input--password${
                      fieldErrors.password ? " sg-input--invalid" : ""
                    }`}
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    autoComplete="new-password"
                    required
                    aria-required="true"
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={describedBy("password", "password-help")}
                  />
                  {/* Reachable by keyboard, and its state is announced. The
                      previous control was tabIndex={-1} with no label. */}
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
                    <span className="v2-visually-hidden">
                      {showPw ? "Hide password" : "Show password"}
                    </span>
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

          {/* ── What happens next. After the form in the DOM, so mobile users
                 reach the fields first; placed under the context column on
                 desktop. ─────────────────────────────────────────────────── */}
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
