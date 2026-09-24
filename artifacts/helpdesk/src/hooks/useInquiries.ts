import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTransferContact,
  deleteTransferContact,
  fetchAssistantCapabilities,
  fetchInquiries,
  fetchInquiriesForCall,
  fetchNotifications,
  fetchTransferContacts,
  runTransferContactCheck,
  updateInquiryStatus,
  updateTransferContact,
  type AssistantCapabilityList,
  type InquiryList,
  type InquiryStatus,
  type NotificationRecord,
  type TransferContactDraft,
  type TransferContactList,
} from "@/lib/inquiriesApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";

const ROOT = "voice-inquiries" as const;
const UNRESOLVED_SESSION_KEY = [ROOT, "unresolved-session"] as const;

/**
 * Every key is scoped by the authenticated firm id, so a cached list can never
 * be shown to a different account after a sign-out/sign-in on the same browser.
 */
function listKey(firmId: number | undefined, status: InquiryStatus | "all") {
  return firmId !== undefined ? [ROOT, "list", firmId, status] : undefined;
}
function notificationsKey(firmId: number | undefined) {
  return firmId !== undefined ? [ROOT, "notifications", firmId] : undefined;
}
function contactsKey(firmId: number | undefined) {
  return firmId !== undefined ? [ROOT, "transfer-contacts", firmId] : undefined;
}

export function useInquiries(status: InquiryStatus | "all") {
  const firmId = useAuthenticatedFirmId();
  return useQuery<InquiryList>({
    queryKey: listKey(firmId, status) ?? UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchInquiries(status === "all" ? undefined : status),
    enabled: firmId !== undefined,
  });
}

/**
 * The saved messages for one call, for the call record's linked-records panel.
 * Keyed by firm AND call so one call's messages can never be served from
 * another's cache entry.
 */
export function useInquiriesForCall(callId: string | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && typeof callId === "string" && callId !== "";
  return useQuery<InquiryList>({
    queryKey: resolved ? [ROOT, "by-call", firmId, callId] : UNRESOLVED_SESSION_KEY,
    queryFn: () => fetchInquiriesForCall(callId as string),
    enabled: resolved,
  });
}

export function useUpdateInquiryStatus() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: InquiryStatus }) => updateInquiryStatus(id, status),
    onSuccess: () => {
      // Every filtered view and the counts change together.
      if (firmId !== undefined) qc.invalidateQueries({ queryKey: [ROOT, "list", firmId] });
    },
  });
}

export function useNotificationStatus() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<{ items: NotificationRecord[]; count: number }>({
    queryKey: notificationsKey(firmId) ?? UNRESOLVED_SESSION_KEY,
    queryFn: fetchNotifications,
    enabled: firmId !== undefined,
  });
}

/**
 * What the assistant can actually do. Kept in this hook module rather than in
 * the assistant hooks because it is server-derived truth about the workspace,
 * not part of the editable assistant draft — conflating the two is what lets a
 * ticked checkbox masquerade as a working capability.
 */
export function useAssistantCapabilities() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<AssistantCapabilityList>({
    queryKey: firmId !== undefined ? [ROOT, "capabilities", firmId] : UNRESOLVED_SESSION_KEY,
    queryFn: fetchAssistantCapabilities,
    enabled: firmId !== undefined,
  });
}

export function useTransferContacts() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<TransferContactList>({
    queryKey: contactsKey(firmId) ?? UNRESOLVED_SESSION_KEY,
    queryFn: fetchTransferContacts,
    enabled: firmId !== undefined,
  });
}

export function useSaveTransferContact() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: ({ id, draft }: { id: number | null; draft: TransferContactDraft }) =>
      id === null ? createTransferContact(draft) : updateTransferContact(id, draft),
    onSuccess: () => {
      const key = contactsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteTransferContact() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => deleteTransferContact(id),
    onSuccess: () => {
      const key = contactsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Runs the server-side settings check. Deliberately not called a "test call":
 * it places no call, and the report it returns says so.
 */
export function useTransferContactCheck() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => runTransferContactCheck(id),
    onSuccess: () => {
      const key = contactsKey(firmId);
      if (key) qc.invalidateQueries({ queryKey: key });
    },
  });
}
