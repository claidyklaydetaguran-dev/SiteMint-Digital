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
 *
 * ── What this pass adds ───────────────────────────────────────────────────
 * The row now says how the call ARRIVED — a phone call, a browser test, a
 * SiteMint QA event, or that no call type was reported — because a browser
 * test and a real customer call were previously indistinguishable here. A
 * caller number that was never received reads as what it is rather than as a
 * stand-in value, a duration the provider never measured reads "Not
 * available", and a call where someone asked to be put through carries a short
 * mark whose wording never upgrades an acknowledgement into a person
 * answering.
 *
 * The three narrowing controls are purely local to the records already
 * loaded: no request carries a query, nothing is re-fetched, and the count
 * beside the list is of what actually matched.
 */

import { Link } from "wouter";
import { useCallback, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useRealCallsList } from "@/hooks/useVoiceCalls";
import { CALL_CHANNELS, INTERNAL_CALL_STATES, type RealCallSummary } from "@/lib/voiceCallsApi";
import {
  CHANNEL_LABEL,
  CONTROLS,
  LIST,
  NO_FILTERS,
  PAGE,
  RANGE_LABEL,
  TIME_RANGES,
  applyFilters,
  callCategory,
  callCategoryLabel,
  callHref,
  callerNumberText,
  channelLabel,
  filtersAreDefault,
  formatDuration,
  formatListTime,
  machineTime,
  recordCount,
  stateAccessibleName,
  stateLabel,
  stateTone,
  transferBadge,
  type CallFilters,
} from "@/pages/call-logs/callLogsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-call-logs.css";

const SELECT_CLASS =
  "rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground";
const CONTROL_LABEL_CLASS = "text-xs uppercase tracking-wide text-muted-foreground";

function CallRow({ call }: { call: RealCallSummary }) {
  const label = stateLabel(call);
  const category = callCategory(call);
  // `none` earns no mark at all — an absent handover is not an outcome.
  const transfer = transferBadge(call.transferState);

  return (
    <tr className="sc-row" role="row" data-tone={stateTone(call.state)}>
      <td className="sc-cell sc-cell--caller" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {LIST.colCaller}
        </span>
        <Link href={callHref(call.callId)} className="sc-link">
          <span className="sc-link__text">{callerNumberText(call)}</span>
          <span className="sd-sr"> — {LIST.openRecord}</span>
        </Link>
      </td>

      <td className="sc-cell" role="cell">
        <span className="sc-cell__label" aria-hidden="true">
          {CONTROLS.channelLabel}
        </span>
        <span className="sd-chip">{channelLabel(call)}</span>
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
        {transfer !== null && <span className="sd-chip">{transfer}</span>}
      </td>
    </tr>
  );
}

function Controls({
  filters,
  onChange,
}: {
  filters: CallFilters;
  onChange: (next: CallFilters) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3" role="group" aria-label={CONTROLS.heading}>
      <label className="flex flex-col gap-1">
        <span className={CONTROL_LABEL_CLASS}>{CONTROLS.channelLabel}</span>
        <select
          className={SELECT_CLASS}
          value={filters.channel}
          onChange={(e) => onChange({ ...filters, channel: e.target.value as CallFilters["channel"] })}
        >
          <option value="all">{CONTROLS.anyChannel}</option>
          {CALL_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABEL[channel]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={CONTROL_LABEL_CLASS}>{CONTROLS.stateLabel}</span>
        <select
          className={SELECT_CLASS}
          value={filters.state}
          onChange={(e) => onChange({ ...filters, state: e.target.value as CallFilters["state"] })}
        >
          <option value="all">{CONTROLS.anyState}</option>
          {INTERNAL_CALL_STATES.map((state) => (
            <option key={state} value={state}>
              {stateLabel({ state, stateLabel: "" })}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={CONTROL_LABEL_CLASS}>{CONTROLS.rangeLabel}</span>
        <select
          className={SELECT_CLASS}
          value={filters.range}
          onChange={(e) => onChange({ ...filters, range: e.target.value as CallFilters["range"] })}
        >
          {TIME_RANGES.map((range) => (
            <option key={range} value={range}>
              {RANGE_LABEL[range]}
            </option>
          ))}
        </select>
      </label>

      {!filtersAreDefault(filters) && (
        <button type="button" className="sc-retry" onClick={() => onChange(NO_FILTERS)}>
          {CONTROLS.resetLabel}
        </button>
      )}
    </div>
  );
}

export default function Calls() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const calls = useRealCallsList();
  const [announcement, setAnnouncement] = useState("");
  const [filters, setFilters] = useState<CallFilters>(NO_FILTERS);

  const retry = useCallback(() => {
    setAnnouncement(LIST.announceRetrying);
    void calls
      .refetch()
      .then((result) => {
        setAnnouncement(result.isError ? LIST.announceFailed : LIST.announceLoaded);
      })
      .catch(() => setAnnouncement(LIST.announceFailed));
  }, [calls]);

  const items = useMemo(() => calls.data?.items ?? [], [calls.data]);

  // One instant for the whole pass, so every row in a render is measured
  // against the same boundary and the list cannot disagree with its count.
  const visible = useMemo(() => applyFilters(items, filters, new Date()), [items, filters]);

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

  const settled = !calls.isLoading && !calls.isError;
  const showTable = settled && visible.length > 0;
  const nothingStored = settled && items.length === 0;
  const nothingMatched = settled && items.length > 0 && visible.length === 0;

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

        {settled && items.length > 0 && <Controls filters={filters} onChange={setFilters} />}

        {showTable && <p className="sc-count">{recordCount(visible.length)}</p>}

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

        {nothingStored && (
          <div className="sc-empty">
            <p className="sc-empty__title">{LIST.emptyTitle}</p>
            <p className="sc-empty__detail">{LIST.emptyDetail}</p>
          </div>
        )}

        {/* An account WITH records whose choices match none of them is a
            different answer from an account with no records, and says so. */}
        {nothingMatched && (
          <div className="sc-empty">
            <p className="sc-empty__title">{CONTROLS.noMatchTitle}</p>
            <p className="sc-empty__detail">{CONTROLS.noMatchDetail}</p>
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
                  <th scope="col" role="columnheader" className="sc-col">
                    {CONTROLS.channelLabel}
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
                {visible.map((call) => (
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
