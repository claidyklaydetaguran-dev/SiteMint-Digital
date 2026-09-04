/**
 * Frontend V2 Phase 12 — the truth layer for the Billing workspace.
 *
 * ── What this product actually knows about billing ────────────────────────
 *
 * Almost nothing, and that is the whole design constraint. The receptionist
 * surface exposes exactly **one** billing endpoint:
 *
 *     POST /api/receptionist/billing/create-checkout-session
 *
 * plus a Stripe webhook the browser never touches. There is no billing-status
 * read, no customer-portal session, no price lookup, no payment-method read, no
 * invoice list, no subscription record and no renewal date anywhere in the
 * repository. `intake_firms` stores `plan_tier`, `trial_conversations_limit`,
 * `stripe_customer_id` and `stripe_subscription_id`; the last two are never
 * returned to the browser by any route.
 *
 * So every fact this page can state comes from the session the shell has
 * already fetched — `GET /api/receptionist/auth/me` — and that session carries
 * three billing-relevant values and no more:
 *
 *     firm.planTier                 free-text, defaults to "trial"
 *     firm.trialConversationsLimit  integer, defaults to 20
 *     conversationCount             count(*) of the firm's conversations
 *
 * This module owns every string and every rule derived from those three. It
 * issues no request of its own, and the page it serves adds no billing GET, no
 * poll, no background refetch and no provider prefetch.
 *
 * ── What the old page invented ────────────────────────────────────────────
 *
 * A product named "Pro". A feature list — "Unlimited conversations", "Priority
 * AI response", "Priority support", "Full conversation history", "No trial cap"
 * — none of which corresponds to anything in the schema, any route, or any
 * document in this repository: the trial cap is the *only* difference between
 * `trial` and `paid` that the codebase implements. A support address,
 * `hello@sitemint.com`, that appears nowhere else in the repository. A "Secured
 * by Stripe" badge under the button, which is security theatre — the browser
 * has no way to know whether Stripe is even configured until the POST comes
 * back. And the claim, shown once usage passed 80%, that the operator should
 * "upgrade to keep receiving leads", which is the reverse of what the backend
 * does.
 *
 * That last one is worth stating precisely, because the honest replacement
 * below depends on it. In `routes/intakeAgent.ts` the inbound message and its
 * conversation are written to the database **first**; the trial-cap check runs
 * afterwards and, when it trips, returns an empty TwiML response. Its own log
 * line reads "Trial cap reached — conversation logged but AI reply suppressed".
 * Leads keep arriving and keep being recorded. What stops is the automated
 * reply. Telling an operator their business stops receiving leads would be a
 * false claim used to sell an upgrade.
 *
 * ── What is deliberately not built ────────────────────────────────────────
 *
 * No price, no billing interval, no renewal or trial-expiry date, no tax or
 * refund copy, no seat count, no contract term, no cancellation policy, no
 * invoice history, no payment-method display, no "manage subscription" control
 * and no customer-portal link. Not one of those has an endpoint behind it. A
 * disabled control or a "coming soon" would be the same invention with a longer
 * fuse, so there are none of those either.
 */

// ─── Plan identity ─────────────────────────────────────────────────────────

/**
 * The plan tier's label, reused verbatim from the Phase 11 Settings contract.
 *
 * Imported rather than redefined so that one account can never be called two
 * different things on two routes. Phase 11 originally mapped `"paid"` to
 * "Pro (Paid)" *because the old Billing page said so*; Phase 12 removed that
 * invented product name at its source, and Settings now reads "Paid plan" too.
 *
 * Unrecognised tiers are echoed exactly as stored — never normalised into
 * Trial, Paid, Free, Pro or Enterprise, because guessing which plan an
 * unfamiliar value means is precisely the mistake this page exists to stop
 * making. A blank tier yields `null`, never a default.
 *
 * Imported relatively, with the `.js` specifier the other contract modules use,
 * so this file runs under bare `tsx` in the committed test runner without the
 * app's path aliases.
 */
export { planLabel, isKnownPlan } from "../settings/settingsContract.js";

import { isKnownPlan as isKnown } from "../settings/settingsContract.js";

