import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAssistants,
  createAssistant,
  getAssistant,
  updateAssistant,
  duplicateAssistant,
  deleteAssistant,
  type AssistantDto,
  type CreateAssistantInput,
  type UpdateAssistantInput,
} from "@/lib/assistantsApi";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { voicePlatformEnabled } from "@/lib/featureFlags";

/**
 * Milestone 1 / Checkpoint E2 (correction pass): query/mutation hooks for
 * the assistant persistence API. Kept isolated from conversations/billing/
 * contacts query keys so cache invalidation never crosses into unrelated
 * data — and session-scoped by the authenticated firm id (a purely local
 * cache namespace, never sent to the server) so cached data from one firm
 * can never be read under a different firm's session, even transiently.
 */

const ASSISTANTS_ROOT = "voice-assistants" as const;

/**
 * Placeholder key used only while the authenticated firm id can't yet be
 * trusted (session loading/errored/unauthenticated). The corresponding
 * queries are always `enabled: false` in that state, so this key is never
 * written to — it exists only so a stable queryKey can be passed to
 * useQuery before a real firm-scoped key is available.
 */
const UNRESOLVED_SESSION_KEY = [ASSISTANTS_ROOT, "unresolved-session"] as const;

export const assistantsListKey = (firmId: number) => [ASSISTANTS_ROOT, "firm", firmId] as const;
export const assistantDetailKey = (firmId: number, id: number) =>
  [ASSISTANTS_ROOT, "firm", firmId, "detail", id] as const;

export function useAssistantsList() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<AssistantDto[]>({
    queryKey: firmId !== undefined ? assistantsListKey(firmId) : UNRESOLVED_SESSION_KEY,
    queryFn: ({ signal }) => listAssistants(signal),
    enabled: firmId !== undefined && voicePlatformEnabled,
    retry: 1,
  });
}

export function useAssistantDetail(id: number | undefined) {
  const firmId = useAuthenticatedFirmId();
  const resolved = firmId !== undefined && id !== undefined;
  return useQuery<AssistantDto>({
    queryKey: resolved ? assistantDetailKey(firmId as number, id as number) : UNRESOLVED_SESSION_KEY,
    queryFn: ({ signal }) => getAssistant(id as number, signal),
    enabled: resolved && voicePlatformEnabled,
    retry: 1,
  });
}

export function useCreateAssistant() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (input: CreateAssistantInput) => createAssistant(input),
    retry: false,
    onSuccess: (assistant) => {
      if (firmId === undefined) return;
      qc.setQueryData(assistantDetailKey(firmId, assistant.id), assistant);
      qc.invalidateQueries({ queryKey: assistantsListKey(firmId) });
    },
  });
}

export function useUpdateAssistant(id: number) {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (patch: UpdateAssistantInput) => updateAssistant(id, patch),
    retry: false,
    onSuccess: (assistant) => {
      if (firmId === undefined) return;
      qc.setQueryData(assistantDetailKey(firmId, id), assistant);
      qc.invalidateQueries({ queryKey: assistantsListKey(firmId) });
    },
  });
}

export function useDuplicateAssistant() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => duplicateAssistant(id),
    retry: false,
    onSuccess: (assistant) => {
      if (firmId === undefined) return;
      qc.setQueryData(assistantDetailKey(firmId, assistant.id), assistant);
      qc.invalidateQueries({ queryKey: assistantsListKey(firmId) });
    },
  });
}

export function useDeleteAssistant() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return useMutation({
    mutationFn: (id: number) => deleteAssistant(id),
    retry: false,
    onSuccess: (_result, id) => {
      if (firmId === undefined) return;
      qc.removeQueries({ queryKey: assistantDetailKey(firmId, id) });
      qc.invalidateQueries({ queryKey: assistantsListKey(firmId) });
    },
  });
}

/**
 * Mounted once, always, near the app root (see App.tsx) — independent of
 * route, so it observes every transition: login, logout, session expiry,
 * or switching firms in the same tab without a full reload. Whenever the
 * authenticated firm id changes, every assistant query (any firm) is
 * cancelled and evicted so stale data can never be read after the
 * transition. This is defense-in-depth on top of firm-scoped keys, which
 * are what actually prevent cross-firm rendering even if this effect were
 * ever delayed.
 */
export function useAssistantSessionGuard(): void {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  const previousFirmId = useRef<number | undefined>(firmId);

  useEffect(() => {
    if (previousFirmId.current === firmId) return;
    qc.cancelQueries({ queryKey: [ASSISTANTS_ROOT] });
    qc.removeQueries({ queryKey: [ASSISTANTS_ROOT] });
    previousFirmId.current = firmId;
  }, [firmId, qc]);
}
