/**
 * Frontend V2 Phase 14 — the Call Logs list.
 *
 * Mounted at `ROUTES.logs` (`/logs`, base-relative) inside the Phase 7
 * `DashboardShell`, and registered only when `VITE_VOICE_PLATFORM_ENABLED` is
 * true. That gate, the navigation entry (`voiceGated: true`) and the
 * feature-flag helper are untouched by this phase: in a default production
 * build this route does not exist and Call Logs is absent from navigation.
 *
 * ── Product classification ────────────────────────────────────────────────
 * A read-only viewer for stored call records. Every row comes from
 * `GET /api/receptionist/voice/calls`. Nothing on this page places, answers,
 * transfers, retries or records a call, reaches a provider, sends a message,
 * books anything, or writes any row — and there is no endpoint behind it that
 * could. `call-logs/callLogsContract.ts` owns every string it can display.
 *
 * The four fabricated "Demo Mode" calls this page used to render, and the
 * header line claiming the assistant answers calls, are removed. Nothing
 * replaces them: with no records the page says there are no records.
 *
 * ── Requests ──────────────────────────────────────────────────────────────
 * `useSession()` reads the React Query entry the shell already fetched, so
 * this page issues no second `/auth/me`. `useRealCallsList()` is enabled only
 * once a firm id has resolved, and issues exactly one GET. There is no poll,
 * no refetch interval, no prefetch, no provider-status read, and no request
 * that an animation, a transition or a route change can cause. The only
 * repeat read is the Try again button, which runs on explicit activation.
 */

import { Link } from "wouter";
import { useCallback, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useRealCallsList } from "@/hooks/useVoiceCalls";
import type { RealCallSummary } from "@/lib/voiceCallsApi";
import {
  LIST,
  PAGE,
  callHref,
  formatDuration,
  formatListTime,
  machineTime,
  recordCount,
  stateAccessibleName,
  stateLabel,
  stateTone,
} from "@/pages/call-logs/callLogsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-call-logs.css";

function CallRow({ call }: { call: RealCallSummary }) {
  const label = stateLabel(call);
  return (
    // The row's left rule carries the state's tone. It is the only colour on
    // the row, and the state is always spelled out in its own cell as well, so
    // nothing here is legible by colour alone.
    <tr className="sc-row" role="row" data-tone={stateTone(call.state)}>
      <td className="sc-cell sc-cell--caller" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colCaller}
        </span>
        {/* The link is the row's only interactive element; it stretches over
            the row so the whole line is clickable, while focus stays on a real
            anchor and the focus ring is drawn around the row. */}
        <Link href={callHref(call.callId)} className="sc-link">
          <span className="sc-link__text">{call.callerNumberDisplay}</span>
          <span className="sd-sr"> — {LIST.openRecord}</span>
        </Link>
      </td>

      <td className="sc-cell sc-cell--time" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colStarted}
        </span>
        <time className="sc-fig" dateTime={machineTime(call.startedAt)}>
          {formatListTime(call.startedAt)}
        </time>
      </td>

      <td className="sc-cell sc-cell--duration" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colDuration}
        </span>
        {/* A measured length is a figure; an absent one is a phrase, and the
            two are set differently so a column of numbers stays scannable. */}
        {typeof call.durationSec === "number" ? (
          <span className="sc-fig">{formatDuration(call.durationSec)}</span>
        ) : (
          <span className="sc-absent-inline">{formatDuration(null)}</span>
        )}
      </td>

      <td className="sc-cell sc-cell--state" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colState}
        </span>
        <span className="sc-state">
          <span className="sc-state__text">{label}</span>
          <span className="sd-sr">{stateAccessibleName(label)}</span>
        </span>
      </td>
    </tr>
  );
}

export default function CallLogs() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const calls = useRealCallsList();
  const [announcement, setAnnouncement] = useState("");

  /**
   * The only repeat read on this route. It performs another GET of the same
   * list endpoint and nothing else: no provider call, no mutation, no
   * navigation. `isRefetching` clears the pending state on success and on
   * failure alike.
   */
  const retry = useCallback(() => {
    setAnnouncement(LIST.announceRetrying);
    void calls
      .refetch()
      .then((result) => {
        setAnnouncement(result.isError ? LIST.announceFailed : LIST.announceLoaded);
      })
      .catch(() => setAnnouncement(LIST.announceFailed));
  }, [calls]);

  if (sessionLoading) {
    return (
      <div className="sd-page">
        <p className="sc-loading" role="status" aria-live="polite">
          {PAGE.sessionLoading}
        </p>
      </div>
    );
  }

  // The shell redirects to /login on a session error; rendering nothing keeps
  // every authenticated shape out of the frame until authorisation resolves.
  if (!me) return null;

  const items = calls.data?.items ?? [];
  const showTable = !calls.isLoading && !calls.isError && items.length > 0;

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sc-lede">{PAGE.detail}</p>
        </div>
      </div>

      <section className="sc-sheet" aria-labelledby="sc-sheet-heading">
        <h2 className="sd-sr" id="sc-sheet-heading">
          {LIST.heading}
        </h2>

        {/* The count sits with the sheet it counts, not in the page head. */}
        {showTable && <p className="sc-count">{recordCount(items.length)}</p>}

        {/* Targeted announcement region: it carries retry progress and the
            retry result only, never the page. */}
        <p className="sd-sr" role="status" aria-live="polite">
          {announcement}
        </p>

        {calls.isLoading && (
          <p className="sc-loading" role="status" aria-live="polite">
            {LIST.loading}
          </p>
        )}

        {calls.isError && (
          <div className="sc-error" role="alert">
            <p className="sc-error__title">{LIST.errorTitle}</p>
            <p className="sc-error__detail">{LIST.errorDetail}</p>
            <button type="button" className="sc-retry" onClick={retry} disabled={calls.isRefetching}>
              {calls.isRefetching ? LIST.retryPendingLabel : LIST.retryLabel}
            </button>
          </div>
        )}

        {!calls.isLoading && !calls.isError && items.length === 0 && (
          <div className="sc-empty">
            <p className="sc-empty__title">{LIST.emptyTitle}</p>
            <p className="sc-empty__detail">{LIST.emptyDetail}</p>
          </div>
        )}

        {showTable && (
          <div className="sc-tablewrap">
            <table className="sc-table" role="table">
              <thead className="sc-table__head" role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader" className="sc-col sc-col--caller">
                    {LIST.colCaller}
                  </th>
                  <th scope="col" role="columnheader" className="sc-col sc-col--time">
                    {LIST.colStarted}
                  </th>
                  <th scope="col" role="columnheader" className="sc-col sc-col--duration">
                    {LIST.colDuration}
                  </th>
                  <th scope="col" role="columnheader" className="sc-col sc-col--state">
                    {LIST.colState}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {items.map((call) => (
                  <CallRow key={call.callId} call={call} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
