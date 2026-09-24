import { useQuery } from "@tanstack/react-query";
import {
  fetchContactTexts,
  type ContactText,
  fetchContactDetail,
  fetchContactForCall,
  fetchContacts,
  type ContactDetailResponse,
  type ContactSummary,
} from "@/lib/contactsApi";
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

/**
 * The contact linked to one call, resolved server-side through the call-link
 * foreign key — nothing here matches on a name or a number. Resolving to
 * `undefined` means no contact is linked, which is an ordinary answer.
 */
export function useContactForCall(callId: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && typeof callId === "string" && callId !== "";
  return useQuery<ContactSummary | undefined>({
    queryKey: resolved ? [ROOT, "by-call", firmId, callId] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchContactForCall(callId as string),
    enabled: resolved,
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

/** J4: the texts between the business's voice number and one contact. */
export function useContactTexts(id: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && id !== undefined;
  return useQuery<{ items: ContactText[]; count: number; unread: number }>({
    queryKey: resolved ? [ROOT, "texts", firmId, id] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchContactTexts(id as string),
    enabled: resolved,
  });
}
