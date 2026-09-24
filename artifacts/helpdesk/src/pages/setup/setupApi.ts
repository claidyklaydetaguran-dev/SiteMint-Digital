/**
 * V5 customer-shell foundation — data access for the Setup hub (S-3), and the
 * single place the receptionist's readiness is measured.
 *
 * Every step's status is worked out here from real configuration and real
 * capability, never from a stored tick: an assistant that is actually
 * published, a greeting that actually exists, a calendar that is actually
 * usable, a number that is actually assigned, a call that actually happened.
 * `pages/setup/setupContract.ts` turns those signals into statuses, and
 * Overview reads the very same pair — so the two screens cannot disagree about
 * whether an account is ready.
 *
 * ── The voice build boundary ──────────────────────────────────────────────
 *
 * Setup and Overview are always-on pages, so the three voice endpoints below
 * are reached exactly the way `pages/overview/overviewApi.ts` already reaches
 * them: through `apiFetch` behind a `voicePlatformEnabled` fold guard, so the
 * endpoint literal is removed from a gated-out build (AR-001M pins
 * `receptionist/voice/assistants` and `receptionist/voice/calls` against the
 * built output). Nothing here imports `lib/assistantsApi` or
 * `pages/assistants/assistantsContract` — doing so would pull the voice-gated
 * module graph, and its gated copy, into the entry chunk of every build.
 *
 * With the voice platform off those signals read `null`, which the contract
 * renders as "not checked" rather than as done or outstanding.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { voicePlatformEnabled } from "@/lib/featureFlags";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { useAvailabilityConfig } from "@/hooks/useAvailability";
import { useCalendarHealth } from "@/hooks/useCalendar";
import { fetchAgentConfig, fetchEmailStatus, readAccountProfile } from "@/lib/accountApi";
import { isValidTimeZone } from "@/pages/availability/availabilityContract";
// The calls query is owned by Overview's module and reused here rather than
// duplicated: both pages now render from these signals, and two queries for
// one endpoint would mean two requests on every Overview load.
import { useRecentCalls } from "@/pages/overview/overviewApi";
import {
  fetchOnboardingState,
  updateOnboardingState,
  type OnboardingState,
} from "@/lib/onboardingApi";
import {
  deriveStepStatuses,
  newlyInferredDone,
  type SavedSteps,
  type SetupSignals,
  type SetupStepKey,
} from "./setupContract";

const ROOT = "setup" as const;

// ─── Phone numbers ─────────────────────────────────────────────────────────

/**
 * Mirrors the number DTO `routes/receptionistNumbers.ts` actually returns.
 *
 * It returns `phoneE164`, and this module previously declared
 * `phoneNumberDisplay` — a field no response has ever carried. Overview read
 * it to render the assigned number, got `undefined`, and therefore told every
 * firm with a live number that it had none.
 */
export interface VoiceNumberSummary {
  id: number | string;
  phoneE164: string;
  /** `available` | `reserved` | `assigned` | `paused` | `released`. */
  state: string;
}

export function fetchVoiceNumbers(): Promise<{ items: VoiceNumberSummary[]; count: number } | null> {
  if (!voicePlatformEnabled) {
    // AR-001M: the endpoint literal must not survive into a gated-out build.
    return Promise.resolve(null);
  }
  return apiFetch("/receptionist/voice/numbers");
}

export function useVoiceNumbers() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "numbers", firmId] : [ROOT, "numbers", "unresolved"],
    queryFn: fetchVoiceNumbers,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

/**
 * The number this firm can actually be reached on.
 *
 * `/receptionist/voice/numbers` returns every row the firm owns — released and
 * paused ones included — so "the list is non-empty" is not the same question
 * as "a number answers calls". Only `assigned` means a call would reach the
 * assistant.
 */
function assignedNumber(items: VoiceNumberSummary[] | undefined): VoiceNumberSummary | null {
  return items?.find((n) => n.state === "assigned") ?? null;
}

// ─── Assistants ────────────────────────────────────────────────────────────

interface VoiceAssistantLite {
  id?: number;
  status?: string;
  providerSyncState?: string;
  config?: unknown;
}

function fetchVoiceAssistants(): Promise<{ items: VoiceAssistantLite[]; count: number } | null> {
  if (!voicePlatformEnabled) {
    // AR-001M: the endpoint literal must not survive into a gated-out build.
    return Promise.resolve(null);
  }
  return apiFetch("/receptionist/voice/assistants");
}

