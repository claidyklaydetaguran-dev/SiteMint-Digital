/**
 * Frontend V2 Phase 12 — the Billing workspace.
 *
 * Mounted at `ROUTES.billing` (`/billing`, base-relative) inside the Phase 7
 * `DashboardShell`, whose navigation rail, `<main>` landmark, skip link,
 * palette, focus ring and motion system it inherits without adding a second
 * design system or any chrome of its own.
 *
 * ── Product classification ────────────────────────────────────────────────
 * A read-only plan-and-usage record with **one** genuine, conditional,
 * financially significant action. Everything on the page except the Upgrade
 * button is display; the button issues a real `POST` to a real endpoint that,
 * in a configured deployment, creates a live Stripe Checkout session and
 * navigates the browser to it. It is not accurate to call this route read-only.
 *
 * ── Requests: the shell's session, and nothing else ───────────────────────
 * `useSession()` reads the **same** React Query entry the shell has already
 * fetched (`SESSION_KEY`, `GET /api/receptionist/auth/me`, `staleTime: 60_000`).
 * Mounting a second observer on a resolved, fresh entry issues no request — the
 * pattern Overview and Settings already use. This page adds no billing GET, no
 * billing-status read, no price lookup, no portal call, no query of its own, no
 * refetch interval, no prefetch and no polling. Switching between the Plan and
 * Usage views is local state and causes no request. Nothing here prefetches
 * Stripe or any other provider. The only request this route can cause is the
 * Checkout `POST`, and only after the operator activates the button.
 *
 * Authentication, the loading gate and the redirect on an expired session are
 * the shell's, unchanged: `AppShell` renders its own boot state while the
 * session is in flight and navigates to `/login` on error, so no authenticated
 * content can paint before authorisation resolves. The local loading branch
 * below is a second belt on the same trousers, not a replacement.
 *
 * ── One deliberate change to prior behaviour ──────────────────────────────
 * The previous page installed a `setInterval` that invalidated the session five
 * times at two-second spacing whenever it was loaded with `?upgraded=1`, to
 * paper over Stripe webhook latency on the return trip. That is a poll, and a
 * poll is the one thing this route may not do. It is also unnecessary: the
 * return from Stripe is a full document load, so the session is fetched fresh
 * by the shell on arrival regardless. The interval and its `history.replaceState`
 * cleanup are both gone; no timer of any kind remains on this route.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 * A page built largely from claims with nothing behind them: a product named
 * "Pro", a four-item benefit grid ("Unlimited conversations", "No trial cap",
 * "Full conversation history", "Priority support"), a "priority AI response"
 * promise, a "Secured by Stripe" badge, a support address that appears nowhere
 * else in this repository, and — past 80% usage — the assertion that the
 * operator should upgrade "to keep receiving leads", which inverts what the
 * backend actually does. Every claim on this route now comes from
 * `billing/billingContract.ts`, which owns each string and each rule and
 * documents the evidence for both.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/hooks/useSession";
import {
  CHECKOUT_PATH,
  CHECKOUT_TIMEOUT_MS,
  canUpgrade,
  checkoutCopy,
  checkoutEnabled,
  checkoutLabel,
  checkoutUrl,
  isNotConfigured,
  LOADING_MESSAGE,
  manualInvoicingCopy,
  METER_LABEL,
  nextView,
  pageCopy,
  planFields,
  planLabel,
  usageCopy,
  usageModel,
  views,
  type CheckoutState,
  type UsageModel,
  type ViewId,
} from "@/pages/billing/billingContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-billing.css";

export default function Billing() {
  const { data: me, isLoading } = useSession();

  const [view, setView] = useState<ViewId>("plan");
  const [checkout, setCheckout] = useState<CheckoutState>("idle");

  const upgradeRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef(new Map<ViewId, HTMLButtonElement | null>());
  // Survives unmount: a successful Checkout navigates away, and a state update
  // on a page that is already gone is a warning nobody can act on.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The way out after a failure is the control that failed, so focus returns to
  // it — a keyboard user must never have to hunt for the retry. Focus moves
  // only on a transition into a failed state, never on an unrelated re-render,
  // so it cannot be taken from somewhere the operator has since moved to.
  useEffect(() => {
    if (checkout === "failed" || checkout === "unavailable") {
      upgradeRef.current?.focus();
    }
  }, [checkout]);

  /**
   * The single Checkout mutation. Method, path, credentials and response
   * handling are the protected contract, unchanged.
   *
   * Exactly one POST leaves the browser per activation: the pending guard
   * returns early on a second click, and the button is disabled for the
   * duration as well, so neither a double click nor a repeated keyboard
   * activation can start a second session. The wait is bounded, so a request
   * that never answers ends in a stated failure rather than a permanent
   * spinner. Nothing calls this on mount, on focus, on animation or on a view
   * change — it is reachable only from the button's own activation.
   */
  const handleUpgrade = useCallback(async () => {
    if (checkout === "pending") return;
    setCheckout("pending");

    try {
      const res = await Promise.race([
        fetch(CHECKOUT_PATH, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), CHECKOUT_TIMEOUT_MS),
        ),
      ]);

      const data = (await res.json()) as { url?: unknown; error?: unknown };
      const url = checkoutUrl(data.url);

      if (url !== null) {
        // The established contract: the server returns Stripe's session URL and
        // the browser goes there. No iframe, no modal, no popup, no interstitial
        // screen of our own invention. Pending is deliberately left in place —
        // the document is navigating away, and clearing it would offer a second
        // activation during the hand-off.
        window.location.href = url;
        return;
      }

      if (!alive.current) return;
      const error = typeof data.error === "string" ? data.error : null;
      setCheckout(isNotConfigured(error) ? "unavailable" : "failed");
    } catch {
      // A transport failure, a timeout, or a response that was not JSON. The
      // browser cannot tell these apart, so the page does not pretend to.
      if (!alive.current) return;
      setCheckout("failed");
    }
  }, [checkout]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const all = views();
    let target: ViewId | null = null;
    if (event.key === "ArrowRight") target = nextView(view, 1);
    else if (event.key === "ArrowLeft") target = nextView(view, -1);
    else if (event.key === "Home") target = all[0]!.id;
    else if (event.key === "End") target = all[all.length - 1]!.id;
    if (target === null) return;
    event.preventDefault();
    setView(target);
    tabRefs.current.get(target)?.focus();
  };

  const page = pageCopy();

  if (isLoading) {
    return (
      <div className="sb-page">
        <p className="sb-loading" role="status" aria-live="polite">
          {LOADING_MESSAGE}
        </p>
      </div>
    );
  }

  // The shell has already redirected on a session error. Rendering nothing here
  // guarantees no authenticated shape appears in the frame before it does.
  if (!me) return null;

  const model = usageModel(
    me.firm.planTier,
    me.conversationCount,
    me.firm.trialConversationsLimit,
  );
  const label = planLabel(me.firm.planTier);
  const eligible = canUpgrade(me.firm.planTier);

  return (
    <div className="sb-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{page.eyebrow}</span>
          <h1 className="sd-page__title">{page.title}</h1>
          <p className="sb-lede">{page.detail}</p>
        </div>
      </div>

      {/* Two local views over the same session values. No route change, no
          request, no content that is reachable only in one of them. */}
      <div className="sb-views" role="tablist" aria-label="Billing views">
        {views().map((item) => (
          <button
            key={item.id}
            ref={(node) => { tabRefs.current.set(item.id, node); }}
            type="button"
            role="tab"
            id={`sb-tab-${item.id}`}
            aria-selected={view === item.id}
            aria-controls={`sb-panel-${item.id}`}
            tabIndex={view === item.id ? 0 : -1}
            className="sb-view"
            onClick={() => setView(item.id)}
            onKeyDown={onTabKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`sb-panel-${view}`}
        aria-labelledby={`sb-tab-${view}`}
        tabIndex={0}
        className="sb-panel"
      >
        {view === "plan" ? (
          <PlanView
            model={model}
            label={label}
            eligible={eligible}
            checkout={checkout}
            onUpgrade={handleUpgrade}
            upgradeRef={upgradeRef}
          />
        ) : (
          <UsageView model={model} />
        )}
      </div>
    </div>
  );
}

/* ── Plan ─────────────────────────────────────────────────────────────────
   The verified record, then the one action — and the action only where the
   session verifies the account is on a trial. A paid plan has no portal to be
   sent to, and an unrecognised tier is not assumed to be upgradeable. */

function PlanView({
  model,
  label,
  eligible,
  checkout,
  onUpgrade,
  upgradeRef,
}: {
  model: UsageModel;
  label: string | null;
  eligible: boolean;
  checkout: CheckoutState;
  onUpgrade: () => void;
  upgradeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const copy = checkoutCopy();
  const fields = planFields(label, model);

  return (
    <>
      {/* A description list, not a form: there is nothing to submit here, and a
          disabled input would imply there was.

          Labelled by the tab rather than by a heading of its own: the selected
          tab already reads "Plan" directly above these rows, and repeating the
          word as an h2 one line below it was chrome that named nothing new. */}
      <section className="sd-section" aria-label="Plan">
        <dl className="sb-fields">
          {fields.map((field) => (
            <div className="sb-fields__row" key={field.label}>
              <dt className="sb-fields__label">{field.label}</dt>
              <dd className="sb-fields__value">{field.value}</dd>
            </div>
          ))}
        </dl>
        {model.kind === "paid" && (
          <p className="sb-note">{usageCopy(model).detail}</p>
        )}
      </section>

      {/* D-6: the private beta is billed manually by SiteMint. The Stripe
          checkout control below stays fully built — CHECKOUT_PATH, its
          mutation, its response handling and its copy are all unchanged —
          but it is dead unless VITE_BILLING_CHECKOUT_ENABLED is explicitly
          "true". An eligible trial account sees the manual-invoicing notice
          instead, never a button wired to a disabled Stripe integration. */}
      {eligible && !checkoutEnabled() && (
        <section className="sd-section" aria-labelledby="sb-manual-title">
          <div className="sd-section__head">
            <h2 className="sd-h2" id="sb-manual-title">
              {manualInvoicingCopy().title}
            </h2>
          </div>
          <p className="sb-note">{manualInvoicingCopy().detail}</p>
        </section>
      )}

      {eligible && checkoutEnabled() && (
        <section className="sd-section" aria-labelledby="sb-upgrade-title">
          <div className="sd-section__head">
            <h2 className="sd-h2" id="sb-upgrade-title">{copy.heading}</h2>
          </div>
          <div className="sb-upgrade">
            <p className="sb-upgrade__detail">{copy.detail}</p>
            <button
              ref={upgradeRef}
              type="button"
              className="sb-upgrade__action"
              onClick={onUpgrade}
              disabled={checkout === "pending"}
              aria-busy={checkout === "pending"}
            >
              {checkoutLabel(checkout)}
            </button>
          </div>

          {/* Announced once, on the transition into the state. Distinct
              headings, because "not configured here" and "the request failed"
              are different facts and lead to different expectations. */}
          {checkout === "unavailable" && (
            <div className="sb-result" data-state="attention" role="alert">
              <p className="sb-result__title">{copy.unavailableTitle}</p>
              <p className="sb-result__detail">{copy.unavailableDetail}</p>
            </div>
          )}
          {checkout === "failed" && (
            <div className="sb-result" data-state="error" role="alert">
              <p className="sb-result__title">{copy.errorTitle}</p>
              <p className="sb-result__detail">{copy.errorDetail}</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ── Usage ────────────────────────────────────────────────────────────────
   One figure, one measure, one sentence. The measure appears only where there
   is a real denominator to measure against; where there is not, the count is
   shown alone rather than beside an invented percentage. */

function UsageView({ model }: { model: UsageModel }) {
  const copy = usageCopy(model);

  return (
    <section className="sd-section" aria-labelledby="sb-usage-title">
      <div className="sd-section__head">
        <h2 className="sd-h2" id="sb-usage-title">Conversation usage</h2>
      </div>

      <div className="sb-usage" data-level={model.kind === "measured" ? model.level : "none"}>
        <p className="sb-usage__figure">{copy.figure}</p>

        {model.kind === "measured" && (
          <div
            className="sb-meter"
            role="progressbar"
            aria-label={METER_LABEL}
            aria-valuemin={0}
            aria-valuemax={model.limit}
            /* Clamped so the value stays inside its own range; the exact
               counts travel in `aria-valuetext` and in the figure above, so
               an over-limit account is never under-reported. */
            aria-valuenow={Math.min(model.used, model.limit)}
            aria-valuetext={`${copy.figure} conversations`}
          >
            <span className="sb-meter__fill" style={{ width: `${model.fill}%` }} />
          </div>
        )}

        {/* The state in words. Colour is never the only carrier. */}
        {copy.status !== null && <p className="sb-usage__status">{copy.status}</p>}
        <p className="sb-usage__detail">{copy.detail}</p>
      </div>
    </section>
  );
}
