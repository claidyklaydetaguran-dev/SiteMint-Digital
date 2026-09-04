import { useQuery } from "@tanstack/react-query";
import { fetchContactDetail, fetchContacts, type ContactDetailResponse, type ContactSummary } from "@/lib/contactsApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "contacts" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

export function useContactsList(query: string) {
  const firmId = useAuthenticatedFirmId();
  return useQuery<{ items: ContactSummary[]; count: number }>({
    queryKey: firmId !== undefined ? [ROOT, "list", firmId, query] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchContacts(query),
    enabled: firmId !== undefined,
  });
}

export function useContactDetail(id: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && id !== undefined;
  return useQuery<ContactDetailResponse | undefined>({
    queryKey: resolved ? [ROOT, "detail", firmId, id] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchContactDetail(id as string),
    enabled: resolved,
  });
}
