/**
 * AI Receptionist V5 — the Request Beta Access form contract (§beta).
 *
 * Pure functions only, mirroring `pages/signup/signupContract.ts`'s shape so
 * the two forms stay recognizably consistent. Kept separate from
 * `BetaRequestForm.tsx` so `receptionistV5Contract.test.ts` can exercise the
 * validation rules, the payload shape, and the honeypot/status handling
 * directly, without a DOM.
 *
 * Backend contract (implemented in parallel by the backend owner):
 * `POST /api/public/beta-requests` with body
 * `{name, businessName, workEmail, phone?, message?, source:"landing",
 * companyFax:"" (honeypot), formStartedAt}` → 202 `{received:true}`;
 * 503 `{error}` when the flag is off; 400 validation `{error}`; 429 rate
 * limited. This module mirrors that contract; it does not invent fields the
 * backend does not define.
 *
 * No imports, so a plain `tsx` test process can load it directly.
 */

export interface BetaRequestFormValues {
  name: string;
  businessName: string;
  workEmail: string;
  phone: string;
  message: string;
}

export const EMPTY_BETA_REQUEST_FORM: BetaRequestFormValues = {
  name: "",
  businessName: "",
  workEmail: "",
  phone: "",
  message: "",
};

/** The honeypot field name. Left blank by a human; a bot's autofill tends to fill every field it can see. */
export const HONEYPOT_FIELD = "companyFax";

export interface BetaRequestPayload {
  name: string;
  businessName: string;
  workEmail: string;
  phone?: string;
  message?: string;
  source: "landing";
  companyFax: string;
  formStartedAt: string;
}

export const BETA_REQUEST_ENDPOINT = "/api/public/beta-requests";
export const BETA_REQUEST_METHOD = "POST";

/** Builds the exact request body the backend contract expects. Optional fields are omitted, not sent empty, when blank. */
export function buildBetaRequestPayload(
  form: BetaRequestFormValues,
  formStartedAt: string,
): BetaRequestPayload {
  const payload: BetaRequestPayload = {
    name: form.name,
    businessName: form.businessName,
    workEmail: form.workEmail,
    source: "landing",
    companyFax: "",
    formStartedAt,
  };
  if (form.phone.trim()) payload.phone = form.phone;
  if (form.message.trim()) payload.message = form.message;
  return payload;
}

export interface BetaRequestValidation {
  ok: boolean;
  formError: string;
  fieldErrors: { name?: string; businessName?: string; workEmail?: string };
  focusField: keyof BetaRequestFormValues | null;
}

const OK: BetaRequestValidation = { ok: true, formError: "", fieldErrors: {}, focusField: null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client-side validation: name, business name, and a plausibly-shaped work
 * email are required. Phone and message stay optional. This is a shallow
 * shape check (matches `EMAIL_PATTERN`), not full RFC validation — the
 * server is the source of truth.
 */
export function validateBetaRequest(form: BetaRequestFormValues): BetaRequestValidation {
  const nameBlank = !form.name.trim();
  const businessBlank = !form.businessName.trim();
  if (nameBlank || businessBlank) {
    return {
      ok: false,
      formError: "Name and business name are required.",
      fieldErrors: {
        ...(nameBlank ? { name: "Enter your name." } : {}),
        ...(businessBlank ? { businessName: "Enter your business name." } : {}),
      },
      focusField: nameBlank ? "name" : "businessName",
    };
  }

  const email = form.workEmail.trim();
  if (!email || !EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      formError: "Enter a valid work email address.",
      fieldErrors: { workEmail: "Enter a valid email address." },
      focusField: "workEmail",
    };
  }

  return OK;
}

export const BETA_REQUEST_NETWORK_ERROR =
  "We couldn't reach the server. Your details are still here — try again.";
export const BETA_REQUEST_GENERIC_ERROR = "Something went wrong. Please try again.";

/** Shown when the request looks bot-like (honeypot filled, or submitted implausibly fast). The submission is silently skipped — no network call is made — but the visitor sees the same success state a real submission would. */
export const BETA_REQUEST_MIN_FILL_MS = 1500;

export interface MappedBetaRequestError {
  message: string;
}

/**
 * Maps an HTTP status to the message the visitor reads. 503 means the
 * private-beta intake flag is off — the message points to the real inbox
 * from `sections.ts`'s `CONTACT_EMAIL` rather than leaving a dead end. 429
 * gets the rate-limit wording from the brief; every other failure falls
 * back to the server's own `error` string or the generic message.
 */
export function mapBetaRequestError(
  status: number,
  serverError: string | undefined,
  contactEmail: string,
): MappedBetaRequestError {
  if (status === 503) {
    return { message: `Beta requests open soon — email us at ${contactEmail}.` };
  }
  if (status === 429) {
    return { message: "Please try again in a minute." };
  }
  if (status === 400) {
    return { message: serverError || "Please check the form and try again." };
  }
  return { message: serverError || BETA_REQUEST_GENERIC_ERROR };
}

/** True when the honeypot field carries a value, or the form was filled in implausibly fast — both are silently treated as a no-op success rather than surfaced as bot detection. */
export function isLikelyBot(honeypotValue: string, formStartedAt: number, now: number): boolean {
  if (honeypotValue.trim().length > 0) return true;
  return now - formStartedAt < BETA_REQUEST_MIN_FILL_MS;
}