function useVoiceAssistants() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "assistants", firmId] : [ROOT, "assistants", "unresolved"],
    queryFn: fetchVoiceAssistants,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Whether the saved configuration says enough for the assistant to open a
 * call: a system prompt, plus a greeting whenever the assistant is the one who
 * speaks first. The server enforces the same greeting rule at publish time
 * (`persistedConfigMapper.ts`); this only reads the saved answer.
 */
function readPromptReady(config: unknown): boolean {
  const prompt = record(record(config)?.["prompt"]);
  if (!prompt) return false;
  if (trimmed(prompt["systemInstructions"]) === "") return false;
  if (prompt["firstMessageMode"] === "assistant-speaks-first") {
    return trimmed(prompt["firstMessage"]) !== "";
  }
  return true;
}

/**
 * Whether a voice has been chosen at all.
 *
 * Deliberately a presence check rather than a comparison against the supported
 * preset list: that list lives in `pages/assistants/assistantsContract.ts`,
 * which this always-on module must not import (see the build-boundary note at
 * the top). A published assistant necessarily carries a supported preset —
 * publishing rejects anything else — so nothing is lost by asking the weaker
 * question here.
 */
function readVoiceChosen(config: unknown): boolean {
  const voiceModel = record(record(config)?.["voiceModel"]);
  return voiceModel !== null && trimmed(voiceModel["preset"]) !== "";
}

// ─── Email ─────────────────────────────────────────────────────────────────

/**
 * Whether the account can actually receive email.
 *
 * Answered server-side by the same resolver the sender uses, so the Setup tick
 * means delivery would happen — not that a column looks right.
 */
function useEmailStatus() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "email-status", firmId] : [ROOT, "email-status", "unresolved"],
    queryFn: fetchEmailStatus,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

// ─── Onboarding state ───────────────────────────────────────────────────────

