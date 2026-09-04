/**
 * V5 PR-8 — the Calls list. Renamed from the Frontend V2 Phase 14 "Call Logs"
 * page (`pages/CallLogs.tsx`, kept as a thin re-export so `/logs` keeps
 * working — see the report on the exact route the lead should register for
 * `/calls`). Behaviour is unchanged from Phase 14 except for one addition:
 * each row now also carries the coarser category chip
 * (`callLogsContract.ts`'s `callCategory`) — In progress / Completed /
 * Failed / Needs attention — beside the existing granular state text. A list
 * row lacks `endedReason`/`analysisAvailability`, so "Needs attention" can
 * only be resolved from the list when a call is still open; the full
 * distinction is only available on the detail page.
 */

import { Link } from "wouter";
import { useCallback, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useRealCallsList } from "@/hooks/useVoiceCalls";
import type { RealCallSummary } from "@/lib/voiceCallsApi";
import {
  LIST,
  PAGE,
  callCategory,
  callCategoryLabel,
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
  const category = callCategory(call);
  return (
    <tr className="sc-row" role="row" data-tone={stateTone(call.state)}>
      <td className="sc-cell sc-cell--caller" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colCaller}
        </span>
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
        <span className="sd-chip">{callCategoryLabel(category)}</span>
      </td>
    </tr>
  );
}

export default function Calls() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const calls = useRealCallsList();
  const [announcement, setAnnouncement] = useState("");

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

        {showTable && <p className="sc-count">{recordCount(items.length)}</p>}

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
