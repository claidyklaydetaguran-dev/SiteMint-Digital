import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAvailabilityConfig,
  updateAvailabilityConfig,
  fetchAvailabilityDays,
  fetchAvailabilitySlots,
  holdSlot,
  submitAppointmentRequest,
  fetchAppointmentRequests,
  cancelAppointmentRequest,
  setPublicSchedulingLink,
  fetchCalendarStatus,
  type AvailabilityConfigInput,
  type AppointmentContact,
} from "@/lib/availabilityApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "availability" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

export function useAvailabilityConfig() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "config", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchAvailabilityConfig,
    enabled: firmId !== undefined,
  });
}

export function useUpdateAvailabilityConfig() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (config: AvailabilityConfigInput) => updateAvailabilityConfig(config),
    onSuccess: () => {
      if (firmId !== undefined) qc.invalidateQueries({ queryKey: [ROOT, "config", firmId] });
    },
  });
}

export function useSetPublicSchedulingLink() {
  return useMutation({
    mutationFn: (enabled: boolean) => setPublicSchedulingLink(enabled),
  });
}

export function useCalendarStatus() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "calendar-status", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchCalendarStatus,
    enabled: firmId !== undefined,
  });
}

export function useAvailabilityDays(start: string, end: string, appointmentTypeId: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && appointmentTypeId !== undefined;
  return useQuery({
    queryKey: resolved ? [ROOT, "days", firmId, start, end, appointmentTypeId] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchAvailabilityDays(start, end, appointmentTypeId as string),
    enabled: resolved,
  });
}

export function useAvailabilitySlots(date: string | undefined, appointmentTypeId: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && date !== undefined && appointmentTypeId !== undefined;
  return useQuery({
    queryKey: resolved ? [ROOT, "slots", firmId, date, appointmentTypeId] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchAvailabilitySlots(date as string, appointmentTypeId as string),
    enabled: resolved,
  });
}

export function useHoldSlot() {
  return useMutation({
    mutationFn: ({ appointmentTypeId, startUtc }: { appointmentTypeId: string; startUtc: string }) =>
      holdSlot(appointmentTypeId, startUtc),
  });
}

export function useSubmitAppointmentRequest() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: ({
      appointmentTypeId,
      startUtc,
      contact,
      options,
    }: {
      appointmentTypeId: string;
      startUtc: string;
      contact: AppointmentContact;
      options?: Parameters<typeof submitAppointmentRequest>[3];
    }) => submitAppointmentRequest(appointmentTypeId, startUtc, contact, options),
    onSuccess: () => {
      if (firmId !== undefined) {
        qc.invalidateQueries({ queryKey: [ROOT, "requests", firmId] });
        // The new appointment occupies its slot, so any day or slot list still
        // on screen is now stale and would offer a time that is already taken.
        qc.invalidateQueries({ queryKey: [ROOT, "days"] });
        qc.invalidateQueries({ queryKey: [ROOT, "slots"] });
      }
    },
  });
}

export function useAppointmentRequests() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "requests", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchAppointmentRequests,
    enabled: firmId !== undefined,
  });
}

export function useCancelAppointmentRequest() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: string) => cancelAppointmentRequest(id),
    onSuccess: () => {
      if (firmId !== undefined) qc.invalidateQueries({ queryKey: [ROOT, "requests", firmId] });
    },
  });
}
