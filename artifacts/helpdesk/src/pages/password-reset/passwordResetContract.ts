/**
 * V5 customer-shell foundation — the password-reset contract, as pure
 * functions (S-2, required before first customer).
 *
 * Two endpoints. The server (api-server routes/receptionistAccount.ts) is the
 * source of truth for both shapes, and this module mirrors what it actually
 * does — not what an earlier brief specified:
 *
 *   POST /api/receptionist/account/password-reset/request  { email }
 *     → 200 { accepted: true, message } for every address (non-enumerating —
 *       the response never reveals whether the address has an account);
 *       503 while the feature flag is off or email delivery is unavailable;
 *       429 when rate limited.
 *
 *   POST /api/receptionist/account/password-reset/complete { token, newPassword }
 *     → 200 { ok: true }; 401 { error } for an invalid or expired code;
 *       400 { error } for a password that fails the length rule; 429.
 *
 * The brief said 202 and `password`. The server answers 200 and reads
 * `newPassword`, so a page built to the brief showed "Something went wrong"
 * after every successful request, and could never complete a reset.
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
 * successful (2xx) response.
 *
 * It says "email", not "link": the email always carries a code, and carries a
 * one-click link only when the server has a public address configured.
 */
export const REQUEST_CONFIRMATION =
  "If that email has an account, a password reset email is on its way. Check your inbox.";

export const REQUEST_UNAVAILABLE =
  "Password reset is not available yet — contact SiteMint.";

export const REQUEST_NETWORK_ERROR =
  "We couldn't reach the server. Your email is still here — try again.";

/** Where a person who already has the code from the email goes to use it. */
export const ENTER_CODE_HREF = "/password-reset/complete";
export const ENTER_CODE_LABEL = "Enter your reset code";

export type RequestOutcome = "confirmed" | "unavailable" | "error";

/** Any 2xx reads as confirmed; 503 reads as unavailable; anything else is a generic error. */
export function mapRequestStatus(status: number): RequestOutcome {
  if (status >= 200 && status < 300) return "confirmed";
  if (status === 503) return "unavailable";
  return "error";
}

// ─── Complete a reset ───────────────────────────────────────────────────────

export interface CompleteFormValues {
  /** Typed by hand only when the page was opened without `?token=`. */
  code: string;
  password: string;
  confirmPassword: string;
}

export const EMPTY_COMPLETE_FORM: CompleteFormValues = { code: "", password: "", confirmPassword: "" };

export const COMPLETE_ENDPOINT = "/api/receptionist/account/password-reset/complete";
export const COMPLETE_METHOD = "POST";
export const COMPLETE_CREDENTIALS = "include";

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_STRENGTH_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

export const CODE_LABEL = "Reset code";
export const CODE_HELP =
  "Paste the code from the password reset email. Codes work once and expire after 30 minutes.";

/** Same bound the server applies before it looks a token up. */
const MAX_CODE_LENGTH = 200;

/**
 * The token the page submits: the one in the link when there is one,
 * otherwise whatever was pasted into the code field. `null` when neither
 * holds anything.
 */
export function resolveResetToken(urlToken: string | null, typedCode: string): string | null {
  const fromUrl = urlToken?.trim() ?? "";
  if (fromUrl !== "") return fromUrl;
  const typed = typedCode.trim();
  return typed === "" ? null : typed;
}

export interface CompleteValidation {
  ok: boolean;
  formError: string;
  fieldErrors: { token?: string; password?: string; confirmPassword?: string };
}

const COMPLETE_OK: CompleteValidation = { ok: true, formError: "", fieldErrors: {} };

/**
 * Validates the token (from the `?token=` link, or pasted into the code field
 * when the page was opened without one — see `resolveResetToken`) alongside
 * the two password fields. The two must match, and the length rule mirrors
 * the signup password rule so a person is never told two different minimums
 * by two pages of the same product.
 */
export function validateComplete(form: CompleteFormValues, token: string | null): CompleteValidation {
  if (!token || !token.trim()) {
    return {
      ok: false,
      formError: "Enter the reset code from your email.",
      fieldErrors: { token: "Enter the code." },
    };
  }
  if (token.trim().length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      formError: "That doesn't look like a reset code. Paste it again from the email.",
      fieldErrors: { token: "Paste the code again." },
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

/** Exactly the keys the server reads: `body.token` and `body.newPassword`. */
export function buildCompletePayload(
  form: CompleteFormValues,
  token: string,
): { token: string; newPassword: string } {
  return { token: token.trim(), newPassword: form.password };
}

export const COMPLETE_NETWORK_ERROR =
  "We couldn't reach the server. Try again.";
export const COMPLETE_FALLBACK_ERROR = "This code is invalid or has expired. Request a new one.";
export const COMPLETE_RATE_LIMITED = "Too many attempts. Wait a while and try again.";

/**
 * The server's own sentence is shown when it sends one (401 invalid or expired
 * code, 400 weak password); 429 and any wordless failure get a fallback.
 */
export function mapCompleteError(status: number, serverError?: string): string {
  if (serverError?.trim()) return serverError;
  if (status === 429) return COMPLETE_RATE_LIMITED;
  return COMPLETE_FALLBACK_ERROR;
}
