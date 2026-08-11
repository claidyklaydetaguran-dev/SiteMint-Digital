/**
 * Frontend V2 Phase 11 — the truth layer for the Settings workspace.
 *
 * ── The binding fact this module encodes ──────────────────────────────────
 *
 * **This product has no settings.** Not "none configured yet" — there is no
 * settings endpoint, no preference row, no persistence contract and no editable
 * account model anywhere in the receptionist surface. The evidence, verified in
 * Phase 11 discovery:
 *
 *  • **No endpoint.** The receptionist routers expose sign-in, sign-out,
 *    `GET /auth/me`, conversations, agent configuration and billing. Not one of
 *    them reads or writes a user preference, and none of them updates a firm's
 *    name, email or password.
 *
 *  • **No schema.** `intake_firms` stores `name`, `email`, `plan_tier`,
 *    `trial_conversations_limit` and `created_at`. There is no locale column, no
 *    time-zone column, no date-format column, no hour-cycle column, and no
 *    membership or team table of any kind.
 *
 *  • **The old page was entirely fabricated.** It displayed the fixed strings
 *    "English (United States)", "UTC-8 (Pacific Time)" and "MM/DD/YYYY" beside
 *    two Change buttons wired to nothing and two uncontrolled switches that
 *    moved when clicked and persisted nothing at all. It also announced
 *    multi-user access as "Coming Soon" — a roadmap commitment no document in
 *    this repository makes.
 *
 * So this route reads the session the application shell has already fetched, and
 * writes nothing. Every value below comes from `GET /api/receptionist/auth/me`.
 * There is no settings request, no mutation, no optimistic update, no cache of
 * its own and no polling, because there is nothing to save.
 *
 * ── What is deliberately not built ────────────────────────────────────────
 *
 * No save control, no edit control, no password change, no email change, no
 * firm-name editing, no profile, no team invitation, no member list, no API-key
 * link, no language selector, no time-zone selector, no date-format selector, no
 * 12/24-hour switch, no notification preferences and no disabled example
 * controls standing in for a future release. A disabled selector is still a
 * promise, and this route makes none.
 *
 * The three real capabilities the account genuinely has — open the receptionist
 * configuration, review billing, and sign out — are all that is offered.
 */

// ─── Session shape ─────────────────────────────────────────────────────────

/**
 * The subset of `SessionFirm` this route reads.
 *
 * Declared structurally rather than imported so the contract can be tested
 * without the app's path aliases, and so a field this page must never touch
 * (there are none beyond these four) cannot arrive by accident.
 */
export interface AccountSource {
  name: string;
  email: string | null;
  planTier: string;
  createdAt: string;
}

// ─── Read-only account values ──────────────────────────────────────────────

export interface AccountField {
  label: string;
  /** `null` whenever the session did not supply a usable value. Never guessed. */
  value: string | null;
}

/**
 * Shown in place of a value that the session did not supply.
 *
 * Stated once, plainly, and never dressed up as an error: an account without a
 * recorded email address is a normal account, not a broken one.
 */
export const NOT_AVAILABLE = "Not available";

/**
 * The plan tier, labelled only where a label is verified.
 *
 * `intake_firms.plan_tier` is a free-text column defaulting to `"trial"`, and
 * the two values the product actually uses are already labelled by the Billing
 * page: `"paid"` reads "Pro (Paid)" and `"trial"` reads "Free Trial". Those two
 * labels are reused verbatim so the same plan cannot be named two different
 * things in two places.
 *
 * Anything else is returned **exactly as the server sent it**. Inventing a
 * marketing name for an unrecognised tier would be a claim about a plan this
 * frontend knows nothing about; echoing the stored value is the honest answer,
 * and it is also the useful one for support. A blank or whitespace-only tier
 * yields `null`, never a default.
 */
export function planLabel(planTier: string | null | undefined): string | null {
  const raw = (planTier ?? "").trim();
  if (raw === "") return null;
  if (raw === "paid") return "Pro (Paid)";
  if (raw === "trial") return "Free Trial";
  return raw;
}

/** `true` only for a tier this frontend has a verified label for. */
export function isKnownPlan(planTier: string | null | undefined): boolean {
  const raw = (planTier ?? "").trim();
  return raw === "paid" || raw === "trial";
}

