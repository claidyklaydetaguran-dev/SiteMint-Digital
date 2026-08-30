/**
 * Frontend V2 Phase 6 — the AI Receptionist sign-in contract, as pure functions.
 *
 * Everything on the sign-in page that has to stay *exactly* the same lives
 * here: the endpoint, the method, the submitted payload shape, the credentials
 * mode, the post-login destination, and the mapping from an HTTP status to the
 * message the user reads. Extracting them from the component is what makes
 * them assertable without a DOM, a test renderer, or any new dependency —
 * `loginContract.test.ts` imports this module directly, exactly as Phase 5 did
 * for signup.
 *
 * **Nothing here changes the network contract.** The backend
 * (`artifacts/api-server/src/routes/receptionistAuth.ts`, a protected file that
 * was read and not modified) accepts `{ email, password }` at
 * `POST /api/receptionist/auth/login`, answers 400 when either is blank, 401
 * with `{ error: "Invalid email or password." }` on a bad credential, 429 with
 * `{ error: "Too many attempts. Try again later." }` once the sliding-window
 * limiter trips, and on success sets the httpOnly `receptionist_session` cookie
 * and returns `{ firm }`. This module mirrors that contract; it does not extend
 * it.
 *
 * Two deliberate presentation-layer additions, neither of which touches the
 * request:
 *
 *  1. `validateLogin` blocks a submission with a blank email or password. The
 *     server already rejects that case with a 400, so this only stops a
 *     pointless round trip and puts focus on the field at fault. It applies
 *     **no** format or length rule — a rule stricter than the server's would
 *     lock out a credential the server would have accepted.
 *  2. `LOGIN_NETWORK_ERROR` replaces the raw `fetch` rejection message (the
 *     previous page rendered "Failed to fetch" verbatim) with the approved
 *     wording, following the Phase 5 signup precedent. Server responses are
 *     unaffected.
 *
 * This module deliberately has **no imports**, so it stays trivially portable
 * into a plain `tsx` test process with no path-alias resolution.
 */

/** The form's client-side state. These are also the API's field names. */
export interface LoginFormValues {
  email: string;
  password: string;
}

export const EMPTY_LOGIN_FORM: LoginFormValues = {
  email: "",
  password: "",
};

/** The request body, exactly as the API has always received it. */
export interface LoginPayload {
  email: string;
  password: string;
}

/** Endpoint, method, and credentials mode are part of the frozen contract. */
export const LOGIN_ENDPOINT = "/api/receptionist/auth/login";
export const LOGIN_METHOD = "POST";
export const LOGIN_CREDENTIALS = "include";

/**
 * The in-SPA destination after a successful sign-in, unchanged: the dashboard
 * overview route. `Login.tsx` reaches it with `navigate(LOGIN_SUCCESS_ROUTE)`,
 * and `wouter` prepends the app's base, so this stays base-relative.
 */
export const LOGIN_SUCCESS_ROUTE = "/";

/**
 * Build the request body. Values are passed through untrimmed, exactly as the
 * previous implementation did — the server lowercases and trims the email
 * itself, and the password must never be altered in transit.
 */
export function buildLoginPayload(form: LoginFormValues): LoginPayload {
  return {
    email: form.email,
    password: form.password,
  };
}

export interface LoginValidation {
  ok: boolean;
  /** The form-level message. */
  formError: string;
  /** Which fields the failing rule implicates, for inline display. */
  fieldErrors: { email?: string; password?: string };
  /** The field that should receive focus when validation fails. */
  focusField: keyof LoginFormValues | null;
}

const OK: LoginValidation = { ok: true, formError: "", fieldErrors: {}, focusField: null };

/**
 * The one client-side rule: both credentials must be non-blank.
 *
 * Both fields are reported at once when both are blank, so a person filling the
 * form is not sent back twice, and focus goes to the first of them.
 */
export function validateLogin(form: LoginFormValues): LoginValidation {
  const emailBlank = !form.email.trim();
  const passwordBlank = !form.password.trim();

  if (emailBlank || passwordBlank) {
    return {
      ok: false,
      formError:
        emailBlank && passwordBlank
          ? "Enter your email address and password."
          : emailBlank
            ? "Enter your email address."
            : "Enter your password.",
      fieldErrors: {
        ...(emailBlank ? { email: "Enter your email address." } : {}),
        ...(passwordBlank ? { password: "Enter your password." } : {}),
      },
      focusField: emailBlank ? "email" : "password",
    };
  }

  return OK;
}

/** Shown when `fetch` itself fails. Wording from CONTENT-SPECIFICATION.md §5. */
export const LOGIN_NETWORK_ERROR =
  "We couldn't reach the server. Your email is still here — try again.";

/**
 * The message the previous implementation fell back to for any failure that
 * carried no server `error` string. Preserved verbatim.
 */
export const LOGIN_FALLBACK_ERROR = "Invalid email or password";

export interface MappedLoginError {
  message: string;
  /** 429 only: the recovery is to wait, so the message says how long. */
  rateLimited: boolean;
}

/**
 * Map an API failure to the message the user reads.
 *
 * 429 is the one status the previous page could not explain: the server's
 * "Too many attempts. Try again later." does not say how long "later" is, and
 * the limiter's window is a documented 15 minutes
 * (`LOGIN_EMAIL_WINDOW` / `LOGIN_IP_WINDOW` in the protected
 * `authRateLimit.ts`). Every other status keeps the previous behaviour exactly:
 * show the server's own `error` string, falling back to
 * `LOGIN_FALLBACK_ERROR`. No status is swallowed or re-interpreted, and 401 is
 * deliberately left as the server's own wording so the page never reveals
 * whether the email exists.
 */
export function mapLoginError(status: number, serverError?: string): MappedLoginError {
  if (status === 429) {
    return {
      message: "Too many sign-in attempts. Try again in 15 minutes.",
      rateLimited: true,
    };
  }
  // A blank server string would render an empty alert — no live response path
  // produces one, and falling back keeps the failure legible if that changes.
  return { message: serverError?.trim() ? serverError : LOGIN_FALLBACK_ERROR, rateLimited: false };
}
