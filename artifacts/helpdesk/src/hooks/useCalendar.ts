/**
 * V5 PR-7 — React Query hooks for the calendar router (`lib/calendarApi.ts`).
 *
 * The calendar-status read itself stays in `useAvailability.ts`
 * (`useCalendarStatus`) because `GET .../availability/calendar-status` is
 * part of the existing, unchanged availability router — it is not duplicated
 * here. This module owns only the calendar router's own mutations: starting
 * a Google connection, disconnecting, and the appointment-request lifecycle
 * actions (approve / cancel / reschedule / reconcile).
 *
 * Every mutation that changes a stored appointment request invalidates the
 * same firm-scoped `["availability", "requests", firmId]` query the
 * Appointments page reads, so approving, cancelling or rescheduling a request
 * is reflected in the list without a manual refetch. Approve/cancel/
 * reschedule invalidate `onSettled` rather than `onSuccess` — each of those
 * can fail with a `conflict`/`conflict_after_write` reason precisely because
 * another actor changed the row first, and the brief requires that a 409
 * conflict refreshes the list, not just a successful mutation. Connecting or
 * disconnecting the calendar invalidates the calendar-status query for the
 * same reason as a plain success case (no conflict is documented for those).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  approveAppointmentRequest,
  cancelBookedAppointment,
  disconnectCalendar,
  reconcileCalendar,
  rescheduleBookedAppointment,
  startGoogleCalendarConnect,
} from "@/lib/calendarApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const AVAILABILITY_ROOT = "availability" as const;

function requestsKey(firmId: number | undefined) {
  return firmId !== undefined ? [AVAILABILITY_ROOT, "requests", firmId] : undefined;
}

function calendarStatusKey(firmId: number | undefined) {
  return firmId !== undefined ? [AVAILABILITY_ROOT, "calendar-status", firmId] : undefined;
}

export function useStartGoogleCalendarConnect() {
  return useMutation({
    mutationFn: () => startGoogleCalendarConnect(),
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: () => disconnectCalendar(),
    onSuccess: () => {
      const key = calendarStatusKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useApproveAppointmentRequest() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (publicId: string) => approveAppointmentRequest(publicId),
    onSettled: () => {
      const key = requestsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useCancelBookedAppointment() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (publicId: string) => cancelBookedAppointment(publicId),
    onSettled: () => {
      const key = requestsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRescheduleBookedAppointment() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: ({ publicId, startUtc }: { publicId: string; startUtc: string }) =>
      rescheduleBookedAppointment(publicId, startUtc),
    onSettled: () => {
      const key = requestsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useReconcileCalendar() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: () => reconcileCalendar(),
    onSuccess: () => {
      const key = requestsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}
