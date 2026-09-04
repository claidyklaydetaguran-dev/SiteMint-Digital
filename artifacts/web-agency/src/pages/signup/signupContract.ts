/**
 * V5 customer-shell foundation — the invite-only AI Receptionist signup
 * contract, as pure functions (S-1).
 *
 * S-1 replaces the previous open trial signup (name, business name, email,
 * phone, industry, password — Phase 5) with an invite-gated account-creation
 * flow: invite code, owner name, business name, work email, password,
 * timezone, and a required Terms/Privacy acknowledgement. Industry and every
 * other configuration decision moves to the guided onboarding hub (S-3,
 * `pages/setup/setupContract.ts` in helpdesk) — this page's only job is to
 * create the account.
 *
 * Endpoint, per the task brief:
 *
 *   POST /api/receptionist/auth/invite-signup
 *   { inviteCode, ownerName, businessName, email, password, timezone, acceptedTerms: true }
 *     → 201 (session cookie set)
 *     → 400 { error }   invalid/expired code, validation
 *     → 409 { error }   duplicate email
 *     → 503 { error }   INVITE_SIGNUP_ENABLED is off
 *
 * No imports, so this stays portable into the plain `tsx` test runner with
 * no path-alias resolution — matching every other contract module in this
 * app.
 */

export interface SignupFormValues {
  inviteCode: string;
  ownerName: string;
  businessName: string;
  email: string;
  password: string;
  timezone: string;
  acceptedTerms: boolean;
}

export function emptySignupForm(defaultTimezone = ""): SignupFormValues {
  return {
    inviteCode: "",
    ownerName: "",
    businessName: "",
    email: "",
    password: "",
    timezone: defaultTimezone,
    acceptedTerms: false,
  };
}

/** A stable, importable empty form for tests — timezone left blank, exactly as `emptySignupForm()` with no argument. */
export const EMPTY_SIGNUP_FORM: SignupFormValues = emptySignupForm();

export interface SignupPayload {
  inviteCode: string;
  ownerName: string;
  businessName: string;
  email: string;
  password: string;
  timezone: string;
  acceptedTerms: true;
}

export const SIGNUP_ENDPOINT = "/api/receptionist/auth/invite-signup";
export const SIGNUP_METHOD = "POST";

/**
 * Build the request body. `acceptedTerms` is sent as the literal `true` —
 * `validateSignup` refuses to pass an unchecked form through, so by the time
 * this runs the box is known to be checked.
 */
export function buildSignupPayload(form: SignupFormValues): SignupPayload {
  return {
    inviteCode: form.inviteCode,
    ownerName: form.ownerName,
    businessName: form.businessName,
    email: form.email,
    password: form.password,
    timezone: form.timezone,
    acceptedTerms: true,
  };
}

export interface SignupValidation {
  ok: boolean;
  formError: string;
  fieldErrors: {
    inviteCode?: string;
    ownerName?: string;
    businessName?: string;
    email?: string;
    password?: string;
    acceptedTerms?: string;
  };
  focusField: keyof SignupFormValues | null;
}

const OK: SignupValidation = { ok: true, formError: "", fieldErrors: {}, focusField: null };

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Client-side rules, evaluated in field order so the first problem in the
 * form is always the one reported: invite code → owner name → business name
 * → email → password length → the Terms/Privacy checkbox. No email-format
 * rule is added — the server decides that, exactly as every other auth
 * contract in this app leaves it.
 */
export function validateSignup(form: SignupFormValues): SignupValidation {
  if (!form.inviteCode.trim()) {
    return { ok: false, formError: "Enter your invite code.", fieldErrors: { inviteCode: "Required." }, focusField: "inviteCode" };
  }
  if (!form.ownerName.trim()) {
    return { ok: false, formError: "Enter your name.", fieldErrors: { ownerName: "Required." }, focusField: "ownerName" };
  }
  if (!form.businessName.trim()) {
    return { ok: false, formError: "Enter your business name.", fieldErrors: { businessName: "Required." }, focusField: "businessName" };
  }
  if (!form.email.trim()) {
    return { ok: false, formError: "Enter your work email.", fieldErrors: { email: "Required." }, focusField: "email" };
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      formError: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      fieldErrors: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
      focusField: "password",
    };
  }
  if (!form.acceptedTerms) {
    return {
      ok: false,
      formError: "You must agree to the Terms and Privacy Policy to continue.",
      fieldErrors: { acceptedTerms: "Required." },
      focusField: "acceptedTerms",
    };
  }
  return OK;
}

export const SIGNUP_NETWORK_ERROR =
  "We couldn't reach the server. Your details are still here — try again.";
export const SIGNUP_GENERIC_ERROR = "Signup failed — please try again.";

export const BETA_UNAVAILABLE_MESSAGE = "Signup is by invitation during the private beta.";
/** Base-relative in-app anchor into the AI Receptionist page's beta section. */
export const BETA_REQUEST_HREF = "/ai-receptionist#beta";

export type SignupOutcome = "success" | "invalid" | "duplicate" | "unavailable" | "error";

export interface MappedSignupError {
  outcome: SignupOutcome;
  message: string;
  offerSignIn: boolean;
}

/**
 * Map an API failure to the message and recovery this page offers.
 *
 * 400 covers both an invalid/expired invite code and ordinary field
 * validation — the server's own message distinguishes them, so it is shown
 * verbatim rather than re-interpreted. 409 is a duplicate account and offers
 * sign-in. 503 means invite signup is off entirely and points at the beta
 * request path instead of a dead form.
 */
export function mapSignupError(status: number, serverError?: string): MappedSignupError {
  if (status === 409) {
    return { outcome: "duplicate", message: serverError?.trim() ? serverError : "An account already exists for that email.", offerSignIn: true };
  }
  if (status === 503) {
    return { outcome: "unavailable", message: BETA_UNAVAILABLE_MESSAGE, offerSignIn: false };
  }
  if (status === 400) {
    return { outcome: "invalid", message: serverError?.trim() ? serverError : "That invite code is invalid or has expired.", offerSignIn: false };
  }
  return { outcome: "error", message: serverError?.trim() ? serverError : SIGNUP_GENERIC_ERROR, offerSignIn: false };
}

// ─── Timezone select — browser default preselected ─────────────────────────

export const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "UTC",
] as const;

/** The browser's own IANA zone, or "" if it cannot be read (never guessed further than that). */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}
