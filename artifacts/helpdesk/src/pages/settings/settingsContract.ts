/**
 * V5 customer-shell foundation — the truth layer for the Settings workspace
 * (D-7: editable business name, business type/industry, primary contact,
 * timezone, default business location, account password).
 *
 * Phase 11 established that this route had **no** settings endpoint and
 * documented that absence at length (see `settingsContract.test.ts`'s git
 * history for the removed premise). D-7 changes that premise: the firm's
 * `agent-config` route now carries `timezone`, `primaryContact` and
 * `defaultLocation` alongside the fields it already returned
 * (`name`, `industry`), and a new password-change endpoint exists —
 * both documented in `lib/accountApi.ts`, which this module builds on. Team
 * membership, notification preferences and any other invented control from
 * the old page remain out of scope; only the fields the brief names are
 * editable here.
 *
 * `AccountSource` is still declared structurally (not imported from
 * `hooks/useSession`) so this module stays portable into the plain `tsx`
 * test runner with no path-alias resolution — matching every other contract
 * module in this app.
 */

// ─── Session-only, read-only identity ──────────────────────────────────────

export interface AccountSource {
  name: string;
  email: string | null;
  planTier: string;
  createdAt: string;
}

export interface AccountField {
  label: string;
  value: string | null;
}

export const NOT_AVAILABLE = "Not available";

/**
 * The plan tier's label, unchanged from Phase 11/12 — reused verbatim by
 * Billing so one account is never named two different things on two routes.
 */
export function planLabel(planTier: string | null | undefined): string | null {
  const raw = (planTier ?? "").trim();
  if (raw === "") return null;
  if (raw === "paid") return "Paid plan";
  if (raw === "trial") return "Free Trial";
  return raw;
}

export function isKnownPlan(planTier: string | null | undefined): boolean {
  const raw = (planTier ?? "").trim();
  return raw === "paid" || raw === "trial";
}

export function memberSince(createdAt: string | null | undefined): string | null {
  const raw = (createdAt ?? "").trim();
  if (raw === "") return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Business, email, plan (when known) and member-since (when parseable) — read-only. */
export function accountFields(firm: AccountSource): AccountField[] {
  const name = (firm.name ?? "").trim();
  const email = (firm.email ?? "").trim();
  const plan = planLabel(firm.planTier);
  const since = memberSince(firm.createdAt);

  const fields: AccountField[] = [
    { label: "Business", value: name === "" ? null : name },
    { label: "Email", value: email === "" ? null : email },
  ];
  if (plan !== null) fields.push({ label: "Plan", value: plan });
  if (since !== null) fields.push({ label: "Member since", value: since });
  return fields;
}

export function accountNote(): string {
  return "Business name, email and plan are shown as they are recorded on your account.";
}

// ─── Changing the sign-in / notification address ───────────────────────────
//
// This is the address the account signs in with AND the only address anything
// is ever sent to. Until it existed, a business that signed up with a typo or a
// placeholder had no way back to a reachable inbox from inside the product.

export const EMAIL_CHANGE = {
  heading: "Email address",
  note: "This is the address you sign in with, and the only address we send anything to. Changing it signs you out of nothing — but the new address has to be confirmed before we send anything to it.",
  newLabel: "New email address",
  passwordLabel: "Current password",
  passwordHelp: "Required, because this address is how you sign in.",
  submit: "Change email address",
  submitPending: "Changing…",

  changedTitle: "Email address changed",
  changedSentDetail: "We sent a confirmation code to the new address. Enter it on the Verify email page to finish.",
  changedNotSentDetail:
    "The address was changed, but the confirmation email could not be sent. Ask for a new code from the Verify email page.",
  failedTitle: "Email address not changed",

  verifyLinkLabel: "Go to Verify email",
  verifyHref: "/verify-email",
} as const;

export interface EmailChangeForm {
  email: string;
  currentPassword: string;
}

export const EMPTY_EMAIL_CHANGE_FORM: EmailChangeForm = { email: "", currentPassword: "" };

export type EmailChangeFieldErrors = Partial<Record<keyof EmailChangeForm, string>>;

/**
 * Client-side checks only catch what the browser can see. The server is
 * authoritative — including on which domains can actually receive mail — and
 * its sentence is shown verbatim when it refuses.
 */
export function validateEmailChange(
  form: EmailChangeForm,
): { ok: true; payload: { email: string; currentPassword: string } } | { ok: false; errors: EmailChangeFieldErrors } {
  const errors: EmailChangeFieldErrors = {};
  const email = form.email.trim();
  if (email === "") errors.email = "Enter the new email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  else if (/\.(invalid|test|example|localhost)$/i.test(email)) {
    // Named rather than generically rejected: these look valid and are
    // guaranteed undeliverable, so "invalid address" would read as a bug.
    errors.email = "That domain can never receive mail. Use an inbox you can actually open.";
  }
  if (form.currentPassword === "") errors.currentPassword = "Enter your current password.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, payload: { email: email.toLowerCase(), currentPassword: form.currentPassword } };
}

/** What to tell the business after the server accepted the change. */
export function emailChangeDetail(verificationSent: boolean): string {
  return verificationSent ? EMAIL_CHANGE.changedSentDetail : EMAIL_CHANGE.changedNotSentDetail;
}

// ─── Editable business profile (D-7) ───────────────────────────────────────