/**
 * The account creation date, formatted with the Billing page's existing
 * treatment (`en-US`, short month, numeric day, numeric year) so "Member since"
 * reads identically wherever it appears.
 *
 * A missing, blank or unparseable timestamp yields `null`. It is never replaced
 * with the current date, the session's own age, or any other stand-in — an
 * invented join date is indistinguishable from a real one to the person reading
 * it.
 */
export function memberSince(createdAt: string | null | undefined): string | null {
  const raw = (createdAt ?? "").trim();
  if (raw === "") return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The four verified account values, in reading order.
 *
 * Business and Email always render, because their absence is itself information
 * an operator needs. Plan and Member since are **omitted entirely** when the
 * session does not support them: unlike an email address, a blank plan or a
 * blank join date tells the reader nothing, and a row of placeholders is
 * clutter that makes a healthy account look damaged.
 */
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

/**
 * How the account block explains itself.
 *
 * Phrased as where the values come from, not as a capability that is missing.
 * "Cannot be edited" would read as a fault; "shown as they are recorded on your
 * account" is the same fact without the alarm.
 */
export function accountNote(): string {
  return "These values are shown as they are recorded on your account.";
}

// ─── Configuration destinations ────────────────────────────────────────────

export interface Destination {
  /** Base-relative; the wouter `base` prop resolves the configured prefix. */
  href: string;
  title: string;
  detail: string;
  action: string;
}

/**
 * The two places where configuration genuinely happens.
 *
 * Both are registered dashboard routes in the default build, both are already
 * firm-scoped by the server session, and both are reached with a real link, so
 * the destination is visible in the status bar and the link can be opened in a
 * new tab. Neither is prefetched: arriving on Settings must not fetch a page the
 * operator has not asked for.
 */
export function destinations(): Destination[] {
  return [
    {
      href: "/receptionist",
      title: "Receptionist",
      detail: "Open the SMS Receptionist configuration.",
      action: "Open Receptionist",
    },
    {
      href: "/billing",
      title: "Billing",
      detail: "Review plan and usage information.",
      action: "View billing",
    },
  ];
}

// ─── Preference availability ───────────────────────────────────────────────

export interface PreferenceNotice {
  /** Neutral: nothing is broken and nothing needs attention. */
  tone: "neutral";
  title: string;
  detail: string;
}

/**
 * The honest replacement for the three fabricated preference rows.
 *
 * It states what the application does today and stops there. No "coming soon",
 * no estimated release, no roadmap reference and no disabled example control —
 * every one of those would be a commitment this repository does not make.
 */
export function preferenceNotice(): PreferenceNotice {
  return {
    tone: "neutral",
    title: "Account preferences are not available",
    detail:
      "This application does not currently provide stored language, time-zone, or date-format settings.",
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

/**
 * Sign out is a real action against a real endpoint
 * (`POST /api/receptionist/auth/logout`, via the existing `useLogout` hook), so
 * it is a button, not a link, and it says exactly what it does.
 *
 * "Sign out of this browser" is precise: the endpoint clears the
 * `receptionist_session` cookie for this browser. It does not claim to end
 * sessions elsewhere, because nothing in the repository shows that it does.
 *
 * The failure copy names what did not happen and what to do, in the interface's
 * voice, and does not apologise. It also does not speculate about the cause: the
 * only signal available to the browser is that the request did not complete —
 * which covers both a transport failure and a response that never arrived
 * before the page stopped waiting.
 */
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

/**
 * How long the page waits for the logout request before it stops showing a
 * pending state.
 *
 * Without this, a request that never resolves leaves the button disabled and
 * spinning forever, with no way back. The timeout does not cancel anything the
 * server may already have done — it ends the *waiting*, and says so.
 */
export const SIGN_OUT_TIMEOUT_MS = 10_000;

/** The button's visible label for the current state. */
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

/**
 * Operational, not promotional. The description tells the reader what this route
 * is for — reviewing account information and finding the places that are
 * genuinely configurable — rather than selling the account back to its owner.
 */
export function pageCopy(): PageCopy {
  return {
    eyebrow: "Manage",
    title: "Settings",
    detail: "Review account information and open the areas where configuration is available.",
  };
}
