import { useCallback, useState } from "react";
import type { AssistantTemplate } from "@/lib/assistantTemplates";
import type { StoredVoicePresetId } from "@/pages/assistants/assistantsContract";
import { PERMITTED_ACTION_IDS, type PermittedActionId } from "@/lib/promptComposer";

export type FirstMessageMode = "assistant-speaks-first" | "wait-for-caller";

/**
 * V5 PR-6 (C-3): whether `prompt.systemInstructions` is generated from the
 * guided sections below it or edited directly. See `promptComposer.ts` for
 * the composer this drives and `assistantConfig.ts` for where the choice is
 * applied at save time. A saved config that predates this field hydrates to
 * `"advanced"` (never `"guided"`) precisely so an existing customer's
 * hand-written prompt is never silently overwritten by a composition of
 * guided fields that were never filled in — see `sanitizePrompt` in
 * `assistantConfig.ts`.
 */
export type PromptMode = "guided" | "advanced";

export interface AssistantSetupState {
  assistantName: string;
  /**
   * V5 PR-6 (C-2): no longer editable in the Configuration tab — the tab
   * displays the firm's business name from Workspace Settings
   * (`useWorkspaceBusinessInfo`) and this field is kept in sync with it at
   * save time (see `serializeDraftToConfig`'s `businessInfo` parameter).
   * Still part of the persisted config for backward compatibility and for
   * the prompt composer, which needs a value even before that fetch resolves.
   */
  businessName: string;
  role: string;
  /** See `businessName` above — read-only here, sourced from Workspace Settings. */
  industry: string;
  primaryGoal: string;
  timezone: string;
  language: string;
}

export interface AssistantPromptState {
  firstMessageMode: FirstMessageMode;
  /** The greeting. Edited from both the Configuration tab and the Prompt tab's guided sections — one field, shown in two places. */
  firstMessage: string;
  /** Generated from the guided sections while `promptMode` is `"guided"`; freely editable while `"advanced"`. This is exactly what is published. */
  systemInstructions: string;
  tone: string;
  objectives: string[];
  /** "Questions to ask" in the guided Prompt tab. */
  informationToCollect: string[];
  /** Escalation behaviour/instructions. Edited from both the Configuration tab and the Prompt tab. */
  escalationRules: string;
  /** Prohibited topics. */
  prohibitedBehavior: string;
  /** Closing behaviour. */
  callEndingRules: string;
  /** V5 PR-6 (C-3): which mode is currently in force for `systemInstructions`. */
  promptMode: PromptMode;
  /** "Business context"/"Business information" — edited from both Configuration and Prompt tabs. */
  businessInformation: string;
  /** "Appointment rules" guided section. */
  appointmentRules: string;
  /** Freeform addendum appended after every other guided section. Templates seed this with their old canned `systemInstructions` text so nothing is lost when a template-based draft starts in guided mode. */
  additionalInstructions: string;
}

/** V5 PR-6 (C-2): the fixed "permitted actions" checklist, stored separately from the prompt text itself. */
export interface AssistantToolsState {
  permittedActions: PermittedActionId[];
}

export interface AssistantVoiceModelState {
  /**
   * May hold a retired preset that an older config still stores. The builder
   * reports that truthfully and asks for a supported one; it never rewrites
   * the value on the customer's behalf.
   */
  preset: StoredVoicePresetId;
}

export interface AssistantAnalysisState {
  callSummaryEnabled: boolean;
  successCriteria: string;
  leadQualificationFields: string[];
  followUpRecommendation: string;
}

export interface AssistantAdvancedState {
  voiceRuntimeProvider: string;
  modelProvider: string;
  modelIdentifier: string;
  voiceProvider: string;
  voiceIdentifier: string;
  transcriber: string;
  timeoutSeconds: string;
  endpointingMs: string;
  rawOverrides: string;
}

/**
 * Editable builder configuration. This is the source of truth mapped to/from
 * the E1 `config` JSON object (see lib/assistantConfig.ts) — it deliberately
 * excludes id/status/provider/timestamps, which live only on AssistantDto.
 */
export interface AssistantDraft {
  templateId: string;
  templateName: string;
  setup: AssistantSetupState;
  prompt: AssistantPromptState;
  voiceModel: AssistantVoiceModelState;
  tools: AssistantToolsState;
  analysis: AssistantAnalysisState;
  advanced: AssistantAdvancedState;
}

export function draftFromTemplate(template: AssistantTemplate): AssistantDraft {
  return {
    templateId: template.id,
    templateName: template.name,
    setup: {
      assistantName: template.id === "blank" ? "" : template.name,
      businessName: "",
      role: template.defaults.role,
      industry: "",
      primaryGoal: template.defaults.primaryGoal,
      timezone: "",
      language: "English (US)",
    },
    prompt: {
      firstMessageMode: "assistant-speaks-first",
      firstMessage: template.defaults.firstMessage,
      // Starts equal to the template's canned instructions; overwritten by
      // the composer on first save since promptMode starts "guided" — see
      // `additionalInstructions` below, which is where that canned text
      // actually lives on so it still reaches the composed prompt.
      systemInstructions: template.defaults.systemInstructions,
      tone: template.defaults.tone,
      objectives: [...template.defaults.objectives],
      informationToCollect: [...template.defaults.informationToCollect],
      escalationRules: "",
      prohibitedBehavior: "",
      callEndingRules: "",
      promptMode: "guided",
      businessInformation: "",
      appointmentRules: "",
      // Seeds the guided prompt's freeform addendum with the template's old
      // canned instructions, so a template-based draft keeps that guidance
      // once the composer takes over `systemInstructions`.
      additionalInstructions: template.defaults.systemInstructions,
    },
    voiceModel: {
      preset: "natural-balanced",
    },
    tools: {
      permittedActions: [...PERMITTED_ACTION_IDS],
    },
    analysis: {
      callSummaryEnabled: true,
      successCriteria: "",
      leadQualificationFields: [],
      followUpRecommendation: "",
    },
    advanced: {
      voiceRuntimeProvider: "",
      modelProvider: "",
      modelIdentifier: "",
      voiceProvider: "",
      voiceIdentifier: "",
      transcriber: "",
      timeoutSeconds: "",
      endpointingMs: "",
      rawOverrides: "",
    },
  };
}

/**
 * Local, in-memory-only draft state for a new, unsaved assistant. Lives for
 * the lifetime of the mounted builder route — a full reload reconstructs a
 * fresh draft from the validated template key rather than reading any
 * client-side storage (see AssistantBuilderNew).
 */
export function useLocalAssistantDraft(template: AssistantTemplate) {
  const [draft, setDraft] = useState<AssistantDraft>(() => draftFromTemplate(template));

  const update = useCallback((updater: (draft: AssistantDraft) => AssistantDraft) => {
    setDraft((prev) => updater(prev));
  }, []);

  return { draft, update };
}