// Three fields, because three fields is what the account can actually store.
// A "primary contact" and a "default business location" were offered here
// before and had nowhere to be saved: the account row has no column for
// either, so whatever the customer typed was discarded on submit. An input
// that silently throws away what you typed is worse than one that isn't
// there — they come back when there is somewhere to put them.
export interface ProfileFormValues {
  name: string;
  industry: string;
  timezone: string;
}

/** Every field the form submits is optional client-side — the server is authoritative on what it requires. */
export function buildProfilePatch(form: ProfileFormValues): {
  name: string;
  industry: string;
  timezone: string;
} {
  return {
    name: form.name.trim(),
    industry: form.industry.trim(),
    timezone: form.timezone,
  };
}

export interface ProfileValidation {
  ok: boolean;
  formError: string;
  fieldErrors: { name?: string };
}

/** One client-side rule: the business name must not be blank. Everything else is optional. */
export function validateProfile(form: ProfileFormValues): ProfileValidation {
  if (!form.name.trim()) {
    return { ok: false, formError: "Enter your business name.", fieldErrors: { name: "Required." } };
  }
  return { ok: true, formError: "", fieldErrors: {} };
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function saveButtonLabel(state: SaveState): string {
  if (state === "saving") return "Saving…";
  if (state === "saved") return "Saved";
  return "Save changes";
}

export const PROFILE_SAVE_ERROR = "We couldn't save your changes. Try again.";

// ─── Timezone options ───────────────────────────────────────────────────────

/**
 * A short, real list of IANA timezones — not exhaustive, but every entry is a
 * genuine zone `Intl` recognises, so a saved value is never a fabricated
 * label. The browser's own zone is preselected by the page (via
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`), matching the pattern
 * used for the invite-signup timezone field.
 */
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

// ─── Change password (S-2) ──────────────────────────────────────────────────

export interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const EMPTY_PASSWORD_FORM: PasswordFormValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export const MIN_NEW_PASSWORD_LENGTH = 8;

export interface PasswordValidation {
  ok: boolean;
  formError: string;
  fieldErrors: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
}

export function validatePasswordChange(form: PasswordFormValues): PasswordValidation {
  if (!form.currentPassword) {
    return { ok: false, formError: "Enter your current password.", fieldErrors: { currentPassword: "Required." } };
  }
  if (form.newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
    return {
      ok: false,
      formError: `New password must be at least ${MIN_NEW_PASSWORD_LENGTH} characters.`,
      fieldErrors: { newPassword: `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.` },
    };
  }
  if (form.newPassword !== form.confirmPassword) {
    return { ok: false, formError: "New passwords do not match.", fieldErrors: { confirmPassword: "Passwords do not match." } };
  }
  return { ok: true, formError: "", fieldErrors: {} };
}

// ─── Configuration destinations ────────────────────────────────────────────

export interface Destination {
  href: string;
  title: string;
  detail: string;
  action: string;
}

export function destinations(): Destination[] {
  return [
    { href: "/channels/sms", title: "Receptionist", detail: "Open the SMS Receptionist configuration.", action: "Open Receptionist" },
    { href: "/assistants", title: "Assistant", detail: "Configure the voice assistant, prompt and voice.", action: "Open Assistant" },
    { href: "/account/billing", title: "Billing", detail: "Review plan and usage information.", action: "View billing" },
  ];
}

// ─── Calendar connection banner (reads ?calendar=connected|error) ─────────

export type CalendarBannerState = "connected" | "error" | null;

export function readCalendarParam(value: string | null): CalendarBannerState {
  if (value === "connected") return "connected";
  if (value === "error") return "error";
  return null;
}

export interface CalendarBannerCopy {
  tone: "success" | "error";
  title: string;
  detail: string;
}

export function calendarBannerCopy(state: "connected" | "error"): CalendarBannerCopy {
  if (state === "connected") {
    return { tone: "success", title: "Calendar connected", detail: "Google Calendar is now connected." };
  }
  return {
    tone: "error",
    title: "Calendar connection failed",
    detail: "We couldn't connect your calendar. Try again from Scheduling.",
  };
}

// ─── Session ───────────────────────────────────────────────────────────────

export type SignOutState = "idle" | "pending" | "failed";

export interface SessionCopy {
  title: string;
  detail: string;
  idleLabel: string;
  pendingLabel: string;
  errorTitle: string;
  errorDetail: string;
}

export function sessionCopy(): SessionCopy {
  return {
    title: "Session",
    detail: "Sign out of this browser.",
    idleLabel: "Sign out",
    pendingLabel: "Signing out…",
    errorTitle: "Sign out did not complete",
    errorDetail: "The request did not complete. Check your connection and try again.",
  };
}

export const SIGN_OUT_TIMEOUT_MS = 10_000;

export function signOutLabel(state: SignOutState): string {
  const copy = sessionCopy();
  return state === "pending" ? copy.pendingLabel : copy.idleLabel;
}

// ─── Page header ───────────────────────────────────────────────────────────

export interface PageCopy {
  eyebrow: string;
  title: string;
  detail: string;
}

export function pageCopy(): PageCopy {
  return {
    eyebrow: "Manage",
    title: "Settings",
    detail: "Edit your business profile, change your password, and open the areas where more configuration lives.",
  };
}
