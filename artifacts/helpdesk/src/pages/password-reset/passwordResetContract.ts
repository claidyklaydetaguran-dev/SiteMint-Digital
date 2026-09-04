/**
 * V5 customer-shell foundation — the password-reset contract, as pure
 * functions (S-2, required before first customer).
 *
 * Two endpoints, both specified in the task brief and built in parallel by
 * the backend owner:
 *
 *   POST /api/receptionist/account/password-reset/request  { email }
 *     → 202 { accepted: true } always (non-enumerating — the response never
 *       reveals whether the address has an account); 503 while the feature
 *       flag is off.
 *
 *   POST /api/receptionist/account/password-reset/complete { token, password }
 *     → 200 { ok: true }; 400 { error } for an invalid or expired token.
 *
 * No imports, matching every other contract module in this app, so this
 * stays portable into the plain `tsx` test runner with no path aliases.
 */

// ─── Request a reset ────────────────────────────────────────────────────────

export interface RequestFormValues {
  email: string;
}

export const EMPTY_REQUEST_FORM: RequestFormValues = { email: "" };

export const REQUEST_ENDPOINT = "/api/receptionist/account/password-reset/request";
export const REQUEST_METHOD = "POST";
export const REQUEST_CREDENTIALS = "include";

export interface RequestValidation {
  ok: boolean;
  fieldError: string | null;
}

/** The one client-side rule: the email field must be non-blank. The server decides format. */
export function validateRequest(form: RequestFormValues): RequestValidation {
  if (!form.email.trim()) {
    return { ok: false, fieldError: "Enter your email address." };
  }
  return { ok: true, fieldError: null };
}

export function buildRequestPayload(form: RequestFormValues): { email: string } {
  return { email: form.email };
}

/**
 * The confirmation copy is deliberately identical whether or not the address
 * has an account — the request is non-enumerating by contract, and the page
 * must not create a signal the backend does not send. It is shown for every
 * successful (202) response.
 */
export const REQUEST_CONFIRMATION =
  "If that email has an account, a password reset link is on its way. Check your inbox.";

export const REQUEST_UNAVAILABLE =
  "Password reset is not available yet — contact SiteMint.";

export const REQUEST_NETWORK_ERROR =
  "We couldn't reach the server. Your email is still here — try again.";

export type RequestOutcome = "confirmed" | "unavailable" | "error";

/** 202 always reads as confirmed; 503 reads as unavailable; anything else is a generic error. */
export function mapRequestStatus(status: number): RequestOutcome {
  if (status === 202) return "confirmed";
  if (status === 503) return "unavailable";
  return "error";
}

// ─── Complete a reset ───────────────────────────────────────────────────────

export interface CompleteFormValues {
  password: string;
  confirmPassword: string;
}

export const EMPTY_COMPLETE_FORM: CompleteFormValues = { password: "", confirmPassword: "" };

export const COMPLETE_ENDPOINT = "/api/receptionist/account/password-reset/complete";
export const COMPLETE_METHOD = "POST";
export const COMPLETE_CREDENTIALS = "include";

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_STRENGTH_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

export interface CompleteValidation {
  ok: boolean;
  formError: string;
  fieldErrors: { token?: string; password?: string; confirmPassword?: string };
}

const COMPLETE_OK: CompleteValidation = { ok: true, formError: "", fieldErrors: {} };

/**
 * Validates the token (read from the `?token=` query string, never typed by
 * hand) alongside the two password fields. The two must match, and the
 * length rule mirrors the signup password rule so a person is never told two
 * different minimums by two pages of the same product.
 */
export function validateComplete(form: CompleteFormValues, token: string | null): CompleteValidation {
  if (!token || !token.trim()) {
    return {
      ok: false,
      formError: "This reset link is missing its token. Request a new one.",
      fieldErrors: { token: "Missing token." },
    };
  }
  if (!form.password || form.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      formError: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      fieldErrors: { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
    };
  }
  if (form.password !== form.confirmPassword) {
    return {
      ok: false,
      formError: "Passwords do not match.",
      fieldErrors: { confirmPassword: "Passwords do not match." },
    };
  }
  return COMPLETE_OK;
}

export function buildCompletePayload(
  form: CompleteFormValues,
  token: string,
): { token: string; password: string } {
  return { token, password: form.password };
}

export const COMPLETE_NETWORK_ERROR =
  "We couldn't reach the server. Try again.";
export const COMPLETE_FALLBACK_ERROR = "This link is invalid or has expired. Request a new one.";

/** 400 is the only status the server defines for this route; every other failure falls back. */
export function mapCompleteError(status: number, serverError?: string): string {
  if (status === 400) {
    return serverError?.trim() ? serverError : COMPLETE_FALLBACK_ERROR;
  }
  return serverError?.trim() ? serverError : COMPLETE_FALLBACK_ERROR;
}
