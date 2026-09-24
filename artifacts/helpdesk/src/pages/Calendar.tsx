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
import { useCalendarHealth, useDisconnectCalendar, useStartGoogleCalendarConnect } from "@/hooks/useCalendar";
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
import { CalendarPicker } from "@/pages/calendar/CalendarPicker";
import {
  CONNECT,
  HEALTH_FIELDS,
  PAGE,
  calendarDisplayName,
  calendarViewState,
  classifyConnectError,
  healthSummary,
  healthTimestamp,
  lastCheckedLabel,
  type ConnectFailure,
  HEALTH_UNREADABLE,
} from "@/pages/calendar/calendarContract";
import "@/styles/v2-dashboard.css";

export default function CalendarPage() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const statusQuery = useCalendarStatus();
  const healthQuery = useCalendarHealth();
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

  const health = healthQuery.data?.health;
  // An unread health check is not a verdict on the connection. Until it
  // arrives, the page says so rather than reporting "No calendar connected",
  // which is what healthSummary answers for missing data.
  const healthSettled = !healthQuery.isLoading && !healthQuery.isError;
  const summary = healthSettled ? healthSummary(health) : HEALTH_UNREADABLE;

  const view = calendarViewState({
    statusLoading: statusQuery.isLoading,
    statusError: statusQuery.isError,
    // A revoked connection still has a row, so `connected` alone would keep the
    // business on the connected panel with no way to reconnect. The health read
    // is what decides whether there is a working connection to show.
    connected: statusQuery.data?.connected === true && !disconnected && health?.state !== "not_connected",
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
          {/*
            A withdrawn connection reaches this panel too, because the row is no
            longer active. Without this the business would be shown a plain
            "not connected" and never learn that something it HAD set up stopped
            working, or why.
          */}
          <div className="sd-status" data-state={health?.state === "revoked" ? "attention" : "unknown"}>
            <div className="sd-status__head">
              <span className="sd-status__dot" aria-hidden="true" />
              <div className="sd-status__body">
                <h2 className="sd-status__title" id="cal-connect-title">
                  {health?.state === "revoked" ? summary.title : CONNECT.notConnectedTitle}
                </h2>
                <p className="sd-status__detail">
                  {health?.state === "revoked" ? summary.detail : CONNECT.notConnectedDetail}
                </p>
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
          {/*
            The heading states the connection's ACTUAL condition, not the fact
            that a row exists. "Connected" while Google has withdrawn access is
            the one reading that would cost a business real appointments.
          */}
          <div className="sd-status" data-state={health?.usable === false ? "attention" : "answering"}>
            <div className="sd-status__head">
              <span className="sd-status__dot" aria-hidden="true" />
              <div className="sd-status__body">
                <h2 className="sd-status__title" id="cal-connected-title">{summary.title}</h2>
                <p className="sd-status__detail">{summary.detail}</p>
              </div>
            </div>
          </div>

          {healthQuery.data?.writeEnabled === false && (
            <div className="sd-error" role="status">
              <div className="sd-error__body">
                <span className="sd-error__title">{HEALTH_FIELDS.writeDisabledTitle}</span>
                <p className="sd-error__detail">{HEALTH_FIELDS.writeDisabledDetail}</p>
              </div>
            </div>
          )}

          <dl className="sd-figures">
            <div className="sd-figure">
              <span className="sd-figure__value">{CONNECT.providerGoogle}</span>
              <span className="sd-figure__label">{CONNECT.providerLabel}</span>
            </div>
            {/* Which account and which calendar — so a business can tell whether
                this is the one it meant to connect. */}
            {health?.accountLabel !== null && health?.accountLabel !== undefined && (
              <div className="sd-figure">
                <span className="sd-figure__value">{health.accountLabel}</span>
                <span className="sd-figure__label">{HEALTH_FIELDS.accountLabel}</span>
              </div>
            )}
            <div className="sd-figure">
              <span className="sd-figure__value">
                {healthSettled ? calendarDisplayName(health?.calendarId ?? null) : "—"}
              </span>
              <span className="sd-figure__label">{HEALTH_FIELDS.calendarLabel}</span>
            </div>
            <div className="sd-figure">
              {/*
                Only the SERVER's recorded success is shown here. It used to
                fall back to when this browser last re-read the status, which
                put a fresh timestamp under "Last successful check" for a
                calendar nothing had ever touched — reassurance the page had
                no way to earn.
              */}
              <span className="sd-figure__value">
                {!healthSettled
                  ? "—"
                  : health?.lastSuccessAt != null
                    ? healthTimestamp(health.lastSuccessAt)
                    : HEALTH_FIELDS.lastSuccessNever}
              </span>
              <span className="sd-figure__label">{HEALTH_FIELDS.lastSuccessLabel}</span>
            </div>
            {health?.lastErrorAt != null && (
              <div className="sd-figure">
                <span className="sd-figure__value">{healthTimestamp(health.lastErrorAt)}</span>
                <span className="sd-figure__label">{HEALTH_FIELDS.lastErrorLabel}</span>
              </div>
            )}
          </dl>

          {/* Where appointments go. Sits above Disconnect because choosing a
              calendar is the ordinary action and disconnecting is the rare one. */}
          <CalendarPicker onReconnect={handleConnect} />

          {/*
            The reconnect button lives on THIS panel too, so its failure has to
            be reported here. Without this the only report of a failed start was
            rendered on the not-connected panel, which a connected business
            never sees: the button would send them nowhere and say nothing.
          */}
          {connectFailure === "failed" && (
            <div className="sd-error" role="alert">
              <div className="sd-error__body">
                <span className="sd-error__title">{CONNECT.connectFailedTitle}</span>
                <p className="sd-error__detail">{CONNECT.connectFailedDetail}</p>
              </div>
            </div>
          )}

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
