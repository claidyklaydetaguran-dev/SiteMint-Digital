import { useQuery, useMutation } from "@tanstack/react-query";
import {
  fetchPublicConfig,
  fetchPublicDays,
  fetchPublicSlots,
  submitPublicRequest,
  type PublicContact,
} from "@/lib/publicSchedulingApi";

const ROOT = "public-scheduling" as const;

export function usePublicConfig(slug: string) {
  return useQuery({
    queryKey: [ROOT, "config", slug],
    queryFn: () => fetchPublicConfig(slug),
    retry: false,
  });
}

export function usePublicDays(slug: string, start: string, end: string, appointmentTypeId: string | undefined) {
  const resolved = appointmentTypeId !== undefined;
  return useQuery({
    queryKey: resolved ? [ROOT, "days", slug, start, end, appointmentTypeId] : [ROOT, "days-unresolved"],
    queryFn: () => fetchPublicDays(slug, start, end, appointmentTypeId as string),
    enabled: resolved,
  });
}

export function usePublicSlots(slug: string, date: string | undefined, appointmentTypeId: string | undefined) {
  const resolved = date !== undefined && appointmentTypeId !== undefined;
  return useQuery({
    queryKey: resolved ? [ROOT, "slots", slug, date, appointmentTypeId] : [ROOT, "slots-unresolved"],
    queryFn: () => fetchPublicSlots(slug, date as string, appointmentTypeId as string),
    enabled: resolved,
  });
}

export function useSubmitPublicRequest(slug: string) {
  return useMutation({
    mutationFn: ({ appointmentTypeId, startUtc, contact, formStartedAt }: {
      appointmentTypeId: string;
      startUtc: string;
      contact: PublicContact;
      formStartedAt: string;
    }) => submitPublicRequest(slug, appointmentTypeId, startUtc, contact, formStartedAt),
  });
}
