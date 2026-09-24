/**
 * Server-side validation for POST /api/contact/submit, extracted into its
 * own pure module (no Express, no DB) so it can be unit-tested directly and
 * so the route stays a thin orchestrator. Mirrors the frontend's zod schema
 * (PlatformContactPreview.tsx) — name/email/message required, businessType
 * optional — so client and server agree on what "valid" means, closing the
 * gap where the UI treated message as required but the backend didn't.
 *
 * Max lengths are not invented for this route: they're the same limits
 * @workspace/discovery-contract's real schemas.ts already uses for the
 * equivalent field shapes — `shortText(200)` for name/organizationName,
 * `z.email().max(320)`, and the repeated `max(2000)` convention for
 * long-text fields (currentSituation, primaryProblem, etc.) — so this
 * route's limits are repository-consistent, not arbitrary.
 */

export const CONTACT_MAX_LENGTHS = {
  name: 200,
  email: 320,
  businessType: 200,
  message: 2000,
} as const;

export interface ContactValidationOk {
  ok: true;
  data: {
    name: string;
    email: string;
    businessType: string | null;
    message: string;
  };
}

export interface ContactValidationFailed {
  ok: false;
  fields: Record<string, string>;
}

export type ContactValidationResult = ContactValidationOk | ContactValidationFailed;

// Deliberately simple — not attempting to replicate every RFC 5322 edge
// case, just requiring a plausible local@domain.tld shape. Consistent
// in spirit with the frontend's zod `.email()` check: reject the obviously
// invalid case fast, without stack traces or internal detail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateContactSubmission(data: Record<string, unknown>): ContactValidationResult {
  const fields: Record<string, string> = {};

  const name = trimmedString(data.name);
  if (!name) {
    fields.name = "Name is required.";
  } else if (name.length > CONTACT_MAX_LENGTHS.name) {
    fields.name = `Name must be ${CONTACT_MAX_LENGTHS.name} characters or fewer.`;
  }

  const email = trimmedString(data.email);
  if (!email) {
    fields.email = "Email is required.";
  } else if (email.length > CONTACT_MAX_LENGTHS.email) {
    fields.email = `Email must be ${CONTACT_MAX_LENGTHS.email} characters or fewer.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    fields.email = "Enter a valid email address.";
  }

  const message = trimmedString(data.message);
  if (!message) {
    fields.message = "Message is required.";
  } else if (message.length > CONTACT_MAX_LENGTHS.message) {
    fields.message = `Message must be ${CONTACT_MAX_LENGTHS.message} characters or fewer.`;
  }

  const businessType = trimmedString(data.businessType);
  if (businessType.length > CONTACT_MAX_LENGTHS.businessType) {
    fields.businessType = `Organization must be ${CONTACT_MAX_LENGTHS.businessType} characters or fewer.`;
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }

  return {
    ok: true,
    data: { name, email, businessType: businessType || null, message },
  };
}
