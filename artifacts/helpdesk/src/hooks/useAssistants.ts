import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAssistants,
  createAssistant,
  getAssistant,
  updateAssistant,
  duplicateAssistant,
  deleteAssistant,
  publishAssistant,
  type AssistantDto,
  type CreateAssistantInput,
  type UpdateAssistantInput,
  type PublishedAssistantResult,
} from "@/lib/assistantsApi";
import { useAuthenticatedFirmId, SESSION_KEY } from "@/hooks/useSession";
import { voicePlatformEnabled, voicePublishEnabled } from "@/lib/featureFlags";

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
 * Milestone 1 / Checkpoint E3C: firm-scoped publish mutation. The
 * authenticated firm id is used only as a local cache-invalidation
 * namespace — it is never sent to the server (publishAssistant() sends no
 * body at all). retry is false: an HTTP error from this endpoint can mean
 * the backend already transitioned the assistant to `error`, `publishing`,
 * or `publish_uncertain`, so blindly retrying the same request client-side
 * would be unsafe. Every settled outcome (success or error) invalidates
 * only this firm's detail/list caches so the UI always re-renders from the
 * server-confirmed status rather than an assumed one.
 */
export function usePublishAssistant(id: number | undefined) {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  const usable =
    voicePlatformEnabled && voicePublishEnabled && firmId !== undefined && id !== undefined && id > 0;

  return useMutation<PublishedAssistantResult, unknown, void>({
    mutationFn: async () => {
      if (!usable || id === undefined) {
        throw new Error("Publishing is not available right now.");
      }
      return publishAssistant(id);
    },
    retry: false,
    onSettled: (_result, error) => {
      if (firmId !== undefined && id !== undefined) {
        qc.invalidateQueries({ queryKey: assistantDetailKey(firmId, id) });
        qc.invalidateQueries({ queryKey: assistantsListKey(firmId) });
      }
      const status = (error as { status?: number } | undefined)?.status;
      if (status === 401) {
        qc.invalidateQueries({ queryKey: SESSION_KEY });
      }
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
