/**
 * Frontend V2 Phase 5 — the AI Receptionist signup contract, as pure functions.
 *
 * Everything on this page that has to stay *exactly* the same lives here:
 * the submitted payload shape, the client-side validation rules, and the
 * mapping from an HTTP status to the message the user reads. Extracting them
 * from the component is what makes them testable without a DOM, a test
 * renderer, or any new dependency — `scripts/src/frontendSignupContract.test.ts`
 * imports this module directly.
 *
 * **Nothing here changes behaviour.** The payload keys, the two validation
 * rules, and their order and wording are carried over unmodified from the
 * page that shipped before Phase 5. The backend
 * (`artifacts/api-server/src/routes/receptionistAuth.ts`, a protected file that
 * was read and not touched) requires `fullName`, `email`, and `password`,
 * enforces `password.length >= 8`, and answers 400 / 409 / 429 with
 * `{ error }`. This module mirrors that contract; it does not extend it.
 *
 * This module deliberately has **no imports**, so it stays trivially portable
 * into a plain `tsx` test process with no path-alias resolution.
 */

/** The form's client-side state. Field names are the page's, not the API's. */
export interface SignupFormValues {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
  password: string;
}

export const EMPTY_SIGNUP_FORM: SignupFormValues = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  businessType: "",
  password: "",
};

/** The request body, exactly as the API has always received it. */
export interface SignupPayload {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  industry: string;
  password: string;
}

/** Endpoint and method are part of the frozen contract. */
export const SIGNUP_ENDPOINT = "/api/receptionist/auth/signup";
export const SIGNUP_METHOD = "POST";

/**
 * Build the request body. Values are passed through untrimmed, exactly as the
 * previous implementation did — the server trims. Changing that here would
 * silently alter what gets stored.
 */
export function buildSignupPayload(form: SignupFormValues): SignupPayload {
  return {
    fullName: form.name,
    businessName: form.businessName,
    email: form.email,
    phone: form.phone,
    industry: form.businessType,
    password: form.password,
  };
}

export interface SignupValidation {
  ok: boolean;
  /** The form-level message, unchanged from the previous implementation. */
  formError: string;
  /** Which fields the failing rule implicates, for inline display. */
  fieldErrors: { name?: string; email?: string; password?: string };
  /** The field that should receive focus when validation fails. */
  focusField: keyof SignupFormValues | null;
}

const OK: SignupValidation = { ok: true, formError: "", fieldErrors: {}, focusField: null };

/**
 * The two client-side rules, in their original order.
 *
 * Rule 1: full name and email must be non-blank.
 * Rule 2: password must be at least 8 characters.
 *
 * No third rule is added — in particular there is no client-side email-format
 * rule, because adding one would reject inputs the server currently accepts.
 * The inline `fieldErrors` are a presentation of these same rules, not new ones.
 */
export function validateSignup(form: SignupFormValues): SignupValidation {
  const nameBlank = !form.name.trim();
  const emailBlank = !form.email.trim();

  if (nameBlank || emailBlank) {
    return {
      ok: false,
      formError: "Name and email are required.",
      fieldErrors: {
        ...(nameBlank ? { name: "Enter your full name." } : {}),
        ...(emailBlank ? { email: "Enter your email address." } : {}),
      },
      focusField: nameBlank ? "name" : "email",
    };
  }

  if (!form.password.trim() || form.password.length < 8) {
    return {
      ok: false,
      formError: "Password must be at least 8 characters.",
      fieldErrors: { password: "Use at least 8 characters." },
      focusField: "password",
    };
  }

  return OK;
}

/** Shown when `fetch` itself fails. Wording from CONTENT-SPECIFICATION.md §5. */
export const SIGNUP_NETWORK_ERROR =
  "We couldn't reach the server. Your details are still here — try again.";

/** The fallback the previous implementation used for an unmapped failure. */
export const SIGNUP_GENERIC_ERROR = "Signup failed — please try again.";

export interface MappedSignupError {
  message: string;
  /** 409 only: the recovery is to sign in, so the message carries that link. */
  offerSignIn: boolean;
}

/**
 * Map an API failure to the message the user reads.
 *
 * The two statuses the backend defines precisely — 409 duplicate email and 429
 * rate limit — get the approved wording from CONTENT-SPECIFICATION.md §5, which
 * tells the user what to actually do next. Every other status keeps the
 * previous behaviour of showing the server's own `error` string, falling back
 * to the generic message. No status is swallowed or re-interpreted.
 */
export function mapSignupError(status: number, serverError?: string): MappedSignupError {
  if (status === 409) {
    return {
      message: "An account already exists for that email.",
      offerSignIn: true,
    };
  }
  if (status === 429) {
    return {
      message: "Too many signup attempts from this network. Try again in an hour.",
      offerSignIn: false,
    };
  }
  return { message: serverError || SIGNUP_GENERIC_ERROR, offerSignIn: false };
}

/**
 * The industry options, unchanged. Optional field: an empty value is valid and
 * is sent as an empty string, exactly as before.
 */
export const INDUSTRY_OPTIONS = [
  "Real Estate",
  "Law Firm",
  "Home Services (HVAC, Plumbing, Electrical…)",
  "Med Spa / Aesthetics",
  "Restaurant",
  "Retail",
  "Other",
] as const;

/**
 * The stored value differs from the visible label for two options — this is the
 * mapping the previous implementation used, preserved verbatim so what lands in
 * `intake_firms.industry` does not change.
 */
export const INDUSTRY_VALUES: Record<string, string> = {
  "Real Estate": "Real Estate",
  "Law Firm": "Law Firm",
  "Home Services (HVAC, Plumbing, Electrical…)": "Home Services",
  "Med Spa / Aesthetics": "Med Spa",
  Restaurant: "Restaurant",
  Retail: "Retail",
  Other: "Other",
};
