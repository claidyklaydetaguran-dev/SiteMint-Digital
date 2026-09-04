/**
 * V5 PR-7/PR-8 — the Appointments detail drawer.
 *
 * One request's status history, details, and the three lifecycle actions the
 * calendar router now supports: Approve (`pending_review` → `booked`,
 * writing a calendar event), Reschedule (`booked` → a new time, writing a
 * replacement event) and Cancel (removes the row from the calendar when it
 * was booked, or simply marks it cancelled when it was only pending/held —
 * see `cancelEndpointFor`). Every mutation error is mapped through the
 * contract's reason-copy functions so no raw server token reaches the
 * screen, and a 409 conflict refreshes the list (the mutations already
 * invalidate the requests query on success; on a conflict the caller is told
 * explicitly that the list was refreshed).
 */

import { useCallback, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  useApproveAppointmentRequest,
  useCancelBookedAppointment,
  useRescheduleBookedAppointment,
} from "@/hooks/useCalendar";
import { useAvailabilityDays, useAvailabilitySlots, useCancelAppointmentRequest } from "@/hooks/useAvailability";
import { isCalendarActionError } from "@/lib/calendarApi";
import type { AppointmentRequest, AvailabilityConfig } from "@/lib/availabilityApi";
import {
  LEGEND_TONE,
  dateKey as makeKey,
  dayLabel,
  daysInMonth,
  firstWeekdayOfMonth,
  isSelectableDay,
  monthLabel,
  monthRange,
  shiftMonth,
  slotDateTime,
  slotTime,
  WEEKDAY_INITIALS,
} from "@/lib/schedulingDates";
import {
  DETAIL,
  GENERIC_FAILURE,
  approveReasonCopy,
  cancelEndpointFor,
  cancelReasonCopy,
  canApprove,
  canCancel,
  canReschedule,
  contactDetail,
  contactName,
  requestStateLabel,
  requestStateTone,
  rescheduleReasonCopy,
  sourceLabel,
  statusHistory,
  typeName,
} from "@/pages/appointments/appointmentsContract";

type Mode = "view" | "reschedule";
type Notice = null | { title: string; detail: string; tone: "error" | "attention" | "ok" };

