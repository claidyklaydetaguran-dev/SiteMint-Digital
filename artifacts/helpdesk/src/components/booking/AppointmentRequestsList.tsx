/**
 * V5 PR-7 — the Appointments requests list: a presentational table of stored
 * requests. Selecting a row opens the detail drawer (`Appointments.tsx` owns
 * that state); this component owns no mutation and no drawer of its own —
 * every lifecycle action (approve/reschedule/cancel) lives in
 * `AppointmentDetailDrawer.tsx`, since none of them can safely be a one-click
 * row action once approving writes a real calendar event.
 */

import type { AppointmentRequest, AvailabilityConfig } from "@/lib/availabilityApi";
import {
  REQUESTS,
  contactDetail,
  contactName,
  isTestRequest,
  requestStateLabel,
  requestStateTone,
  sourceLabel,
  typeName,
} from "@/pages/appointments/appointmentsContract";
import { slotDateTime } from "@/lib/schedulingDates";

export function AppointmentRequestsList({
  items,
  config,
  selectedId,
  onSelect,
}: {
  items: AppointmentRequest[];
  config: AvailabilityConfig | undefined;
  selectedId: string | null;
  onSelect: (request: AppointmentRequest) => void;
}) {
  const timezone = config?.timezone ?? "UTC";

  if (items.length === 0) {
    return (
      <section className="sa-empty" aria-labelledby="sa-req-empty">
        <h2 className="sa-empty__title" id="sa-req-empty">{REQUESTS.emptyTitle}</h2>
        <p className="sa-empty__detail">{REQUESTS.emptyDetail}</p>
      </section>
    );
  }

  return (
    <ul className="sa-list">
      <li className="sa-list__head" aria-hidden="true">
        <span>{REQUESTS.columnClient}</span>
        <span>{REQUESTS.columnType}</span>
        <span>{REQUESTS.columnWhen}</span>
        <span>{REQUESTS.columnStatus}</span>
        <span>{REQUESTS.columnSource}</span>
      </li>

      {items.map((req) => {
        const test = isTestRequest(req.contact);
        return (
          <li key={req.id} className="sa-row">
            <button
              type="button"
              className="sa-row__grid sa-row__button"
              aria-current={selectedId === req.id ? "true" : undefined}
              onClick={() => onSelect(req)}
              aria-label={`${REQUESTS.openRecord}: ${contactName(req.contact)}`}
            >
              <div className="sa-row__client">
                <span className="sa-row__name">
                  {contactName(req.contact)}
                  {test && <span className="sd-chip" data-tier="test"> {REQUESTS.testChip}</span>}
                </span>
                <span className="sa-row__contact">{contactDetail(req.contact)}</span>
              </div>
              <div className="sa-row__cell" data-label={REQUESTS.columnType}>{typeName(config, req.appointmentTypeId)}</div>
              <div className="sa-row__cell" data-label={REQUESTS.columnWhen}>{slotDateTime(req.startUtc, timezone)}</div>
              <div className="sa-row__cell" data-label={REQUESTS.columnStatus}>
                <span className="sa-state" data-tone={requestStateTone(req.state)}>{requestStateLabel(req.state)}</span>
              </div>
              <div className="sa-row__cell" data-label={REQUESTS.columnSource}>{sourceLabel(req.source)}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
