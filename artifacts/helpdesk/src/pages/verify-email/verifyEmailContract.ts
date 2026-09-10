/**
 * Email verification page contract (owner directive 2026-09-11 §5).
 *
 * The verification email carries a CODE (accountTokens.ts issues 32
 * base64url bytes, valid 24 hours, single use). This page confirms it:
 * either the code arrives in the query string (`/verify-email?token=…`) or
 * the customer pastes it from the email. Confirmation is token-proven and
 * unauthenticated on the API side; requesting a FRESH code requires the
 * session (the signed-in owner asks for their own address again).
 *
 * On success the backend enqueues the welcome email (once — the job row is
 * unique per firm) and this page routes the customer onward to setup.
 */

export const CONFIRM_ENDPOINT = "/api/receptionist/account/verify-email/confirm";
export const CONFIRM_METHOD = "POST";
export const CONFIRM_CREDENTIALS = "include" as RequestCredentials;

export const RESEND_ENDPOINT = "/api/receptionist/account/verify-email/request";
export const RESEND_METHOD = "POST";
export const RESEND_CREDENTIALS = "include" as RequestCredentials;

/** Where a verified customer goes next. */
export const CONTINUE_HREF = "/setup";
export const SIGN_IN_HREF = "/login";

export const CODE_LABEL = "Verification code";
export const CODE_HELP = "Paste the code from the email we sent you. Codes are valid for 24 hours.";

export const CONFIRM_INVALID =
  "That code is invalid or has expired. Codes are valid for 24 hours and can only be used once.";
export const CONFIRM_NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again.";
export const RESEND_SENT =
  "A new verification code is on its way. It can take a minute to arrive.";
export const RESEND_NEEDS_SESSION =
  "To get a new code, sign in first — then request verification again from this page.";
export const RESEND_UNAVAILABLE =
  "Email delivery isn't available right now. Please try again later.";

export interface VerifyFormValues {
  code: string;
}

export const EMPTY_VERIFY_FORM: VerifyFormValues = { code: "" };

export function validateVerify(form: VerifyFormValues): { ok: true; code: string } | { ok: false; error: string } {
  const code = form.code.trim();
  if (!code) return { ok: false, error: "Enter the verification code from your email." };
  if (code.length > 200) return { ok: false, error: "That doesn't look like a verification code." };
  return { ok: true, code };
}

export function buildConfirmPayload(code: string): { token: string } {
  return { token: code };
}

export function mapConfirmError(status: number): string {
  if (status === 401) return CONFIRM_INVALID;
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  return "Something went wrong on our side. Please try again.";
}

export function mapResendError(status: number): string {
  if (status === 401) return RESEND_NEEDS_SESSION;
  if (status === 503) return RESEND_UNAVAILABLE;
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  return "Something went wrong on our side. Please try again.";
}