/**
 * Whether this account may be offered Checkout.
 *
 * Only an exactly-verified `"trial"` qualifies. A `"paid"` account is already
 * subscribed and there is no portal to send it to. An unknown tier is not
 * assumed to be upgradeable: the frontend does not know what that plan is, so
 * it does not know whether changing it is meaningful, safe, or even possible.
 * Guessing wrong here would put a live payment flow in front of someone who
 * should not see one.
 */
export function canUpgrade(planTier: string | null | undefined): boolean {
  return (planTier ?? "").trim() === "trial";
}

/** `true` only for a tier verified as `"paid"`. */
export function isPaidPlan(planTier: string | null | undefined): boolean {
  return (planTier ?? "").trim() === "paid";
}

// ─── Usage ─────────────────────────────────────────────────────────────────

/**
 * A count that can be trusted, or `null`.
 *
 * The session is typed as `number`, but a typed field is a promise about the
 * common case, not a guarantee about every row: this returns `null` for
 * anything that is not a finite, non-negative integer, so a corrupt or absent
 * value can never reach the arithmetic below and become a fabricated
 * percentage.
 */
export function countOrNull(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  if (value < 0) return null;
  return value;
}

/** The share of the trial limit at which the page starts drawing attention. */
export const ATTENTION_PERCENT = 80;

export type UsageLevel = "normal" | "approaching" | "reached";

export type UsageModel =
  /** Trial, with a usable limit: the only case that can be measured. */
  | {
      kind: "measured";
      used: number;
      limit: number;
      /** 0–100, clamped. Drives the meter only; never shown as a number. */
      fill: number;
      level: UsageLevel;
    }
  /** A verified paid plan: counted, but not measured against anything. */
  | { kind: "paid"; used: number | null }
  /** Trial, but the limit is missing, invalid or zero — nothing to measure. */
  | { kind: "unmeasured"; used: number | null }
  /** An unrecognised tier: the count is real, its meaning is not known. */
  | { kind: "unknown"; used: number | null };

/**
 * The usage model for a session.
 *
 * A zero, missing, negative or non-integer limit yields `unmeasured` rather
 * than a division — there is no percentage of zero, and inventing one would
 * put a number on screen that means nothing. The meter's fill is clamped into
 * 0–100 so an over-limit account cannot overflow its track, while the *stated*
 * figures stay the raw counts, so "24 of 20" is reported honestly rather than
 * being flattened to "100%".
 */
export function usageModel(
  planTier: string | null | undefined,
  conversationCount: unknown,
  trialConversationsLimit: unknown,
): UsageModel {
  const used = countOrNull(conversationCount);

  if (isPaidPlan(planTier)) return { kind: "paid", used };
  if (!isKnown(planTier)) return { kind: "unknown", used };

  // Trial from here down.
  const limit = countOrNull(trialConversationsLimit);
  if (limit === null || limit === 0 || used === null) {
    return { kind: "unmeasured", used };
  }

  // Integer comparison, so the 80% boundary is exact at every limit and never
  // drifts on a floating-point remainder.
  const level: UsageLevel =
    used >= limit
      ? "reached"
      : used * 100 >= limit * ATTENTION_PERCENT
        ? "approaching"
        : "normal";

  const fill = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  return { kind: "measured", used, limit, fill, level };
}

/** Digits grouped for readability, so a six-figure count stays scannable. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Shown wherever the session did not supply a usable number. */
export const NOT_AVAILABLE = "Not available";

// ─── Usage copy ────────────────────────────────────────────────────────────

export interface UsageCopy {
  /** The figure line, e.g. "12 of 20". */
  figure: string;
  /** One sentence stating what the figure means. Never a sales line. */
  detail: string;
  /** Carries the state in words, so colour is never the only signal. */
  status: string | null;
}

/**
 * The one sentence permitted at or past the trial limit.
 *
 * Verified against `routes/intakeAgent.ts` line by line: new conversations are
 * still inserted, and only the automated reply is withheld. `conversationCount`
 * in the session is the identical `count(*)` the cap compares against, so once
 * it reaches the limit the next new conversation is the one that goes
 * unanswered. Nothing here claims leads are lost, because they are not.
 */
