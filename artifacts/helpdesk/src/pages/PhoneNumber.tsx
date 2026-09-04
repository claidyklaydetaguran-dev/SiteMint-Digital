/**
 * V5 PR-8 — the Phone Number screen: none-assigned / assigned / paused /
 * error, with pause and unpause. See `pages/phone-number/phoneNumberContract.ts`.
 */

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useNumbersList, usePauseNumber, useUnpauseNumber } from "@/hooks/useNumbers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { COPY, PAGE, numberViewState } from "@/pages/phone-number/phoneNumberContract";
import "@/styles/v2-dashboard.css";

export default function PhoneNumber() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const numbersQuery = useNumbersList();
  const pauseMutation = usePauseNumber();
  const unpauseMutation = useUnpauseNumber();
  const [actionFailed, setActionFailed] = useState<"pause" | "unpause" | null>(null);

  if (sessionLoading || numbersQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} figures />;
  }
  if (!me) return null;

  const number = numbersQuery.data?.items[0];
  const view = numberViewState({ loading: numbersQuery.isLoading, isError: numbersQuery.isError, state: number?.state });

  const handlePause = async () => {
    if (!number) return;
    setActionFailed(null);
    try {
      await pauseMutation.mutateAsync(number.id);
    } catch {
      setActionFailed("pause");
    }
  };

  const handleUnpause = async () => {
    if (!number) return;
    setActionFailed(null);
    try {
      await unpauseMutation.mutateAsync(number.id);
    } catch {
      setActionFailed("unpause");
    }
  };

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      {view === "error" && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{COPY.errorTitle}</span>
            <p className="sd-error__detail">{COPY.errorDetail}</p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => numbersQuery.refetch()} disabled={numbersQuery.isRefetching}>
            {numbersQuery.isRefetching ? COPY.retryingLabel : COPY.retryLabel}
          </button>
        </section>
      )}

      {view === "none-assigned" && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{COPY.noneTitle}</h3>
          <p className="sd-empty__detail">{COPY.noneDetail}</p>
        </div>
      )}

      {(view === "assigned" || view === "paused") && number && (
        <section className="sd-section">
          {view === "paused" && (
            <div className="sd-status" data-state="unknown">
              <div className="sd-status__head">
                <span className="sd-status__dot" aria-hidden="true" />
                <div className="sd-status__body">
                  <h2 className="sd-status__title">{COPY.pausedBannerTitle}</h2>
                  <p className="sd-status__detail">{COPY.pausedBannerDetail}</p>
                </div>
              </div>
            </div>
          )}

          <dl className="sd-figures">
            <div className="sd-figure">
              <span className="sd-figure__value">{number.phoneNumberDisplay}</span>
              <span className="sd-figure__label">{COPY.numberLabel}</span>
            </div>
            <div className="sd-figure">
              <span className="sd-figure__value">{view === "paused" ? COPY.statePaused : COPY.stateAssigned}</span>
              <span className="sd-figure__label">{COPY.stateLabel}</span>
            </div>
          </dl>

          <h3 className="sd-h2">{COPY.capabilitiesHeading}</h3>
          <p className="sd-page__meta">{COPY.capabilitiesLine}</p>

          {actionFailed && (
            <div className="sd-error" role="alert">
              <div className="sd-error__body">
                <span className="sd-error__title">{actionFailed === "pause" ? COPY.pauseFailedTitle : COPY.unpauseFailedTitle}</span>
                <p className="sd-error__detail">{actionFailed === "pause" ? COPY.pauseFailedDetail : COPY.unpauseFailedDetail}</p>
              </div>
            </div>
          )}

          <div className="mt-3">
            {view === "assigned" ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">{COPY.pauseLabel}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{COPY.pauseConfirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{COPY.pauseConfirmDetail}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{COPY.pauseConfirmDismiss}</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePause} disabled={pauseMutation.isPending} aria-busy={pauseMutation.isPending}>
                      {pauseMutation.isPending ? COPY.pausePendingLabel : COPY.pauseConfirmAction}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button type="button" onClick={handleUnpause} disabled={unpauseMutation.isPending} aria-busy={unpauseMutation.isPending}>
                {unpauseMutation.isPending ? COPY.unpausePendingLabel : COPY.unpauseLabel}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
