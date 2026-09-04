/**
 * V5 PR-8 — the Usage screen. See `pages/usage/usageContract.ts` for the
 * derivation rules (percent used, warning, paused) — none of these values
 * are asserted by the server; they're computed from the documented counts.
 */

import { useSession } from "@/hooks/useSession";
import { useUsage } from "@/hooks/useUsage";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import {
  COPY,
  PAGE,
  isPaused,
  isWarning,
  minutesRemaining,
  minutesUsed,
  percentUsed,
  periodLabel,
} from "@/pages/usage/usageContract";
import "@/styles/v2-dashboard.css";

export default function Usage() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const usageQuery = useUsage();

  if (sessionLoading || usageQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} figures />;
  }
  if (!me) return null;

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      {usageQuery.isError && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{COPY.errorTitle}</span>
            <p className="sd-error__detail">{COPY.errorDetail}</p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => usageQuery.refetch()} disabled={usageQuery.isRefetching}>
            {usageQuery.isRefetching ? COPY.retryingLabel : COPY.retryLabel}
          </button>
        </section>
      )}

      {usageQuery.data && (
        <>
          {isPaused(usageQuery.data) && (
            <section className="sd-status" data-state="incomplete" role="alert">
              <div className="sd-status__head">
                <span className="sd-status__dot" aria-hidden="true" />
                <div className="sd-status__body">
                  <h2 className="sd-status__title">{COPY.pausedTitle}</h2>
                </div>
              </div>
              <div className="sd-status__foot">
                <a href={COPY.pausedMailto} className="sd-step__action">{COPY.pausedAction}</a>
              </div>
            </section>
          )}

          {!isPaused(usageQuery.data) && isWarning(usageQuery.data) && (
            <section className="sd-status" data-state="incomplete">
              <div className="sd-status__head">
                <span className="sd-status__dot" aria-hidden="true" />
                <div className="sd-status__body">
                  <h2 className="sd-status__title">{COPY.warningTitle}</h2>
                  <p className="sd-status__detail">{COPY.warningDetail}</p>
                </div>
              </div>
            </section>
          )}

          <p className="sd-page__meta">{COPY.billingPeriodLabel}: {periodLabel(usageQuery.data.period)}</p>

          <dl className="sd-figures">
            <div className="sd-figure">
              <span className="sd-figure__value">{usageQuery.data.callCount}</span>
              <span className="sd-figure__label">{COPY.callsLabel}</span>
            </div>
            <div className="sd-figure">
              <span className="sd-figure__value">{minutesUsed(usageQuery.data)}</span>
              <span className="sd-figure__label">{COPY.minutesUsedLabel}</span>
            </div>
            <div className="sd-figure">
              <span className="sd-figure__value">{usageQuery.data.includedMinutes ?? COPY.includedUnlimited}</span>
              <span className="sd-figure__label">{COPY.includedLabel}</span>
            </div>
            <div className="sd-figure">
              <span className="sd-figure__value">{minutesRemaining(usageQuery.data) ?? COPY.remainingUnlimited}</span>
              <span className="sd-figure__label">{COPY.remainingLabel}</span>
            </div>
          </dl>

          {percentUsed(usageQuery.data) !== null && (
            <div className="sd-usage">
              <div className="sd-usage__track">
                <div className="sd-usage__fill" style={{ width: `${Math.min(100, Math.round((percentUsed(usageQuery.data)! ) * 100))}%` }} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