export function useOnboardingState() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<OnboardingState>({
    queryKey: firmId !== undefined ? [ROOT, "onboarding", firmId] : [ROOT, "onboarding", "unresolved"],
    queryFn: fetchOnboardingState,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

function useAgentConfig() {
  const firmId = useAuthenticatedFirmId();
  return useQuery({
    queryKey: firmId !== undefined ? [ROOT, "agent-config", firmId] : [ROOT, "agent-config", "unresolved"],
    queryFn: fetchAgentConfig,
    enabled: firmId !== undefined,
    retry: 1,
  });
}

// ─── Combined ────────────────────────────────────────────────────────────

export interface SetupData {
  loading: boolean;
  /** True once every query has resolved (success or error) at least once. */
  ready: boolean;
  saved: SavedSteps;
  signals: SetupSignals;
  completedAt: string | null;
  /** The E.164 number calls actually reach, or null when none is assigned. */
  assignedNumberDisplay: string | null;
}

/**
 * Every query the readiness picture needs, combined into one signals object.
 *
 * Each source degrades independently to `null` on failure — a failed
 * availability request must not make the business-profile signal disappear
 * too — and `null` means "not checked", never "not done".
 */
export function useSetupData(): SetupData {
  const onboarding = useOnboardingState();
  const agentConfig = useAgentConfig();
  const availability = useAvailabilityConfig();
  const calendarHealth = useCalendarHealth();
  const numbers = useVoiceNumbers();
  const assistants = useVoiceAssistants();
  const calls = useRecentCalls();
  const emailStatus = useEmailStatus();

  const loading =
    onboarding.isLoading ||
    agentConfig.isLoading ||
    availability.isLoading ||
    calendarHealth.isLoading ||
    numbers.isLoading ||
    assistants.isLoading ||
    calls.isLoading ||
    emailStatus.isLoading;
  const ready = !loading;

  const profile = agentConfig.isError ? null : readAccountProfile(agentConfig.data ?? null);

  // ── Availability ────────────────────────────────────────────────────────
  const availabilityConfig = availability.isError ? null : availability.data?.config ?? null;
  const openWeekday =
    availabilityConfig === null
      ? null
      : Object.values(availabilityConfig.weeklyHours ?? {}).some((hours) => hours != null);
  const timezoneValid =
    availabilityConfig === null ? null : isValidTimeZone(availabilityConfig.timezone);
  const activeTypes =
    availabilityConfig === null
      ? null
      : availabilityConfig.appointmentTypeDetail !== undefined
        ? availabilityConfig.appointmentTypeDetail.some((t) => t.active !== false)
        : (availabilityConfig.appointmentTypes?.length ?? 0) > 0;

  // ── Calendar ────────────────────────────────────────────────────────────
  const health = calendarHealth.isError ? null : calendarHealth.data?.health ?? null;
  const calendarReady =
    health === null
      ? null
      : health.usable === true &&
        (health.state === "healthy" || health.state === "untested") &&
        trimmed(health.calendarId) !== "";

  // ── Assistants ──────────────────────────────────────────────────────────
  const assistantItems = assistants.isError ? null : assistants.data?.items ?? null;
  const publishedAssistant = assistantItems?.find((a) => a.status === "published") ?? null;
  // Prompt and voice are read from the published assistant when there is one,
  // and otherwise from the assistant being built — those steps are about the
  // configuration existing, not about it having been published yet.
  const primaryAssistant = publishedAssistant ?? assistantItems?.[0] ?? null;

  // ── Numbers and calls ───────────────────────────────────────────────────
  const numberRows = numbers.isError ? null : numbers.data?.items ?? null;
  const assigned = numberRows === null ? null : assignedNumber(numberRows);
  const callItems = calls.isError || !voicePlatformEnabled ? null : calls.items;

  const signals: SetupSignals = {
    businessComplete: profile ? Boolean(profile.name.trim() && profile.industry.trim()) : null,
    // null when the read failed: "we could not ask" is not "not verified",
    // and ticking or un-ticking the step on a failed request would be a guess.
    emailVerified: emailStatus.isError ? null : (emailStatus.data?.canReceiveEmail ?? null),
    assistantPublished: assistantItems === null ? null : publishedAssistant !== null,
    assistantSynchronized:
      assistantItems === null
        ? null
        : publishedAssistant !== null && publishedAssistant.providerSyncState === "synchronized",
    promptReady: primaryAssistant === null ? (assistantItems === null ? null : false) : readPromptReady(primaryAssistant.config),
    voiceChosen: primaryAssistant === null ? (assistantItems === null ? null : false) : readVoiceChosen(primaryAssistant.config),
    availabilityConfigured:
      openWeekday === null || timezoneValid === null ? null : openWeekday && timezoneValid,
    appointmentTypesReady: activeTypes,
    calendarReady,
    phoneAssigned: assigned === null ? (numberRows === null ? null : false) : true,
    testCallMade: callItems === null ? null : callItems.length > 0,
  };

  return {
    loading,
    ready,
    saved: (onboarding.data?.steps as SavedSteps | undefined) ?? {},
    signals,
    completedAt: onboarding.data?.completedAt ?? null,
    assignedNumberDisplay: assigned?.phoneE164 ?? null,
  };
}

/** What a write-back attempt actually did, so the page can say so. */
export interface SyncOutcome {
  /** How many steps this call tried to record. */
  attempted: number;
  /** The steps the server refused or that could not be reached. */
  failed: SetupStepKey[];
}

/**
 * Writes back any step that real data now proves done but the server has not
 * yet recorded — idempotent by contract (see `newlyInferredDone`), so a
 * repeated call with nothing new to report is a silent no-op.
 *
 * One request per step, because that is the route's shape (`step` + `status`,
 * not a `steps` map — see `lib/onboardingApi.ts` for the defect this
 * corrects). Each is awaited separately and a failure is recorded rather than
 * thrown, so one refused step cannot hide the steps that did save, and the
 * caller gets back something it can actually show the customer.
 */
export function useSyncInferredSteps() {
  const qc = useQueryClient();
  const firmId = useAuthenticatedFirmId();
  return async (saved: SavedSteps, signals: SetupSignals): Promise<SyncOutcome> => {
    const newlyDone = newlyInferredDone(saved, signals);
    if (newlyDone.length === 0) return { attempted: 0, failed: [] };

    const failed: SetupStepKey[] = [];
    for (const step of newlyDone) {
      try {
        await updateOnboardingState({ step, status: "done" });
      } catch {
        // Never surfaces the response body — the page shows its own sentence.
        failed.push(step);
      }
    }

    // Even a partial success changes the saved state, so the read is refreshed
    // whenever anything at all was written.
    if (firmId !== undefined && failed.length < newlyDone.length) {
      qc.invalidateQueries({ queryKey: [ROOT, "onboarding", firmId] });
    }
    return { attempted: newlyDone.length, failed };
  };
}

export { deriveStepStatuses };
