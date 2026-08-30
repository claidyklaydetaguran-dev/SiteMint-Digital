/**
 * Frontend V2 Phase 13 — the Requests view.
 *
 * Every value shown here came from `GET .../availability/requests`. There is
 * no approve, confirm, reject, reschedule, assign, add-to-calendar, remind,
 * email, text, export, note, filter or search control, because the backend has
 * no endpoint behind any of them and a disabled-looking affordance for a thing
 * that does not exist is still a claim that it does.
 *
 * Cancellation is the one mutation, and it is the only one the API offers for a
 * stored request. It takes two deliberate activations: the row's Cancel control
 * opens a confirmation naming the consequence, and only the confirm button in
 * that panel issues `POST .../requests/:publicId/cancel`. Pending state is
 * per-row, so cancelling one request never disables another. A 404 — the
 * request was already cancelled or removed elsewhere — is reported as its own
 * outcome rather than as a failure, because nothing went wrong.
 *
 * The server-generated public id is the only identifier the response carries
 * (the route maps `publicId` onto `id` and never serialises the internal
 * serial). It is used as a React key and as the cancel path segment, and is
 * never displayed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppointmentRequests, useCancelAppointmentRequest } from "@/hooks/useAvailability";
import type { AvailabilityConfig } from "@/lib/availabilityApi";
import {
  REQUESTS,
  canCancel,
  contactDetail,
  contactName,
  requestStateLabel,
  requestStateTone,
  slotDateTime,
  sourceLabel,
  typeName,
} from "@/pages/appointments/appointmentsContract";

type Outcome = null | { kind: "cancelled" | "missing" | "failed" };

export function AppointmentRequestsList({ config }: { config: AvailabilityConfig | undefined }) {
  const { data, isLoading, isError } = useAppointmentRequests();
  const cancelMutation = useCancelAppointmentRequest();

  const [confirming, setConfirming] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());

  // Focus follows the confirmation into view, and only when it opens.
  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
  }, [confirming]);

  const timezone = config?.timezone ?? "UTC";

  const askToCancel = (id: string) => {
    setOutcome(null);
    setConfirming(id);
  };

  const dismiss = useCallback((id: string) => {
    setConfirming(null);
    triggerRefs.current.get(id)?.focus();
  }, []);

  /** One POST per activation, guarded and disabled for the duration. */
  const confirmCancel = useCallback(async (id: string) => {
    if (pendingId !== null) return;
    setPendingId(id);
    setOutcome(null);
    try {
      await cancelMutation.mutateAsync(id);
      setOutcome({ kind: "cancelled" });
      setConfirming(null);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setOutcome({ kind: status === 404 ? "missing" : "failed" });
      setConfirming(null);
    } finally {
      setPendingId(null);
    }
  }, [cancelMutation, pendingId]);

  if (isLoading) {
    return <p className="sa-status" role="status" aria-live="polite">{REQUESTS.loading}</p>;
  }

  if (isError) {
    return (
      <div className="sa-notice" data-tone="error" role="alert">
        <p className="sa-notice__title">{REQUESTS.failed}</p>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="sa-requests">
      <p className="sa-requests__detail">{REQUESTS.detail}</p>

      {/* Targeted announcement for the one mutation this view has. Not a
          whole-page live region: only the result sentence is announced. */}
      <div className="sa-announce" role="status" aria-live="polite" hidden={outcome === null}>
        {outcome !== null && (
          <div className="sa-notice" data-tone={outcome.kind === "cancelled" ? "neutral" : outcome.kind === "missing" ? "attention" : "error"}>
            <p className="sa-notice__title">
              {outcome.kind === "cancelled" ? REQUESTS.cancelledAnnouncement
                : outcome.kind === "missing" ? REQUESTS.cancelMissingTitle
                : REQUESTS.cancelFailedTitle}
            </p>
            {outcome.kind !== "cancelled" && (
              <p className="sa-notice__detail">
                {outcome.kind === "missing" ? REQUESTS.cancelMissingDetail : REQUESTS.cancelFailedDetail}
              </p>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <section className="sa-empty" aria-labelledby="sa-req-empty">
          <h2 className="sa-empty__title" id="sa-req-empty">{REQUESTS.emptyTitle}</h2>
          <p className="sa-empty__detail">{REQUESTS.emptyDetail}</p>
        </section>
      ) : (
        <ul className="sa-list">
          <li className="sa-list__head" aria-hidden="true">
            <span>{REQUESTS.columnClient}</span>
            <span>{REQUESTS.columnType}</span>
            <span>{REQUESTS.columnWhen}</span>
            <span>{REQUESTS.columnStatus}</span>
            <span>{REQUESTS.columnSource}</span>
            <span />
          </li>

          {items.map((req) => {
            const open = confirming === req.id;
            const busy = pendingId === req.id;
            return (
              <li key={req.id} className="sa-row">
                <div className="sa-row__grid">
                  <div className="sa-row__client">
                    <span className="sa-row__name">{contactName(req.contact)}</span>
                    <span className="sa-row__contact">{contactDetail(req.contact)}</span>
                  </div>

                  <div className="sa-row__cell" data-label={REQUESTS.columnType}>
                    {typeName(config, req.appointmentTypeId)}
                  </div>

                  <div className="sa-row__cell" data-label={REQUESTS.columnWhen}>
                    {slotDateTime(req.startUtc, timezone)}
                  </div>

                  <div className="sa-row__cell" data-label={REQUESTS.columnStatus}>
                    <span className="sa-state" data-tone={requestStateTone(req.state)}>
                      {requestStateLabel(req.state)}
                    </span>
                  </div>

                  <div className="sa-row__cell" data-label={REQUESTS.columnSource}>
                    {sourceLabel(req.source)}
                  </div>

                  <div className="sa-row__action">
                    {canCancel(req.state) && !open && (
                      <button
                        type="button"
                        className="sa-button sa-button--quiet"
                        ref={(node) => { triggerRefs.current.set(req.id, node); }}
                        onClick={() => askToCancel(req.id)}
                      >
                        {REQUESTS.cancelLabel}
                      </button>
                    )}
                  </div>
                </div>

                {open && (
                  <div
                    className="sa-confirm"
                    role="group"
                    aria-labelledby={`sa-confirm-title-${req.id}`}
                    aria-describedby={`sa-confirm-detail-${req.id}`}
                    onKeyDown={(e) => { if (e.key === "Escape") dismiss(req.id); }}
                  >
                    <p className="sa-confirm__title" id={`sa-confirm-title-${req.id}`}>
                      {REQUESTS.cancelConfirmTitle}
                    </p>
                    <p className="sa-confirm__detail" id={`sa-confirm-detail-${req.id}`}>
                      {REQUESTS.cancelConfirmDetail}
                    </p>
                    <div className="sa-confirm__actions">
                      <button
                        type="button"
                        ref={confirmRef}
                        className="sa-button sa-button--danger"
                        onClick={() => confirmCancel(req.id)}
                        disabled={busy}
                        aria-busy={busy}
                      >
                        {busy ? REQUESTS.cancelPendingLabel : REQUESTS.cancelConfirmAction}
                      </button>
                      <button
                        type="button"
                        className="sa-button"
                        onClick={() => dismiss(req.id)}
                        disabled={busy}
                      >
                        {REQUESTS.cancelConfirmDismiss}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