export function AppointmentDetailDrawer({
  request,
  config,
  onClose,
}: {
  request: AppointmentRequest | null;
  config: AvailabilityConfig | undefined;
  onClose: () => void;
}) {
  const approveMutation = useApproveAppointmentRequest();
  const cancelCalendarMutation = useCancelBookedAppointment();
  const cancelAvailabilityMutation = useCancelAppointmentRequest();
  const rescheduleMutation = useRescheduleBookedAppointment();

  const [mode, setMode] = useState<Mode>("view");
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "cancel" | "reschedule" | null>(null);

  const reset = useCallback(() => {
    setMode("view");
    setNotice(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleApprove = useCallback(async () => {
    if (!request || pendingAction) return;
    setPendingAction("approve");
    setNotice(null);
    try {
      await approveMutation.mutateAsync(request.id);
      setNotice({ title: DETAIL.approveSuccessTitle, detail: DETAIL.approveSuccessDetail, tone: "ok" });
    } catch (err) {
      const reason = isCalendarActionError(err) ? err.reason : null;
      const copy = approveReasonCopy(reason);
      setNotice({ ...copy, tone: "error" });
    } finally {
      setPendingAction(null);
    }
  }, [request, pendingAction, approveMutation]);

  const handleCancel = useCallback(async () => {
    if (!request || pendingAction) return;
    const endpoint = cancelEndpointFor(request.state);
    if (!endpoint) return;
    setPendingAction("cancel");
    setNotice(null);
    try {
      if (endpoint === "calendar") {
        await cancelCalendarMutation.mutateAsync(request.id);
      } else {
        await cancelAvailabilityMutation.mutateAsync(request.id);
      }
      setNotice({ title: "", detail: DETAIL.cancelledAnnouncement, tone: "ok" });
    } catch (err) {
      const reason = isCalendarActionError(err) ? err.reason : null;
      const copy = endpoint === "calendar" ? cancelReasonCopy(reason) : { title: DETAIL.cancelFailedTitle, detail: GENERIC_FAILURE.detail };
      setNotice({ ...copy, tone: "error" });
    } finally {
      setPendingAction(null);
    }
  }, [request, pendingAction, cancelCalendarMutation, cancelAvailabilityMutation]);

  const handleReschedule = useCallback(async (startUtc: string) => {
    if (!request || pendingAction) return;
    setPendingAction("reschedule");
    setNotice(null);
    try {
      await rescheduleMutation.mutateAsync({ publicId: request.id, startUtc });
      setNotice({ title: DETAIL.rescheduleSuccessTitle, detail: DETAIL.rescheduleSuccessDetail, tone: "ok" });
      setMode("view");
    } catch (err) {
      const reason = isCalendarActionError(err) ? err.reason : null;
      const copy = rescheduleReasonCopy(reason);
      setNotice({ ...copy, tone: "error" });
    } finally {
      setPendingAction(null);
    }
  }, [request, pendingAction, rescheduleMutation]);

  const open = request !== null;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {request && (
          <>
            <SheetHeader>
              <SheetTitle>{contactName(request.contact)}</SheetTitle>
              <SheetDescription>{contactDetail(request.contact)}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section aria-labelledby="drawer-status-h">
                <h3 className="text-sm font-semibold text-foreground" id="drawer-status-h">{DETAIL.statusHistoryHeading}</h3>
                <ol className="mt-2 space-y-1">
                  {statusHistory(request.state, request.createdAt).map((step, i) => (
                    <li key={`${step.label}-${i}`} className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${step.tone === "current" ? "bg-primary" : "bg-muted-foreground/40"}`}
                        aria-hidden="true"
                      />
                      <span className={step.tone === "current" ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="drawer-details-h">
                <h3 className="text-sm font-semibold text-foreground" id="drawer-details-h">{DETAIL.detailsHeading}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{DETAIL.typeLabel}</dt>
                  <dd>{typeName(config, request.appointmentTypeId)}</dd>
                  <dt className="text-muted-foreground">{DETAIL.whenLabel}</dt>
                  <dd>{slotDateTime(request.startUtc, config?.timezone ?? "UTC")}</dd>
                  <dt className="text-muted-foreground">{DETAIL.sourceLabel}</dt>
                  <dd>{sourceLabel(request.source)}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <span className="sa-state" data-tone={requestStateTone(request.state)}>{requestStateLabel(request.state)}</span>
                  </dd>
                </dl>
              </section>

              {notice && (
                <div className="sa-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
                  {notice.title && <p className="sa-notice__title">{notice.title}</p>}
                  <p className="sa-notice__detail">{notice.detail}</p>
                </div>
              )}

              {mode === "view" && (
                <div className="flex flex-wrap gap-2">
                  {canApprove(request.state) && (
                    <Button type="button" onClick={handleApprove} disabled={pendingAction !== null} aria-busy={pendingAction === "approve"}>
                      {pendingAction === "approve" ? DETAIL.approvePendingLabel : DETAIL.approveLabel}
                    </Button>
                  )}
                  {canReschedule(request.state) && (
                    <Button type="button" variant="outline" onClick={() => setMode("reschedule")} disabled={pendingAction !== null}>
                      {DETAIL.rescheduleLabel}
                    </Button>
                  )}
                  {canCancel(request.state) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" disabled={pendingAction !== null}>{DETAIL.cancelLabel}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{DETAIL.cancelConfirmTitle}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {request.state === "booked" ? DETAIL.cancelConfirmDetailBooked : DETAIL.cancelConfirmDetailPending}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{DETAIL.cancelConfirmDismiss}</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancel} disabled={pendingAction !== null} aria-busy={pendingAction === "cancel"}>
                            {pendingAction === "cancel" ? DETAIL.cancelPendingLabel : DETAIL.cancelConfirmAction}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}

              {mode === "reschedule" && (
                <ReschedulePicker
                  appointmentTypeId={request.appointmentTypeId}
                  timezone={config?.timezone ?? "UTC"}
                  pending={pendingAction === "reschedule"}
                  onConfirm={handleReschedule}
                  onCancel={() => setMode("view")}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A minimal slot picker for the reschedule flow, reusing the same days/slots endpoints the booking flows use, scoped to the request's own appointment type. */
function ReschedulePicker({
  appointmentTypeId,
  timezone,
  pending,
  onConfirm,
  onCancel,
}: {
  appointmentTypeId: string;
  timezone: string;
  pending: boolean;
  onConfirm: (startUtc: string) => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [slot, setSlot] = useState<string | undefined>(undefined);

  const { start, end } = monthRange(year, month);
  const daysQuery = useAvailabilityDays(start, end, appointmentTypeId);
  const slotsQuery = useAvailabilitySlots(date, appointmentTypeId);

  const reasons = useMemo(() => {
    const map = new Map<string, "open" | "blocked" | "outside_hours" | "fully_booked" | "past_booking_window" | "beyond_advance_window">();
    for (const d of daysQuery.data?.days ?? []) map.set(d.dateKey, d.reason);
    return map;
  }, [daysQuery.data]);

  return (
    <section aria-labelledby="reschedule-h" className="rounded-lg border border-card-border p-3">
      <h3 className="text-sm font-semibold text-foreground" id="reschedule-h">{DETAIL.reschedulePickHeading}</h3>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" className="sa-step" onClick={() => { const n = shiftMonth(year, month, -1); setYear(n.year); setMonth(n.month); }} aria-label="Previous month">‹</button>
        <span className="text-sm font-medium">{monthLabel(year, month)}</span>
        <button type="button" className="sa-step" onClick={() => { const n = shiftMonth(year, month, 1); setYear(n.year); setMonth(n.month); }} aria-label="Next month">›</button>
      </div>

      <div className="sa-calendar__weekdays" aria-hidden="true">
        {WEEKDAY_INITIALS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="sa-calendar__grid" role="group" aria-label={`${monthLabel(year, month)} availability`}>
        {Array.from({ length: firstWeekdayOfMonth(year, month) }).map((_, i) => (
          <span key={`pad-${i}`} className="sa-day sa-day--pad" aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((day) => {
          const key = makeKey(year, month, day);
          const reason = reasons.get(key);
          const openDay = isSelectableDay(reason);
          const tone = reason ? LEGEND_TONE[reason] : "closed";
          return (
            <button
              key={key} type="button" className="sa-day" data-tone={tone} data-selected={key === date}
              disabled={!openDay || daysQuery.isLoading} aria-pressed={key === date}
              aria-label={dayLabel(key)}
              onClick={() => { setDate(key); setSlot(undefined); }}
            >
              <span className="sa-day__num">{day}</span>
            </button>
          );
        })}
      </div>

      {date && (
        <div className="mt-2">
          {slotsQuery.isLoading ? (
            <p className="sa-status" role="status">Loading times…</p>
          ) : (slotsQuery.data?.slots.length ?? 0) === 0 ? (
            <p className="sa-times__hint">{DETAIL.rescheduleSlotsEmpty}</p>
          ) : (
            <ul className="sa-slots">
              {slotsQuery.data!.slots.map((s) => (
                <li key={s.startUtc}>
                  <button type="button" className="sa-slot" data-selected={s.startUtc === slot} aria-pressed={s.startUtc === slot} onClick={() => setSlot(s.startUtc)}>
                    {slotTime(s.startUtc, timezone)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" onClick={() => slot && onConfirm(slot)} disabled={!slot || pending} aria-busy={pending}>
          {pending ? DETAIL.reschedulePendingLabel : DETAIL.rescheduleConfirmLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>{DETAIL.rescheduleCancel}</Button>
      </div>
    </section>
  );
}
