import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { DiscoveryDraft } from "@/components/platform-discovery/discoveryFormModel";

const DRAFT_KEY = "sm_discovery_draft_v1";

/** Load a previously saved draft from localStorage. Returns null if none exists or parsing fails. */
export function loadDraft(): DiscoveryDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DiscoveryDraft;
  } catch {
    return null;
  }
}

/** Persist the current draft to localStorage. Silently ignores storage quota errors. */
export function saveDraft(draft: DiscoveryDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — ignore silently
  }
}

/** Remove the saved draft (call on explicit start-over or after successful completion). */
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * When `isActive` is true:
 *  - Subscribes to every react-hook-form value change and auto-saves to localStorage.
 *  - Registers a `beforeunload` handler so the browser warns the user before they
 *    accidentally navigate away or close the tab mid-form.
 *
 * Both effects are no-ops while `isActive` is false (welcome screen phase).
 */
export function useDiscoveryDraftPersistence(
  form: UseFormReturn<DiscoveryDraft>,
  isActive: boolean,
): void {
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Auto-save on every field change
  useEffect(() => {
    const { unsubscribe } = form.watch((values) => {
      if (isActiveRef.current) {
        saveDraft(values as DiscoveryDraft);
      }
    });
    return unsubscribe;
  }, [form]);

  // Beforeunload navigation warning while filling out the form
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isActiveRef.current) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}
