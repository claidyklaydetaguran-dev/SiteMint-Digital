/**
 * V5 PR-7 — the Calendar screen.
 *
 * Connect / view / disconnect Google Calendar. Reads
 * `GET /api/receptionist/availability/calendar-status` (via the existing
 * `useCalendarStatus` hook — this router is unchanged) and drives the
 * calendar router's two mutations (`useCalendar.ts`): starting a Google
 * connection and disconnecting one. Nothing here writes an event, approves a
 * request or touches an appointment — that is the Appointments screen.
 */

import { useCallback, useState } from "react";
import { useCalendarStatus } from "@/hooks/useAvailability";
import { useDisconnectCalendar, useStartGoogleCalendarConnect } from "@/hooks/useCalendar";
import { isCalendarActionError } from "@/lib/calendarApi";
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
import { useSession } from "@/hooks/useSession";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { CalendarReturnBanner } from "@/pages/calendar/CalendarReturnBanner";
import {
  CONNECT,
  PAGE,
  calendarViewState,
  classifyConnectError,
  lastCheckedLabel,
  type ConnectFailure,
} from "@/pages/calendar/calendarContract";
import "@/styles/v2-dashboard.css";

export default function CalendarPage() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const statusQuery = useCalendarStatus();
  const startMutation = useStartGoogleCalendarConnect();
  const disconnectMutation = useDisconnectCalendar();

  const [connecting, setConnecting] = useState(false);
  const [connectFailure, setConnectFailure] = useState<ConnectFailure | null>(null);
  const [disconnectFailed, setDisconnectFailed] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  const handleConnect = useCallback(async () => {
    if (startMutation.isPending) return;
    setConnecting(true);
    setConnectFailure(null);
    try {
      const res = await startMutation.mutateAsync();
      window.location.assign(res.authorizeUrl);
      // Intentionally no `finally` reset here: a redirect is in flight, and
      // resetting `connecting` would flash the button back before the
      // navigation completes.
    } catch (err) {
      setConnecting(false);
      setConnectFailure(isCalendarActionError(err) ? classifyConnectError(err) : "failed");
    }
  }, [startMutation]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectMutation.isPending) return;
    setDisconnectFailed(false);
    try {
      await disconnectMutation.mutateAsync();
      setDisconnected(true);
    } catch {
      setDisconnectFailed(true);
    }
  }, [disconnectMutation]);

  if (sessionLoading) {
    return <PageSkeleton label={PAGE.loading} />;
  }
  if (!me) return null;

  const view = calendarViewState({
    statusLoading: statusQuery.isLoading,
    statusError: statusQuery.isError,
    connected: statusQuery.data?.connected === true && !disconnected,
    connecting,
    connectDisabled: connectFailure === "disabled",
  });

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.breadcrumb}</p>
        </div>
      </div>

      <CalendarReturnBanner />

      {view === "loading" && (
        <p className="sd-sr" role="status" aria-live="polite">Checking calendar connection…</p>
      )}

      {view === "error" && (
        <section className="sd-error" role="alert" aria-labelledby="cal-error-title">
          <div className="sd-error__body">
            <span className="sd-error__title" id="cal-error-title">{CONNECT.errorTitle}</span>
            <p className="sd-error__detail">{CONNECT.errorDetail}</p>
          </div>
          <button
            type="button"
            className="sd-error__action"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isRefetching}
          >
            {statusQuery.isRefetching ? CONNECT.retryingLabel : CONNECT.retryLabel}
          </button>
        </section>
      )}

      {view === "disabled" && (
        <section className="sd-status" data-state="unknown" aria-labelledby="cal-disabled-title">
          <div className="sd-status__head">
            <span className="sd-status__dot" aria-hidden="true" />
            <div className="sd-status__body">
              <h2 className="sd-status__title" id="cal-disabled-title">{CONNECT.disabledTitle}</h2>
              <p className="sd-status__detail">{CONNECT.disabledDetail}</p>
            </div>
          </div>
        </section>
      )}

      {(view === "not-connected" || view === "connecting") && (
        <section className="sd-section" aria-labelledby="cal-connect-title">
          <div className="sd-status" data-state="unknown">
            <div className="sd-status__head">
              <span className="sd-status__dot" aria-hidden="true" />
              <div className="sd-status__body">
                <h2 className="sd-status__title" id="cal-connect-title">{CONNECT.notConnectedTitle}</h2>
                <p className="sd-status__detail">{CONNECT.notConnectedDetail}</p>
              </div>
            </div>
          </div>

          <h3 className="sd-h2">{CONNECT.scopesHeading}</h3>
          <ul className="sd-list">
            <li className="sd-list__item">{CONNECT.scopeCheckBusy}</li>
            <li className="sd-list__item">{CONNECT.scopeWriteEvents}</li>
            <li className="sd-list__item">{CONNECT.scopeLimit}</li>
          </ul>

          {connectFailure === "failed" && (
            <div className="sd-error" role="alert">
              <div className="sd-error__body">
                <span className="sd-error__title">{CONNECT.connectFailedTitle}</span>
                <p className="sd-error__detail">{CONNECT.connectFailedDetail}</p>
              </div>
            </div>
          )}

          <Button type="button" onClick={handleConnect} disabled={view === "connecting"} aria-busy={view === "connecting"}>
            {view === "connecting" ? CONNECT.connectingLabel : CONNECT.connectLabel}
          </Button>
        </section>
      )}

      {view === "connected" && (
        <section className="sd-section" aria-labelledby="cal-connected-title">
          <div className="sd-status" data-state="answering">
            <div className="sd-status__head">
              <span className="sd-status__dot" aria-hidden="true" />
              <div className="sd-status__body">
                <h2 className="sd-status__title" id="cal-connected-title">{CONNECT.connectedTitle}</h2>
                <p className="sd-status__detail">{CONNECT.connectedExplain}</p>
              </div>
            </div>
          </div>

          <dl className="sd-figures">
            <div className="sd-figure">
              <span className="sd-figure__value">{CONNECT.providerGoogle}</span>
              <span className="sd-figure__label">{CONNECT.providerLabel}</span>
            </div>
            <div className="sd-figure">
              <span className="sd-figure__value">{lastCheckedLabel(statusQuery.dataUpdatedAt)}</span>
              <span className="sd-figure__label">{CONNECT.lastCheckedLabel}</span>
            </div>
          </dl>

          {disconnectFailed && (
            <div className="sd-error" role="alert">
              <div className="sd-error__body">
                <span className="sd-error__title">{CONNECT.disconnectFailedTitle}</span>
                <p className="sd-error__detail">{CONNECT.disconnectFailedDetail}</p>
              </div>
            </div>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline">{CONNECT.disconnectLabel}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONNECT.disconnectConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{CONNECT.disconnectConfirmDetail}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{CONNECT.disconnectConfirmDismiss}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  aria-busy={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? CONNECT.disconnectingLabel : CONNECT.disconnectConfirmAction}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      )}
    </div>
  );
}
