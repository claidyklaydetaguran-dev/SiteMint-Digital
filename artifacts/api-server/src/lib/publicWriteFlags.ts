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
export const PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR = "PUBLIC_SCHEDULING_REQUESTS_ENABLED";
export const PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR = "PASSWORD_RESET_REQUESTS_ENABLED";
// V5 S-1: invite-only self-service signup — a NARROWER capability than
// PUBLIC_REGISTRATION_ENABLED (open signup). The two are deliberately
// independent: a private-beta deployment may want invite-gated signup on
// while open registration stays off, and must never get open registration
// for free by enabling this one.
export const INVITE_SIGNUP_ENABLED_ENV_VAR = "INVITE_SIGNUP_ENABLED";
// V5 PR-4: unauthenticated public beta-access request form
// (POST /api/public/beta-requests). Its own flag — enabling lead capture
// elsewhere (PUBLIC_FORM_SUBMISSIONS_ENABLED) must not also open this one,
// and vice versa.
export const PUBLIC_BETA_REQUESTS_ENABLED_ENV_VAR = "PUBLIC_BETA_REQUESTS_ENABLED";

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
 * True only for the exact string "true".
 *
 * R7: `POST /public/schedule/:slug/requests` lets anyone who knows a firm's
 * booking slug persist an appointment request. Booking is its own capability —
 * not lead capture — so it gets its own switch rather than being folded into
 * `PUBLIC_FORM_SUBMISSIONS_ENABLED`. The read-only availability endpoints
 * (`/config`, `/days`, `/slots`) are deliberately NOT gated by this: they
 * persist nothing, and a booking page that cannot render is not safer.
 */
export function isPublicSchedulingRequestsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PUBLIC_SCHEDULING_REQUESTS_ENABLED_ENV_VAR] === "true";
}

/**
 * True only for the exact string "true".
 *
 * R8: `POST /receptionist/account/password-reset/request` is unauthenticated by
 * design — the caller is proving nothing yet — but it is not side-effect free.
 * For a known address it persists a `password_reset` token row, sends an email,
 * and writes an audit row, so an unauthenticated caller can cause writes and
 * outbound mail. It gets its own switch, independent of the public-write flags
 * and of generic email configuration (`RESEND_API_KEY`): having a mail provider
 * configured is not consent to expose password recovery.
 *
 * Turning this off disables password recovery for real customers. That is a
 * product decision as much as a security one, which is exactly why it is an
 * explicit switch rather than something folded into another flag.
 */
export function isPasswordResetRequestsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PASSWORD_RESET_REQUESTS_ENABLED_ENV_VAR] === "true";
}

/**
 * True only for the exact string "true".
 *
 * S-1: gates `POST /api/receptionist/auth/invite-signup`. Independent of
 * PUBLIC_REGISTRATION_ENABLED — invite-gated signup is a narrower surface
 * (a caller must present a valid, unredeemed, unexpired invite code) and
 * must be controllable on its own.
 */
export function isInviteSignupEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[INVITE_SIGNUP_ENABLED_ENV_VAR] === "true";
}

/**
 * True only for the exact string "true".
 *
 * PR-4: gates `POST /api/public/beta-requests`. Independent of every other
 * public-write flag — it persists a voice_beta_requests row and is a lead
 * form for a specific product surface, not general lead capture.
 */
export function isPublicBetaRequestsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[PUBLIC_BETA_REQUESTS_ENABLED_ENV_VAR] === "true";
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
export const PUBLIC_SCHEDULING_REQUESTS_DISABLED_MESSAGE = "Online booking is not currently available.";
export const PASSWORD_RESET_REQUESTS_DISABLED_MESSAGE = "Password reset is not currently available.";
export const INVITE_SIGNUP_DISABLED_MESSAGE = "Account creation is not currently available.";
export const PUBLIC_BETA_REQUESTS_DISABLED_MESSAGE = "Form submission is not currently available.";