export const LIMIT_REACHED_DETAIL =
  "Your trial conversation limit has been reached. New conversations may still be recorded, but automated replies are paused.";

/** The one truthful thing this frontend can say about a paid plan's usage. */
export const PAID_LIMIT_DETAIL =
  "The trial conversation limit does not apply to this plan.";

export function usageCopy(model: UsageModel): UsageCopy {
  switch (model.kind) {
    case "measured":
      return {
        figure: `${formatCount(model.used)} of ${formatCount(model.limit)}`,
        detail:
          model.level === "reached"
            ? LIMIT_REACHED_DETAIL
            : `Conversations recorded against your trial limit of ${formatCount(model.limit)}.`,
        status:
          model.level === "reached"
            ? "Trial limit reached"
            : model.level === "approaching"
              ? "Approaching trial limit"
              : null,
      };
    case "paid":
      return {
        figure: model.used === null ? NOT_AVAILABLE : formatCount(model.used),
        detail: PAID_LIMIT_DETAIL,
        status: null,
      };
    case "unmeasured":
      return {
        figure: model.used === null ? NOT_AVAILABLE : formatCount(model.used),
        // Stated as a fact about the data, not as a fault. No percentage is
        // offered, because there is no denominator to compute one from.
        detail: "A trial conversation limit is not recorded for this account.",
        status: null,
      };
    case "unknown":
      return {
        figure: model.used === null ? NOT_AVAILABLE : formatCount(model.used),
        detail: "Conversations recorded on this account.",
        status: null,
      };
  }
}

/** The accessible name of the usage meter, used only where it is measurable. */
export const METER_LABEL = "Trial conversation usage";

// ─── Plan record ───────────────────────────────────────────────────────────

export interface PlanField {
  label: string;
  value: string;
}

/**
 * The plan record: verified labels over verified values, and nothing else.
 *
 * "Trial conversation limit" appears only where a trial limit genuinely
 * applies; on a paid plan its row is replaced by the one honest statement about
 * what the limit does there. A row is omitted rather than filled with a
 * placeholder whenever the session did not supply it.
 */
export function planFields(
  planTierLabel: string | null,
  model: UsageModel,
): PlanField[] {
  const fields: PlanField[] = [];
  if (planTierLabel !== null) {
    fields.push({ label: "Current plan", value: planTierLabel });
  }

  const copy = usageCopy(model);
  fields.push({ label: "Conversation usage", value: copy.figure });

  if (model.kind === "measured") {
    fields.push({
      label: "Trial conversation limit",
      value: `${formatCount(model.limit)} conversations`,
    });
  }
  return fields;
}

// ─── Checkout ──────────────────────────────────────────────────────────────

/** The one billing mutation this product has. Method and path are exact. */
export const CHECKOUT_PATH = "/api/receptionist/billing/create-checkout-session";
export const CHECKOUT_METHOD = "POST";

/**
 * How long the page waits for Checkout before it stops showing a pending state.
 *
 * Without a bound, a request that never resolves leaves the button disabled
 * forever with no way back. The timeout ends the *waiting* and says so; it does
 * not cancel anything Stripe may already have done.
 */
export const CHECKOUT_TIMEOUT_MS = 15_000;

export type CheckoutState = "idle" | "pending" | "unavailable" | "failed";

/**
 * Whether the server's error text is the deployment's "no Stripe price
 * configured" answer.
 *
 * `receptionistBilling.ts` returns `500 {error: "Billing is not configured
 * yet"}` when `STRIPE_RECEPTIONIST_PRICE_ID` is unset. Matched on the same
 * substring the previous implementation used, so a deployment that has been
 * answering this way keeps being understood. There is no configuration probe:
 * the browser has no read contract for Stripe's status and cannot know this
 * before the operator asks.
 */
export function isNotConfigured(error: string | null | undefined): boolean {
  return (error ?? "").toLowerCase().includes("not configured");
}

/**
 * The Checkout URL from a successful response, or `null`.
 *
 * Only an absolute `http:`/`https:` URL is accepted. The value is Stripe's own
 * `session.url` and is expected to be exactly that, but this page navigates the
 * browser to whatever comes back, so a `javascript:` or `data:` payload must
 * never be handed to `location`. A rejected URL is a failure, not a silent
 * no-op — the operator is told Checkout could not be started rather than left
 * looking at a button that did nothing.
 */
