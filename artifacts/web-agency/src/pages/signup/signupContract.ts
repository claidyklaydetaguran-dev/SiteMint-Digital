/**
 * The AI Receptionist account-creation contract, as pure functions.
 *
 * Ordinary registration: owner name, business name, work email, password,
 * timezone (optional), and a required Terms/Privacy acknowledgement. No invite
 * code — the private-beta invitation requirement is retired for customer
 * signup (invitations remain for joining someone else's team). Industry and
 * every other configuration decision belong to the guided setup the account
 * opens into; this page's only job is to create the account.
 *
 *   POST /api/receptionist/auth/register
 *   { ownerName, businessName, email, password, timezone, acceptedTerms: true }
 *     → 201 (session cookie set)
 *     → 400 { error }                        validation
 *     → 409 { error, code: "email_exists" }  an account already exists
 *     → 429 { error }                        too many attempts
 *     → 503 { error }                        registration is switched off
 *
 * No imports, so this stays portable into the plain `tsx` test runner with
 * no path-alias resolution — matching every other contract module in this
 * app.
 */

export interface SignupFormValues {
  ownerName: string;
  businessName: string;
  email: string;
  password: string;
  timezone: string;
  acceptedTerms: boolean;
}

export function emptySignupForm(defaultTimezone = ""): SignupFormValues {
  return {
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
  ownerName: string;
  businessName: string;
  email: string;
  password: string;
  timezone: string;
  acceptedTerms: true;
}

export const SIGNUP_ENDPOINT = "/api/receptionist/auth/register";
export const SIGNUP_METHOD = "POST";

/**
 * Build the request body. `acceptedTerms` is sent as the literal `true` —
 * `validateSignup` refuses to pass an unchecked form through, so by the time
 * this runs the box is known to be checked.
 */
export function buildSignupPayload(form: SignupFormValues): SignupPayload {
  return {
    ownerName: form.ownerName.trim(),
    businessName: form.businessName.trim(),
    email: form.email.trim(),
    password: form.password,
    timezone: form.timezone,
    acceptedTerms: true,
  };
}

export interface SignupValidation {
  ok: boolean;
  formError: string;
  fieldErrors: {
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
 * form is always the one reported: owner name → business name → email →
 * password length → the Terms/Privacy checkbox. The email check is only the
 * obvious shape; the server remains the authority.
 */
export function validateSignup(form: SignupFormValues): SignupValidation {
  if (!form.ownerName.trim()) {
    return { ok: false, formError: "Enter your name.", fieldErrors: { ownerName: "Required." }, focusField: "ownerName" };
  }
  if (!form.businessName.trim()) {
    return { ok: false, formError: "Enter your business name.", fieldErrors: { businessName: "Required." }, focusField: "businessName" };
  }
  if (!form.email.trim()) {
    return { ok: false, formError: "Enter your work email.", fieldErrors: { email: "Required." }, focusField: "email" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return { ok: false, formError: "Enter a valid email address.", fieldErrors: { email: "Check the address." }, focusField: "email" };
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
export const SIGNUP_UNAVAILABLE_MESSAGE =
  "Account creation is unavailable right now. Please try again later.";
export const SIGNUP_EXISTS_MESSAGE =
  "An account already exists for this email.";
export const SIGNUP_RATE_LIMITED_MESSAGE =
  "Too many attempts from this connection. Please wait a while and try again.";

export type SignupOutcome = "success" | "invalid" | "duplicate" | "unavailable" | "limited" | "error";

export interface MappedSignupError {
  outcome: SignupOutcome;
  message: string;
  /** Offer "Sign in" and "Reset your password" — an existing account is recovered, never duplicated. */
  offerRecovery: boolean;
}

/**
 * Map an API failure to the message and recovery this page offers.
 *
 * 400 is field validation and the server's own message is shown verbatim.
 * 409 is an existing account: the page offers sign-in and password reset
 * rather than a second business. 429 is the rate limit. 503 means
 * registration is switched off — stated plainly, with no dead-end link.
 */
export function mapSignupError(status: number, serverError?: string): MappedSignupError {
  if (status === 409) {
    return { outcome: "duplicate", message: SIGNUP_EXISTS_MESSAGE, offerRecovery: true };
  }
  if (status === 503) {
    return { outcome: "unavailable", message: SIGNUP_UNAVAILABLE_MESSAGE, offerRecovery: false };
  }
  if (status === 429) {
    return { outcome: "limited", message: SIGNUP_RATE_LIMITED_MESSAGE, offerRecovery: false };
  }
  if (status === 400) {
    return { outcome: "invalid", message: serverError?.trim() ? serverError : "Check the highlighted details and try again.", offerRecovery: false };
  }
  return { outcome: "error", message: SIGNUP_GENERIC_ERROR, offerRecovery: false };
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
