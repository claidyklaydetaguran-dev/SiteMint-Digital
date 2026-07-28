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
  type AvailabilityConfig,
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
    mutationFn: (config: AvailabilityConfig) => updateAvailabilityConfig(config),
    onSuccess: () => {
      if (firmId !== undefined) qc.invalidateQueries({ queryKey: [ROOT, "config", firmId] });
    },
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
    mutationFn: ({ appointmentTypeId, startUtc, contact }: { appointmentTypeId: string; startUtc: string; contact: AppointmentContact }) =>
      submitAppointmentRequest(appointmentTypeId, startUtc, contact),
    onSuccess: () => {
      if (firmId !== undefined) qc.invalidateQueries({ queryKey: [ROOT, "requests", firmId] });
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