export function checkoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return value;
}

export interface CheckoutCopy {
  heading: string;
  detail: string;
  idleLabel: string;
  pendingLabel: string;
  unavailableTitle: string;
  unavailableDetail: string;
  errorTitle: string;
  errorDetail: string;
}

/**
 * Every word the Checkout area is allowed to say.
 *
 * The description promises a destination, not an outcome: "Continue to Checkout
 * to change your plan" is true whether or not Stripe answers. No price appears,
 * because the frontend has never been told one — the price lives in
 * `STRIPE_RECEPTIONIST_PRICE_ID` on the server and its amount is never sent to
 * the browser.
 *
 * The unavailable copy names what happened and stops. No support address, no
 * "coming soon", no date: this deployment may be configured tomorrow or never,
 * and the page has no way to know which.
 */
export function checkoutCopy(): CheckoutCopy {
  return {
    heading: "Upgrade",
    detail: "Continue to Checkout to change your plan.",
    idleLabel: "Upgrade plan",
    pendingLabel: "Starting Checkout…",
    unavailableTitle: "Billing isn’t available yet",
    unavailableDetail: "Checkout could not be started. Please try again later.",
    errorTitle: "We couldn’t start Checkout",
    errorDetail: "Try again. If the problem continues, return later.",
  };
}

/** The button's visible label for the current state. */
export function checkoutLabel(state: CheckoutState): string {
  const copy = checkoutCopy();
  return state === "pending" ? copy.pendingLabel : copy.idleLabel;
}

// ─── D-6: Stripe checkout hidden during the private beta ───────────────────

/**
 * D-6: billing during the private beta is handled by SiteMint via manual
 * invoicing; the Stripe checkout control is hidden unless this build flag is
 * explicitly `"true"`. Read once here, the same pattern every other
 * `VITE_*` flag in this app uses (`lib/featureFlags.ts`) — this file does
 * not add a second interpretation of `import.meta.env`, it just reads one
 * more variable the same way.
 */
export function checkoutEnabled(): boolean {
  if (typeof import.meta.env === "undefined") return false;
  return import.meta.env.VITE_BILLING_CHECKOUT_ENABLED === "true";
}

export interface ManualInvoicingCopy {
  title: string;
  detail: string;
}

/** Shown instead of the Upgrade control while `checkoutEnabled()` is false. */
export function manualInvoicingCopy(): ManualInvoicingCopy {
  return {
    title: "Billing during the private beta",
    detail: "Billing during the private beta is handled by SiteMint (manual invoicing).",
  };
}

// ─── Views ─────────────────────────────────────────────────────────────────

export type ViewId = "plan" | "usage";

export interface View {
  id: ViewId;
  label: string;
}

/**
 * Two local views over the same session data — no route change, no request.
 *
 * They are kept because they answer two genuinely different questions: "what am
 * I on, and can I change it" and "how much have I used". Neither fetches
 * anything; switching between them is a state change and nothing more.
 */
export function views(): View[] {
  return [
    { id: "plan", label: "Plan" },
    { id: "usage", label: "Usage" },
  ];
}

/**
 * The next view for an arrow key, wrapping at both ends.
 *
 * Home and End are handled by the caller as absolute moves; this covers the
 * relative ones so the tab list behaves the way a tab list is expected to.
 */
export function nextView(current: ViewId, delta: 1 | -1): ViewId {
  const all = views();
  const index = all.findIndex((view) => view.id === current);
  const next = (index + delta + all.length) % all.length;
  return all[next]!.id;
}

// ─── Page header ───────────────────────────────────────────────────────────

export interface PageCopy {
  eyebrow: string;
  title: string;
  detail: string;
}

/**
 * Operational, not promotional. The description says what the route is for —
 * reviewing a plan and a usage figure — rather than selling a plan back to the
 * person already paying for it.
 */
export function pageCopy(): PageCopy {
  return {
    eyebrow: "Account",
    title: "Billing",
    detail: "Review your current plan and conversation usage.",
  };
}

/** Shown while the session is still resolving. */
export const LOADING_MESSAGE = "Loading billing information…";
