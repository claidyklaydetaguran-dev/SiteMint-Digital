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

// ─── Editable business profile (D-7) ───────────────────────────────────────

export interface ProfileFormValues {
  name: string;
  industry: string;
  timezone: string;
  primaryContactName: string;
  primaryContactEmail: string;
  defaultLocation: string;
}

/** Every field the form submits is optional client-side — the server is authoritative on what it requires. */
export function buildProfilePatch(form: ProfileFormValues): {
  name: string;
  industry: string;
  timezone: string;
  primaryContact: { name: string; email: string };
  defaultLocation: string;
} {
  return {
    name: form.name.trim(),
    industry: form.industry.trim(),
    timezone: form.timezone,
    primaryContact: { name: form.primaryContactName.trim(), email: form.primaryContactEmail.trim() },
    defaultLocation: form.defaultLocation.trim(),
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
    { href: "/receptionist", title: "Receptionist", detail: "Open the SMS Receptionist configuration.", action: "Open Receptionist" },
    { href: "/assistants", title: "Assistant", detail: "Configure the voice assistant, prompt and voice.", action: "Open Assistant" },
    { href: "/billing", title: "Billing", detail: "Review plan and usage information.", action: "View billing" },
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
