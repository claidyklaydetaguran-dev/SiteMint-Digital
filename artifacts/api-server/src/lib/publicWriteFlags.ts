// Fail-closed gates for the two UNAUTHENTICATED write surfaces this API
// exposes to the public internet:
//
//   1. self-registration  (POST /api/receptionist/auth/signup) — creates an
//      intake_firms row, a receptionist_sessions row, and, on first
//      availability access, a scheduling_availability_settings row;
//   2. public lead forms  (contact / discovery / landing-test submit) —
//      insert form_submissions and send notification email.
//
// They are DELIBERATELY SEPARATE flags: a deployment may legitimately want
// lead capture on while self-registration stays off. Never combine them.
//
// Same exact-string contract as every other capability flag in the P9
// environment contract: only the literal lowercase "true" enables. Absent,
// empty, "false", "TRUE", "1", or anything else means disabled, so a typo
// fails closed rather than silently opening a public write path. Neither
// value is a secret.

export const PUBLIC_REGISTRATION_ENABLED_ENV_VAR = "PUBLIC_REGISTRATION_ENABLED";
export const PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR = "PUBLIC_FORM_SUBMISSIONS_ENABLED";
export const PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR = "PUBLIC_ANALYTICS_WRITES_ENABLED";
export const AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR = "AI_TOOLKIT_CHECKOUT_ENABLED";

/** True only for the exact string "true". */
export function isPublicRegistrationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PUBLIC_REGISTRATION_ENABLED_ENV_VAR] === "true";
}

/** True only for the exact string "true". */
export function isPublicFormSubmissionsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PUBLIC_FORM_SUBMISSIONS_ENABLED_ENV_VAR] === "true";
}

/**
 * True only for the exact string "true".
 *
 * R5: anonymous analytics/telemetry writes (`POST /landing-test/view`, which
 * inserts `landing_page_views`) are a third, independent public write surface.
 * A deployment may legitimately want lead capture on while page-view telemetry
 * stays off — or the reverse — so this never shares a flag with the other two.
 * Read-only analytics (the admin-authenticated `GET /landing-test/stats`) is
 * unaffected.
 */
export function isPublicAnalyticsWritesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PUBLIC_ANALYTICS_WRITES_ENABLED_ENV_VAR] === "true";
}

/**
 * True only for the exact string "true".
 *
 * R6: `POST /ai-toolkit/checkout` is unauthenticated and creates a real
 * Stripe Checkout Session, so it is a commerce capability rather than a lead
 * form and gets its own switch. Deliberately NOT
 * `STRIPE_BOOT_SYNC_ENABLED` — that governs webhook registration and
 * backfill at boot, which is a different capability with a different blast
 * radius; sharing one flag would make enabling either one enable both.
 */
export function isAiToolkitCheckoutEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[AI_TOOLKIT_CHECKOUT_ENABLED_ENV_VAR] === "true";
}

/**
 * The repository's established feature-disabled reply (see
 * receptionistCalendar.ts and voiceSmsWebhook.ts): HTTP 503 with a short,
 * generic sentence. It names no flag, environment, or internal state, so a
 * probe cannot distinguish "switched off here" from "not built".
 */
export const PUBLIC_REGISTRATION_DISABLED_MESSAGE = "Account creation is not currently available.";
export const PUBLIC_FORM_SUBMISSIONS_DISABLED_MESSAGE = "Form submission is not currently available.";
export const PUBLIC_ANALYTICS_WRITES_DISABLED_MESSAGE = "Analytics recording is not currently available.";
export const AI_TOOLKIT_CHECKOUT_DISABLED_MESSAGE = "Checkout is not currently available.";
